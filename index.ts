#!/usr/bin/env node

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { blue, bold, dim, green, magenta, red, yellow } from "kolorist";
import minimist from "minimist";
import prompts from "prompts";

import banner from "./utils/banner";
import { detectPackage, type Package, pmInstallArgs } from "./utils/pkgManager";
import { TOOLS, toolPath } from "./utils/tools";

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

/** Spawn a command, pipe stdio, and resolve with exit code */
function runConsole(
	label: string,
	command: string,
	args: string[],
): Promise<boolean> {
	step(label, `${command} ${args.join(" ")}`);
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("close", (code) => resolve(code === 0));
		child.on("error", () => resolve(false));
	});
}

function canSkipEmptying(dir: string) {
	if (!fs.existsSync(dir)) return true;

	const files = fs.readdirSync(dir);
	if (files.length === 0) return true;
	if (files.length === 1 && files[0] === ".git") return true;

	return false;
}

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

async function installTool(
	key: keyof typeof TOOLS,
	stepNo: number,
): Promise<boolean> {
	const t = TOOLS[key];
	const p0 = toolPath(key);
	if (p0) {
		success(`${t.name} is already installed (${p0})`);
		return true;
	}

	const pkg: Package = detectPackage();
	if (pkg.name && pkg.install && t[pkg.name as keyof typeof t]) {
		const pkgName = t[pkg.name as keyof typeof t] as string;
		const args = pmInstallArgs(pkgName, pkg);
		const ok = await runConsole(
			`[${stepNo}] ${pkg.name} install ${t.name} (${pkgName})`,
			args[0],
			args.slice(1),
		);

		if (ok) {
			// Verify the tool is now available
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
			`${t.name}: ${pkg.name} installation failed — you may need to install it manually`,
		);
		return false;
	}

	if (!pkg.name) {
		warn(
			`${t.name}: no supported package manager detected, please install manually`,
		);
	} else {
		warn(
			`${t.name}: no ${pkg.name} package name configured, please install manually`,
		);
	}
	return false;
}

async function run() {
	console.log(`\n${banner}\n`);

	const cwd = process.cwd();

	const argv = minimist(process.argv.slice(2), {
		boolean: true,
	});

	const selection = await promptTools(argv);
	const { needsNeoVim, needsWezterm, needsHerdr, needsPi } = selection;

	const tasks: { enabled: boolean; key: keyof typeof TOOLS }[] = [
		{ enabled: needsNeoVim, key: "nvim" },
		{ enabled: needsWezterm, key: "wezterm" },
		{ enabled: needsHerdr, key: "herdr" },
	];

	// Git is always recommended as a base dependency
	tasks.unshift({ enabled: true, key: "git" });

	divider();

	let stepNo = 0;
	let okCount = 0;
	let failCount = 0;

	for (const task of tasks) {
		if (!task.enabled) continue;
		stepNo++;
		const ok = await installTool(task.key, stepNo);
		if (ok) okCount++;
		else failCount++;
	}

	// Pi needs separate handling (npm-based, not system package manager)
	if (needsPi) {
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
		out(
			`  ${green(`✓ ${okCount} ready`)}  ${red(`✗ ${failCount} failed`)}`,
		);
	}
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
