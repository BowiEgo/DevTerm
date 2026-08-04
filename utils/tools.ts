import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

import getPlatform, { Platform } from "./platform";

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
	herdr: { name: "herdr", check: "herdr", official: true },
} as const;

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

export { commandExists, commandPath, TOOLS, toolPath };
