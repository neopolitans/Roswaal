/**
 * The project tree the editor's sidebar draws: folders and the files Roswaal
 * knows what to do with, what each folder is, and `wally.toml` with its
 * packages under it.
 *
 * Read-only. Creating, renaming and moving what the tree shows is
 * `entries.ts`.
 */

import { type FunctionInfo, functionOutline } from "../core/functionGraph.js";
import { isFilesystemMap, type MapNode } from "../core/nodemap.js";
import { PLACE_DIR } from "../core/rbx/placeImport.js";
import { parseProject } from "../core/rojoImport.js";
import type { NodeScript } from "../core/schema.js";
import { indexVersion, parseWallyToml, REALM_DIRS, thunkTarget } from "../core/wally.js";
import type { OpenProject } from "./config.js";
import { collectMaps, readMap } from "./documents.js";
import { fs, path } from "./host.js";
import { generatedIndex } from "./outputs.js";
import { safeJoin, tidyPath, toPosix } from "./paths.js";

/**
 * Folders the project tree leaves out. Wally's are shown -- a project's
 * packages are part of what it is -- and marked, but never scanned.
 */
const TREE_SKIP = new Set(["node_modules", ".git", ".vscode", "dist", "build", "out"]);

const WALLY_DIRS = new Set(Object.values(REALM_DIRS));

export interface TreeEntry {
	/** Path relative to the project root, with forward slashes. */
	path: string;
	name: string;
	/**
	 * `wally` is `wally.toml`, listed with its dependencies as `package`
	 * entries: not files, so a package's `path` is a name, and `target` is the
	 * file it opens.
	 */
	kind: "directory" | "nodescript" | "nodemap" | "luau" | "luaurc" | "wally" | "package";
	/** Set on generated Luau: the graph it came from. */
	generatedFrom?: string;
	/** Set on a graph with functions, which the tree lists under it. */
	functions?: FunctionInfo[];
	children?: TreeEntry[];
	/** What a folder is, where it is more than a folder. See `folderRole`. */
	role?: FolderRole;
	/** A package's installed version, from its `_Index` folder. */
	version?: string;
	/** The file a package opens: its module in `_Index`. */
	target?: string;
	/** A package `wally.toml` lists that `wally install` has not put on disk. */
	missing?: boolean;
}

/**
 * A folder that is more than a folder, for the colour of its icon:
 *
 * - `service`: a service or container a node map points at -- ReplicatedStorage,
 *   StarterPlayerScripts -- rather than a Folder.
 * - `script`: a folder holding an `init` file, which is the script itself in
 *   Studio, with the rest of the folder as its children.
 * - `place`: `place/` and everything in it: scripts only the place holds,
 *   written back by Modify RBXL rather than synced by Rojo.
 * - `packages`: a folder `wally install` fills, `Packages/` and its kin.
 */
export type FolderRole = "service" | "script" | "place" | "packages";

export async function buildTree(project: OpenProject): Promise<TreeEntry[]> {
	const generated = await generatedIndex(project);
	// Empty folders are noise everywhere except under sourceDir, where one is a
	// folder the developer just created and is about to put a graph in.
	const keepEmptyUnder = [project.config.sourceDir, ...project.config.nodePaths];
	const tree = await walk(
		project.root,
		project.root,
		generated,
		keepEmptyUnder,
		await serviceFolders(project),
	);
	const wally = await wallyEntry(project);
	if (!wally) return tree;
	// It opens like a folder, so it is listed with the folders: after them and
	// before the files, where its chevron lines up with theirs rather than
	// sitting under a file as though it were inside it.
	const files = tree.findIndex((e) => e.kind !== "directory");
	return files === -1 ? [...tree, wally] : [...tree.slice(0, files), wally, ...tree.slice(files)];
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
	const text = await fs
		.readFile(safeJoin(project.root, `${base}/default.project.json`), "utf8")
		.catch(() => null);
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

/** Folders a node map points a service or container at, project-relative. */
async function serviceFolders(project: OpenProject): Promise<Set<string>> {
	const out = new Set<string>();
	const visit = (node: MapNode, parent: MapNode | null) => {
		if (node.path && node.className !== "Folder") {
			const at = tidyPath(node.path);
			out.add(at);
			// A container mapped inside a service with no path of its own --
			// StarterPlayerScripts in StarterPlayer -- makes the folder above it
			// the service's, when it is named for it.
			const above = at.includes("/") ? at.slice(0, at.lastIndexOf("/")) : "";
			if (parent && !parent.path && !parent.className && above.split("/").pop() === parent.name)
				out.add(above);
		}
		node.children.forEach((child) => visit(child, node));
	};
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map && !isFilesystemMap(map)) map.root.children.forEach((child) => visit(child, null));
	}
	return out;
}

const INIT_FILE = /^init(\.server|\.client)?\.luau?$/;

function folderRole(
	rel: string,
	children: readonly TreeEntry[],
	services: ReadonlySet<string>,
): FolderRole | undefined {
	if (rel === PLACE_DIR || rel.startsWith(PLACE_DIR + "/")) return "place";
	if (WALLY_DIRS.has(rel)) return "packages";
	if (services.has(rel)) return "service";
	if (children.some((c) => c.kind !== "directory" && INIT_FILE.test(c.name))) return "script";
	return undefined;
}

async function walk(
	root: string,
	dir: string,
	generated: Map<string, string>,
	keepEmptyUnder: string[],
	services: ReadonlySet<string> = new Set(),
): Promise<TreeEntry[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: TreeEntry[] = [];

	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = toPosix(path.relative(root, abs));

		if (entry.isDirectory()) {
			if (TREE_SKIP.has(entry.name)) continue;
			const children = await walk(root, abs, generated, keepEmptyUnder, services);
			const keep =
				children.length > 0 ||
				keepEmptyUnder.some(
					(base) => rel === base || rel.startsWith(base + "/") || base.startsWith(rel + "/"),
				);
			if (!keep) continue;
			const role = folderRole(rel, children, services);
			out.push({
				path: rel,
				name: entry.name,
				kind: "directory",
				children,
				...(role ? { role } : {}),
			});
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
	// A project fact, shown where it lives: which directory a `.luaurc` is in
	// decides which graphs it applies to, and a tree is the one place that says
	// so without having to explain it.
	if (name === ".luaurc") return "luaurc";
	return null;
}
