/**
 * Node packs on disk: listing them, reading one as written, and the edits the
 * Node Designer makes to a JSON pack.
 *
 * Loading packs into a project's registry is `config.ts`'s, when a project is
 * opened; this is the designer's side, which reads and writes the files.
 */

import { parseLuauData } from "../core/luauData.js";
import { parseNodePack } from "../core/nodes/index.js";
import {
	clashingIds,
	namespaceFor,
	packRequires,
	packTargets,
	renamespace,
} from "../core/packs.js";
import type { NodeDef, Target } from "../core/schema.js";
import { isInitialised, type OpenProject, readConfig } from "./config.js";
import { collectScripts, readScript } from "./documents.js";
import { errorMessage, UserError } from "./errors.js";
import { exists } from "./files.js";
import { fs, path } from "./host.js";
import { safeJoin, toPosix } from "./paths.js";

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
		const nodes = Array.isArray(document.nodes)
			? (document.nodes as Record<string, unknown>[])
			: [];
		return { pack, nodes, defs: parsed.defs };
	} catch (err) {
		pack.errors = [errorMessage(err)];
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

/**
 * A pack file that is in one of the project's node paths, or an error saying
 * where they are.
 *
 * Normalised before the prefix is compared, both sides: otherwise
 * `.roswaal/nodes/../../x.nodedef.json` starts with a node path and lands
 * outside it.
 */
function assertPackPath(project: PackProject, relPath: string): string {
	const target = path.posix.normalize(toPosix(relPath));
	if (!packFormat(path.posix.basename(target))) {
		throw new UserError(
			`${target} is not a node pack. A pack is a .nodedef.json or .nodedef.luau file.`,
		);
	}
	const dirs = project.config.nodePaths.map((d) =>
		path.posix.normalize(toPosix(d)).replace(/\/+$/, ""),
	);
	if (!dirs.some((dir) => target.startsWith(dir + "/"))) {
		throw new UserError(
			`${target} is not in a node path. This project loads packs from ${dirs.join(", ")}.`,
		);
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
export async function setPackRequires(
	project: PackProject,
	relPath: string,
	requires: string[],
): Promise<PackFile> {
	const target = assertPackPath(project, relPath);
	if (!target.endsWith(PACK_SUFFIX)) {
		throw new UserError(`${target} is a Luau pack, which the designer does not rewrite.`);
	}
	const abs = safeJoin(project.root, target);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as Record<string, unknown> | unknown[];
	const { requires: _old, nodes, ...rest } = Array.isArray(parsed) ? { nodes: parsed } : parsed;
	const clean = [...new Set(packRequires(requires))];
	const document = {
		...(clean.length > 0 ? { requires: clean } : {}),
		...rest,
		nodes: nodes ?? [],
	};
	await fs.writeFile(abs, JSON.stringify(document, null, 2) + "\n", "utf8");
	return (await readPackAt(project.root, target)).pack;
}

/** Takes one node out of a JSON pack. */
export async function deletePackNode(
	project: PackProject,
	relPath: string,
	id: string,
): Promise<PackFile> {
	const target = assertPackPath(project, relPath);
	if (!target.endsWith(PACK_SUFFIX)) {
		throw new UserError(`${target} is a Luau pack, which the designer does not rewrite.`);
	}
	const abs = safeJoin(project.root, target);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as
		| { nodes?: { id: string }[] }
		| { id: string }[];
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
	if (name === "") throw new UserError("A pack needs a name: letters, digits, - and _.");
	const dir = toPosix(project.config.nodePaths[0] ?? ".roswaal/nodes").replace(/\/+$/, "");
	for (const suffix of [PACK_SUFFIX, ".nodedef.luau", ".nodedef.lua"]) {
		if (await exists(safeJoin(project.root, `${dir}/${name}${suffix}`))) {
			throw new UserError(`There is already a pack called ${name}.`);
		}
	}
	const target = `${dir}/${name}${PACK_SUFFIX}`;
	await fs.mkdir(safeJoin(project.root, dir), { recursive: true });
	await fs.writeFile(
		safeJoin(project.root, target),
		JSON.stringify({ nodes: [] }, null, 2) + "\n",
		"utf8",
	);
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
		throw new UserError(
			`${source.pack.path} has problems to fix before it can be copied: ${source.pack.errors.join(" ")}`,
		);
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
	if (check.errors.length > 0) throw new UserError(check.errors.join(" "));
	await fs.writeFile(
		safeJoin(project.root, target),
		JSON.stringify(document, null, 2) + "\n",
		"utf8",
	);
	return (await readPackAt(project.root, target)).pack;
}

/** Which graphs place a node from this pack, and how many each. */
export async function packUsage(
	project: OpenProject,
	relPath: string,
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
	if (!(await isInitialised(resolved))) {
		throw new UserError(`${resolved} is not a Roswaal project: it has no roswaal.json.`);
	}
	const config = await readConfig(resolved);
	return {
		root: resolved,
		target: config.target,
		packs: await listPacks({ root: resolved, config }),
	};
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
	from: PackProject,
	relPath: string,
	to: PackProject,
): Promise<PackFile> {
	if (path.resolve(from.root) === path.resolve(to.root)) {
		throw new UserError("That is this project. Use Duplicate to copy a pack within it.");
	}
	const source = await readPack(from, relPath);
	if (source.pack.errors.length > 0) {
		throw new UserError(
			`${source.pack.path} has problems to fix first: ${source.pack.errors.join(" ")}`,
		);
	}

	const existing = await listPacks(to);
	const fileName = path.posix.basename(source.pack.path);
	const dir = toPosix(to.config.nodePaths[0] ?? ".roswaal/nodes").replace(/\/+$/, "");
	const target = `${dir}/${fileName}`;
	if (await exists(safeJoin(to.root, target))) {
		throw new UserError(`${target} already exists there.`);
	}
	for (const pack of existing) {
		const clash = clashingIds(source.pack.nodes, pack.nodes);
		if (clash.length > 0) {
			throw new UserError(`${pack.path} there already defines ${clash.join(", ")}.`);
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
	project: OpenProject,
	relPath: string,
	given: NodeDef,
	/** The id the node had before, when the designer renamed it. */
	replaces?: string,
): Promise<PackFile> {
	// Which file a node came from is the loader's to say, not the file's.
	const { pack: _from, ...def } = given;
	const named = toPosix(relPath);
	if (!named.endsWith(PACK_SUFFIX)) {
		throw new UserError(
			`A pack the designer writes is a ${PACK_SUFFIX} file. This one is ${named}.`,
		);
	}
	const target = assertPackPath(project, named);

	const abs = safeJoin(project.root, target);
	const existing = await fs.readFile(abs, "utf8").catch(() => null);
	let nodes: NodeDef[] = [];
	// The pack's own settings — `requires`, `targets` — are kept as they were.
	// Writing back only the nodes would silently drop them.
	let settings: Record<string, unknown> = {};
	if (existing !== null) {
		const parsed = JSON.parse(existing) as
			| ({ nodes?: NodeDef[] } & Record<string, unknown>)
			| NodeDef[];
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
			throw new UserError(`${target} already has a node called ${def.id}.`);
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
	if (check.errors.length > 0) throw new UserError(check.errors.join(" "));

	await fs.mkdir(path.dirname(abs), { recursive: true });
	await fs.writeFile(abs, JSON.stringify(document, null, 2) + "\n", "utf8");

	return (await readPackAt(project.root, target)).pack;
}
