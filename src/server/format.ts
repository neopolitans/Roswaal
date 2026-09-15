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

/**
 * The stylua command that starts, once one has: `null` when none does, and
 * `undefined` until somebody has looked.
 */
let styluaCommand: string | null | undefined;

/**
 * Runs stylua over generated code when it is available.
 *
 * The emitter deliberately does not try to be a pretty-printer; it produces
 * correct Luau and lets the formatter the project already uses make it look
 * like the rest of the codebase.
 *
 * **Absent and refusing are different answers.** This used to treat stylua
 * exiting non-zero the same as stylua not existing, so one file it could not
 * parse turned formatting off for every file after it until the daemon was
 * restarted. Now only a command that will not start counts as absent; one that
 * ran and refused leaves that file as emitted and formats the next.
 */
export function formatLuau(
	cwd: string, code: string, config?: Pick<RoswaalConfig, "indentStyle" | "indentWidth">,
): string {
	if (styluaCommand === null) return code;

	/**
	 * The indentation setting, handed to stylua as arguments.
	 *
	 * Without them a project's `stylua.toml` decides, and the setting in
	 * `roswaal.json` would appear to do nothing for everyone who has both --
	 * which is the whole of its audience, since the setting exists for people
	 * who care what their generated files look like.
	 */
	const spaces = config?.indentStyle === "space";
	const indent = config
		? ["--indent-type", spaces ? "Spaces" : "Tabs",
			// A tab has no width, but stylua still counts one against its column
			// limit, so the number is told either way.
			"--indent-width", String(spaces ? indentUnit(config).length : config.indentWidth || 4)]
		: [];

	// Each candidate is tried without a shell. Going through one would resolve
	// the .cmd shim for us, but it also means the arguments are concatenated
	// rather than passed, which Node now warns about — and we do not need it.
	const candidates = styluaCommand
		? [styluaCommand]
		: process.platform === "win32" ? ["stylua.exe", "stylua.cmd", "stylua.bat"] : ["stylua"];

	for (const command of candidates) {
		const run = spawnSync(command, [...indent, "-"], { cwd, input: code, encoding: "utf8" });
		if (run.error) continue;
		styluaCommand = command;
		if (run.status === 0 && typeof run.stdout === "string" && run.stdout !== "") return run.stdout;
		return code;
	}

	// Remembered, so a project without stylua does not pay for the lookup on
	// every single file it compiles.
	if (styluaCommand === undefined) styluaCommand = null;
	return code;
}
