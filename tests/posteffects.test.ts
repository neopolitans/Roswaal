/**
 * A place's post effects: read from Lighting and the Camera, added up when
 * there are several, and handed to the renderers as the numbers fitted to
 * Studio's captures.
 */

import { describe, expect, it } from "vitest";
import {
	BLOOM_DEFAULT,
	blurSigma,
	GLOW_GAIN,
	GLOW_SPREAD,
	glowShape,
	gradeBlock,
	postActive,
} from "../src/app/viewport/view.js";
import type { RbxInstance } from "../src/core/rbx/dom.js";
import { readPostEffects } from "../src/core/rbx/lighting.js";

function inst(
	className: string,
	props: Record<string, unknown> = {},
	children: RbxInstance[] = [],
) {
	return {
		className,
		name: className,
		children,
		props: new Map(Object.entries(props).map(([k, value]) => [k, { type: "x", value }])),
	} as unknown as RbxInstance;
}

describe("a place's post effects", () => {
	it("are read from Lighting and the Camera, those that are on", () => {
		const lighting = inst("Lighting", {}, [
			inst("ColorCorrectionEffect", { Brightness: 0.1, Contrast: 0.2, TintColor: [1, 0.5, 1] }),
			inst("BlurEffect", { Size: 8, Enabled: false }),
			inst("BloomEffect", { Intensity: 1, Size: 24, Threshold: 2 }),
			inst("Atmosphere", { Density: 0.3 }),
		]);
		const camera = inst("Camera", {}, [
			inst("ColorCorrectionEffect", { Brightness: 0.05, Saturation: -1, TintColor: [0.5, 1, 1] }),
			inst("BlurEffect", { Size: 12 }),
		]);
		const post = readPostEffects([lighting, camera]);
		expect(post.colour?.brightness).toBeCloseTo(0.15, 5);
		expect(post.colour?.contrast).toBeCloseTo(0.2, 5);
		expect(post.colour?.saturation).toBe(-1);
		expect(post.colour?.tint).toEqual([0.5, 0.5, 1]);
		expect(post.blur).toBe(12);
		expect(post.bloom).toEqual({ intensity: 1, size: 24, threshold: 2 });
		expect(post.notDrawn).toEqual([]);
	});

	it("are nothing for a place without any", () => {
		expect(readPostEffects([inst("Lighting"), undefined])).toEqual({ notDrawn: [] });
	});
});

describe("post effects as the renderers take them", () => {
	it("blur as wide as Studio's captures, growing faster than Size", () => {
		expect(blurSigma(8, 1049)).toBeCloseTo(2, 0);
		expect(blurSigma(24, 1049)).toBeCloseTo(9, 0);
		expect(blurSigma(24, 2098)).toBeCloseTo(2 * blurSigma(24, 1049), 5);
		expect(blurSigma(0, 1049)).toBe(0);
	});

	it("hand ColorCorrection over only while post effects are on", () => {
		const post = {
			colour: { brightness: 0.1, contrast: 0.5, saturation: -1, tint: [1, 0.5, 0.25] },
			notDrawn: [],
		};
		expect([...gradeBlock(post, true)]).toEqual([Math.fround(0.1), 0.5, -1, 1, 1, 0.5, 0.25, 0]);
		expect(gradeBlock(post, false)[3]).toBe(0);
		expect(postActive(post, true)).toBe(true);
		expect(postActive(post, false)).toBe(false);
		expect(postActive({ notDrawn: ["BloomEffect"] }, true)).toBe(false);
	});
});

describe("Bloom, which is Neon's glow", () => {
	const bloom = (threshold: number, intensity = 1, size = 24) => ({
		bloom: { intensity, size, threshold },
		notDrawn: [],
	});

	it("is the glow measured before it when a place has none on, or post effects are off", () => {
		const today = { spread: GLOW_SPREAD, gain: GLOW_GAIN, gate: [0.7, 0.3, 0.3, 0] };
		expect(glowShape(undefined, true)).toEqual(today);
		expect(glowShape(bloom(0.5), false)).toEqual(today);
		const same = glowShape({ bloom: BLOOM_DEFAULT, notDrawn: [] }, true);
		expect(same.spread).toBeCloseTo(GLOW_SPREAD, 9);
		expect(same.gain).toBeCloseTo(GLOW_GAIN, 9);
		expect(same.gate.map((v) => Math.round(v * 1e9) / 1e9)).toEqual(today.gate);
	});

	it("widens with Size as Studio's captures of 8, 24 and 56 do, not in step with it", () => {
		const w = (size: number) => glowShape(bloom(2, 1, size), true).spread / GLOW_SPREAD;
		expect(w(8)).toBeCloseTo(0.28, 5);
		expect(w(56)).toBeCloseTo(1.95, 5);
		expect(w(16)).toBeCloseTo(0.64, 5);
		expect(w(0)).toBe(0);
		const g = (size: number) => glowShape(bloom(2, 1, size), true).gain / GLOW_GAIN;
		expect(g(56)).toBeCloseTo(1.92, 5);
		expect(g(24)).toBe(1);
	});

	it("strengthens more slowly than Intensity, and is gone at 0", () => {
		const g = (intensity: number) => glowShape(bloom(2, intensity), true).gain / GLOW_GAIN;
		expect(g(2)).toBeCloseTo(2 ** 0.6, 5);
		expect(g(0)).toBe(0);
	});

	it("lets dimmer, more see-through Neon glow at a lower Threshold, and less above 2", () => {
		const at = (t: number) => glowShape(bloom(t), true);
		expect(at(1).gate[0]).toBeCloseTo(0.65, 5);
		expect(at(0.75).gate[0]).toBeCloseTo(0.6, 5);
		expect(at(0).gate[2]).toBeCloseTo(1.6, 5);
		expect(at(0).gain).toBeCloseTo(GLOW_GAIN * 1.5, 5);
		// Nothing glows at 10 in Studio: past the brightest Neon's light, about 5.6.
		expect(at(10).gate[0]).toBeGreaterThan(5.6);
	});
});
