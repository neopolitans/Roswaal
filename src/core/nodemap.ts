/**
 * Node maps: the second file format.
 *
 * A `.nodescript` is one compiled unit — a Script, a LocalScript, a
 * ModuleScript. A `.nodemap` is the other half of the question: where those
 * units live in the DataModel. It describes an instance hierarchy and compiles
 * to a Rojo project file, so folder structure is authored in Roswaal rather
 * than hand-edited into `default.project.json` and kept in step by memory.
 *
 * The split earns itself because the two answer different questions and change
 * at different rates. A graph changes constantly; the tree it sits in changes
 * when the project is reorganised.
 */

import { ROBLOX_SERVICES } from "./roblox.js";
import { SCHEMA_VERSION, type Target } from "./schema.js";

/** Instances Rojo will create for us, beyond the services it already knows. */
export const CONTAINER_CLASSES = [
	"Folder", "Model", "Configuration", "ScreenGui", "Part", "Tool",
] as const;

/**
 * Services that can sit directly under a DataModel. Shared with the Get Service
 * dropdown, so the two never disagree about what a service is.
 */
export const COMMON_SERVICES = ROBLOX_SERVICES;

export interface MapNode {
	id: string;
	/**
	 * What this is called.
	 *
	 * In a DataModel map, the instance's name. In a filesystem map, the
	 * directory or file name — with no extension, because the extension is
	 * decided by what the node *is* and writing `.luau` into a name is how you
	 * get `init.luau.luau`.
	 */
	name: string;
	/**
	 * A file rather than a directory, in a filesystem map.
	 *
	 * Ignored by a DataModel map, where the same question is answered by
	 * `className` and `path` together.
	 */
	file?: boolean;
	/**
	 * Instance class. Empty on a service, because Rojo already knows what
	 * ReplicatedStorage is and saying so again is noise Rojo will reject.
	 */
	className?: string;
	/** Directory or file on disk whose contents fill this instance. */
	path?: string;
	/** Rojo `$properties`, passed through untouched. */
	properties?: Record<string, unknown>;
	/** Marks the instance as ignored by Rojo's `$ignoreUnknownInstances`. */
	ignoreUnknown?: boolean;
	/**
	 * Globs under this instance's path that Rojo should skip.
	 *
	 * Rojo has no per-instance ignore, only a project-level `globIgnorePaths`,
	 * so a bare glob here is prefixed with this node's path on the way out.
	 * That keeps the thing you are excluding next to the thing it belongs to,
	 * which is where you are looking when you decide to exclude it.
	 */
	ignorePaths?: string[];
	children: MapNode[];
}

export interface NodeMap {
	schemaVersion: number;
	kind: "map";
	id: string;
	/** Rojo project name, and the name shown in the editor. */
	name: string;
	/**
	 * Which runtime this map describes, and therefore what it *is*.
	 *
	 * A map has always been a DataModel: a root that is the DataModel, children
	 * that are services, and a `default.project.json` at the end of it. That is
	 * one shape of the question "where does this file end up", and it is
	 * Roblox's shape.
	 *
	 * A Lune program has no DataModel. It has **directories and files**, and
	 * where a file ends up is where it is. So a Lune map is a tree of folders,
	 * it writes no project file, and what it is for is the thing Rojo was doing
	 * incidentally: saying the layout out loud and checking it holds together.
	 *
	 * Optional, and absent means `roblox`. Every map written before this is a
	 * DataModel map and stays one without being touched.
	 */
	target?: Target;
	/**
	 * Where the generated project file is written, relative to the root.
	 *
	 * A filesystem map writes none, so this is a DataModel map's field. It is
	 * kept rather than made conditional because a map that changes target
	 * should not lose where its project file went.
	 */
	output: string;
	/** Project-wide ignore globs, passed through to Rojo untouched. */
	globIgnorePaths?: string[];
	/** The DataModel. Its children are services. */
	root: MapNode;
}

export function emptyMap(name: string, id: string, makeId: () => string): NodeMap {
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "map",
		id,
		name,
		output: "default.project.json",
		root: {
			id: makeId(),
			name: "DataModel",
			className: "DataModel",
			children: [
				{
					id: makeId(),
					name: "ServerScriptService",
					children: [{ id: makeId(), name: "Source", className: "Folder", path: "src", children: [] }],
				},
			],
		},
	};
}

/**
 * A map for a Lune program: directories and files, and no DataModel.
 *
 * It starts with the shape a Lune program actually has — an entry point beside
 * a place to put the rest — rather than empty, because an empty tree does not
 * say what kind of thing it is about to become and this one has to.
 */
export function emptyFilesystemMap(name: string, id: string, makeId: () => string): NodeMap {
	return {
		schemaVersion: SCHEMA_VERSION,
		kind: "map",
		id,
		name,
		target: "lune",
		// Kept, though nothing writes it, so changing target back does not lose
		// where the project file went.
		output: "default.project.json",
		root: {
			id: makeId(),
			name: ".",
			children: [
				{ id: makeId(), name: "main", file: true, children: [] },
				{ id: makeId(), name: "lib", children: [] },
			],
		},
	};
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface MapDiagnostic {
	severity: "error" | "warning";
	message: string;
	node?: string;
}

export interface MapCompileResult {
	json: string;
	diagnostics: MapDiagnostic[];
	outputPath: string;
	ok: boolean;
}

/** A map that describes directories and files rather than a DataModel. */
export const isFilesystemMap = (map: NodeMap): boolean => map.target === "lune";

/**
 * A name a `require` can actually reach.
 *
 * Luau's require takes a path, so the characters a path cannot hold are the
 * rule — and a name with a dot in it is the one worth catching, because
 * `my.thing` beside `my.thing.luau` is a file you cannot name unambiguously.
 */
const LEGAL_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/**
 * What is wrong with a filesystem layout, checked where a person can still move
 * something.
 *
 * These are **require-time errors in Luau**, not preferences. The RFC that
 * amended require resolution makes an ambiguous path an error rather than a
 * choice, so a layout with both `foo.luau` and `foo/` is one the runtime will
 * refuse — and finding that out from a map, with the two things named, beats
 * finding it out from a stack trace.
 */
function validateFilesystem(node: MapNode, diagnostics: MapDiagnostic[]): void {
	if (node.name.trim() === "") {
		diagnostics.push({
			severity: "error",
			message: "Something here has no name.",
			node: node.id,
		});
	} else if (!LEGAL_SEGMENT.test(node.name.trim())) {
		diagnostics.push({
			severity: "error",
			message:
				`"${node.name}" is not a name a require can reach. Letters, digits, \`.\`, \`-\` ` +
				"and `_`, and no directory separators.",
			node: node.id,
		});
	}

	if (node.file && node.children.length > 0) {
		diagnostics.push({
			severity: "error",
			message: `"${node.name}" is a file, so nothing can be inside it.`,
			node: node.id,
		});
	}

	/**
	 * Two things in one directory that a require cannot tell apart.
	 *
	 * A file and a directory of the same name is the ambiguity Luau refuses:
	 * `require("./foo")` cannot mean both `foo.luau` and `foo/init.luau`. And
	 * two files whose names differ only by extension are the same collision one
	 * step along — `foo.luau` and `foo.lua` both answer to `./foo`.
	 */
	const files = new Map<string, MapNode>();
	const directories = new Map<string, MapNode>();

	for (const child of node.children) {
		const name = child.name.trim();
		const stem = child.file ? name.replace(/\.(luau|lua)$/i, "") : name;
		const bucket = child.file ? files : directories;

		const clash = bucket.get(stem);
		if (clash) {
			diagnostics.push({
				severity: "error",
				message: child.file
					? `"${stem}" is here twice. A require of "./${stem}" cannot say which.`
					: `"${node.name}" has two directories called "${stem}".`,
				node: child.id,
			});
		} else {
			bucket.set(stem, child);
		}

		const other = (child.file ? directories : files).get(stem);
		if (other) {
			diagnostics.push({
				severity: "error",
				message:
					`"${stem}" is both a file and a directory here, and \`require("./${stem}")\` ` +
					"cannot mean both. Luau refuses an ambiguous path rather than picking one.",
				node: child.id,
			});
		}

		validateFilesystem(child, diagnostics);
	}
}

export function compileNodeMap(map: NodeMap): MapCompileResult {
	const diagnostics: MapDiagnostic[] = [];

	/**
	 * A filesystem map writes no project file.
	 *
	 * Rojo's project file answers "where does this land in the DataModel", and
	 * a Lune program has no DataModel to land in — the layout *is* the answer.
	 * So compiling one is checking it, which is the part Rojo was doing
	 * incidentally and the only part that transfers.
	 */
	if (isFilesystemMap(map)) {
		validateFilesystem(map.root, diagnostics);
		return {
			json: "",
			diagnostics,
			outputPath: "",
			ok: !diagnostics.some((one) => one.severity === "error"),
		};
	}

	if (map.root.className !== "DataModel") {
		diagnostics.push({
			severity: "warning",
			message: 'The root of a node map is normally a DataModel.',
			node: map.root.id,
		});
	}
	validateNode(map.root, diagnostics, true);

	const globs = collectGlobs(map);
	const project = {
		name: map.name,
		tree: buildTree(map.root, true),
		...(globs.length > 0 ? { globIgnorePaths: globs } : {}),
	};

	return {
		// Two-space JSON with a trailing newline, matching what Rojo itself
		// writes, so a generated project file diffs cleanly against a hand one.
		json: JSON.stringify(project, null, 2) + "\n",
		diagnostics,
		outputPath: map.output,
		ok: !diagnostics.some((d) => d.severity === "error"),
	};
}

function validateNode(node: MapNode, diagnostics: MapDiagnostic[], isRoot: boolean): void {
	if (node.name.trim() === "") {
		diagnostics.push({ severity: "error", message: "An instance has no name.", node: node.id });
	}
	if (!isRoot && node.children.length === 0 && !node.path && !node.className) {
		diagnostics.push({
			severity: "warning",
			message: `"${node.name}" has no class, no path and no children, so it does nothing.`,
			node: node.id,
		});
	}

	const seen = new Set<string>();
	for (const child of node.children) {
		if (seen.has(child.name)) {
			diagnostics.push({
				severity: "error",
				message: `"${node.name}" has two children called "${child.name}".`,
				node: child.id,
			});
		}
		seen.add(child.name);
		validateNode(child, diagnostics, false);
	}
}

/**
 * Every ignore glob in the map, with each node's own globs anchored to that
 * node's path. Rojo only understands one project-level list.
 */
function collectGlobs(map: NodeMap): string[] {
	const out: string[] = [...(map.globIgnorePaths ?? [])];

	const visit = (node: MapNode) => {
		for (const glob of node.ignorePaths ?? []) {
			const trimmed = glob.trim();
			if (trimmed === "") continue;
			// An absolute-looking glob is the author being explicit; anything
			// else is relative to the folder it was written on.
			out.push(trimmed.startsWith("/") ? trimmed.slice(1) : joinGlob(node.path, trimmed));
		}
		node.children.forEach(visit);
	};
	visit(map.root);

	return [...new Set(out)];
}

function joinGlob(base: string | undefined, glob: string): string {
	if (!base) return glob;
	return `${base.replace(/\/+$/, "")}/${glob}`;
}

type RojoNode = Record<string, unknown>;

function buildTree(node: MapNode, isRoot: boolean): RojoNode {
	const out: RojoNode = {};

	// Services are named by their key alone; restating $className makes Rojo
	// complain, so only non-services carry one. A path that points at a
	// directory already implies a Folder, so saying it again is noise that
	// makes an empty result look intentional.
	const impliedByPath = node.path !== undefined && node.className === "Folder";
	if (node.className && !impliedByPath && (isRoot || !isService(node))) {
		out.$className = node.className;
	}
	if (node.path) out.$path = node.path;
	if (node.properties && Object.keys(node.properties).length > 0) {
		out.$properties = node.properties;
	}
	if (node.ignoreUnknown) out.$ignoreUnknownInstances = true;

	for (const child of node.children) {
		out[child.name] = buildTree(child, false);
	}
	return out;
}

/**
 * A node with no class is a service: Rojo infers the class from the key, and
 * saying it again is something Rojo rejects.
 */
function isService(node: MapNode): boolean {
	return node.className === undefined || node.className === "";
}

// ---------------------------------------------------------------------------
// Traversal helpers, shared by the editor
// ---------------------------------------------------------------------------

export function findMapNode(root: MapNode, id: string): MapNode | null {
	if (root.id === id) return root;
	for (const child of root.children) {
		const found = findMapNode(child, id);
		if (found) return found;
	}
	return null;
}

/** Returns a new tree with `id` replaced by `fn`'s result. */
export function mapNodeUpdate(
	root: MapNode, id: string, fn: (node: MapNode) => MapNode,
): MapNode {
	if (root.id === id) return fn(root);
	return { ...root, children: root.children.map((c) => mapNodeUpdate(c, id, fn)) };
}

export function mapNodeRemove(root: MapNode, id: string): MapNode {
	return {
		...root,
		children: root.children.filter((c) => c.id !== id).map((c) => mapNodeRemove(c, id)),
	};
}

export function mapNodeParent(root: MapNode, id: string): MapNode | null {
	for (const child of root.children) {
		if (child.id === id) return root;
		const found = mapNodeParent(child, id);
		if (found) return found;
	}
	return null;
}

/** Canonical on-disk form, for diffs that read as changes rather than churn. */
export function serialiseMap(map: NodeMap): string {
	return JSON.stringify(
		{
			schemaVersion: map.schemaVersion,
			kind: map.kind,
			id: map.id,
			name: map.name,
			output: map.output,
			...(map.globIgnorePaths && map.globIgnorePaths.length
			? { globIgnorePaths: map.globIgnorePaths }
			: {}),
		root: cleanNode(map.root),
		},
		null,
		2,
	) + "\n";
}

function cleanNode(node: MapNode): Record<string, unknown> {
	return {
		id: node.id,
		name: node.name,
		...(node.className ? { className: node.className } : {}),
		...(node.path ? { path: node.path } : {}),
		...(node.properties && Object.keys(node.properties).length
			? { properties: node.properties }
			: {}),
		...(node.ignoreUnknown ? { ignoreUnknown: true } : {}),
		...(node.ignorePaths && node.ignorePaths.length ? { ignorePaths: node.ignorePaths } : {}),
		children: node.children.map(cleanNode),
	};
}

// ---------------------------------------------------------------------------
// Locating a file in the DataModel
// ---------------------------------------------------------------------------

export interface InstanceLocation {
	/** The service or global the path starts from, e.g. "ReplicatedStorage". */
	root: string;
	/** Dotted path under that root, e.g. "Modules.Combat". Empty at the root. */
	path: string;
	/** True when the file compiles to a ModuleScript, so it can be required. */
	isModule: boolean;
}

/**
 * Where a file on disk ends up in the DataModel, according to this map.
 *
 * This is the question you cannot answer by looking at either half alone: the
 * disk path says `src/ReplicatedStorage/Greeter.luau` and the require needs
 * `ReplicatedStorage` + `Greeter`, and only the map knows how one becomes the
 * other. Returns null when no mapping covers the file.
 */
export function locateInDataModel(map: NodeMap, diskPath: string): InstanceLocation | null {
	const file = normalise(diskPath);
	const candidates: { segments: string[]; base: string }[] = [];

	const visit = (node: MapNode, trail: string[]) => {
		// The DataModel itself contributes no segment; services and folders do.
		const here = node === map.root ? trail : [...trail, node.name];
		if (node.path) candidates.push({ segments: here, base: normalise(node.path) });
		for (const child of node.children) visit(child, here);
	};
	visit(map.root, []);

	// Longest base wins, so a nested mapping beats the one containing it.
	candidates.sort((a, b) => b.base.length - a.base.length);

	for (const candidate of candidates) {
		const inside =
			file === candidate.base || file.startsWith(candidate.base + "/");
		if (!inside) continue;

		const remainder = file === candidate.base ? "" : file.slice(candidate.base.length + 1);
		const parts = remainder === "" ? [] : remainder.split("/");
		const leaf = parts.pop();
		const named = leaf === undefined ? [] : instanceNamesFor(leaf);

		const segments = [...candidate.segments, ...parts, ...named];
		if (segments.length === 0) return null;

		return {
			root: segments[0],
			path: segments.slice(1).join("."),
			isModule: leaf === undefined ? false : isModuleFile(leaf),
		};
	}
	return null;
}

/**
 * The instance a filename becomes. `init.luau` is Rojo's way of saying "this
 * file *is* the folder", so it contributes no segment of its own.
 */
function instanceNamesFor(fileName: string): string[] {
	const base = fileName.replace(/\.(luau|lua|nodescript)$/i, "");
	const stripped = base.replace(/\.(server|client)$/i, "");
	return stripped.toLowerCase() === "init" ? [] : [stripped];
}

function isModuleFile(fileName: string): boolean {
	const base = fileName.replace(/\.(luau|lua|nodescript)$/i, "");
	return !/\.(server|client)$/i.test(base);
}

function normalise(value: string): string {
	const BACKSLASH = String.fromCharCode(92);
	return value
		.split(BACKSLASH)
		.join("/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");
}
