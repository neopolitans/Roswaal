/**
 * Decals and Textures in the viewport's scene: each a quad a hair off its
 * part's face, with where on the image each corner is.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { outlinePlace } from "../src/core/rbx/browse.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { readRbx } from "../src/core/rbx/index.js";
import { buildPlaceScene } from "../src/core/rbx/scene.js";

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
const bytes = (s: string) => new TextEncoder().encode(s);

/** A 4 × 2 × 6 block at the origin, square to the world, holding `kids`. */
function block(...kids: RbxInstance[]) {
	return inst(
		"Part",
		{
			CFrame: ["CFrame", { position: [0, 0, 0], rotation: IDENTITY }],
			size: ["Vector3", [4, 2, 6]],
		},
		kids,
	);
}

function imagesOf(part: RbxInstance) {
	const workspace = inst("Workspace", {}, [part]);
	return buildPlaceScene(workspace, () => 7).images ?? [];
}

const round = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);

describe("a Decal", () => {
	it("covers its face, a hair off it, the right way up to someone facing it", () => {
		const [front] = imagesOf(
			block(inst("Decal", { Texture: ["String", bytes("rbxassetid://123")], Face: ["Enum", 5] })),
		);
		expect(front.asset).toBe("123");
		expect(front.part).toBe(7);
		expect(round(front.normal)).toEqual([0, 0, -1]);
		// Front is -Z; facing it, right is -X and up is +Y.
		expect(round(front.corners)).toEqual([2, 1, -3.02, -2, 1, -3.02, -2, -1, -3.02, 2, -1, -3.02]);
		expect(front.uv).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
	});

	it("reads the old asset link, its colour and how see-through it is", () => {
		const [image] = imagesOf(
			block(
				inst("Decal", {
					Texture: ["String", bytes("http://www.roblox.com/asset/?id=456")],
					Face: ["Enum", 1],
					Color3: ["Color3", [1, 0.5, 0]],
					Transparency: ["Float32", 0.25],
				}),
			),
		);
		expect(image.asset).toBe("456");
		expect(round(image.normal)).toEqual([0, 1, 0]);
		expect(image.tint).toEqual([1, 0.5, 0]);
		expect(image.alpha).toBe(0.75);
	});

	it("is left out with no image, an image of Studio's own, or nothing to see", () => {
		expect(imagesOf(block(inst("Decal", { Texture: ["String", bytes("")] })))).toEqual([]);
		expect(
			imagesOf(block(inst("Decal", { Texture: ["String", bytes("rbxasset://textures/x.png")] }))),
		).toEqual([]);
		expect(
			imagesOf(
				block(
					inst("Decal", {
						Texture: ["String", bytes("rbxassetid://9")],
						Transparency: ["Float32", 1],
					}),
				),
			),
		).toEqual([]);
	});
});

describe("a Texture", () => {
	it("tiles by StudsPerTile from its offset", () => {
		const [image] = imagesOf(
			block(
				inst("Texture", {
					Texture: ["String", bytes("rbxassetid://5")],
					Face: ["Enum", 2],
					StudsPerTileU: ["Float32", 2],
					StudsPerTileV: ["Float32", 0.5],
					OffsetStudsU: ["Float32", 1],
					OffsetStudsV: ["Float32", 0],
				}),
			),
		);
		// Back is +Z: 4 studs across and 2 high. (0 + 1) / 2 to (4 + 1) / 2 across; 0 to 2 / 0.5 down.
		expect(image.uv).toEqual([0.5, 0, 2.5, 0, 2.5, 4, 0.5, 4]);
	});
});

describe("M103", () => {
	it("finds the track's Texture", () => {
		const file = path.join(import.meta.dirname, "..", "examples", "m103", "place.rbxl");
		const doc = readRbx(new Uint8Array(readFileSync(file)));
		const { order } = outlinePlace(doc);
		const index = new Map(order.map((one, i) => [one, i]));
		const workspace = doc.roots.find((r) => r.className === "Workspace");
		const images = buildPlaceScene(workspace, (one) => index.get(one)).images ?? [];
		expect(images.length).toBeGreaterThan(0);
		for (const image of images) expect(image.asset).toMatch(/^\d+$/);
	});
});

describe("the images' triangles", () => {
	it("are six vertices a quad in the scene's order, each position, normal, uv and tint", async () => {
		const { imageQuads, IMAGE_VERTEX } = await import("../src/app/viewport/view.js");
		const quad = (asset: string, z: number, layer?: "solid" | "seeThrough" | "glow") => ({
			asset,
			part: 1,
			corners: [0, 1, z, 1, 1, z, 1, 0, z, 0, 0, z],
			uv: [0, 0, 1, 0, 1, 1, 0, 1],
			normal: [0, 0, 1],
			tint: [1, 0.5, 0.25],
			alpha: 0.5,
			layer,
		});
		const { vertices, quads } = imageQuads([quad("a", 1), quad("b", 2, "glow"), quad("a", 3)]);
		expect(quads.map((q) => [q.asset, q.layer, q.centre])).toEqual([
			["a", "solid", [0.5, 0.5, 1]],
			["b", "glow", [0.5, 0.5, 2]],
			["a", "solid", [0.5, 0.5, 3]],
		]);
		expect(vertices.length).toBe(18 * IMAGE_VERTEX);
		// The first vertex: top left, its normal, uv 0,0, and the tint with alpha.
		expect([...vertices.slice(0, IMAGE_VERTEX)]).toEqual([
			0, 1, 1, 0, 0, 1, 0, 0, 1, 0.5, 0.25, 0.5,
		]);
	});

	it("are drawn farthest first within their layer, only once their image is here", async () => {
		const { imageOrder } = await import("../src/app/viewport/view.js");
		const at = (asset: string, z: number, layer: "solid" | "seeThrough" | "glow" = "solid") => ({
			asset,
			layer,
			centre: [0, 0, z],
		});
		const quads = [at("a", 1), at("b", 5), at("a", 3), at("c", 9), at("a", 7, "glow")];
		expect(imageOrder(quads, "solid", [0, 0, 0], () => true)).toEqual([3, 1, 2, 0]);
		expect(imageOrder(quads, "solid", [0, 0, 0], (a) => a !== "c")).toEqual([1, 2, 0]);
		expect(imageOrder(quads, "glow", [0, 0, 0], () => true)).toEqual([4]);
	});
});

describe("each image's triangles", () => {
	it("turn anticlockwise seen from in front of the face, so they are not culled", async () => {
		const { imageQuads, IMAGE_VERTEX } = await import("../src/app/viewport/view.js");
		for (const face of [0, 1, 2, 3, 4, 5]) {
			const [image] = imagesOf(
				block(
					inst("Decal", { Texture: ["String", bytes("rbxassetid://1")], Face: ["Enum", face] }),
				),
			);
			const { vertices } = imageQuads([image]);
			for (const t of [0, 3]) {
				const p = [0, 1, 2].map((k) => [
					...vertices.slice((t + k) * IMAGE_VERTEX, (t + k) * IMAGE_VERTEX + 3),
				]);
				const a = p[1].map((v, i) => v - p[0][i]);
				const b = p[2].map((v, i) => v - p[0][i]);
				const cross = [
					a[1] * b[2] - a[2] * b[1],
					a[2] * b[0] - a[0] * b[2],
					a[0] * b[1] - a[1] * b[0],
				];
				const along = cross.reduce((sum, v, i) => sum + v * image.normal[i], 0);
				expect(along, `face ${face}, triangle ${t / 3}`).toBeGreaterThan(0);
			}
		}
	});
});

describe("a Decal asset", () => {
	it("is followed to the image its model names", async () => {
		const { decalImageOf } = await import("../src/app/viewport/images.js");
		const xml = new TextEncoder().encode(
			'<roblox><Item class="Decal"><Properties><Content name="Texture"><url>http://www.roblox.com/asset/?id=987654</url></Content></Properties></Item></roblox>',
		);
		expect(decalImageOf(xml)).toBe("987654");
		expect(decalImageOf(new TextEncoder().encode("…rbxassetid://42…"))).toBe("42");
		expect(decalImageOf(new TextEncoder().encode("no image here"))).toBeUndefined();
	});
});

describe("each face's image, as Studio draws it", () => {
	// Measured in Studio on 13 Nov 2026: a cube with a Decal on each face, seen
	// from known angles. Image up and image right, as world directions.
	const MEASURED: Record<number, { up: number[]; right: number[] }> = {
		5: { up: [0, 1, 0], right: [-1, 0, 0] }, // Front
		0: { up: [0, 1, 0], right: [0, 0, -1] }, // Right
		1: { up: [0, 0, 1], right: [-1, 0, 0] }, // Top
		4: { up: [0, 0, 1], right: [1, 0, 0] }, // Bottom
	};
	for (const [face, want] of Object.entries(MEASURED)) {
		it(`face ${face} is the way up and round Studio has it`, () => {
			const [image] = imagesOf(
				block(
					inst("Decal", {
						Texture: ["String", bytes("rbxassetid://1")],
						Face: ["Enum", Number(face)],
					}),
				),
			);
			const c = image.corners;
			const unit = (v: number[]) => {
				const l = Math.hypot(...v);
				return v.map((x) => Math.round((x / l) * 1000) / 1000 + 0);
			};
			// Top left minus bottom left is up; top right minus top left is right.
			expect(unit([0, 1, 2].map((k) => c[k] - c[9 + k]))).toEqual(want.up);
			expect(unit([0, 1, 2].map((k) => c[3 + k] - c[k]))).toEqual(want.right);
		});
	}
});
