import { describe, expect, it } from "vitest";
import { EFFECT_COST } from "../src/extensions/placeViewer/app/viewport/effects.js";
import {
	FEATURE_BIT,
	featureBits,
	upToStep,
} from "../src/extensions/placeViewer/app/viewport/renderFeatures.js";
import {
	DENSITY_GLSL,
	effectShare,
	effectsShown,
	OVERDRAW_GLSL,
	OVERDRAW_WGSL,
	VIEWS_GLSL,
	VIEWS_WGSL,
} from "../src/extensions/placeViewer/app/viewport/renderViews.js";
import {
	COST_FULL,
	DEFAULT_RENDER,
	DENSITY_FULL,
	DENSITY_LEAST,
	densityShare,
	heatRamp,
	heatStyled,
	OVERDRAW_FULL,
	overdrawShare,
	RENDER_MODE_CODE,
	RENDER_MODES,
	type RenderMode,
	renderDebug,
	renderLegend,
	SKY_NEAR,
	SUN_CASCADES,
	SUN_MAP_TINTS,
	sharesComposite,
	sharesView,
	triangleDensity,
} from "../src/extensions/placeViewer/app/viewport/view.js";

const settings = (mode: RenderMode) => ({ ...DEFAULT_RENDER, mode });

describe("the Rendering panel's views", () => {
	it("list Overdraw, Triangle density and Shadow maps, each with a code of its own", () => {
		const labels = Object.fromEntries(RENDER_MODES);
		expect(labels.overdraw).toBe("Overdraw");
		expect(labels.density).toBe("Triangle density");
		expect(labels.sunMaps).toBe("Shadow maps");
		const codes = RENDER_MODES.map(([mode]) => RENDER_MODE_CODE[mode]);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it("reach the shaders as the heatmaps' path or the picture's, the switches' bits in y and the view in w", () => {
		const all = featureBits(DEFAULT_RENDER.features);
		expect(renderDebug(settings("lit"))).toEqual([0, all, 1, 0]);
		expect(renderDebug(settings("lights"))).toEqual([RENDER_MODE_CODE.lights, all, 1, 0]);
		expect(renderDebug(settings("overdraw"))).toEqual([RENDER_MODE_CODE.cost, all, 1, 1]);
		expect(renderDebug(settings("density"))).toEqual([RENDER_MODE_CODE.cost, all, 1, 2]);
		expect(renderDebug(settings("sunMaps"))).toEqual([RENDER_MODE_CODE.lit, all, 1, 3]);
		const plain = { ...DEFAULT_RENDER, heat: "cells" as const, features: upToStep(0) };
		expect(renderDebug({ ...plain, mode: "cost" })).toEqual([
			RENDER_MODE_CODE.cost,
			FEATURE_BIT.unlit | FEATURE_BIT.leak,
			0,
			0,
		]);
	});

	it("draw shares for the composite in the heatmaps, overdraw and density, each coloured its own way", () => {
		expect(RENDER_MODES.filter(([mode]) => sharesView(mode)).map(([mode]) => mode)).toEqual([
			"cost",
			"lights",
			"overdraw",
			"density",
		]);
		expect(RENDER_MODES.map(([mode]) => sharesComposite(mode))).toEqual([0, 0, 1, 2, 3, 4, 0]);
	});

	it("offer the Heat style for the two heatmaps only", () => {
		expect(RENDER_MODES.filter(([mode]) => heatStyled(mode)).map(([mode]) => mode)).toEqual([
			"cost",
			"lights",
		]);
	});

	it("leave beams and particles out of the lighting heatmap, the wireframe and triangle density", () => {
		const shown = RENDER_MODES.filter(([mode]) => effectsShown(mode)).map(([mode]) => mode);
		expect(shown).not.toContain("lights");
		expect(shown).not.toContain("wireframe");
		expect(shown).not.toContain("density");
		expect(shown).toContain("overdraw");
		expect(shown).toContain("sunMaps");
	});

	it("count a beam's or particle's pixel as one surface in overdraw, as its work in the render heatmap", () => {
		expect(effectShare("overdraw")).toBe(1 / OVERDRAW_FULL);
		expect(effectShare("cost")).toBe(EFFECT_COST / COST_FULL);
	});
});

describe("overdraw's scale", () => {
	it("lies 1, 2, 4, 8, 16 and 32 surfaces evenly along the ramp, 32 and more white", () => {
		expect([1, 2, 4, 8, 16, 32, 100].map(overdrawShare)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1, 1]);
		expect(overdrawShare(0)).toBe(0);
	});

	it("keeps a count to a whole step of the frame's 8 bits up to its full", () => {
		// The composite reads n = stored / 255 * OVERDRAW_FULL: one layer stays near one.
		const step = Math.round(255 / OVERDRAW_FULL);
		for (let n = 1; n < OVERDRAW_FULL; n++) {
			expect(Math.abs((n * step * OVERDRAW_FULL) / 255 - n)).toBeLessThan(0.5);
		}
	});
});

describe("triangle density", () => {
	it("is triangles a square stud of the box's surface, a one-stud cube's six at the least", () => {
		expect(triangleDensity(12, [1, 1, 1])).toBe(2);
		expect(triangleDensity(12, [4, 1, 2])).toBeCloseTo(12 / 28);
		// A small Part counts as a one-stud cube, so its twelve triangles stay cheap.
		expect(triangleDensity(12, [0.2, 0.2, 0.2])).toBe(2);
		expect(triangleDensity(6000, [2, 1, 1])).toBe(6000 / 10);
	});

	it("lies a quarter, 1, 4, 16 and 64 evenly along the ramp, a drawn part never black", () => {
		expect([1, 4, 16, 64, 1000].map(densityShare)).toEqual([0.25, 0.5, 0.75, 1, 1]);
		expect(densityShare(0.25)).toBe(DENSITY_LEAST);
		expect(densityShare(0)).toBe(DENSITY_LEAST);
		expect(densityShare(DENSITY_FULL)).toBe(1);
	});
});

describe("the views' legends", () => {
	it("follow the heatmaps' ramp, dark green to white", () => {
		expect(heatRamp(0)).toEqual([0.03, 0.22, 0.06]);
		expect(heatRamp(1)).toEqual([1, 1, 1]);
		expect(heatRamp(0.55).map((v) => +v.toFixed(3))).toEqual([0.95, 0.85, 0.12]);
		expect(heatRamp(-1)).toEqual(heatRamp(0));
	});

	it("tick overdraw's counts and density's triangles where the ramp puts them", () => {
		const overdraw = renderLegend("overdraw");
		const density = renderLegend("density");
		expect(overdraw?.kind === "bar" && overdraw.ticks).toEqual(["1", "2", "4", "8", "16", "32+"]);
		expect(density?.kind === "bar" && density.ticks).toEqual(["¼", "1", "4", "16", "64+"]);
		expect(overdraw?.kind === "bar" && overdraw.stops).toMatch(
			/^rgb\(8 56 15\) 0%.*rgb\(255 255 255\) 100%$/,
		);
	});

	it("name each of the sun's maps with its distances, then none and the near maps' edge", () => {
		const legend = renderLegend("sunMaps");
		if (legend?.kind !== "key") throw new Error("a key");
		expect(legend.items.map((item) => item.label)).toEqual([
			"Cascade 1: 0 to 64 studs",
			"Cascade 2: 64 to 256 studs",
			"Cascade 3: 256 to 1,024 studs",
			"Whole place: past 1,024 studs",
			"None: no sun shadow",
			`Near sky maps' edge: ${SKY_NEAR} studs out`,
		]);
		expect(SUN_MAP_TINTS.length).toBe(SUN_CASCADES.length + 2);
		expect(legend.items[0].colour).toBe("rgb(242 77 64)");
	});

	it("are their own only after the two heatmaps", () => {
		for (const mode of ["lit", "wireframe", "cost", "lights"] as const) {
			expect(renderLegend(mode)).toBeNull();
		}
	});
});

describe("the views' shader text", () => {
	const all = [OVERDRAW_WGSL, VIEWS_WGSL, OVERDRAW_GLSL, VIEWS_GLSL, DENSITY_GLSL].join("\n");

	it("writes every constant as a float", () => {
		expect(all).not.toMatch(/\$\{/);
		expect(VIEWS_WGSL).toContain(`vec4f(${1 / OVERDRAW_FULL}, 0.0, 0.0, 0.0)`);
		expect(OVERDRAW_WGSL).toContain("log2(n) / 5.0");
		expect(VIEWS_WGSL).toContain("array<vec3f, 5>(vec3f(0.95, 0.3, 0.25),");
	});

	it("names no local after a reserved word", () => {
		expect(all).not.toMatch(
			/\b(let|var|float|vec3|vec4|int)\s+(ref|self|type|meta|linear|smooth|sample|out|in|half|filter|input|output)\b/,
		);
	});
});
