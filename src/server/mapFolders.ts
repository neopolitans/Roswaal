/**
 * The folders a node map syncs, made on disk when the map is compiled.
 *
 * A map points instances at folders under the output directory --
 * ReplicatedStorage at `src/ReplicatedStorage` -- and graphs reach those
 * folders by sitting in the same folder under the graphs directory. Neither
 * folder exists until something puts it there, so a map that names a service
 * left the author making both by hand before a graph could go in it. Compiling
 * the map makes them: the output folder, so Rojo has something to sync, and
 * its mirror, so there is somewhere to put the graphs.
 */

import { isFilesystemMap, type MapNode, type NodeMap } from "../core/nodemap.js";
import type { OpenProject } from "./config.js";
import { collectMaps, collectScripts, readMap } from "./documents.js";
import { walkFiles } from "./files.js";
import { fs, path } from "./host.js";
import { readManifest } from "./manifest.js";
import { graphOutputPath } from "./outputs.js";
import { safeJoin, tidyPath, toPosix } from "./paths.js";

/** A folder a map syncs, and the folder under the graphs directory mirroring it. */
export interface SyncedFolder {
	output: string;
	graphs: string;
}

/**
 * Every folder under the output directory a Roblox map points an instance at,
 * with its mirror. A path with an extension is a file, and a path outside the
 * output directory is not Roswaal's to make -- `Packages` is Wally's. A Lune
 * map names files rather than pointing at them, and has none.
 */
export function syncedFolders(project: OpenProject, map: NodeMap): SyncedFolder[] {
	const out = new Map<string, SyncedFolder>();
	for (const entry of syncedEntries(project, map)) out.set(entry.folder.output, entry.folder);
	return [...out.values()];
}

/** A folder under the output directory, with its mirror; null for anything else. */
function folderAt(project: OpenProject, at: string): SyncedFolder | null {
	const outDir = tidyPath(project.config.outDir);
	const sourceDir = tidyPath(project.config.sourceDir);
	const last = at.split("/").pop() ?? "";
	const within =
		at === outDir ? "" : at.startsWith(`${outDir}/`) ? at.slice(outDir.length + 1) : undefined;
	if (within === undefined || last.includes(".")) return null;
	return { output: at, graphs: within === "" ? sourceDir : path.posix.join(sourceDir, within) };
}

/** One map entry's synced folder, by the entry's id and its place in the tree. */
interface SyncedEntry {
	id: string;
	name: string;
	/** The instance names from the root down, as a Rojo project nests them. */
	trail: string[];
	folder: SyncedFolder;
}

function syncedEntries(project: OpenProject, map: NodeMap): SyncedEntry[] {
	if (isFilesystemMap(map)) return [];
	const out: SyncedEntry[] = [];
	const visit = (node: MapNode, trail: string[]) => {
		if (node.path) {
			const folder = folderAt(project, tidyPath(node.path));
			if (folder) out.push({ id: node.id, name: node.name, trail, folder });
		}
		for (const child of node.children) visit(child, [...trail, child.name]);
	};
	visit(map.root, []);
	return out;
}

/**
 * Makes the folders `syncedFolders` names that are not on disk yet. Returns
 * what it made, project-relative, so the caller can say so.
 */
export async function makeSyncedFolders(project: OpenProject, map: NodeMap): Promise<string[]> {
	const made: string[] = [];
	for (const folder of syncedFolders(project, map)) {
		for (const rel of [folder.output, folder.graphs]) {
			const abs = safeJoin(project.root, rel);
			if (await fs.stat(abs).catch(() => null)) continue;
			await fs.mkdir(abs, { recursive: true });
			made.push(toPosix(rel));
		}
	}
	return made;
}

/** The output folders any map in the project syncs, which tidying up must leave. */
export async function mappedOutputFolders(project: OpenProject): Promise<Set<string>> {
	const out = new Set<string>();
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map) for (const folder of syncedFolders(project, map)) out.add(folder.output);
	}
	return out;
}

// ---------------------------------------------------------------------------
// A path that moved, and graphs that nothing syncs
// ---------------------------------------------------------------------------

/** A synced folder whose map entry now points somewhere else. */
export interface FolderMove {
	/** The entry's name, as the map shows it. */
	name: string;
	from: SyncedFolder;
	to: SyncedFolder;
	/** Not moved: the new folder already holds files, and moving into it was not asked for. */
	held?: boolean;
	/** The graphs now in the new folder, project-relative, to compile there. */
	graphs: string[];
	/** Files left where they were, because the new folder had one of the same name. */
	kept: string[];
}

/** What the folders were before, by entry id: the manifest's record, or the project file's. */
async function lastSynced(
	project: OpenProject,
	mapPath: string,
	map: NodeMap,
): Promise<Record<string, string>> {
	const recorded = (await readManifest(project.root)).synced?.[mapPath];
	if (recorded) return recorded;
	// Compiled before this record was kept: what the project file says each
	// instance synced, matched to the entries by where they sit in the tree.
	const before: Record<string, string> = {};
	const raw = await fs.readFile(safeJoin(project.root, map.output ?? ""), "utf8").catch(() => null);
	let tree: unknown;
	try {
		tree = raw === null ? undefined : (JSON.parse(raw) as { tree?: unknown }).tree;
	} catch {
		return before;
	}
	for (const entry of syncedEntries(project, map)) {
		let at: unknown = tree;
		for (const name of entry.trail)
			at = at && typeof at === "object" ? (at as Record<string, unknown>)[name] : undefined;
		const was = at && typeof at === "object" ? (at as { $path?: unknown }).$path : undefined;
		if (typeof was === "string") before[entry.id] = tidyPath(was);
	}
	return before;
}

/** Whether a folder holds any file, however deep. */
async function holdsFiles(project: OpenProject, rel: string): Promise<boolean> {
	return (await walkFiles(project.root, { from: rel })).length > 0;
}

/** Removes the folders under and including `abs` that hold nothing. */
async function pruneEmpty(abs: string): Promise<void> {
	const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => null);
	if (entries === null) return;
	for (const entry of entries)
		if (entry.isDirectory()) await pruneEmpty(path.join(abs, entry.name));
	const left = await fs.readdir(abs).catch(() => null);
	if (left !== null && left.length === 0) await fs.rm(abs, { recursive: true, force: true });
}

/**
 * Moves one folder to where its entry now points. Into a folder that is not
 * there, or holds nothing, it is one rename; into one with files, each file
 * goes across unless one of its name is already there, which is kept where
 * it was and listed. Returns what was kept.
 */
async function moveFolder(project: OpenProject, from: string, to: string): Promise<string[]> {
	const source = safeJoin(project.root, from);
	const target = safeJoin(project.root, to);
	if (!(await fs.stat(source).catch(() => null))) return [];
	if (!(await holdsFiles(project, to))) {
		await fs.rm(target, { recursive: true, force: true });
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.rename(source, target);
		return [];
	}
	const kept: string[] = [];
	for (const file of await walkFiles(project.root, { from })) {
		const rest = file.path.slice(toPosix(from).length + 1);
		const dest = safeJoin(project.root, path.posix.join(to, rest));
		if (await fs.stat(dest).catch(() => null)) {
			kept.push(file.path);
			continue;
		}
		await fs.mkdir(path.dirname(dest), { recursive: true });
		await fs.rename(file.abs, dest);
	}
	await pruneEmpty(source);
	return kept;
}

/**
 * Moves a synced folder to follow its map entry's new path: the output
 * folder, so what Rojo syncs is still the scripts, and its mirror under the
 * graphs directory, so the graphs go on compiling there.
 *
 * Matched by the entry's id, so renaming an entry and changing its path at
 * once still moves its folder. Nothing moves where the old folder is still
 * another entry's, where one folder is inside the other, or where there is
 * nothing in it. A new folder that already holds files is held unless `merge`
 * says to move into it. Returns the moves, and the folders to record as this
 * compile's -- with a held entry's old folder kept, so it can still be moved.
 */
export async function moveSyncedFolders(
	project: OpenProject,
	mapPath: string,
	map: NodeMap,
	merge = false,
): Promise<{ moves: FolderMove[]; synced: Record<string, string> }> {
	const before = await lastSynced(project, mapPath, map);
	const entries = syncedEntries(project, map);
	const taken = new Set(entries.map((entry) => entry.folder.output));
	const inside = (a: string, b: string) => a === b || a.startsWith(`${b}/`);
	const synced: Record<string, string> = {};
	const moves: FolderMove[] = [];

	for (const entry of entries) {
		synced[entry.id] = entry.folder.output;
		const was = before[entry.id];
		if (was === undefined || was === entry.folder.output) continue;
		const from = folderAt(project, was);
		const to = entry.folder;
		if (!from || taken.has(from.output)) continue;
		if (inside(to.output, from.output) || inside(from.output, to.output)) continue;
		const there =
			(await holdsFiles(project, from.output)) || (await holdsFiles(project, from.graphs));
		if (!there) continue;

		const busy = (await holdsFiles(project, to.output)) || (await holdsFiles(project, to.graphs));
		if (busy && !merge) {
			moves.push({ name: entry.name, from, to, held: true, graphs: [], kept: [] });
			synced[entry.id] = was;
			continue;
		}
		const graphs = (await walkFiles(project.root, { from: from.graphs }))
			.filter((file) => file.name.endsWith(".nodescript"))
			.map((file) => path.posix.join(to.graphs, file.path.slice(from.graphs.length + 1)));
		const kept = [
			...(await moveFolder(project, from.output, to.output)),
			...(await moveFolder(project, from.graphs, to.graphs)),
		];
		moves.push({
			name: entry.name,
			from,
			to,
			graphs: graphs.filter((graph) => !kept.includes(graph.replace(to.graphs, from.graphs))),
			kept,
		});
	}
	return { moves, synced };
}

/**
 * Graphs whose Luau goes to a folder no node map syncs, with that folder.
 *
 * Rojo never sees them: a mapping removed, or a graph made outside every
 * synced folder. Only where the project has a Roblox map to judge by -- a
 * project syncing through a hand-written project file, or a Lune one, has no
 * say here.
 */
export async function unsyncedGraphs(
	project: OpenProject,
): Promise<{ graph: string; folder: string }[]> {
	const folders: string[] = [];
	let judged = false;
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (!map || isFilesystemMap(map)) continue;
		judged = true;
		for (const folder of syncedFolders(project, map)) folders.push(folder.output);
	}
	if (!judged) return [];
	const out: { graph: string; folder: string }[] = [];
	for (const graph of await collectScripts(project)) {
		const output = await graphOutputPath(project, graph);
		if (output === null) continue;
		const folder = path.posix.dirname(output);
		if (!folders.some((f) => folder === f || folder.startsWith(`${f}/`)))
			out.push({ graph, folder });
	}
	return out;
}
