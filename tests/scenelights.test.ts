/**
 * A place's lights as the renderers take them: read from their parts and
 * Attachments, and found again through the hashed grid of cells.
 */

import { describe, expect, it } from "vitest";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import {
	LIGHT_CELL,
	lightGrid,
	lightHash,
} from "../src/extensions/placeViewer/app/viewport/view.js";
import {
	LIGHT_POINT,
	LIGHT_SPOT,
	LIGHT_STRIDE,
	LIGHT_SURFACE,
	sceneLights,
} from "../src/extensions/placeViewer/core/scene.js";

function inst(
	className: string,
	props: Record<string, [PropType, unknown]>,
	children: RbxInstance[] = [],
): RbxInstance {
	const made: RbxInstance = {
		className,
		name: className,
		parent: null,
		children,
		props: new Map<string, Prop>(
			Object.entries(props).map(([k, [type, value]]) => [k, { type, value }]),
		),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** A 4 × 1 × 6 part at `at`, square to the world, holding `kids`. */
const part = (at: number[], ...kids: RbxInstance[]) =>
	inst(
		"Part",
		{
			CFrame: ["CFrame", { position: at, rotation: IDENTITY }],
			size: ["Vector3", [4, 1, 6]],
		},
		kids,
	);
const round = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000 + 0);

describe("a place's lights", () => {
	it("are read from their parts: where, how far, how bright and which way", () => {
		const lights = sceneLights(
			inst("Workspace", {}, [
				part(
					[10, 20, 30],
					inst("PointLight", { Range: ["Float32", 12], Brightness: ["Float32", 2] }),
				),
				part(
					[0, 5, 0],
					inst("SurfaceLight", {
						Range: ["Float32", 20],
						Angle: ["Float32", 90],
						Face: ["Enum", 4],
						Color: ["Color3", [1, 0.5, 0]],
					}),
				),
				part([0, 0, 0], inst("SpotLight", { Enabled: ["Bool", false] })),
			]),
		);
		expect(lights.length).toBe(2 * LIGHT_STRIDE);
		const [point, surface] = [lights.slice(0, LIGHT_STRIDE), lights.slice(LIGHT_STRIDE)];
		expect(point.slice(0, 4)).toEqual([10, 20, 30, 12]);
		expect(round(point.slice(4, 8))).toEqual([
			...round([2 ** 1.25, 2 ** 1.25, 2 ** 1.25]),
			LIGHT_POINT,
		]);
		// The Bottom face's middle, facing down, its half-sides along X and Z.
		expect(round(surface.slice(0, 4))).toEqual([0, 4.5, 0, 20]);
		expect(round(surface.slice(4, 8))).toEqual([1, round([0.5 ** 2.2])[0], 0, LIGHT_SURFACE]);
		expect(round(surface.slice(8, 12))).toEqual([0, -1, 0, round([Math.PI / 4])[0]]);
		expect(Math.abs(surface[12]) + Math.abs(surface[16])).toBe(2);
		expect(Math.abs(surface[14]) + Math.abs(surface[18])).toBe(3);
	});

	it("light from an Attachment's place in its part", () => {
		const turned = inst(
			"Part",
			{
				CFrame: ["CFrame", { position: [0, 10, 0], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0] }],
				size: ["Vector3", [2, 2, 2]],
			},
			[
				inst("Attachment", { CFrame: ["CFrame", { position: [3, 0, 0], rotation: IDENTITY }] }, [
					inst("SpotLight", { Face: ["Enum", 5] }),
				]),
			],
		);
		const lights = sceneLights(inst("Workspace", {}, [turned]));
		expect(round(lights.slice(0, 3))).toEqual([0, 10, -3]);
		expect(lights[7]).toBe(LIGHT_SPOT);
	});
});

describe("the grid that finds the lights", () => {
	it("lists a light in the cells its Range reaches, and not beyond", () => {
		const lights = sceneLights(
			inst("Workspace", {}, [part([100, 50, -40], inst("PointLight", { Range: ["Float32", 20] }))]),
		);
		const { table, index } = lightGrid(lights);
		const at = (p: number[]) => {
			const h = lightHash(
				...(p.map((v) => Math.floor(v / LIGHT_CELL)) as [number, number, number]),
			);
			return [...index.slice(table[h * 2], table[h * 2] + table[h * 2 + 1])];
		};
		expect(at([100, 50, -40])).toEqual([0]);
		expect(at([115, 50, -40])).toEqual([0]);
		expect(at([200, 50, -40])).toEqual([]);
	});

	it("is empty for a place with no lights", () => {
		const { table, index } = lightGrid(undefined);
		expect(table.every((v) => v === 0)).toBe(true);
		expect(index.length).toBe(1);
	});
});

describe("a place sent again after an edit", () => {
	it("keeps its fingerprint while its parts and lights are unchanged", async () => {
		const { fingerprint } = await import("../src/extensions/placeViewer/app/viewport/view.js");
		const parts = new Float32Array([1, 2, 3, 4]);
		expect(fingerprint(parts, [5, 6])).toBe(fingerprint(new Float32Array([1, 2, 3, 4]), [5, 6]));
		expect(fingerprint(parts, [5, 6])).not.toBe(fingerprint(parts, [5, 7]));
		expect(fingerprint(parts)).not.toBe(fingerprint(new Float32Array([1, 2, 3, 4, 0])));
	});
});

describe("the sun's cascades", () => {
	it("reach 64, 256 and 1024 studs out, and are off with GlobalShadows off", async () => {
		const { cascadeBlock, SUN_CASCADES } = await import(
			"../src/extensions/placeViewer/app/viewport/view.js"
		);
		const camera = { eye: [0, 10, 30], at: [0, 0, 0], near: 0.1, far: 10000 };
		const box = { min: [-500, 0, -500], max: [500, 100, 500] };
		const n = SUN_CASCADES.length * 16;
		const on = cascadeBlock(camera, 16 / 9, [-0.5, 0.866, 0], box, 0.2, true, true);
		expect([...on.subarray(n, n + 3)]).toEqual([64, 256, 1024]);
		expect(on[n + 7]).toBe(1);
		// Finer near the camera than far from it.
		expect(on[n + 4]).toBeLessThan(on[n + 5]);
		expect(on[n + 5]).toBeLessThan(on[n + 6]);
		expect(cascadeBlock(camera, 16 / 9, [-0.5, 0.866, 0], box, 0.2, false, true)[n + 7]).toBe(2);
	});

	it("move only by whole texels as the camera moves", async () => {
		const { cascadeBlock } = await import("../src/extensions/placeViewer/app/viewport/view.js");
		const box = { min: [-500, 0, -500], max: [500, 100, 500] };
		const at = (x: number) =>
			cascadeBlock(
				{ eye: [x, 10, 30], at: [x, 0, 0], near: 0.1, far: 10000 },
				1,
				[0, 1, 0],
				box,
				0.2,
				true,
				true,
			);
		const a = at(0);
		const b = at(0.001);
		expect([...a.subarray(0, 16)]).toEqual([...b.subarray(0, 16)]);
	});
});

describe("a part with CastShadow off", () => {
	it("is marked to be left out of the shadow and sky maps, its mesh slot as it was", async () => {
		const { buildPlaceScene, NO_SHADOW, SCENE_STRIDE } = await import(
			"../src/extensions/placeViewer/core/scene.js"
		);
		const lit = part([0, 0, 0]);
		const none = part([10, 0, 0]);
		none.props.set("CastShadow", { type: "Bool", value: false });
		const scene = buildPlaceScene(inst("Workspace", {}, [lit, none]), () => 1);
		const { data, count } = scene.kinds.block;
		const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
		const looks = [0, 1].map((r) => words[r * SCENE_STRIDE + 14]);
		expect(looks.map((l) => (l & NO_SHADOW) !== 0)).toEqual([false, true]);
		expect(looks.map((l) => (l >>> 16) & 0x7fff)).toEqual([0, 0]);
	});
});
