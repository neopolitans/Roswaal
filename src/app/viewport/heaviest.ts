/**
 * The Mesh Debug panel: the meshes that cost the most triangles,
 * each mesh's own times the copies drawing it, and the meshes drawn most
 * often, so what makes a place slow to draw can be found and picked.
 */

import { SCENE_STRIDE } from "../../core/rbx/scene.js";

/** How many of each the panel lists. */
export const HEAVIEST_MOST = 10;

/** One mesh, and the rows drawing it. */
export interface HeavyMesh {
	/** What makes copies one mesh: its asset id, or for one made here its slot. */
	key: string;
	/** The DataModel rows drawing it, in the order the scene has them. */
	rows: number[];
	/** Triangles in one copy. */
	triangles: number;
	copies: number;
	/** `triangles` times `copies`: what it costs a frame that draws them all. */
	total: number;
}

export interface Heaviest {
	byTriangles: HeavyMesh[];
	byCopies: HeavyMesh[];
}

/**
 * The meshes `sets` draw, by the key `keyOf` gives each slot, with the
 * triangles `triangles` says a slot's mesh has; a slot with no mesh yet (not
 * downloaded) is left out, as it is drawn as its box.
 */
export function meshCosts(
	sets: readonly { data: Float32Array; count: number }[],
	triangles: (slot: number) => number | undefined,
	keyOf: (slot: number) => string,
): HeavyMesh[] {
	const byKey = new Map<string, HeavyMesh>();
	// A row drawn twice with one mesh (a union's pieces) is picked once.
	const rowsOf = new Map<string, Set<number>>();
	for (const { data, count } of sets) {
		const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
		for (let i = 0; i < count; i++) {
			const slot = ((words[i * SCENE_STRIDE + 14] >>> 16) & 0x7fff) - 1;
			if (slot < 0) continue;
			const tris = triangles(slot);
			if (tris === undefined) continue;
			const key = keyOf(slot);
			let mesh = byKey.get(key);
			let rows = rowsOf.get(key);
			if (!mesh || !rows) {
				mesh = { key, rows: [], triangles: tris, copies: 0, total: 0 };
				rows = new Set();
				byKey.set(key, mesh);
				rowsOf.set(key, rows);
			}
			const row = words[i * SCENE_STRIDE + 13];
			if (!rows.has(row)) {
				rows.add(row);
				mesh.rows.push(row);
			}
			mesh.copies++;
			mesh.total += tris;
			mesh.triangles = Math.max(mesh.triangles, tris);
		}
	}
	return [...byKey.values()];
}

/** The `most` costliest in triangles, and the `most` drawn most often; ties by the other, then key. */
export function heaviest(meshes: readonly HeavyMesh[], most = HEAVIEST_MOST): Heaviest {
	const tie = (a: HeavyMesh, b: HeavyMesh) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
	return {
		byTriangles: [...meshes]
			.sort((a, b) => b.total - a.total || b.copies - a.copies || tie(a, b))
			.slice(0, most),
		byCopies: [...meshes]
			.filter((m) => m.copies > 1)
			.sort((a, b) => b.copies - a.copies || b.total - a.total || tie(a, b))
			.slice(0, most),
	};
}

/** A count as the panel shows it: 950, 12.4k, 3.1M. */
export function shortCount(n: number): string {
	if (n < 1000) return String(Math.round(n));
	if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k`;
	return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)}M`;
}
