/**
 * The Rendering panel's switches: the steps a frame is built in, the bits the
 * shaders read, the lighting a view is given, and the presets.
 */

import { describe, expect, it } from "vitest";
import {
	changedFrom,
	DEBUG_PRESETS,
	FEATURE_BIT,
	FEATURE_GROUPS,
	FEATURES,
	featureBits,
	featureOn,
	litFor,
	PERFORMANCE_PRESETS,
	passesOf,
	RENDER_PRESETS,
	RENDER_STEPS,
	STUDIO_FEATURES,
	stepOf,
	upToStep,
} from "../src/app/viewport/renderFeatures.js";
import type { LightingParams } from "../src/core/rbx/lighting.js";

const lighting = {
	sun: [0, 1, 0],
	sunColour: [3, 3, 3],
	sunDisc: 0.999,
	ambient: [0.4, 0.5, 0.6],
	indoor: [0.1, 0.1, 0.1],
	sunShadows: true,
	shadowSoftness: 0.2,
	skyFill: 1,
	zenith: [0, 0, 1],
	horizon: [0.5, 0.5, 1],
	ground: [0.2, 0.2, 0.2],
	exposure: 1,
	hazeDensity: 0.3,
	hazeColour: [0.7, 0.8, 0.9],
	fog: { start: 0, end: 1000, colour: [0.5, 0.5, 0.5], on: true },
	glare: 0,
	sunImage: { asset: "1", size: 21 },
	skyboxSun: false,
	post: {
		bloom: { intensity: 1, size: 24, threshold: 2 },
		colour: { brightness: 0, contrast: 0, saturation: 0, tint: [1, 1, 1] },
		blur: 4,
		notDrawn: [],
	},
	notes: [],
} as LightingParams;

describe("the Rendering panel's switches", () => {
	it("are all on as Studio draws the place, each in one group, every step with its own", () => {
		expect(FEATURES.every((i) => STUDIO_FEATURES[i.key])).toBe(true);
		expect(new Set(FEATURES.map((i) => i.key)).size).toBe(FEATURES.length);
		for (let s = 1; s <= RENDER_STEPS.length; s++)
			expect(FEATURES.some((i) => i.step === s)).toBe(true);
		expect(FEATURE_GROUPS.flatMap((g) => g.features)).toEqual(FEATURES);
	});

	it("walk the ten steps: each turns on its own switches and every earlier step's", () => {
		expect(stepOf(STUDIO_FEATURES)).toEqual({ step: 10, exact: true });
		for (let n = 0; n <= RENDER_STEPS.length; n++)
			expect(stepOf(upToStep(n))).toEqual({ step: n, exact: true });
		// Beams on at step 3: step 3, and more.
		expect(stepOf({ ...upToStep(3), beams: true })).toEqual({ step: 3, exact: false });
		// One of step 2's off: back to step 1, and more on beyond it.
		expect(stepOf({ ...STUDIO_FEATURES, highlights: false })).toEqual({ step: 1, exact: false });
	});

	it("take a switch under another off with it", () => {
		const f = { ...STUDIO_FEATURES, sunShadows: false };
		expect(f.farShadows).toBe(true);
		expect(featureOn(f, "farShadows")).toBe(false);
		expect(featureBits(f) & FEATURE_BIT.farShadows).toBe(0);
		expect(featureOn({ ...STUDIO_FEATURES, sky: false }, "skyImages")).toBe(false);
	});

	it("reach the shaders as bits, and draw unlit only when no light is on", () => {
		const all = featureBits(STUDIO_FEATURES);
		expect(all & FEATURE_BIT.unlit).toBe(0);
		expect(all & FEATURE_BIT.pointLights).toBe(FEATURE_BIT.pointLights);
		expect(all).toBeLessThan(2 ** 24);
		expect(featureBits(upToStep(1)) & FEATURE_BIT.unlit).toBe(FEATURE_BIT.unlit);
		// The lights alone still light the place.
		const lightsOnly = { ...upToStep(1), pointLights: true };
		expect(featureBits(lightsOnly) & FEATURE_BIT.unlit).toBe(0);
	});

	it("take what is off out of the lighting the view is given, and leave the rest", () => {
		expect(litFor(lighting, STUDIO_FEATURES)).toEqual(lighting);
		const dark = litFor(lighting, upToStep(1));
		expect(dark.sunColour).toEqual([0, 0, 0]);
		expect(dark.ambient).toEqual([0, 0, 0]);
		expect(dark.indoor).toEqual([0, 0, 0]);
		expect(dark.sunShadows).toBe(false);
		expect(dark.hazeDensity).toBe(0);
		expect(dark.fog.on).toBe(false);
		expect(dark.post.bloom).toBeUndefined();
		expect(dark.post.colour).toBeUndefined();
		expect(dark.post.blur).toBeUndefined();
		expect(dark.sun).toEqual(lighting.sun);
		// The Sky's sun goes with its switch, not with the step's.
		expect(litFor(lighting, { ...STUDIO_FEATURES, sunImage: false }).sunImage).toBeUndefined();
		expect(litFor(lighting, { ...STUDIO_FEATURES, softEdges: false }).shadowSoftness).toBe(0);
		expect(lighting.sunColour).toEqual([3, 3, 3]);
	});

	it("draw a pass while any switch that needs it is on", () => {
		expect(passesOf(STUDIO_FEATURES)).toEqual({
			glow: true,
			post: true,
			sky: true,
			skyImages: true,
			images: true,
			seeThrough: true,
			beams: true,
			particles: true,
			thinParts: true,
		});
		expect(passesOf({ ...STUDIO_FEATURES, neonGlow: false }).glow).toBe(true);
		expect(passesOf({ ...STUDIO_FEATURES, neonGlow: false, lavaGlow: false }).glow).toBe(false);
		expect(passesOf({ ...STUDIO_FEATURES, skyShadows: false }).thinParts).toBe(false);
	});

	it("come in presets: performance ones that only take away, debugging ones each with a purpose", () => {
		expect(PERFORMANCE_PRESETS[0].features).toEqual(STUDIO_FEATURES);
		for (const p of PERFORMANCE_PRESETS)
			expect(changedFrom(p.features).every((k) => !p.features[k])).toBe(true);
		// Each performance preset takes away at least what the one before it did.
		for (let i = 1; i < PERFORMANCE_PRESETS.length; i++) {
			const before = changedFrom(PERFORMANCE_PRESETS[i - 1].features);
			const now = changedFrom(PERFORMANCE_PRESETS[i].features);
			expect(before.every((k) => now.includes(k))).toBe(true);
		}
		for (const p of DEBUG_PRESETS)
			expect(changedFrom(p.features).length > 0 || !!p.look).toBe(true);
		expect(new Set(RENDER_PRESETS.map((p) => p.id)).size).toBe(RENDER_PRESETS.length);
	});
});
