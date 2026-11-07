/**
 * The viewport's material table: a row for every Enum.Material, each with a
 * pattern the shaders draw, some with a texture once it has loaded, read by
 * the shaders as three vec4s a row.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	MATERIAL_PATTERN,
	MATERIAL_ROW,
	MATERIAL_TEXTURES,
	MATERIALS,
	materialBlock,
	materialIndex,
} from "../src/core/rbx/materials.js";
import { ENGINE } from "../src/core/robloxEngine.js";

const rowOf = (name: string) => MATERIALS.findIndex((m) => m.name === name) * MATERIAL_ROW;

describe("The material table", () => {
	it("has a row for every Enum.Material, by its value", () => {
		const items = ENGINE.enums.Material.items;
		expect(items.length).toBeGreaterThan(40);
		for (const item of items)
			expect(MATERIALS[materialIndex(item.value)].name, item.name).toBe(item.name);
	});

	it("gives the shaders each row's pattern", () => {
		const block = materialBlock();
		expect(block[rowOf("Brick") + 6]).toBe(MATERIAL_PATTERN.brick);
		expect(block[rowOf("CrackedLava") + 6]).toBe(MATERIAL_PATTERN.lava);
		expect(block[rowOf("SmoothPlastic") + 6]).toBe(MATERIAL_PATTERN.none);
	});

	it("names only materials it has, each textured once", () => {
		const names = MATERIAL_TEXTURES.map((t) => t.material);
		expect(new Set(names).size).toBe(names.length);
		for (const name of names) expect(rowOf(name), name).toBeGreaterThanOrEqual(0);
	});

	it("draws a texture only once its layer has loaded, and its pattern until then", () => {
		const brick = MATERIAL_TEXTURES.findIndex((t) => t.material === "Brick");
		expect(materialBlock()[rowOf("Brick") + 7]).toBe(0);
		const loaded = materialBlock(new Set([brick]));
		expect(loaded[rowOf("Brick") + 7]).toBe(brick + 1);
		expect(loaded[rowOf("Brick") + 8]).toBe(MATERIAL_TEXTURES[brick].studs);
		// A material with no texture is never given one.
		expect(loaded[rowOf("SmoothPlastic") + 7]).toBe(0);
	});

	it("lights only CrackedLava's texture from within", () => {
		const block = materialBlock();
		const glowing = MATERIALS.filter((_, i) => block[i * MATERIAL_ROW + 10] === 1).map(
			(m) => m.name,
		);
		expect(glowing).toEqual(["CrackedLava"]);
	});

	it("has a map in the viewport's textures for every textured material", () => {
		const dir = path.join(__dirname, "../src/app/viewport/textures");
		const files = new Set(fs.readdirSync(dir));
		for (const t of MATERIAL_TEXTURES) {
			const file = t.glows ? `${t.material}.png` : `${t.material}.jpg`;
			expect(files.has(file), file).toBe(true);
		}
		const source = fs.readFileSync(path.join(__dirname, "../src/app/viewport/textures.ts"), "utf8");
		for (const t of MATERIAL_TEXTURES)
			expect(source, t.material).toContain(`./textures/${t.material}.`);
	});
});
