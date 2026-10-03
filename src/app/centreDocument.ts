/**
 * The documents the editor's centre can hold besides a graph.
 *
 * A graph lives in the store, with undo and selection. These do not: a node
 * map is a tree, a `.luaurc` an alias table, and neither has anything for undo
 * or selection to act on.
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
