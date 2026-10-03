/**
 * What `roswaal help` prints, for the whole tool or for one command.
 *
 * Built from the one list the documentation renders too (`core/docs/cli.ts`),
 * and returned as lines rather than printed, so a test can read it.
 */

import { CLI_COMMANDS, CLI_OPTIONS, type CliCommand, type CliOption } from "../core/docs/cli.js";
import { bold, cyan, dim } from "./style.js";
import { VERSION } from "./version.js";

/** The help for `topic`, or for the whole tool when it names no command. */
export function helpLines(topic?: string): string[] {
	const command = CLI_COMMANDS.find((one) => one.name === topic);
	return command ? commandHelp(command) : toolHelp();
}

function toolHelp(): string[] {
	return [
		`${bold("roswaal")} — visual scripting for Roblox Luau, and Lune Luau (experimental)`,
		dim(`v${VERSION}`),
		"",
		bold("USAGE"),
		"  roswaal <command> [options]",
		"  roswaal <command> --help",
		"",
		bold("COMMANDS"),
		...CLI_COMMANDS.map((command) => `  ${cyan(command.name.padEnd(10))} ${command.blurb}`),
		"",
		bold("OPTIONS"),
		...CLI_OPTIONS.map(optionLine),
		"",
		dim("  Graphs live in .roswaal/scripts and compile to the outDir in roswaal.json."),
		dim("  Rojo syncs the result; Roswaal never talks to Studio itself."),
	];
}

function commandHelp(command: CliCommand): string[] {
	// An option written "For serve: …" belongs to serve; one with no "For" is everybody's.
	const options = CLI_OPTIONS.filter((option) => {
		const owner = /^For ([^:]+):/.exec(option.blurb)?.[1];
		return owner === undefined || owner.split(/,\s*|\s+and\s+/).includes(command.name);
	});
	return [
		`${bold(`roswaal ${command.name}`)} — ${command.blurb}`,
		...(command.detail ? ["", `  ${command.detail}`] : []),
		"",
		bold("OPTIONS"),
		...options.map(optionLine),
	];
}

function optionLine(option: CliOption): string {
	return `  ${option.flag.padEnd(16)} ${option.blurb}`;
}
