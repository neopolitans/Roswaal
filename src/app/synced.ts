/**
 * Whether something made in a folder reaches Studio: whether a node map
 * syncs that folder or one around it. The tree carries the answer already --
 * each folder a map syncs has `syncedBy`, in the output and in the graphs
 * that mirror it -- so this only walks down to the folder.
 */

import type { TreeEntry } from "./api.js";

/** Whether any map writes a project file. Before one does, nothing syncs anywhere. */
function anyMapWrites(entries: readonly TreeEntry[]): boolean {
	return entries.some(
		(e) =>
			(e.kind === "nodemap" && e.mapFacts?.output !== undefined) || anyMapWrites(e.children ?? []),
	);
}

/** Whether `dir`, or a folder around it, is synced by a node map. */
export function syncedFolder(tree: readonly TreeEntry[], dir: string): boolean {
	let level: readonly TreeEntry[] = tree;
	const parts = dir.split("/").filter(Boolean);
	for (let i = 1; i <= parts.length; i++) {
		const at = parts.slice(0, i).join("/");
		const entry = level.find((e) => e.path === at);
		if (!entry) return false;
		if (entry.syncedBy !== undefined) return true;
		level = entry.children ?? [];
	}
	return false;
}

/**
 * The warning a New folder or New graph dialog shows when what it makes in
 * `dir` would not reach Studio; undefined where it would, or while no map
 * writes a project file.
 */
export function unsyncedWarning(tree: readonly TreeEntry[], dir: string): string | undefined {
	if (!anyMapWrites(tree) || syncedFolder(tree, dir)) return undefined;
	return "No node map syncs this folder, so Rojo will not see what you make here.";
}
