/**
 * Project I/O: reading and writing a Roswaal project on disk.
 *
 * A project is any directory containing a `roswaal.json`. Graphs live under
 * `sourceDir`, compiled Luau is written to `outDir`, and Rojo picks it up from
 * there — Roswaal never talks to Studio itself.
 */

import { formatLuau, fs, path } from "./host.js";

import {
	compile, hashString, serialiseScript, type CompileResult,
} from "../core/compiler/index.js";
import { LuauParseError, parseLuauData } from "../core/luauData.js";
import { isGenerated, recordGenerated } from "./manifest.js";
import { migrateScript } from "../core/migrate.js";
import {
	compileNodeMap, locateInDataModel, serialiseMap,
	type InstanceLocation, type MapDiagnostic, type MapNode, type NodeMap,
} from "../core/nodemap.js";
import { createRegistry, parseNodePack, type Registry } from "../core/nodes/index.js";
import {
	defaultConfig, indentUnit, isModuleScript, SCHEMA_VERSION,
	type NodeDef, type NodeScript, type RoswaalConfig, type Target,
} from "../core/schema.js";
import {
	clashingIds, namespaceFor, packRequires, packTargets, renamespace,
} from "../core/packs.js";
import { functionOutline, type FunctionInfo } from "../core/functionGraph.js";

/**
 * Ownership key written into project files by an earlier build. Rojo refuses
 * to parse a project containing it, so its only remaining job is to identify a
 * file Roswaal wrote and should repair.
 */
const LEGACY_OWNERSHIP_KEY = "$roswaalGeneratedFrom";

const SKIP_DIRS = new Set([
	"node_modules", ".git", ".vscode", "dist", "build", "out", "Packages", "DevPackages",
]);

export interface TreeEntry {
	/** Path relative to the project root, with forward slashes. */
	path: string;
	name: string;
	kind: "directory" | "nodescript" | "nodemap" | "luau";
	/** Set on generated Luau: the graph it came from. */
	generatedFrom?: string;
	/** Set on a graph with functions, which the tree lists under it. */
	functions?: FunctionInfo[];
	children?: TreeEntry[];
}

export interface OpenProject {
	root: string;
	config: RoswaalConfig;
	registry: Registry;
	/**
	 * The definitions this project's node packs contributed, on their own.
	 *
	 * Kept apart from the registry because the editor has to be told which ones
	 * are packs — it bundles the built-ins itself, and their pin derivation and
	 * display rules are code that cannot survive a round trip through JSON.
	 * Working that out by inspecting the registry is what went wrong before: a
	 * filter for "looks like data" matched most of the built-in library, so the
	 * editor was handed 215 function-less copies of nodes it already had, and
	 * they shadowed the real ones.
	 */
	packs: NodeDef[];
	packErrors: string[];
	packCount: number;
}

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

export async function openProject(root: string): Promise<OpenProject> {
	const resolved = path.resolve(root);
	const stat = await fs.stat(resolved).catch(() => null);
	if (!stat?.isDirectory()) throw new Error(`Not a directory: ${resolved}`);

	const config = await readConfig(resolved);
	const { defs, errors } = await loadNodePacks(resolved, config);

	return {
		root: resolved,
		config,
		registry: createRegistry(defs),
		packs: defs,
		packErrors: errors,
		packCount: defs.length,
	};
}

export async function readConfig(root: string): Promise<RoswaalConfig> {
	const file = path.join(root, "roswaal.json");
	const raw = await fs.readFile(file, "utf8").catch(() => null);
	if (raw === null) return defaultConfig();
	try {
		return { ...defaultConfig(), ...(JSON.parse(raw) as Partial<RoswaalConfig>) };
	} catch (err) {
		throw new Error(`roswaal.json is not valid JSON: ${(err as Error).message}`);
	}
}

export async function writeConfig(root: string, config: RoswaalConfig): Promise<void> {
	await fs.writeFile(
		path.join(root, "roswaal.json"),
		JSON.stringify({ ...config, schemaVersion: SCHEMA_VERSION }, null, 2) + "\n",
		"utf8",
	);
}

/** Creates roswaal.json and the source directory if they are not there yet. */
export async function initProject(root: string): Promise<RoswaalConfig> {
	const resolved = path.resolve(root);
	const config = await readConfig(resolved);
	await fs.mkdir(path.join(resolved, config.sourceDir), { recursive: true });
	await fs.mkdir(path.join(resolved, config.nodePaths[0] ?? ".roswaal/nodes"), { recursive: true });
	await writeConfig(resolved, config);
	return config;
}

async function loadNodePacks(
	root: string, config: RoswaalConfig,
): Promise<{ defs: NodeDef[]; errors: string[] }> {
	const defs: NodeDef[] = [];
	const errors: string[] = [];

	for (const dir of config.nodePaths) {
		const abs = path.join(root, dir);
		const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const isJson = entry.name.endsWith(".nodedef.json");
			const isLuau = entry.name.endsWith(".nodedef.luau") || entry.name.endsWith(".nodedef.lua");
			if (!isJson && !isLuau) continue;

			const file = path.join(abs, entry.name);
			try {
				const text = await fs.readFile(file, "utf8");
				// Luau packs are parsed, never executed: a pack is data a project
				// pulls in from somewhere, and running it would mean running a
				// stranger's code every time a project is opened.
				const source = isLuau ? parseLuauData(text) : JSON.parse(text);
				const parsed = parseNodePack(source, entry.name);
				defs.push(...parsed.defs);
				errors.push(...parsed.errors, ...parsed.warnings);
			} catch (err) {
				const detail =
					err instanceof LuauParseError ? err.message : (err as Error).message;
				errors.push(`${entry.name}: ${detail}`);
			}
		}
	}
	return { defs, errors };
}

// ---------------------------------------------------------------------------
// Node packs
// ---------------------------------------------------------------------------

/** One node pack on disk, and what it defines. */
export interface PackFile {
	/** Project-relative, with forward slashes. */
	path: string;
	/** The file's name without its extension, which is what a reader calls it. */
	name: string;
	format: "json" | "luau";
	/** The ids it defines, in file order. */
	nodes: string[];
	/** Anything wrong with it, said the way the status panel says it. */
	errors: string[];
	/** The targets all of its nodes run on, or null when they run on both. */
	targets: Target[] | null;
	/** Other packs, by name, that its nodes' logic is built from. */
	requires: string[];
}

/** A pack as written: its nodes exactly as authored, and its own settings. */
export interface PackContents {
	pack: PackFile;
	/** Node objects as the file has them, including fields the loader ignores. */
	nodes: Record<string, unknown>[];
	defs: NodeDef[];
}

/** The extension a pack the designer can write carries. */
const PACK_SUFFIX = ".nodedef.json";

/** What a project needs for its packs to be listed: nothing a registry adds. */
type PackProject = Pick<OpenProject, "root" | "config">;

function packFormat(fileName: string): "json" | "luau" | null {
	if (fileName.endsWith(PACK_SUFFIX)) return "json";
	if (fileName.endsWith(".nodedef.luau") || fileName.endsWith(".nodedef.lua")) return "luau";
	return null;
}

/** Reads one pack file, never throwing: a pack that will not parse says why. */
async function readPackAt(root: string, relPath: string): Promise<PackContents> {
	const fileName = path.posix.basename(relPath);
	const format = packFormat(fileName) ?? "json";
	const pack: PackFile = {
		path: relPath,
		name: fileName.replace(/\.nodedef\.(json|luau|lua)$/, ""),
		format,
		nodes: [],
		errors: [],
		targets: null,
		requires: [],
	};
	try {
		const text = await fs.readFile(safeJoin(root, relPath), "utf8");
		// Luau packs are parsed, never executed. See `loadNodePacks`.
		const source = (format === "json" ? JSON.parse(text) : parseLuauData(text)) as
			| { nodes?: unknown; requires?: unknown; targets?: unknown }
			| unknown[];
		const document = Array.isArray(source) ? { nodes: source } : source;
		const parsed = parseNodePack(source, fileName);
		pack.nodes = parsed.defs.map((def) => def.id);
		pack.errors = parsed.errors;
		pack.targets = packTargets(parsed.defs, document.targets);
		pack.requires = packRequires(document.requires);
		const nodes = Array.isArray(document.nodes) ? (document.nodes as Record<string, unknown>[]) : [];
		return { pack, nodes, defs: parsed.defs };
	} catch (err) {
		pack.errors = [(err as Error).message];
		return { pack, nodes: [], defs: [] };
	}
}

/**
 * Every node pack in the project, listed so the designer can ask where a node
 * should go rather than choosing for you.
 *
 * Luau packs are listed too, and marked: they are read like any other, and the
 * designer will not write one — see `savePackNode`.
 */
export async function listPacks(project: PackProject): Promise<PackFile[]> {
	const out: PackFile[] = [];

	for (const dir of project.config.nodePaths) {
		const abs = path.join(project.root, dir);
		const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (!entry.isFile() || !packFormat(entry.name)) continue;
			out.push((await readPackAt(project.root, toPosix(path.join(dir, entry.name)))).pack);
		}
	}
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A pack file that is in one of the project's node paths, or an error saying where they are. */
function assertPackPath(project: PackProject, relPath: string): string {
	const target = toPosix(relPath);
	if (!packFormat(path.posix.basename(target))) {
		throw new Error(`${target} is not a node pack. A pack is a .nodedef.json or .nodedef.luau file.`);
	}
	const dirs = project.config.nodePaths.map((d) => toPosix(d).replace(/\/+$/, ""));
	if (!dirs.some((dir) => target.startsWith(dir + "/"))) {
		throw new Error(`${target} is not in a node path. This project loads packs from ${dirs.join(", ")}.`);
	}
	return target;
}

/**
 * Sets the packs a JSON pack requires, by name.
 *
 * Written first in the file, above the nodes, because it is the thing a reader
 * wants to know before reading them. An empty list removes the key rather than
 * writing `"requires": []`.
 */
export async function setPackRequires(project: PackProject, relPath: string, requires: string[]): Promise<PackFile> {
	const target = assertPackPath(project, relPath);
	if (!target.endsWith(PACK_SUFFIX)) {
		throw new Error(`${target} is a Luau pack, which the designer does not rewrite.`);
	}
	const abs = safeJoin(project.root, target);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as Record<string, unknown> | unknown[];
	const { requires: _old, nodes, ...rest } = Array.isArray(parsed) ? { nodes: parsed } : parsed;
	const clean = [...new Set(packRequires(requires))];
	const document = { ...(clean.length > 0 ? { requires: clean } : {}), ...rest, nodes: nodes ?? [] };
	await fs.writeFile(abs, JSON.stringify(document, null, 2) + "\n", "utf8");
	return (await readPackAt(project.root, target)).pack;
}

/** Takes one node out of a JSON pack. */
export async function deletePackNode(project: PackProject, relPath: string, id: string): Promise<PackFile> {
	const target = assertPackPath(project, relPath);
	if (!target.endsWith(PACK_SUFFIX)) {
		throw new Error(`${target} is a Luau pack, which the designer does not rewrite.`);
	}
	const abs = safeJoin(project.root, target);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as { nodes?: { id: string }[] } | { id: string }[];
	const document = Array.isArray(parsed) ? { nodes: parsed } : parsed;
	const nodes = (document.nodes ?? []).filter((node) => node.id !== id);
	await fs.writeFile(abs, JSON.stringify({ ...document, nodes }, null, 2) + "\n", "utf8");
	return (await readPackAt(project.root, target)).pack;
}

/**
 * A new, empty JSON pack in the project's first node path.
 *
 * The name is the file's, and the namespace its nodes will take. Refused when a
 * pack of that name already exists in any format — `hand.nodedef.json` beside
 * `hand.nodedef.luau` would be two packs a reader calls the same thing.
 */
export async function createPack(project: PackProject, rawName: string): Promise<PackFile> {
	const name = rawName.trim().replace(/[^A-Za-z0-9_-]/g, "");
	if (name === "") throw new Error("A pack needs a name: letters, digits, - and _.");
	const dir = toPosix(project.config.nodePaths[0] ?? ".roswaal/nodes").replace(/\/+$/, "");
	for (const suffix of [PACK_SUFFIX, ".nodedef.luau", ".nodedef.lua"]) {
		if (await exists(safeJoin(project.root, `${dir}/${name}${suffix}`))) {
			throw new Error(`There is already a pack called ${name}.`);
		}
	}
	const target = `${dir}/${name}${PACK_SUFFIX}`;
	await fs.mkdir(safeJoin(project.root, dir), { recursive: true });
	await fs.writeFile(safeJoin(project.root, target), JSON.stringify({ nodes: [] }, null, 2) + "\n", "utf8");
	return (await readPackAt(project.root, target)).pack;
}

/** One pack, with its nodes as written, for the designer to open. */
export async function readPack(project: PackProject, relPath: string): Promise<PackContents> {
	return readPackAt(project.root, assertPackPath(project, relPath));
}

/**
 * A copy of a pack beside it, as JSON, with its nodes moved to the copy's
 * namespace.
 *
 * Also what *Save as JSON pack* does for a Luau pack: the designer never writes
 * a `.nodedef.luau`, so an editable Luau pack is a JSON copy of one. The ids
 * move because two packs defining the same id is not an error — the later one
 * silently wins — so a copy keeping them would replace the original's nodes.
 */
export async function duplicatePack(project: PackProject, relPath: string): Promise<PackFile> {
	const source = await readPack(project, relPath);
	if (source.pack.errors.length > 0) {
		throw new Error(`${source.pack.path} has problems to fix before it can be copied: ${source.pack.errors.join(" ")}`);
	}
	const dir = path.posix.dirname(source.pack.path);
	let name = `${source.pack.name}-copy`;
	for (let n = 2; await exists(safeJoin(project.root, `${dir}/${name}${PACK_SUFFIX}`)); n++) {
		name = `${source.pack.name}-copy-${n}`;
	}
	const target = `${dir}/${name}${PACK_SUFFIX}`;
	const nodes = renamespace(source.nodes as { id: string }[], namespaceFor(name));
	const document: Record<string, unknown> = { nodes };
	if (source.pack.requires.length > 0) document.requires = source.pack.requires;

	const check = parseNodePack(document, path.posix.basename(target));
	if (check.errors.length > 0) throw new Error(check.errors.join(" "));
	await fs.writeFile(safeJoin(project.root, target), JSON.stringify(document, null, 2) + "\n", "utf8");
	return (await readPackAt(project.root, target)).pack;
}

/** Which graphs place a node from this pack, and how many each. */
export async function packUsage(
	project: OpenProject, relPath: string,
): Promise<{ graph: string; count: number }[]> {
	const ids = new Set((await readPack(project, relPath)).pack.nodes);
	const out: { graph: string; count: number }[] = [];
	for (const graph of await collectScripts(project)) {
		const script = await readScript(project, graph).catch(() => null);
		const count = script?.nodes.filter((n) => ids.has(n.def)).length ?? 0;
		if (count > 0) out.push({ graph, count });
	}
	return out;
}

/** Deletes a pack file. Only one of this project's, and only a pack. */
export async function deletePack(project: PackProject, relPath: string): Promise<void> {
	await fs.rm(safeJoin(project.root, assertPackPath(project, relPath)));
}

/** Another project's packs, for importing from, and what it compiles for. */
export async function scanProjectPacks(
	root: string,
): Promise<{ root: string; target: Target; packs: PackFile[] }> {
	const resolved = path.resolve(root);
	if (!(await exists(path.join(resolved, "roswaal.json")))) {
		throw new Error(`${resolved} is not a Roswaal project: it has no roswaal.json.`);
	}
	const config = await readConfig(resolved);
	return { root: resolved, target: config.target, packs: await listPacks({ root: resolved, config }) };
}

/**
 * Copies a pack file from one project into another's first node path.
 *
 * **The bytes, not a rewrite**, so a Luau pack keeps its comments. Refused when
 * the destination already has a pack of that name, or a pack defining any of
 * the same ids — which would silently replace nodes graphs there already use.
 * Import and *Copy to another project* are this in the two directions.
 */
export async function copyPackBetween(
	from: PackProject, relPath: string, to: PackProject,
): Promise<PackFile> {
	if (path.resolve(from.root) === path.resolve(to.root)) {
		throw new Error("That is this project. Use Duplicate to copy a pack within it.");
	}
	const source = await readPack(from, relPath);
	if (source.pack.errors.length > 0) {
		throw new Error(`${source.pack.path} has problems to fix first: ${source.pack.errors.join(" ")}`);
	}

	const existing = await listPacks(to);
	const fileName = path.posix.basename(source.pack.path);
	const dir = toPosix(to.config.nodePaths[0] ?? ".roswaal/nodes").replace(/\/+$/, "");
	const target = `${dir}/${fileName}`;
	if (await exists(safeJoin(to.root, target))) {
		throw new Error(`${target} already exists there.`);
	}
	for (const pack of existing) {
		const clash = clashingIds(source.pack.nodes, pack.nodes);
		if (clash.length > 0) {
			throw new Error(`${pack.path} there already defines ${clash.join(", ")}.`);
		}
	}

	await fs.mkdir(safeJoin(to.root, dir), { recursive: true });
	await fs.copyFile(safeJoin(from.root, source.pack.path), safeJoin(to.root, target));
	return (await readPackAt(to.root, target)).pack;
}

/**
 * Adds a node to a JSON pack, or replaces the one with its id.
 *
 * **JSON only, and that is not an oversight.** A `.nodedef.luau` pack is
 * hand-written and carries comments — the reason to choose Luau for one — and a
 * generator rewriting the file would take them out. The designer offers the
 * Luau form to copy instead, so a node can be added to one by hand.
 *
 * The whole file is parsed again after the change, by `parseNodePack`, which is
 * the same check loading it performs: a pack that would not load is refused
 * before it reaches disk rather than after.
 */
export async function savePackNode(
	project: OpenProject, relPath: string, def: NodeDef,
	/** The id the node had before, when the designer renamed it. */
	replaces?: string,
): Promise<PackFile> {
	const target = toPosix(relPath);
	if (!target.endsWith(PACK_SUFFIX)) {
		throw new Error(`A pack the designer writes is a ${PACK_SUFFIX} file. This one is ${target}.`);
	}
	const dirs = project.config.nodePaths.map((d) => toPosix(d).replace(/\/+$/, ""));
	if (!dirs.some((dir) => target.startsWith(dir + "/"))) {
		throw new Error(
			`${target} is not in a node path. This project loads packs from ${dirs.join(", ")}.`,
		);
	}

	const abs = safeJoin(project.root, target);
	const existing = await fs.readFile(abs, "utf8").catch(() => null);
	let nodes: NodeDef[] = [];
	// The pack's own settings — `requires`, `targets` — are kept as they were.
	// Writing back only the nodes would silently drop them.
	let settings: Record<string, unknown> = {};
	if (existing !== null) {
		const parsed = JSON.parse(existing) as ({ nodes?: NodeDef[] } & Record<string, unknown>) | NodeDef[];
		if (Array.isArray(parsed)) {
			nodes = parsed;
		} else {
			const { nodes: found, ...rest } = parsed;
			nodes = found ?? [];
			settings = rest;
		}
	}

	// A rename takes the old node's place in the file rather than leaving it
	// behind — and must not quietly overwrite a different node that already has
	// the new id.
	if (replaces !== undefined && replaces !== def.id) {
		if (nodes.some((node) => node.id === def.id)) {
			throw new Error(`${target} already has a node called ${def.id}.`);
		}
		const old = nodes.findIndex((node) => node.id === replaces);
		if (old !== -1) nodes[old] = def;
		else nodes.push(def);
	} else {
		const at = nodes.findIndex((node) => node.id === def.id);
		if (at === -1) nodes.push(def);
		else nodes[at] = def;
	}

	const document = { ...settings, nodes };
	const check = parseNodePack(document, path.posix.basename(target));
	if (check.errors.length > 0) throw new Error(check.errors.join(" "));

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, JSON.stringify(document, null, 2) + "\n", "utf8");

	return (await readPackAt(project.root, target)).pack;
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export async function buildTree(project: OpenProject): Promise<TreeEntry[]> {
	const generated = await generatedIndex(project);
	// Empty folders are noise everywhere except under sourceDir, where one is a
	// folder the developer just created and is about to put a graph in.
	const keepEmptyUnder = [project.config.sourceDir, ...project.config.nodePaths];
	return walk(project.root, project.root, generated, keepEmptyUnder);
}

async function walk(
	root: string, dir: string, generated: Map<string, string>, keepEmptyUnder: string[],
): Promise<TreeEntry[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: TreeEntry[] = [];

	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = path.relative(root, abs).split(path.sep).join("/");

		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const children = await walk(root, abs, generated, keepEmptyUnder);
			const keep =
				children.length > 0 ||
				keepEmptyUnder.some((base) => rel === base || rel.startsWith(base + "/") || base.startsWith(rel + "/"));
			if (!keep) continue;
			out.push({ path: rel, name: entry.name, kind: "directory", children });
			continue;
		}
		const kind = classify(entry.name);
		if (!kind) continue;
		const functions = kind === "nodescript" ? await functionsIn(abs) : [];
		out.push({
			path: rel,
			name: entry.name,
			kind,
			...(generated.has(rel) ? { generatedFrom: generated.get(rel) } : {}),
			...(functions.length > 0 ? { functions } : {}),
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
async function functionsIn(abs: string): Promise<FunctionInfo[]> {
	try {
		const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as Partial<NodeScript>;
		return Array.isArray(parsed.nodes) ? functionOutline({ nodes: parsed.nodes }) : [];
	} catch {
		return [];
	}
}

function classify(name: string): TreeEntry["kind"] | null {
	if (name.endsWith(".nodescript")) return "nodescript";
	if (name.endsWith(".nodemap")) return "nodemap";
	if (name.endsWith(".luau") || name.endsWith(".lua")) return "luau";
	return null;
}

/** Maps generated Luau back to the graph that produced it, via the header. */
async function generatedIndex(project: OpenProject): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const outDir = path.join(project.root, project.config.outDir);
	const stack = [outDir];

	while (stack.length) {
		const dir = stack.pop()!;
		const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
				continue;
			}
			if (!entry.name.endsWith(".luau") && !entry.name.endsWith(".lua")) continue;
			const head = (await fs.readFile(abs, "utf8").catch(() => "")).slice(0, 512);
			const match = /^-- roswaal-graph: (.+)$/m.exec(head);
			if (match) {
				map.set(path.relative(project.root, abs).split(path.sep).join("/"), match[1].trim());
			}
		}
	}
	return map;
}

// ---------------------------------------------------------------------------
// Graphs
// ---------------------------------------------------------------------------

export async function readScript(project: OpenProject, relPath: string): Promise<NodeScript> {
	const abs = safeJoin(project.root, relPath);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as NodeScript;
	if (parsed.schemaVersion > SCHEMA_VERSION) {
		throw new Error(
			`${relPath} was written by a newer version of Roswaal (schema ${parsed.schemaVersion}).`,
		);
	}

	const script = migrateScript(parsed, project.registry).script;

	/**
	 * **The file name is the name.**
	 *
	 * `name` is still stored — it is what a graph loaded without a path is
	 * called, and what `outputFileName` reads — but the value on disk is no
	 * longer *trusted*. Whenever a graph is read from a path, the path wins.
	 *
	 * This is what makes the two impossible to disagree rather than merely kept
	 * in step. 0.13.0 fixed the drift by having `renameEntry` write the new name
	 * into the file, which works but leaves the invariant depending on every
	 * future code path remembering to maintain it; deriving it here means there
	 * is nothing to remember. It also matches Rojo, which takes an instance's
	 * name from the file name and never from anything inside it.
	 *
	 * A consequence worth noticing: two graphs can no longer share a name within
	 * a folder, because two files cannot. The collision check in `compileScript`
	 * becomes a net under a floor rather than something you can walk off.
	 */
	const derived = graphNameFor(relPath);
	if (derived !== "") script.name = derived;

	return script;
}

/**
 * What the graph stored at this path is called.
 *
 * Split out so the rule is testable without a filesystem: the path wins, and
 * this is the whole of how it wins. Empty when the file name is punctuation all
 * the way down, at which point the stored name is kept — a graph with no name
 * at all would compile to `.luau`.
 */
export function graphNameFor(relPath: string): string {
	return graphName(path.posix.basename(toPosix(relPath), ".nodescript"));
}

export async function writeScript(
	project: OpenProject, relPath: string, script: NodeScript,
): Promise<void> {
	const abs = safeJoin(project.root, relPath);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, serialiseScript(script), "utf8");
}

export async function readText(project: OpenProject, relPath: string): Promise<string> {
	return fs.readFile(safeJoin(project.root, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// Node maps
// ---------------------------------------------------------------------------

export async function readMap(project: OpenProject, relPath: string): Promise<NodeMap> {
	const abs = safeJoin(project.root, relPath);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as NodeMap;
	if (parsed.schemaVersion > SCHEMA_VERSION) {
		throw new Error(
			`${relPath} was written by a newer version of Roswaal (schema ${parsed.schemaVersion}).`,
		);
	}
	return parsed;
}

export async function writeMap(
	project: OpenProject, relPath: string, map: NodeMap,
): Promise<void> {
	const abs = safeJoin(project.root, relPath);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, serialiseMap(map), "utf8");
}

export interface MapOutcome {
	mapPath: string;
	outputPath: string;
	written: boolean;
	skipped?: string;
	diagnostics: MapDiagnostic[];
	json: string;
}

/**
 * Compiles a node map to a Rojo project file.
 *
 * There is no hand-edit guard here, unlike generated Luau: a project file is
 * small, frequently hand-tuned, and Rojo itself rewrites it. Overwriting one
 * silently would be worse, so an existing file that Roswaal did not write is
 * refused outright rather than hashed.
 */
export async function compileMap(
	project: OpenProject, relPath: string, opts: { write?: boolean; force?: boolean } = {},
): Promise<MapOutcome> {
	const map = await readMap(project, relPath);
	const result = compileNodeMap(map);
	result.diagnostics.push(...(await checkMapPaths(project, map)));
	// Worked out after the path check, not before. `result.ok` is the map's own
	// verdict, and a `$path` that is not on disk is an error the map cannot see —
	// counting it only in the list let the file be written anyway.
	const ok = result.ok && !result.diagnostics.some((d) => d.severity === "error");

	const outcome: MapOutcome = {
		mapPath: relPath,
		outputPath: result.outputPath,
		written: false,
		diagnostics: result.diagnostics,
		json: result.json,
	};

	if (!opts.write) return outcome;
	if (!ok) {
		outcome.skipped = "The map has errors, so no project file was written.";
		return outcome;
	}

	const abs = safeJoin(project.root, result.outputPath);
	const existing = await fs.readFile(abs, "utf8").catch(() => null);
	// An earlier build stamped ownership into the document itself, which Rojo
	// rejects outright. A file carrying that stamp is still ours, and
	// overwriting it is what repairs the project.
	const legacyStamp = existing?.includes(LEGACY_OWNERSHIP_KEY) === true;

	if (
		existing !== null && !opts.force && !legacyStamp &&
		!(await isGenerated(project.root, result.outputPath))
	) {
		outcome.skipped =
			`${result.outputPath} was not generated by Roswaal. Compile with force to take it over, ` +
			"or point the map's output somewhere else.";
		return outcome;
	}

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, result.json, "utf8");
	await recordGenerated(project.root, result.outputPath, relPath);
	outcome.written = true;
	return outcome;
}

/**
 * Checks that every `$path` in a map points at something.
 *
 * This is the difference between a map that works and one that looks like it
 * does: Rojo does not complain about a path that is not there, it just builds
 * an empty instance. You find out in Studio, staring at a folder with nothing
 * in it and no idea why.
 *
 * Lives here rather than in compileNodeMap because it needs the filesystem,
 * and the core compiler deliberately has none.
 */
export async function checkMapPaths(
	project: OpenProject, map: NodeMap,
): Promise<MapDiagnostic[]> {
	const out: MapDiagnostic[] = [];
	const paths: { node: MapNode; path: string }[] = [];

	const visit = (node: MapNode) => {
		if (node.path) paths.push({ node, path: node.path });
		node.children.forEach(visit);
	};
	visit(map.root);

	for (const { node, path: relPath } of paths) {
		const abs = path.resolve(project.root, relPath);
		const stat = await fs.stat(abs).catch(() => null);
		if (!stat) {
			out.push({
				severity: "error",
				message:
					`"${node.name}" points at ${relPath}, which is not on disk. Rojo will build an ` +
					"empty instance rather than complain, so this is the only warning you get.",
				node: node.id,
			});
			continue;
		}
		if (stat.isDirectory()) {
			const entries = await fs.readdir(abs).catch(() => []);
			if (entries.length === 0) {
				out.push({
					severity: "warning",
					message: `"${node.name}" points at ${relPath}, which is empty.`,
					node: node.id,
				});
			}
		}
	}

	// One path nested inside another means the inner content is synced twice,
	// once under each instance. Usually a mistake, and always fixable with an
	// ignore glob on the outer one.
	for (const outer of paths) {
		for (const inner of paths) {
			if (outer === inner) continue;
			if (!inner.path.startsWith(outer.path.replace(/\/+$/, "") + "/")) continue;
			out.push({
				severity: "warning",
				message:
					`"${inner.node.name}" (${inner.path}) sits inside "${outer.node.name}" ` +
					`(${outer.path}), so its contents appear under both. Add an ignore path on ` +
					`"${outer.node.name}" to keep them apart.`,
				node: outer.node.id,
			});
		}
	}

	return out;
}

/**
 * Where a file in the project ends up in the DataModel.
 *
 * A graph resolves through its compiled output rather than its own path,
 * because that is the file the node map actually points at. Both are tried, so
 * a map aimed straight at the graphs directory works too.
 */
export async function locateFile(
	project: OpenProject, relPath: string,
): Promise<InstanceLocation | null> {
	const candidates = [relPath];

	if (relPath.endsWith(".nodescript")) {
		try {
			const script = await readScript(project, relPath);
			const result = compile(script, project.registry);
			const within = path.posix.dirname(
				toPosix(path.relative(project.config.sourceDir, relPath)),
			);
			candidates.unshift(
				path.posix.normalize(
					path.posix.join(project.config.outDir, within, result.fileName),
				),
			);
		} catch {
			// A graph that will not compile still has a source path worth trying.
		}
	}

	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath);
		for (const candidate of candidates) {
			const found = locateInDataModel(map, candidate);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Generated files with no graph behind them any more.
 *
 * Moving or renaming a graph writes its output somewhere new and leaves the old
 * file sitting there. Rojo has no way to know it is stale, so it syncs it, and
 * you get the same module in two places — which is confusing in exactly the way
 * that is hard to trace back to a rename.
 */
export async function findOrphanOutputs(project: OpenProject): Promise<string[]> {
	const expected = new Set<string>();
	for (const relPath of await collectScripts(project)) {
		try {
			const script = await readScript(project, relPath);
			const result = compile(script, project.registry);
			const within = path.posix.dirname(
				toPosix(path.relative(project.config.sourceDir, relPath)),
			);
			expected.add(
				path.posix.normalize(
					path.posix.join(project.config.outDir, within, result.fileName),
				),
			);
		} catch {
			// A graph that will not read cannot vouch for its output, so leave
			// anything it might own alone.
			return [];
		}
	}

	const orphans: string[] = [];
	for (const [output] of await generatedIndex(project)) {
		if (!expected.has(output)) orphans.push(output);
	}
	return orphans.sort();
}

/** A type a module in the project exports, and where that module lands. */
export interface ExportedType {
	/** The graph declaring it. */
	graph: string;
	name: string;
	/** Where the graph's module sits in the DataModel, when a node map says. */
	location: InstanceLocation | null;
}

/**
 * Every type a ModuleScript graph in the project exports.
 *
 * What another graph can name after requiring that module — `Config.Tuning` —
 * so the editor can offer it rather than leave it to be remembered and typed.
 * Only module graphs declaring an exported type are located, since locating
 * one means compiling it to learn its file name.
 */
export async function exportedTypes(project: OpenProject): Promise<ExportedType[]> {
	const out: ExportedType[] = [];
	for (const relPath of await collectScripts(project)) {
		const script = await readScript(project, relPath).catch(() => null);
		if (!script || !isModuleScript(script)) continue;

		const names = new Set<string>();
		for (const node of script.nodes) {
			if (node.def !== "type.declareTop" && node.def !== "type.declareHere") continue;
			const config = (node.config ?? {}) as { name?: string; export?: boolean };
			const name = (config.name ?? "").trim();
			if (config.export !== false && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
		}
		if (names.size === 0) continue;

		const location = await locateFile(project, relPath).catch(() => null);
		for (const name of names) out.push({ graph: relPath, name, location });
	}
	return out;
}

export async function removeOutputs(project: OpenProject, paths: string[]): Promise<number> {
	let removed = 0;
	for (const relPath of paths) {
		// Only ever delete something we can still see is generated.
		const abs = safeJoin(project.root, relPath);
		const head = (await fs.readFile(abs, "utf8").catch(() => "")).slice(0, 512);
		if (!head.includes("roswaal-graph:")) continue;
		await fs.rm(abs, { force: true });
		removed++;
	}
	return removed;
}

/**
 * Every text file in the project, for handing the whole thing over at once.
 *
 * What the hosted editor downloads as a zip, and the only way work done in a
 * browser tab leaves it.
 *
 * **By extension, deliberately.** The alternative -- everything under the root
 * that is not in `SKIP_DIRS` -- would read a `.rbxm` or a PNG as UTF-8 and hand
 * back something that is not the file. These are the extensions a Roswaal
 * project is made of: the graphs, the maps, the packs, the config, the
 * generated Luau and the Rojo project beside it. Anything else in the directory
 * is somebody else's, and a zip that quietly corrupts it is worse than one that
 * does not contain it.
 */
const EXPORTABLE = [
	".nodescript", ".nodemap", ".luau", ".lua", ".json", ".toml", ".md", ".txt",
];

export async function collectProject(project: OpenProject): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const stack = [project.root];

	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
				continue;
			}
			if (!EXPORTABLE.some((suffix) => entry.name.endsWith(suffix))) continue;
			const text = await fs.readFile(abs, "utf8").catch(() => null);
			if (text !== null) out[toPosix(path.relative(project.root, abs))] = text;
		}
	}
	return out;
}

export async function collectMaps(project: OpenProject): Promise<string[]> {
	const out: string[] = [];
	const stack = [path.join(project.root, project.config.sourceDir)];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(abs);
			else if (entry.name.endsWith(".nodemap")) {
				out.push(toPosix(path.relative(project.root, abs)));
			}
		}
	}
	return out.sort();
}

// ---------------------------------------------------------------------------
// Folders and entries
// ---------------------------------------------------------------------------

/**
 * Refuses a structural edit inside the output directory.
 *
 * Everything under outDir is generated: a folder made there is not a source
 * folder, and a graph moved there is not moved at all — the next compile
 * writes it back where it came from and leaves an orphan behind. Saying so is
 * kinder than letting it look like it worked.
 */
function assertEditable(project: OpenProject, relPath: string, verb: string): void {
	const out = project.config.outDir.replace(/\/+$/, "");
	const normalised = toPosix(relPath).replace(/^\.\//, "");
	if (normalised !== out && !normalised.startsWith(out + "/")) return;

	throw new Error(
		`${out} holds generated files, so there is nothing to ${verb} there. ` +
			`Work in ${project.config.sourceDir}; the folders you make there appear under ` +
			`${out} when you compile.`,
	);
}

/**
 * Directories under sourceDir mirror directories under outDir, which Rojo turns
 * into Folder instances. Making one here is how you get a folder in the
 * DataModel without touching the project file.
 */
export async function createFolder(project: OpenProject, relPath: string): Promise<string> {
	assertEditable(project, relPath, "create a folder");
	const abs = safeJoin(project.root, relPath);
	if (await exists(abs)) throw new Error(`${relPath} already exists.`);
	await fs.mkdir(abs, { recursive: true });
	return relPath;
}

export async function renameEntry(
	project: OpenProject, relPath: string, newName: string,
): Promise<string> {
	assertEditable(project, relPath, "rename anything");
	const clean = newName.replace(/[\\/:*?"<>|]/g, "").trim();
	if (clean === "") throw new Error("A name cannot be empty.");

	const source = safeJoin(project.root, relPath);
	const destRel = path.posix.join(path.posix.dirname(toPosix(relPath)), clean);
	const dest = safeJoin(project.root, destRel);
	if (source === dest) return destRel;
	if (await exists(dest)) throw new Error(`${destRel} already exists.`);
	await fs.rename(source, dest);

	/**
	 * A graph carries its own name, and that name — not the file's — is what the
	 * compiler writes out. Renaming the file alone left the two disagreeing with
	 * nothing to say so: `Hello.nodescript` went on producing `Greeter.luau`, and
	 * if some other graph was already called Hello, they silently shared a file.
	 *
	 * Only for graphs. A `.nodemap` takes its output from the map, a `.luau` is
	 * not ours to edit, and a folder has no inside to update.
	 */
	if (destRel.endsWith(".nodescript")) {
		const wanted = graphName(path.posix.basename(destRel, ".nodescript"));
		// An empty result means the new file name was punctuation all the way
		// down. Leaving the old name is worse than nothing, but inventing
		// "Untitled" here would rename the graph behind the developer's back.
		if (wanted !== "") {
			const script = await readScript(project, destRel);
			if (script.name !== wanted) {
				script.name = wanted;
				await writeScript(project, destRel, script);
			}
		}
	}

	return destRel;
}

export async function moveEntry(
	project: OpenProject, from: string, toDir: string,
): Promise<string> {
	assertEditable(project, from, "move anything");
	assertEditable(project, toDir, "move anything");
	const source = safeJoin(project.root, from);
	const name = path.basename(from);
	const destRel = path.posix.join(toDir, name);
	const dest = safeJoin(project.root, destRel);
	if (source === dest) return destRel;
	if (await exists(dest)) throw new Error(`${destRel} already exists.`);
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.rename(source, dest);
	return destRel;
}

export async function deleteEntry(project: OpenProject, relPath: string): Promise<void> {
	// Recursive, because folders are now something the tree can create.
	await fs.rm(safeJoin(project.root, relPath), { recursive: true, force: false });
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface CompileOutcome {
	scriptPath: string;
	outputPath: string;
	written: boolean;
	/** Set when the write was refused, e.g. the target was edited by hand. */
	skipped?: string;
	/**
	 * Files this graph used to produce and no longer does, now deleted.
	 *
	 * Reported rather than silent. Deleting is deleting even when it is
	 * obviously right, and "moved Config.luau to Tank/Config.luau" is a line
	 * somebody may need to find later.
	 */
	superseded?: string[];
	diagnostics: CompileResult["diagnostics"];
	sourceMap: CompileResult["sourceMap"];
	code: string;
}

/**
 * The name a graph carries inside itself, from a file or folder name.
 *
 * One function, because the two places that decide it used to be two places:
 * creating a graph sanitised the name it was given, and renaming the file did
 * not touch the name at all. A graph's own name is what the compiler writes
 * out — see `outputFileName` — so the second of those meant `Hello.nodescript`
 * went on compiling to `Greeter.luau` with nothing anywhere saying so.
 *
 * Returns "" when nothing survives sanitising; the caller decides what to do
 * about that, because creating and renaming want different answers.
 */
export function graphName(raw: string): string {
	return raw.replace(/[^A-Za-z0-9_ -]/g, "").trim();
}

/**
 * The graph that already wrote this file in the current compile, if any.
 *
 * Two graphs with the same name compile to the same path, and the second used
 * to overwrite the first and report `wrote` for both — the compile said
 * "1202 of 1202 written" while 1200 of them were the same file. Pure, so the
 * decision is testable without a filesystem; the map is threaded through
 * `compileAll` so a single-file compile has no opinion about it.
 */
export function outputCollision(
	claimed: Map<string, string> | undefined, outputPath: string, relPath: string,
): string | null {
	const owner = claimed?.get(outputPath);
	return owner !== undefined && owner !== relPath ? owner : null;
}

/**
 * Files this graph used to write and no longer does.
 *
 * Renaming a graph, dragging it into another folder, or switching it between
 * Script and ModuleScript all change **where** it compiles to while leaving the
 * graph itself the same graph. Without this the old file stays exactly where it
 * was, Rojo goes on syncing it, and the game ends up with two copies of the
 * module — one of which nothing is maintaining.
 *
 * Safe to act on without asking, unlike `findOrphanOutputs`, and the difference
 * is worth being precise about. That one looks for anything unaccounted for,
 * which can catch a file somebody put there deliberately, so it reports and
 * waits. This only names files whose own header says **this exact graph**
 * produced them, at the moment that graph has just produced a different one.
 * There is no judgement in it: the file says who owns it, and the owner moved.
 *
 * Pure, and exported, for the reason the rest of this file's decisions are: the
 * consequence is a deleted file, and a rule with that consequence should be
 * checkable without a temporary directory and a project to put in it.
 */
export function supersededOutputs(
	generated: Map<string, string>, graphId: string, keepPath: string,
): string[] {
	const out: string[] = [];
	for (const [outPath, owner] of generated) {
		if (owner === graphId && outPath !== keepPath) out.push(outPath);
	}
	return out.sort();
}

async function removeSupersededOutputs(
	project: OpenProject, graphId: string, keepPath: string,
): Promise<string[]> {
	const stale = supersededOutputs(await generatedIndex(project), graphId, keepPath);
	for (const relPath of stale) {
		await fs.rm(safeJoin(project.root, relPath), { force: true });
	}
	return stale;
}

export async function compileScript(
	project: OpenProject,
	relPath: string,
	opts: {
		write?: boolean;
		force?: boolean;
		/** Output paths already written this compile, keyed to the graph that did. */
		claimed?: Map<string, string>;
	} = {},
): Promise<CompileOutcome> {
	const script = await readScript(project, relPath);
	const result = compile(script, project.registry, {
		indent: indentUnit(project.config),
		comments: project.config.comments,
	});

	// Formatting happens before the output hash is stamped, so the hash always
	// describes the bytes that actually land on disk.
	const formatted = project.config.format
		? formatLuau(project.root, result.code, project.config)
		: result.code;
	const code = stampOutputHash(formatted);

	const outputPath = path.posix.join(
		project.config.outDir,
		path.posix.dirname(toPosix(path.relative(project.config.sourceDir, relPath))),
		result.fileName,
	).replace(/\/\.\//g, "/");

	const outcome: CompileOutcome = {
		scriptPath: relPath,
		outputPath: path.posix.normalize(outputPath),
		written: false,
		diagnostics: result.diagnostics,
		sourceMap: result.sourceMap,
		code,
	};

	if (!opts.write) return outcome;
	if (!result.ok) {
		outcome.skipped = "The graph has errors, so no file was written.";
		return outcome;
	}

	// Checked before the hand-edit guard, because a file the last graph wrote
	// thirty milliseconds ago passes that guard perfectly.
	const clash = outputCollision(opts.claimed, outcome.outputPath, relPath);
	if (clash) {
		outcome.skipped =
			`${outcome.outputPath} was already written by ${clash} in this compile. ` +
			`Both graphs are named "${script.name}", and a graph's own name is what it ` +
			"compiles to — rename one of them.";
		// An error rather than a skip, so it is counted with the failures and the
		// panel does not offer to overwrite: overwriting is what already happened,
		// and doing it again just picks a different winner.
		outcome.diagnostics = [
			...outcome.diagnostics,
			{ severity: "error", message: outcome.skipped },
		];
		return outcome;
	}

	const abs = safeJoin(project.root, outcome.outputPath);
	const guard = await checkHandEdited(abs);
	if (guard && !opts.force) {
		outcome.skipped = guard;
		return outcome;
	}

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, code, "utf8");
	outcome.written = true;
	// After the write, not before: if writing fails, the file the graph used to
	// produce is the only one left and deleting it first would lose both.
	outcome.superseded = await removeSupersededOutputs(project, script.id, outcome.outputPath);
	// Claimed only once it is actually on disk, so a graph that was refused does
	// not take the name away from the next one.
	opts.claimed?.set(outcome.outputPath, relPath);
	return outcome;
}

/**
 * One file's turn in a project compile, reported as it happens.
 *
 * `compileAll` returns everything at once, at the end, which makes a slow
 * project look exactly like a stuck one. These are pushed per file so the
 * status panel can show the walk rather than only its result — and the useful
 * part is *which file* and *what happened to it*, not that something is
 * happening, which is why this carries a path and a verdict rather than a
 * percentage.
 */
export interface CompileStep {
	/** 1-based position in the walk, and how long the walk is. */
	index: number;
	total: number;
	scriptPath: string;
	/**
	 * `working` is sent before the file is compiled and is the only state that
	 * is not a verdict. It is the one that distinguishes slow from stuck, so it
	 * is sent even though the verdict usually follows within milliseconds.
	 */
	state: "working" | "wrote" | "skipped" | "failed" | "checked";
	/** Why, on `skipped` and `failed`. Nothing to add on the other three. */
	note?: string;
}

/**
 * What a finished outcome should be called.
 *
 * Split out and exported because the alternative is the editor deciding for
 * itself what "written: false, no skip reason" means, and the two would
 * disagree the first time a case was added here. Pure, so it is tested
 * directly rather than through a compile.
 *
 * The distinction that matters is **skipped versus failed**: a skipped file has
 * something the developer can do about it — overwrite the hand edit — and the
 * panel offers that. A failed one has an error in the graph, and offering to
 * overwrite it would write nothing.
 */
export function describeOutcome(outcome: CompileOutcome): Pick<CompileStep, "state" | "note"> {
	if (outcome.written) return { state: "wrote" };

	const error = outcome.diagnostics.find((d) => d.severity === "error");
	if (error) return { state: "failed", note: outcome.skipped ?? error.message };
	if (outcome.skipped) return { state: "skipped", note: outcome.skipped };

	// Nothing written, nothing wrong: this was a check rather than a compile.
	return { state: "checked" };
}

export async function compileAll(
	project: OpenProject,
	opts: { write?: boolean; force?: boolean } = {},
	onStep?: (step: CompileStep) => void,
): Promise<CompileOutcome[]> {
	const scripts = await collectScripts(project);
	const out: CompileOutcome[] = [];
	const total = scripts.length;
	/**
	 * What each output file was written by, so the second graph to claim a path
	 * is refused rather than quietly overwriting the first. Per compile, not per
	 * project: a file left over from last time is the hand-edit guard's problem.
	 */
	const claimed = new Map<string, string>();

	for (const [i, rel] of scripts.entries()) {
		const where = { index: i + 1, total, scriptPath: rel };
		onStep?.({ ...where, state: "working" });
		try {
			const outcome = await compileScript(project, rel, { ...opts, claimed });
			out.push(outcome);
			onStep?.({ ...where, ...describeOutcome(outcome) });
		} catch (err) {
			const message = (err as Error).message;
			out.push({
				scriptPath: rel,
				outputPath: "",
				written: false,
				skipped: message,
				diagnostics: [{ severity: "error", message }],
				sourceMap: [],
				code: "",
			});
			// Reported rather than derived from the outcome above: a throw is a
			// failure whatever the synthesised outcome happens to look like.
			onStep?.({ ...where, state: "failed", note: message });
		}
	}
	return out;
}

async function collectScripts(project: OpenProject): Promise<string[]> {
	const out: string[] = [];
	const stack = [path.join(project.root, project.config.sourceDir)];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(abs);
			else if (entry.name.endsWith(".nodescript")) {
				out.push(toPosix(path.relative(project.root, abs)));
			}
		}
	}
	return out.sort();
}

/**
 * Returns a warning when the target file no longer matches the output hash in
 * its own header, which means somebody edited generated code by hand. Roswaal
 * would rather refuse than quietly eat that work.
 */
async function checkHandEdited(abs: string): Promise<string | null> {
	const existing = await fs.readFile(abs, "utf8").catch(() => null);
	if (existing === null) return null;

	const parts = splitGenerated(existing);
	if (!parts) {
		return `${path.basename(abs)} was not generated by Roswaal. Delete it, or point outDir elsewhere.`;
	}
	if (hashBody(parts.body) !== parts.declaredHash) {
		return `${path.basename(abs)} has been edited by hand since it was generated. Recompile with force to overwrite it.`;
	}
	return null;
}

/** Splits a generated file into its header hash and its body. */
export function splitGenerated(text: string): { declaredHash: string; body: string } | null {
	const lines = text.split("\n");
	const i = lines.findIndex((l) => l.startsWith("-- roswaal-output:"));
	if (i === -1) return null;
	return {
		declaredHash: lines[i].slice("-- roswaal-output:".length).trim(),
		body: lines.slice(i + 2).join("\n"),
	};
}

/**
 * The hash of a generated file's body, ignoring how its lines happen to end.
 *
 * Roswaal writes LF. Git on Windows checks the same file out as CRLF, and the
 * hash in the header no longer described the bytes on disk — so cloning a
 * repository and compiling it refused every generated file as "edited by hand",
 * on a file nobody had touched. The hash is meant to answer "has someone
 * changed this code", and a line ending applied by version control is not
 * someone changing the code.
 *
 * Normalising rather than re-stamping, because the file on disk is not ours to
 * rewrite just to make our own hash agree with it. Existing hashes are
 * unaffected: they were computed over LF, and this is a no-op on LF.
 */
function hashBody(body: string): string {
	return hashString(body.replace(/\r\n/g, "\n"));
}

/** Recomputes the output hash after formatting and rewrites the header line. */
export function stampOutputHash(code: string): string {
	const parts = splitGenerated(code);
	if (!parts) return code;
	return code.replace(
		/^-- roswaal-output: .*$/m,
		`-- roswaal-output: ${hashBody(parts.body)}`,
	);
}

export { formatLuau };

// ---------------------------------------------------------------------------

/**
 * A path with forward slashes, whatever produced it.
 *
 * **Both separators, not this machine's.** The paths that reach here come from
 * two places and only one of them is local: `path.join` and `path.relative`
 * give this platform's separator, and a request from an editor carries whatever
 * *that* machine calls a path -- which may be a backslash while the daemon is
 * on Linux.
 *
 * Splitting on `path.sep` handled the first and silently kept the second, so
 * `scripts\Shared\Greeter.nodescript` derived a graph called
 * `scriptsSharedGreeter` on a Linux daemon and `Greeter` on a Windows one. The
 * test for it had been passing since it was written, because it had only ever
 * run on Windows; the first CI run on Linux is what found this.
 *
 * Every caller-supplied path goes through here -- `assertPackPath`,
 * `savePackNode`, `assertEditable`, `renameEntry`, `graphNameFor` -- so the
 * separator stops mattering at the edge rather than at each of them.
 *
 * The cost is that a backslash can no longer be part of a file name on a
 * platform that allows one. Roswaal will not write such a name (`renameEntry`
 * strips it, and so does `graphName`), so a file carrying one is a file it did
 * not make and could not have named.
 */
function toPosix(p: string): string {
	return p.replace(/\\/g, "/");
}

/** Refuses any path that would escape the project root. */
export function safeJoin(root: string, relPath: string): string {
	const abs = path.resolve(root, relPath);
	const rel = path.relative(root, abs);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Path escapes the project: ${relPath}`);
	}
	return abs;
}

async function exists(abs: string): Promise<boolean> {
	return fs.access(abs).then(() => true, () => false);
}
