import * as fs from "node:fs";
import * as path from "node:path";

import { warn } from "./logger";

// ── helpers ──

function backupIfExists(filePath: string) {
	if (fs.existsSync(filePath)) {
		fs.renameSync(filePath, `${filePath}.bak`);
	}
}

// ── generic deploy ──

export interface DeployOptions {
	/** Source filename (relative to srcDir) */
	srcFile: string;
	/** Destination path, or a function that returns it */
	dstPath: string | (() => string);
	/** Label shown in success/warn messages */
	label: string;
	/** Optional content transform (e.g. replace template placeholders) */
	transform?: (content: string) => string;
	/** Optional callback after successful deploy, receives the dst path */
	onDeployed?: (dst: string) => void;
}

/**
 * Deploy a config file from srcDir to a destination.
 * Returns the destination path, or null if source was missing.
 */
function deployConfig(srcDir: string, opts: DeployOptions): string | null {
	const src = path.join(srcDir, opts.srcFile);
	if (!fs.existsSync(src)) {
		warn(`未找到 ${opts.srcFile}，跳过`);
		return null;
	}

	const dst =
		typeof opts.dstPath === "function" ? opts.dstPath() : opts.dstPath;

	backupIfExists(dst);
	fs.mkdirSync(path.dirname(dst), { recursive: true });

	if (opts.transform) {
		let content = fs.readFileSync(src, "utf8");
		content = opts.transform(content);
		fs.writeFileSync(dst, content);
	} else {
		fs.copyFileSync(src, dst);
	}

	opts.onDeployed?.(dst);
	return dst;
}

export { deployConfig };
