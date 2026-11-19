/**
 * What the map editor knows about folders on disk, read from the project tree.
 *
 * A map names folders; the tree says what is in them. The editor asks three
 * things of it: what is at a mapping's path (some files, nothing, not there
 * yet), which folders sit under a synced one, and every folder under the
 * output folder for its view from that end. Graph folders count as the output
 * folders they compile to, because that is where a graph's Luau will land.
 */

import { normalisePath } from "../core/rojoPaths.js";
import type { TreeEntry } from "./api.js";

export function entryAt(tree: readonly TreeEntry[], path: string): TreeEntry | undefined {
	const at = normalisePath(path);
	for (const one of tree) {
		if (one.path === at) return one;
		if (one.children && at.startsWith(`${one.path}/`)) {
			const found = entryAt(one.children, at);
			if (found) return found;
		}
	}
	return undefined;
}

/** Files under a folder, all the way down. */
export function filesUnder(entry: TreeEntry): number {
	let count = 0;
	for (const one of entry.children ?? []) {
		count += one.kind === "directory" ? filesUnder(one) : 1;
	}
	return count;
}

/** A folder of Luau that is a script rather than a Folder: its `init` names it. */
const isScriptFolder = (entry: TreeEntry): boolean =>
	entry.script !== undefined || entry.role === "script";

const within = (path: string, dir: string): string | undefined => {
	const at = normalisePath(path);
	const base = normalisePath(dir);
	if (at === base) return "";
	return at.startsWith(`${base}/`) ? at.slice(base.length + 1) : undefined;
};

/** The graph folder that mirrors an output folder; undefined outside the output folder. */
export function graphFolderOf(path: string, outDir: string, sourceDir: string): string | undefined {
	const rest = within(path, outDir);
	if (rest === undefined) return undefined;
	return rest === "" ? normalisePath(sourceDir) : `${normalisePath(sourceDir)}/${rest}`;
}

/** The output folder a graph folder compiles to; the path itself for anything else. */
export function outputFolderOf(path: string, outDir: string, sourceDir: string): string {
	const rest = within(path, sourceDir);
	if (rest === undefined) return normalisePath(path);
	return rest === "" ? normalisePath(outDir) : `${normalisePath(outDir)}/${rest}`;
}

/** What is at a mapping's path. */
export type FolderState =
	| { kind: "files"; count: number }
	| { kind: "empty" }
	| { kind: "file" }
	/** Under the output folder and not made yet: compiling the map makes it. */
	| { kind: "pending" }
	/** Not there, and nothing will make it: Rojo builds an empty instance. */
	| { kind: "missing" };

export function folderState(
	tree: readonly TreeEntry[],
	path: string,
	outDir: string,
	sourceDir: string,
): FolderState {
	const entry = entryAt(tree, path);
	if (entry) {
		if (entry.kind !== "directory") return { kind: "file" };
		const count = filesUnder(entry);
		if (count > 0) return { kind: "files", count };
		// A graph folder with graphs in it fills the output folder when it compiles.
		const graphs = graphFolderOf(path, outDir, sourceDir);
		const mirror = graphs === undefined ? undefined : entryAt(tree, graphs);
		const waiting = mirror ? filesUnder(mirror) : 0;
		return waiting > 0 ? { kind: "files", count: waiting } : { kind: "empty" };
	}
	const at = normalisePath(path);
	const last = at.split("/").pop() ?? "";
	return within(at, outDir) !== undefined && !last.includes(".")
		? { kind: "pending" }
		: { kind: "missing" };
}

/** Folder names directly under an entry, scripts left out. */
const folderNames = (entry: TreeEntry | undefined): string[] =>
	(entry?.children ?? [])
		.filter((one) => one.kind === "directory" && !isScriptFolder(one))
		.map((one) => one.name);

/**
 * The folders under an output folder: those on disk, and graph folders that
 * will be once their graphs compile. By name, sorted.
 */
export function foldersUnder(
	tree: readonly TreeEntry[],
	folder: string,
	outDir: string,
	sourceDir: string,
): string[] {
	const names = new Set(folderNames(entryAt(tree, folder)));
	const graphs = graphFolderOf(folder, outDir, sourceDir);
	if (graphs !== undefined) for (const name of folderNames(entryAt(tree, graphs))) names.add(name);
	return [...names].sort((a, b) => a.localeCompare(b));
}

/** Whether a folder is on disk now, as itself or as the graph folder that becomes it. */
export function folderExists(
	tree: readonly TreeEntry[],
	folder: string,
	outDir: string,
	sourceDir: string,
): boolean {
	if (entryAt(tree, folder)) return true;
	const graphs = graphFolderOf(folder, outDir, sourceDir);
	return graphs !== undefined && entryAt(tree, graphs) !== undefined;
}
