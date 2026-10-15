/**
 * Hand-written Luau among some paths in the project tree, a folder giving
 * everything under it: what Import as graphs takes. Wally's folders are
 * someone else's code, and generated files are Roswaal's own.
 *
 * Shared by the tree's Import folder as graphs and by importing a whole Rojo
 * project, so the two agree on what a folder holds.
 */

import type { TreeEntry } from "./api.js";

export function importableLuau(
	tree: readonly TreeEntry[],
	paths: ReadonlySet<string>,
): TreeEntry[] {
	const out: TreeEntry[] = [];
	const visit = (entry: TreeEntry, inside: boolean) => {
		if (entry.role === "packages") return;
		const taken = inside || paths.has(entry.path);
		if (taken && entry.kind === "luau" && !entry.generatedFrom && !out.includes(entry))
			out.push(entry);
		for (const child of entry.children ?? []) visit(child, taken);
	};
	for (const entry of tree) visit(entry, false);
	return out;
}
