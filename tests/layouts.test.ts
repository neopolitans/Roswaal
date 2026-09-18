/**
 * The Interface, and the window diagrams it is drawn from.
 *
 * A diagram is a spec of boxes on grid lines, so the things that can go wrong
 * are the ones a spec cannot see: a glyph the icon set does not have, a box
 * placed past the edge of its grid, two regions with one name that the linking
 * script would light together, and a region drawn in the picture that the
 * legend never explains.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { buildSite, findPage, type Block } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import { LAYOUTS, layoutConstant, layoutHtml, listedRegions } from "../src/core/docs/layouts.js";
import * as layouts from "../src/core/docs/layouts.js";
import { controlKey } from "../src/core/docs/toolbars.js";
import { ICONS, VIEW_BOX } from "../src/app/icons.js";
import { logoMarkup } from "../src/app/logo.js";

const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
const page = findPage(site, "the-interface")!;
const art = { viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), version: "test" };

/** Tracks in a `grid-template-*` value: one per top-level entry. */
function trackCount(template: string): number {
	let depth = 0;
	let count = 0;
	let inTrack = false;
	for (const ch of template) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (ch === " " && depth === 0) {
			inTrack = false;
			continue;
		}
		if (!inTrack) {
			count++;
			inTrack = true;
		}
	}
	return count;
}

function layoutsIn(blocks: Block[]): string[] {
	return blocks.flatMap((b) =>
		b.t === "layout" ? [b.layout.id]
		: b.t === "tabs" ? b.tabs.flatMap((tab) => layoutsIn(tab.blocks))
		: [],
	);
}

describe("the window diagrams", () => {
	it("draw only glyphs the icon set has", () => {
		for (const layout of LAYOUTS) {
			for (const region of layout.regions) {
				const mixed = (region.endItems ?? []).flatMap((item) => ("icon" in item ? [item.icon] : []));
				for (const icon of [...(region.icons ?? []), ...(region.iconsEnd ?? []), ...mixed]) {
					expect(ICONS, `${layout.id}: ${icon}`).toHaveProperty(icon);
				}
			}
		}
	});

	it("give every listed region a line, and no two one name", () => {
		for (const layout of LAYOUTS) {
			const names = listedRegions(layout).map((r) => r.name);
			expect(new Set(names.map(controlKey)).size, layout.id).toBe(names.length);
			for (const region of listedRegions(layout)) {
				expect(region.what, `${layout.id}: ${region.name}`).toBeTruthy();
			}
		}
	});

	it("place every region inside its grid", () => {
		for (const layout of LAYOUTS) {
			const rows = trackCount(layout.rows);
			const columns = trackCount(layout.columns);
			for (const region of layout.regions) {
				const [r1, r2, c1, c2] = region.at;
				const where = `${layout.id}: ${region.name ?? region.kind}`;
				expect(r1, where).toBeGreaterThanOrEqual(1);
				expect(r2, where).toBeLessThanOrEqual(rows + 1);
				expect(r2, where).toBeGreaterThan(r1);
				expect(c1, where).toBeGreaterThanOrEqual(1);
				expect(c2, where).toBeLessThanOrEqual(columns + 1);
				expect(c2, where).toBeGreaterThan(c1);
			}
		}
	});

	/** *Suggest an edit* writes a diagram as its constant; the name has to exist. */
	it("derive each spec's exported name from its id", () => {
		for (const layout of LAYOUTS) {
			expect((layouts as Record<string, unknown>)[layoutConstant(layout)], layout.id).toBe(layout);
		}
	});

	it("number the picture and the legend alike, and tie each box to its row", () => {
		const html = layoutHtml(LAYOUTS[0], art);
		listedRegions(LAYOUTS[0]).forEach((region, i) => {
			expect(html).toContain(`data-control="${controlKey(region.name)}"`);
			expect(html).toContain(`<span class="docs-layout-num">${i + 1}</span>`);
		});
	});
});

describe("The Interface", () => {
	it("comes before Controls, under Getting started", () => {
		const section = site.sections.find((s) => s.pages.some((p) => p.slug === "the-interface"))!;
		expect(section.title).toBe("Getting started");
		const order = section.pages.map((p) => p.slug);
		expect(order.indexOf("the-interface")).toBe(order.indexOf("controls") - 1);
	});

	/** The editor and Node Design, each on a computer and on a touch screen. */
	it("draws both windows, both ways", () => {
		expect(layoutsIn(page.blocks)).toEqual(LAYOUTS.map((l) => l.id));
	});

	it("puts every region's name and line in the page, so it reads with no picture", () => {
		const html = renderPage(site, page, { version: "test" });
		expect(html).not.toContain("docs-layout-frame");
		for (const layout of LAYOUTS) {
			for (const region of listedRegions(layout)) {
				expect(html, `${layout.id}: ${region.name}`).toContain(region.name);
			}
		}
	});
});
