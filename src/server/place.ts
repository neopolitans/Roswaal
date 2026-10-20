/**
 * A project's place file: finding it, making a project from one, and writing
 * the project's scripts back into a copy of it.
 *
 * Reading the place for the DataModel browser is `routes.ts`'s, which caches
 * it; this is the part that decides which files belong in it.
 */

import { isFilesystemMap, locateSegments } from "../core/nodemap.js";

import { addInstances } from "../core/rbx/adder.js";
import { readRbx } from "../core/rbx/index.js";
import {
	type PlaceEntry,
	type PlaceReport,
	type PlaceUpdate,
	planPlaceUpdate,
} from "../core/rbx/placeExport.js";
import { LINKS_FILE, type PlaceImport, type PlaceLinks } from "../core/rbx/placeImport.js";
import { writeSources } from "../core/rbx/writer.js";
import { defaultConfig, type RoswaalConfig } from "../core/schema.js";
import { compileMap, type MapOutcome } from "./compile.js";
import { type OpenProject, openProject, writeConfig } from "./config.js";
import { collectMaps, readMap } from "./documents.js";
import { errorMessage, UserError } from "./errors.js";
import { exists, walkFiles, writeFileAtomically } from "./files.js";
import { fs, path } from "./host.js";
import { safeJoin, toPosix } from "./paths.js";

/**
 * The place file a project reads instances from, project-relative, or null.
 *
 * `place` in roswaal.json when it is set and the file is there. Otherwise a
 * `.rbxl` or `.rbxlx` in the root: `place.rbxl` first, as Rojo projects
 * conventionally keep one, then the first by name. A place is data the
 * project reads; nothing is written into it unless an export is asked for,
 * or a property is changed in the DataModel browser.
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
 * can point at it. A plan with no node map is refused before anything is
 * written, since the map is what the Rojo project is compiled from.
 */
export async function writePlaceImport(
	root: string,
	files: PlaceImport["files"],
	placeFile: string,
): Promise<MapOutcome> {
	const mapPath = Object.keys(files).find((f) => f.endsWith(".nodemap"));
	if (mapPath === undefined) {
		throw new UserError(
			"This import plans no node map, so there is no Rojo project to write from it.",
		);
	}
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
	return compileMap(await openProject(root), mapPath, { write: true });
}

/** A place file's bytes, by its project-relative path. */
export async function readPlaceBytes(project: OpenProject, file: string): Promise<Uint8Array> {
	return fs.readFile(safeJoin(project.root, file));
}

/** Where copies of a place are kept before a property change, project-relative. */
export const PLACE_BACKUPS = ".roswaal/backups";

/**
 * Writes a changed place over the project's place file, and when `backUp`,
 * first keeps `before` -- the file as it was -- under `PLACE_BACKUPS`, named
 * after the place and the time, and never over an earlier one. Returns the backup's project-relative path.
 */
export async function writePlaceFile(
	project: OpenProject,
	file: string,
	before: Uint8Array,
	after: Uint8Array,
	backUp: boolean,
	now = new Date(),
): Promise<string | undefined> {
	let backup: string | undefined;
	if (backUp) {
		const ext = /\.rbxlx?$/i.exec(file)?.[0] ?? "";
		const base = path.posix.basename(file, ext);
		// The time where the developer is, as they would read it off their clock.
		const two = (n: number) => String(n).padStart(2, "0");
		const time =
			`${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-` +
			`${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
		backup = `${PLACE_BACKUPS}/${base}.${time}${ext}`;
		// Two in the same second are two backups, not one over the other.
		for (let n = 2; await exists(safeJoin(project.root, backup)); n++)
			backup = `${PLACE_BACKUPS}/${base}.${time}-${n}${ext}`;
		const abs = safeJoin(project.root, backup);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, before);
	}
	await writeFileAtomically(safeJoin(project.root, file), after);
	return backup;
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
		const addError = errorMessage(err);
		return {
			file,
			bytes: written,
			update: {
				...update,
				added: [],
				addedFiles: [],
				addError,
				notInPlace: [...update.notInPlace, ...update.addedFiles],
			},
		};
	}
}

/**
 * What an export did, as the editor and `roswaal export` both report it: the
 * update without the instances themselves, counted.
 */
export function placeReport(update: PlaceUpdate): PlaceReport {
	const { changes, added, ...report } = update;
	// A folder is an addition with no script source to write into it.
	const folders = added.filter((one) => one.source === undefined).length;
	return { ...report, scripts: changes.length, folders };
}

/**
 * `.roswaal/place.json` after an instance was renamed: every script it links
 * at that instance or under it, at its new path. The link is found by its
 * UniqueId where the place has one, and by its path where it does not, so the
 * path follows the name. Nothing is written when nothing it links moved.
 */
export async function renameInLinks(
	project: OpenProject,
	from: readonly string[],
	to: readonly string[],
): Promise<boolean> {
	const file = safeJoin(project.root, LINKS_FILE);
	const raw = await fs.readFile(file, "utf8").catch(() => null);
	if (raw === null) return false;
	const links = JSON.parse(raw) as PlaceLinks;
	const under = (p: readonly string[]) =>
		p.length >= from.length && from.every((n, i) => p[i] === n);
	let moved = false;
	for (const link of links.scripts) {
		for (const target of link.instances) {
			if (!under(target.path)) continue;
			target.path = [...to, ...target.path.slice(from.length)];
			moved = true;
		}
	}
	if (moved) await writeFileAtomically(file, `${JSON.stringify(links, null, "\t")}\n`);
	return moved;
}

/**
 * `.roswaal/place.json` after the instance at `under` was deleted: every link
 * at it or inside it, found by path or by one of `ids`, taken off. A file left
 * linked to nothing keeps its entry, so an export neither puts the script back
 * nor takes the file for a new one. Answers with the files unlinked.
 */
export async function unlinkUnder(
	project: OpenProject,
	under: readonly string[],
	ids: ReadonlySet<string>,
): Promise<string[]> {
	const file = safeJoin(project.root, LINKS_FILE);
	const raw = await fs.readFile(file, "utf8").catch(() => null);
	if (raw === null) return [];
	const links = JSON.parse(raw) as PlaceLinks;
	const inside = (p: readonly string[]) =>
		p.length >= under.length && under.every((n, i) => p[i] === n);
	const unlinked: string[] = [];
	for (const link of links.scripts) {
		const kept = link.instances.filter((t) => !inside(t.path) && !(t.id && ids.has(t.id)));
		if (kept.length === link.instances.length) continue;
		link.instances = kept;
		unlinked.push(link.file);
	}
	if (unlinked.length) await writeFileAtomically(file, `${JSON.stringify(links, null, "\t")}\n`);
	return unlinked;
}

/** The files `.roswaal/place.json` links to the place. */
export async function linkedFiles(project: OpenProject): Promise<Set<string>> {
	const raw = await fs.readFile(safeJoin(project.root, LINKS_FILE), "utf8").catch(() => null);
	const links = raw === null ? null : (JSON.parse(raw) as PlaceLinks);
	return new Set((links?.scripts ?? []).map((link) => link.file));
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
			file: link.file,
			text: text ?? "",
			className: link.className,
			targets: link.instances,
			...(text === null ? { gone: true } : {}),
		});
	}

	const maps = [];
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map && !isFilesystemMap(map)) maps.push(map);
	}
	// Refused, as any path is, when `outDir` points outside the project.
	safeJoin(project.root, project.config.outDir);
	const files = await walkFiles(project.root, {
		from: project.config.outDir,
		accept: (name) => /\.luau?$/.test(name),
	});
	for (const file of files) {
		if (linked.has(file.path)) continue;
		const found = maps.map((map) => locateSegments(map, file.path)).find((at) => at);
		if (!found) continue;
		entries.push({
			file: file.path,
			text: await fs.readFile(file.abs, "utf8"),
			isModule: found.isModule,
			targets: [{ path: found.segments }],
		});
	}
	return entries.sort((a, b) => a.file.localeCompare(b.file));
}
