/**
 * Rules about node packs as whole files, shared by the daemon and the designer.
 *
 * `parseNodePack` decides whether one node is valid. This decides what a *pack*
 * is compatible with, and what copying one into a project would collide with —
 * the questions the pack browser and import ask before anything is written.
 */

import type { NodeDef, Target } from "./schema.js";

const TARGETS: readonly Target[] = ["roblox", "lune"];

function isTarget(value: unknown): value is Target {
	return typeof value === "string" && (TARGETS as readonly string[]).includes(value);
}

/**
 * The targets every node in a pack runs on, or `null` when it runs on all.
 *
 * An intersection: a pack with one Roblox-only node is a pack a Lune project
 * cannot use in full, and saying "partly" would send somebody to find out which
 * part by hand. The pack's own declared `targets` narrows it the same way.
 */
export function packTargets(
	defs: readonly Pick<NodeDef, "targets">[], declared?: unknown,
): Target[] | null {
	let out: Target[] | null = Array.isArray(declared) ? declared.filter(isTarget) : null;
	for (const def of defs) {
		if (!def.targets) continue;
		out = out === null ? [...def.targets] : out.filter((t) => def.targets!.includes(t));
	}
	return out;
}

/** Whether something limited to `targets` runs on `target`. */
export function runsOn(targets: readonly Target[] | null, target: Target): boolean {
	return targets === null || targets.includes(target);
}

/** A pack's `requires`, as the names it lists and nothing else. */
export function packRequires(declared: unknown): string[] {
	return Array.isArray(declared) ? declared.filter((r): r is string => typeof r === "string" && r !== "") : [];
}

/** The namespace a pack's node ids take from its file name. */
export function namespaceFor(packName: string): string {
	const ns = packName.replace(/[^A-Za-z0-9_]/g, "_");
	return /^[A-Za-z_]/.test(ns) ? ns : `pack_${ns}`;
}

/**
 * Moves every node into another namespace: `combat.knockback` becomes
 * `combat_copy.knockback`.
 *
 * What a duplicate needs. Two packs defining the same id is not an error the
 * loader reports — the later one wins — so a copy that kept its ids would quietly
 * replace the original's nodes in every graph using them.
 */
export function renamespace<T extends { id: string }>(nodes: readonly T[], namespace: string): T[] {
	return nodes.map((node) => {
		const dot = node.id.indexOf(".");
		const local = dot === -1 ? node.id : node.id.slice(dot + 1);
		return { ...node, id: `${namespace}.${local}` };
	});
}

/** The ids in `ids` something else already defines. */
export function clashingIds(ids: readonly string[], taken: Iterable<string>): string[] {
	const set = new Set(taken);
	return ids.filter((id) => set.has(id));
}
