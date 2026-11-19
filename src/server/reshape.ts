/**
 * Keeping the Luau in step when graphs move, are renamed or are deleted --
 * scripts with children among them -- on the daemon and the website alike.
 *
 * Nothing here relies on a watcher: the website has none, and a daemon in
 * Manual mode compiles only when asked. So in Dynamic mode a moved graph is
 * compiled where it is now, which removes the Luau it wrote before (by its
 * graph id, `removeSupersededOutputs`); a deleted graph's Luau goes with it in
 * either mode; and a Rojo meta file beside a graph's Luau follows the Luau.
 */

import { isFilesystemMap, type MapNode } from "../core/nodemap.js";
import { compileMap, compileScript } from "./compile.js";
import type { OpenProject } from "./config.js";
import { collectMaps, collectScripts, isInitGraph, readMap, writeMap } from "./documents.js";
import { deleteEntry } from "./entries.js";
import { UserError } from "./errors.js";
import { exists } from "./files.js";
import { fs, path } from "./host.js";
import { graphOutputPath, removeEmptyFolders, removeOutputs } from "./outputs.js";
import { entryPath, safeJoin, toPosix } from "./paths.js";

/** A script with children that became a plain graph again: where its graph was and is. */
export interface Flattened {
	from: string;
	to: string;
}

/** Every graph at or under a path: the graph itself, or a folder's. */
export async function graphsUnder(project: OpenProject, relPath: string): Promise<string[]> {
	const rel = toPosix(relPath);
	return (await collectScripts(project)).filter((p) => p === rel || p.startsWith(`${rel}/`));
}

/** Each graph's Luau, as its path says now. A graph that will not read has none. */
export async function outputsOf(
	project: OpenProject,
	graphs: readonly string[],
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	for (const graph of graphs) {
		const output = await graphOutputPath(project, graph).catch(() => null);
		if (output) out.set(graph, output);
	}
	return out;
}

/**
 * Refuses to move or rename a script's own graph apart from its folder: moving
 * `Config/init.nodescript` alone would quietly make some other folder a
 * script and leave Config a Folder. The folder moves instead, children and all.
 */
export function assertNotLoneInit(relPath: string, verb: string): void {
	if (!isInitGraph(relPath)) return;
	const name = path.posix.basename(path.posix.dirname(toPosix(relPath)));
	throw new UserError(
		`init.nodescript is ${name}'s own graph. To ${verb} ${name}, ${verb} its folder, which takes its children with it.`,
	);
}

/**
 * After graphs moved from `from` to `to`: each one's meta file follows its
 * Luau, and in Dynamic mode each is compiled where it is now.
 */
export async function afterMove(
	project: OpenProject,
	from: string,
	to: string,
	before: ReadonlyMap<string, string>,
): Promise<void> {
	const source = toPosix(from);
	for (const [graph, output] of before) {
		const moved = to + graph.slice(source.length);
		const now = await graphOutputPath(project, moved).catch(() => null);
		if (now && now !== output) await moveMetaFile(project, output, now);
		if (project.config.compileMode === "hot") await compileScript(project, moved, { write: true });
	}
}

/**
 * Deletes a graph or a folder of them, and the Luau they wrote: only files
 * whose header says Roswaal wrote them, as Remove orphans does. Then a script
 * left with no children is flattened, when the project asks for that.
 */
export async function deleteGraphs(
	project: OpenProject,
	relPath: string,
): Promise<Flattened | undefined> {
	const outputs = await outputsOf(project, await graphsUnder(project, relPath));
	await deleteEntry(project, relPath);
	await removeOutputs(project, [...outputs.values()]);
	return flattenIfEmpty(project, path.posix.dirname(toPosix(relPath)));
}

/**
 * With `flattenEmptyScripts` on, a script whose last child has gone becomes a
 * plain graph again: `Config/init.nodescript` back to `Config.nodescript`,
 * and its meta file and, in Dynamic mode, its Luau with it. Only when the
 * folder holds the init graph and nothing else.
 */
export async function flattenIfEmpty(
	project: OpenProject,
	dir: string,
): Promise<Flattened | undefined> {
	if (project.config.flattenEmptyScripts !== true) return undefined;
	const folder = toPosix(dir);
	const entries = await fs.readdir(safeJoin(project.root, folder)).catch(() => null);
	if (!entries || entries.length !== 1 || entries[0] !== "init.nodescript") return undefined;
	const from = `${folder}/init.nodescript`;
	const to = `${folder}.nodescript`;
	if (await exists(entryPath(project.root, to))) return undefined;

	const before = await graphOutputPath(project, from).catch(() => null);
	await fs.rename(entryPath(project.root, from), entryPath(project.root, to));
	await fs
		.rm(entryPath(project.root, folder), { recursive: true, force: true })
		.catch(() => undefined);
	const after = await graphOutputPath(project, to).catch(() => null);
	if (before && after) await moveMetaFile(project, before, after);
	if (project.config.compileMode === "hot") await compileScript(project, to, { write: true });
	return { from, to };
}

/**
 * Moves the Rojo meta file beside a graph's Luau to follow it:
 * `Foo.meta.json` beside `Foo.server.luau` becomes `Foo/init.meta.json`
 * when the graph becomes its folder's init, and back. One already where it is
 * going is left alone.
 */
export async function moveMetaFile(project: OpenProject, from: string, to: string): Promise<void> {
	const meta = (luau: string) => luau.replace(/(\.server|\.client)?\.luau$/, ".meta.json");
	const source = safeJoin(project.root, meta(from));
	const dest = safeJoin(project.root, meta(to));
	if (source === dest || !(await exists(source)) || (await exists(dest))) return;
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.rename(source, dest);
}

/** A project path spelled one way: forward slashes, no `./`, no trailing slash. */
function tidy(p: string): string {
	return toPosix(p).replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * After a folder of graphs moved from `from` to `to`, the node maps that
 * sync its Luau follow it, so Rojo still finds the files and Studio puts them
 * where the folder now is:
 *
 * - every entry whose path is the old folder, or inside it, takes the new one;
 * - the folder's own entry moves under the entry for where it went: one whose
 *   path is that folder, or a service listed with none whose folder it is;
 * - where the place it went is already synced by a folder around it, a Folder
 *   entry would sync it twice, so it goes: Rojo picks it up from there;
 * - and the other way: a folder that had no entry, synced by a folder around
 *   it, gets one where it goes if nothing there syncs it.
 *
 * Each map that changed is compiled, which writes the Rojo project. Answers
 * the maps it changed.
 */
export async function followMaps(
	project: OpenProject,
	from: string,
	to: string,
): Promise<string[]> {
	const source = tidy(project.config.sourceDir);
	const out = tidy(project.config.outDir);
	const was = tidy(from);
	const now = tidy(to);
	if (!was.startsWith(`${source}/`) || !now.startsWith(`${source}/`)) return [];
	const oldOut = out + was.slice(source.length);
	const newOut = out + now.slice(source.length);
	const dest = path.posix.dirname(newOut);
	const changed: string[] = [];

	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (!map || isFilesystemMap(map)) continue;

		let touched = false;
		let own: { node: MapNode; parent: MapNode } | null = null;
		const visit = (node: MapNode, parent: MapNode | null) => {
			if (node.path) {
				const at = tidy(node.path);
				if (at === oldOut || at.startsWith(`${oldOut}/`)) {
					node.path = newOut + at.slice(oldOut.length);
					touched = true;
					if (at === oldOut && parent) own = { node, parent };
				}
			}
			for (const child of node.children) visit(child, node);
		};
		visit(map.root, null);

		const found = own as { node: MapNode; parent: MapNode } | null;
		const home = homeFor(map.root, dest, out, found?.node);
		const covered = coveredBy(map.root, dest, found?.node);
		if (found) {
			const { node, parent } = found;
			const detach = () => {
				parent.children = parent.children.filter((c) => c !== node);
			};
			if (covered && (!node.className || node.className === "Folder")) detach();
			else if (home && home !== parent) {
				detach();
				home.children.push(node);
			}
		} else if (!touched) {
			// Synced only by a folder around it, and going where nothing syncs it.
			if (!coveredBy(map.root, path.posix.dirname(oldOut)) || covered || !home) continue;
			home.children.push({
				id: globalThis.crypto.randomUUID(),
				name: path.posix.basename(newOut),
				className: "Folder",
				path: newOut,
				children: [],
			});
		}

		await writeMap(project, mapPath, map);
		await compileMap(project, mapPath, { write: true, sync: true });
		changed.push(mapPath);
	}
	// The old folder is no map's now: take it away if it is empty.
	if (changed.length > 0) await removeEmptyFolders(project, `${oldOut}/-`);
	return changed;
}

/** Whether an entry's path, other than `except`'s, is `dir` or a folder around it. */
function coveredBy(root: MapNode, dir: string, except?: MapNode): boolean {
	let found = false;
	const look = (n: MapNode) => {
		if (n !== except && n.path) {
			const at = tidy(n.path);
			if (dir === at || dir.startsWith(`${at}/`)) found = true;
		}
		for (const child of n.children) look(child);
	};
	look(root);
	return found;
}

/**
 * The entry a folder in `dest` belongs under: the one whose path is `dest`,
 * or a service listed with no path whose folder `dest` is.
 */
function homeFor(root: MapNode, dest: string, out: string, except?: MapNode): MapNode | null {
	let home: MapNode | null = null;
	const look = (n: MapNode, depth: number) => {
		if (n !== except && n.path && tidy(n.path) === dest) home = n;
		if (depth === 1 && !n.path && `${out}/${n.name}` === dest) home = n;
		for (const child of n.children) look(child, depth + 1);
	};
	look(root, 0);
	return home;
}
