/**
 * The place viewer's corner readout while its renderer starts: the renderer,
 * and how much of its shaders has compiled.
 */

import { describe, expect, it } from "vitest";
import { startingText } from "../src/extensions/placeViewer/app/viewport/readout.js";

describe("startingText", () => {
	it("names the renderer and the share of its shaders compiled", () => {
		expect(startingText("WebGPU", 0.7)).toBe("Starting (WebGPU – Shaders 70%)");
		expect(startingText("WebGL2", 0)).toBe("Starting (WebGL2 – Shaders 0%)");
		expect(startingText("WebGL2", 1)).toBe("Starting (WebGL2 – Shaders 100%)");
	});

	it("reads 100% only once every shader has compiled", () => {
		expect(startingText("WebGPU", 20 / 21)).toBe("Starting (WebGPU – Shaders 95%)");
		expect(startingText("WebGPU", 0.999)).toBe("Starting (WebGPU – Shaders 99%)");
		expect(startingText("WebGPU", 0.29)).toBe("Starting (WebGPU – Shaders 29%)");
	});

	it("keeps the share between 0% and 100%", () => {
		expect(startingText("WebGPU", -0.5)).toBe("Starting (WebGPU – Shaders 0%)");
		expect(startingText("WebGPU", 3)).toBe("Starting (WebGPU – Shaders 100%)");
	});

	it("leaves the shaders out before they have begun", () => {
		expect(startingText("WebGPU", null)).toBe("Starting (WebGPU)");
		expect(startingText(null, null)).toBe("Starting (…)");
	});
});
