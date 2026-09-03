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

import { SCHEMA_VERSION } from "./schema.js";

/** Instances Rojo will create for us, beyond the services it already knows. */
export const CONTAINER_CLASSES = [
	"Folder", "Model", "Configuration", "ScreenGui", "Part", "Tool",
] as const;

/**
 * Services that can sit directly under a DataModel. Not exhaustive — any name
 * is accepted — but this is what the editor offers.
 */
export const COMMON_SERVICES = [
	"ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui",
	"StarterPlayer", "StarterPack", "Workspace", "Lighting", "SoundService",
	"ReplicatedFirst", "Chat", "Teams", "TestService",
] as const;

export interface MapNode {
	id: string;
	/** The name this instance takes in the DataModel. */
	name: string;
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
	children: MapNode[];
}

export interface NodeMap {
	schemaVersion: number;
	kind: "map";
	id: string;
	/** Rojo project name, and the name shown in the editor. */
	name: string;
	/** Where the generated project file is written, relative to the root. */
	output: string;
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

export function compileNodeMap(map: NodeMap): MapCompileResult {
	const diagnostics: MapDiagnostic[] = [];

	if (map.root.className !== "DataModel") {
		diagnostics.push({
			severity: "warning",
			message: 'The root of a node map is normally a DataModel.',
			node: map.root.id,
		});
	}
	validateNode(map.root, diagnostics, true);

	const project = {
		name: map.name,
		tree: buildTree(map.root, true),
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

type RojoNode = Record<string, unknown>;

function buildTree(node: MapNode, isRoot: boolean): RojoNode {
	const out: RojoNode = {};

	// Services are named by their key alone; restating $className makes Rojo
	// complain, so only non-services carry one.
	if (node.className && (isRoot || !isService(node))) {
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
		children: node.children.map(cleanNode),
	};
}
