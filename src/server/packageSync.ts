/**
 * Keeping Wally's folders synced in the served node map, as roswaal.json's
 * `packageSync` says: see `core/packageSync.ts`. Run when a package is added,
 * when the setting changes, when another map is served, and as a project
 * opens. Answers the map it changed, if any.
 */

import { isFilesystemMap, SERVED_OUTPUT } from "../core/nodemap.js";
import { syncPackageFolders } from "../core/packageSync.js";
import { REALM_DIRS } from "../core/wally.js";
import { compileMap } from "./compile.js";
import type { OpenProject } from "./config.js";
import { collectMaps, readMap, writeMap } from "./documents.js";
import { exists } from "./files.js";
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
	const present = new Set<string>();
	for (const folder of Object.values(REALM_DIRS)) {
		if (await exists(safeJoin(project.root, folder))) present.add(folder);
	}
	const root = syncPackageFolders(
		map.root,
		sync,
		(folder) => present.has(folder),
		() => globalThis.crypto.randomUUID(),
	);
	if (root === map.root) return [];
	await writeMap(project, served, { ...map, root });
	await compileMap(project, served, { write: true, sync: false });
	return [served];
}
