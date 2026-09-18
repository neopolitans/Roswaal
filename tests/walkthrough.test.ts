/**
 * Walkthroughs: steps shown one at a time over a drawing of the screen.
 *
 * What can go wrong is a step that points at nothing -- a control renamed, or
 * the wrong bar drawn for the step -- which would leave a reader with a step
 * lit and no ring on the screen. So every step is held to its own drawing.
 */

import { describe, expect, it } from "vitest";

import { stepState } from "../src/app/docsWalk.js";
import { ICONS } from "../src/app/icons.js";
import { pageSource } from "../src/app/PageEditor.jsx";
import { renderPage } from "../src/core/docs/html.js";
import { buildSite, type Block, type WalkStep } from "../src/core/docs/site.js";
import * as toolbars from "../src/core/docs/toolbars.js";
import { iconsOf, legendOf, toolbarConstant, WALK_BARS } from "../src/core/docs/toolbars.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";

const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
const pages = site.sections.flatMap((section) => section.pages);

/** Every walkthrough in the documentation, with the page it is on. */
function walkthroughs(): { page: string; steps: WalkStep[] }[] {
	const found: { page: string; steps: WalkStep[] }[] = [];
	const walk = (page: string, blocks: Block[]) => {
		for (const block of blocks) {
			if (block.t === "walkthrough") found.push({ page, steps: block.steps });
			if (block.t === "tabs") for (const tab of block.tabs) walk(page, tab.blocks);
			if (block.t === "details") walk(page, block.blocks);
		}
	};
	for (const page of pages) walk(page.slug, page.blocks);
	return found;
}

describe("walkthroughs", () => {
	it("are on Getting started, one to each way in", () => {
		expect(walkthroughs().filter((w) => w.page === "getting-started")).toHaveLength(3);
	});

	it("point every step at a control its own drawing has", () => {
		for (const { page, steps } of walkthroughs()) {
			steps.forEach((step, i) => {
				expect(step.picture.length, `${page} step ${i + 1}`).toBeGreaterThan(0);
				if (!step.point) return;
				const named = step.picture.flatMap((bar) => legendOf(bar).map((item) => item.name));
				expect(named, `${page} step ${i + 1}`).toContain(step.point);
			});
		}
	});

	it("draw only bars that are exported under the name Suggest an edit writes", () => {
		for (const { steps } of walkthroughs()) {
			for (const bar of steps.flatMap((step) => step.picture)) {
				expect((toolbars as Record<string, unknown>)[toolbarConstant(bar)], bar.id).toBe(bar);
			}
		}
	});

	it("draw only glyphs the icon set has", () => {
		for (const bar of WALK_BARS) {
			for (const name of iconsOf(bar)) expect(ICONS, `${bar.id} draws "${name}"`).toHaveProperty(name);
		}
	});

	it("light the steps before, at and after the reader", () => {
		expect([0, 1, 2].map((i) => stepState(i, 1))).toEqual(["done", "current", "next"]);
	});
});

describe("a walkthrough on the page", () => {
	const page = pages.find((p) => p.slug === "getting-started")!;
	const html = renderPage(site, page, {
		version: "test",
		toolbars: { viewBox: "0 -960 960 960", paths: ICONS, mark: "<svg></svg>", version: "test" },
	});

	it("draws every step's screen, the first one showing", () => {
		const figure = html.slice(html.indexOf('<figure class="docs-walk">'));
		expect(figure).toMatch(/^<figure class="docs-walk"><div class="docs-walk-window"><div class="docs-walk-frame" data-point="[^"]+">/);
		expect(figure.slice(0, figure.indexOf("</figure>"))).toContain('class="docs-walk-frame" data-point="home" hidden');
	});

	it("carries on the numbering from a list above it", () => {
		expect(html).toContain('<ol class="docs-walk-steps" start="3">');
	});

	it("is written back as source by Suggest an edit, bars by name", () => {
		const source = pageSource(page, page.blocks.map((block) => ({ block })));
		expect(source).toContain('t: "walkthrough"');
		expect(source).toContain("picture: [PROJECT_MENU, PROJECTS_FOOT]");
		expect(source).toContain('point: "Open .zip…"');
	});
});
