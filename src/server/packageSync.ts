/**
 * Keeping Wally's folders synced in the served node map, as roswaal.json's
 * `packageSync` says: see `core/packageSync.ts`. Run when a package is added,
 * when the setting changes, when another map is served, and as a project
 * opens. Answers the map it changed, if any.
 */

import { isFilesystemMap, SERVED_OUTPUT } from "../core/nodemap.js";
import { type RealmState, syncPackageFolders } from "../core/packageSync.js";
import { parseWallyToml, REALM_DIRS } from "../core/wally.js";
import { compileMap } from "./compile.js";
import type { OpenProject } from "./config.js";
import { collectMaps, readMap, writeMap } from "./documents.js";
import { exists } from "./files.js";
import { fs } from "./host.js";
import { safeJoin, tidyPath } from "./paths.js";

/** The map writing default.project.json, or null. */
export async function servedMap(project: OpenProject): Promise<string | null> {
	for (const found of await collectMaps(project)) {
		const map = await readMap(project, found).catch(() => null);
		if (map && !isFilesystemMap(map) && tidyPath(map.output) === SERVED_OUTPUT) return found;
	}
	return null;
}

export async function syncPackages(project: OpenProject): Promise<string[]> {
	const sync = project.config.packageSync;
	if (!sync || Object.values(sync).every((at) => !at)) return [];
	const served = await servedMap(project);
	if (!served) return [];
	const map = await readMap(project, served);
	if (isFilesystemMap(map)) return [];
	// A realm is in use once wally.toml lists it, installed or not: Add writes
	// the line before it fetches, and a clone has wally.toml but no folders.
	const toml = await fs.readFile(safeJoin(project.root, "wally.toml"), "utf8").catch(() => "");
	const listed = new Set(parseWallyToml(toml).map((dep) => REALM_DIRS[dep.realm]));
	const states = new Map<string, RealmState>();
	for (const folder of Object.values(REALM_DIRS)) {
		if (await exists(safeJoin(project.root, folder))) states.set(folder, true);
		else if (listed.has(folder)) states.set(folder, "listed");
	}
	const root = syncPackageFolders(
		map.root,
		sync,
		(folder) => states.get(folder) ?? false,
		() => globalThis.crypto.randomUUID(),
	);
	if (root === map.root) return [];
	await writeMap(project, served, { ...map, root });
	await compileMap(project, served, { write: true, sync: false });
	return [served];
}
