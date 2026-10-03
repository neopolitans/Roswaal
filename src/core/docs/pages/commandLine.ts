/**
 * The `command-line` page of the documentation. `buildSite` places it.
 */

import { CLI_COMMANDS, CLI_OPTIONS } from "../cli.js";
import type { DocPage } from "../site.js";

/**
 * The command line, rendered from the same list `roswaal help` prints.
 *
 * There was no page for it at all: the commands were described in the README
 * and in the help output, and the two had already drifted — `--yes` existed in
 * one and not the other. One list, two renderings.
 */
export function commandLinePage(): DocPage {
	return {
		slug: "command-line",
		title: "Command line",
		summary: "Every roswaal command, what it does, and which of them keep running.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"`roswaal` is shaped after `rojo`'s command line on purpose: it sits beside Rojo in " +
					"the same workflow, and a tool that invents its own conventions makes you learn " +
					"twice. Run it in the project directory, or point it at one with `--root`.",
			},
			{
				t: "code",
				lang: "sh",
				text: "cd path/to/your/roblox/project\nroswaal init      # once per project\nroswaal serve     # editor on http://127.0.0.1:4471, docs at /docs",
			},
			{ t: "h", level: 2, text: "Commands" },
			{
				t: "table",
				head: ["Command", "What it does"],
				rows: CLI_COMMANDS.map((command) => [
					`\`roswaal ${command.name}\``,
					[command.blurb, command.detail].filter(Boolean).join(" "),
				]),
			},
			{
				t: "note",
				kind: "info",
				text:
					"`serve`, `watch` and `restart` **block** until Ctrl+C. Everything else exits when " +
					"done, so `check` and `compile` suit scripts.",
			},
			{ t: "h", level: 2, text: "Options" },
			{
				t: "table",
				head: ["Option", "What it does"],
				rows: CLI_OPTIONS.map((option) => [`\`${option.flag}\``, option.blurb]),
			},
			{ t: "h", level: 2, text: "Two things worth knowing" },
			{
				t: "note",
				kind: "warn",
				text:
					"**Restart the daemon after rebuilding Roswaal.** A reload picks up the new editor, " +
					"but the server keeps running the old code.",
			},
			{
				t: "p",
				text:
					"`stop` **and** `restart` **reach the daemon over HTTP** rather than through a PID file, " +
					"so there is no stale pid to reason about when one dies unexpectedly. `stop` reports " +
					"success only once the health probe has gone quiet — not when the request was sent.",
			},
		],
	};
}
