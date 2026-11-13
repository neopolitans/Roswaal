/**
 * A Sky's six images: read from the place by face, and looked up by
 * direction the way Studio lays them round the view.
 */

import { describe, expect, it } from "vitest";

import type { RbxInstance } from "../src/core/rbx/dom.js";
import { ownSun, SKY_FACES, skyboxOf } from "../src/core/rbx/lighting.js";

function sky(faces: Record<string, string>): RbxInstance {
	const props = new Map(
		Object.entries(faces).map(([face, value]) => [`Skybox${face}`, { type: "string", value }]),
	);
	return { className: "Sky", props, children: [] } as unknown as RbxInstance;
}

describe("a Sky's images", () => {
	it("are read by face, in either link form", () => {
		const links = Object.fromEntries(
			SKY_FACES.map((face, i) => [
				face,
				i % 2 ? `rbxassetid://${100 + i}` : `http://www.roblox.com/asset/?id=${100 + i}`,
			]),
		);
		expect(skyboxOf(sky(links))).toEqual({
			Bk: "100",
			Dn: "101",
			Ft: "102",
			Lf: "103",
			Rt: "104",
			Up: "105",
		});
	});

	it("are left to the made-up sky unless all six are named", () => {
		const five = Object.fromEntries(SKY_FACES.slice(1).map((face) => [face, "rbxassetid://1"]));
		expect(skyboxOf(sky(five))).toBeUndefined();
		expect(skyboxOf(sky({ ...five, Bk: "" }))).toBeUndefined();
		expect(skyboxOf(undefined)).toBeUndefined();
	});
});

describe("where a direction meets the Sky", () => {
	it("lays the faces round the view as Studio does", async () => {
		const { skyLookup } = await import("../src/app/viewport/view.js");
		const face = (d: number[]) => SKY_FACES[skyLookup(d).face];
		expect(
			[
				[1, 0, 0],
				[-1, 0, 0],
				[0, 0, 1],
				[0, 0, -1],
				[0, 1, 0],
				[0, -1, 0],
			].map(face),
		).toEqual(["Lf", "Rt", "Bk", "Ft", "Up", "Dn"]);
		// Each side upright: above the middle is the top of its image.
		expect(skyLookup([1, 0.5, 0]).v).toBeLessThan(0.5);
		expect(skyLookup([0, 0.5, -1]).v).toBeLessThan(0.5);
		// Looking along -Z, +X is to the right: the right of Ft.
		expect(skyLookup([0.5, 0, -1]).u).toBeGreaterThan(0.5);
		// Up, a quarter clockwise: towards +X is towards its top.
		expect(skyLookup([0.5, 1, 0])).toMatchObject({ face: 5, u: 0.5, v: 0.25 });
		// Dn, a quarter anticlockwise: towards +X is towards its bottom.
		expect(skyLookup([0.5, -1, 0])).toMatchObject({ face: 1, u: 0.5, v: 0.75 });
	});
});

describe("the sun over a Sky's images", () => {
	const with_ = (props: Record<string, unknown>) =>
		({
			className: "Sky",
			props: new Map(Object.entries(props).map(([k, value]) => [k, { type: "x", value }])),
			children: [],
		}) as unknown as RbxInstance;

	it("is drawn where the Sky shows Studio's own sun", () => {
		expect(ownSun(with_({}))).toBe(true);
		expect(ownSun(with_({ SunTextureId: "rbxasset://sky/sun.jpg" }))).toBe(true);
		expect(ownSun(undefined)).toBe(true);
	});

	it("is not drawn over a sun image of the place's own, nor with celestial bodies off", () => {
		expect(ownSun(with_({ SunTextureId: "http://www.roblox.com/asset/?id=4965878933" }))).toBe(
			false,
		);
		expect(ownSun(with_({ CelestialBodiesShown: false }))).toBe(false);
	});
});
