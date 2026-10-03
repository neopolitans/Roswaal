/**
 * The disk half of following a `require`: an instance path or a string, from
 * a file, to the file it reaches -- through the project's node maps, Wally's
 * thunks and the package's own project file, and `.luaurc` aliases -- and what
 * that module gives back. `core/luau/requires.ts` is the half that reads code.
 *
 * Only what the project says for certain is followed. A path no map covers, a
 * package not installed, a `require` of something computed: each is simply
 * not resolved, and hover says nothing rather than something wrong.
 */

import { chainFor, parseLuaurc, resolveSpecifier } from "../core/luaurc.js";
import { isFilesystemMap, type MapNode, type NodeMap } from "../core/nodemap.js";
import type { TableMember } from "../core/luau/infer.js";
import { moduleExports, requiresIn, type ModuleExports, type RequireTarget } from "../core/luau/requires.js";
import { mergeDocs, type DocComment } from "../core/luau/docComment.js";
import { parseProject } from "../core/rojoImport.js";
import { FROM_PROJECT, type InstanceOutline } from "../core/luau/instances.js";
import { fs, path } from "./host.js";
import { collectMaps, readLuaurcFiles, readMap, safeJoin, type OpenProject } from "./project.js";

/** A module a local holds, as hover and completion are handed it. */
export interface ResolvedModule {
	/** The local that holds it. */
	name: string;
	/** The file it is, project-relative. */
	file: string;
	/** The instance path it is at, when a map says. */
	path?: string[];
	kind: ModuleExports["kind"];
	members: TableMember[];
	detail?: string;
	doc?: DocComment;
}

const posix = (p: string) => p.split(String.fromCharCode(92)).join("/").replace(/^\.\//, "").replace(/\/+$/, "");

/** Everything read once per request: maps, and project files met on the way. */
class Resolver {
	private maps: NodeMap[] | null = null;
	private projectPaths = new Map<string, string | null>();
	private luaurc: ReturnType<typeof parseLuaurc>[] | null = null;

	constructor(private readonly project: OpenProject) {}

	private async dataModelMaps(): Promise<NodeMap[]> {
		if (this.maps) return this.maps;
		const out: NodeMap[] = [];
		for (const mapPath of await collectMaps(this.project)) {
			const map = await readMap(this.project, mapPath).catch(() => null);
			if (map && !isFilesystemMap(map)) out.push(map);
		}
		return (this.maps = out);
	}

	private isFile = (rel: string) => fs.stat(safeJoin(this.project.root, rel)).then((s) => s.isFile(), () => false);
	private isDir = (rel: string) => fs.stat(safeJoin(this.project.root, rel)).then((s) => s.isDirectory(), () => false);

	/** Where a folder's own `default.project.json` points its tree, if it has one. */
	private async projectPath(dir: string): Promise<string | null> {
		if (this.projectPaths.has(dir)) return this.projectPaths.get(dir)!;
		const text = await fs.readFile(safeJoin(this.project.root, `${dir}/default.project.json`), "utf8").catch(() => null);
		const tree = text === null ? undefined : (parseProject(text) as { tree?: { $path?: unknown } } | undefined)?.tree;
		const found = typeof tree?.$path === "string" ? posix(path.posix.join(dir, tree.$path)) : null;
		this.projectPaths.set(dir, found);
		return found;
	}

	/** The module file an instance on disk is: `name.luau`, a folder's `init`, or a project folder's tree. */
	async moduleAt(base: string, depth = 0): Promise<string | null> {
		if (/\.luau?$/.test(base) && await this.isFile(base)) return base;
		for (const candidate of [`${base}.luau`, `${base}.lua`, `${base}/init.luau`, `${base}/init.lua`]) {
			if (await this.isFile(candidate)) return candidate;
		}
		const inner = depth < 4 ? await this.projectPath(base) : null;
		return inner ? this.moduleAt(inner, depth + 1) : null;
	}

	/** The file at an instance path, through the maps and down the disk. */
	async fileAt(segments: readonly string[]): Promise<string | null> {
		for (const map of await this.dataModelMaps()) {
			let node: MapNode = map.root;
			let best: { dir: string; used: number } | null = null;
			for (let i = 0; i < segments.length; i++) {
				const child: MapNode | undefined = node.children.find((c) => c.name === segments[i]);
				if (!child) break;
				node = child;
				if (child.path) best = { dir: posix(child.path), used: i + 1 };
			}
			if (!best) continue;
			let dir = best.dir;
			for (const name of segments.slice(best.used)) {
				// A folder that is a Rojo project of its own holds its instance
				// wherever its tree says: a Wally package's `src/`.
				if (await this.isDir(`${dir}/${name}`)) {
					dir = `${dir}/${name}`;
					const inner = await this.projectPath(dir);
					if (inner && await this.isDir(inner)) dir = inner;
					continue;
				}
				dir = `${dir}/${name}`;
			}
			const found = await this.moduleAt(dir);
			if (found) return found;
		}
		return null;
	}

	/** The instance path a file is at, with a package folder's `src/` taken out. */
	async pathOf(file: string): Promise<string[] | null> {
		const target = posix(file);
		let best: { segments: string[]; base: string } | null = null;
		const visit = (map: NodeMap, node: MapNode, trail: string[]) => {
			const here = node === map.root ? trail : [...trail, node.name];
			if (node.path) {
				const base = posix(node.path);
				if ((target === base || target.startsWith(base + "/")) && (!best || base.length > best.base.length)) {
					best = { segments: here, base };
				}
			}
			for (const child of node.children) visit(map, child, here);
		};
		for (const map of await this.dataModelMaps()) visit(map, map.root, []);
		if (!best) return null;
		const { segments, base } = best as { segments: string[]; base: string };
		const parts = target === base ? [] : target.slice(base.length + 1).split("/");
		const leaf = parts.pop();
		const out = [...segments];
		let dir = base;
		for (let i = 0; i < parts.length; i++) {
			dir = `${dir}/${parts[i]}`;
			out.push(parts[i]);
			const inner = await this.projectPath(dir);
			if (!inner || !inner.startsWith(dir + "/")) continue;
			// Skip the parts the project file's tree walks through.
			const through = inner.slice(dir.length + 1).split("/");
			if (through.every((p, k) => parts[i + 1 + k] === p)) {
				i += through.length;
				dir = inner;
			}
		}
		if (leaf !== undefined) {
			const stem = leaf.replace(/\.(luau|lua)$/i, "").replace(/\.(server|client)$/i, "");
			if (stem.toLowerCase() !== "init") out.push(stem);
		}
		return out;
	}

	/** The file a require from `from` reaches. */
	async resolve(from: string, target: RequireTarget): Promise<string | null> {
		if (target.kind === "instance") {
			const start = target.from === "game" ? [] : await this.pathOf(from);
			if (!start) return null;
			const segments = [...start];
			for (const name of target.names) {
				if (name === "..") {
					if (segments.pop() === undefined) return null;
				} else {
					segments.push(name);
				}
			}
			return segments.length ? this.fileAt(segments) : null;
		}
		const spec = target.spec.trim();
		const isInit = /(^|\/)init(\.server|\.client)?\.luau?$/i.test(from);
		const dir = path.posix.dirname(posix(from));
		if (spec.startsWith("./") || spec.startsWith("../")) {
			return this.moduleAt(posix(path.posix.join(isInit ? path.posix.dirname(dir) : dir, spec)));
		}
		if (spec.startsWith("@self/")) {
			const own = isInit ? dir : posix(from).replace(/\.luau?$/i, "");
			return this.moduleAt(posix(path.posix.join(own, spec.slice("@self/".length))));
		}
		if (spec.startsWith("@game/")) return this.fileAt(spec.slice("@game/".length).split("/"));
		if (spec.startsWith("@")) {
			if (!this.luaurc) this.luaurc = (await readLuaurcFiles(this.project)).map((f) => parseLuaurc(f.dir, f.text));
			const found = resolveSpecifier(chainFor(this.luaurc, from), spec);
			return found.t === "found" ? this.moduleAt(posix(found.alias.path)) : null;
		}
		return null;
	}

	/** What a module gives back, following a thunk -- or any module that returns another's -- to the end. */
	async exportsOf(file: string, depth = 0): Promise<{ file: string; exports: ModuleExports } | null> {
		const text = await fs.readFile(safeJoin(this.project.root, file), "utf8").catch(() => null);
		if (text === null) return null;
		const exports = moduleExports(text);
		if (exports.reexport && depth < 6) {
			const next = await this.resolve(file, exports.reexport);
			if (next) return this.exportsOf(next, depth + 1);
		}
		// A field that holds another module -- Sift's `Array = require(script.Array)`
		// -- takes that module's description where its own comment says nothing.
		if (exports.owner && depth < 3) {
			const fields = requiresIn(text).filter((b) => b.name.startsWith(`${exports.owner}.`));
			for (const binding of fields) {
				const name = binding.name.slice(exports.owner.length + 1);
				const member = exports.members.find((m) => m.name === name);
				if (!member || (member.doc?.text ?? "").trim() !== "") continue;
				const target = await this.resolve(file, binding.target);
				const inner = target ? await this.exportsOf(target, depth + 1) : null;
				const doc = mergeDocs(member.doc, inner?.exports.doc);
				if (doc) member.doc = doc;
			}
			// And an alias of one takes what that one now has: `Sift.List = Sift.Array`.
			for (const member of exports.members) {
				if (!member.aliasOf || (member.doc?.text ?? "").trim() !== "") continue;
				const doc = mergeDocs(member.doc, exports.members.find((m) => m.name === member.aliasOf)?.doc);
				if (doc) member.doc = doc;
			}
		}
		return { file, exports };
	}
}

/**
 * The modules a file's locals hold, for hover and completion: each
 * `local X = require(…)` that can be followed, with what the module gives
 * back. `text` is the file as the editor has it, when that is not yet saved.
 */
export async function modulesRequiredBy(project: OpenProject, file: string, text?: string): Promise<ResolvedModule[]> {
	const src = text ?? await fs.readFile(safeJoin(project.root, file), "utf8").catch(() => "");
	const resolver = new Resolver(project);
	const out: ResolvedModule[] = [];
	for (const binding of requiresIn(src)) {
		const target = await resolver.resolve(file, binding.target);
		if (!target) continue;
		const found = await resolver.exportsOf(target);
		if (!found) continue;
		const at = await resolver.pathOf(found.file);
		out.push({
			name: binding.name,
			file: found.file,
			...(at ? { path: at } : {}),
			kind: found.exports.kind,
			members: found.exports.members,
			...(found.exports.detail ? { detail: found.exports.detail } : {}),
			...(found.exports.doc ? { doc: found.exports.doc } : {}),
		});
	}
	return out;
}

/** For tests and the project layer: the file an instance path is at. */
export async function fileAtPath(project: OpenProject, segments: string[]): Promise<string | null> {
	return new Resolver(project).fileAt(segments);
}

/** The instance path a file is at, when a node map says. */
export async function instancePathOf(project: OpenProject, file: string): Promise<string[] | null> {
	return new Resolver(project).pathOf(file);
}

/** Folders never walked for instances: Wally's package store, and what is not the game's. */
const NOT_WALKED = new Set(["_Index", "node_modules", ".git"]);

const scriptClassOf = (file: string) =>
	/\.server\.luau?$/i.test(file) ? "Script" : /\.client\.luau?$/i.test(file) ? "LocalScript" : "ModuleScript";

/**
 * The DataModel as the project knows it: the place's instances, with every
 * script and folder the node maps put there that the place does not have yet
 * -- a module written since the place was saved -- marked as the project's.
 */
export async function projectInstances(project: OpenProject, place: InstanceOutline | null): Promise<InstanceOutline> {
	const classes: string[] = [...(place?.classes ?? [])];
	const nodes: InstanceOutline["nodes"] = place ? place.nodes.map((n) => [...n] as [number, string, number, number]) : [];
	const classIndex = (name: string) => {
		const i = classes.indexOf(name);
		return i === -1 ? classes.push(name) - 1 : i;
	};
	// Children by name, per node index (-1 for the DataModel), to find or add.
	const kids = new Map<number, Map<string, number>>();
	nodes.forEach(([, name, parent], i) => {
		const under = kids.get(parent) ?? new Map<string, number>();
		if (!under.has(name)) under.set(name, i);
		kids.set(parent, under);
	});
	const add = (segments: readonly string[], leafClass: string) => {
		let parent = -1;
		segments.forEach((name, i) => {
			const under = kids.get(parent) ?? new Map<string, number>();
			kids.set(parent, under);
			let at = under.get(name);
			if (at === undefined) {
				const className = i === segments.length - 1 ? leafClass : i === 0 ? name : "Folder";
				at = nodes.push([classIndex(className), name, parent, FROM_PROJECT]) - 1;
				under.set(name, at);
			}
			parent = at;
		});
	};

	const resolver = new Resolver(project);
	const walk = async (dir: string): Promise<void> => {
		for (const entry of await fs.readdir(safeJoin(project.root, dir), { withFileTypes: true }).catch(() => [])) {
			const rel = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				if (!NOT_WALKED.has(entry.name)) await walk(rel);
				continue;
			}
			if (!/\.luau?$/i.test(entry.name)) continue;
			const at = await resolver.pathOf(rel);
			if (at && at.length) add(at, scriptClassOf(entry.name));
		}
	};
	const visit = async (node: MapNode, trail: string[], root: boolean): Promise<void> => {
		const here = root ? trail : [...trail, node.name];
		if (!root && here.length) add(here, node.className || (here.length === 1 ? node.name : "Folder"));
		if (node.path) {
			const target = posix(node.path);
			const isFile = await fs.stat(safeJoin(project.root, target)).then((s) => s.isFile(), () => false);
			if (isFile) {
				if (here.length) add(here, scriptClassOf(target));
			} else {
				await walk(target);
			}
		}
		for (const child of node.children) await visit(child, here, false);
	};
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map && !isFilesystemMap(map)) await visit(map.root, [], true);
	}
	return { classes, nodes };
}
