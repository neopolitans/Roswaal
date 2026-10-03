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
import { UserError } from "./errors.js";
import { walkFiles, writeTextAtomically } from "./files.js";
import { recordGenerated } from "./manifest.js";
import { safeJoin, toPosix } from "./paths.js";

export async function readScript(project: OpenProject, relPath: string): Promise<NodeScript> {
	const abs = safeJoin(project.root, relPath);
	const parsed = JSON.parse(await fs.readFile(abs, "utf8")) as NodeScript;
	if (parsed.schemaVersion > SCHEMA_VERSION) {
		throw new UserError(
			`${relPath} was written by a newer version of Roswaal (schema ${parsed.schemaVersion}).`,
		);
	}

	const script = migrateScript(parsed, project.registry).script;

	// The file name is the name. `name` is still stored -- it is what a graph
	// loaded without a path is called, and what `outputFileName` reads -- but
	// whenever a graph is read from a path, the path wins, so the two cannot
	// disagree rather than merely being kept in step. Rojo does the same: an
	// instance's name comes from its file name and never from inside it. Two
	// graphs therefore cannot share a name within a folder, because two files
	// cannot, and the collision check in `compileScript` is a net under that.
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

/**
 * Saves a graph. Only to a `.nodescript`: anything else at that path -- the
 * Luau a graph compiles to, a hand-written module -- is not a graph, and a
 * save there would replace it without the hand-edit guard ever asking.
 */
export async function writeScript(
	project: OpenProject, relPath: string, script: NodeScript,
): Promise<void> {
	assertExtension(relPath, ".nodescript", "graph");
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
		throw new UserError(
			`${relPath} was written by a newer version of Roswaal (schema ${parsed.schemaVersion}).`,
		);
	}
	return parsed;
}

/** Saves a node map. Only to a `.nodemap`, for the reason `writeScript` gives. */
export async function writeMap(
	project: OpenProject, relPath: string, map: NodeMap,
): Promise<void> {
	assertExtension(relPath, ".nodemap", "node map");
	const abs = safeJoin(project.root, relPath);
	await fs.mkdir(path.dirname(abs), { recursive: true });
	await writeTextAtomically(abs, serialiseMap(map));
}

function assertExtension(relPath: string, extension: string, kind: string): void {
	if (!relPath.toLowerCase().endsWith(extension)) {
		throw new UserError(`A ${kind} is saved as a ${extension} file, and ${relPath} is not one.`);
	}
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
	if (json === undefined) throw new UserError(`${rel} is not valid JSON.`);
	const owner = (await findRojoProjects(project)).find((p) => p.file === rel)?.mappedBy;
	if (owner) throw new UserError(`${rel} is already written by ${owner}.`);

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

/** Every node map under `sourceDir`, project-relative and sorted. */
export async function collectMaps(project: OpenProject): Promise<string[]> {
	return documentsUnder(project, ".nodemap");
}

/** Every graph under `sourceDir`, project-relative and sorted. */
export async function collectScripts(project: OpenProject): Promise<string[]> {
	return documentsUnder(project, ".nodescript");
}

async function documentsUnder(project: OpenProject, extension: string): Promise<string[]> {
	const files = await walkFiles(project.root, {
		from: project.config.sourceDir,
		accept: (name) => name.endsWith(extension),
	});
	return files.map((file) => file.path);
}

/**
 * The name a graph carries inside itself, from a file or folder name.
 *
 * One function for creating a graph and renaming one, so the two cannot
 * disagree: a graph's own name is what the compiler writes out -- see
 * `outputFileName` -- and a rename that left it alone would have
 * `Hello.nodescript` compiling to `Greeter.luau` with nothing saying so.
 *
 * Returns "" when nothing survives sanitising; the caller decides what to do
 * about that, because creating and renaming want different answers.
 */
export function graphName(raw: string): string {
	return raw.replace(/[^A-Za-z0-9_ -]/g, "").trim();
}
