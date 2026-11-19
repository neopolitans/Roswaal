/**
 * Keeping Wally's folders synced in a node map by themselves.
 *
 * Each Wally realm installs into one folder -- Packages/, ServerPackages/ or
 * DevPackages/ -- and a project says in roswaal.json where each should land
 * in Studio: `packageSync.shared = "ReplicatedStorage.Packages"`. This puts
 * the folder's mapping there in a map: made where there is none, moved where
 * it is mapped somewhere else. Pure, so the daemon and the tests run the same.
 */

import { mapAt } from "./mapRule.js";
import { findMapNode, type MapNode, mapNodeRemove, mapNodeUpdate } from "./nodemap.js";
import { normalisePath } from "./rojoPaths.js";
import { REALM_DIRS, type WallyRealm } from "./wally.js";

export type PackageSync = Partial<Record<WallyRealm, string>>;

/** The places each realm is usually kept, offered before a custom path. */
export const PACKAGE_SYNC_PLACES = [
	"ReplicatedStorage",
	"ServerStorage",
	"ServerScriptService",
] as const;

/** A DataModel path as its names, service first: "ReplicatedStorage.Packages". */
export function syncTrail(at: string): string[] {
	return at
		.split(".")
		.map((part) => part.trim())
		.filter(Boolean);
}

/** The node at a trail of names under the root, or null. */
function nodeAt(root: MapNode, trail: readonly string[]): MapNode | null {
	let at: MapNode | null = root;
	for (const name of trail) {
		at = at?.children.find((child) => child.name === name) ?? null;
		if (!at) return null;
	}
	return at;
}

/**
 * The map's tree with each realm whose folder is on disk mapped where
 * `sync` says. A mapping of the folder elsewhere moves there: a plain one
 * goes, one holding more keeps what it holds and only stops syncing the
 * folder. Unchanged, the same object, when nothing needed doing.
 */
export function syncPackageFolders(
	root: MapNode,
	sync: PackageSync,
	installed: (folder: string) => boolean,
	makeId: () => string,
): MapNode {
	let next = root;
	for (const realm of Object.keys(REALM_DIRS) as WallyRealm[]) {
		const at = sync[realm];
		const folder = REALM_DIRS[realm];
		if (!at || !installed(folder)) continue;
		const trail = syncTrail(at);
		if (trail.length < 2) continue;
		const there = nodeAt(next, trail);
		if (there && there.path !== undefined && normalisePath(there.path) === folder) {
			next = moveAway(next, folder, there.id);
			continue;
		}
		next = moveAway(next, folder, there?.id);
		const made = mapAt(next, trail, folder, makeId);
		next = mapNodeUpdate(made.root, made.id, (node) => ({ ...node, path: folder }));
	}
	return next;
}

/** Every mapping of `folder` but `keep`'s gone: plain ones removed, others left without it. */
function moveAway(root: MapNode, folder: string, keep?: string): MapNode {
	let next = root;
	const found: MapNode[] = [];
	const visit = (node: MapNode) => {
		if (node.id !== keep && node.path !== undefined && normalisePath(node.path) === folder)
			found.push(node);
		node.children.forEach(visit);
	};
	visit(root);
	for (const node of found) {
		const now = findMapNode(next, node.id);
		if (!now) continue;
		next =
			now.children.length === 0
				? mapNodeRemove(next, now.id)
				: mapNodeUpdate(next, now.id, ({ path: _path, optional: _optional, ...rest }) => rest);
	}
	return next;
}

/**
 * The nodes of a map that autosync keeps, by id, with their realm: the node at
 * each realm's path that syncs the realm's folder. Only the served map's are
 * kept; another map's mapping of the folder is its own.
 */
export function managedNodes(
	root: MapNode,
	sync: PackageSync | undefined,
): Map<string, WallyRealm> {
	const out = new Map<string, WallyRealm>();
	for (const realm of Object.keys(REALM_DIRS) as WallyRealm[]) {
		const at = sync?.[realm];
		if (!at) continue;
		const there = nodeAt(root, syncTrail(at));
		if (there?.path !== undefined && normalisePath(there.path) === REALM_DIRS[realm])
			out.set(there.id, realm);
	}
	return out;
}
