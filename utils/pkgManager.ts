import getPlatform, { Platform } from "./platform";
import { commandExists } from "./tools";

export interface PkgManager {
	name: string | null;
	install?: string[];
	update?: string[];
}

function detectPkgManager(): PkgManager {
	const p: Platform = getPlatform();

	switch (p) {
		case Platform.Windows:
			if (commandExists("winget"))
				return {
					name: "winget",
					install: [
						"winget",
						"install",
						"--id",
						"PLACEHOLDER",
						"-e",
						"--silent",
						"--accept-package-agreements",
						"--accept-source-agreements",
					],
					update: [
						"winget",
						"upgrade",
						"--id",
						"PLACEHOLDER",
						"-e",
						"--silent",
						"--accept-package-agreements",
						"--accept-source-agreements",
					],
				};
			if (commandExists("scoop"))
				return {
					name: "scoop",
					install: ["scoop", "install", "PLACEHOLDER"],
					update: ["scoop", "update", "PLACEHOLDER"],
				};
			return { name: null };

		case Platform.Mac:
			if (commandExists("brew"))
				return {
					name: "brew",
					install: ["brew", "install", "PLACEHOLDER"],
					update: ["brew", "update"],
				};
			return { name: null };

		case Platform.Linux:
			break;
		default:
			return { name: null };
	}

	const cands: [string, string[], string[]][] = [
		[
			"apt",
			["sudo", "apt", "install", "-y", "PLACEHOLDER"],
			["sudo", "apt", "update"],
		],
		[
			"dnf",
			["sudo", "dnf", "install", "-y", "PLACEHOLDER"],
			["sudo", "dnf", "check-update"],
		],
		[
			"pacman",
			["sudo", "pacman", "-S", "--noconfirm", "PLACEHOLDER"],
			["sudo", "pacman", "-Sy"],
		],
		[
			"zypper",
			["sudo", "zypper", "install", "-y", "PLACEHOLDER"],
			["sudo", "zypper", "refresh"],
		],
		["apk", ["sudo", "apk", "add", "PLACEHOLDER"], ["sudo", "apk", "update"]],
	];

	for (const [name, install, update] of cands) {
		if (commandExists(name)) return { name, install, update };
	}
	return { name: null };
}

/** Replace "PLACEHOLDER" in pm.install args with the actual package name */
function pmInstallArgs(pkgName: string, pm: PkgManager): string[] {
	if (!pm.install) return [];
	return pm.install.map((arg) => (arg === "PLACEHOLDER" ? pkgName : arg));
}

export { detectPkgManager, pmInstallArgs };
