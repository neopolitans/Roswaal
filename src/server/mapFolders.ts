/**
 * The folders a node map syncs, made on disk when the map is compiled.
 *
 * A map points instances at folders under the output directory --
 * ReplicatedStorage at `src/ReplicatedStorage` -- and graphs reach those
 * folders by sitting in the same folder under the graphs directory. Neither
 * folder exists until something puts it there, so a map that names a service
 * left the author making both by hand before a graph could go in it. Compiling
 * the map makes them: the output folder, so Rojo has something to sync, and
 * its mirror, so there is somewhere to put the graphs.
 */

import { isFilesystemMap, type MapNode, type NodeMap } from "../core/nodemap.js";
import type { OpenProject } from "./config.js";
import { collectMaps, readMap } from "./documents.js";
import { fs, path } from "./host.js";
import { safeJoin, tidyPath, toPosix } from "./paths.js";

/** A folder a map syncs, and the folder under the graphs directory mirroring it. */
export interface SyncedFolder {
	output: string;
	graphs: string;
}

/**
 * Every folder under the output directory a Roblox map points an instance at,
 * with its mirror. A path with an extension is a file, and a path outside the
 * output directory is not Roswaal's to make -- `Packages` is Wally's. A Lune
 * map names files rather than pointing at them, and has none.
 */
export function syncedFolders(project: OpenProject, map: NodeMap): SyncedFolder[] {
	if (isFilesystemMap(map)) return [];
	const outDir = tidyPath(project.config.outDir);
	const sourceDir = tidyPath(project.config.sourceDir);
	const out = new Map<string, SyncedFolder>();
	const visit = (node: MapNode) => {
		if (node.path) {
			const at = tidyPath(node.path);
			const last = at.split("/").pop() ?? "";
			const within =
				at === outDir ? "" : at.startsWith(`${outDir}/`) ? at.slice(outDir.length + 1) : undefined;
			if (within !== undefined && !last.includes(".")) {
				out.set(at, {
					output: at,
					graphs: within === "" ? sourceDir : path.posix.join(sourceDir, within),
				});
			}
		}
		node.children.forEach(visit);
	};
	visit(map.root);
	return [...out.values()];
}

/**
 * Makes the folders `syncedFolders` names that are not on disk yet. Returns
 * what it made, project-relative, so the caller can say so.
 */
export async function makeSyncedFolders(project: OpenProject, map: NodeMap): Promise<string[]> {
	const made: string[] = [];
	for (const folder of syncedFolders(project, map)) {
		for (const rel of [folder.output, folder.graphs]) {
			const abs = safeJoin(project.root, rel);
			if (await fs.stat(abs).catch(() => null)) continue;
			await fs.mkdir(abs, { recursive: true });
			made.push(toPosix(rel));
		}
	}
	return made;
}

/** The output folders any map in the project syncs, which tidying up must leave. */
export async function mappedOutputFolders(project: OpenProject): Promise<Set<string>> {
	const out = new Set<string>();
	for (const mapPath of await collectMaps(project)) {
		const map = await readMap(project, mapPath).catch(() => null);
		if (map) for (const folder of syncedFolders(project, map)) out.add(folder.output);
	}
	return out;
}
