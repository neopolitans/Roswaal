/**
 * What the Project panel's menus offer, row by row, as data.
 *
 * `ProjectTree.tsx` attaches what each entry does; the front page's tour draws
 * the same lists. One source, so the tour's menus cannot drift from the
 * editor's: an entry added here appears in both, in the same place.
 */

import type { IconName } from "./icons.jsx";

/** What an entry does, which the tree maps to its own handler. */
export type TreeAction =
	| "packageZip"
	| "wally"
	| "zip"
	| "github"
	| "removePackage"
	| "newGraph"
	| "newMap"
	| "import"
	| "importMany"
	| "newFolder"
	| "reveal"
	| "rename"
	| "delete";

export interface TreeMenuEntry {
	action: TreeAction;
	label: string;
	icon: IconName;
	/** Destroys something: drawn in red, in the last section. */
	danger?: true;
	disabled?: boolean;
	/** Why it is disabled, when it is. */
	title?: string;
}

/** What this host can do, and where the row sits. */
export interface TreeMenuContext {
	/** The row's folder is one graphs are made in. */
	holdsGraphs: boolean;
	/** The host imports Luau as a graph. */
	canImport: boolean;
	/**
	 * Several rows are selected, this one among them, or the row is a folder,
	 * and hand-written Luau is in it: how many files Import as graphs takes.
	 */
	importMany?: { from: "selection" | "folder"; files: number };
	canGithub: boolean;
	canReveal: boolean;
	/** Said on an entry this host cannot do. */
	notHere: string;
}

const present = <T>(entries: (T | false | undefined)[]): T[] =>
	entries.filter((e): e is T => e !== false && e !== undefined);

/** `wally.toml`, or a package listed under it. */
export function packageMenu(
	entry: { kind: string; missing?: boolean },
	ctx: Pick<TreeMenuContext, "canGithub" | "notHere">,
): TreeMenuEntry[][] {
	return [
		present([
			entry.kind === "package" &&
				entry.missing && { action: "packageZip", label: "Insert its zip…", icon: "folderOpen" },
		]),
		[
			{ action: "wally", label: "Add from Wally…", icon: "instance" },
			{ action: "zip", label: "Insert package zip…", icon: "folderOpen" },
			{
				action: "github",
				label: "Insert GitHub repo…",
				icon: "external",
				...(ctx.canGithub ? {} : { disabled: true, title: ctx.notHere }),
			},
		],
		// Last, as every menu's red entry is.
		present([
			entry.kind === "package" && {
				action: "removePackage",
				label: "Remove package…",
				icon: "remove",
				danger: true,
			},
		]),
	];
}

/**
 * Any other row: making things first, then finding them, then changing and
 * destroying them. A menu opened on a folder is nearly always opened to put
 * something in it.
 */
export function fileMenu(
	entry: { kind: string; generatedFrom?: string; graph?: string },
	ctx: TreeMenuContext,
): TreeMenuEntry[][] {
	return [
		present([
			ctx.holdsGraphs && { action: "newGraph", label: "New graph here", icon: "newFile" },
			ctx.holdsGraphs && { action: "newMap", label: "New map here", icon: "map" },
			ctx.canImport &&
				entry.kind === "luau" &&
				!entry.generatedFrom && {
					action: "import",
					// Imported already, and still written by hand: imported again
					// over that graph, to try another setting.
					label: entry.graph ? "Reimport as graph" : "Import as graph",
					icon: "graph",
				},
			ctx.canImport &&
				ctx.importMany &&
				ctx.importMany.files > 0 && {
					action: "importMany",
					label:
						ctx.importMany.from === "selection"
							? "Import selection as graphs"
							: "Import folder as graphs",
					icon: "graph",
				},
			{ action: "newFolder", label: "New folder", icon: "newFolder" },
		]),
		[
			{
				action: "reveal",
				label: "Show in file manager",
				icon: "external",
				...(ctx.canReveal ? {} : { disabled: true, title: ctx.notHere }),
			},
		],
		[
			{ action: "rename", label: "Rename", icon: "rename" },
			{ action: "delete", label: "Delete", icon: "remove", danger: true },
		],
	];
}
