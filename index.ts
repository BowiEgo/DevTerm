#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { blue, bold, cyan, dim, green, magenta, red } from "kolorist";
import minimist from "minimist";
import prompts from "prompts";

import banner from "./utils/banner";
import { deployConfig, syncGitRepo } from "./utils/deploy";
import { divider, err, info, out, runConsole, step, success, warn } from "./utils/logger";
import {
	detectPkgManager,
	type PkgManager,
	pmInstallArgs,
} from "./utils/pkgManager";
import { commandPath, TOOLS, toolPath } from "./utils/tools";

function pmRemoveArgs(pkgName: string, pm: PkgManager): string[] {
	const removeMap: Record<string, string[]> = {
		apt: ["sudo", "apt", "remove", "-y", pkgName],
		dnf: ["sudo", "dnf", "remove", "-y", pkgName],
		pacman: ["sudo", "pacman", "-R", "--noconfirm", pkgName],
		zypper: ["sudo", "zypper", "remove", "-y", pkgName],
		apk: ["sudo", "apk", "del", pkgName],
		brew: ["brew", "uninstall", pkgName],
		winget: ["winget", "uninstall", "--id", pkgName, "-e", "--silent"],
		scoop: ["scoop", "uninstall", pkgName],
	};
	return removeMap[pm.name!] ?? ["echo", "no remove command for", pm.name!];
}

// ── action: doctor ──

async function doctor(argv: minimist.ParsedArgs) {
	const allKeys = Object.keys(TOOLS) as (keyof typeof TOOLS)[];

	if (argv.all) {
		// Show all tools (non-interactive)
		for (const key of allKeys) {
			checkOne(key);
		}
		return;
	}

	// Interactive: pick which tools to check
	const response = await prompts(
		{
			type: "multiselect",
			name: "tools",
			message: "Select tools to check:",
			choices: allKeys.map((k) => ({
				title: TOOLS[k].name,
				value: k,
			})),
		},
		{
			onCancel: () => process.exit(0),
		},
	);

	divider();
	for (const key of response.tools) {
		checkOne(key as keyof typeof TOOLS);
	}
	divider();
}

function checkOne(key: keyof typeof TOOLS) {
	const t = TOOLS[key];
	const inPath = commandPath(t.check);
	const fallback = toolPath(key);

	if (inPath) {
		success(`${t.name}  ✓  (${inPath})`);
	} else if (fallback) {
		warn(`${t.name}  ⚠  installed but not in PATH (${fallback})`);
		info(`  ↳ fish: fish_add_path ${fallback.replace(/\/[^/]+$/, "")}`);
		info(`  ↳ bash: export PATH="${fallback.replace(/\/[^/]+$/, "")}:$PATH"`);
	} else {
		err(`${t.name}  ✗  not installed`);
	}
}

// ── action: sync ──

async function syncConfigs() {
	const configs = [
		{ key: "nvim" as const, label: "Neovim", type: "git" as const },
		{ key: "wezterm" as const, label: "WezTerm", type: "file" as const },
		{ key: "herdr" as const, label: "herdr", type: "file" as const },
	].filter((c) => {
		if (c.type === "file") return TOOLS[c.key].deploy;
		return TOOLS[c.key].syncGit;
	});

	const response = await prompts(
		{
			type: "multiselect",
			name: "configs",
			message: "Select configs to sync:",
			choices: configs.map((c) => {
				const desc =
					c.type === "git"
						? `git clone ${TOOLS[c.key].syncGit!.repo}`
						: `write ${TOOLS[c.key].deploy!.label}`;
				return { title: `${c.label} config  (${desc})`, value: c.key };
			}),
		},
		{
			onCancel: () => process.exit(0),
		},
	);

	if (response.configs.length === 0) {
		info("No configs selected.");
		return;
	}

	divider();
	for (const key of response.configs) {
		const entry = configs.find((c) => c.key === key);
		if (!entry) continue;

		if (entry.type === "git" && TOOLS[entry.key].syncGit) {
			let result = syncGitRepo(TOOLS[entry.key].syncGit!);
			if (result === "conflict") {
				const confirm = await prompts(
					{
						type: "confirm",
						name: "value",
						message: `有本地修改，是否备份(${TOOLS[entry.key].syncGit!.label}.bak)并强制重置为远程最新？`,
						initial: false,
					},
					{ onCancel: () => {} },
				);
				if (confirm.value) {
					syncGitRepo({ ...TOOLS[entry.key].syncGit!, force: true });
				}
			}
		} else if (entry.type === "file" && TOOLS[entry.key].deploy) {
			deployConfig(TOOLS[entry.key].deploy!);
		}
	}
	divider();
}

// ── action: install ──

interface ToolsSelection {
	needsNeoVim: boolean;
	needsWezterm: boolean;
	needsHerdr: boolean;
	needsPi: boolean;
}

async function promptTools(argv: minimist.ParsedArgs): Promise<ToolsSelection> {
	if (
		argv.default ||
		argv.nvim !== undefined ||
		argv.wezterm !== undefined ||
		argv.herdr !== undefined ||
		argv.pi !== undefined
	) {
		return {
			needsNeoVim: argv.nvim ?? argv.default ?? false,
			needsWezterm: argv.wezterm ?? argv.default ?? false,
			needsHerdr: argv.herdr ?? argv.default ?? false,
			needsPi: argv.pi ?? argv.default ?? false,
		};
	}

	while (true) {
		const response = await prompts(
			{
				type: "multiselect",
				name: "tools",
				message: "Select tools to install:",
				choices: [
					{ title: `Install ${magenta("NeoVim")} as IDE?`, value: "needsNeoVim" },
					{ title: `Install ${magenta("Wezterm")} as terminal?`, value: "needsWezterm" },
					{ title: `Install ${magenta("Herdr")} for AI Agent multiplexers?`, value: "needsHerdr" },
					{ title: `Add ${magenta("Pi")} as AI Agent?`, value: "needsPi" },
				],
			},
			{ onCancel: () => process.exit(0) },
		);

		const selection: ToolsSelection = {
			needsNeoVim: response.tools.includes("needsNeoVim"),
			needsWezterm: response.tools.includes("needsWezterm"),
			needsHerdr: response.tools.includes("needsHerdr"),
			needsPi: response.tools.includes("needsPi"),
		};

		console.log(bold("\nThis is your configuration:\n"));
		for (const [key, label] of [
			["needsNeoVim", "Install NeoVim as IDE?"],
			["needsWezterm", "Install Wezterm as terminal?"],
			["needsHerdr", "Install Herdr for AI Agent multiplexers?"],
			["needsPi", "Add Pi as AI Agent?"],
		] as [keyof ToolsSelection, string][]) {
			console.log(`  ${label}  ${selection[key] ? bold(blue("✓")) : bold(red("✗"))}`);
		}
		console.log("");

		const confirm = await prompts(
			{ type: "confirm", name: "value", message: "Is this OK?", initial: true },
			{ onCancel: () => process.exit(0) },
		);

		if (confirm.value) return selection;
	}
}

async function installWithPkgManager(
	key: keyof typeof TOOLS,
	stepNo: number,
): Promise<boolean> {
	const t = TOOLS[key];
	const p0 = toolPath(key);
	if (p0) {
		const inPath = commandPath(t.check);
		if (inPath) {
			success(`${t.name} is already installed (${inPath})`);
		} else {
			success(`${t.name} is already installed (${p0})`);
			info(`  ↳ add to PATH: export PATH="${p0.replace(/\/[^/]+$/, "")}:$PATH"`);
		}
		return true;
	}

	const pm: PkgManager = detectPkgManager();
	let pmFailed = false;

	if (pm.name && pm.install && t[pm.name as keyof typeof t]) {
		const pkgName = t[pm.name as keyof typeof t] as string;
		const args = pmInstallArgs(pkgName, pm);
		const ok = await runConsole(
			`[${stepNo}] ${pm.name} install ${t.name} (${pkgName})`,
			args[0],
			args.slice(1),
		);

		if (ok && toolPath(key)) {
			success(`${t.name} installed successfully`);
			return true;
		}
		pmFailed = true;
	}

	if (t.customInstall) {
		if (pmFailed) {
			warn(`${t.name}: package manager failed, trying custom install...`);
		} else {
			info(`${t.name}: no package for ${pm.name || "this OS"}, trying custom install...`);
		}
		const ok = await runConsole(
			`[${stepNo}] custom install ${t.name}`,
			t.customInstall.cmd,
			t.customInstall.args,
		);
		if (ok && toolPath(key)) {
			const p = toolPath(key)!;
			const inPath = commandPath(t.check);
			success(`${t.name} installed via custom install`);
			if (!inPath) {
				info(`  ↳ add to PATH: export PATH="${p.replace(/\/[^/]+$/, "")}:$PATH"`);
			}
			return true;
		}
		warn(`${t.name}: custom install failed — please install manually`);
		return false;
	}

	warn(`${t.name}: please install manually (${t.check})`);
	return false;
}

async function installTools(
	tasks: { key: keyof typeof TOOLS; enabled: boolean }[],
	opts?: { needsPi?: boolean },
) {
	divider();

	let stepNo = 0;
	let okCount = 0;
	let failCount = 0;

	for (const task of tasks) {
		if (!task.enabled) continue;
		stepNo++;
		const ok = await installWithPkgManager(task.key, stepNo);
		if (ok) okCount++;
		else failCount++;
	}

	if (opts?.needsPi) {
		stepNo++;
		info(`[${stepNo}] Pi: npm install -g @anthropic/pi`);
		info("  (or your preferred npm-compatible package manager)");
	}

	divider();

	if (stepNo === 0) {
		warn("No tools selected.");
	} else if (failCount === 0) {
		success(`All ${okCount} tool(s) ready!`);
	} else {
		out(`  ${green(`✓ ${okCount} ready`)}  ${red(`✗ ${failCount} failed`)}`);
	}
}

// ── action: uninstall ──

async function uninstallTools() {
	const pm: PkgManager = detectPkgManager();
	const removable = Object.entries(TOOLS)
		.filter(([_, t]) => pm.name && t[pm.name as keyof typeof t])
		.map(([key, t]) => ({
			title: `${t.name} (${t[pm.name! as keyof typeof t]})`,
			value: key,
		}));

	if (removable.length === 0) {
		warn(`No tools found that can be uninstalled via ${pm.name || "package manager"}.`);
		return;
	}

	const response = await prompts(
		{
			type: "multiselect",
			name: "tools",
			message: "Select tools to uninstall:",
			choices: removable,
		},
		{ onCancel: () => process.exit(0) },
	);

	if (response.tools.length === 0) {
		info("Nothing selected.");
		return;
	}

	const confirm = await prompts(
		{ type: "confirm", name: "value", message: "Are you sure?", initial: false },
		{ onCancel: () => process.exit(0) },
	);

	if (!confirm.value) return;

	divider();
	let stepNo = 0;
	for (const key of response.tools) {
		stepNo++;
		const t = TOOLS[key as keyof typeof TOOLS];
		const pkgName = t[pm.name! as keyof typeof t] as string;
		const args = pmRemoveArgs(pkgName, pm);
		await runConsole(`[${stepNo}] remove ${t.name}`, args[0], args.slice(1));
	}
	divider();
	success("Uninstall complete.");
}

// ── mode (action) selection ──

type ActionMode = "install" | "uninstall" | "doctor" | "sync" | "exit";

async function promptAction(): Promise<ActionMode> {
	const response = await prompts(
		{
			type: "select",
			name: "mode",
			message: "What would you like to do?",
			choices: [
				{ title: `🔍  ${bold("Doctor")}  — check tool status`, value: "doctor" },
				{ title: `📦  ${bold("Install")}  — install tools`, value: "install" },
				{ title: `🗑   ${bold("Uninstall")}  — remove tools`, value: "uninstall" },
				{ title: `🔄  ${bold("Sync config")}  — deploy config files`, value: "sync" },
				{ title: `👋  Exit`, value: "exit" },
			],
		},
		{ onCancel: () => process.exit(0) },
	);
	return response.mode;
}

// ── main ──

async function checkProxy() {
	const envProxy = process.env.https_proxy || process.env.HTTP_PROXY || "";
	const gitProxy = spawnSync("git", ["config", "--global", "http.proxy"], {
		stdio: "pipe",
		encoding: "utf8",
	}).stdout?.trim() || "";

	info(`环境代理: ${envProxy || dim("未设置")}`);
	info(`Git 代理:  ${gitProxy || dim("未设置")}`);

	const resp = await prompts(
		{
			type: "select",
			name: "action",
			message: "代理设置",
			choices: [
				{ title: "✓  继续，不修改", value: "skip" },
				{ title: `🖊   修改环境代理 (当前: ${envProxy || "未设置"})`, value: "env" },
				{ title: `🖊   修改 Git 代理 (当前: ${gitProxy || "未设置"})`, value: "git" },
				{ title: `🗑   清除 Git 代理`, value: "git-clear" },
			],
		},
		{ onCancel: () => {} },
	);

	if (resp.action === "env") {
		const val = await prompts(
			{
				type: "text",
				name: "proxy",
				message: "新代理地址 (留空=直连):",
				initial: envProxy,
			},
			{ onCancel: () => {} },
		);
		if (val.proxy === "") {
			delete process.env.http_proxy;
			delete process.env.https_proxy;
			delete process.env.HTTP_PROXY;
			delete process.env.HTTPS_PROXY;
			success("环境代理已清除 (当前进程)");
		} else if (val.proxy) {
			process.env.http_proxy = val.proxy;
			process.env.https_proxy = val.proxy;
			process.env.HTTP_PROXY = val.proxy;
			process.env.HTTPS_PROXY = val.proxy;
			success(`环境代理已设为: ${val.proxy}`);
		}
	}

	if (resp.action === "git") {
		const val = await prompts(
			{
				type: "text",
				name: "proxy",
				message: "Git 代理地址 (留空=清除):",
				initial: gitProxy,
			},
			{ onCancel: () => {} },
		);
		if (val.proxy === "" || val.proxy === undefined) {
			spawnSync("git", ["config", "--global", "--unset", "http.proxy"]);
			spawnSync("git", ["config", "--global", "--unset", "https.proxy"]);
			success("Git 代理已清除");
		} else if (val.proxy) {
			spawnSync("git", ["config", "--global", "http.proxy", val.proxy]);
			spawnSync("git", ["config", "--global", "https.proxy", val.proxy]);
			success(`Git 代理已设为: ${val.proxy}`);
		}
	}

	if (resp.action === "git-clear") {
		spawnSync("git", ["config", "--global", "--unset", "http.proxy"]);
		spawnSync("git", ["config", "--global", "--unset", "https.proxy"]);
		success("Git 代理已清除");
	}
}

async function run() {
	console.log(`\n${banner}\n`);

	await checkProxy();
	console.log();

	const argv = minimist(process.argv.slice(2), { boolean: true });

	// CLI flags → skip action menu, go straight to install
	const hasFlags =
		argv.default ||
		argv.nvim !== undefined ||
		argv.wezterm !== undefined ||
		argv.herdr !== undefined ||
		argv.pi !== undefined ||
		argv.doctor ||
		argv.sync;

	if (argv.doctor) {
		await doctor(argv);
		return;
	}

	if (argv.sync) {
		await syncConfigs();
		return;
	}

	if (hasFlags) {
		// Legacy: flags → install
		const selection = await promptTools(argv);
		const { needsNeoVim, needsWezterm, needsHerdr, needsPi } = selection;
		await installTools(
			[
				{ key: "git", enabled: true },
				{ key: "nvim", enabled: needsNeoVim },
				{ key: "wezterm", enabled: needsWezterm },
				{ key: "herdr", enabled: needsHerdr },
			],
			{ needsPi },
		);
		return;
	}

	// Interactive mode: show action menu
	while (true) {
		const mode = await promptAction();

		switch (mode) {
			case "doctor":
				await doctor(argv);
				break;
			case "install": {
				const selection = await promptTools(argv);
				const { needsNeoVim, needsWezterm, needsHerdr, needsPi } = selection;
				await installTools(
					[
						{ key: "git", enabled: true },
						{ key: "nvim", enabled: needsNeoVim },
						{ key: "wezterm", enabled: needsWezterm },
						{ key: "herdr", enabled: needsHerdr },
					],
					{ needsPi },
				);
				break;
			}
			case "uninstall":
				await uninstallTools();
				break;
			case "sync":
				await syncConfigs();
				break;
			case "exit":
				info("Bye!");
				return;
		}
	}
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
