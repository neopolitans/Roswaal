/**
 * Structural edits the project tree makes: creating a folder, and renaming,
 * moving or deleting an entry.
 *
 * Every path goes through `entryPath`, which refuses the project folder
 * itself, and through `assertEditable`, which refuses the output directory.
 */

import { fs, path } from "./host.js";

import type { OpenProject } from "./config.js";
import { graphName, readScript, writeScript } from "./documents.js";
import { UserError } from "./errors.js";
import { exists } from "./files.js";
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
	project: OpenProject, relPath: string, newName: string,
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

	/**
	 * A graph carries its own name, and that name — not the file's — is what the
	 * compiler writes out. Renaming the file alone left the two disagreeing with
	 * nothing to say so: `Hello.nodescript` went on producing `Greeter.luau`, and
	 * if some other graph was already called Hello, they silently shared a file.
	 *
	 * Only for graphs. A `.nodemap` takes its output from the map, a `.luau` is
	 * not ours to edit, and a folder has no inside to update.
	 */
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
	project: OpenProject, from: string, toDir: string,
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
	// Recursive, because folders are now something the tree can create.
	await fs.rm(entryPath(project.root, relPath), { recursive: true, force: false });
}
