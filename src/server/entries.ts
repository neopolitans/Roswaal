/**
 * Structural edits the project tree makes: creating a folder, and renaming,
 * moving or deleting an entry.
 *
 * Every path goes through `entryPath`, which refuses the project folder
 * itself, and through `assertEditable`, which refuses the output directory.
 * A deletion goes through `assertDeletable` as well, which refuses what
 * Roswaal never writes into and the files it keeps for you.
 */

import type { OpenProject } from "./config.js";
import { graphName, readScript, writeScript } from "./documents.js";
import { UserError } from "./errors.js";
import { exists, SKIP_DIRS } from "./files.js";
import { fs, path } from "./host.js";
import { entryPath, isInside, safeJoin, toPosix } from "./paths.js";

/**
 * Refuses a structural edit inside the output directory.
 *
 * Everything under outDir is generated: a folder made there is not a source
 * folder, and a graph moved there is not moved at all — the next compile
 * writes it back where it came from and leaves an orphan behind. Saying so is
 * kinder than letting it look like it worked.
 */
function assertEditable(project: OpenProject, relPath: string, verb: string): void {
	const out = project.config.outDir.replace(/\/+$/, "");
	const normalised = toPosix(relPath).replace(/^\.\//, "");
	if (normalised !== out && !normalised.startsWith(out + "/")) return;

	throw new UserError(
		`${out} holds generated files, so there is nothing to ${verb} there. ` +
			`Work in ${project.config.sourceDir}; the folders you make there appear under ` +
			`${out} when you compile.`,
	);
}

/**
 * Directories under sourceDir mirror directories under outDir, which Rojo turns
 * into Folder instances. Making one here is how you get a folder in the
 * DataModel without touching the project file.
 */
export async function createFolder(project: OpenProject, relPath: string): Promise<string> {
	assertEditable(project, relPath, "create a folder");
	const abs = safeJoin(project.root, relPath);
	if (await exists(abs)) throw new UserError(`${relPath} already exists.`);
	await fs.mkdir(abs, { recursive: true });
	return relPath;
}

export async function renameEntry(
	project: OpenProject,
	relPath: string,
	newName: string,
): Promise<string> {
	assertEditable(project, relPath, "rename anything");
	const clean = newName.replace(/[\\/:*?"<>|]/g, "").trim();
	if (clean === "") throw new UserError("A name cannot be empty.");

	const source = entryPath(project.root, relPath);
	const destRel = path.posix.join(path.posix.dirname(toPosix(relPath)), clean);
	const dest = entryPath(project.root, destRel);
	if (source === dest) return destRel;
	if (await exists(dest)) throw new UserError(`${destRel} already exists.`);
	await fs.rename(source, dest);

	// A graph carries its own name, and that name — not the file's — is what the
	// compiler writes out. Renaming the file alone would leave the two disagreeing
	// with nothing to say so -- `Hello.nodescript` producing `Greeter.luau`, and
	// if another graph were already called Hello, the two sharing a file.
	//
	// Only for graphs. A `.nodemap` takes its output from the map, a `.luau` is
	// not ours to edit, and a folder has no inside to update.
	if (destRel.endsWith(".nodescript")) {
		const wanted = graphName(path.posix.basename(destRel, ".nodescript"));
		// An empty result means the new file name was punctuation all the way
		// down. Leaving the old name is worse than nothing, but inventing
		// "Untitled" here would rename the graph behind the developer's back.
		if (wanted !== "") {
			const script = await readScript(project, destRel);
			if (script.name !== wanted) {
				script.name = wanted;
				await writeScript(project, destRel, script);
			}
		}
	}

	return destRel;
}

export async function moveEntry(
	project: OpenProject,
	from: string,
	toDir: string,
): Promise<string> {
	assertEditable(project, from, "move anything");
	assertEditable(project, toDir, "move anything");
	const source = entryPath(project.root, from);
	const name = path.basename(from);
	const destRel = path.posix.join(toDir, name);
	const dest = entryPath(project.root, destRel);
	if (source === dest) return destRel;
	if (isInside(dest, source)) throw new UserError(`${toPosix(from)} cannot be moved into itself.`);
	if (await exists(dest)) throw new UserError(`${destRel} already exists.`);
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.rename(source, dest);
	return destRel;
}

export async function deleteEntry(project: OpenProject, relPath: string): Promise<void> {
	const abs = entryPath(project.root, relPath);
	assertDeletable(project, relPath);
	// Recursive, because folders are now something the tree can create. Tried
	// again a few times over a third of a second: on Windows a file another
	// program has just touched -- a virus scan, an indexer, Studio -- is
	// briefly refused, and the first try failing should not fail the delete.
	await fs.rm(abs, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
}

/** What the tree's Delete refuses: see `assertDeletable`. */
const KEPT_FILES = new Set(["roswaal.json"]);
const KEPT_FOLDERS = [".roswaal/backups"];

/**
 * Refuses a deletion of something Roswaal never writes into, or keeps for you.
 *
 * The folders the project walk skips -- `.git`, `node_modules`, Wally's
 * `Packages` -- wherever they are, and anything in them: they are another
 * tool's, and deleting one is permanent. `roswaal.json`, which is the project.
 * `.roswaal/backups`, the copies a place is backed up to before a change. And
 * the output directory itself, though not what is in it: a generated file
 * comes back at the next compile, and an orphan is worth clearing, but the
 * folder is where the project says its Luau goes.
 */
function assertDeletable(project: OpenProject, relPath: string): void {
	const normalised = toPosix(relPath).replace(/^\.\//, "").replace(/\/+$/, "");
	const parts = normalised.split("/");
	const skipped = parts.find((part) => SKIP_DIRS.has(part));
	if (skipped)
		throw new UserError(
			`${skipped} belongs to another tool, so Roswaal does not delete it or anything in it. ` +
				"Delete it outside Roswaal if you mean to.",
		);
	if (KEPT_FILES.has(normalised))
		throw new UserError(
			`${normalised} is the project's own settings, so it cannot be deleted here.`,
		);
	const kept = KEPT_FOLDERS.find((f) => normalised === f || normalised.startsWith(`${f}/`));
	if (kept)
		throw new UserError(
			`${kept} holds the copies kept of the place before each change, so it cannot be deleted here.`,
		);
	if (normalised === project.config.outDir.replace(/^\.\//, "").replace(/\/+$/, ""))
		throw new UserError(
			`${normalised} is where the project's Luau is written, so it cannot be deleted here.`,
		);
}
