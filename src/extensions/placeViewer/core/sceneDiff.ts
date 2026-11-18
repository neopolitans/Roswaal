/**
 * A place's scene after an edit, as what changed from the scene before it:
 * the rows of the instances the edit touched, and whichever of the scene's
 * other parts are not as they were.
 *
 * The host works one out between two versions of the place whose outlines
 * are the same, so a row's id names the same instance in both; the viewer
 * applies it to the scene it already has. An edit then redraws what it
 * changed rather than the whole place.
 */

import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE, type SceneKind } from "./scene.js";

type Rows = { data: Float32Array; count: number };
type RowSets = Record<SceneKind, Rows>;

/** The parts of a scene besides its rows, which a patch carries whole when they change. */
export const SCENE_FIELDS = [
	"centre",
	"radius",
	"transparent",
	"pivots",
	"locked",
	"camera",
	"images",
	"meshes",
	"lights",
	"unions",
	"unionsDrawn",
	"unionCuts",
	"effects",
	"gizmos",
] as const;

export type SceneField = (typeof SCENE_FIELDS)[number];

export interface ScenePatch {
	/** Every instance whose rows are not as they were: its rows go, and `kinds` and `translucent` hold the new ones. */
	changed: number[];
	kinds: RowSets;
	translucent: RowSets;
	/** The scene's other parts that changed, whole. */
	fields: Partial<Pick<PlaceScene, SceneField>>;
}

/** Where one row is: solid or see-through, its kind, and its place in that list. */
type At = { set: "kinds" | "translucent"; kind: SceneKind; row: number };

const SETS = ["kinds", "translucent"] as const;

function words(rows: Rows): Uint32Array {
	return new Uint32Array(rows.data.buffer, rows.data.byteOffset, rows.count * SCENE_STRIDE);
}

/** Each instance's rows, by its id, in the order the scene lists them. */
function rowsById(scene: PlaceScene): Map<number, At[]> {
	const out = new Map<number, At[]>();
	for (const set of SETS)
		for (const kind of SCENE_KINDS) {
			const u = words(scene[set][kind]);
			for (let row = 0; row < scene[set][kind].count; row++) {
				const id = u[row * SCENE_STRIDE + 13];
				const at = { set, kind, row };
				const list = out.get(id);
				if (list) list.push(at);
				else out.set(id, [at]);
			}
		}
	return out;
}

/** Whether two lists of rows are the same rows, bit for bit, in the same places. */
function sameRows(a: PlaceScene, aAt: At[], b: PlaceScene, bAt: At[]): boolean {
	if (aAt.length !== bAt.length) return false;
	for (let i = 0; i < aAt.length; i++) {
		const x = aAt[i];
		const y = bAt[i];
		if (x.set !== y.set || x.kind !== y.kind) return false;
		const u = words(a[x.set][x.kind]);
		const v = words(b[y.set][y.kind]);
		for (let w = 0; w < SCENE_STRIDE; w++)
			if (u[x.row * SCENE_STRIDE + w] !== v[y.row * SCENE_STRIDE + w]) return false;
	}
	return true;
}

/** The rows of `scene` whose ids are in `ids`, kind by kind. */
function rowsOf(
	scene: PlaceScene,
	set: "kinds" | "translucent",
	ids: ReadonlySet<number>,
): RowSets {
	const out = {} as RowSets;
	for (const kind of SCENE_KINDS) {
		const { data, count } = scene[set][kind];
		const u = words(scene[set][kind]);
		const kept: number[] = [];
		for (let row = 0; row < count; row++) if (ids.has(u[row * SCENE_STRIDE + 13])) kept.push(row);
		const picked = new Float32Array(kept.length * SCENE_STRIDE);
		kept.forEach((row, i) => {
			picked.set(data.subarray(row * SCENE_STRIDE, (row + 1) * SCENE_STRIDE), i * SCENE_STRIDE);
		});
		out[kind] = { data: picked, count: kept.length };
	}
	return out;
}

/** What turns `before` into `after`. Both name instances by the same outline. */
export function diffScene(before: PlaceScene, after: PlaceScene): ScenePatch {
	const was = rowsById(before);
	const now = rowsById(after);
	const changed = new Set<number>();
	for (const [id, rows] of now) {
		const old = was.get(id);
		if (!old || !sameRows(before, old, after, rows)) changed.add(id);
	}
	for (const id of was.keys()) if (!now.has(id)) changed.add(id);
	const fields: ScenePatch["fields"] = {};
	for (const key of SCENE_FIELDS) {
		if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
			(fields as Record<string, unknown>)[key] = after[key];
	}
	return {
		changed: [...changed].sort((a, b) => a - b),
		kinds: rowsOf(after, "kinds", changed),
		translucent: rowsOf(after, "translucent", changed),
		fields,
	};
}

/**
 * `scene` with `patch` applied: each changed instance's rows taken out and
 * its new ones added. A kind nothing changed in keeps its rows as they were,
 * and the scene's other parts keep theirs unless the patch replaces them.
 */
export function applyScenePatch(scene: PlaceScene, patch: ScenePatch): PlaceScene {
	const changed = new Set(patch.changed);
	const each = (set: "kinds" | "translucent"): RowSets => {
		const out = {} as RowSets;
		for (const kind of SCENE_KINDS) {
			const old = scene[set][kind];
			const added = patch[set][kind];
			const u = words(old);
			const kept: number[] = [];
			for (let row = 0; row < old.count; row++)
				if (!changed.has(u[row * SCENE_STRIDE + 13])) kept.push(row);
			if (kept.length === old.count && added.count === 0) {
				out[kind] = old;
				continue;
			}
			const data = new Float32Array((kept.length + added.count) * SCENE_STRIDE);
			kept.forEach((row, i) => {
				data.set(old.data.subarray(row * SCENE_STRIDE, (row + 1) * SCENE_STRIDE), i * SCENE_STRIDE);
			});
			data.set(added.data.subarray(0, added.count * SCENE_STRIDE), kept.length * SCENE_STRIDE);
			out[kind] = { data, count: kept.length + added.count };
		}
		return out;
	};
	return { ...scene, ...patch.fields, kinds: each("kinds"), translucent: each("translucent") };
}
