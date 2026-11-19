/**
 * The Rendering panel's Heaviest: meshes ranked by the triangles their copies
 * cost, and by how many copies are drawn, from the scene's rows.
 */

import { describe, expect, it } from "vitest";
import {
	heaviest,
	meshCosts,
	shortCount,
} from "../src/extensions/placeEditor/app/viewport/heaviest.js";
import { instanceData, SCENE_STRIDE } from "../src/extensions/placeEditor/core/scene.js";

/** Rows of the mesh shape: each an id and the mesh slot it draws, -1 for its box. */
function rows(list: [id: number, slot: number][]): { data: Float32Array; count: number } {
	const words: number[] = [];
	for (const [id, slot] of list) {
		const row = new Array(SCENE_STRIDE).fill(0);
		row[0] = row[4] = row[8] = 1;
		row[12] = 0xffffffff;
		row[13] = id;
		row[14] = slot < 0 ? 0 : (slot + 1) << 16;
		words.push(...row);
	}
	return { data: instanceData(words), count: list.length };
}

const TRIS = [1000, 50, 20000, 50];
const KEYS = ["rock", "pebble", "statue", "pebble"];

describe("meshCosts", () => {
	it("counts each mesh's copies and their triangles, one asset in two slots as one", () => {
		const costs = meshCosts(
			[
				rows([
					[1, 0],
					[2, 1],
					[3, 1],
					[4, -1],
				]),
				rows([
					[5, 3],
					[6, 0],
				]),
			],
			(slot) => TRIS[slot],
			(slot) => KEYS[slot],
		);
		const by = Object.fromEntries(costs.map((m) => [m.key, m]));
		expect(by.rock).toMatchObject({ rows: [1, 6], copies: 2, triangles: 1000, total: 2000 });
		expect(by.pebble).toMatchObject({ rows: [2, 3, 5], copies: 3, triangles: 50, total: 150 });
		expect(by.statue).toBeUndefined();
	});

	it("picks a row drawn twice with one mesh once, counting both draws", () => {
		const [mesh] = meshCosts(
			[
				rows([
					[7, 0],
					[7, 0],
				]),
			],
			() => 10,
			() => "union",
		);
		expect(mesh).toMatchObject({ rows: [7], copies: 2, total: 20 });
	});

	it("leaves out a mesh not downloaded yet: it is drawn as its box", () => {
		const costs = meshCosts(
			[rows([[1, 2]])],
			() => undefined,
			(slot) => KEYS[slot],
		);
		expect(costs).toEqual([]);
	});
});

describe("heaviest", () => {
	const costs = meshCosts(
		[
			rows([
				[1, 0],
				[2, 1],
				[3, 1],
				[4, 2],
				[5, 3],
				[6, 0],
			]),
		],
		(slot) => TRIS[slot],
		(slot) => KEYS[slot],
	);

	it("ranks by the triangles all copies cost", () => {
		expect(heaviest(costs).byTriangles.map((m) => m.key)).toEqual(["statue", "rock", "pebble"]);
	});

	it("ranks by copies, leaving out what is drawn once", () => {
		expect(heaviest(costs).byCopies.map((m) => m.key)).toEqual(["pebble", "rock"]);
	});

	it("lists only so many", () => {
		const many = meshCosts(
			[rows(Array.from({ length: 30 }, (_, i): [number, number] => [i, i]))],
			(slot) => slot + 1,
			(slot) => `m${slot}`,
		);
		const top = heaviest(many, 10).byTriangles;
		expect(top).toHaveLength(10);
		expect(top[0].key).toBe("m29");
	});
});

describe("shortCount", () => {
	it("shortens large counts", () => {
		expect(shortCount(950)).toBe("950");
		expect(shortCount(1234)).toBe("1.2k");
		expect(shortCount(56789)).toBe("57k");
		expect(shortCount(3_100_000)).toBe("3.1M");
	});
});
