import * as fs from "node:fs";
import * as path from "node:path";

import { commandPath } from "./tools";

const IS_WINDOWS = process.platform === "win32";

function resolveShell(): string {
	if (IS_WINDOWS) {
		const candidates = [
			commandPath("pwsh.exe"),
			"C:\\Program Files\\PowerShell\\7\\pwsh.exe",
			commandPath("powershell.exe"),
			path.join(
				process.env.WINDIR || "C:\\Windows",
				"System32",
				"WindowsPowerShell",
				"v1.0",
				"powershell.exe",
			),
			process.env.COMSPEC,
		];
		for (const c of candidates) {
			if (c && fs.existsSync(c)) return c;
		}
		return "cmd.exe";
	}

	const shell = process.env.SHELL;
	if (shell && fs.existsSync(shell)) return shell;

	for (const s of ["zsh", "bash", "fish", "pwsh", "sh"]) {
		const p = commandPath(s);
		if (p) return p;
	}
	return "/bin/sh";
}

export { resolveShell };
