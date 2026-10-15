/**
 * Running stylua over generated Luau, on a machine that has one.
 *
 * Its own module because it is the only part of the project layer that needs a
 * subprocess, and a subprocess is the one thing a browser tab can never be
 * given. Everything else `project.ts` does to a project — reading it, walking
 * it, refusing to overwrite a hand edit — is filesystem work that a volume in
 * memory can answer just as well. This is not, so it lives behind `host.ts`
 * with the filesystem and is replaced on the web by a formatter that returns
 * the code it was handed.
 */

import { spawnSync } from "node:child_process";

import { indentUnit, type RoswaalConfig } from "../core/schema.js";
import type { Formatted } from "./filesystem.js";
import { findOnPath } from "./programs.js";

/**
 * The stylua that starts for the project at `root`, once one has: `command`
 * is its absolute path, or `null` when none does.
 *
 * Kept per project, because the lookup skips PATH entries inside the project,
 * and a daemon that opens another project must look again.
 */
let stylua: { root: string; command: string | null } | undefined;

/**
 * Runs stylua over generated code when it is available.
 *
 * The emitter deliberately does not try to be a pretty-printer; it produces
 * correct Luau and lets the formatter the project already uses make it look
 * like the rest of the codebase.
 *
 * **Absent and refusing are different answers.** Only a command that will not
 * start counts as absent, and says nothing; one that ran and refused leaves
 * that file as emitted, says why, and formats the next. Treating the two alike
 * would let one file stylua cannot parse turn formatting off for every file
 * after it -- and saying nothing about a refusal hid a stylua that refused
 * every file, which a toolchain manager's shim does when no project names it.
 */
export function formatLuau(
	cwd: string,
	code: string,
	config?: Pick<RoswaalConfig, "indentStyle" | "indentWidth">,
): Formatted {
	const known = stylua?.root === cwd ? stylua.command : undefined;
	if (known === null) return { code };

	// The indentation setting, handed to stylua as arguments.
	//
	// Without them a project's `stylua.toml` decides, and the setting in
	// `roswaal.json` would appear to do nothing for everyone who has both --
	// which is the whole of its audience, since the setting exists for people
	// who care what their generated files look like.
	const spaces = config?.indentStyle === "space";
	const indent = config
		? [
				"--indent-type",
				spaces ? "Spaces" : "Tabs",
				// A tab has no width, but stylua still counts one against its column
				// limit, so the number is told either way.
				"--indent-width",
				String(spaces ? indentUnit(config).length : config.indentWidth || 4),
			]
		: [];

	// Found on PATH and started by its absolute path, without a shell, and
	// never from the project folder: the project is the working directory, so
	// a bare name would let a `stylua.exe` beside `roswaal.json` answer instead.
	// The working directory is still the project's, for stylua's own search
	// for `stylua.toml`.
	//
	// Only the .exe on Windows. Node will not start a .cmd or .bat without a
	// shell, and a shell would concatenate the arguments rather than pass them.
	const command =
		known ?? findOnPath(process.platform === "win32" ? "stylua.exe" : "stylua", { outside: cwd });
	const run = command
		? spawnSync(command, [...indent, "-"], { cwd, input: code, encoding: "utf8" })
		: null;

	// Remembered, so a project without stylua does not pay for the lookup on
	// every single file it compiles.
	stylua = { root: cwd, command: run && !run.error ? command : null };
	if (!run || run.error) return { code };
	if (run.status === 0 && typeof run.stdout === "string" && run.stdout !== "") {
		return { code: run.stdout };
	}
	return { code, unformatted: refusal(run.stderr, run.status) };
}

/**
 * What stylua said when it refused: the first line it wrote, without the
 * colours a terminal would have drawn it in or the "error" it starts with,
 * since every place this is shown already says it is a problem. Its exit code
 * if it said nothing.
 */
export function refusal(stderr: unknown, status: number | null): string {
	const said = typeof stderr === "string" ? stderr : "";
	const plain = said.replace(/\u001b\[[0-9;]*m/g, "");
	const line = plain
		.split(/\r?\n/)
		.map((l) => l.trim().replace(/^error:?\s+/i, ""))
		.find((l) => l !== "");
	return line ?? `Exited with code ${status ?? "unknown"}.`;
}
