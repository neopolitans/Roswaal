/**
 * A project's place file: finding it, making a project from one, and writing
 * the project's scripts back into a copy of it.
 *
 * Reading the place for the DataModel browser is `routes.ts`'s, which caches
 * it; this is the part that decides which files belong in it.
 */

import { fs, path } from "./host.js";

import { addInstances } from "../core/rbx/adder.js";
import { RbxError } from "../core/rbx/dom.js";
import { readRbx } from "../core/rbx/index.js";
import { planPlaceUpdate, type PlaceEntry, type PlaceUpdate } from "../core/rbx/placeExport.js";
import { LINKS_FILE, type PlaceImport, type PlaceLinks } from "../core/rbx/placeImport.js";
import { writeSources } from "../core/rbx/writer.js";
import { isFilesystemMap, locateSegments } from "../core/nodemap.js";
import { defaultConfig, type RoswaalConfig } from "../core/schema.js";
import { compileMap, type MapOutcome } from "./compile.js";
import { openProject, writeConfig, type OpenProject } from "./config.js";
import { collectMaps, readMap } from "./documents.js";
import { SKIP_DIRS } from "./files.js";
import { safeJoin, toPosix } from "./paths.js";

/**
 * The place file a project reads instances from, project-relative, or null.
 *
 * `place` in roswaal.json when it is set and the file is there. Otherwise a
 * `.rbxl` or `.rbxlx` in the root: `place.rbxl` first, as Rojo projects
 * conventionally keep one, then the first by name. A place is data the
 * project reads; nothing is written into it unless an export is asked for.
 */
export async function findPlaceFile(root: string, config: RoswaalConfig): Promise<string | null> {
	if (config.place) {
		const found = await fs.stat(path.join(root, config.place)).catch(() => null);
		return found?.isFile() ? toPosix(config.place) : null;
	}
	const names = (await fs.readdir(root).catch(() => [] as string[]))
		.filter((n) => /\.rbxlx?$/i.test(n))
		.sort((a, b) => a.localeCompare(b));
	return names.find((n) => n.toLowerCase() === "place.rbxl") ?? names[0] ?? null;
}

/**
 * Writes a project made from a place: roswaal.json, the files the import
 * planned, and the Rojo project compiled from its map.
 *
 * The caller has put the place file itself in the root already -- it is bytes,
 * and the project filesystem carries text -- and passes its name so the config
 * can point at it.
 */
export async function writePlaceImport(
	root: string, files: PlaceImport["files"], placeFile: string,
): Promise<MapOutcome> {
	const config: RoswaalConfig = { ...defaultConfig(), place: placeFile };
	await fs.mkdir(root, { recursive: true });
	await writeConfig(root, config);
	await fs.mkdir(path.join(root, config.sourceDir), { recursive: true });
	await fs.mkdir(path.join(root, config.nodePaths[0] ?? ".roswaal/nodes"), { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		const abs = safeJoin(root, rel);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, content, "utf8");
	}
	const project = await openProject(root);
	const mapPath = Object.keys(files).find((f) => f.endsWith(".nodemap"))!;
	return compileMap(project, mapPath, { write: true });
}

/** A place file's bytes, by its project-relative path. */
export async function readPlaceBytes(project: OpenProject, file: string): Promise<Uint8Array> {
	return fs.readFile(safeJoin(project.root, file));
}

/** A project's place with its scripts written in, and what was and was not. */
export interface PlaceExport {
	/** The place file, project-relative. */
	file: string;
	bytes: Uint8Array;
	update: PlaceUpdate;
}

/**
 * The project's place, with every script the project has a file for holding
 * that file's text. Nothing on disk changes: the caller decides where the
 * bytes go -- a download, or a path somebody named.
 *
 * The files are the ones `.roswaal/place.json` links to the place, and any
 * other Luau under `outDir` a node map places: a graph compiled since the
 * import, or hand-written Luau in a Rojo project.
 */
export async function exportPlace(project: OpenProject): Promise<PlaceExport | null> {
	const file = await findPlaceFile(project.root, project.config);
	if (!file) return null;
	const bytes = await fs.readFile(safeJoin(project.root, file));
	const doc = readRbx(bytes);
	const entries = await placeEntries(project);

	const update = planPlaceUpdate(doc, entries);
	const written = writeSources(bytes, doc, update.changes);
	try {
		return { file, bytes: addInstances(written, doc, update.added), update };
	} catch (err) {
		// The sources still go in; the new scripts are reported, not half-added.
		const addError = err instanceof RbxError ? err.message : (err as Error).message;
		return { file, bytes: written, update: { ...update, added: [], addedFiles: [], addError, notInPlace: [...update.notInPlace, ...update.addedFiles] } };
	}
}

/**
 * The project's files that belong in its place, by file name: the ones
 * `.roswaal/place.json` links to the place, and any other Luau under `outDir`
 * a node map places. What an export writes in, and what the DataModel browser
 * says writes each script.
 */
export async function placeEntries(project: OpenProject): Promise<PlaceEntry[]> {
	const entries: PlaceEntry[] = [];
	const linked = new Set<string>();
	const raw = await fs.readFile(safeJoin(project.root, LINKS_FILE), "utf8").catch(() => null);
	const links = raw === null ? null : (JSON.parse(raw) as PlaceLinks);
	for (const link of links?.scripts ?? []) {
		linked.add(link.file);
		const text = await fs.readFile(safeJoin(project.root, link.file), "utf8").catch(() => null);
		entries.push({
			file: link.file, text: text ?? "", className: link.className, targets: link.instances,
			...(text === null ? { gone: true } : {}),
		});
	}

	const maps = [];
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map && !isFilesystemMap(map)) maps.push(map);
	}
	const stack = [safeJoin(project.root, project.config.outDir)];
	while (stack.length) {
		const dir = stack.pop()!;
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(abs);
				continue;
			}
			if (!/\.luau?$/.test(entry.name)) continue;
			const rel = toPosix(path.relative(project.root, abs));
			if (linked.has(rel)) continue;
			for (const map of maps) {
				const found = locateSegments(map, rel);
				if (!found) continue;
				entries.push({
					file: rel,
					text: await fs.readFile(abs, "utf8"),
					isModule: found.isModule,
					targets: [{ path: found.segments }],
				});
				break;
			}
		}
	}
	return entries.sort((a, b) => a.file.localeCompare(b.file));
}
