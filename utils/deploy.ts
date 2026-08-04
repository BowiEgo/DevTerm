import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { info, success, warn } from "./logger";

// ── helpers ──

function backupIfExists(filePath: string) {
	if (fs.existsSync(filePath)) {
		fs.renameSync(filePath, `${filePath}.bak`);
	}
}

// ── generic deploy ──

export interface DeployOptions {
	/** Config file content (bundled at build time) */
	content: string;
	/** Destination path, or a function that returns it */
	dstPath: string | (() => string);
	/** Label shown in warn message when skipping */
	label: string;
	/** Optional content transform (e.g. replace template placeholders) */
	transform?: (content: string) => string;
	/** Optional callback after successful deploy, receives the dst path */
	onDeployed?: (dst: string) => void;
}

/**
 * Deploy a bundled config to its destination.
 * Returns the destination path.
 */
function deployConfig(opts: DeployOptions): string {
	const dst =
		typeof opts.dstPath === "function" ? opts.dstPath() : opts.dstPath;

	backupIfExists(dst);
	fs.mkdirSync(path.dirname(dst), { recursive: true });

	const content = opts.transform
		? opts.transform(opts.content)
		: opts.content;

	fs.writeFileSync(dst, content);
	opts.onDeployed?.(dst);
	return dst;
}

// ── git-based sync ──

export interface SyncGitOptions {
	/** Git repo URL to clone */
	repo: string;
	/** Branch to checkout (defaults to repo default) */
	branch?: string;
	/** Destination directory */
	dstDir: string | (() => string);
	/** Label for messages */
	label: string;
	/** Skip confirmation, force-reset on conflict */
	force?: boolean;
	/** Optional callback after successful sync */
	onDeployed?: (dst: string) => void;
}

function syncGitRepo(opts: SyncGitOptions): "ok" | "conflict" | "failed" {
	const dst =
		typeof opts.dstDir === "function" ? opts.dstDir() : opts.dstDir;

	if (fs.existsSync(dst)) {
		if (fs.existsSync(path.join(dst, ".git"))) {
			// Force mode: backup, reset, pull
			if (opts.force) {
				const bak = `${dst}.bak`;
				info(`${opts.label}: backing up to ${bak}...`);
				try { fs.rmSync(bak, { recursive: true, force: true }); } catch {}
				fs.renameSync(dst, bak);
				info(`${opts.label}: resetting & pulling...`);
				// Re-clone since we backed up the directory
				return cloneRepo(opts);
			}

			info(`${opts.label}: repo exists, pulling latest...`);
			// Switch to target branch first (fetch if remote branch not local)
			if (opts.branch) {
				spawnSync("git", ["-C", dst, "fetch", "--depth", "1"], {
					stdio: "ignore",
					shell: process.platform === "win32",
				});
				spawnSync("git", ["-C", dst, "checkout", opts.branch], {
					stdio: "inherit",
					shell: process.platform === "win32",
				});
			}
			let r = spawnSync("git", ["-C", dst, "pull", "--rebase"], {
				stdio: "inherit",
				shell: process.platform === "win32",
			});
			// Fallback: drop rebase if there are local changes
			if (r.status !== 0) {
				info(`${opts.label}: rebase failed, trying merge...`);
				r = spawnSync("git", ["-C", dst, "pull", "--no-rebase"], {
					stdio: "inherit",
					shell: process.platform === "win32",
				});
			}
			if (r.status === 0) {
				// Check for lingering local changes
				const st = spawnSync("git", ["-C", dst, "status", "--porcelain"], {
					stdio: "pipe",
					shell: process.platform === "win32",
					encoding: "utf8",
				});
				if (st.stdout && st.stdout.trim()) {
					warn(`${opts.label}: pulled but local changes remain`);
					return "conflict";
				}
				opts.onDeployed?.(dst);
				return "ok";
			}
			warn(`${opts.label}: pull failed, directory unchanged`);
			return "conflict";
		}
		backupIfExists(dst);
	}

	return cloneRepo(opts);
}

function cloneRepo(opts: SyncGitOptions): "ok" | "failed" {
	const dst =
		typeof opts.dstDir === "function" ? opts.dstDir() : opts.dstDir;

	fs.mkdirSync(path.dirname(dst), { recursive: true });
	info(`${opts.label}: cloning ${opts.repo}${opts.branch ? ` (${opts.branch})` : ""}...`);
	const cloneArgs = ["clone", "--depth", "1"];
	if (opts.branch) cloneArgs.push("--branch", opts.branch);
	cloneArgs.push(opts.repo, dst);
	const r = spawnSync("git", cloneArgs, {
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (r.status === 0) {
		opts.onDeployed?.(dst);
		return "ok";
	}
	warn(`${opts.label}: clone failed`);
	return "failed";
}

export { deployConfig, syncGitRepo };
export type { DeployOptions, SyncGitOptions };
