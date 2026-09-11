/**
 * The Wires and pins page's pictures, and the rule about naming other engines.
 *
 * The scenes are there to show colour, so the thing to check is that the ones
 * meant to be solid are solid and the ones meant to fade do. The naming rule is
 * checked over every page's words, because a sentence comparing Roswaal to
 * another engine is easy to write in passing and hard to spot in review.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { allPages, blockText, buildSite } from "../src/core/docs/site.js";
import { GUIDE_SCENES } from "../src/core/docs/examples.js";
import { graphSvg } from "../src/core/docs/preview.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { wirePath } from "../src/app/geometry.js";
import { NODE } from "../src/app/layers.js";

const registry = createRegistry();
const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));
const options = { geometry: NODE, nodeColor, pinColor, wirePath };
const gradients = (svg: string) => (svg.match(/<linearGradient /g) ?? []).length;

describe("wire pictures", () => {
	it("draws a wire between two pins of one type in that type's colour alone", () => {
		expect(gradients(graphSvg(GUIDE_SCENES.wireColours(), registry, options))).toBe(0);
	});

	it("fades a wire that changes type on the way", () => {
		const svg = graphSvg(GUIDE_SCENES.wireFades(), registry, options);
		expect(gradients(svg)).toBe(2);
		expect(svg).toContain(`stop-color="${pinColor("number", "data")}"`);
		expect(svg).toContain(`stop-color="${pinColor("string", "data")}"`);
	});

	it("never fades an execution wire", () => {
		expect(gradients(graphSvg(GUIDE_SCENES.wireExecution(), registry, options))).toBe(0);
	});

	it("gives two graphs on one page different gradient ids", () => {
		const ids = (svg: string) => [...svg.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
		const fades = ids(graphSvg(GUIDE_SCENES.wireFades(), registry, options));
		const knots = ids(graphSvg(GUIDE_SCENES.wireKnots(), registry, options));
		for (const id of fades) expect(knots).not.toContain(id);
	});

	it("shows its pictures on the Wires and pins page", () => {
		const page = allPages(site).find((p) => p.slug === "wires-and-pins")!;
		expect(page.blocks.filter((b) => b.t === "graph").length).toBeGreaterThanOrEqual(4);
	});
});

describe("naming other engines", () => {
	/**
	 * Coming from Blueprints exists to name Epic's product, and Attributions
	 * carries the non-affiliation statement. Everywhere else, a page names that
	 * one only by its title.
	 */
	const ALLOWED = new Set(["coming-from-blueprints", "attributions"]);

	it("keeps Unreal and Blueprint to the pages that are about them", () => {
		for (const page of allPages(site)) {
			if (ALLOWED.has(page.slug)) continue;
			const words = [page.title, page.summary, ...page.blocks.map(blockText)]
				.join(" ")
				.replaceAll("Coming from Blueprints", "")
				.replaceAll("coming-from-blueprints", "");
			expect(words, page.slug).not.toMatch(/unreal|blueprint|epic games/i);
		}
	});
});
