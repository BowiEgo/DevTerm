import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

import type { DeployOptions } from "./deploy";
import { success } from "./logger";
import getPlatform, { Platform } from "./platform";
import { resolveShell } from "./shell";

const HOMEDIR = homedir();
const IS_WINDOWS = process.platform === "win32";

interface ToolDef {
	/** Display name */
	readonly name: string;
	/** Binary name used to check existence */
	readonly check: string;
	/** Package identifiers keyed by package manager name (winget, apt, brew, etc.) */
	readonly [pkgManager: string]: string | boolean | DeployOptions | undefined;
	/** Whether this tool is provided by the official vendor */
	readonly official?: boolean;
	/** Config deployment options (for tools that ship config files) */
	readonly deploy?: DeployOptions;
}

function herdrConfigPath(): string {
	if (IS_WINDOWS) {
		return path.join(
			process.env.LOCALAPPDATA || path.join(HOMEDIR, "AppData", "Local"),
			"herdr",
			"config.toml",
		);
	}
	return path.join(HOMEDIR, ".config", "herdr", "config.toml");
}

const TOOLS = {
	git: {
		name: "Git",
		check: "git",
		winget: "Git.Git",
		apt: "git",
		brew: "git",
	},
	wezterm: {
		name: "WezTerm",
		check: "wezterm",
		winget: "wez.wezterm",
		apt: "wezterm",
		brew: "wezterm",
		deploy: {
			srcFile: ".wezterm.lua",
			dstPath: path.join(HOMEDIR, ".wezterm.lua"),
			label: ".wezterm.lua",
			onDeployed: (dst) => success(`.wezterm.lua → ${dst}`),
		},
	},
	nvim: {
		name: "Neovim",
		check: "nvim",
		winget: "Neovim.Neovim",
		apt: "neovim",
		brew: "neovim",
	},
	lazygit: {
		name: "lazygit",
		check: "lazygit",
		winget: "JesseDuffield.lazygit",
		apt: "lazygit",
		brew: "lazygit",
	},
	herdr: {
		name: "herdr",
		check: "herdr",
		official: true,
		deploy: {
			srcFile: ".herdr.config.toml",
			dstPath: herdrConfigPath,
			label: "herdr 配置",
			transform: (content) => {
				const shell = resolveShell();
				const esc = IS_WINDOWS ? shell.replace(/\\/g, "\\\\") : shell;
				return content.split("__DEFAULT_SHELL__").join(esc);
			},
			onDeployed: (dst) => {
				const shell = resolveShell();
				success(`herdr 配置已部署 → ${dst} (default_shell: ${shell})`);
			},
		},
	},
} as const satisfies Record<string, ToolDef>;

function commandPath(cmd: string): string | null {
	const p = getPlatform();

	try {
		const r = spawnSync(
			p === Platform.Windows ? "where" : "sh",
			p === Platform.Windows ? [cmd] : ["-c", `command -v ${cmd}`],
			{ encoding: "utf8" },
		);
		if (r.status === 0 && r.stdout) return r.stdout.trim().split(/\r?\n/)[0];
	} catch {}

	return null;
}

const commandExists = (cmd: string): boolean => !!commandPath(cmd);

// Resolve tool path: PATH first, then fallback to known install locations
// (handles stale PATH in long-running sessions)
function toolPath(key: keyof typeof TOOLS): string | null {
	const p = commandPath(TOOLS[key].check);
	if (p) return p;

	const platform = getPlatform();

	if (key === "herdr") {
		const cands =
			platform === Platform.Windows
				? [
						path.join(
							process.env.LOCALAPPDATA || "",
							"Programs",
							"Herdr",
							"bin",
							"herdr.exe",
						),
					]
				: [path.join(homedir(), ".local", "bin", "herdr")];
		for (const c of cands) {
			if (c && fs.existsSync(c)) return c;
		}
	}
	return null;
}

export type { ToolDef };
export { commandExists, commandPath, TOOLS, toolPath };
