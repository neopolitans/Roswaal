/**
 * Unions in the viewport's scene, drawn as the parts they were made from:
 * ChildData's parts placed by the union's CFrame and how far it has been
 * stretched since it was made, painted as the union says, its subtractions
 * left out and counted.
 */

import { describe, expect, it } from "vitest";

import { assetIdOf } from "../src/core/rbx/browse.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { materialIndex } from "../src/core/rbx/materials.js";
import {
	buildPlaceScene,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
} from "../src/core/rbx/scene.js";
import { writeBinaryPlace } from "../src/core/rbx/serialize.js";
import {
	addUnions,
	childDataOf,
	nestedUnionAssets,
	unionOutline,
	unionsWaiting,
	withUnions,
} from "../src/core/rbx/unions.js";

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

/** The parts of the union below: a red block to one side, a wedge, and a cut. */
const childParts = () => [
	inst("Part", {
		CFrame: at([1, 0, 0]),
		size: ["Vector3", [2, 1, 1]],
		Color3uint8: ["Color3uint8", [10, 20, 30]],
		shape: ["Enum", 1],
	}),
	inst("WedgePart", { CFrame: at([-1, 0, 0]), size: ["Vector3", [2, 1, 1]] }),
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
		expect(wedge.p).toEqual([10, 0, 2]);
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
			[10, 0, 2],
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
