/**
 * Finding an entry in the project tree the daemon sends.
 */

import type { TreeEntry } from "./api.js";

/** The entry at a project-relative path, anywhere in the tree. */
export function findTreeEntry(tree: readonly TreeEntry[], path: string): TreeEntry | undefined {
	for (const entry of tree) {
		if (entry.path === path) return entry;
		if (entry.children && path.startsWith(entry.path + "/")) {
			const found = findTreeEntry(entry.children, path);
			if (found) return found;
		}
	}
	return undefined;
}
