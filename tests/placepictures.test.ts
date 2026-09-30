/**
 * The pictures on Places and Rojo projects and on Wally packages: the project
 * tree, the DataModel browser, the Properties panel and the dialogs, drawn in
 * the editor's own markup.
 *
 * What can go wrong is a picture that says something the editor does not: a
 * glyph it has no drawing for, a Properties heading in the wrong place, a node
 * map that would not write the project file it was read from.
 */

import { describe, expect, it } from "vitest";

import { EVEN_ODD, ICONS, STROKED, VIEW_BOX } from "../src/app/icons.js";
import { compileNodeMap } from "../src/core/nodemap.js";
import { renderPage } from "../src/core/docs/html.js";
import { buildSite, findPage, ROJO_SAMPLE, type Block } from "../src/core/docs/site.js";
import * as toolbars from "../src/core/docs/toolbars.js";
import {
	controlsOf, iconsOf, legendOf, PLACE_BARS, PROPERTIES_PANEL, toolbarConstant, toolbarHtml,
} from "../src/core/docs/toolbars.js";
import { projectToMap, sameProject } from "../src/core/rojoImport.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";

const art = { viewBox: VIEW_BOX, paths: ICONS, mark: "<svg></svg>", version: "test", strokes: STROKED, evenOdd: EVEN_ODD };
const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));

describe("the place and package pictures", () => {
	it("draw only glyphs the icon set has", () => {
		for (const bar of PLACE_BARS) {
			for (const name of iconsOf(bar)) expect(ICONS, `${bar.id} draws "${name}"`).toHaveProperty(name);
		}
	});

	it("say what every named part is, once", () => {
		for (const bar of PLACE_BARS) {
			const names = legendOf(bar).map((item) => item.name);
			expect(new Set(names).size, bar.id).toBe(names.length);
			for (const item of legendOf(bar)) expect(item.what, `${bar.id}: ${item.name}`).toBeTruthy();
		}
	});

	it("are exported under the name Suggest an edit writes", () => {
		for (const bar of PLACE_BARS) {
			expect((toolbars as Record<string, unknown>)[toolbarConstant(bar)], bar.id).toBe(bar);
		}
	});

	it("draw a stroked glyph as a line and a script's with its holes", () => {
		const tree = toolbarHtml(toolbars.PROJECT_TREE_WALLY, art);
		expect(tree).toContain('stroke-width="64"');
		const browser = toolbarHtml(toolbars.DATAMODEL_BROWSER, art);
		expect(browser).toContain('fill-rule="evenodd"');
		expect(browser).toContain('class="icon kind luau tree-script-module"');
	});

	it("fill Properties as the editor would, under Studio's headings in its order", () => {
		const headings = controlsOf(PROPERTIES_PANEL).flatMap((item) => (item.t === "propGroup" ? [item.text] : []));
		expect(headings).toEqual(["Data", "Appearance", "Part", "Transform", "Collision", "Tags", "Attributes"]);
		const values = Object.fromEntries(
			controlsOf(PROPERTIES_PANEL).flatMap((item) => (item.t === "prop" ? [[item.label, item.value]] : [])),
		);
		expect(values).toMatchObject({ Anchored: "true", Color: "105, 64, 40", Size: "4, 7, 1", IsOpen: "false" });
	});
});

describe("the Rojo sample", () => {
	it("writes back the project file it was read from", () => {
		let n = 0;
		const { map, problems } = projectToMap(ROJO_SAMPLE, { output: "default.project.json", fallbackName: "orchard", makeId: () => `x${n++}` });
		expect(problems).toEqual([]);
		expect(sameProject(JSON.parse(compileNodeMap(map).json), ROJO_SAMPLE)).toBe(true);
	});
});

describe("the two pages", () => {
	const kinds = (blocks: readonly Block[]): string[] =>
		blocks.flatMap((b) => (b.t === "tabs" ? b.tabs.flatMap((tab) => kinds(tab.blocks)) : [b.t]));

	it("draw the map, the browser, Properties, each drop and Export on Places and Rojo projects", () => {
		const page = findPage(site, "places-and-rojo")!;
		const found = kinds(page.blocks);
		expect(found.filter((k) => k === "nodemap")).toHaveLength(1);
		expect(found.filter((k) => k === "toolbar")).toHaveLength(3);
		expect(found.filter((k) => k === "graph")).toHaveLength(3);
	});

	it("walk through adding and removing on Wally packages", () => {
		const page = findPage(site, "wally-packages")!;
		expect(page.blocks.filter((b) => b.t === "walkthrough")).toHaveLength(2);
		const html = renderPage(site, page, { version: "test", toolbars: art });
		expect(html).toContain('data-point="add-from-wally"');
		expect(html).toContain('<div class="dialog docs-dialog-shot">');
	});
});
