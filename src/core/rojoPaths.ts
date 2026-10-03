/**
 * Rojo's naming rules, written once: which instance a file on disk becomes,
 * which file an instance is written to, and how a node map's paths are read.
 *
 * - `Name.server.luau` is a Script called `Name`, `.client.luau` a
 *   LocalScript, a bare `.luau` (or `.lua`) a ModuleScript.
 * - `init.*` is the folder it sits in: it adds no name of its own.
 * - A node map's `path` is a disk path, written with either slash; the
 *   deepest one a file is under says where in the DataModel it lands.
 *
 * The node map, the daemon's require resolver, the place import and the place
 * export each needed these, and each had its own copy. What they share is
 * here; what only one of them knows -- a package folder's own project file,
 * read off the disk -- stays with it.
 */

import type { MapNode } from "./nodemap.js";

export type ScriptClass = "Script" | "LocalScript" | "ModuleScript";

/** What follows a script's name in the file Rojo reads it from: `.server.luau` for a Script. */
export function scriptSuffix(className: string): string {
	if (className === "Script") return ".server.luau";
	return className === "LocalScript" ? ".client.luau" : ".luau";
}

/** A path as one spelling: forward slashes, no leading `./`, no trailing slash. */
export function normalisePath(value: string): string {
	return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/** The class Rojo makes of a script file, from its name. */
export function scriptClassOf(fileName: string): ScriptClass {
	const base = fileName.replace(/\.(luau|lua|nodescript)$/i, "");
	if (/\.server$/i.test(base)) return "Script";
	if (/\.client$/i.test(base)) return "LocalScript";
	return "ModuleScript";
}

/** Whether the file is a ModuleScript, and so can be required. */
export function isModuleFile(fileName: string): boolean {
	return scriptClassOf(fileName) === "ModuleScript";
}

/**
 * The instance name a script file takes: its name less the extension and
 * the run context. `init` is the folder it sits in, so it names nothing.
 */
export function instanceNameOf(fileName: string): string | undefined {
	const stem = fileName.replace(/\.(luau|lua|nodescript)$/i, "").replace(/\.(server|client)$/i, "");
	return stem.toLowerCase() === "init" ? undefined : stem;
}

/** A node map node with a disk path: the instance names down to it, and the path it maps. */
export interface MappedPath {
	segments: string[];
	/** Normalised. */
	base: string;
}

/** Every node with a path under `root`, by the names down to it. The root itself adds no name. */
export function mappedPaths(root: MapNode): MappedPath[] {
	const out: MappedPath[] = [];
	const visit = (node: MapNode, trail: string[]) => {
		const here = node === root ? trail : [...trail, node.name];
		if (node.path) out.push({ segments: here, base: normalisePath(node.path) });
		for (const child of node.children) visit(child, here);
	};
	visit(root, []);
	return out;
}

/** Where a file lands under the mappings: the deepest one it is inside, and the parts below it. */
export interface Located extends MappedPath {
	/** The folders between the mapping and the file. */
	parts: string[];
	/** The file's own name, or undefined when the file is the mapping itself. */
	leaf?: string;
}

/** The deepest mapping `file` is inside, or undefined when none holds it. */
export function locateUnder(mapped: readonly MappedPath[], file: string): Located | undefined {
	const target = normalisePath(file);
	let best: MappedPath | undefined;
	for (const candidate of mapped) {
		const inside = target === candidate.base || target.startsWith(`${candidate.base}/`);
		if (inside && (!best || candidate.base.length > best.base.length)) best = candidate;
	}
	if (!best) return undefined;
	const parts = target === best.base ? [] : target.slice(best.base.length + 1).split("/");
	const leaf = parts.pop();
	return { ...best, parts, ...(leaf === undefined ? {} : { leaf }) };
}
