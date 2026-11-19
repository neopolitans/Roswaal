/**
 * The Rendering panel's tools start off: the view as the place draws it,
 * nothing over it and its shadows redrawn as it moves.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RENDER } from "../src/extensions/placeEditor/app/viewport/view.js";

describe("the Rendering panel's tools", () => {
	it("start off", () => {
		expect(DEFAULT_RENDER.lightRanges).toBe(false);
		expect(DEFAULT_RENDER.freezeShadows).toBe(false);
	});
});
