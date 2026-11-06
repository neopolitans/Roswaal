/**
 * The viewport's hover: a ray against each part's own shape, nearest first,
 * passing through a part it starts inside, as the view draws it from there.
 */

import { describe, expect, it } from "vitest";
import { rayPick } from "../src/app/viewport/geometry.js";
import {
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneKind,
} from "../src/core/rbx/scene.js";

/** A scene of unrotated parts: each a shape, a size, a place and an id. */
function sceneOf(
	parts: { kind: SceneKind; size: number[]; at: number[]; id: number }[],
): PlaceScene {
	const empty = () =>
		Object.fromEntries(
			SCENE_KINDS.map((k) => [k, { data: new Float32Array(), count: 0 }]),
		) as PlaceScene["kinds"];
	const kinds = empty();
	for (const k of SCENE_KINDS) {
		const mine = parts.filter((p) => p.kind === k);
		const data = new Float32Array(mine.length * SCENE_STRIDE);
		const words = new Uint32Array(data.buffer);
		mine.forEach((p, i) => {
			const at = i * SCENE_STRIDE;
			data.set([p.size[0], 0, 0, 0, p.size[1], 0, 0, 0, p.size[2], ...p.at], at);
			words[at + 13] = p.id;
		});
		kinds[k] = { data, count: mine.length };
	}
	return { kinds, translucent: empty(), centre: [0, 0, 0], radius: 50, transparent: 0 };
}

const down = [0, -1, 0];

describe("The viewport's hover ray", () => {
	it("meets a block, and the nearer of two", () => {
		const scene = sceneOf([
			{ kind: "block", size: [4, 4, 4], at: [0, 0, 0], id: 1 },
			{ kind: "block", size: [4, 4, 4], at: [0, 10, 0], id: 2 },
		]);
		expect(rayPick(scene, [0, 20, 0], down)).toBe(2);
		expect(rayPick(scene, [10, 20, 0], down)).toBe(-1);
	});

	it("misses a ball's corners and a wedge's open side", () => {
		const scene = sceneOf([
			{ kind: "ball", size: [4, 4, 4], at: [0, 0, 0], id: 1 },
			{ kind: "wedge", size: [4, 4, 4], at: [20, 0, 0], id: 2 },
		]);
		expect(rayPick(scene, [0, 10, 0], down)).toBe(1);
		// Inside the ball's box, outside the ball.
		expect(rayPick(scene, [1.8, 10, 1.8], down)).toBe(-1);
		// The wedge is solid where y <= z: tall at the back (+Z), nothing above its front.
		expect(rayPick(scene, [20, 10, 1.8], down)).toBe(2);
		expect(rayPick(scene, [20, 10, -1.8], down)).toBe(2);
		expect(rayPick(scene, [20, 1.9, -1.8], down)).toBe(2);
		// Along X just under its top: open at the front, solid at the back.
		expect(rayPick(scene, [30, 1.8, -1.8], [-1, 0, 0])).toBe(-1);
		expect(rayPick(scene, [30, 1.8, 1.9], [-1, 0, 0])).toBe(2);
	});

	it("passes through a part it starts inside", () => {
		const scene = sceneOf([
			{ kind: "block", size: [40, 40, 40], at: [0, 0, 0], id: 1 },
			{ kind: "block", size: [2, 2, 2], at: [0, -5, 0], id: 2 },
		]);
		expect(rayPick(scene, [0, 5, 0], down)).toBe(2);
	});
});
