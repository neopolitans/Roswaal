/**
 * Finding the programs the daemon starts, as absolute paths.
 *
 * A program started by bare name is looked up by whoever starts it, and on
 * Windows that lookup tries the working directory before PATH. The daemon
 * starts StyLua in the project folder and everything else in the folder it was
 * started from, so a project would decide which program ran. Every program is
 * therefore located here, and spawned by the path this returns.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * The first file called `filename` in a PATH directory, or `null`.
 *
 * Only absolute PATH entries count: `.`, an empty entry or any other relative
 * one means "wherever the process happens to be", which is the lookup this
 * module exists to avoid. Directories inside `outside` are skipped as well, so
 * an entry such as a project's own `node_modules/.bin` is not a way back in.
 */
export function findOnPath(
	filename: string,
	options: { outside?: string; pathVar?: string } = {},
): string | null {
	const pathVar = options.pathVar ?? process.env.PATH ?? process.env.Path ?? "";
	const outside = options.outside ? path.resolve(options.outside) : undefined;
	for (const dir of pathVar.split(path.delimiter)) {
		const entry = stripQuotes(dir.trim());
		if (!entry || !path.isAbsolute(entry)) continue;
		if (outside && isWithin(path.resolve(entry), outside)) continue;
		const candidate = path.join(entry, filename);
		if (isFile(candidate)) return candidate;
	}
	return null;
}

/**
 * A program that ships with Windows, by its full path under the Windows
 * folder: `windowsProgram("explorer.exe")`,
 * `windowsProgram("System32", "WindowsPowerShell", "v1.0", "powershell.exe")`.
 */
export function windowsProgram(...segments: string[]): string {
	const root = process.env.SystemRoot || process.env.windir || "C:\\Windows";
	return path.win32.join(root, ...segments);
}

/** Windows lets a PATH entry be quoted, for one with a `;` in it. */
function stripQuotes(entry: string): string {
	return entry.length > 1 && entry.startsWith('"') && entry.endsWith('"')
		? entry.slice(1, -1)
		: entry;
}

function isWithin(dir: string, folder: string): boolean {
	const rel = path.relative(folder, dir);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isFile(candidate: string): boolean {
	try {
		return fs.statSync(candidate).isFile();
	} catch {
		return false;
	}
}
