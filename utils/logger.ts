import { type SpawnOptions, spawn } from "node:child_process";

import { bold, dim, green, red, yellow } from "kolorist";

// ── basic output ──

const out = (s = "") => process.stdout.write(`${s}\n`);

const success = (m: string) => out(`  ${green("✓")} ${m}`);
const warn = (m: string) => out(`  ${yellow("⚠")}  ${m}`);
const err = (m: string) => out(`  ${red("✗")} ${m}`);
const info = (m: string) => out(`  ${dim(m)}`);

const step = (n: string, m: string) => {
	out(`${yellow(bold(`▸ [${n}]`))} ${m}`);
	out("");
};

const divider = () => out(`${dim(`  ${"─".repeat(41)}`)}`);

// ── optional file log (for debugging) ──

let logFn: ((line: string) => void) | null = null;

function setLogWriter(fn: (line: string) => void) {
	logFn = fn;
}

function log(line: string) {
	logFn?.(line);
}

// ── runConsole: interactive passthrough ──

function runConsole(
	label: string,
	command: string,
	args: string[],
	opts?: SpawnOptions,
): Promise<boolean> {
	step(label, `${command} ${args.join(" ")}`);
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			shell: process.platform === "win32",
			...opts,
		});
		child.on("close", (code) => resolve(code === 0));
		child.on("error", () => resolve(false));
	});
}

// ── stream: decorated output with progress-bar awareness ──

function stream(
	label: string,
	cmd: string,
	args: string[],
	opts?: SpawnOptions,
): Promise<boolean> {
	log(`==> ${label}`);
	out(`  ${yellow("┌─")} ${label}`);

	const child = spawn(cmd, args, {
		stdio: ["ignore", "pipe", "pipe"],
		shell: process.platform === "win32",
		...opts,
	});

	let buf = "";
	let isProg = false;
	let progLen = 0;

	const onData = (chunk: Buffer) => {
		buf += chunk.toString("utf8");

		while (buf.length > 0) {
			const nl = buf.indexOf("\n");
			const cr = buf.indexOf("\r");

			// No line ending yet — wait for more data
			if (nl === -1 && cr === -1) break;

			// LF comes first (or no CR)
			if (nl !== -1 && (cr === -1 || nl < cr)) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);

				if (isProg) {
					if (line) {
						process.stdout.write(`\r  │ ${line.padEnd(progLen)}`);
					}
					process.stdout.write("\n");
					isProg = false;
					progLen = 0;
				} else if (line) {
					out(`  │ ${line}`);
					log(`  │ ${line}`);
				}
			} else {
				// CR comes first — progress line
				const seg = buf.slice(0, cr);
				buf = buf.slice(cr + 1);

				if (seg) {
					const s = seg.trimEnd();
					if (s.length >= progLen) {
						process.stdout.write(`\r  │ ${s}`);
						progLen = s.length;
					} else {
						process.stdout.write(`\r  │ ${s.padEnd(progLen)}`);
					}
					isProg = true;
				}
			}
		}
	};

	child.stdout!.on("data", onData);
	child.stderr!.on("data", onData);

	return new Promise((resolve) => {
		const finish = (code: number | null) => {
			// Drain remaining buffer
			if (buf.length > 0) {
				if (isProg) {
					process.stdout.write(`\r  │ ${buf.trimEnd().padEnd(progLen)}\n`);
				} else {
					const trimmed = buf.trim();
					if (trimmed) {
						out(`  │ ${trimmed}`);
						log(`  │ ${trimmed}`);
					}
				}
			}

			if (code === 0) {
				out(`  ${green("└─ ✓")} ${label} done`);
				log(`==> OK: ${label}`);
				resolve(true);
			} else {
				out(`  ${red("└─ ✗")} ${label} failed (exit ${code})`);
				log(`==> FAIL: ${label} (exit ${code})`);
				resolve(false);
			}
		};

		child.on("error", () => finish(-1));
		child.on("close", finish);
	});
}

function fmtProgress(
	label: string,
	done: number,
	total: number,
	speed: number,
): string {
	if (total > 0) {
		const pct = Math.min(100, (done / total) * 100);
		const barLen = 20;
		const fill = Math.floor((pct / 100) * barLen);
		const bar = "#".repeat(fill) + "-".repeat(barLen - fill);
		return `${label}: ${(done / 1048576).toFixed(1).padStart(7)} / ${(total / 1048576).toFixed(1)} MiB  (${pct.toFixed(1).padStart(5)}%)  [${bar}]  ${speed.toFixed(2)} MiB/s`;
	}
	return `${label}: ${(done / 1048576).toFixed(1)} MiB  ${speed.toFixed(2)} MiB/s`;
}

export {
	divider,
	err,
	fmtProgress,
	info,
	log,
	out,
	runConsole,
	setLogWriter,
	step,
	stream,
	success,
	warn,
};
