/**
 * Header colours that are a rule rather than a category, and the colour a
 * name gets that no table has.
 */

import { describe, expect, it } from "vitest";

import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { categoryLabel } from "../src/core/categories.js";
import { previewOf, previewSvg } from "../src/core/docs/preview.js";
import { keywordNodes } from "../src/core/keywords.js";
import { createRegistry, parseNodePack } from "../src/core/nodes/index.js";
import { nilableProperty } from "../src/core/robloxNilable.js";
import { propertiesOf } from "../src/core/robloxProperties.js";
import { methodsOfService } from "../src/core/serviceCalls.js";

const registry = createRegistry();
const colourOf = (id: string) => nodeColor(registry.get(id)!);

describe("header colours", () => {
	it("draws Declare Function the colour Function is drawn", () => {
		expect(colourOf("function.declareHere")).toBe(colourOf("function.entry"));
	});

	it("draws a preview of it the same, from the fields a preview carries", () => {
		const def = registry.get("function.declareHere")!;
		expect(nodeColor({ id: def.id, category: def.category, role: def.role })).toBe(
			colourOf("function.entry"),
		);
	});

	it("leaves the rest of Flow its own colour", () => {
		expect(colourOf("flow.branch")).not.toBe(colourOf("function.entry"));
	});
});

/**
 * A pack names its categories and pin types, and a graph its pins' types. A
 * name every object has -- `constructor`, `toString`, `__proto__` -- is looked
 * up like any other, and gets the colour an unknown name gets.
 */
describe("names every object has", () => {
	const NAMES = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];

	it.each(NAMES)("%s as a category or a subcategory is the colour of Custom", (name) => {
		const custom = nodeColor({ category: "Custom" });
		expect(nodeColor({ category: name })).toBe(custom);
		expect(nodeColor({ category: "Custom", subcategory: name })).toBe(custom);
	});

	it.each(NAMES)("%s as a pin type is the colour of any", (name) => {
		expect(pinColor(name, "data")).toBe(pinColor("any", "data"));
		expect(pinColor(`${name}?`, "data")).toBe(pinColor("any", "data"));
	});

	it.each(NAMES)("%s in a pack node is drawn, not thrown", (name) => {
		const pack = parseNodePack(
			{
				nodes: [
					{
						id: "x.a",
						title: "A",
						category: name,
						subcategory: name,
						inputs: [{ id: "v", kind: "data", type: name }],
						outputs: [{ id: "r", kind: "data", type: name }],
						compilesTo: { kind: "statement", template: "print($in.v)" },
					},
				],
			},
			"x.nodedef.json",
		);
		const svg = previewSvg(previewOf(pack.defs[0]), { geometry: NODE, nodeColor, pinColor });
		expect(svg).toContain(nodeColor({ category: "Custom" }));
	});
});

describe("names every object has, in the other tables looked up by name", () => {
	it.each(["constructor", "toString", "__proto__"])("%s finds nothing", (name) => {
		expect(categoryLabel(name)).toBe(name);
		expect(keywordNodes(name)).toEqual([]);
		expect(propertiesOf(name)).toEqual([]);
		expect(methodsOfService(name)).toEqual([]);
		expect(nilableProperty(name, "Parent")).toBe(false);
	});
});
