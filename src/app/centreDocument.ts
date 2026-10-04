/**
 * The documents the editor's centre can hold besides a graph.
 *
 * A graph lives in the store, with undo and selection. These do not: a node
 * map is a tree, a `.luaurc` an alias table, a Luau file is read-only text, and
 * none has anything for undo or selection to act on. Each still has a tab of
 * its own, which the store keeps beside the graphs' -- see `SideDocument`.
 */

import type { LuaurcSource } from "../core/luaurc.js";
import type { NodeMap } from "../core/nodemap.js";

/** A node map open in the centre, and whether it has edits not on disk. */
export interface MapDocument {
	path: string;
	map: NodeMap;
	dirty: boolean;
}

/** A `.luaurc` open in the centre, with every one above it that it inherits from. */
export interface LuaurcDocument {
	dir: string;
	files: LuaurcSource[];
}

/** A Luau file open in the centre. */
export interface SourceDoc {
	path: string;
	text: string;
	/** The graph this was compiled from, when Roswaal wrote it. */
	generatedFrom?: string;
}

/** What a tab that is not a graph holds. */
export type SideDocument =
	| { kind: "map"; doc: MapDocument }
	| { kind: "luau"; doc: SourceDoc }
	| { kind: "luaurc"; doc: LuaurcDocument };

/** The file a side document's tab stands for: what closes it when the file goes. */
export function sidePath(side: SideDocument): string {
	if (side.kind === "luaurc") return side.doc.dir ? `${side.doc.dir}/.luaurc` : ".luaurc";
	return side.doc.path;
}

/**
 * What a side document's tab is called: its file's name, as the tree shows it.
 * A map by its file without `.nodemap`, not the project name inside it, which
 * is often the same in every map of a project.
 */
export function sideName(side: SideDocument): string {
	const file = sidePath(side).split("/").pop() ?? "";
	return side.kind === "map" ? file.replace(/\.nodemap$/, "") : file;
}
