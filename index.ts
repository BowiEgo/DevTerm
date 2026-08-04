#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

import { blue, bold, magenta, red } from "kolorist";
import minimist from "minimist";
import prompts, { prompt } from "prompts";

import banner from "./utils/banner";

function canSkipEmptying(dir: string) {
	if (!fs.existsSync(dir)) {
		return true;
	}

	const files = fs.readdirSync(dir);
	if (files.length === 0) {
		return true;
	}
	if (files.length === 1 && files[0] === ".git") {
		return true;
	}

	return false;
}

async function init() {
	console.log(`\n${banner}\n`);

	const cwd = process.cwd();
	// possible options:
	// --default
	// --nvim
	// --wezterm
	// --herdr
	// --pi
	const argv = minimist(process.argv.slice(2), {
		alias: {},
		// all arguments are treated as booleans
		boolean: true,
	});

	// if any of the feature flags is set, we would skip the feature prompts
	const isFeatureFlagsUsed =
		typeof (
			argv.default ??
			argv.nvim ??
			argv.wezterm ??
			argv.herdr ??
			argv.pi
		) === "boolean";

	let result: {
		needsNeoVim?: boolean;
		needsWezterm?: boolean;
		needsHerdr?: boolean;
		needsPi?: boolean;
	} = {};

	let isFirstPrompt = true;

	async function promptQuestions() {
		let promptsResult,
			// Prompts:
			// - Install NeoVim as IDE?
			// - Install Wezterm as terminal?
			// - Install Herdr for AI Agent multiplexers?
			// - Install Pi as AI Agent?
			questions: any[] = [
				{
					name: "Tools to install",
					type: () => {
						if (isFeatureFlagsUsed) {
							return null;
						}
						return "multiselect";
					},
					message: "Select multi options for your terminal environment:",
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

					format: (val) => {
						return {
							needsNeoVim: val.includes("needsNeoVim"),
							needsWezterm: val.includes("needsWezterm"),
							needsHerdr: val.includes("needsHerdr"),
							needsPi: val.includes("needsPi"),
						};
					},
				},
			];

		try {
			promptsResult = await prompts(
				isFirstPrompt ? questions : questions.slice(3),
				{
					onCancel: () => {
						throw new Error(red("✖") + " Operation cancelled");
					},
				},
			);
		} catch (cancelled) {
			console.log(cancelled.message);
			process.exit(1);
		}

		if (isFirstPrompt) {
		}

		const { optionalConfiguration } = promptsResult;

		const {
			needsNeoVim = argv.nvim,
			needsWezterm = argv.wezterm,
			needsHerdr = argv.herdr,
			needsPi = argv.pi,
		} = optionalConfiguration;

		let answerHints = [];
		Object.keys(optionalConfiguration).forEach((key) => {
			answerHints.push(
				`${
					questions
						.find((item) => item.name === "optionalConfiguration")
						.choices.find((item) => item.value === key).title
				}  ${optionalConfiguration[key] ? bold(blue("✓")) : bold(red("✗"))}`,
			);
		});

		console.log(bold("\nThis is your configuration:\n"));
		answerHints.forEach((hint) => console.log(`  ${hint}`));
		console.log("\n");

		isFirstPrompt = false;

		let isConfirm;

		try {
			isConfirm = await prompts(
				{
					type: "confirm",
					name: "value",
					message: "Is This OK?",
					initial: true,
				},
				{
					onCancel: () => {
						throw new Error(red("✖") + " Operation cancelled");
					},
				},
			);
		} catch (cancelled) {
			console.log(cancelled.message);
			process.exit(1);
		}

		if (isConfirm.value) {
			return {
				needsNeoVim,
				needsWezterm,
				needsHerdr,
				needsPi,
			};
		} else {
			return await promptQuestions();
		}
	}

	try {
		let promptResult = await promptQuestions();
		result = { ...result, ...promptResult };
	} catch (cancelled) {
		console.log(cancelled.message);
		process.exit(1);
	}

	// console.log('result', result)
	const { needsNeoVim, needsWezterm, needsHerdr, needsPi } = result;
}

init().catch((e) => {
	console.error(e);
});
