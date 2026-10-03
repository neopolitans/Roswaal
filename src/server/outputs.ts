/**
 * Generated files as files: which graph wrote each one, where a graph's output
 * goes, and the ones nothing writes any more.
 *
 * Writing an output is `compile.ts`; this is what is known about outputs
 * already on disk, read from the header each one carries.
 */

import { fs, path } from "./host.js";

import { outputFileName } from "../core/compiler/index.js";
import type { OpenProject } from "./config.js";
import { collectScripts, readScript } from "./documents.js";
import { walkFiles } from "./files.js";
import { safeJoin, toPosix } from "./paths.js";

/** Maps generated Luau back to the graph that produced it, via the header. */
export async function generatedIndex(project: OpenProject): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const files = await walkFiles(project.root, {
		from: project.config.outDir,
		accept: (name) => /\.luau?$/.test(name),
	});
	for (const file of files) {
		// Gone since the walk listed it: then it is nobody's output.
		const head = (await fs.readFile(file.abs, "utf8").catch(() => "")).slice(0, 512);
		const match = /^-- roswaal-graph: (.+)$/m.exec(head);
		if (match) map.set(file.path, match[1].trim());
	}
	return map;
}

/**
 * Where a graph at `relPath` writes a file called `fileName`: the same folder
 * under `outDir` as the graph has under `sourceDir`. Project-relative.
 */
export function outputPathFor(project: OpenProject, relPath: string, fileName: string): string {
	const within = path.posix.dirname(toPosix(path.relative(project.config.sourceDir, relPath)));
	return path.posix.normalize(path.posix.join(toPosix(project.config.outDir), within, fileName));
}

/**
 * The Luau file a graph compiles to, project-relative, or null when it cannot
 * be read. Where its code runs from, for `script.Parent`.
 */
export async function graphOutputPath(project: OpenProject, relPath: string): Promise<string | null> {
	// A graph that will not read has no output to name; the caller says so.
	const script = await readScript(project, relPath).catch(() => null);
	return script ? outputPathFor(project, relPath, outputFileName(script)) : null;
}

/**
 * Generated files with no graph behind them any more.
 *
 * Moving or renaming a graph writes its output somewhere new and leaves the old
 * file sitting there. Rojo has no way to know it is stale, so it syncs it, and
 * you get the same module in two places — which is confusing in exactly the way
 * that is hard to trace back to a rename.
 */
export async function findOrphanOutputs(project: OpenProject): Promise<string[]> {
	const expected = new Set<string>();
	for (const relPath of await collectScripts(project)) {
		const output = await graphOutputPath(project, relPath);
		// A graph that will not read cannot vouch for its output, so leave
		// anything it might own alone.
		if (output === null) return [];
		expected.add(output);
	}

	const orphans: string[] = [];
	for (const [output] of await generatedIndex(project)) {
		if (!expected.has(output)) orphans.push(output);
	}
	return orphans.sort();
}

export async function removeOutputs(project: OpenProject, paths: string[]): Promise<number> {
	let removed = 0;
	for (const relPath of paths) {
		// Only ever delete something we can still see is generated.
		const abs = safeJoin(project.root, relPath);
		const head = (await fs.readFile(abs, "utf8").catch(() => "")).slice(0, 512);
		if (!head.includes("roswaal-graph:")) continue;
		await fs.rm(abs, { force: true });
		await removeEmptyFolders(project, relPath);
		removed++;
	}
	return removed;
}

/**
 * The folders a removed output leaves empty, removed with it.
 *
 * A graph in a folder of its own compiles into a matching folder under the
 * out directory, and deleting the graph and then its output left that folder
 * behind — empty, and synced by Rojo as an empty Folder instance. Climbs from
 * the file's folder towards the out directory, stopping at the first folder
 * that still holds anything, and never removes the out directory itself or
 * anything outside it.
 */
export async function removeEmptyFolders(project: OpenProject, relPath: string): Promise<void> {
	const outDir = path.posix.normalize(toPosix(project.config.outDir));
	let dir = path.posix.dirname(path.posix.normalize(toPosix(relPath)));
	while (dir !== outDir && dir.startsWith(`${outDir}/`)) {
		const abs = safeJoin(project.root, dir);
		let entries: string[];
		try {
			entries = await fs.readdir(abs);
		} catch {
			// Already gone, or not a folder: there is nothing here to tidy.
			return;
		}
		if (entries.length > 0) return;
		await fs.rm(abs, { recursive: true, force: true });
		dir = path.posix.dirname(dir);
	}
}
