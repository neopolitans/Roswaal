/**
 * The line under a node's header runs its full width, under the category tab
 * too. The tab is drawn over the header, so a line drawn before it stopped at
 * the tab's edge -- on the canvas and in the docs' pictures alike.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { previewOf, previewSvg } from "../src/core/docs/preview.js";
import { createRegistry } from "../src/core/nodes/index.js";

describe("a node's header rule", () => {
	it("is drawn after the tab in the docs' pictures, across the whole node", () => {
		const def = createRegistry().get("flow.sequence")!;
		const svg = previewSvg(previewOf(def), { geometry: NODE, nodeColor, pinColor });
		const tab = svg.search(new RegExp(`<path d="[^"]*H${NODE.tab}V`));
		const rule = svg.search(/<rect x="0" y="[\d.]+" width="[\d.]+" height="1"/);
		expect(tab).toBeGreaterThan(-1);
		expect(rule).toBeGreaterThan(tab);
	});

	it("is laid over the header on the canvas, not drawn as a shadow the tab covers", () => {
		const css = readFileSync("src/app/theme.css", "utf8");
		const head = css.slice(
			css.indexOf(".node .head {"),
			css.indexOf("}", css.indexOf(".node .head {")),
		);
		expect(head).not.toMatch(/box-shadow/);
		expect(css).toMatch(/\.node \.head::after \{[^}]*position: absolute;[^}]*bottom: 0;/);
	});
});
