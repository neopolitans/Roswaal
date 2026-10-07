/**
 * Writes a new project into a folder that has nothing in it yet.
 *
 * One implementation for `roswaal new`, the daemon's start page and the web
 * editor's, as `initProject` is for setting up a folder that already has work
 * in it. What a new project contains is decided in `core/newProject.ts`; this
 * puts it on disk and compiles it, so it opens with its Rojo project written
 * and its first graph already Luau.
 */

import { type NewProjectOptions, newProject } from "../core/newProject.js";
import { compileAll, compileMap } from "./compile.js";
import { type OpenProject, openProject, writeConfig } from "./config.js";
import { UserError } from "./errors.js";
import { fs, path } from "./host.js";
import { safeJoin } from "./paths.js";

/**
 * Why a folder cannot take a new project, or null when it can: it is not
 * there yet, or it is an empty folder.
 *
 * A folder with anything in it is refused rather than added to. Somebody with
 * files there already wants `roswaal init`, which keeps them; a new project
 * written over them would be the one outcome nobody asked for.
 */
export async function newProjectFolderProblem(root: string): Promise<string | null> {
	const stat = await fs.stat(root).catch(() => null);
	if (stat === null) return null;
	if (!stat.isDirectory()) return `${root} is a file, not a folder.`;
	const entries = await fs.readdir(root);
	if (entries.length > 0) {
		return (
			`${root} already has files in it. A new project goes in an empty folder; ` +
			"to use this one as it is, set it up as a project instead."
		);
	}
	return null;
}

/**
 * Makes the project, compiles it, and opens it.
 *
 * `makeId` names its graphs and map; it is passed in so a test can name them
 * predictably and both hosts can use whichever random source they have.
 */
export async function createProject(
	root: string,
	options: NewProjectOptions,
	makeId: () => string = () => crypto.randomUUID(),
): Promise<OpenProject> {
	const resolved = path.resolve(root);
	const problem = await newProjectFolderProblem(resolved);
	if (problem) throw new UserError(problem);

	const made = newProject(options, makeId);
	await fs.mkdir(resolved, { recursive: true });
	await writeConfig(resolved, made.config);
	for (const nodes of made.config.nodePaths) {
		await fs.mkdir(safeJoin(resolved, nodes), { recursive: true });
	}
	for (const [rel, content] of Object.entries(made.files)) {
		const abs = safeJoin(resolved, rel);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, content, "utf8");
	}

	// Compiled now, so the project opens as a working one: the Rojo project
	// and the folders it syncs, then the first graph's Luau inside them.
	let project = await openProject(resolved);
	for (const rel of Object.keys(made.files).filter((f) => f.endsWith(".nodemap"))) {
		await compileMap(project, rel, { write: true });
	}
	project = await openProject(resolved);
	await compileAll(project, { write: true });
	return openProject(resolved);
}
