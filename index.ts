#!/usr/bin/env node

import { blue, bold, green, magenta, red } from "kolorist";
import minimist from "minimist";
import prompts from "prompts";

import banner from "./utils/banner";
import { divider, info, out, runConsole, success, warn } from "./utils/logger";
import {
	detectPkgManager,
	type PkgManager,
	pmInstallArgs,
} from "./utils/pkgManager";
import { TOOLS, toolPath } from "./utils/tools";

interface ToolsSelection {
	needsNeoVim: boolean;
	needsWezterm: boolean;
	needsHerdr: boolean;
	needsPi: boolean;
}

async function promptTools(argv: minimist.ParsedArgs): Promise<ToolsSelection> {
	// If CLI flags were used, skip the prompt entirely
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
				message: "Select options for your terminal environment:",
				choices: [
					{
						title: `Install ${magenta("NeoVim")} as IDE?`,
						value: "needsNeoVim",
					},
					{
						title: `Install ${magenta("Wezterm")} as terminal?`,
						value: "needsWezterm",
					},
					{
						title: `Install ${magenta("Herdr")} for AI Agent multiplexers?`,
						value: "needsHerdr",
					},
					{
						title: `Add ${magenta("Pi")} as AI Agent?`,
						value: "needsPi",
					},
				],
			},
			{
				onCancel: () => {
					console.log(red("✖") + " Operation cancelled");
					process.exit(1);
				},
			},
		);

		const selection: ToolsSelection = {
			needsNeoVim: response.tools.includes("needsNeoVim"),
			needsWezterm: response.tools.includes("needsWezterm"),
			needsHerdr: response.tools.includes("needsHerdr"),
			needsPi: response.tools.includes("needsPi"),
		};

		// Show summary
		console.log(bold("\nThis is your configuration:\n"));
		const labels: [keyof ToolsSelection, string][] = [
			["needsNeoVim", "Install NeoVim as IDE?"],
			["needsWezterm", "Install Wezterm as terminal?"],
			["needsHerdr", "Install Herdr for AI Agent multiplexers?"],
			["needsPi", "Add Pi as AI Agent?"],
		];
		for (const [key, label] of labels) {
			console.log(
				`  ${label}  ${selection[key] ? bold(blue("✓")) : bold(red("✗"))}`,
			);
		}
		console.log("");

		const confirm = await prompts(
			{
				type: "confirm",
				name: "value",
				message: "Is this OK?",
				initial: true,
			},
			{
				onCancel: () => {
					console.log(red("✖") + " Operation cancelled");
					process.exit(1);
				},
			},
		);

		if (confirm.value) return selection;
		// else loop again
	}
}

async function installWithPkgManager(
	key: keyof typeof TOOLS,
	stepNo: number,
): Promise<boolean> {
	const t = TOOLS[key];
	const p0 = toolPath(key);
	if (p0) {
		success(`${t.name} is already installed (${p0})`);
		return true;
	}

	const pm: PkgManager = detectPkgManager();
	if (pm.name && pm.install && t[pm.name as keyof typeof t]) {
		const pkgName = t[pm.name as keyof typeof t] as string;
		const args = pmInstallArgs(pkgName, pm);
		const ok = await runConsole(
			`[${stepNo}] ${pm.name} install ${t.name} (${pkgName})`,
			args[0],
			args.slice(1),
		);

		if (ok) {
			if (toolPath(key)) {
				success(`${t.name} installed successfully`);
				return true;
			}
			warn(
				`${t.name}: installation appeared to succeed but ${t.check} not found in PATH`,
			);
			return false;
		}
		warn(
			`${t.name}: ${pm.name} installation failed — you may need to install it manually`,
		);
		return false;
	}

	if (!pm.name) {
		warn(
			`${t.name}: no supported package manager detected, please install manually`,
		);
	} else {
		warn(
			`${t.name}: no ${pm.name} package name configured, please install manually`,
		);
	}
	return false;
}

interface InstallTask {
	key: keyof typeof TOOLS;
	enabled: boolean;
}

interface InstallResult {
	ok: number;
	fail: number;
	steps: number;
}

async function installTools(
	tasks: InstallTask[],
	opts?: { needsPi?: boolean },
): Promise<InstallResult> {
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
		info(
			`[${stepNo}] Pi is installed via npm, run: npm install -g @anthropic/pi`,
		);
		info("  (or your preferred npm-compatible package manager)");
	}

	divider();

	if (stepNo === 0) {
		warn("No tools selected — nothing to install.");
	} else if (failCount === 0) {
		success(`All ${okCount} tool(s) ready!`);
	} else {
		out(`  ${green(`✓ ${okCount} ready`)}  ${red(`✗ ${failCount} failed`)}`);
	}

	return { ok: okCount, fail: failCount, steps: stepNo };
}

async function run() {
	console.log(`\n${banner}\n`);

	const argv = minimist(process.argv.slice(2), { boolean: true });
	const selection = await promptTools(argv);
	const { needsNeoVim, needsWezterm, needsHerdr, needsPi } = selection;

	const tasks: InstallTask[] = [
		{ key: "git", enabled: true },
		{ key: "nvim", enabled: needsNeoVim },
		{ key: "wezterm", enabled: needsWezterm },
		{ key: "herdr", enabled: needsHerdr },
	];

	await installTools(tasks, { needsPi });
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
