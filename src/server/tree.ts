/**
 * The project tree the editor's sidebar draws: folders and the files Roswaal
 * knows what to do with, what each folder is, and `wally.toml` with its
 * packages under it.
 *
 * Read-only. Creating, renaming and moving what the tree shows is
 * `entries.ts`.
 */

import { type FunctionInfo, functionOutline } from "../core/functionGraph.js";
import { FOLDER_PROJECT_FILES } from "../core/jsonc.js";
import { compileNodeMap, isFilesystemMap, type MapNode, type NodeMap } from "../core/nodemap.js";
import { PLACE_DIR } from "../core/rbx/placeImport.js";
import { parseProject } from "../core/rojoImport.js";
import type { NodeScript } from "../core/schema.js";
import { indexVersion, parseWallyToml, REALM_DIRS, thunkTarget } from "../core/wally.js";
import type { OpenProject } from "./config.js";
import { collectMaps, readMap } from "./documents.js";
import { fs, path } from "./host.js";
import { mappedOutputFolders } from "./mapFolders.js";
import { generatedIndex, importGraphPath } from "./outputs.js";
import { safeJoin, tidyPath, toPosix } from "./paths.js";
import { findPlaceFile, PLACE_BACKUPS } from "./place.js";

/**
 * Folders the project tree leaves out. Wally's are shown -- a project's
 * packages are part of what it is -- and marked, but never scanned.
 */
const TREE_SKIP = new Set(["node_modules", ".git", ".vscode", "dist", "build", "out"]);

const WALLY_DIRS = new Set(Object.values(REALM_DIRS));

/** The script a graph compiles to: a Script, a LocalScript or a ModuleScript. */
export type ScriptRealm = "server" | "client" | "module";

export interface TreeEntry {
	/** Path relative to the project root, with forward slashes. */
	path: string;
	name: string;
	/**
	 * `wally` is `wally.toml`, listed with its dependencies as `package`
	 * entries: not files, so a package's `path` is a name, and `target` is the
	 * file it opens.
	 */
	kind:
		| "directory"
		| "nodescript"
		| "nodemap"
		| "luau"
		| "luaurc"
		| "wally"
		| "package"
		| "place"
		| "model";
	/**
	 * Set on a folder a node map gives a path to, in the output and in the
	 * graphs that mirror it: the map's path, which the tree's badge names.
	 */
	syncedBy?: string;
	/** Set on generated Luau: the graph it came from. */
	generatedFrom?: string;
	/**
	 * Set on Luau written by hand whose graph is where Import as graph puts
	 * it: the graph, which Reimport replaces.
	 */
	graph?: string;
	/** Set on a graph with functions, which the tree lists under it. */
	functions?: FunctionInfo[];
	children?: TreeEntry[];
	/** What a folder is, where it is more than a folder. See `folderRole`. */
	role?: FolderRole;
	/** A graph folder that is a script: its `init.nodescript`, the graph it is. */
	script?: string;
	/** On a graph, or a script folder: the script it compiles to, which the tree colours. */
	realm?: ScriptRealm;
	/** A package's installed version, from its `_Index` folder. */
	version?: string;
	/** The file a package opens: its module in `_Index`. */
	target?: string;
	/** A package `wally.toml` lists that `wally install` has not put on disk. */
	missing?: boolean;
	/** On a node map: see `MapFacts`. */
	mapFacts?: MapFacts;
	/** On a place: the one in use, which Roswaal reads and the Place Editor opens. */
	inUse?: boolean;
}

/**
 * What the Project panel says about a node map on its row: the project file it
 * writes and whether that file is written as the map has it, whether
 * `rojo serve` picks it up, another map writing the same file, and what it
 * syncs, which the row opens onto.
 */
export interface MapFacts {
	/** The project file it writes; absent for a filesystem map, which writes none. */
	output?: string;
	/** The file on disk: as the map writes it, different, or not there. */
	state?: "same" | "differs" | "missing";
	/** It writes default.project.json at the root: the file `rojo serve` reads. */
	serves?: boolean;
	/** Another map writing the same file: neither writes until one is changed. */
	clash?: string;
	/** Each instance it syncs, with the folder or file that fills it. */
	syncs: { id: string; trail: string; className?: string; service: boolean; path: string }[];
}

/**
 * A folder that is more than a folder, for the colour of its icon:
 *
 * - `service`: a service or container a node map points at -- ReplicatedStorage,
 *   StarterPlayerScripts -- rather than a Folder.
 * - `synced`: a Folder a node map points at.
 * - `script`: a folder holding an `init` file, which is the script itself in
 *   Studio, with the rest of the folder as its children.
 * - `place`: `place/` and everything in it: scripts only the place holds,
 *   written back by Modify RBXL rather than synced by Rojo.
 * - `packages`: a folder `wally install` fills, `Packages/` and its kin.
 */
export type FolderRole = "service" | "synced" | "script" | "place" | "packages";

export async function buildTree(project: OpenProject): Promise<TreeEntry[]> {
	const generated = await generatedIndex(project);
	// Empty folders are noise everywhere except under sourceDir, where one is a
	// folder the developer just created and is about to put a graph in, and
	// where a map syncs one, which writing the map made.
	const keepEmptyUnder = [
		project.config.sourceDir,
		...project.config.nodePaths,
		...(await mappedOutputFolders(project)),
	];
	const facts = await mapFolderFacts(project);
	const tree = await walk(
		project.root,
		project.root,
		generated,
		keepEmptyUnder,
		facts.roles,
		facts.syncedBy,
	);
	await markImported(project, tree);
	markMaps(tree, facts.maps);
	const inUse = await findPlaceFile(project.root, project.config);
	if (inUse) markPlace(tree, inUse);
	const wally = await wallyEntry(project);
	if (!wally) return tree;
	// It opens like a folder, so it is listed with the folders: after them and
	// before the files, where its chevron lines up with theirs rather than
	// sitting under a file as though it were inside it.
	const files = tree.findIndex((e) => e.kind !== "directory");
	return files === -1 ? [...tree, wally] : [...tree.slice(0, files), wally, ...tree.slice(files)];
}

/** Marks each hand-written Luau file whose import graph exists with that graph. */
async function markImported(project: OpenProject, entries: TreeEntry[]): Promise<void> {
	for (const entry of entries) {
		if (entry.children) await markImported(project, entry.children);
		if (entry.kind !== "luau" || entry.generatedFrom) continue;
		const graph = importGraphPath(project, entry.path);
		const there = await fs
			.stat(safeJoin(project.root, graph))
			.then(() => true)
			.catch(() => false);
		if (there) entry.graph = graph;
	}
}

/**
 * `wally.toml`, with what it depends on under it: each package by the name
 * the project requires it by, its installed version, and the module the
 * thunk in `Packages/` sends a `require` to.
 */
async function wallyEntry(project: OpenProject): Promise<TreeEntry | null> {
	const text = await fs.readFile(safeJoin(project.root, "wally.toml"), "utf8").catch(() => null);
	if (text === null) return null;
	const children: TreeEntry[] = [];
	for (const dep of parseWallyToml(text)) {
		const found = await resolveWallyPackage(project, dep.alias, REALM_DIRS[dep.realm]);
		children.push({
			path: `wally.toml/${dep.realm}/${dep.alias}`,
			name: dep.alias,
			kind: "package",
			...(found
				? { target: found.module, ...(found.version ? { version: found.version } : {}) }
				: { missing: true }),
		});
	}
	return { path: "wally.toml", name: "wally.toml", kind: "wally", children };
}

/**
 * The module file an instance path on disk stands for: `name.luau`, or a
 * folder's `init` file -- or, for a folder that is a Rojo project itself, as
 * every Wally package is, wherever its `default.project.json` points the tree.
 */
async function moduleAt(project: OpenProject, base: string, depth = 0): Promise<string | null> {
	const isFile = (rel: string) =>
		fs.stat(safeJoin(project.root, rel)).then(
			(s) => s.isFile(),
			() => false,
		);
	for (const candidate of [
		`${base}.luau`,
		`${base}.lua`,
		`${base}/init.luau`,
		`${base}/init.lua`,
	]) {
		if (await isFile(candidate)) return candidate;
	}
	if (depth > 4) return null;
	let text: string | null = null;
	for (const name of FOLDER_PROJECT_FILES) {
		text = await fs.readFile(safeJoin(project.root, `${base}/${name}`), "utf8").catch(() => null);
		if (text !== null) break;
	}
	const tree =
		text === null
			? undefined
			: (parseProject(text) as { tree?: { $path?: unknown } } | undefined)?.tree;
	if (typeof tree?.$path !== "string") return null;
	return moduleAt(project, path.posix.join(base, tree.$path).replace(/\/+$/, ""), depth + 1);
}

/**
 * Where `require(Packages.<alias>)` lands: the thunk in the realm's folder,
 * followed into `_Index`, to the module file. Null when it is not installed.
 */
export async function resolveWallyPackage(
	project: OpenProject,
	alias: string,
	folder: string,
): Promise<{ thunk: string; module: string; version?: string } | null> {
	for (const ext of [".lua", ".luau"]) {
		const thunk = `${folder}/${alias}${ext}`;
		const text = await fs.readFile(safeJoin(project.root, thunk), "utf8").catch(() => null);
		if (text === null) continue;
		const names = thunkTarget(text);
		// Not a thunk: the package's code was put here in its place.
		if (!names) return { thunk, module: thunk };
		const module = await moduleAt(project, [folder, ...names].join("/"));
		return module ? { thunk, module, version: indexVersion(names[names.length - 2] ?? "") } : null;
	}
	return null;
}

/**
 * Folders a node map points at, project-relative: what each is in Studio,
 * and the map that gives it a path.
 */
async function mapFolderFacts(project: OpenProject): Promise<{
	roles: Map<string, "service" | "synced">;
	syncedBy: Map<string, string>;
	maps: Map<string, MapFacts>;
}> {
	const out = new Map<string, "service" | "synced">();
	const syncedBy = new Map<string, string>();
	const maps = new Map<string, MapFacts>();
	let mapPath = "";
	const visit = (node: MapNode, parent: MapNode | null) => {
		if (node.path) {
			const at = tidyPath(node.path);
			if (!out.has(at)) out.set(at, node.className === "Folder" ? "synced" : "service");
			if (!syncedBy.has(at)) syncedBy.set(at, mapPath);
			// Anything mapped inside a service with no path of its own --
			// StarterPlayerScripts in StarterPlayer, a Folder in
			// ReplicatedStorage -- makes the folder above it the service's,
			// when it is named for it.
			const above = at.includes("/") ? at.slice(0, at.lastIndexOf("/")) : "";
			if (parent && !parent.path && !parent.className && above.split("/").pop() === parent.name)
				out.set(above, "service");
		}
		node.children.forEach((child) => visit(child, node));
	};
	for (const found of await collectMaps(project)) {
		mapPath = found;
		const map = await readMap(project, found).catch(() => null);
		if (!map) continue;
		if (!isFilesystemMap(map)) map.root.children.forEach((child) => visit(child, null));
		maps.set(found, await factsOf(project, map));
	}
	// Two maps writing one file: each is told the other's name.
	const byOutput = new Map<string, string[]>();
	for (const [at, one] of maps) {
		if (one.output) byOutput.set(one.output, [...(byOutput.get(one.output) ?? []), at]);
	}
	for (const same of byOutput.values()) {
		if (same.length < 2) continue;
		for (const at of same) {
			const one = maps.get(at);
			if (one) one.clash = same.find((other) => other !== at);
		}
	}
	// The graphs directory mirrors the output directory, so the folder a
	// service's graphs sit in is that service's too.
	const outDir = tidyPath(project.config.outDir);
	const sourceDir = tidyPath(project.config.sourceDir);
	for (const [at, role] of [...out]) {
		if (at.startsWith(`${outDir}/`))
			out.set(path.posix.join(sourceDir, at.slice(outDir.length + 1)), role);
	}
	for (const [at, map] of [...syncedBy]) {
		if (at.startsWith(`${outDir}/`))
			syncedBy.set(path.posix.join(sourceDir, at.slice(outDir.length + 1)), map);
	}
	return { roles: out, syncedBy, maps };
}

/** One map's facts for its row. */
async function factsOf(project: OpenProject, map: NodeMap): Promise<MapFacts> {
	const syncs: MapFacts["syncs"] = [];
	const visit = (node: MapNode, trail: string[]) => {
		const here = [...trail, node.name];
		if (node.path) {
			syncs.push({
				id: node.id,
				trail: here.join(" › "),
				...(node.className ? { className: node.className } : {}),
				service: !node.className && trail.length === 0,
				path: tidyPath(node.path),
			});
		}
		for (const child of node.children) visit(child, here);
	};
	for (const child of map.root.children) visit(child, []);
	if (isFilesystemMap(map)) return { syncs };
	const output = tidyPath(map.output);
	const text = await fs
		.readFile(safeJoin(project.root, output), "utf8")
		.then((t) => String(t))
		.catch(() => null);
	return {
		output,
		state: text === null ? "missing" : text === compileNodeMap(map).json ? "same" : "differs",
		...(output === "default.project.json" ? { serves: true } : {}),
		syncs,
	};
}

/** Marks the place in use on its row. */
function markPlace(entries: TreeEntry[], file: string): void {
	for (const entry of entries) {
		if (entry.kind === "place" && entry.path === file) entry.inUse = true;
		if (entry.children) markPlace(entry.children, file);
	}
}

/** Puts each map's facts on its row. */
function markMaps(entries: TreeEntry[], maps: ReadonlyMap<string, MapFacts>): void {
	for (const entry of entries) {
		if (entry.children) markMaps(entry.children, maps);
		const facts = entry.kind === "nodemap" ? maps.get(entry.path) : undefined;
		if (facts) entry.mapFacts = facts;
	}
}

/** A script's own file in its folder: Rojo's `init.server.luau` and the rest, or a graph's `init.nodescript`. */
const INIT_FILE = /^init((\.server|\.client)?\.luau?|\.nodescript)$/;

function folderRole(
	rel: string,
	children: readonly TreeEntry[],
	mapped: ReadonlyMap<string, "service" | "synced">,
): FolderRole | undefined {
	if (rel === PLACE_DIR || rel.startsWith(PLACE_DIR + "/")) return "place";
	if (WALLY_DIRS.has(rel)) return "packages";
	const role = mapped.get(rel);
	if (role) return role;
	if (children.some((c) => c.kind !== "directory" && INIT_FILE.test(c.name))) return "script";
	return undefined;
}

async function walk(
	root: string,
	dir: string,
	generated: Map<string, string>,
	keepEmptyUnder: string[],
	mapped: ReadonlyMap<string, "service" | "synced"> = new Map(),
	synced: ReadonlyMap<string, string> = new Map(),
): Promise<TreeEntry[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: TreeEntry[] = [];

	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = toPosix(path.relative(root, abs));

		if (entry.isDirectory()) {
			if (TREE_SKIP.has(entry.name)) continue;
			// Copies of the place kept before a property change: history, not content.
			if (rel === PLACE_BACKUPS) continue;
			const children = await walk(root, abs, generated, keepEmptyUnder, mapped, synced);
			const keep =
				children.length > 0 ||
				keepEmptyUnder.some(
					(base) => rel === base || rel.startsWith(base + "/") || base.startsWith(rel + "/"),
				);
			if (!keep) continue;
			const role = folderRole(rel, children, mapped);
			// A graph folder that is a script: the graph it is, which the tree opens.
			const init =
				role === "script"
					? children.find((c) => c.kind === "nodescript" && c.name === "init.nodescript")
					: undefined;
			out.push({
				path: rel,
				name: entry.name,
				kind: "directory",
				children,
				...(role ? { role } : {}),
				...(synced.has(rel) ? { syncedBy: synced.get(rel) } : {}),
				...(init ? { script: init.path } : {}),
				...(init?.realm ? { realm: init.realm } : {}),
			});
			continue;
		}
		const kind = classify(entry.name);
		if (!kind) continue;
		const { functions, realm } = kind === "nodescript" ? await graphFacts(abs) : { functions: [] };
		out.push({
			path: rel,
			name: entry.name,
			kind,
			...(generated.has(rel) ? { generatedFrom: generated.get(rel) } : {}),
			...(functions.length > 0 ? { functions } : {}),
			...(realm ? { realm } : {}),
		});
	}

	out.sort((a, b) => {
		if (a.kind === "directory" && b.kind !== "directory") return -1;
		if (b.kind === "directory" && a.kind !== "directory") return 1;
		return a.name.localeCompare(b.name);
	});
	return out;
}

/**
 * A graph's functions, for the tree. A file that will not parse has none here;
 * opening it is where that gets reported.
 */
/** What the tree shows of a graph: its functions, and the script it compiles to. */
async function graphFacts(
	abs: string,
): Promise<{ functions: FunctionInfo[]; realm?: ScriptRealm }> {
	try {
		const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as Partial<NodeScript>;
		const functions = Array.isArray(parsed.nodes) ? functionOutline({ nodes: parsed.nodes }) : [];
		const realm = realmOf(parsed);
		return { functions, ...(realm ? { realm } : {}) };
	} catch {
		return { functions: [] };
	}
}

/**
 * The script a Roblox graph becomes, as the tree colours it: a Script, a
 * LocalScript (or a Script run on the client), or a ModuleScript. A Lune graph
 * is none of these.
 */
function realmOf(script: Partial<NodeScript>): ScriptRealm | undefined {
	if (script.target === "lune") return undefined;
	if (script.scriptClass === "ModuleScript") return "module";
	if (script.scriptClass === "LocalScript") return "client";
	if (script.scriptClass === "Script") return script.runContext === "Client" ? "client" : "server";
	return undefined;
}

function classify(name: string): TreeEntry["kind"] | null {
	if (name.endsWith(".nodescript")) return "nodescript";
	if (name.endsWith(".nodemap")) return "nodemap";
	if (name.endsWith(".luau") || name.endsWith(".lua")) return "luau";
	// A project fact, shown where it lives: which directory a `.luaurc` is in
	// decides which graphs it applies to, and a tree is the one place that says
	// so without having to explain it.
	if (name === ".luaurc") return "luaurc";
	// The place Studio opens, and models a node map points at: what Rojo builds from.
	if (/\.rbxlx?$/i.test(name)) return "place";
	if (/\.rbxmx?$/i.test(name)) return "model";
	return null;
}
