/**
 * The documents the editor opens and saves: graphs (`.nodescript`), node maps
 * (`.nodemap`), and a Rojo project file read into a map.
 *
 * Reading and writing only. What a document compiles to is `compile.ts`.
 */

import { fs, path } from "./host.js";

import { serialiseScript } from "../core/compiler/index.js";
import { migrateScript } from "../core/migrate.js";
import { compileNodeMap, isFilesystemMap, serialiseMap, type NodeMap } from "../core/nodemap.js";
import { parseProject, projectToMap, sameProject } from "../core/rojoImport.js";
import { SCHEMA_VERSION, type NodeScript } from "../core/schema.js";
import type { OpenProject } from "./config.js";
import { writeTextAtomically } from "./files.js";
import { recordGenerated } from "./manifest.js";
import { safeJoin, toPosix } from "./paths.js";

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
	await writeTextAtomically(abs, serialiseScript(script));
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
	await writeTextAtomically(abs, serialiseMap(map));
}

/** A Rojo project file in the project's root, and the map that writes it, if one does. */
export interface RojoProjectFile {
	file: string;
	mappedBy: string | null;
}

/** The `*.project.json` files in the project's root, for Import Rojo project. */
export async function findRojoProjects(project: OpenProject): Promise<RojoProjectFile[]> {
	const names = (await fs.readdir(project.root).catch(() => [] as string[]))
		.filter((n) => n.endsWith(".project.json"))
		.sort((a, b) => a.localeCompare(b));
	const owners = new Map<string, string>();
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map && !isFilesystemMap(map)) owners.set(toPosix(map.output), mapPath);
	}
	return names.map((file) => ({ file, mappedBy: owners.get(file) ?? null }));
}

export interface RojoImportOutcome {
	/** The project file read, project-relative. */
	file: string;
	/** The node map written, project-relative. */
	mapPath: string;
	/**
	 * The map compiles to the same project, so Roswaal now writes the file:
	 * compiling leaves it alone until the map changes.
	 */
	takenOver: boolean;
	/** Parts of the file that are not instances, kept as they were. */
	problems: string[];
}

/**
 * Reads a Rojo project file into a node map beside the project's graphs.
 *
 * The file is taken over -- recorded as Roswaal's, so compiling the map may
 * write it -- only when the map compiles back to the same project. Otherwise
 * the map is written and the file is left to its author, who can compile with
 * force once they have looked.
 */
export async function importRojoProject(project: OpenProject, file: string): Promise<RojoImportOutcome> {
	const rel = toPosix(file);
	const text = await fs.readFile(safeJoin(project.root, rel), "utf8");
	const json = parseProject(text);
	if (json === undefined) throw new Error(`${rel} is not valid JSON.`);
	const owner = (await findRojoProjects(project)).find((p) => p.file === rel)?.mappedBy;
	if (owner) throw new Error(`${rel} is already written by ${owner}.`);

	const stem = path.posix.basename(rel).replace(/\.project\.json$/i, "") || "project";
	const { map, problems } = projectToMap(json, {
		output: rel,
		fallbackName: stem,
		makeId: () => globalThis.crypto.randomUUID(),
	});
	const base = graphName(map.name) || graphName(stem) || "project";
	let mapPath = path.posix.join(project.config.sourceDir, `${base}.nodemap`);
	for (let n = 2; await fs.access(safeJoin(project.root, mapPath)).then(() => true, () => false); n++) {
		mapPath = path.posix.join(project.config.sourceDir, `${base} ${n}.nodemap`);
	}
	await writeMap(project, mapPath, map);

	const same = sameProject(json, JSON.parse(compileNodeMap(map).json));
	if (same) await recordGenerated(project.root, rel, mapPath);
	return { file: rel, mapPath, takenOver: same, problems };
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

/** Every graph under `sourceDir`, project-relative and sorted. */
export async function collectScripts(project: OpenProject): Promise<string[]> {
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
