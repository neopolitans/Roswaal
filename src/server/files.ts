/**
 * Small file helpers the project modules share: whether something exists,
 * writing a file in one step, and walking a folder for the files in it.
 *
 * Through `./host.js`, like everything in the project layer, so the same code
 * runs on the disk and on the web build's volume.
 */

import { fs, path } from "./host.js";

import { toPosix } from "./paths.js";

/**
 * Folders nothing Roswaal does reads or writes into: compiling, stale-file
 * cleanup, export. Wally's folders are here because they are Wally's.
 */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
	"node_modules",
	".git",
	".vscode",
	"dist",
	"build",
	"out",
	"Packages",
	"ServerPackages",
	"DevPackages",
]);

/** A file a walk found. */
export interface WalkedFile {
	/** Where it is, for reading it. */
	abs: string;
	/** Relative to the walk's root, with forward slashes. */
	path: string;
	name: string;
}

export interface WalkOptions {
	/** Where to start, relative to the root. The root itself when absent. */
	from?: string;
	/** Folder names never gone into, wherever they are. `SKIP_DIRS` when absent. */
	skip?: ReadonlySet<string>;
	/** Which files to keep, by name. Every file when absent. */
	accept?: (name: string) => boolean;
}

/**
 * Every file under a folder, sorted by path.
 *
 * The one walk the project modules share, so what they skip is decided in one
 * place. A folder that cannot be read is passed over rather than failing the
 * walk: it is nothing Roswaal wrote, and one bad folder should not hide the
 * rest of the project.
 */
export async function walkFiles(root: string, options: WalkOptions = {}): Promise<WalkedFile[]> {
	const skip = options.skip ?? SKIP_DIRS;
	const out: WalkedFile[] = [];
	const stack = [path.join(root, options.from ?? "")];
	for (let dir = stack.pop(); dir !== undefined; dir = stack.pop()) {
		// Unreadable or gone: see above.
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!skip.has(entry.name)) stack.push(abs);
				continue;
			}
			if (options.accept && !options.accept(entry.name)) continue;
			out.push({ abs, path: toPosix(path.relative(root, abs)), name: entry.name });
		}
	}
	return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

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
	return fs.access(abs).then(
		() => true,
		() => false,
	);
}
