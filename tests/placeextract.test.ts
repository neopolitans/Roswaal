/**
 * Copying an instance out of a place as a model file, for Syncs from's
 * DataModel tab: one root, everything inside it, and no parent above it.
 */

import { describe, expect, it } from "vitest";

import { readBinary } from "../src/core/rbx/binary.js";
import { blankPlace } from "../src/core/rbx/blankPlace.js";
import { writeBinaryPlace } from "../src/core/rbx/serialize.js";

describe("an instance copied out as a model", () => {
	const place = blankPlace();
	const baseplate = place.instances.find((one) => one.name === "Baseplate");

	it("is a model with that instance as its one root, and what it holds", () => {
		if (!baseplate) throw new Error("the blank place has no Baseplate");
		const bytes = writeBinaryPlace({
			format: "binary",
			roots: [baseplate],
			instances: [],
			undecoded: new Map(),
		});
		const model = readBinary(bytes);
		expect(model.roots.map((one) => [one.className, one.name])).toEqual([["Part", "Baseplate"]]);
		expect(model.roots[0].parent).toBeNull();
		expect(model.roots[0].children.map((one) => one.className)).toEqual(["Texture"]);
		expect(model.instances).toHaveLength(2);
	});

	it("leaves the place as it was", () => {
		expect(baseplate?.parent?.name).toBe("Workspace");
		expect(place.roots.some((one) => one.name === "Workspace")).toBe(true);
	});
});
