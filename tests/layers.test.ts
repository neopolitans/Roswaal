/**
 * The canvas stacking order, and the one entry that is not what it looks like.
 *
 * `LAYER` reads like a single stack from the background up to the menus, and
 * for most of its entries it is. But everything from `comment` downwards is
 * drawn inside `.world`, which is transformed and therefore a stacking context
 * of its own — so those numbers order the graph's parts *against each other*
 * and say nothing at all about the grid.
 *
 * What a node is painted over is decided by where `.world` sits, and `.world`
 * had no entry here. It was `z-index: auto`, which paints below every
 * positioned sibling carrying a number, and both the grid and the watermark
 * carry one. So the grid was drawn over every node on the canvas, in both the
 * graph editor and Node Design's logic canvas — at 5% to 14% alpha, which is
 * faint enough to have read as texture since the first version.
 *
 * Node previews were never affected, which is why it survived so long: the
 * documentation draws its grid as the container's own background and the node
 * editor's stage positions its world, so in both of those the graph is above
 * the grid by construction.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LAYER } from "../src/app/layers.js";

const canvas = readFileSync(new URL("../src/app/Canvas.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8");

describe("the canvas stacking order", () => {
	it("draws the graph above the canvas furniture", () => {
		expect(LAYER.world).toBeGreaterThan(LAYER.grid);
		expect(LAYER.world).toBeGreaterThan(LAYER.watermark);
	});

	it("leaves the furniture above the flat background", () => {
		expect(LAYER.grid).toBeGreaterThan(LAYER.background);
		expect(LAYER.watermark).toBeGreaterThan(LAYER.grid);
	});

	it("keeps the cover and the menus above the graph", () => {
		expect(LAYER.lock).toBeGreaterThan(LAYER.world);
		expect(LAYER.menu).toBeGreaterThan(LAYER.lock);
	});

	it("gives every layer a number of its own", () => {
		const values = Object.values(LAYER);
		expect(new Set(values).size).toBe(values.length);
	});

	/**
	 * The regression itself. `.world` carries no `z-index` in the stylesheet —
	 * every positioned element on the canvas takes one inline from `LAYER` —
	 * so the guard has to be that the style object still sets it.
	 */
	it("gives the transformed world an explicit layer", () => {
		const at = canvas.indexOf("const worldStyle");
		expect(at).toBeGreaterThan(-1);
		const style = canvas.slice(at, canvas.indexOf("};", at));
		expect(style).toMatch(/transform:/);
		expect(style).toMatch(/zIndex:\s*LAYER\.world/);
	});

	/**
	 * A positioned sibling with no layer is the shape of the bug, so the
	 * stylesheet is not allowed to grow one quietly. Every `.canvas …` rule
	 * that positions something must be a class this file knows the layer of.
	 */
	it("knows the layer of every positioned element on the canvas", () => {
		const bare = css.replace(/\/\*[\s\S]*?\*\//g, " ");
		/** Class in the stylesheet -> the `LAYER` entry it is given in Canvas. */
		const KNOWN: Record<string, keyof typeof LAYER> = {
			grid: "grid",
			world: "world",
			watermark: "watermark",
			wires: "wire",
			marquee: "marquee",
		};

		const positioned: string[] = [];
		for (const m of bare.matchAll(/(\.canvas[^{}]*?)\{([^{}]*)\}/g)) {
			if (!/position:\s*absolute/.test(m[2])) continue;
			const classes = [...m[1].matchAll(/\.([a-zA-Z0-9-]+)/g)].map((c) => c[1]);
			const own = classes[classes.length - 1];
			// `.canvas-lock` is the compile cover, which is a sibling of the
			// canvas rather than something drawn inside it.
			if (own === "canvas" || own === "canvas-lock") continue;
			positioned.push(own);
		}

		expect(positioned.length).toBeGreaterThan(3);
		for (const cls of positioned) {
			expect([cls, cls in KNOWN]).toEqual([cls, true]);
			expect([cls, canvas.includes(`LAYER.${KNOWN[cls]}`)]).toEqual([cls, true]);
		}
	});
});
