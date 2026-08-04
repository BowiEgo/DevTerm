import * as fs from "node:fs";
import * as http from "node:http";
import { type IncomingMessage } from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";

import { green, red, yellow } from "kolorist";

import { fmtProgress, log, out, success, warn } from "./logger";

// ── config ──

const REMOTE_BRANCHES = ["main", "master"];

// ── helpers ──

function proxyEnv(isHttps: boolean): string | undefined {
	if (isHttps) {
		return process.env.https_proxy || process.env.HTTPS_PROXY;
	}
	return process.env.http_proxy || process.env.HTTP_PROXY;
}

// ── HTTP request with proxy CONNECT support ──

interface RequestResult {
	res: IncomingMessage;
	url: string;
}

function httpsRequest(
	url: string,
	method = "GET",
	redirects = 0,
): Promise<RequestResult> {
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const isHttps = u.protocol === "https:";
		const proxy = proxyEnv(isHttps);
		const headers: Record<string, string> = {
			"user-agent": "DevTermSetup/1.0",
		};

		const done = (res: IncomingMessage) => {
			if (
				res.statusCode &&
				res.statusCode >= 300 &&
				res.statusCode < 400 &&
				res.headers.location
			) {
				res.resume();
				if (redirects > 5) return reject(new Error("重定向过多"));
				return resolve(
					httpsRequest(
						new URL(res.headers.location, u).toString(),
						method,
						redirects + 1,
					),
				);
			}
			resolve({ res, url: u.toString() });
		};

		const fail = (e: Error) => reject(e);

		if (proxy && isHttps) {
			// HTTPS via HTTP proxy: CONNECT tunnel + manual TLS handshake
			const p = new URL(proxy);
			const c = net.connect(Number(p.port) || 443, p.hostname, () => {
				c.write(
					`CONNECT ${u.hostname}:${u.port || 443} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\n\r\n`,
				);
			});

			let tunneled = false;
			c.on("data", (d: Buffer) => {
				if (tunneled) return;
				tunneled = true;
				const s = d.toString("latin1");
				if (!s.includes(" 200")) {
					c.destroy();
					return reject(new Error("代理 CONNECT 失败"));
				}
				const tlsSock = tls.connect(
					{ socket: c, servername: u.hostname },
					() => {
						const req = http.request(
							{
								createConnection: () => tlsSock,
								method,
								headers: { ...headers, host: u.hostname },
								path: u.pathname + u.search,
							},
							done as (res: IncomingMessage) => void,
						);
						req.on("error", fail);
						req.end();
					},
				);
				tlsSock.on("error", fail);
			});
			c.on("error", fail);
		} else if (proxy) {
			// HTTP via proxy
			const p = new URL(proxy);
			const req = http.request(
				{
					host: p.hostname,
					port: Number(p.port) || 80,
					method,
					path: u.href,
					headers: { ...headers, host: u.host },
				},
				done,
			);
			req.on("error", fail);
			req.end();
		} else {
			// Direct connection
			const mod = isHttps ? https : http;
			const req = mod.request(
				{
					method,
					headers,
					hostname: u.hostname,
					port: Number(u.port) || (isHttps ? 443 : 80),
					path: u.pathname + u.search,
					...(isHttps ? { servername: u.hostname } : {}),
				},
				done,
			);
			req.on("error", fail);
			req.end();
		}
	});
}

// ── public API ──

async function getJson(url: string): Promise<unknown> {
	const { res } = await httpsRequest(url);
	if (res.statusCode !== 200) {
		res.resume();
		throw new Error(`HTTP ${res.statusCode}`);
	}
	let data = "";
	for await (const chunk of res) data += chunk;
	return JSON.parse(data);
}

async function downloadWithProgress(
	url: string,
	dest: string,
	label = "下载",
): Promise<boolean> {
	log(`==> ${label}`);
	out(`  ${yellow("┌─")} ${label}`);

	try {
		const { res } = await httpsRequest(url);
		if (res.statusCode !== 200) {
			res.resume();
			throw new Error(`HTTP ${res.statusCode}`);
		}

		const total = parseInt(res.headers["content-length"] || "0", 10) || 0;
		const ws = fs.createWriteStream(dest);
		const t0 = Date.now();
		let done = 0;
		let lastTick = t0;
		let lastDone = 0;
		let speed = 0;
		let maxW = 0;

		res.on("data", (chunk: Buffer) => {
			done += chunk.length;
			const now = Date.now();
			if (now - lastTick >= 100) {
				speed = (done - lastDone) / ((now - lastTick) / 1000) / 1048576;
				lastDone = done;
				lastTick = now;
				const line = fmtProgress(label, done, total, speed);
				if (line.length < maxW) {
					process.stdout.write(`\r  │ ${line.padEnd(maxW)}`);
				} else {
					process.stdout.write(`\r  │ ${line}`);
					maxW = line.length;
				}
			}
		});

		await new Promise<void>((resolve, reject) => {
			res.pipe(ws);
			ws.on("finish", resolve);
			res.on("error", reject);
			ws.on("error", reject);
		});

		const secs = (Date.now() - t0) / 1000;
		const line = fmtProgress(
			label,
			done,
			total,
			done / Math.max(0.001, secs) / 1048576,
		);
		if (line.length < maxW) {
			process.stdout.write(`\r  │ ${line.padEnd(maxW)}`);
		} else {
			process.stdout.write(`\r  │ ${line}`);
		}
		process.stdout.write("\n");
		log(`  │ ${line}`);

		if (total > 0 && done !== total) {
			out(`  ${yellow("└─ ⚠")} ${label} 下载不完整 (${done}/${total} 字节)`);
			log(`==> PARTIAL: ${label}`);
			return false;
		}

		out(`  ${green("└─ ✓")} ${label} 完成 (${secs.toFixed(1)}s)`);
		log(`==> OK: ${label}`);
		return true;
	} catch (e) {
		out(`  ${red("└─ ✗")} ${label} 失败: ${(e as Error).message}`);
		log(`==> FAIL: ${label} ${(e as Error).message}`);
		return false;
	}
}

async function fetchRemote(
	file: string,
	dest: string,
	label?: string,
): Promise<boolean> {
	const bases = process.env.SETUP_REMOTE_BASE
		? [process.env.SETUP_REMOTE_BASE]
		: REMOTE_BRANCHES.map(
				(b) => `https://raw.githubusercontent.com/BowiEgo/DevTermSetup/${b}`,
			);

	for (const base of bases) {
		const ok = await downloadWithProgress(
			`${base}/${file}`,
			dest,
			label || `下载 ${file}`,
		);
		if (ok) return true;
	}
	return false;
}

export { downloadWithProgress, fetchRemote, getJson, httpsRequest };
