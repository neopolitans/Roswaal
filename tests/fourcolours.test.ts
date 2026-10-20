/**
 * Four Colours: a scheme kept as a surprise, with a look of its own.
 *
 * What has to hold is that it stays hidden until found -- out of the docs, out
 * of the docs site's picker -- that what was found is remembered, and that the
 * two new fields a theme may carry are checked like every other.
 */

import { afterEach, describe, expect, it } from "vitest";

import { readPreferences } from "../src/app/preferences.js";
import { renderPage } from "../src/core/docs/html.js";
import { buildSite, findPage } from "../src/core/docs/site.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { LOOKS, type Theme, validateTheme } from "../src/core/theme.js";
import { BUILTIN_THEMES } from "../src/core/themeData.js";

const four = () => {
	const found = BUILTIN_THEMES.find((t) => t.name === "Four Colours");
	if (!found) throw new Error("Four Colours is not built in");
	return JSON.parse(JSON.stringify(found)) as Theme;
};

describe("the scheme", () => {
	it("is hidden, and turns on its look", () => {
		expect(four().hidden).toBe(true);
		expect(LOOKS).toContain(four().look);
		expect(validateTheme(four(), "four")).toEqual([]);
	});

	it("draws its nodes the canvas's blue, which the white edge makes visible", () => {
		const t = four();
		expect(t.colors.nodeBody).toBe(t.colors.canvas);
		// Without the edge, the rule that nodes must stand out still holds.
		t.colors.nodeBorder = t.colors.canvas;
		expect(validateTheme(t, "four").join(" ")).toMatch(/indistinguishable from canvas/);
	});

	it("refuses a look there is no stylesheet for, and a hidden that is not a yes or no", () => {
		const t = four() as unknown as Record<string, unknown>;
		t.look = "five-colours";
		t.hidden = "yes";
		const problems = validateTheme(t, "x").join(" | ");
		expect(problems).toMatch(/look "five-colours" is not one of/);
		expect(problems).toMatch(/hidden must be true or false/);
	});
});

describe("staying hidden", () => {
	it("is left out of the docs' list of schemes", () => {
		const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
		const html = renderPage(site, findPage(site, "settings")!, { version: "9.9.9" });
		expect(html).toContain("Aquatic");
		expect(html).not.toContain("Four Colours");
	});
});

describe("what was found", () => {
	const original = globalThis.localStorage;
	afterEach(() => {
		Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
	});
	const stored = (value: unknown) =>
		Object.defineProperty(globalThis, "localStorage", {
			value: {
				getItem: () => JSON.stringify(value),
				setItem: () => {},
				removeItem: () => {},
			},
			configurable: true,
		});

	it("is nothing until something is found", () => {
		expect(readPreferences().foundThemes).toEqual([]);
	});

	it("is remembered by name, and anything else stored there is dropped", () => {
		stored({ foundThemes: ["Four Colours", 3, null] });
		expect(readPreferences().foundThemes).toEqual(["Four Colours"]);
		stored({ foundThemes: "Four Colours" });
		expect(readPreferences().foundThemes).toEqual([]);
	});
});
