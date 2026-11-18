/**
 * The shaders' part of the Rendering panel's Overdraw, Triangle density and
 * Shadow maps views, for both renderers: see view.ts's renderDebug for how
 * the mode reaches them, and renderLegend for what their colours mean.
 */

import { EFFECT_COST } from "./effects.js";
import {
	COST_FULL,
	DENSITY_FULL,
	DENSITY_LEAST,
	DENSITY_LEAST_AREA,
	DENSITY_LOW,
	NEAR_EDGE_TINT,
	OVERDRAW_FULL,
	type RenderMode,
	SKY_VIEWS,
	SUN_MAP_MIX,
	SUN_MAP_TINTS,
} from "./view.js";

/**
 * Whether beams and particles are drawn in a mode: not in the lighting
 * heatmap, of light reaching surfaces, nor in the views of the parts alone.
 */
export function effectsShown(mode: RenderMode): boolean {
	return mode !== "wireframe" && mode !== "lights" && mode !== "density";
}

/** What a pixel of a beam or particle adds in a view of shares: one surface, or its estimated work. */
export function effectShare(mode: RenderMode): number {
	return mode === "overdraw" ? 1 / OVERDRAW_FULL : EFFECT_COST / COST_FULL;
}

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const wgslVec = (c: readonly number[]) => `vec3f(${c.map(f).join(", ")})`;
const glslVec = (c: readonly number[]) => `vec3(${c.map(f).join(", ")})`;

/** WebGpuView's composite: overdraw's and triangle density's colours, after its heatColour. */
export const OVERDRAW_WGSL = /* wgsl */ `
// Overdraw's colour for the share of OVERDRAW_FULL drawn over a pixel: black
// for none, then the heatmaps' ramp by the count's logarithm, as view.ts's
// overdrawShare, from one surface to OVERDRAW_FULL.
fn overdrawColour(h: f32) -> vec3f {
	let n = h * ${f(OVERDRAW_FULL)};
	if (n < 1.0) { return heatColour(0.0, false) * n; }
	return heatColour(log2(n) / ${f(Math.log2(OVERDRAW_FULL))}, false);
}
// Triangle density's colour: its share on the ramp, shaded by the green so
// the parts' shapes show; black where nothing is drawn.
fn densityColour(f: vec3f) -> vec3f {
	if (f.r < ${f(DENSITY_LEAST / 2)}) { return vec3f(0.0); }
	return heatColour(f.r, false) * f.g;
}
`;

/** WebGl2View's composite: as OVERDRAW_WGSL. */
export const OVERDRAW_GLSL = `
vec3 overdrawColour(float h) {
	float n = h * ${f(OVERDRAW_FULL)};
	if (n < 1.0) return heatColour(0.0, false) * n;
	return heatColour(log2(n) / ${f(Math.log2(OVERDRAW_FULL))}, false);
}
vec3 densityColour(vec3 f) {
	if (f.r < ${f(DENSITY_LEAST / 2)}) return vec3(0.0);
	return heatColour(f.r, false) * f.g;
}
`;

/** How a face turned to n is shaded in triangle density, as a handle is, from 0.6 to 1. */
const DENSITY_SHADE = "0.6 + 0.4 * max(dot(n, normalize(vec3(0.4, 1.0, 0.25))), 0.0)";

/**
 * WebGpuView's place shader, after its \`shade\`, \`sunSees\` and skyVisibility:
 * overdraw's count, triangle density's vertex and fragment, and the sun maps' tint.
 */
export const VIEWS_WGSL = /* wgsl */ `
// Overdraw: one share for each surface drawn, added to what is under it.
@fragment fn fsCount() -> @location(0) vec4f { return vec4f(${f(1 / OVERDRAW_FULL)}, 0.0, 0.0, 0.0); }
// Triangle density: the draw's triangles, in x; one slot a draw, see drawDensity.
@group(1) @binding(2) var<uniform> drawTris: vec4f;
// A part's triangles per square stud of its box's surface, as view.ts's
// triangleDensity and densityShare, as a share of white in the colour's red.
@vertex fn vsDensity(v: VIn) -> VOut {
	var o = shade(v);
	let s = vec3f(length(v.c0), length(v.c1), length(v.c2));
	let area = max(2.0 * (s.x * s.y + s.y * s.z + s.z * s.x), ${f(DENSITY_LEAST_AREA)});
	let t = log2(max(drawTris.x / area, 0.000001) / ${f(DENSITY_LOW)}) / ${f(Math.log2(DENSITY_FULL / DENSITY_LOW))};
	o.colour = vec3f(clamp(t, ${f(DENSITY_LEAST)}, 1.0), 0.0, 0.0);
	return o;
}
// Its share in red, and in green its shading, for the composite's densityColour.
@fragment fn fsDensity(i: VOut) -> @location(0) vec4f {
	let n = normalize(i.normal);
	return vec4f(i.colour.r, ${DENSITY_SHADE.replace("vec3(", "vec3f(")}, 0.0, 1.0);
}
// Which of the sun's maps shades p, as sunSees picks it: 0 to 2 a cascade,
// 3 the whole place's, 4 none (off every map, or no shadows).
fn sunMapAt(p: vec3f) -> i32 {
	if (skyU.info.w < 0.5 || cascU.texel.w > 1.5) { return 4; }
	if (cascU.texel.w > 0.5) {
		let d = length(p - u.camPos.xyz);
		if (d < cascU.far.x) { return 0; }
		if (d < cascU.far.y) { return 1; }
		if (d < cascU.far.z) { return 2; }
	}
	let c = skyU.views[${SKY_VIEWS}] * vec4f(p, 1.0);
	let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
	if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || c.z > 1.0) { return 4; }
	return 3;
}
// Where p is in the near sky maps' box, as skyVisibility measures it: 1 on its edge.
fn nearEdge(p: vec3f) -> f32 {
	let off = abs(p - skyU.nearAt.xyz);
	return max(off.x, max(off.y, off.z)) / max(skyU.nearAt.w, 0.001);
}
// The Shadow maps view: the picture c, in display colours, tinted by the map
// that shades p, and the near sky maps' box edge drawn where \`edge\` crosses 1,
// \`wide\` being how much it changes across a pixel.
fn sunMapTint(c: vec3f, p: vec3f, edge: f32, wide: f32) -> vec3f {
	var tints = array<vec3f, 5>(${SUN_MAP_TINTS.map(wgslVec).join(", ")});
	var tinted = mix(c, tints[sunMapAt(p)], ${f(SUN_MAP_MIX)});
	if (skyU.near.w > 0.5 && abs(edge - 1.0) < wide * 1.5) { tinted = ${wgslVec(NEAR_EDGE_TINT)}; }
	return tinted;
}
`;

/** WebGl2View's place shader (FS), after its SKY_VIS: as VIEWS_WGSL's sun maps' tint. */
export const VIEWS_GLSL = `
int sunMapAt(vec3 p) {
	if (skyInfo.w < 0.5 || cascTexel.w > 1.5) return 4;
	if (cascTexel.w > 0.5) {
		float d = length(p - L[6].xyz);
		if (d < cascFar.x) return 0;
		if (d < cascFar.y) return 1;
		if (d < cascFar.z) return 2;
	}
	vec4 c = skyViews[${SKY_VIEWS}] * vec4(p, 1.0);
	vec3 q = c.xyz * 0.5 + 0.5;
	if (any(lessThan(q.xy, vec2(0.0))) || any(greaterThan(q.xy, vec2(1.0))) || q.z > 1.0) return 4;
	return 3;
}
float nearEdge(vec3 p) {
	vec3 off = abs(p - skyNearAt.xyz);
	return max(off.x, max(off.y, off.z)) / max(skyNearAt.w, 0.001);
}
vec3 sunMapTint(vec3 c, vec3 p) {
	vec3 tints[5] = vec3[5](${SUN_MAP_TINTS.map(glslVec).join(", ")});
	vec3 tinted = mix(c, tints[sunMapAt(p)], ${f(SUN_MAP_MIX)});
	float edge = nearEdge(p);
	if (skyNear.w > 0.5 && abs(edge - 1.0) < fwidth(edge) * 1.5) tinted = ${glslVec(NEAR_EDGE_TINT)};
	return tinted;
}
`;

/** WebGl2View's VS: triangle density, into the colour's red, as VIEWS_WGSL's vsDensity. */
export const DENSITY_GLSL = `
float densityShare(float tris, vec3 s) {
	float area = max(2.0 * (s.x * s.y + s.y * s.z + s.z * s.x), ${f(DENSITY_LEAST_AREA)});
	return clamp(log2(max(tris / area, 0.000001) / ${f(DENSITY_LOW)}) / ${f(Math.log2(DENSITY_FULL / DENSITY_LOW))}, ${f(DENSITY_LEAST)}, 1.0);
}
`;

/** WebGl2View's FS: triangle density's share and shading, as VIEWS_WGSL's fsDensity. */
export const DENSITY_FS_GLSL = `
vec4 densityOut(vec3 n) { return vec4(vColour.r, ${DENSITY_SHADE}, 0.0, 1.0); }
`;
