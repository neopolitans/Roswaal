/**
 * The Docs preferences: a reading font, and how large pictures are drawn.
 *
 * Both are stored in the browser and read back by every window, so the thing to
 * guard is a stored value this build cannot use — a hand-edited or older blob —
 * coming back as something sensible rather than as a broken page.
 */

import { describe, expect, it } from "vitest";

import { DEFAULTS, DOCS_FONTS, PREVIEW_SCALE, previewScaleOf, readPreferences } from "../src/app/preferences.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { previewOf, previewSvg } from "../src/core/docs/preview.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { NODE } from "../src/app/layers.js";

const size = (svg: string) => {
	const match = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
	return { w: Number(match[1]), h: Number(match[2]) };
};

describe("preview size", () => {
	it("keeps a stored size inside 50% to 300%", () => {
		expect(previewScaleOf(0.1)).toBe(PREVIEW_SCALE.min);
		expect(previewScaleOf(12)).toBe(PREVIEW_SCALE.max);
	});

	it("snaps to the slider's steps", () => {
		expect(previewScaleOf(1.13)).toBe(1.25);
		expect(previewScaleOf(2)).toBe(2);
	});

	it("reads anything that is not a number as 100%", () => {
		expect(previewScaleOf("big")).toBe(1);
		expect(previewScaleOf(Number.NaN)).toBe(1);
		expect(previewScaleOf(undefined)).toBe(1);
	});

	it("draws a node picture at that size, from the same drawing", () => {
		const def = createRegistry().get("math.add")!;
		const options = { geometry: NODE, nodeColor, pinColor };
		const plain = previewSvg(previewOf(def), options);
		const doubled = previewSvg(previewOf(def), { ...options, scale: 2 });
		expect(size(doubled).w).toBeCloseTo(size(plain).w * 2, 1);
		expect(size(doubled).h).toBeCloseTo(size(plain).h * 2, 1);
		// Only the outer size changes; the viewBox is the canvas's own numbers.
		const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1];
		expect(viewBox(doubled)).toBe(viewBox(plain));
	});
});

describe("docs font", () => {
	it("defaults to the system face", () => {
		expect(DEFAULTS.docsFont).toBe("system");
		expect(DOCS_FONTS[0].font).toBe("system");
	});

	it("comes back as the defaults where there is no storage to read", () => {
		// Vitest runs without `localStorage`, which is the private-window case.
		const prefs = readPreferences();
		expect(prefs.docsFont).toBe("system");
		expect(prefs.docsPreviewScale).toBe(1);
	});
});
