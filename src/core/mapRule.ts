/**
 * The reading rule: how a node map's two sides follow from each other.
 *
 * A map pairs instances in the DataModel with folders on disk, and every
 * editor drawn for it so far asked you to know both hierarchies and match them
 * by hand. Most projects never need that. Roswaal already lays graphs, their
 * Luau and the DataModel out as mirrors of one another -- `src/ReplicatedStorage/Tank`
 * is ReplicatedStorage › Tank -- so one side can be read off the other:
 *
 * - a folder named for a service lands in that service;
 * - Rojo's own template folders land where `rojo init` puts them: `shared` in
 *   ReplicatedStorage, `server` in ServerScriptService, `client` in
 *   StarterPlayer › StarterPlayerScripts, and Wally's `Packages` beside them;
 * - anything else lands inside its parent, as a Folder.
 *
 * So the map editor can be worked from either end -- the DataModel or the
 * output folder -- and fill in the other. A mapping whose path the rule would
 * not have given is an **exception**: legal, kept, and listed by name, because
 * it is the one place a reader has to look at both sides.
 */

import {
	findMapNode,
	type MapNode,
	mapNodeParent,
	mapNodeUpdate,
	type NodeMap,
} from "./nodemap.js";
import { isService } from "./roblox.js";
import { locateUnder, mappedPaths, normalisePath } from "./rojoPaths.js";

/**
 * Folders Rojo's template and Wally name, and where each lands. `${out}` is the
 * output folder; the package folders sit at the project's root, as Wally
 * installs them.
 */
export const TEMPLATE_FOLDERS: readonly { at: string; segments: readonly string[] }[] = [
	{ at: "${out}/shared", segments: ["ReplicatedStorage"] },
	{ at: "${out}/server", segments: ["ServerScriptService"] },
	{ at: "${out}/client", segments: ["StarterPlayer", "StarterPlayerScripts"] },
	{ at: "Packages", segments: ["ReplicatedStorage", "Packages"] },
	{ at: "ServerPackages", segments: ["ServerScriptService", "ServerPackages"] },
	{ at: "DevPackages", segments: ["ReplicatedStorage", "DevPackages"] },
];

const templateAt = (outDir: string, at: string): string =>
	normalisePath(at.replace("${out}", normalisePath(outDir)));

const sameTrail = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((one, i) => one === b[i]);

/** The folder the rule gives an instance: the output folder, then the names down to it. */
export function rulePath(outDir: string, segments: readonly string[]): string {
	return normalisePath([normalisePath(outDir), ...segments].filter(Boolean).join("/"));
}

/** Every folder the rule accepts for an instance: its mirror, and a template folder that names it. */
export function rulePaths(outDir: string, segments: readonly string[]): string[] {
	const out = [rulePath(outDir, segments)];
	for (const one of TEMPLATE_FOLDERS) {
		if (sameTrail(one.segments, segments)) out.push(templateAt(outDir, one.at));
	}
	return out;
}

/**
 * Where the rule puts a folder, as instance names from the DataModel down; null
 * where it says nothing. A folder under the output folder lands in the service
 * it is named for, or where the template puts it; the output folder itself, and
 * a folder named for no service, land nowhere until something maps them.
 */
export function ruleLanding(outDir: string, folder: string): string[] | null {
	const at = normalisePath(folder);
	for (const one of TEMPLATE_FOLDERS) {
		const base = templateAt(outDir, one.at);
		if (at === base) return [...one.segments];
		if (at.startsWith(`${base}/`))
			return [...one.segments, ...at.slice(base.length + 1).split("/")];
	}
	const out = normalisePath(outDir);
	if (!at.startsWith(`${out}/`)) return null;
	const parts = at.slice(out.length + 1).split("/");
	return isService(parts[0]) ? parts : null;
}

/**
 * Where a folder lands under this map: the deepest mapping it is inside, then
 * its own names below that. Null for a folder no mapping reaches, which Rojo
 * does not sync.
 */
export function landingOf(map: NodeMap, folder: string): string[] | null {
	const found = locateUnder(mappedPaths(map.root), folder);
	if (!found) return null;
	return [...found.segments, ...found.parts, ...(found.leaf === undefined ? [] : [found.leaf])];
}

/** The names from the DataModel down to a node, not counting the DataModel. */
export function trailOf(map: NodeMap, id: string): string[] {
	const out: string[] = [];
	let at = findMapNode(map.root, id);
	while (at && at !== map.root) {
		out.unshift(at.name);
		at = mapNodeParent(map.root, at.id);
	}
	return out;
}

/** A mapping whose folder is not the one the rule would give it. */
export interface RuleException {
	node: string;
	name: string;
	/** The instance names down to it. */
	trail: string[];
	/** Its folder, as the map has it. */
	path: string;
	/** The folder the rule gives it. */
	expected: string;
}

/**
 * Every mapping that breaks the rule, in tree order. A path with an extension
 * is a file, not a folder the rule speaks for, so it is always an exception.
 */
export function ruleExceptions(map: NodeMap, outDir: string): RuleException[] {
	const out: RuleException[] = [];
	const visit = (node: MapNode, trail: string[]) => {
		if (node !== map.root && node.path) {
			const path = normalisePath(node.path);
			if (!rulePaths(outDir, trail).includes(path)) {
				out.push({
					node: node.id,
					name: node.name,
					trail,
					path,
					expected: rulePath(outDir, trail),
				});
			}
		}
		for (const child of node.children) visit(child, [...trail, child.name]);
	};
	visit(map.root, []);
	return out;
}

/**
 * The folder a node's contents come from: its own path, or the one an
 * ancestor syncs with its names below it. Undefined for a node nothing syncs.
 */
export function syncedFolderOf(map: NodeMap, id: string): string | undefined {
	const below: string[] = [];
	let at = findMapNode(map.root, id);
	while (at) {
		if (at.path) return normalisePath([normalisePath(at.path), ...below].join("/"));
		if (at === map.root) return undefined;
		below.unshift(at.name);
		at = mapNodeParent(map.root, at.id);
	}
	return undefined;
}

/**
 * What adding a folder called `name` under `parent` makes.
 *
 * Under a node something already syncs, a **folder on disk**: Rojo brings it
 * in through the folder above it, and a mapping of its own would sync it twice.
 * Anywhere else, a **mapping** with the folder the rule gives it, which
 * compiling the map makes.
 */
export function newFolderFor(
	map: NodeMap,
	outDir: string,
	parent: string,
	name: string,
): { kind: "disk"; path: string } | { kind: "map"; path: string } {
	const synced = syncedFolderOf(map, parent);
	if (synced !== undefined) return { kind: "disk", path: `${synced}/${name}` };
	return { kind: "map", path: rulePath(outDir, [...trailOf(map, parent), name]) };
}

/**
 * Renames a node, and moves the folders the rule gave it and everything under
 * it to the new name: Tank's `src/ReplicatedStorage/Tank` becomes
 * `src/ReplicatedStorage/Vehicle` with it. A folder that is an exception is
 * the author's own choice and stays where it is.
 */
export function renameByRule(map: NodeMap, outDir: string, id: string, name: string): MapNode {
	const trail = trailOf(map, id);
	if (trail.length === 0) return map.root;
	const from = rulePath(outDir, trail);
	const to = rulePath(outDir, [...trail.slice(0, -1), name]);
	const target = findMapNode(map.root, id);
	const follows = target !== null && (!target.path || normalisePath(target.path) === from);
	const move = (node: MapNode): MapNode => {
		const at = node.path === undefined ? undefined : normalisePath(node.path);
		const path =
			follows && at !== undefined && (at === from || at.startsWith(`${from}/`))
				? to + at.slice(from.length)
				: node.path;
		return { ...node, ...(path === undefined ? {} : { path }), children: node.children.map(move) };
	};
	const rename = (node: MapNode): MapNode =>
		node.id === id ? move({ ...node, name }) : { ...node, children: node.children.map(rename) };
	return rename(map.root);
}

/**
 * Makes the mappings down to `segments`, the last one syncing `path`, and
 * returns the tree with the last one's id: what "Map it" and a dropped folder
 * do. A service the map lacks is added as one; anything else between is a
 * Folder. A node already there is reused, and given the path if it has none.
 */
export function mapAt(
	root: MapNode,
	segments: readonly string[],
	path: string,
	makeId: () => string,
): { root: MapNode; id: string } {
	let id = root.id;
	const walk = (node: MapNode, depth: number): MapNode => {
		if (depth === segments.length) {
			id = node.id;
			return node.path ? node : { ...node, path };
		}
		const name = segments[depth];
		const found = node.children.find((one) => one.name === name);
		const child: MapNode = found ?? {
			id: makeId(),
			name,
			...(depth === 0 && isService(name) ? {} : { className: "Folder" }),
			children: [],
		};
		const next = walk(child, depth + 1);
		return {
			...node,
			children: found
				? node.children.map((one) => (one === found ? next : one))
				: [...node.children, next],
		};
	};
	return { root: walk(root, 0), id };
}

/**
 * Whether a node says nothing a folder on disk would not: a Folder, or a
 * service-less instance with no class, and no Rojo settings of its own.
 */
function onlyAFolder(node: MapNode): boolean {
	return (
		(node.className === undefined || node.className === "Folder") &&
		!node.statedClass &&
		!node.ignoreUnknown &&
		!(node.ignorePaths && node.ignorePaths.length > 0) &&
		!(node.properties && Object.keys(node.properties).length > 0) &&
		!(node.rojo && Object.keys(node.rojo).length > 0)
	);
}

/**
 * Whether a node inside a folder being synced can go, because Rojo would bring
 * the same thing in through that folder: a plain folder at the path the folder
 * gives it, or one with no path whose children all can go too.
 */
function absorbable(node: MapNode, base: string): boolean {
	if (!onlyAFolder(node)) return false;
	const here = `${base}/${node.name}`;
	if (node.path !== undefined) {
		if (normalisePath(node.path) !== here) return false;
	} else if (node.children.length === 0) {
		return false;
	}
	return node.children.every((child) => absorbable(child, here));
}

/**
 * Makes a node sync its own folder, the one the reading rule gives it. A
 * mapping below it that only named a folder inside that one goes: Rojo brings
 * the folder in through this one, and keeping both would sync it twice.
 * Anything that says more -- a Model, a property, a folder from elsewhere --
 * stays.
 */
export function syncHere(map: NodeMap, outDir: string, id: string): MapNode {
	const path = rulePath(outDir, trailOf(map, id));
	return mapNodeUpdate(map.root, id, (node) => ({
		...node,
		path,
		children: node.children.filter((child) => !absorbable(child, path)),
	}));
}

/**
 * Makes a node pass through: it syncs nothing itself and only holds what is
 * under it. Each folder inside the one it synced is mapped on its own, so what
 * was in Studio stays there. Files loose in the folder itself have nowhere to
 * go and stop syncing, which `looseFiles` lets the editor say.
 */
export function passThrough(
	map: NodeMap,
	id: string,
	folders: readonly string[],
	makeId: () => string,
): MapNode {
	return mapNodeUpdate(map.root, id, (node) => {
		const base = node.path === undefined ? undefined : normalisePath(node.path);
		const named = new Set(node.children.map((child) => child.name));
		const added: MapNode[] =
			base === undefined
				? []
				: folders
						.filter((name) => !named.has(name))
						.map((name) => ({
							id: makeId(),
							name,
							className: "Folder",
							path: `${base}/${name}`,
							children: [],
						}));
		const { path: _dropped, ...rest } = node;
		return { ...rest, children: [...node.children, ...added] };
	});
}

/** A path's parts, for a breadcrumb or a chip. */
export const pathParts = (path: string): string[] => normalisePath(path).split("/").filter(Boolean);
