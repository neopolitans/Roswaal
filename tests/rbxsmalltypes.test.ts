/**
 * The property types found by saving every creatable class from Studio:
 * a handle's Faces and Axes, a RayValue's Ray, a TerrainRegion's corners, a
 * union's mesh in its own XML element, and a UniqueId spelt one way whichever
 * format it was read from.
 */

import { describe, expect, it } from "vitest";

import type { Prop, RbxInstance } from "../src/core/rbx/dom.js";
import { readRbx } from "../src/core/rbx/index.js";
import { convertPlace, writeBinaryPlace, writeXmlPlace } from "../src/core/rbx/serialize.js";
import {
	legacyBinaryUniqueId,
	uniqueIdFromBinary,
	uniqueIdToBinary,
} from "../src/core/rbx/uniqueId.js";

const utf8 = new TextEncoder();

function instance(className: string, name: string, props: Record<string, Prop>): RbxInstance {
	return {
		className,
		name,
		parent: null,
		children: [],
		service: false,
		props: new Map([
			["Name", { type: "String", value: utf8.encode(name) }],
			...Object.entries(props),
		]),
	};
}

const doc = () => {
	const roots = [
		instance("Handles", "Handles", { Faces: { type: "Faces", value: 63 } }),
		instance("ArcHandles", "ArcHandles", { Axes: { type: "Axes", value: 5 } }),
		instance("RayValue", "Ray", { Value: { type: "Ray", value: [1, 2, 3, 0, -1, 0.5] } }),
		instance("TerrainRegion", "Region", {
			ExtentsMin: { type: "Vector3int16", value: [-32768, 0, 12] },
			ExtentsMax: { type: "Vector3int16", value: [32767, 4, -12] },
		}),
		instance("UnionOperation", "Union", {
			SolidMeshHolder: { type: "SharedString", value: utf8.encode("mesh") },
		}),
		instance("Script", "Main", { Source: { type: "String", value: utf8.encode("print(1)") } }),
	];
	return { format: "binary" as const, roots, instances: roots, undecoded: new Map() };
};

const prop = (bytes: Uint8Array, name: string, property: string) =>
	readRbx(bytes)
		.instances.find((i) => i.name === name)!
		.props.get(property)!;

describe.each(["binary", "xml"] as const)(
	"the types Studio's every-class place holds, in %s",
	(format) => {
		const bytes =
			format === "binary"
				? writeBinaryPlace(doc())
				: utf8.encode(writeXmlPlace({ ...doc(), format: "xml" }));

		it("reads back as written", () => {
			expect(prop(bytes, "Handles", "Faces")).toEqual({ type: "Faces", value: 63 });
			expect(prop(bytes, "ArcHandles", "Axes")).toEqual({ type: "Axes", value: 5 });
			expect(prop(bytes, "Ray", "Value")).toEqual({ type: "Ray", value: [1, 2, 3, 0, -1, 0.5] });
			expect(prop(bytes, "Region", "ExtentsMin").value).toEqual([-32768, 0, 12]);
			expect(prop(bytes, "Region", "ExtentsMax").value).toEqual([32767, 4, -12]);
			expect(prop(bytes, "Union", "SolidMeshHolder").value).toEqual(utf8.encode("mesh"));
			expect(readRbx(bytes).undecoded.size).toBe(0);
		});

		it("survives the other format", () => {
			const other = convertPlace(bytes, format === "binary" ? "rbxlx" : "rbxl");
			expect(other.leftOut).toEqual([]);
			expect(prop(other.bytes, "Ray", "Value").value).toEqual([1, 2, 3, 0, -1, 0.5]);
			expect(prop(other.bytes, "Region", "ExtentsMin").value).toEqual([-32768, 0, 12]);
		});
	},
);

describe("XML written as Studio writes it", () => {
	const xml = writeXmlPlace({ ...doc(), format: "xml" });

	it("keeps a union's mesh in a NetAssetRef, and a script's Source in a ProtectedString", () => {
		expect(xml).toMatch(/<NetAssetRef name="SolidMeshHolder">/);
		expect(xml).toMatch(
			/<ProtectedString name="Source"><!\[CDATA\[print\(1\)\]\]><\/ProtectedString>/,
		);
	});
});

describe("a UniqueId", () => {
	// The same instance's id from Studio's .rbxlx and from its .rbxl.
	const xml = "7c7ffdc289097ae30ae84b8700000917";
	const binary = "000009170ae84b87f8fffb851212f5c6";
	const bytes = Uint8Array.from(binary.match(/../g)!.map((h) => parseInt(h, 16)));

	it("is spelt as Studio's XML spells it, from the binary's bytes", () => {
		expect(uniqueIdFromBinary(bytes)).toBe(xml);
		expect(uniqueIdToBinary(xml)).toEqual(bytes);
	});

	it("keeps a random part with its top bit set", () => {
		const id = "f000000000000001deadbeef00000002";
		expect(uniqueIdFromBinary(uniqueIdToBinary(id))).toBe(id);
	});

	it("can still be matched as Roswaal spelt it for a binary place before", () => {
		expect(legacyBinaryUniqueId(xml)).toBe(binary);
	});
});
