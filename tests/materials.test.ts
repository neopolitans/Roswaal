/**
 * The viewport's material table: a row for every Enum.Material, each with a
 * pattern the shaders draw, read by them as two vec4s a row.
 */

import { describe, expect, it } from "vitest";

import {
	MATERIAL_PATTERN,
	MATERIALS,
	materialBlock,
	materialIndex,
} from "../src/core/rbx/materials.js";
import { ENGINE } from "../src/core/robloxEngine.js";

describe("The material table", () => {
	it("has a row for every Enum.Material, by its value", () => {
		const items = ENGINE.enums.Material.items;
		expect(items.length).toBeGreaterThan(40);
		for (const item of items)
			expect(MATERIALS[materialIndex(item.value)].name, item.name).toBe(item.name);
	});

	it("gives the shaders each row's pattern", () => {
		const block = materialBlock();
		const patternOf = (name: string) => block[MATERIALS.findIndex((m) => m.name === name) * 8 + 6];
		expect(patternOf("Brick")).toBe(MATERIAL_PATTERN.brick);
		expect(patternOf("CrackedLava")).toBe(MATERIAL_PATTERN.lava);
		expect(patternOf("SmoothPlastic")).toBe(MATERIAL_PATTERN.none);
	});
});
