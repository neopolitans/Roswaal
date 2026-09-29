/**
 * A Rojo project file, read into a node map: the other direction of
 * `compileNodeMap`.
 *
 * A Rojo-managed project already says where everything lives, in
 * `default.project.json`, and a node map is Roswaal's way of saying the same
 * thing. Rebuilding that tree by hand to start using Roswaal is exactly the
 * kind of copying a map exists to end, so it is read instead.
 *
 * Nothing is dropped. What a map models -- `$className`, `$path`,
 * `$properties`, `$ignoreUnknownInstances`, `globIgnorePaths` -- becomes map
 * fields; anything else rides along in `rojo` and is written back unchanged,
 * and a `$className` Rojo could have worked out is kept as written. So
 * compiling the map gives back the same project, which `sameProject` checks
 * before the file is taken over.
 */

import { SCHEMA_VERSION } from "./schema.js";
import type { MapNode, NodeMap } from "./nodemap.js";

export interface RojoImport {
	map: NodeMap;
	/** What the import could not read as a project, instance by instance. */
	problems: string[];
}

/** Keys of a project node a map models; anything else starting `$` rides along. */
const MODELLED = new Set(["$className", "$path", "$properties", "$ignoreUnknownInstances"]);

/** Top-level keys a map models. */
const MODELLED_TOP = new Set(["name", "tree", "globIgnorePaths"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `json` is the parsed project file; `output` is where it lives, which becomes
 * the map's output so compiling writes the same file.
 */
export function projectToMap(
	json: unknown, opts: { output: string; fallbackName: string; makeId: () => string },
): RojoImport {
	const problems: string[] = [];
	if (!isObject(json) || !isObject(json.tree)) {
		return { map: emptyImport(opts), problems: ["It has no `tree`, so it is not a Rojo project file."] };
	}

	const rojo: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(json)) if (!MODELLED_TOP.has(key)) rojo[key] = value;

	/** `service`: directly under a DataModel root, where Rojo names a service by its key. */
	const read = (raw: Record<string, unknown>, name: string, where: string, isRoot: boolean, service: boolean): MapNode => {
		const node: MapNode = { id: opts.makeId(), name, children: [] };
		const extra: Record<string, unknown> = {};
		const className = raw.$className;
		if (typeof className === "string") {
			// A service named by its key needs no class; one given anyway is
			// kept as said.
			if (service && className === name) {
				node.statedClass = true;
			} else {
				node.className = className;
				if (className === "Folder" && typeof raw.$path === "string") node.statedClass = true;
			}
		} else if (className !== undefined) {
			extra.$className = className;
		}
		if (typeof raw.$path === "string") node.path = raw.$path;
		else if (raw.$path !== undefined) extra.$path = raw.$path;
		if (isObject(raw.$properties)) node.properties = raw.$properties;
		else if (raw.$properties !== undefined) extra.$properties = raw.$properties;
		if (raw.$ignoreUnknownInstances === true) node.ignoreUnknown = true;
		else if (raw.$ignoreUnknownInstances !== undefined) extra.$ignoreUnknownInstances = raw.$ignoreUnknownInstances;

		for (const [key, value] of Object.entries(raw)) {
			if (key.startsWith("$")) {
				if (!MODELLED.has(key)) extra[key] = value;
				continue;
			}
			if (!isObject(value)) {
				problems.push(`${where}.${key} is not an instance, so it is kept as it was.`);
				extra[key] = value;
				continue;
			}
			node.children.push(read(value, key, `${where}.${key}`, false, isRoot && node.className === "DataModel"));
		}
		if (Object.keys(extra).length > 0) node.rojo = extra;
		return node;
	};

	const tree = json.tree as Record<string, unknown>;
	const root = read(tree, "DataModel", "tree", true, false);
	// A model project's root is not a DataModel; the map names it after the project.
	if (root.className !== "DataModel") root.name = typeof json.name === "string" ? json.name : opts.fallbackName;

	const map: NodeMap = {
		schemaVersion: SCHEMA_VERSION,
		kind: "map",
		id: opts.makeId(),
		name: typeof json.name === "string" && json.name !== "" ? json.name : opts.fallbackName,
		output: opts.output,
		root,
		...(Array.isArray(json.globIgnorePaths) ? { globIgnorePaths: json.globIgnorePaths as string[] } : {}),
		...(Object.keys(rojo).length > 0 ? { rojo } : {}),
	};
	return { map, problems };
}

function emptyImport(opts: { output: string; fallbackName: string; makeId: () => string }): NodeMap {
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "map",
		id: opts.makeId(),
		name: opts.fallbackName,
		output: opts.output,
		root: { id: opts.makeId(), name: "DataModel", className: "DataModel", children: [] },
	};
}

/**
 * Whether two project files say the same thing to Rojo: equal as JSON, with
 * key order and formatting set aside -- a node's children included, since the
 * order of keys is not an order Rojo gives the instances.
 */
export function sameProject(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) || Array.isArray(b)) {
		return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameProject(v, b[i]));
	}
	if (isObject(a) && isObject(b)) {
		const keys = Object.keys(a);
		return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameProject(a[k], b[k]));
	}
	return a === b;
}

/**
 * A project file as `json` says it, laid out as `existing` was: its indent, its
 * line endings, and whether it ends in one. A file somebody wrote with tabs and
 * CRLF stays that way when a change to the map rewrites it, so the change is
 * the diff.
 */
export function formatLike(json: string, existing: string | null): string {
	if (existing === null) return json;
	const indent = /\n([ \t]+)"/.exec(existing)?.[1];
	let out = json;
	if (indent && indent !== "  ") {
		out = JSON.stringify(JSON.parse(json), null, indent.includes("\t") ? "\t" : indent.length) + "\n";
	}
	if (!/\n$/.test(existing)) out = out.replace(/\n$/, "");
	return existing.includes("\r\n") ? out.replace(/\n/g, "\r\n") : out;
}

/** The parsed project file, or undefined when it is not JSON. */
export function parseProject(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
