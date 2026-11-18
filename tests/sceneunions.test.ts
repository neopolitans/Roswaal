/**
 * Unions in the viewport's scene, drawn as the parts they were made from:
 * ChildData's parts placed by the union's CFrame and how far it has been
 * stretched since it was made, painted as the union says, and what it
 * takes away cut from them.
 */

import { describe, expect, it } from "vitest";

import { assetIdOf } from "../src/core/rbx/browse.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { writeBinaryPlace } from "../src/core/rbx/serialize.js";
import { materialIndex } from "../src/extensions/placeViewer/core/materials.js";
import {
	buildPlaceScene,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
} from "../src/extensions/placeViewer/core/scene.js";
import {
	addUnions,
	childDataOf,
	nestedUnionAssets,
	unionOutline,
	unionsWaiting,
	withUnions,
} from "../src/extensions/placeViewer/core/unions.js";

const utf8 = new TextEncoder();
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** A quarter turn about Y: the part's X points down world -Z. */
const QUARTER_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];

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
		props: new Map<string, Prop>([
			["Name", { type: "String", value: utf8.encode(className) }],
			...Object.entries(props).map(([k, [type, value]]): [string, Prop] => [k, { type, value }]),
		]),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const at = (position: number[], rotation = IDENTITY): [PropType, unknown] => [
	"CFrame",
	{ position, rotation },
];

/** A binary model of `roots`, as ChildData holds one. */
function model(...roots: RbxInstance[]): Uint8Array {
	const instances: RbxInstance[] = [];
	const all = (i: RbxInstance) => {
		instances.push(i);
		for (const c of i.children) all(c);
	};
	for (const r of roots) all(r);
	return writeBinaryPlace({ format: "binary", roots, instances, undecoded: new Map() });
}

/** A SolidModel asset: a PartOperationAsset whose ChildData is a model of `parts`. */
function solidModel(...parts: RbxInstance[]): Uint8Array {
	return model(
		inst("PartOperationAsset", {
			ChildData: ["String", model(...parts)],
			MeshData: ["String", utf8.encode("not read")],
		}),
	);
}

/** The parts of the union below: a red block to one side, a wedge apart from it, and a cut. */
const childParts = () => [
	inst("Part", {
		CFrame: at([1, 0, 0]),
		size: ["Vector3", [2, 1, 1]],
		Color3uint8: ["Color3uint8", [10, 20, 30]],
		shape: ["Enum", 1],
	}),
	inst("WedgePart", { CFrame: at([-1.5, 0, 0]), size: ["Vector3", [2, 1, 1]] }),
	inst("NegateOperation", { CFrame: at([0, 0, 0]), size: ["Vector3", [1, 1, 1]] }),
];

function union(props: Record<string, [PropType, unknown]> = {}): RbxInstance {
	return inst("UnionOperation", {
		AssetId: ["String", utf8.encode("http://www.roblox.com//asset/?id=55")],
		CFrame: at([10, 0, 0], QUARTER_Y),
		size: ["Vector3", [8, 1, 2]],
		InitialSize: ["Vector3", [4, 1, 2]],
		Color3uint8: ["Color3uint8", [200, 0, 0]],
		Material: ["Enum", 288],
		UsePartColor: ["Bool", true],
		...props,
	});
}

function sceneOf(...parts: RbxInstance[]): PlaceScene {
	const workspace = inst("Workspace", {}, parts);
	const ids = new Map(parts.map((p, i) => [p, i + 3]));
	const idOf = (i: RbxInstance) => ids.get(i);
	return withUnions(buildPlaceScene(workspace, idOf), workspace, idOf);
}

/** Every row of a scene, solid then see-through, as floats and words. */
function rowsOf(scene: PlaceScene, set: "kinds" | "translucent" = "kinds") {
	return SCENE_KINDS.flatMap((kind) => {
		const { data, count } = scene[set][kind];
		const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
		return Array.from({ length: count }, (_, i) => {
			const o = i * SCENE_STRIDE;
			return {
				kind,
				axes: Array.from(data.subarray(o, o + 9)).map(round),
				p: Array.from(data.subarray(o + 9, o + 12)).map(round),
				rgb: [words[o + 12] & 255, (words[o + 12] >> 8) & 255, (words[o + 12] >> 16) & 255],
				alpha: words[o + 12] >>> 24,
				id: words[o + 13],
				material: words[o + 14] & 255,
				mesh: words[o + 14] >>> 16,
			};
		});
	});
}

const round = (x: number) => Math.round(x * 1000) / 1000 + 0;
const models = (asset: string, bytes: Uint8Array) =>
	new Map([[asset, childDataOf(bytes) as RbxInstance[]]]);

describe("a union's AssetId", () => {
	it("is read with the doubled slash Studio writes, and the forms it always took", () => {
		expect(assetIdOf("http://www.roblox.com//asset/?id=390950281")).toBe("390950281");
		expect(assetIdOf("https://www.roblox.com//asset/?id=2721672581")).toBe("2721672581");
		expect(assetIdOf("http://www.roblox.com/asset/?id=12")).toBe("12");
		expect(assetIdOf("http://roblox.com/asset?id=12")).toBe("12");
		expect(assetIdOf("rbxassetid://12")).toBe("12");
	});

	it("is no other address", () => {
		expect(assetIdOf("http://www.roblox.com///asset/?id=12")).toBeUndefined();
		expect(assetIdOf("http://www.roblox.com.example.com//asset/?id=12")).toBeUndefined();
		expect(assetIdOf("http://example.com//asset/?id=12")).toBeUndefined();
		expect(assetIdOf("rbxasset://textures/face.png")).toBeUndefined();
		expect(assetIdOf("")).toBeUndefined();
	});
});

describe("a SolidModel asset", () => {
	it("opens to the parts the union was made from", () => {
		const roots = childDataOf(solidModel(...childParts()));
		expect(roots?.map((r) => r.className)).toEqual(["Part", "WedgePart", "NegateOperation"]);
	});

	it("is nothing else", () => {
		expect(childDataOf(model(inst("Part", {})))).toBeUndefined();
		expect(childDataOf(utf8.encode("not a model"))).toBeUndefined();
	});
});

describe("a union in the scene", () => {
	it("waits for its asset, outlined by its own box, and is not drawn until then", () => {
		const scene = sceneOf(union());
		expect(unionsWaiting(scene)).toEqual(["55"]);
		expect(rowsOf(scene)).toEqual([]);
		const box = Array.from(unionOutline(scene.unions?.[0] as never).subarray(0, 12)).map(round);
		// X, eight long, now down world -Z; Y one; Z two, now along world X.
		expect(box).toEqual([0, 0, -8, 0, 1, 0, 2, 0, 0, 10, 0, 0]);
	});

	it("draws its parts where they are in it, stretched as it has been since it was made", () => {
		const scene = addUnions(sceneOf(union()), models("55", solidModel(...childParts())));
		const rows = rowsOf(scene);
		expect(rows.map((r) => r.kind)).toEqual(["block", "wedge"]);
		const [block, wedge] = rows;
		// One stud along the union's X, stretched to two, turned to world -Z.
		expect(block.p).toEqual([10, 0, -2]);
		expect(wedge.p).toEqual([10, 0, 3]);
		// The block's two studs of X, stretched to four.
		expect(block.axes).toEqual([0, 0, -4, 0, 1, 0, 1, 0, 0]);
		expect(scene.unionsDrawn).toEqual([3]);
		expect(unionsWaiting(scene)).toEqual([]);
	});

	it("paints them in its Color and Material when UsePartColor is on, under its own row", () => {
		const rows = rowsOf(addUnions(sceneOf(union()), models("55", solidModel(...childParts()))));
		for (const row of rows) {
			expect(row.rgb).toEqual([200, 0, 0]);
			expect(row.material).toBe(materialIndex(288));
			expect(row.alpha).toBe(255);
			expect(row.id).toBe(3);
		}
	});

	it("lets each part keep its own colour when UsePartColor is off; one with none takes the union's", () => {
		const scene = sceneOf(union({ UsePartColor: ["Bool", false] }));
		const [block, wedge] = rowsOf(addUnions(scene, models("55", solidModel(...childParts()))));
		expect(block.rgb).toEqual([10, 20, 30]);
		expect(wedge.rgb).toEqual([200, 0, 0]);
	});

	it("leaves out what it takes away, and says it did", () => {
		const scene = addUnions(sceneOf(union()), models("55", solidModel(...childParts())));
		expect(rowsOf(scene)).toHaveLength(2);
		expect(scene.unionCuts).toEqual([3]);
		const whole = addUnions(sceneOf(union()), models("55", solidModel(childParts()[0])));
		expect(whole.unionCuts).toEqual([]);
	});

	it("is see-through as a whole when it is", () => {
		const scene = sceneOf(union({ Transparency: ["Float32", 0.5] }));
		const drawn = addUnions(scene, models("55", solidModel(...childParts())));
		expect(rowsOf(drawn)).toEqual([]);
		expect(rowsOf(drawn, "translucent").map((r) => r.alpha)).toEqual([128, 128]);
	});

	it("is left out when fully transparent, and counted as such", () => {
		const scene = sceneOf(union({ Transparency: ["Float32", 1] }));
		expect(scene.unions).toBeUndefined();
		expect(scene.transparent).toBe(1);
	});

	it("draws at once when it holds its own ChildData", () => {
		const own = union({
			AssetId: ["String", new Uint8Array(0)],
			ChildData: ["String", model(...childParts())],
		});
		const scene = sceneOf(own);
		expect(unionsWaiting(scene)).toEqual([]);
		expect(rowsOf(scene).map((r) => r.p)).toEqual([
			[10, 0, -2],
			[10, 0, 3],
		]);
	});

	it("draws a union inside it in that union's own frame", () => {
		// Inside: a block at (1, 0, 0) in a union half a turn about Y at (0, 0, 3),
		// which has been doubled along its X since it was made.
		const inner = inst("UnionOperation", {
			CFrame: at([0, 0, 3], [-1, 0, 0, 0, 1, 0, 0, 0, -1]),
			size: ["Vector3", [4, 1, 1]],
			InitialSize: ["Vector3", [2, 1, 1]],
			ChildData: ["String", model(childParts()[0])],
		});
		const scene = addUnions(sceneOf(union()), models("55", solidModel(inner)));
		// Inner: (1,0,0) → doubled (2,0,0) → turned (-2,0,0) → moved (-2,0,3).
		// Outer: doubled along X (-4,0,3) → turned (3,0,4) → moved (13,0,4).
		expect(rowsOf(scene).map((r) => r.p)).toEqual([[13, 0, 4]]);
	});

	it("names the assets the unions inside it need", () => {
		const inner = inst("UnionOperation", {
			AssetId: ["String", utf8.encode("rbxassetid://77")],
		});
		expect(nestedUnionAssets([inner, ...childParts()])).toEqual(["77"]);
	});

	it("adds the meshes its parts draw after the scene's own", () => {
		const mesh = (id: string, x: number) =>
			inst("MeshPart", {
				CFrame: at([x, 0, 0]),
				size: ["Vector3", [1, 1, 1]],
				MeshId: ["String", utf8.encode(`rbxassetid://${id}`)],
			});
		const scene = sceneOf(mesh("900", 50), union());
		const drawn = addUnions(scene, models("55", solidModel(mesh("901", 0), mesh("900", 1))));
		expect(drawn.meshes?.map((m) => m.asset)).toEqual(["900", "901"]);
		expect(rowsOf(drawn).map((r) => [r.id, r.mesh])).toEqual([
			[3, 1],
			[4, 2],
			[4, 1],
		]);
	});

	it("is not an IntersectOperation, which its parts would draw too large", () => {
		const intersect = union();
		intersect.className = "IntersectOperation";
		expect(sceneOf(intersect).unions).toBeUndefined();
	});
});

/** A block of `size` at `position`, in `rgb`. */
const block = (position: number[], size: number[], rgb = [10, 20, 30]) =>
	inst("Part", {
		CFrame: at(position),
		size: ["Vector3", size],
		Color3uint8: ["Color3uint8", rgb],
		shape: ["Enum", 1],
	});
/** A union at `position`, square to the world, `size` now and `made` when it was made. */
const square = (
	position: number[],
	size: number[],
	made = size,
	props: Record<string, [PropType, unknown]> = {},
) =>
	union({
		CFrame: at(position),
		size: ["Vector3", size],
		InitialSize: ["Vector3", made],
		...props,
	});

/** A made mesh row's triangles in the world: area, and whether each faces the way its normal says. */
function surface(scene: PlaceScene, set: "kinds" | "translucent" = "kinds") {
	const { data, count } = scene[set].mesh;
	const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
	return Array.from({ length: count }, (_, r) => {
		const o = r * SCENE_STRIDE;
		const made = scene.meshes?.[(words[o + 14] >>> 16) - 1]?.made;
		if (!made) return undefined;
		const world = (v: number) =>
			[0, 1, 2].map(
				(k) =>
					data[o + 9 + k] +
					data[o + k] * made.vertices[v * 6] +
					data[o + 3 + k] * made.vertices[v * 6 + 1] +
					data[o + 6 + k] * made.vertices[v * 6 + 2],
			);
		let area = 0;
		let outward = true;
		for (let t = 0; t < made.indices.length; t += 3) {
			const [a, b, c] = [0, 1, 2].map((k) => world(made.indices[t + k]));
			const u = b.map((x, k) => x - a[k]);
			const w = c.map((x, k) => x - a[k]);
			const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
			area += Math.hypot(n[0], n[1], n[2]) / 2;
			// The stored normal, turned as the shaders turn it: the row's axes over their lengths squared.
			const v = made.indices[t];
			const s = [0, 1, 2].map((k) =>
				Math.hypot(data[o + k * 3], data[o + k * 3 + 1], data[o + k * 3 + 2]),
			);
			const said = [0, 1, 2].map((k) =>
				[0, 1, 2].reduce(
					(sum, j) => sum + data[o + j * 3 + k] * (made.vertices[v * 6 + 3 + j] / s[j] ** 2),
					0,
				),
			);
			if (n[0] * said[0] + n[1] * said[1] + n[2] * said[2] <= 0) outward = false;
		}
		return { area: round(area), triangles: made.indices.length / 3, outward };
	});
}

describe("a union's parts where they meet", () => {
	it("has no faces between two parts placed edge to edge: one shape, on its own box", () => {
		const parts = solidModel(block([-0.5, 0, 0], [1, 1, 1]), block([0.5, 0, 0], [1, 1, 1]));
		const scene = addUnions(sceneOf(square([0, 5, 0], [2, 1, 1])), models("55", parts));
		const rows = rowsOf(scene);
		expect(rows.map((r) => [r.kind, r.id])).toEqual([["mesh", 3]]);
		expect(rows[0].axes).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 1]);
		expect(rows[0].p).toEqual([0, 5, 0]);
		// The two blocks' outsides: ten faces of 1, as twenty triangles, each facing out.
		expect(surface(scene)).toEqual([{ area: 10, triangles: 20, outward: true }]);
		expect(scene.meshes?.[0].asset).toBe("");
	});

	it("keeps one of two outer faces that overlap, and nothing of a part inside another", () => {
		// Two blocks overlapping by one: the outside of a box three long.
		const parts = solidModel(
			block([-0.5, 0, 0], [2, 1, 1]),
			block([0.5, 0, 0], [2, 1, 1]),
			block([0, 0, 0], [0.5, 0.5, 0.5]),
		);
		const scene = addUnions(sceneOf(square([0, 0, 0], [3, 1, 1])), models("55", parts));
		expect(surface(scene)).toEqual([expect.objectContaining({ area: 14, outward: true })]);
	});

	it("keeps the part of a face that is only partly covered", () => {
		// A 1x2 end face with a 1x1 block against its lower half: the upper half shows.
		const parts = solidModel(block([0, 0, 0], [1, 2, 1]), block([1, -0.5, 0], [1, 1, 1]));
		const scene = addUnions(sceneOf(square([0, 0, 0], [2, 2, 1])), models("55", parts));
		// 2*(1*2 + 1*1 + 2*1) - 1 for the tall block, 6 - 1 for the small one.
		expect(surface(scene)).toEqual([expect.objectContaining({ area: 14, outward: true })]);
	});

	it("takes the seam from a wedge against a block, as from blocks", () => {
		// A wedge's back (its +Z face, 1x1) against the block's -Z face.
		const parts = solidModel(
			block([0, 0, 0], [1, 1, 1]),
			inst("WedgePart", { CFrame: at([0, 0, -1]), size: ["Vector3", [1, 1, 1]] }),
		);
		const scene = addUnions(sceneOf(square([0, 0, 0.5], [1, 1, 2])), models("55", parts));
		// The block's five other faces; the wedge's bottom, slope and two sides.
		const wedge = 1 + Math.SQRT2 + 0.5 + 0.5;
		expect(surface(scene)).toEqual([
			expect.objectContaining({ area: round(5 + wedge), outward: true }),
		]);
	});

	it("is one shape a colour where its parts keep their own", () => {
		const parts = solidModel(
			block([-0.5, 0, 0], [1, 1, 1], [255, 0, 0]),
			block([0.5, 0, 0], [1, 1, 1], [0, 0, 255]),
		);
		const own = square([0, 0, 0], [2, 1, 1], [2, 1, 1], { UsePartColor: ["Bool", false] });
		const scene = addUnions(sceneOf(own), models("55", parts));
		expect(rowsOf(scene).map((r) => [r.kind, r.rgb])).toEqual([
			["mesh", [255, 0, 0]],
			["mesh", [0, 0, 255]],
		]);
		expect(surface(scene).map((s) => s?.area)).toEqual([5, 5]);
	});

	it("is one see-through surface when it is see-through", () => {
		const parts = solidModel(block([-0.5, 0, 0], [1, 1, 1]), block([0.5, 0, 0], [1, 1, 1]));
		const glass = square([0, 0, 0], [2, 1, 1], [2, 1, 1], { Transparency: ["Float32", 0.5] });
		const scene = addUnions(sceneOf(glass), models("55", parts));
		expect(rowsOf(scene)).toEqual([]);
		expect(rowsOf(scene, "translucent").map((r) => [r.kind, r.alpha])).toEqual([["mesh", 128]]);
		expect(surface(scene, "translucent")).toEqual([{ area: 10, triangles: 20, outward: true }]);
	});

	it("shares its shape with a copy stretched and turned", () => {
		const parts = solidModel(block([-0.5, 0, 0], [1, 1, 1]), block([0.5, 0, 0], [1, 1, 1]));
		const copy = union({
			CFrame: at([20, 0, 0], QUARTER_Y),
			size: ["Vector3", [6, 1, 1]],
			InitialSize: ["Vector3", [2, 1, 1]],
		});
		const scene = addUnions(sceneOf(square([0, 0, 0], [2, 1, 1]), copy), models("55", parts));
		expect(scene.meshes).toHaveLength(1);
		expect(surface(scene).map((s) => s?.area)).toEqual([10, 2 * (6 + 6 + 1)]);
		expect(surface(scene).every((s) => s?.outward)).toBe(true);
	});

	it("leaves parts that do not meet, and round ones, as they were", () => {
		const parts = solidModel(
			block([-1, 0, 0], [1, 1, 1]),
			block([1, 0, 0], [1, 1, 1]),
			inst("Part", { CFrame: at([0, 0, 0]), size: ["Vector3", [1, 1, 1]], shape: ["Enum", 0] }),
		);
		const scene = addUnions(sceneOf(square([0, 0, 0], [3, 1, 1])), models("55", parts));
		expect(rowsOf(scene).map((r) => r.kind)).toEqual(["block", "block", "ball"]);
		expect(scene.meshes).toBeUndefined();
	});
});

/** The volume a scene's made meshes close in, in the world: positive when every face faces out. */
function volume(scene: PlaceScene, set: "kinds" | "translucent" = "kinds"): number {
	const { data, count } = scene[set].mesh;
	const words = new Uint32Array(data.buffer, data.byteOffset, count * SCENE_STRIDE);
	let sum = 0;
	for (let r = 0; r < count; r++) {
		const o = r * SCENE_STRIDE;
		const made = scene.meshes?.[(words[o + 14] >>> 16) - 1]?.made;
		if (!made) continue;
		const world = (v: number) =>
			[0, 1, 2].map(
				(k) =>
					data[o + 9 + k] +
					data[o + k] * made.vertices[v * 6] +
					data[o + 3 + k] * made.vertices[v * 6 + 1] +
					data[o + 6 + k] * made.vertices[v * 6 + 2],
			);
		for (let t = 0; t < made.indices.length; t += 3) {
			const [a, b, c] = [0, 1, 2].map((k) => world(made.indices[t + k]));
			sum +=
				(a[0] * (b[1] * c[2] - b[2] * c[1]) +
					a[1] * (b[2] * c[0] - b[0] * c[2]) +
					a[2] * (b[0] * c[1] - b[1] * c[0])) /
				6;
		}
	}
	return round(sum);
}

/** A NegateOperation at `position` holding `parts`, in its own frame. */
const negate = (position: number[], parts: RbxInstance[], rotation = IDENTITY) =>
	inst("NegateOperation", {
		CFrame: at(position, rotation),
		size: ["Vector3", [1, 1, 1]],
		Color3uint8: ["Color3uint8", [255, 0, 255]],
		ChildData: ["String", model(...parts)],
	});
const cutOf = (size: number[], ...parts: RbxInstance[]) =>
	addUnions(sceneOf(square([0, 0, 0], size)), models("55", solidModel(...parts)));
/** Half a turn about X: a wedge's slope then faces up and forward. */
const HALF_X = [1, 0, 0, 0, -1, 0, 0, 0, -1];

describe("what a union takes away", () => {
	it("is a hole through a block, its walls facing into it", () => {
		const scene = cutOf(
			[4, 2, 4],
			block([0, 0, 0], [4, 2, 4]),
			negate([0, 0, 0], [block([0, 0, 0], [2, 4, 2])]),
		);
		// Top and bottom less the hole, four sides, and the hole's four walls.
		expect(surface(scene)).toEqual([
			expect.objectContaining({ area: 2 * 12 + 4 * 8 + 4 * 4, outward: true }),
		]);
		expect(volume(scene)).toBe(32 - 8);
		expect(scene.unionCuts).toEqual([]);
	});

	it("is a notch at a corner", () => {
		const scene = cutOf(
			[2, 2, 2],
			block([0, 0, 0], [2, 2, 2]),
			negate([1, 1, 1], [block([0, 0, 0], [2, 2, 2])]),
		);
		// Three faces of one taken from outside, three of the notch's in their place.
		expect(surface(scene)).toEqual([expect.objectContaining({ area: 24, outward: true })]);
		expect(volume(scene)).toBe(7);
	});

	it("is a bevel where a wedge takes an edge away", () => {
		const scene = cutOf(
			[2, 2, 2],
			block([0, 0, 0], [2, 2, 2]),
			negate(
				[0, 0.5, -0.5],
				[inst("WedgePart", { CFrame: at([0, 0, 0], HALF_X), size: ["Vector3", [2, 1, 1]] })],
			),
		);
		// A strip of two from the top and the front, a half from each side, and the slope.
		expect(surface(scene)).toEqual([
			expect.objectContaining({ area: round(24 - 2 - 2 - 1 + 2 * Math.SQRT2), outward: true }),
		]);
		expect(volume(scene)).toBe(7);
	});

	it("leaves nothing between faces where the cut is flush with them", () => {
		// Half the block taken, flush on five of its faces: a box of 1x2x2.
		const half = cutOf(
			[2, 2, 2],
			block([0, 0, 0], [2, 2, 2]),
			negate([0.5, 0, 0], [block([0, 0, 0], [1, 2, 2])]),
		);
		expect(surface(half)).toEqual([expect.objectContaining({ area: 16, outward: true })]);
		expect(volume(half)).toBe(4);
		// A pocket open at the top: its floor and walls, and the top around it.
		const pocket = cutOf(
			[4, 2, 4],
			block([0, 0, 0], [4, 2, 4]),
			negate([0, 0.5, 0], [block([0, 0, 0], [2, 1, 2])]),
		);
		expect(surface(pocket)).toEqual([
			expect.objectContaining({ area: 12 + 4 + 8 + 16 + 32, outward: true }),
		]);
		expect(volume(pocket)).toBe(28);
	});

	it("changes nothing where what it takes is outside it", () => {
		const scene = cutOf(
			[1, 1, 1],
			block([0, 0, 0], [1, 1, 1]),
			negate([5, 0, 0], [block([0, 0, 0], [1, 1, 1])]),
		);
		expect(rowsOf(scene).map((r) => [r.kind, r.p])).toEqual([["block", [0, 0, 0]]]);
		expect(scene.unionCuts).toEqual([]);
	});

	it("paints the cut in the colour the negated part has, where the union's parts keep their own", () => {
		const own = square([0, 0, 0], [4, 2, 4], [4, 2, 4], { UsePartColor: ["Bool", false] });
		const parts = solidModel(
			block([0, 0, 0], [4, 2, 4], [0, 0, 255]),
			negate([0, 0, 0], [block([0, 0, 0], [2, 4, 2], [0, 255, 0])]),
		);
		const scene = addUnions(sceneOf(own), models("55", parts));
		const areas = surface(scene).map((s) => s?.area);
		const painted = rowsOf(scene).map((r, i) => [r.kind, r.rgb, areas[i]]);
		// The block's outside in its own colour; the hole's walls in the negated part's.
		expect(painted).toEqual(
			expect.arrayContaining([
				["mesh", [0, 0, 255], 24 + 32],
				["mesh", [0, 255, 0], 16],
			]),
		);
		expect(painted).toHaveLength(2);
		expect(volume(scene)).toBe(24);
	});

	it("never draws what it takes away on its own, and says when it cannot cut", () => {
		const alone = cutOf([2, 2, 2], negate([0, 0, 0], [block([0, 0, 0], [2, 2, 2])]));
		expect(rowsOf(alone)).toEqual([]);
		const mesh = inst("MeshPart", {
			CFrame: at([0, 0, 0]),
			size: ["Vector3", [1, 1, 1]],
			MeshId: ["String", utf8.encode("rbxassetid://900")],
		});
		const scene = cutOf([2, 2, 2], block([0, 0, 0], [2, 2, 2]), negate([0, 0, 0], [mesh]));
		expect(rowsOf(scene).map((r) => r.kind)).toEqual(["block"]);
		expect(scene.unionCuts).toEqual([3]);
	});
});

describe("what a union takes away, round or nested", () => {
	it("takes away a union that has holes of its own, leaving what was in them", () => {
		// A tube taken from a block: the tube's core stays, a pillar in a moat.
		const tube = inst("UnionOperation", {
			CFrame: at([0, 0, 0]),
			size: ["Vector3", [2, 2, 2]],
			InitialSize: ["Vector3", [2, 2, 2]],
			ChildData: [
				"String",
				model(block([0, 0, 0], [2, 2, 2]), negate([0, 0, 0], [block([0, 0, 0], [1, 4, 1])])),
			],
		});
		const taken = inst("NegateOperation", {
			CFrame: at([0, 0, 0]),
			size: ["Vector3", [2, 2, 2]],
			ChildData: ["String", model(tube)],
		});
		const scene = cutOf([4, 2, 4], block([0, 0, 0], [4, 2, 4]), taken);
		// Top and bottom less the moat, four sides, the moat's walls and the pillar's.
		expect(surface(scene)).toEqual([
			expect.objectContaining({ area: 2 * 13 + 32 + 16 + 8, outward: true }),
		]);
		expect(volume(scene)).toBe(32 - 6);
	});

	it("cuts a union inside it in that union's frame, and adds back a NegateOperation of NegateOperations", () => {
		const notched = inst("UnionOperation", {
			CFrame: at([5, 0, 0]),
			size: ["Vector3", [2, 2, 2]],
			InitialSize: ["Vector3", [2, 2, 2]],
			ChildData: [
				"String",
				model(block([0, 0, 0], [2, 2, 2]), negate([1, 1, 1], [block([0, 0, 0], [2, 2, 2])])),
			],
		});
		expect(volume(cutOf([2, 2, 2], notched))).toBe(7);
		const twice = inst("NegateOperation", {
			CFrame: at([0.5, 0, 0]),
			size: ["Vector3", [1, 1, 1]],
			ChildData: ["String", model(negate([0, 0, 0], [block([0, 0, 0], [1, 1, 1])]))],
		});
		const scene = cutOf([2, 1, 1], block([-0.5, 0, 0], [1, 1, 1]), twice);
		expect(surface(scene)).toEqual([{ area: 10, triangles: 20, outward: true }]);
	});

	it("is a round hole where a cylinder is taken, its walls smooth", () => {
		const post = inst(
			"Part",
			{ CFrame: at([0, 0, 0]), size: ["Vector3", [2, 2, 2]], shape: ["Enum", 1] },
			[inst("CylinderMesh", {})],
		);
		const scene = cutOf([4, 1, 4], block([0, 0, 0], [4, 1, 4]), negate([0, 0, 0], [post]));
		// The polygon the renderers draw: 32 sides round a circle of one.
		const disc = 16 * Math.sin(Math.PI / 16);
		const rim = 64 * Math.sin(Math.PI / 32);
		expect(surface(scene)).toEqual([
			expect.objectContaining({ area: round(2 * (16 - disc) + 16 + rim), outward: true }),
		]);
		expect(volume(scene)).toBe(round(16 - disc));
		// The wall's normals lean round the hole, not one a face.
		const made = scene.meshes?.[0].made;
		const normals = new Set<string>();
		for (let v = 0; made && v < made.vertices.length / 6; v++) {
			const [x, , z, nx, ny, nz] = made.vertices.slice(v * 6, v * 6 + 6);
			if (Math.abs(ny) < 1e-6 && Math.hypot(x, z) < 0.3) normals.add([nx, nz].map(round).join());
		}
		expect(normals.size).toBe(32);
	});

	it("is a hollow where a ball is taken from inside it", () => {
		const ball = inst("Part", {
			CFrame: at([0, 0, 0]),
			size: ["Vector3", [1, 1, 1]],
			shape: ["Enum", 0],
		});
		const scene = cutOf([2, 2, 2], block([0, 0, 0], [2, 2, 2]), negate([0, 0, 0], [ball]));
		const [shape] = surface(scene);
		// The polygon is a little inside the ball it stands for.
		expect(shape?.outward).toBe(true);
		expect(shape?.area).toBeGreaterThan(24 + 0.9 * Math.PI);
		expect(shape?.area).toBeLessThan(24 + Math.PI);
		expect(volume(scene)).toBeGreaterThan(8 - Math.PI / 6);
		expect(volume(scene)).toBeLessThan(8 - 0.9 * (Math.PI / 6));
	});
});
