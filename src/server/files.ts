/**
 * Small file helpers the project modules share: whether something exists,
 * writing a file in one step, and the folders no walk goes into.
 *
 * Through `./host.js`, like everything in the project layer, so the same code
 * runs on the disk and on the web build's volume.
 */

import { fs } from "./host.js";

/**
 * Folders nothing Roswaal does reads or writes into: compiling, stale-file
 * cleanup, export. Wally's folders are here because they are Wally's.
 */
export const SKIP_DIRS = new Set([
	"node_modules", ".git", ".vscode", "dist", "build", "out", "Packages", "ServerPackages", "DevPackages",
]);

/**
 * Writes a file the editor saves, so that a crash or power cut part-way
 * leaves the old file rather than half of the new one.
 *
 * `writeFile` empties the file before it writes, so a graph interrupted there
 * was a truncated `.nodescript` that no longer opened. This writes beside it
 * and renames over the top, which replaces the file in one step.
 *
 * Windows refuses that rename while another program has the file open, so a
 * refused rename falls back to an ordinary write rather than losing the save.
 */
export async function writeTextAtomically(abs: string, text: string): Promise<void> {
	const temporary = `${abs}.${Math.random().toString(36).slice(2, 10)}.tmp`;
	await fs.writeFile(temporary, text, "utf8");
	try {
		await fs.rename(temporary, abs);
	} catch (error) {
		await fs.rm(temporary, { force: true });
		const code = (error as { code?: unknown }).code;
		if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
		await fs.writeFile(abs, text, "utf8");
	}
}

/** Whether anything is at `abs`: a file or a folder. */
export async function exists(abs: string): Promise<boolean> {
	return fs.access(abs).then(() => true, () => false);
}
