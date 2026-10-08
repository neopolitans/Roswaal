/**
 * Settings, since 0.156.0: its pages listed under where they are kept, and a
 * search across all of them.
 */

import { describe, expect, it } from "vitest";

import { matches, settingsPages } from "../src/app/SettingsPanel.jsx";

const titles = (pages: { title: string }[]) => pages.map((page) => page.title);

describe("the pages Settings offers", () => {
	it("in the editor, every page, the project's first", () => {
		expect(titles(settingsPages("editor", true))).toEqual([
			"Compiling",
			"Node packs",
			"Canvas",
			"Nodes",
			"Workspace",
			"Themes",
			"Docs",
			"Licences",
		]);
	});

	it("leaves the project's pages out where there is no project", () => {
		expect(titles(settingsPages("editor", false))).not.toContain("Compiling");
		expect(titles(settingsPages("designer", true))).toEqual([
			"Canvas",
			"Nodes",
			"Workspace",
			"Themes",
			"Docs",
			"Licences",
		]);
	});

	/** The rest belongs to the editor, and the docs' sheet says so. */
	it("in the docs, only what changes how they read", () => {
		expect(titles(settingsPages("docs", true))).toEqual(["Themes", "Docs", "Licences"]);
	});
});

describe("searching settings", () => {
	it("finds every word typed, anywhere in a setting's name or help, ignoring case", () => {
		expect(matches("grid", "Grid contrast", "How strongly the grid draws.")).toBe(true);
		expect(matches("GRID strong", "Grid contrast", "Light, and Strong when asked.")).toBe(true);
		expect(matches("grid wires", "Grid contrast", "How strongly the grid draws.")).toBe(false);
	});
});
