/**
 * The viewport's renderer where WebGPU is: sized to its canvas, drawn only
 * when asked, with the selection outlined over everything.
 *
 * Nothing here is Roblox's. The shaders are written for Roswaal; where a
 * number makes a place look as it does in Studio, it was fitted to Studio's
 * screen captures of test parts, taken from the same camera as Roswaal's view
 * and compared pixel for pixel. Roblox's engine, shaders and files were never
 * read.
 */

import { type LightingParams, lightingBlock } from "../../core/rbx/lighting.js";
import { MATERIAL_TEXTURES, MATERIALS, materialBlock } from "../../core/rbx/materials.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { GpuEffects } from "./effectsGpu.js";
import { boxEdges, featureEdges, meshFor, sceneGlows } from "./geometry.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
import { lightGridFor } from "./prepare.js";
import { OVERDRAW_WGSL, VIEWS_WGSL } from "./renderViews.js";
import { TEXTURE_LEVELS, TEXTURE_SIZE } from "./textures.js";
import {
	BLOOM_STEEP,
	BLOOM_STRENGTH,
	backToFront,
	bloomStart,
	blurSigma,
	CASCADE_BLOCK,
	CASCADE_MAP,
	type Camera,
	COST_FULL,
	cascadeBlock,
	DEFAULT_RENDER,
	FOV,
	fingerprint,
	GLOW_NARROW,
	GLOW_WIDE,
	type GlowShape,
	glowShape,
	glowSpread,
	gradeBlock,
	HANDLE_ALPHA,
	IMAGE_VERTEX,
	type ImageLayer,
	type ImageQuad,
	imageOrder,
	imageQuads,
	LIGHTS_FULL,
	type MeshGeometry,
	nearSkyCentre,
	nearSkyInto,
	OVERDRAW_FULL,
	postActive,
	type RenderSettings,
	type RenderStats,
	renderDebug,
	SELECT,
	SELECT_WIDTH,
	SKY_BLOCK,
	SKY_GAIN,
	SKY_LAYERS,
	SKY_MAP,
	SKY_NEAR,
	SKY_NEAR_LAYER,
	SKY_OPEN,
	SKY_SEEN_LEAST,
	SKY_SOFT,
	SKY_VIEWS,
	SUN_CASCADES,
	SUN_GAIN,
	sceneBox,
	sceneFingerprint,
	seeThroughSets,
	sharesComposite,
	sharesView,
	skyBlock,
	splitByMesh,
	type ViewRenderer,
} from "./view.js";
import { FEATURE_BIT, passesOf } from "./renderFeatures.js";

// WebGPU's flags, as the spec numbers them: TypeScript's DOM types have the
// interfaces but not these namespaces.
const BUFFER = {
	MAP_READ: 0x1,
	COPY_SRC: 0x4,
	COPY_DST: 0x8,
	INDEX: 0x10,
	VERTEX: 0x20,
	UNIFORM: 0x40,
	STORAGE: 0x80,
	QUERY_RESOLVE: 0x200,
} as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;
const TEXTURE = {
	COPY_SRC: 0x1,
	COPY_DST: 0x2,
	TEXTURE_BINDING: 0x4,
	RENDER_ATTACHMENT: 0x10,
} as const;
const MAP_READ = 0x1;

/**
 * The glow round what gives light of its own: blurred one way and then the
 * other at half the view's size, then added over the finished frame.
 */
const POST = /* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
// One step along the blur, in the source's own units, and how strong the glow is.
@group(0) @binding(2) var<uniform> p: vec4f;
// The finished frame, for the glow to be added to.
@group(0) @binding(3) var frame: texture_2d<f32>;
// A ColorCorrectionEffect: brightness, contrast, saturation, on; then the tint.
@group(0) @binding(4) var<uniform> grade: array<vec4f, 2>;
// The glow's wide blur; tex holds its narrow one: see GLOW_NARROW and GLOW_WIDE.
@group(0) @binding(5) var wide: texture_2d<f32>;
struct Out { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> Out {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	var o: Out;
	o.clip = vec4f(xy, 0.0, 1.0);
	o.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
	return o;
}
// The glow's source, drawn at the view's size, averaged down to half: one
// sample between four texels weighs them evenly. Its alpha is how much of
// each pixel a Decal or Texture covers, carried along for the composite.
@fragment fn fsDown(i: Out) -> @location(0) vec4f {
	return textureSampleLevel(tex, samp, i.uv, 0.0);
}
// A BloomEffect's bloom of the whole picture: where the finished frame's
// brightest channel nears full, past p.x, and Neon is not glowing there
// already (its own glow, tex, is fitted on its own), added to the glow's
// source at half size. Fitted to Studio's screen captures: a Neon logo at
// Transparency 0.3 (its face 238 of 255) does not bloom; with an additive
// Beam behind it, so the face is full, it blooms as Neon does.
@fragment fn fsBright(i: Out) -> @location(0) vec4f {
	let f = textureSampleLevel(frame, samp, i.uv, 0.0).rgb;
	let src = textureSampleLevel(tex, samp, i.uv, 0.0).rgb;
	let t = pow(f, vec3f(2.2));
	let m = max(t.r, max(t.g, t.b));
	let over = max(m - p.x, 0.0) / max(1.0 - p.x, 1e-3);
	let lit = pow(over, p.z) * p.w * (1.0 - smoothstep(0.02, 0.1, max(src.r, max(src.g, src.b))));
	return vec4f(t / max(m, 1e-4) * lit, 0.0);
}
// A Gaussian \`p.w\` texels wide along \`p.xy\`, one texel, out to three times
// that, at every texel: a fetch between two texels weighs both, so each pair
// costs one. Taps further apart than a texel left ripples round a thin source.
@fragment fn fsBlur(i: Out) -> @location(0) vec4f {
	let s = max(p.w, 0.5);
	var c = textureSampleLevel(tex, samp, i.uv, 0.0).rgb;
	var total = 1.0;
	for (var k = 1.0; k <= 3.0 * s; k += 2.0) {
		let a = exp(-k * k / (2.0 * s * s));
		let b = exp(-(k + 1.0) * (k + 1.0) / (2.0 * s * s));
		let o = p.xy * ((k * a + (k + 1.0) * b) / (a + b));
		c = c + (textureSampleLevel(tex, samp, i.uv + o, 0.0).rgb + textureSampleLevel(tex, samp, i.uv - o, 0.0).rgb) * (a + b);
		total = total + 2.0 * (a + b);
	}
	// The alpha, what images cover, is carried through unblurred.
	return vec4f(c / total, textureSampleLevel(tex, samp, i.uv, 0.0).a);
}
// The frame with the glow added in linear light: it brightens a lit face by
// what it adds, as Studio's captures show, and turns Neon's heart white where its
// channels run past full. A dither under one step of the frame's 8 bits keeps
// its long soft fall from coming out in bands.
// The heatmaps' colours, from the share each pixel holds in red: dark green
// where it is cheap, through green, yellow and red, to white; for the lighting
// heatmap, near black where no light reaches.
fn heatColour(h: f32, lights: bool) -> vec3f {
	if (lights && h < 0.01) { return vec3f(0.03, 0.03, 0.04); }
	let t = clamp(h, 0.0, 1.0);
	if (t < 0.3) { return mix(vec3f(0.03, 0.22, 0.06), vec3f(0.1, 0.72, 0.16), t / 0.3); }
	if (t < 0.55) { return mix(vec3f(0.1, 0.72, 0.16), vec3f(0.95, 0.85, 0.12), (t - 0.3) / 0.25); }
	if (t < 0.8) { return mix(vec3f(0.95, 0.85, 0.12), vec3f(0.9, 0.14, 0.06), (t - 0.55) / 0.25); }
	return mix(vec3f(0.9, 0.14, 0.06), vec3f(1.0), (t - 0.8) / 0.2);
}
${OVERDRAW_WGSL}
@fragment fn fsComposite(i: Out) -> @location(0) vec4f {
	let f = textureLoad(frame, vec2i(i.clip.xy), 0).rgb;
	// Triangle density (p.w 4): shares and shading.
	if (p.w > 3.5) { return vec4f(densityColour(f), 1.0); }
	// Overdraw (p.w 3): the frame holds counts' shares.
	if (p.w > 2.5) { return vec4f(overdrawColour(f.r), 1.0); }
	// A heatmap (p.w 1, or 2 for lights): the frame holds shares, not colours.
	if (p.w > 0.5) { return vec4f(heatColour(f.r, p.w > 1.5), 1.0); }
	// The glow spreads over Decals and Textures too: one over Neon has already
	// kept the Neon beneath it from glowing, in the glow's pass, and the author's
	// captures show the glow of the Neon left showing laid over the image round it.
	let g = (textureSample(tex, samp, i.uv).rgb * ${GLOW_NARROW.weight} + textureSample(wide, samp, i.uv).rgb * ${GLOW_WIDE.weight}) * p.z;
	var c = pow(min(pow(f, vec3f(2.2)) + g, vec3f(1.0)), vec3f(1.0 / 2.2));
	// ColorCorrection on the display values, as fitted to Studio's captures:
	// brightness adds, contrast scales round mid-grey, saturation away from
	// grey, and the tint multiplies.
	if (grade[0].w > 0.5) {
		c = clamp(c + grade[0].x, vec3f(0.0), vec3f(1.0));
		c = clamp((c - 0.5) * (1.0 + grade[0].y) + 0.5, vec3f(0.0), vec3f(1.0));
		let grey = dot(c, vec3f(0.2126, 0.7152, 0.0722));
		c = clamp(grey + (c - grey) * (1.0 + grade[0].z), vec3f(0.0), vec3f(1.0));
		c = c * grade[1].rgb;
	}
	let n = fract(52.9829189 * fract(dot(i.clip.xy, vec2f(0.06711056, 0.00583715)))) - 0.5;
	return vec4f(clamp(c + n / 255.0 * step(1.0 / 512.0, max(g.r, max(g.g, g.b))), vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

const SAMPLES = 4;
/** Where the material table starts in the frame's uniforms, in bytes: after `U`'s two matrices and fourteen vec4s. */
const UNIFORM_MATERIALS = 352;
const SHADER = /* wgsl */ `
struct U {
	viewProj: mat4x4f, invViewProj: mat4x4f,
	sun: vec4f, sunColour: vec4f, ambient: vec4f, zenith: vec4f, horizon: vec4f, ground: vec4f,
	camPos: vec4f, select: vec4f, fog: vec4f, fogColour: vec4f, hazeColour: vec4f,
	screen: vec4f,
	// Neon's glow: see \`glowShape\`'s gate.
	bloom: vec4f,
	// The Rendering panel: its lighting (RENDER_MODE_CODE), whether haze is
	// drawn, whether the heatmaps are linear rather than by cell, and the view
	// drawn over it: see view.ts's renderDebug.
	debug: vec4f,
	// The material table: two rows a material, as \`materialBlock\` writes it.
	mats: array<vec4f, ${MATERIALS.length * 3}>,
};
@group(0) @binding(0) var<uniform> u: U;
// Whether a Rendering panel switch is on: its bit in debug.y (see renderFeatures.ts).
fn has(bit: u32) -> bool { return (u32(u.debug.y) & bit) != 0u; }
// The material textures, a layer each, tinted by the part's Color.
@group(0) @binding(1) var looks: texture_2d_array<f32>;
@group(0) @binding(2) var lookSampler: sampler;
// A Sky's six images, a layer each in SKY_FACES order, when \`screen.w\` is 1 or
// more; at 2, the sun made here is drawn over them, for a Sky that shows
// Roblox's built-in sun.
@group(0) @binding(3) var skyImages: texture_2d_array<f32>;
@group(0) @binding(4) var skySampler: sampler;
// A Sky's own sun image, when \`camPos.w\`, its half width as a tangent, is more than 0.
@group(0) @binding(5) var sunImage: texture_2d<f32>;
// The place's depth from each sky direction, and the sun's last: see skyBlock.
// Then the near maps' views, their vec4 and their box: see nearSkyInto.
struct SkyU { views: array<mat4x4f, 17>, info: vec4f, near: vec4f, nearAt: vec4f };
@group(0) @binding(6) var skyMaps: texture_depth_2d_array;
@group(0) @binding(7) var skyCompare: sampler_comparison;
@group(0) @binding(8) var<uniform> skyU: SkyU;
// 1 where map k sees p, with nothing between it and the sky; 1 off the map.
fn skySees(k: i32, p: vec3f) -> f32 { return skySeesIn(k, p, skyU.info); }
// As skySees, for a map whose texel and depth \`info\` gives.
fn skySeesIn(k: i32, p: vec3f, info: vec4f) -> f32 {
	let c = skyU.views[k] * vec4f(p, 1.0);
	let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
	if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || c.z > 1.0) { return 1.0; }
	// Four taps SKY_SOFT studs apart, turned with k, so each direction's
	// shadow is soft and the eight blend into one shade (see SKY_SOFT).
	let a = f32(k) * 0.785;
	let spread = clamp(${SKY_SOFT}.0 / max(info.x, 1e-3), 1.0, 6.0) * info.z;
	let o = vec2f(cos(a), sin(a)) * spread;
	let q = vec2f(-o.y, o.x) * 0.5;
	let depth = c.z - info.y * 0.5;
	return 0.25 * (textureSampleCompareLevel(skyMaps, skyCompare, uv + o, k, depth) + textureSampleCompareLevel(skyMaps, skyCompare, uv - o, k, depth) + textureSampleCompareLevel(skyMaps, skyCompare, uv + q, k, depth) + textureSampleCompareLevel(skyMaps, skyCompare, uv - q, k, depth));
}
// The place's lights: five vec4s each, see sceneLights; and which reach a
// cell of the world, by its hash, see lightGrid.
@group(0) @binding(9) var<storage, read> lightData: array<vec4f>;
@group(0) @binding(10) var<storage, read> lightTable: array<vec2u>;
@group(0) @binding(11) var<storage, read> lightIndex: array<u32>;
fn lightCell(p: vec3f) -> u32 {
	let c = vec3i(floor(p / 16.0));
	let h = (bitcast<u32>(c.x) * 73856093u) ^ (bitcast<u32>(c.y) * 19349663u) ^ (bitcast<u32>(c.z) * 83492791u);
	return h & 65535u;
}
// What the place's lights add at p, on a face turned to n, before the albedo.
// Fitted to Studio's captures of each kind over a grey floor: a light keeps
// its strength out to 0.7 of its Range and is gone at it, a SpotLight's or
// SurfaceLight's cone eases from its middle to nothing at half its Angle, a
// SurfaceLight shines from the nearest point of its face, and Brightness 1
// adds 1.25, Brightness b, b to the 1.25 (sceneLights). Measured over a light
// and a dark floor at once, through this display curve, to 4.3 levels rms.
// Each light's highlight too, as a gloss of the material's: on SmoothPlastic
// Studio's is 0.55 of the light where it mirrors to the eye, four times the
// sun's, and sharper (gloss twice the material's), from the same captures.
struct Lamps { diffuse: vec3f, spec: vec3f };
fn partLights(p: vec3f, n: vec3f, v: vec3f, gloss: f32) -> Lamps {
	let b = lightTable[lightCell(p)];
	var sum = vec3f(0.0);
	var shine = vec3f(0.0);
	for (var j = 0u; j < min(b.y, 64u); j++) {
		let k = lightIndex[b.x + j] * 5u;
		let a = lightData[k];
		let col = lightData[k + 1u];
		let d = lightData[k + 2u];
		let kind = select(select(${FEATURE_BIT.pointLights}u, ${FEATURE_BIT.spotLights}u, col.w > 0.5), ${FEATURE_BIT.surfaceLights}u, col.w > 1.5);
		if (!has(kind)) { continue; }
		var at = a.xyz;
		if (col.w > 1.5) {
			// Only in front of its face: a point on the face itself, as the part
			// the light is on, found the light's direction in rounding error.
			if (dot(p - a.xyz, d.xyz) < 0.05) { continue; }
			let u = lightData[k + 3u].xyz;
			let v = lightData[k + 4u].xyz;
			let off = p - a.xyz;
			at = a.xyz + u * clamp(dot(off, u) / max(dot(u, u), 1e-6), -1.0, 1.0) + v * clamp(dot(off, v) / max(dot(v, v), 1e-6), -1.0, 1.0);
		}
		let to = at - p;
		let dist = length(to);
		if (dist >= a.w) { continue; }
		let l = to / max(dist, 1e-4);
		var k2 = max(dot(n, l), 0.0) * (1.0 - smoothstep(0.7, 1.0, dist / a.w));
		if (col.w > 0.5) {
			let c = dot(-l, d.xyz);
			if (c <= 0.0) { continue; }
			k2 = k2 * (1.0 - smoothstep(0.0, 1.0, atan2(length(cross(-l, d.xyz)), c) / max(d.w, 1e-3)));
		}
		sum = sum + col.rgb * k2;
		shine = shine + col.rgb * k2 * pow(max(dot(n, normalize(l + v)), 0.0), gloss);
	}
	return Lamps(sum * 1.25, shine * 1.25);
}
// The Rendering panel's heatmaps: the lights p is tested against, as
// partLights walks them; those that reach it; and those weighed by how
// strongly, by Range and cone as partLights eases them.
fn lightWork(p: vec3f, n: vec3f) -> vec3f {
	let b = lightTable[lightCell(p)];
	let tested = min(b.y, 64u);
	var reached = 0.0;
	var weight = 0.0;
	for (var j = 0u; j < tested; j++) {
		let k = lightIndex[b.x + j] * 5u;
		let a = lightData[k];
		let col = lightData[k + 1u];
		let d = lightData[k + 2u];
		let kind = select(select(${FEATURE_BIT.pointLights}u, ${FEATURE_BIT.spotLights}u, col.w > 0.5), ${FEATURE_BIT.surfaceLights}u, col.w > 1.5);
		if (!has(kind)) { continue; }
		var at = a.xyz;
		if (col.w > 1.5) {
			if (dot(p - a.xyz, d.xyz) < 0.05) { continue; }
			let su = lightData[k + 3u].xyz;
			let sv = lightData[k + 4u].xyz;
			let off = p - a.xyz;
			at = a.xyz + su * clamp(dot(off, su) / max(dot(su, su), 1e-6), -1.0, 1.0) + sv * clamp(dot(off, sv) / max(dot(sv, sv), 1e-6), -1.0, 1.0);
		}
		let to = at - p;
		let dist = length(to);
		if (dist >= a.w || dot(n, to) <= 0.0) { continue; }
		var strength = 1.0 - smoothstep(0.7, 1.0, dist / a.w);
		if (col.w > 0.5) {
			let c = dot(-to / max(dist, 1e-4), d.xyz);
			if (c <= cos(d.w)) { continue; }
			strength = strength * (1.0 - smoothstep(0.0, 1.0, atan2(length(cross(-to / max(dist, 1e-4), d.xyz)), c) / max(d.w, 1e-3)));
		}
		reached = reached + 1.0;
		weight = weight + strength;
	}
	return vec3f(f32(tested), reached, weight);
}
// The lights tested at p, blended between the eight cells nearest, for the
// linear render heatmap: one cell's list against the next is a step otherwise.
fn testedSmooth(p: vec3f) -> f32 {
	let q = p / 16.0 - 0.5;
	let c = floor(q);
	let f = q - c;
	var sum = 0.0;
	for (var k = 0u; k < 8u; k++) {
		let o = vec3f(f32(k & 1u), f32((k >> 1u) & 1u), f32((k >> 2u) & 1u));
		let w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y) * mix(1.0 - f.z, f.z, o.z);
		sum = sum + w * f32(min(lightTable[lightCell((c + o + 0.5) * 16.0)].y, 64u));
	}
	return sum;
}
// A pixel's share of what shows white: for the render heatmap, its estimated
// work in texture reads and light tests; for the lighting heatmap, the
// lights that reach it.
fn heat(i: VOut) -> f32 {
	// Overdraw: one share for each surface drawn.
	if (u.debug.w > 0.5 && u.debug.w < 1.5) { return ${1 / OVERDRAW_FULL}; }
	let row = i.look & 255u;
	let a = u.mats[row * 3u];
	let b = u.mats[row * 3u + 1u];
	let n = normalize(i.normal);
	let blend = u.debug.z > 0.5;
	if (u.debug.x > 5.5) {
		let lw = lightWork(i.world, n);
		return select(lw.y, lw.z, blend) / ${LIGHTS_FULL}.0;
	}
	// The surface, its colour and the haze; a pattern's noise; a texture.
	var cost = 2.0;
	if (a.w > 0.0) { cost = cost + 2.0; }
	if (b.w > 0.5) { cost = cost + 1.0; }
	if (b.y > 0.5 && b.y < 1.5) { return cost / ${COST_FULL}.0; }
	// The sky's maps, two taps of eight; the sun's eight taps; the sky's
	// reflection; then each light tested, and more for each that reaches.
	cost = cost + 7.0;
	let w = lightWork(i.world, n);
	if (blend) { return (cost + testedSmooth(i.world) + w.z * 1.5) / ${COST_FULL}.0; }
	return (cost + w.x + w.y * 1.5) / ${COST_FULL}.0;
}
// How much of the sky reaches p, on a face turned to n: the share of the maps that see it.
fn skyVisibility(p: vec3f, n: vec3f) -> f32 {
	if (skyU.info.w < 0.5 || !has(${FEATURE_BIT.skyShadows}u)) { return 1.0; }
	// Near the camera the near maps, a texel well under a wall's width; the
	// whole place's further off, blended over the box's last quarter.
	var edge = 2.0;
	if (skyU.near.w > 0.5 && has(${FEATURE_BIT.nearSky}u)) {
		let off = abs(p - skyU.nearAt.xyz);
		edge = max(off.x, max(off.y, off.z)) / skyU.nearAt.w;
	}
	var near = 0.0;
	if (edge < 1.0) {
		let qn = p + n * skyU.near.x * 1.5;
		for (var k = 0; k < 8; k++) { near = near + skySeesIn(${SKY_NEAR_LAYER} + k, qn, skyU.near); }
		near = near / 8.0;
		if (edge < 0.75) { return near; }
	}
	let q = p + n * skyU.info.x * 1.5;
	var seen = 0.0;
	for (var k = 0; k < 8; k++) { seen = seen + skySees(k, q); }
	seen = seen / 8.0;
	if (edge >= 1.0) { return seen; }
	return mix(near, seen, smoothstep(0.75, 1.0, edge));
}
// Whether the sun reaches p: its own map, four taps a texel apart.
// The sun's shadow near the camera, sharp close by: see cascadeBlock.
struct CascU { views: array<mat4x4f, 3>, far: vec4f, texel: vec4f };
@group(0) @binding(12) var sunMaps: texture_depth_2d_array;
@group(0) @binding(13) var<uniform> cascU: CascU;
var<private> POISSON: array<vec2f, 8> = array<vec2f, 8>(
	vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621),
	vec2f(0.962, -0.195), vec2f(0.473, -0.480), vec2f(0.519, 0.767), vec2f(0.185, -0.893));
// Cascade k's share of the sun reaching p: eight taps over ShadowSoftness's width.
fn cascadeSees(k: i32, p: vec3f, n: vec3f) -> f32 {
	let texel = cascU.texel[k];
	// Pushed out along the normal by a texel or so, less where the sun is
	// square on, so a shadow cast from a few studs away is not lost.
	let l = normalize(u.sun.xyz);
	let slope = sqrt(max(1.0 - dot(n, l) * dot(n, l), 0.0));
	let c = cascU.views[k] * vec4f(p + n * texel * (0.5 + slope), 1.0);
	let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
	// ShadowSoftness's width, and never under a texel and a half, so the
	// map's texels blur into a straight edge rather than steps.
	let r = max(cascU.far.w / texel, 1.5) / ${CASCADE_MAP}.0;
	var seen = 0.0;
	for (var j = 0; j < 8; j++) {
		seen = seen + textureSampleCompareLevel(sunMaps, skyCompare, uv + POISSON[j] * r, k, c.z - 0.00005);
	}
	return seen / 8.0;
}
fn sunSees(p: vec3f, n: vec3f) -> f32 {
	if (skyU.info.w < 0.5 || cascU.texel.w > 1.5) { return 1.0; }
	if (cascU.texel.w > 0.5) {
		let d = length(p - u.camPos.xyz);
		if (d < cascU.far.x) { return cascadeSees(0, p, n); }
		if (d < cascU.far.y) { return cascadeSees(1, p, n); }
		if (d < cascU.far.z) { return cascadeSees(2, p, n); }
	}
	if (!has(${FEATURE_BIT.farShadows}u)) { return 1.0; }
	let q = p + n * skyU.info.x * 1.5;
	let s = skyU.info.x * 0.5;
	return 0.25 * (skySees(8, q + vec3f(s, 0.0, s)) + skySees(8, q + vec3f(-s, 0.0, s)) + skySees(8, q + vec3f(s, 0.0, -s)) + skySees(8, q + vec3f(-s, 0.0, -s)));
}
struct VIn {
	@location(0) pos: vec3f, @location(1) nrm: vec3f,
	@location(2) c0: vec3f, @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) p: vec3f,
	@location(6) colour: vec4f, @location(7) id: u32, @location(8) look: u32,
};
struct VOut {
	// Invariant: the depth pre-pass and the lit pass must land on the very same depths.
	@builtin(position) @invariant clip: vec4f, @location(0) colour: vec3f, @location(1) @interpolate(flat) id: u32,
	@location(2) world: vec3f, @location(3) normal: vec3f,
	@location(4) alpha: f32, @location(5) @interpolate(flat) look: u32,
	@location(6) local: vec3f, @location(7) lnormal: vec3f,
};
@vertex fn vs(v: VIn) -> VOut { return shade(v); }
// The parts' transform, shared by the parts and the handles: an entry point cannot call another.
fn shade(v: VIn) -> VOut {
	let m = mat3x3f(v.c0, v.c1, v.c2);
	let s = vec3f(length(v.c0), length(v.c1), length(v.c2));
	var o: VOut;
	o.world = m * v.pos + v.p;
	o.clip = u.viewProj * vec4f(o.world, 1.0);
	o.normal = normalize(m * (v.nrm / max(s * s, vec3f(1e-6))));
	o.colour = pow(v.colour.rgb, vec3f(2.2));
	o.id = v.id;
	o.alpha = v.colour.a;
	o.look = v.look;
	// Where on the part, in studs from its middle, for its material's pattern.
	o.local = v.pos * s;
	o.lnormal = v.nrm;
	return o;
}
// The sky in a direction: blue overhead, the haze colour at the horizon,
// darker below it, and the sun's disc and glow.
fn sky(dir: vec3f) -> vec3f {
	var c: vec3f;
	if (dir.y >= 0.0) {
		c = mix(u.zenith.rgb, u.horizon.rgb, clamp(1.0 - dir.y / 0.14, 0.0, 1.0));
	} else {
		c = mix(u.horizon.rgb, u.ground.rgb, min(1.0, -dir.y * 5.0));
	}
	// The sun made here, unless the Sky has a sun image of its own.
	return c + select(sunLight(dir), vec3f(0.0), u.camPos.w > 0.0);
}
// A Sky's own sun image in a direction, in linear light: centred on the sun,
// SunAngularSize across, and upright to the sky, as Studio's captures show it.
// Its light is added after the display curve, so its colours stay its own.
fn sunImageLight(dir: vec3f) -> vec3f {
	let half = u.camPos.w;
	let s = u.sun.xyz;
	let k = dot(dir, s);
	var across = cross(s, vec3f(0.0, 1.0, 0.0));
	if (length(across) < 1e-4) { across = vec3f(1.0, 0.0, 0.0); }
	let right = normalize(across);
	let up = cross(right, s);
	let p = dir / max(k, 1e-4) - s;
	// Its left on the sky's right, as Studio's captures show it.
	let uv = vec2f(-dot(p, right), dot(p, up)) / max(half, 1e-4);
	let t = textureSampleLevel(sunImage, skySampler, vec2f(uv.x * 0.5 + 0.5, 0.5 - uv.y * 0.5), 0.0);
	let inside = half > 0.0 && k > 0.0 && max(abs(uv.x), abs(uv.y)) < 1.0;
	return select(vec3f(0.0), pow(t.rgb, vec3f(2.2)) * t.a * ${SUN_GAIN.toFixed(3)} * u.zenith.w, inside);
}
// The sun's disc and the glow round it, in a direction.
fn sunLight(dir: vec3f) -> vec3f {
	let a = dot(dir, u.sun.xyz);
	let disc = smoothstep(u.sunColour.w - 0.00002, u.sunColour.w + 0.00008, a);
	let glow = pow(max(a, 0.0), 48.0) * (0.18 + u.ground.w * 0.6) + pow(max(a, 0.0), 6.0) * 0.06;
	return u.sunColour.rgb * (disc * 4.0 + glow);
}
// Stephen Hill's fit of the ACES curve, as BakingLab (MIT) has it.
fn aces(colour: vec3f) -> vec3f {
	let i = mat3x3f(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
	let o = mat3x3f(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
	let v = i * colour;
	let a = v * (v + 0.0245786) - 0.000090537;
	let b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return clamp(o * (a / b), vec3f(0.0), vec3f(1.0));
}
// No lift: in Studio's captures of a dark room its blacks reach 0.
fn display(c: vec3f) -> vec3f {
	let t = aces(c * u.zenith.w);
	return pow(t, vec3f(1.0 / 2.2));
}
// The air between a surface and the camera: Lighting's fog, or the
// Atmosphere's haze, thinner with height as air is.
fn air(c: vec3f, d: f32, y: f32) -> vec3f {
	if (u.fog.z > 0.5) {
		return mix(c, u.fogColour.rgb, clamp((d - u.fog.x) / max(u.fog.y - u.fog.x, 1.0), 0.0, 1.0));
	}
	let thin = exp(-max(y, 0.0) * 0.004);
	return mix(c, u.hazeColour.rgb, 1.0 - exp(-d * u.horizon.w * thin));
}
// Roswaal's own hash, for a random-looking value per cell of a pattern. The
// shifts and multipliers were found by \`scripts/find-hash.mjs\`, which says how.
// Every caller passes whole numbers: a cell's corner, after \`floor\`.
fn mixBits(v: u32) -> u32 {
	var x = v;
	x ^= x >> 18u;
	x *= 0xe71d6283u;
	x ^= x >> 15u;
	x *= 0x1f04730du;
	x ^= x >> 18u;
	return x;
}
// Its top 24 bits as a number from 0 up to 1, which a float holds exactly.
fn toUnit(h: u32) -> f32 { return f32(h >> 8u) / 16777216.0; }
fn cellBits(p: vec2f) -> u32 { let q = bitcast<vec2u>(vec2i(p)); return mixBits(q.x ^ mixBits(q.y)); }
fn hash1(p: vec2f) -> f32 { return toUnit(cellBits(p)); }
fn hash2(p: vec2f) -> vec2f { let h = cellBits(p); return vec2f(toUnit(h), toUnit(mixBits(h))); }
fn noise2(p: vec2f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let w = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash1(i), hash1(i + vec2f(1.0, 0.0)), w.x), mix(hash1(i + vec2f(0.0, 1.0)), hash1(i + vec2f(1.0, 1.0)), w.x), w.y);
}
// How far a point is from the nearest edge between cells, and its cell's own
// random value: stones, pebbles and cracks.
fn cells(p: vec2f) -> vec2f {
	let i = floor(p);
	let f = fract(p);
	var d1 = 8.0;
	var d2 = 8.0;
	var id = 0.0;
	for (var y = -1; y <= 1; y++) {
		for (var x = -1; x <= 1; x++) {
			let g = vec2f(f32(x), f32(y));
			let r = g + hash2(i + g) - f;
			let d = dot(r, r);
			if (d < d1) { d2 = d1; d1 = d; id = hash1(i + g); } else if (d < d2) { d2 = d; }
		}
	}
	return vec2f(sqrt(d2) - sqrt(d1), id);
}
fn edgeOf(v: f32) -> f32 { return min(fract(v), 1.0 - fract(v)); }
// Neon as measured from Studio's captures of test parts. Its face, on the
// sRGB scale, is 2.74 times its
// colour less 0.545: a dark Neon is darker than its colour, and a bright one
// runs past full, which is what glows. Transparency dims it a little.
fn neonLevel(colour: vec3f, alpha: f32) -> vec3f {
	let t = 1.0 - alpha;
	return 2.74 * pow(colour, vec3f(1.0 / 2.2)) * (1.0 - 0.2 * pow(t, 1.5)) - 0.545;
}
// A see-through Neon part is more opaque than its Transparency says: at 0.5
// it draws at an opacity of 0.81, at 0.8 at 0.47, blended as the frame is.
fn neonAlpha(alpha: f32) -> f32 {
	let t = 1.0 - alpha;
	return pow(1.0 - t * t, 0.75);
}
// A material's pattern at a point on its face, in studs: x scales its colour,
// y its highlight, z is light of its own.
fn pattern(kind: u32, uv: vec2f, size: f32) -> vec3f {
	switch kind {
		case 1u: {
			let g = noise2(uv * vec2f(0.5, 4.0) / size);
			let s = sin(uv.y * 10.0 / size + g * 7.0) * 0.5 + 0.5;
			return vec3f(0.86 + 0.24 * s, 1.0, 0.0);
		}
		case 2u: {
			let row = floor(uv.y);
			let x = uv.x + hash1(vec2f(row, 7.0)) * 4.0;
			let line = 1.0 - smoothstep(0.02, 0.05, min(edgeOf(uv.y), edgeOf(x / 4.0) * 4.0));
			let g = noise2(vec2f(x * 0.5, uv.y * 4.0) / size);
			let s = sin(uv.y * 14.0 + g * 6.0) * 0.5 + 0.5;
			let tint = 0.9 + 0.18 * hash1(vec2f(row, floor(x / 4.0)));
			return vec3f(tint * (0.88 + 0.16 * s) * (1.0 - 0.5 * line), 1.0 - line, 0.0);
		}
		case 3u: {
			let row = floor(uv.y);
			let x = uv.x / 2.0 + 0.5 * (row - 2.0 * floor(row / 2.0));
			let mortar = 1.0 - smoothstep(0.05, 0.09, min(edgeOf(x) * 2.0, edgeOf(uv.y)));
			let tint = 0.86 + 0.24 * hash1(vec2f(floor(x), row));
			return vec3f(mix(tint, 1.3, mortar), 1.0 - 0.7 * mortar, 0.0);
		}
		case 4u, 5u: {
			let c = cells(uv * select(0.9, 2.6, kind == 5u) / size);
			let edge = 1.0 - smoothstep(0.03, 0.14, c.x);
			return vec3f((0.82 + 0.3 * c.y) * (1.0 - 0.55 * edge), 1.0 - edge, 0.0);
		}
		case 6u: {
			let r = vec2f(uv.x + uv.y, uv.x - uv.y) * 1.2;
			let q = abs(fract(r) - 0.5);
			let bump = 1.0 - smoothstep(0.12, 0.18, q.x * 0.45 + q.y);
			return vec3f(0.9 + 0.22 * bump, 1.0 + 0.8 * bump, 0.0);
		}
		case 7u: {
			let t = uv / 2.0;
			let grout = 1.0 - smoothstep(0.03, 0.06, min(edgeOf(t.x), edgeOf(t.y)) * 2.0);
			let tint = 0.94 + 0.1 * hash1(floor(t));
			return vec3f(mix(tint, 0.68, grout), 1.0 - grout, 0.0);
		}
		case 8u: {
			let row = floor(uv.y * 1.5);
			let x = uv.x + 0.5 * (row - 2.0 * floor(row / 2.0));
			let line = 1.0 - smoothstep(0.02, 0.05, edgeOf(x));
			let tint = 0.92 + 0.12 * hash1(vec2f(floor(x), row));
			return vec3f((0.72 + 0.34 * fract(uv.y * 1.5)) * tint * (1.0 - 0.35 * line), 1.0, 0.0);
		}
		case 9u: {
			let w = sin(uv.x * 30.0 / size) * sin(uv.y * 30.0 / size);
			return vec3f(0.93 + 0.1 * w, 1.0, 0.0);
		}
		case 10u: {
			let n = noise2(uv * 4.0 / size) * 0.5 + hash1(floor(uv * 20.0 / size)) * 0.5;
			return vec3f(0.86 + 0.26 * n, 1.0, 0.0);
		}
		case 11u: {
			let n = noise2(uv * 0.7 / size) * 0.6 + noise2(uv * 3.0 / size) * 0.4;
			return vec3f(0.78 + 0.4 * n, 1.0, 0.0);
		}
		case 12u: {
			let n = noise2(uv * 0.6 / size);
			let s = hash1(floor(uv * 28.0 / size));
			return vec3f((0.82 + 0.26 * n) * (0.86 + 0.26 * s), 1.0, 0.0);
		}
		case 13u: {
			let n = noise2(uv * 1.1 / size) * 0.7 + noise2(uv * 5.0 / size) * 0.3;
			let b = smoothstep(0.42, 0.62, n);
			return vec3f(1.0 - 0.32 * b, 1.0 - 0.6 * b, 0.0);
		}
		case 14u: {
			let c = cells(uv * 0.8 / size);
			let crack = 1.0 - smoothstep(0.02, 0.08, c.x);
			return vec3f((0.4 + 0.25 * c.y) * (1.0 - crack), 1.0 - crack, crack);
		}
		case 15u: {
			let n = noise2(uv * 0.5 / size) * 3.0 + noise2(uv * 2.0 / size);
			let vein = 1.0 - smoothstep(0.0, 0.1, abs(sin((uv.x + uv.y) * 0.7 + n * 2.0)));
			return vec3f(1.0 - 0.35 * vein, 1.0, 0.0);
		}
		default: { return vec3f(1.0, 1.0, 0.0); }
	}
}
// A face's own two directions, in studs on the part: the plane square to the
// way it faces on the unit shape.
fn faceUv(local: vec3f, ln: vec3f) -> vec2f {
	let a = abs(ln);
	if (a.y >= a.x && a.y >= a.z) { return local.xz; }
	if (a.x >= a.z) { return local.zy; }
	return local.xy;
}
// CrackedLava's light, where its cracks are: deep red at their edges, orange at their hearts.
const LAVA = vec3f(1.0, 0.1, 0.02);
const LAVA_HOT = vec3f(1.0, 0.45, 0.1);
fn lavaLight(m: f32) -> vec3f { return mix(LAVA, LAVA_HOT, m * m) * m; }
// A cheap value noise, for a material's grain.
fn hash3(p: vec3f) -> f32 { let q = bitcast<vec3u>(vec3i(p)); return toUnit(mixBits(q.x ^ mixBits(q.y ^ mixBits(q.z)))); }
fn noise3(p: vec3f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let w = f * f * (3.0 - 2.0 * f);
	let x0 = mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), w.x), mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y);
	let x1 = mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), w.x), mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y);
	return mix(x0, x1, w.z);
}
// A surface in its material: the sun's light and highlight, the sky's fill, a
// metal's tinted highlight, the material's grain, what it reflects, and the
// air in front of it. Neon is lit by neonLevel, below; ForceField glows at
// its rim.
fn surface(i: VOut) -> vec4f {
	let row = i.look & 255u;
	let shine = f32((i.look >> 8u) & 255u) / 255.0;
	let a = u.mats[row * 3u];
	let b = u.mats[row * 3u + 1u];
	let tex = u.mats[row * 3u + 2u];
	// Smooth shading off: each triangle's own face, turned the way its normal is.
	let faceN = normalize(cross(dpdx(i.world), dpdy(i.world)));
	var n = normalize(i.normal);
	if (!has(${FEATURE_BIT.smooth}u)) { n = select(-faceN, faceN, dot(faceN, n) >= 0.0); }
	let toEye = u.camPos.xyz - i.world;
	let d = length(toEye);
	let v = toEye / max(d, 1e-4);
	var albedo = i.colour;
	if (a.w > 0.0 && has(${FEATURE_BIT.grain}u)) {
		let g = noise3(i.local / b.x) * 0.65 + noise3(i.local / b.x * 3.1) * 0.35;
		albedo = albedo * (1.0 + a.w * (g - 0.5) * 2.0);
	}
	// A texture once its layer has loaded; the material's own pattern until then.
	let uv = faceUv(i.local, i.lnormal);
	let layer = i32(b.w) - 1;
	let look = textureSample(looks, lookSampler, uv / tex.x, max(layer, 0));
	var pat = pattern(u32(b.z), uv, b.x);
	if (!has(${FEATURE_BIT.grain}u)) { pat = vec3f(1.0, 1.0, pat.z); }
	if (layer >= 0 && has(${FEATURE_BIT.textures}u)) {
		pat = vec3f(mix(1.0, look.r * 2.0, tex.y), 1.0, tex.z * look.g);
	}
	albedo = albedo * pat.x;
	var alpha = i.alpha;
	var c: vec3f;
	if (b.y > 0.5 && b.y < 1.5 && has(${FEATURE_BIT.neon}u)) {
		c = pow(clamp(neonLevel(albedo, i.alpha), vec3f(0.0), vec3f(1.0)), vec3f(2.2));
		alpha = neonAlpha(i.alpha);
	} else if (b.y > 2.5) {
		let rim = pow(1.0 - abs(dot(n, v)), 2.0);
		c = albedo * (0.6 + rim * 2.5);
		alpha = alpha * clamp(0.15 + rim * 0.85, 0.0, 1.0);
	} else if (has(${FEATURE_BIT.unlit}u)) {
		// No light at all: the colour and material as they are.
		c = albedo;
	} else {
		let l = u.sun.xyz;
		let ndl = max(dot(n, l), 0.0);
		let h = normalize(l + v);
		var spec = 0.0;
		if (has(${FEATURE_BIT.highlights}u)) { spec = pow(max(dot(n, h), 0.0), a.y) * a.x * pat.y; }
		// Ambient everywhere, OutdoorAmbient and the sky as far as the sky
		// reaches, and the sun where it does. A switch off leaves its light out
		// of the lighting (renderFeatures.ts's litFor) or its bit unset.
		let vis = skyVisibility(i.world, n);
		let sunK = sunSees(i.world, n);
		let lit = u.sunColour.rgb * ndl * sunK;
		let fill = (vec3f(u.fog.w, u.fogColour.w, u.hazeColour.w) + u.ambient.rgb * max(vis, ${SKY_SEEN_LEAST})) * (0.9 + 0.1 * n.y);
		var lamps = Lamps(vec3f(0.0), vec3f(0.0));
		if (has(${FEATURE_BIT.pointLights}u | ${FEATURE_BIT.spotLights}u | ${FEATURE_BIT.surfaceLights}u)) { lamps = partLights(i.world, n, v, a.y * 2.0); }
		let lampShine = select(0.0, 1.0, has(${FEATURE_BIT.lightHighlights}u));
		c = albedo * (1.0 - a.z * 0.6) * (fill + lit + lamps.diffuse) + mix(vec3f(1.0), albedo, a.z) * (spec * lit + lamps.spec * a.x * pat.y * 4.6 * lampShine);
		if (has(${FEATURE_BIT.reflections}u)) {
			let seen = sky(reflect(-v, n)) * max(vis, 0.05);
			// A metal shows a little of the sky in its own colour.
			c = c + seen * albedo * a.z * a.x * 0.25;
			// Reflectance, and glass's own, stronger at a glancing angle.
			var mirror = shine;
			if (b.y > 1.5) { mirror = max(mirror, 0.2 + 0.5 * pow(1.0 - abs(dot(n, v)), 3.0)); }
			c = mix(c, seen, mirror);
		}
		if (has(${FEATURE_BIT.lava}u)) { c = c + lavaLight(pat.z) * 2.2; }
	}
	c = air(c, d, i.world.y);
	return vec4f(c, alpha);
}
// What gives light of its own, for the glow round it, in linear light. Neon
// as measured from Studio's captures: each channel by how far its light runs
// past 0.3, easing off, once its brightest channel nears full; so a dark
// Neon, as dark blue or mid grey, does not glow, and olive glows greener than
// itself. A see-through part glows less the more see-through it
// is, and not at all from a Transparency of 0.3. CrackedLava's cracks glow
// a little.
fn glowSource(i: VOut) -> vec3f {
	let row = i.look & 255u;
	let b = u.mats[row * 3u + 1u];
	let tex = u.mats[row * 3u + 2u];
	let uv = faceUv(i.local, i.lnormal);
	let layer = i32(b.w) - 1;
	// Sampled before any branch: WGSL samples only in uniform control flow.
	let look = textureSample(looks, lookSampler, uv / tex.x, max(layer, 0));
	if (b.y > 0.5 && b.y < 1.5) {
		if (!has(${FEATURE_BIT.neonGlow}u)) { return vec3f(0.0); }
		let e = pow(max(neonLevel(i.colour, i.alpha), vec3f(0.0)), vec3f(2.2));
		let most = max(e.r, max(e.g, e.b));
		// Gone from a Transparency of 0.3, easing as Studio's screen captures of a
		// Neon part at 0.1, 0.2 and 0.25 show: 0.82, 0.5 and 0.29 of its glow.
		let fade = pow(max(1.0 - (1.0 - i.alpha) / u.bloom.z, 0.0), 1.1);
		return (1.0 - exp(-max(e - u.bloom.y, vec3f(0.0)))) * smoothstep(u.bloom.x, u.bloom.x + 0.3, most) * fade;
	}
	if (!has(${FEATURE_BIT.lava}u)) { return vec3f(0.0); }
	if (tex.z > 0.5 && layer >= 0) { return min(lavaLight(look.g), vec3f(1.0)) * 0.2; }
	if (u32(b.z) == 14u) { return min(lavaLight(pattern(14u, uv, b.x).z), vec3f(1.0)) * 0.2; }
	return vec3f(0.0);
}
// Its alpha, 0, clears what images cover: a part in front of an image hides it.
@fragment fn fsGlow(i: VOut) -> @location(0) vec4f { return vec4f(glowSource(i), 0.0); }
// A see-through part over what glows behind it, as it lies over it in the
// frame. A see-through Neon part's own glow already fades with it.
@fragment fn fsGlowSeen(i: VOut) -> @location(0) vec4f {
	let shade = u.mats[(i.look & 255u) * 3u + 1u].y;
	let neon = shade > 0.5 && shade < 1.5;
	let a = select(i.alpha, neonAlpha(i.alpha), neon);
	return vec4f(glowSource(i) * select(i.alpha, 1.0, neon), a);
}
// Neon past the display curve, each channel capped: in Studio's captures, red
// Neon stays pure red, and dark blue comes out three times its colour.
// The depth pre-pass: the solid parts' depth only, so the lit pass shades
// each pixel once, for the surface it shows, rather than for every surface
// drawn over it on the way.
@fragment fn fsNothing() -> @location(0) vec4f { return vec4f(0.0); }
${VIEWS_WGSL}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
	// The near sky maps' box edge, for the Shadow maps view: found before any
	// branch, as a derivative must be.
	let edge = nearEdge(i.world);
	let wide = fwidth(edge);
	// The heatmaps: a share in red, added up and coloured by the composite.
	if (u.debug.x > 4.5) { return vec4f(heat(i), 0.0, 0.0, 1.0); }
	let s = surface(i);
	let shade = u.mats[(i.look & 255u) * 3u + 1u].y;
	let neon = shade > 0.5 && shade < 1.5;
	let shown = select(display(s.rgb), pow(min(s.rgb, vec3f(1.0)), vec3f(1.0 / 2.2)), neon);
	if (u.debug.w > 2.5) { return vec4f(sunMapTint(shown, i.world, edge, wide), s.a); }
	return vec4f(shown, s.a);
}
// Wireframe only: each part's edges, in its own colour lifted toward white.
@fragment fn fsWire(i: VOut) -> @location(0) vec4f {
	return vec4f(pow(mix(i.colour, vec3f(1.0), 0.3), vec3f(1.0 / 2.2)), 0.85);
}
// The sky behind everything: a triangle that covers the screen, each pixel's ray worked out from where it is.
struct SOut { @builtin(position) clip: vec4f, @location(0) ndc: vec2f };
@vertex fn vsSky(@builtin(vertex_index) i: u32) -> SOut {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	var o: SOut;
	o.clip = vec4f(xy, 0.0, 1.0);
	o.ndc = xy;
	return o;
}
// Where a direction meets a Sky's images: u and v from -1 to 1, and the
// face's layer. As view.ts's skyLookup, which says how it was measured.
fn skyFace(d: vec3f) -> vec3f {
	let a = abs(d);
	if (a.x >= a.y && a.x >= a.z) {
		if (d.x > 0.0) { return vec3f(d.z / a.x, -d.y / a.x, 3.0); }
		return vec3f(-d.z / a.x, -d.y / a.x, 4.0);
	}
	if (a.z >= a.y) {
		if (d.z > 0.0) { return vec3f(-d.x / a.z, -d.y / a.z, 0.0); }
		return vec3f(d.x / a.z, -d.y / a.z, 2.0);
	}
	if (d.y > 0.0) { return vec3f(-d.z / a.y, -d.x / a.y, 5.0); }
	return vec3f(-d.z / a.y, d.x / a.y, 1.0);
}
@fragment fn fsSky(i: SOut) -> @location(0) vec4f {
	let far = u.invViewProj * vec4f(i.ndc, 1.0, 1.0);
	let dir = normalize(far.xyz / far.w - u.camPos.xyz);
	if (u.screen.w > 0.5) {
		// Through the display curve, without the lift a lit surface's shadows
		// have: a dark sky stays nearly black, as Studio's captures of one do.
		let f = skyFace(dir);
		let c = textureSampleLevel(skyImages, skySampler, f.xy * 0.5 + 0.5, i32(f.z), 0.0).rgb;
		let sun = select(vec3f(0.0), sunLight(dir), u.screen.w > 1.5);
		let seen = aces((pow(c, vec3f(2.2)) * ${SKY_GAIN} + sun) * u.zenith.w);
		return vec4f(pow(min(seen + sunImageLight(dir), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
	}
	let seen = pow(display(sky(dir)), vec3f(2.2));
	return vec4f(pow(min(seen + sunImageLight(dir), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
// A handle: in the tool's colour, shaded but not lit by the place, with its
// depth squeezed into the front hundredth of the range -- by 1, as depth here
// is reversed -- so it is in front of the place and still in front of or
// behind the other handles as it should be.
@vertex fn vsHandle(v: VIn) -> VOut {
	var o = shade(v);
	o.clip.z = o.clip.w - (o.clip.w - o.clip.z) * 0.01;
	return o;
}
@fragment fn fsHandle(i: VOut) -> @location(0) vec4f {
	let n = normalize(i.normal);
	let shadeK = 0.72 + 0.38 * max(dot(n, normalize(vec3f(0.4, 1.0, 0.25))), 0.0);
	return vec4f(pow(i.colour * shadeK, vec3f(1.0 / 2.2)), u.sun.w);
}
// An edge of an outline, as a band \`screen.z\` pixels wide, square to it on
// screen and half its width past each corner so the corners meet. It is on
// the box's own edge, drawn a touch towards the camera so the faces it runs
// along do not hide it; an edge that passes behind the camera is cut where it
// does, or it would bend across the view.
@vertex fn vsLine(v: VIn, @builtin(vertex_index) vid: u32) -> VOut {
	let m = mat3x3f(v.c0, v.c1, v.c2);
	var wa = m * v.pos + v.p;
	var wb = m * v.nrm + v.p;
	wa = wa + (u.camPos.xyz - wa) * 0.004;
	wb = wb + (u.camPos.xyz - wb) * 0.004;
	var a = u.viewProj * vec4f(wa, 1.0);
	var b = u.viewProj * vec4f(wb, 1.0);
	let e = 0.001;
	let behind = a.w < e && b.w < e;
	if (a.w < e) { a = mix(a, b, (e - a.w) / (b.w - a.w)); }
	if (b.w < e) { b = mix(b, a, (e - b.w) / (a.w - b.w)); }
	let end = (vid & 2u) == 2u;
	let side = select(-1.0, 1.0, (vid & 1u) == 1u);
	let dir = normalize((b.xy / b.w - a.xy / a.w) * u.screen.xy + vec2f(1e-6, 0.0));
	let off = (vec2f(-dir.y, dir.x) * side + dir * select(-1.0, 1.0, end)) * u.screen.z / u.screen.xy;
	var o: VOut;
	o.clip = select(a, b, end);
	o.clip = vec4f(o.clip.xy + off * o.clip.w, o.clip.zw);
	if (behind) { o.clip = vec4f(2.0, 2.0, 2.0, 1.0); }
	o.world = select(wa, wb, end);
	o.colour = v.colour.rgb;
	o.alpha = v.colour.a;
	o.normal = vec3f(0.0, 1.0, 0.0);
	o.id = v.id;
	return o;
}
struct LIn { @location(0) pos: vec3f, @location(1) colour: vec3f };
struct LOut { @builtin(position) clip: vec4f, @location(0) colour: vec3f };
@vertex fn vsOver(v: LIn) -> LOut {
	var o: LOut;
	o.clip = u.viewProj * vec4f(v.pos, 1.0);
	o.colour = v.colour;
	return o;
}
@fragment fn fsOver(i: LOut) -> @location(0) vec4f { return vec4f(i.colour, 1.0); }
@fragment fn fsLine(i: VOut) -> @location(0) vec4f { return vec4f(i.colour, i.alpha); }
@fragment fn fsId(i: VOut) -> @location(0) u32 { return i.id + 1u; }
// A Decal's or Texture's image on its face: lit as a matte face is, by the
// sun and the sky's fill, through the same air, in its Color3 and Transparency.
@group(1) @binding(0) var image: texture_2d<f32>;
@group(1) @binding(1) var imageSampler: sampler;
struct IOut {
	@builtin(position) clip: vec4f, @location(0) world: vec3f, @location(1) normal: vec3f,
	@location(2) uv: vec2f, @location(3) tint: vec4f,
};
@vertex fn vsImage(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uv: vec2f, @location(3) tint: vec4f) -> IOut {
	var o: IOut;
	o.world = pos;
	o.clip = u.viewProj * vec4f(pos, 1.0);
	o.normal = nrm;
	o.uv = uv;
	o.tint = tint;
	return o;
}
@fragment fn fsImage(i: IOut) -> @location(0) vec4f {
	let t = textureSample(image, imageSampler, i.uv);
	let edge = nearEdge(i.world);
	let wide = fwidth(edge);
	let albedo = pow(t.rgb, vec3f(2.2)) * pow(i.tint.rgb, vec3f(2.2));
	let n = normalize(i.normal);
	let ndl = max(dot(n, u.sun.xyz), 0.0);
	let vis = skyVisibility(i.world, n);
	let sunK = sunSees(i.world, n);
	var lamps = vec3f(0.0);
	if (has(${FEATURE_BIT.pointLights}u | ${FEATURE_BIT.spotLights}u | ${FEATURE_BIT.surfaceLights}u)) { lamps = partLights(i.world, n, n, 1.0).diffuse; }
	let fill = (vec3f(u.fog.w, u.fogColour.w, u.hazeColour.w) + u.ambient.rgb * max(vis, ${SKY_SEEN_LEAST})) * (0.9 + 0.1 * n.y);
	var c = albedo * (fill + u.sunColour.rgb * ndl * sunK + lamps);
	if (has(${FEATURE_BIT.unlit}u)) { c = albedo; }
	let d = length(u.camPos.xyz - i.world);
	c = air(c, d, i.world.y);
	if (u.debug.w > 2.5) { return vec4f(sunMapTint(display(c), i.world, edge, wide), t.a * i.tint.a); }
	return vec4f(display(c), t.a * i.tint.a);
}
// A solid part's Decal or Texture, where it is mostly opaque, into the depth:
// a see-through part behind it is then hidden by it, one in front blends over it.
@fragment fn fsImageDepth(i: IOut) -> @location(0) vec4f {
	if (textureSample(image, imageSampler, i.uv).a * i.tint.a < 0.5) { discard; }
	return vec4f(0.0);
}
// A Decal or Texture in the glow's pass: it covers what glows beneath it.
@fragment fn fsImageVeil(i: IOut) -> @location(0) vec4f {
	return vec4f(0.0, 0.0, 0.0, textureSample(image, imageSampler, i.uv).a * i.tint.a);
}
`;

interface Draw {
	/** The shape's own arrays: a wireframe's edges are found from them. */
	mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array };
	/** Its edges, once a wireframe has asked for them. */
	edges?: { buffer: GPUBuffer; count: number };
	vertices: GPUBuffer;
	indices: GPUBuffer;
	indexCount: number;
	/** 16 bits an index for the shapes made here, 32 for a mesh. */
	format: GPUIndexFormat;
	instances: GPUBuffer;
	count: number;
}

export class WebGpuView implements ViewRenderer {
	readonly backend = "WebGPU" as const;
	private device!: GPUDevice;
	private context!: GPUCanvasContext;
	private format!: GPUTextureFormat;
	private solid!: GPURenderPipeline;
	private solidDepth!: GPURenderPipeline;
	private lines!: GPURenderPipeline;
	private ids!: GPURenderPipeline;
	private over!: GPURenderPipeline;
	private handle!: GPURenderPipeline;
	private skyPipeline!: GPURenderPipeline;
	private lighting!: LightingParams;
	private handleMeshes: {
		kind: (typeof HANDLE_KINDS)[number];
		vertices: GPUBuffer;
		indices: GPUBuffer;
		indexCount: number;
	}[] = [];
	private handleDraws: { mesh: number; buffer: GPUBuffer; count: number }[] = [];
	private overlay: { buffer: GPUBuffer; count: number } | null = null;
	private uniform!: GPUBuffer;
	private bind!: GPUBindGroup;
	private draws: Draw[] = [];
	/** The see-through parts, drawn last and blended, re-sorted as the camera moves. */
	private clear: (Draw & { source: Float32Array; sorted: Float32Array })[] = [];
	private clearEye: number[] | null = null;
	private blended!: GPURenderPipeline;
	/** See-through Glass: its depth first, then its colour, so nothing see-through shows behind it. */
	private glass: Draw[] = [];
	private glassHides = true;
	private scene?: PlaceScene;
	private glassDepth!: GPURenderPipeline;
	private glassBlended!: GPURenderPipeline;
	private glowGlassDepth!: GPURenderPipeline;
	// The glow: what gives light drawn small, blurred, and added over the
	// finished frame, which is drawn into its own texture first for it.
	private glowing = false;
	private glowSolid!: GPURenderPipeline;
	private glowSeen!: GPURenderPipeline;
	private imageVeil!: GPURenderPipeline;
	private down!: GPURenderPipeline;
	private blur!: GPURenderPipeline;
	private bright!: GPURenderPipeline;
	private composite!: GPURenderPipeline;
	private postLayout!: GPUBindGroupLayout;
	private compositeLayout!: GPUBindGroupLayout;
	private compositeGroup?: GPUBindGroup;
	private sampler!: GPUSampler;
	private postParams: GPUBuffer[] = [];
	private frame?: GPUTexture;
	/** The frame blurred across, on its way to being blurred down: a BlurEffect. */
	private frameAcross?: GPUTexture;
	private frameBlurGroups: GPUBindGroup[] = [];
	private blurFrame!: GPURenderPipeline;
	private gradeBuffer!: GPUBuffer;
	private postOn = true;

	setPostEffects(on: boolean): void {
		this.postOn = on;
	}

	/** The Rendering panel's mode and switches: see `RenderSettings`. */
	private render: RenderSettings = DEFAULT_RENDER;
	private heatAdded!: GPURenderPipeline;
	private wire!: GPURenderPipeline;

	setRender(render: RenderSettings): void {
		// Thin parts' switch changes what the near sky maps hold: draw them again.
		if (passesOf(render.features).thinParts !== passesOf(this.render.features).thinParts)
			this.nearCentre = null;
		this.render = render;
	}

	/** This frame's draw calls, instances and triangles, and the last frame's. */
	private tally = { draws: 0, instances: 0, triangles: 0 };
	private lastTally = { draws: 0, instances: 0, triangles: 0 };
	private cpuMs = 0;

	stats(): RenderStats {
		const fx = this.effects?.last;
		return {
			...this.lastTally,
			beams: fx?.beams ?? 0,
			particles: fx?.particles ?? 0,
			cpu: this.cpuMs,
			gpu: this.gpuTimes,
		};
	}

	/** Each draw's instances and triangles, toward the frame's stats. */
	private count(draws: Draw[]): void {
		for (const d of draws) {
			this.tally.instances += d.count;
			this.tally.triangles += (d.count * d.indexCount) / 3;
		}
	}

	/** Wireframe only: each draw's edges, found the first time they are asked for. */
	private edgeCache = new WeakMap<object, Uint32Array>();
	private wires(pass: GPURenderPassEncoder, draws: Draw[]): void {
		for (const draw of draws) {
			if (!draw.edges) {
				let found = this.edgeCache.get(draw.mesh);
				if (!found) {
					found = featureEdges(draw.mesh);
					this.edgeCache.set(draw.mesh, found);
				}
				draw.edges = { buffer: this.make(found, BUFFER.INDEX), count: found.length };
			}
			if (draw.edges.count === 0) continue;
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.edges.buffer, "uint32");
			pass.drawIndexed(draw.edges.count, draw.count);
			this.tally.draws++;
		}
		this.count(draws);
	}

	/**
	 * The GPU's time for each pass, where the browser can time passes: a pair
	 * of stamps a pass, read back a frame or so later and summed by kind.
	 */
	private static readonly STAMPS = 32;
	private timing?: { set: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; busy: boolean };
	private stamps: ("shadows" | "scene" | "post")[] = [];
	private gpuTimes: RenderStats["gpu"] = null;
	private stamp(kind: "shadows" | "scene" | "post"): GPURenderPassTimestampWrites | undefined {
		const t = this.timing;
		if (!t || t.busy || (this.stamps.length + 1) * 2 > WebGpuView.STAMPS) return undefined;
		const at = this.stamps.length * 2;
		this.stamps.push(kind);
		return { querySet: t.set, beginningOfPassWriteIndex: at, endOfPassWriteIndex: at + 1 };
	}
	private readStamps(encoder: GPUCommandEncoder): (() => void) | undefined {
		const t = this.timing;
		const kinds = this.stamps;
		this.stamps = [];
		if (!t || kinds.length === 0) return undefined;
		const bytes = kinds.length * 16;
		encoder.resolveQuerySet(t.set, 0, kinds.length * 2, t.resolve, 0);
		encoder.copyBufferToBuffer(t.resolve, 0, t.read, 0, bytes);
		return () => {
			t.busy = true;
			t.read.mapAsync(MAP_READ, 0, bytes).then(
				() => {
					const ns = new BigUint64Array(t.read.getMappedRange(0, bytes));
					const sum = { shadows: 0, scene: 0, post: 0 };
					kinds.forEach((kind, j) => {
						const took = Number(ns[j * 2 + 1] - ns[j * 2]);
						if (took > 0 && took < 1e9) sum[kind] += took / 1e6;
					});
					t.read.unmap();
					t.busy = false;
					this.gpuTimes = sum;
				},
				() => {
					t.busy = false;
				},
			);
		};
	}
	/** The glow the place's BloomEffect asks for: see `glowShape`. */
	private shape: GlowShape = glowShape(undefined, false);
	/** The glow's width the blur's parameters were last written for. */
	private shapeSpread = -1;
	/** The glow's source at the view's size, resolved, before it is averaged down. */
	private glowFull?: GPUTexture;
	private glow?: {
		a: GPUTexture;
		b: GPUTexture;
		c: GPUTexture;
		groups: GPUBindGroup[];
		/** The bloom's bright-pass: the frame and Neon's glow source. */
		bright: GPUBindGroup;
		w: number;
		h: number;
	};
	private edges!: { vertices: GPUBuffer; indices: GPUBuffer; indexCount: number };
	private selection: { buffer: GPUBuffer; count: number } | null = null;
	private msaa?: GPUTexture;
	private depth?: GPUTexture;
	private pickTarget?: GPUTexture;
	private pickDepth?: GPUTexture;
	private pickRead!: GPUBuffer;
	private width = 1;
	private height = 1;

	private canvas: HTMLCanvasElement | null = null;

	private linesBehind!: GPURenderPipeline;
	private outlineWidth = SELECT_WIDTH;
	private hideBehind = false;

	setOutline(width: number, hideBehind: boolean): void {
		this.outlineWidth = width;
		this.hideBehind = hideBehind;
	}

	setGlassHides(on: boolean): void {
		if (on === this.glassHides) return;
		this.glassHides = on;
		if (this.scene) this.setScene(this.scene);
	}

	/** The outline's width in the canvas's own pixels. */
	private band(): number {
		return this.outlineWidth * (this.width / (this.canvas?.clientWidth || this.width));
	}

	/** The pipelines init asked for, compiling side by side: see pipeline. */
	private compiling: Promise<void>[] = [];

	/**
	 * A pipeline compiled away from the page, put where `set` puts it once it
	 * is: for init's pipelines only, as init waits for them. One the device
	 * turns down is made as before, so it fails as it did.
	 */
	private pipeline(set: (p: GPURenderPipeline) => void, desc: GPURenderPipelineDescriptor): void {
		const d = this.device;
		this.compiling.push(
			d.createRenderPipelineAsync(desc).then(set, () => set(d.createRenderPipeline(desc))),
		);
	}

	/** Waits for the pipelines asked for, telling `progress` the share compiled as each is. */
	private async compiled(progress?: (shaders: number) => void): Promise<void> {
		const all = this.compiling;
		this.compiling = [];
		let done = 0;
		progress?.(0);
		await Promise.all(all.map((p) => p.then(() => progress?.(++done / all.length))));
	}

	async init(
		canvas: HTMLCanvasElement,
		scene: PlaceScene,
		progress?: (shaders: number) => void,
	): Promise<void> {
		this.canvas = canvas;
		const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
		if (!adapter) throw new Error("no WebGPU adapter");
		// Timestamps where the adapter has them, for the Rendering panel's GPU times.
		const timed = adapter.features.has("timestamp-query");
		this.device = await adapter.requestDevice(
			timed ? { requiredFeatures: ["timestamp-query"] } : undefined,
		);
		if (timed) {
			const n = WebGpuView.STAMPS;
			this.timing = {
				set: this.device.createQuerySet({ type: "timestamp", count: n }),
				resolve: this.device.createBuffer({
					size: n * 8,
					usage: BUFFER.QUERY_RESOLVE | BUFFER.COPY_SRC,
				}),
				read: this.device.createBuffer({ size: n * 8, usage: BUFFER.MAP_READ | BUFFER.COPY_DST }),
				busy: false,
			};
		}
		this.context = canvas.getContext("webgpu") as GPUCanvasContext;
		if (!this.context) throw new Error("no WebGPU context");
		this.format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });

		const d = this.device;
		const module = d.createShaderModule({ code: SHADER });
		const buffers: GPUVertexBufferLayout[] = [
			{
				arrayStride: 24,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: "float32x3" },
					{ shaderLocation: 1, offset: 12, format: "float32x3" },
				],
			},
			{
				arrayStride: SCENE_STRIDE * 4,
				stepMode: "instance",
				attributes: [
					{ shaderLocation: 2, offset: 0, format: "float32x3" },
					{ shaderLocation: 3, offset: 12, format: "float32x3" },
					{ shaderLocation: 4, offset: 24, format: "float32x3" },
					{ shaderLocation: 5, offset: 36, format: "float32x3" },
					{ shaderLocation: 6, offset: 48, format: "unorm8x4" },
					{ shaderLocation: 7, offset: 52, format: "uint32" },
					{ shaderLocation: 8, offset: 56, format: "uint32" },
				],
			},
		];
		const layout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, texture: { viewDimension: "2d-array" } },
				{ binding: 2, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 3, visibility: STAGE.FRAGMENT, texture: { viewDimension: "2d-array" } },
				{ binding: 4, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 5, visibility: STAGE.FRAGMENT, texture: {} },
				{
					binding: 6,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				{ binding: 7, visibility: STAGE.FRAGMENT, sampler: { type: "comparison" } },
				{ binding: 8, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 9, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
				{ binding: 10, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
				{ binding: 11, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
				{
					binding: 12,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				{ binding: 13, visibility: STAGE.FRAGMENT, buffer: {} },
			],
		});
		this.layout = layout;
		this.makeSkyMaps(buffers);
		this.setLights(undefined);
		const pipelineLayout = d.createPipelineLayout({ bindGroupLayouts: [layout] });
		const depth = {
			format: "depth32float" as const,
			depthWriteEnabled: true,
			depthCompare: "greater" as const,
		};
		this.pipeline((p) => (this.solidDepth = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fsNothing",
				targets: [{ format: this.format, writeMask: 0 }],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: SAMPLES },
		});
		// Lit only where the pre-pass found it nearest.
		this.pipeline((p) => (this.solid = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fs", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "equal" },
			multisample: { count: SAMPLES },
		});
		// The see-through parts: blended over what is behind them, hidden by
		// what is in front, and hiding nothing themselves.
		this.pipeline((p) => (this.blended = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fs",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: SAMPLES },
		});
		// The heatmaps' see-through parts: each one's share added to what is behind it.
		this.pipeline((p) => (this.heatAdded = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fs",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "one", dstFactor: "one" },
							alpha: { srcFactor: "one", dstFactor: "one" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: SAMPLES },
		});
		// Wireframe only: every edge, those behind others included.
		this.pipeline((p) => (this.wire = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fsWire",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "line-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		// Decals and Textures: blended onto their faces, hidden by what is in
		// front, hiding nothing. Their own vertices, and their image in group 1.
		this.imageLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
			],
		});
		this.imageSampler = d.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});
		this.pipeline((p) => (this.imagePipeline = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fsImage",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: SAMPLES },
		});
		this.pipeline((p) => (this.imageDepth = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fsImageDepth",
				targets: [{ format: this.format, writeMask: 0 }],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
			multisample: { count: SAMPLES },
		});
		this.viewPipelines(module, layout, buffers);
		this.effects = new GpuEffects({
			device: d,
			format: this.format,
			samples: SAMPLES,
			imageLayout: this.imageLayout,
			imageSampler: this.imageSampler,
			pipeline: (set, desc) => this.pipeline(set, desc),
			imageGroup: (asset) => this.imageGroups.get(asset)?.group,
		});
		// See-through Glass: the nearest's depth, then its colour blended at that depth.
		this.pipeline((p) => (this.glassDepth = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fs", targets: [{ format: this.format, writeMask: 0 }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: SAMPLES },
		});
		this.pipeline((p) => (this.glassBlended = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fs",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: {
				format: "depth32float",
				depthWriteEnabled: false,
				depthCompare: "greater-equal",
			},
			multisample: { count: SAMPLES },
		});
		// Over everything, as Studio's selection box is.
		// Through everything, as Studio's selection box is, or hidden by what is in front.
		const line = (set: (p: GPURenderPipeline) => void, depthCompare: GPUCompareFunction) =>
			this.pipeline(set, {
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vsLine", buffers },
				fragment: {
					module,
					entryPoint: "fsLine",
					targets: [
						{
							format: this.format,
							blend: {
								color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
								alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							},
						},
					],
				},
				primitive: { topology: "triangle-list" },
				depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare },
				multisample: { count: SAMPLES },
			});
		line((p) => (this.lines = p), "always");
		line((p) => (this.linesBehind = p), "greater-equal");
		this.pipeline((p) => (this.ids = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsId", targets: [{ format: "r32uint" }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
		});
		this.pipeline((p) => (this.over = p), {
			layout: pipelineLayout,
			vertex: {
				module,
				entryPoint: "vsOver",
				buffers: [
					{
						arrayStride: 24,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
						],
					},
				],
			},
			fragment: { module, entryPoint: "fsOver", targets: [{ format: this.format }] },
			primitive: { topology: "line-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		this.pipeline((p) => (this.handle = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsHandle", buffers },
			fragment: {
				module,
				entryPoint: "fsHandle",
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: SAMPLES },
		});
		this.pipeline((p) => (this.skyPipeline = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsSky", buffers: [] },
			fragment: { module, entryPoint: "fsSky", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		// The glow's passes: the place drawn small in what it gives off, then blurred and added.
		// Half floats, so six passes of blur do not round the glow's fall into steps.
		// Drawn at the view's size, antialiased as the frame is, so a sliver of
		// Neon through a seam glows by as much of a pixel as it covers.
		const glowTarget = { format: this.format };
		const glowSamples = { count: SAMPLES };
		this.pipeline((p) => (this.glowSolid = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlow", targets: [glowTarget] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: glowSamples,
		});
		// Over what is behind it, as in the frame: what glows behind a
		// see-through part is dimmed by it, and a see-through Neon part adds its own.
		const over = {
			color: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const },
			alpha: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const },
		};
		this.pipeline((p) => (this.glowSeen = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: {
				module,
				entryPoint: "fsGlowSeen",
				// What images cover is left as it is: a see-through part is not an image.
				targets: [
					{
						...glowTarget,
						blend: { color: over.color, alpha: { srcFactor: "zero", dstFactor: "one" } },
					},
				],
			},
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: glowSamples,
		});
		this.pipeline((p) => (this.glowGlassDepth = p), {
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlow", targets: [{ ...glowTarget, writeMask: 0 }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: glowSamples,
		});
		// Decals and Textures in the glow's pass: what they cover glows no more.
		this.pipeline((p) => (this.imageVeil = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: { module, entryPoint: "fsImageVeil", targets: [{ ...glowTarget, blend: over }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: glowSamples,
		});
		const post = d.createShaderModule({ code: POST });
		const postEntries: GPUBindGroupLayoutEntry[] = [
			{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
			{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
			{ binding: 2, visibility: STAGE.FRAGMENT, buffer: {} },
		];
		this.postLayout = d.createBindGroupLayout({ entries: postEntries });
		this.compositeLayout = d.createBindGroupLayout({
			entries: [
				...postEntries,
				{ binding: 3, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 4, visibility: STAGE.FRAGMENT, buffer: {} },
				{ binding: 5, visibility: STAGE.FRAGMENT, texture: {} },
			],
		});
		const postPipeline = d.createPipelineLayout({ bindGroupLayouts: [this.postLayout] });
		// Half floats, so the blur's long soft fall does not round into steps.
		const halfTarget = { format: "rgba16float" as const };
		this.pipeline((p) => (this.down = p), {
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsDown", targets: [halfTarget] },
			primitive: { topology: "triangle-list" },
		});
		this.pipeline((p) => (this.blur = p), {
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsBlur", targets: [halfTarget] },
			primitive: { topology: "triangle-list" },
		});
		this.pipeline((p) => (this.bright = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [this.compositeLayout] }),
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: {
				module: post,
				entryPoint: "fsBright",
				targets: [
					{
						...halfTarget,
						blend: {
							color: { srcFactor: "one", dstFactor: "one" },
							alpha: { srcFactor: "one", dstFactor: "one" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list" },
		});
		this.pipeline((p) => (this.composite = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [this.compositeLayout] }),
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsComposite", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
			// Under the selection and the handles, in their pass: see draw.
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		this.sampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		// Across, down, and the strength the glow is added at.
		// The glow's blur across and down, the strength it is added at, and a
		// BlurEffect's blur of the frame across and down.
		// And the bloom's bright-pass: Threshold, exposure, steepness and strength.
		this.postParams = [0, 1, 2, 3, 4, 5, 6, 7].map(() =>
			d.createBuffer({ size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
		);
		this.gradeBuffer = d.createBuffer({ size: 32, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		this.pipeline((p) => (this.blurFrame = p), {
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsBlur", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
		});
		this.uniform = d.createBuffer({
			size: UNIFORM_MATERIALS + MATERIALS.length * 48,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		d.queue.writeBuffer(this.uniform, UNIFORM_MATERIALS, materialBlock());
		this.looks = d.createTexture({
			size: [TEXTURE_SIZE, TEXTURE_SIZE, MATERIAL_TEXTURES.length],
			mipLevelCount: TEXTURE_LEVELS,
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		this.lookSampler = d.createSampler({
			addressModeU: "repeat",
			addressModeV: "repeat",
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
			maxAnisotropy: 4,
		});
		// Clamped, so a face's edge does not wrap round to its other side.
		this.skySampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		this.setSunImage(null);
		this.setSky(null);

		this.setScene(scene);
		const e = boxEdges();
		this.edges = {
			vertices: this.make(e.vertices, BUFFER.VERTEX),
			indices: this.make(e.indices, BUFFER.INDEX),
			indexCount: e.indices.length,
		};
		this.pickRead = d.createBuffer({ size: 256, usage: BUFFER.COPY_DST | BUFFER.MAP_READ });
		for (const kind of HANDLE_KINDS) {
			const m = handleMesh(kind);
			this.handleMeshes.push({
				kind,
				vertices: this.make(m.vertices, BUFFER.VERTEX),
				indices: this.make(m.indices, BUFFER.INDEX),
				indexCount: m.indices.length,
			});
		}
		this.resize(canvas.width, canvas.height);
		await this.compiled(progress);
	}

	setLighting(lighting: LightingParams): void {
		this.lighting = lighting;
		const sun = lighting.sun.join(",");
		if (sun !== this.sunKey) {
			this.sunKey = sun;
			this.sunDirty = true;
		}
	}

	setHandles(handles: Handles): void {
		for (const h of this.handleDraws) h.buffer.destroy();
		this.handleDraws = [];
		this.handleMeshes.forEach((m, mesh) => {
			const data = handles[m.kind];
			const count = data.length / SCENE_STRIDE;
			if (count > 0) this.handleDraws.push({ mesh, buffer: this.make(data, BUFFER.VERTEX), count });
		});
	}

	setScene(scene: PlaceScene): void {
		for (const d of [...this.draws, ...this.clear, ...this.glass]) {
			for (const b of [d.vertices, d.indices, d.instances]) b.destroy();
			d.edges?.buffer.destroy();
		}
		this.scene = scene;
		// The sky's maps again only when the parts moved, not for an edit to Lighting.
		const key = sceneFingerprint(scene);
		if (key !== this.skyKey) {
			this.skyKey = key;
			this.skyDirty = true;
			this.box = sceneBox(scene);
		}
		this.setLights(scene.lights);
		if (this.skyImages && this.sunTexture) this.rebind();
		this.setImages(scene);
		this.effects?.setEffects(scene.effects);
		this.draws = [];
		this.clear = [];
		this.glass = [];
		this.clearEye = null;
		this.glowing = sceneGlows(scene);
		const sets = seeThroughSets(scene, this.glassHides);
		type Rows = { data: Float32Array; count: number };
		const add = (
			mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array },
			solid: Rows,
			seen: Rows,
			glass: Rows,
		) => {
			const shape = () => ({
				mesh,
				vertices: this.make(mesh.vertices, BUFFER.VERTEX),
				indices: this.make(mesh.indices, BUFFER.INDEX),
				indexCount: mesh.indices.length,
				format: (mesh.indices instanceof Uint32Array ? "uint32" : "uint16") as GPUIndexFormat,
			});
			if (glass.count > 0)
				this.glass.push({
					...shape(),
					instances: this.make(glass.data, BUFFER.VERTEX),
					count: glass.count,
				});
			if (solid.count > 0)
				this.draws.push({
					...shape(),
					instances: this.make(solid.data, BUFFER.VERTEX),
					count: solid.count,
				});
			if (seen.count > 0)
				this.clear.push({
					...shape(),
					instances: this.make(seen.data, BUFFER.VERTEX),
					count: seen.count,
					source: seen.data,
					sorted: new Float32Array(seen.data.length),
				});
		};
		for (const kind of SCENE_KINDS) {
			if (kind !== "mesh") {
				add(meshFor(kind), scene.kinds[kind], sets.clear[kind], sets.glass[kind]);
				continue;
			}
			// A MeshPart or FileMesh whose mesh is here draws it; the rest, their box.
			const ready = (slot: number) => this.meshes.has(slot);
			const solid = splitByMesh(scene.kinds.mesh, ready);
			const seen = splitByMesh(sets.clear.mesh, ready);
			const glass = splitByMesh(sets.glass.mesh, ready);
			add(meshFor("mesh"), solid.rest, seen.rest, glass.rest);
			const none = { data: new Float32Array(0), count: 0 };
			for (const [slot, mesh] of this.meshes)
				add(
					mesh,
					solid.meshes.get(slot) ?? none,
					seen.meshes.get(slot) ?? none,
					glass.meshes.get(slot) ?? none,
				);
		}
	}

	/** The meshes rows name, by their place in the scene's list. */
	private meshes: ReadonlyMap<number, MeshGeometry> = new Map();

	setMeshes(meshes: ReadonlyMap<number, MeshGeometry>): void {
		this.meshes = meshes;
		this.skyDirty = true;
		if (this.scene) this.setScene(this.scene);
	}

	/** The see-through parts sorted again when the camera has moved. */
	private sortClear(eye: number[]): void {
		const was = this.clearEye;
		if (was && Math.hypot(eye[0] - was[0], eye[1] - was[1], eye[2] - was[2]) < 0.01) return;
		this.clearEye = [...eye];
		for (const c of this.clear) {
			backToFront(c.source, c.count, eye, c.sorted);
			this.device.queue.writeBuffer(c.instances, 0, c.sorted);
		}
	}

	setOverlay(lines: Float32Array): void {
		this.overlay?.buffer.destroy();
		const count = lines.length / 6;
		this.overlay = count > 0 ? { buffer: this.make(lines, BUFFER.VERTEX), count } : null;
	}

	// Writes are in whole words, and an index list can end halfway through one.
	private make(bytes: ArrayBufferView, usage: number): GPUBuffer {
		const size = Math.max(4, Math.ceil(bytes.byteLength / 4) * 4);
		const b = this.device.createBuffer({ size, usage: usage | BUFFER.COPY_DST });
		const padded = new Uint8Array(size);
		padded.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		this.device.queue.writeBuffer(b, 0, padded);
		return b;
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		for (const t of [
			this.msaa,
			this.depth,
			this.pickTarget,
			this.pickDepth,
			this.frame,
			this.frameAcross,
			this.glowFull,
		])
			t?.destroy();
		const size = [this.width, this.height];
		const d = this.device;
		this.msaa = d.createTexture({
			size,
			sampleCount: SAMPLES,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		this.depth = d.createTexture({
			size,
			sampleCount: SAMPLES,
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		// The place drawn and resolved, for the glow to be added to, and the
		// glow's own source, resolved the same way.
		this.frame = d.createTexture({
			size,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		this.glowFull = d.createTexture({
			size,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		this.frameAcross = d.createTexture({
			size,
			format: this.format,
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		const blurGroup = (tex: GPUTexture, params: GPUBuffer) =>
			d.createBindGroup({
				layout: this.postLayout,
				entries: [
					{ binding: 0, resource: tex.createView() },
					{ binding: 1, resource: this.sampler },
					{ binding: 2, resource: { buffer: params } },
				],
			});
		this.frameBlurGroups = [
			blurGroup(this.frame, this.postParams[3]),
			blurGroup(this.frameAcross, this.postParams[4]),
		];
		// Its bind groups name the source just made: made again with it.
		for (const t of [this.glow?.a, this.glow?.b, this.glow?.c]) t?.destroy();
		this.glow = undefined;
		this.pickTarget = d.createTexture({
			size,
			format: "r32uint",
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.COPY_SRC,
		});
		this.pickDepth = d.createTexture({
			size,
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		this.sizeGlow();
		this.compositeGroup = d.createBindGroup({
			layout: this.compositeLayout,
			entries: [
				{ binding: 0, resource: this.glow!.a.createView() },
				{ binding: 1, resource: this.sampler },
				{ binding: 2, resource: { buffer: this.postParams[2] } },
				{ binding: 3, resource: this.frame.createView() },
				{ binding: 4, resource: { buffer: this.gradeBuffer } },
				{ binding: 5, resource: this.glow!.c.createView() },
			],
		});
	}

	/** The glow's targets, half the view's size, and what reads them. */
	private sizeGlow(): void {
		const w = Math.max(1, Math.round(this.width / 2));
		const h = Math.max(1, Math.round(this.height / 2));
		if (this.glow && this.glow.w === w && this.glow.h === h) return;
		const d = this.device;
		for (const t of [this.glow?.a, this.glow?.b, this.glow?.c]) t?.destroy();
		const target = () =>
			d.createTexture({
				size: [w, h],
				format: "rgba16float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		const a = target();
		const b = target();
		const c = target();
		this.shapeSpread = -1;
		const group = (tex: GPUTexture, params: GPUBuffer) =>
			d.createBindGroup({
				layout: this.postLayout,
				entries: [
					{ binding: 0, resource: tex.createView() },
					{ binding: 1, resource: this.sampler },
					{ binding: 2, resource: { buffer: params } },
				],
			});
		// The source averaged down into A, A across into B, and B down into A,
		// which is added over the frame.
		// The source down to a; blurred narrow across into b and down into a;
		// then a blurred on across into b and down into c, the wide blur.
		const groups = [
			group(this.glowFull!, this.postParams[0]),
			group(a, this.postParams[0]),
			group(b, this.postParams[1]),
			group(a, this.postParams[5]),
			group(b, this.postParams[6]),
		];
		// The bloom's bright-pass: Neon's glow source and the finished frame.
		const bright = d.createBindGroup({
			layout: this.compositeLayout,
			entries: [
				{ binding: 0, resource: this.glowFull!.createView() },
				{ binding: 1, resource: this.sampler },
				{ binding: 2, resource: { buffer: this.postParams[7] } },
				{ binding: 3, resource: this.frame!.createView() },
				{ binding: 4, resource: { buffer: this.gradeBuffer } },
				{ binding: 5, resource: c.createView() },
			],
		});
		this.glow = { a, b, c, groups, bright, w, h };
	}

	/**
	 * The place drawn in the light it gives off, under the see-through parts
	 * and the Decals and Textures that cover it, in the frame's own targets
	 * before the frame is; then averaged down to half and blurred both ways.
	 */
	private drawGlow(encoder: GPUCommandEncoder): void {
		const glow = this.glow;
		if (!glow || !this.glowFull) return;
		const pass = encoder.beginRenderPass({
			timestampWrites: this.stamp("post"),
			colorAttachments: [
				{
					view: this.msaa!.createView(),
					resolveTarget: this.glowFull.createView(),
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "discard",
				},
			],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.glowSolid);
		this.solids(pass);
		if (this.glass.length > 0) {
			pass.setPipeline(this.glowGlassDepth);
			this.solids(pass, this.glass);
		}
		if (this.clear.length > 0) {
			pass.setPipeline(this.glowSeen);
			this.solids(pass, this.clear);
		}
		this.veilImages(pass);
		pass.end();
		this.glowSteps(encoder, [[this.down, 0, glow.a, false]]);
	}

	/**
	 * The glow blurred, once the place is drawn: narrow across and down, then on
	 * to the wide; with `bloom`, the finished frame's bright-pass added to its
	 * source first.
	 */
	private blurGlow(encoder: GPUCommandEncoder, bloom: boolean): void {
		const glow = this.glow;
		if (!glow) return;
		const steps: [GPURenderPipeline, number, GPUTexture, boolean][] = [];
		if (bloom) steps.push([this.bright, -1, glow.a, true]);
		steps.push([this.blur, 1, glow.b, false], [this.blur, 2, glow.a, false]);
		steps.push([this.blur, 3, glow.b, false], [this.blur, 4, glow.c, false]);
		this.glowSteps(encoder, steps);
	}

	private glowSteps(
		encoder: GPUCommandEncoder,
		steps: readonly (readonly [GPURenderPipeline, number, GPUTexture, boolean])[],
	): void {
		const glow = this.glow;
		if (!glow) return;
		for (const [pipeline, from, into, add] of steps) {
			const step = encoder.beginRenderPass({
				timestampWrites: this.stamp("post"),
				colorAttachments: [
					{
						view: into.createView(),
						loadOp: add ? "load" : "clear",
						storeOp: "store",
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
					},
				],
			});
			step.setPipeline(pipeline);
			step.setBindGroup(0, from < 0 ? glow.bright : glow.groups[from]);
			step.draw(3);
			step.end();
		}
	}

	/** A BlurEffect: the frame blurred across into its spare, and back down into itself. */
	private blurTheFrame(encoder: GPUCommandEncoder): void {
		const size = this.lighting?.post.blur ?? 0;
		if (size <= 0 || !this.frame || !this.frameAcross) return;
		const sigma = blurSigma(size, this.height);
		const q = this.device.queue;
		q.writeBuffer(this.postParams[3], 0, new Float32Array([1 / this.width, 0, 0, sigma]));
		q.writeBuffer(this.postParams[4], 0, new Float32Array([0, 1 / this.height, 0, sigma]));
		for (const [from, into] of [
			[0, this.frameAcross],
			[1, this.frame],
		] as const) {
			const step = encoder.beginRenderPass({
				timestampWrites: this.stamp("post"),
				colorAttachments: [
					{
						view: into.createView(),
						loadOp: "clear",
						storeOp: "store",
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
					},
				],
			});
			step.setPipeline(this.blurFrame);
			step.setBindGroup(0, this.frameBlurGroups[from]);
			step.draw(3);
			step.end();
		}
	}

	setSelection(boxes: Float32Array): void {
		this.selection?.buffer.destroy();
		const count = boxes.length / SCENE_STRIDE;
		this.selection = count > 0 ? { buffer: this.make(boxes, BUFFER.VERTEX), count } : null;
	}

	private setCamera(camera: Camera): void {
		const vp = multiply(
			perspective(FOV, this.width / this.height, camera.near, camera.far, true, true),
			lookAt(camera.eye, camera.at),
		);
		const u = new Float32Array(UNIFORM_MATERIALS / 4);
		u.set(vp, 0);
		u.set(invert(vp), 16);
		u.set(lightingBlock(this.lighting, camera.eye, SELECT, HANDLE_ALPHA), 32);
		const skyImages = this.skyOn && passesOf(this.render.features).skyImages;
		const sky = skyImages ? (this.lighting.skyboxSun ? 2 : 1) : 0;
		u.set([this.width, this.height, this.band(), sky], 76);
		u.set(this.shape.gate, 80);
		u.set(renderDebug(this.render), 84);
		this.device.queue.writeBuffer(this.uniform, 0, u);
	}

	private solids(pass: GPURenderPassEncoder, draws: Draw[] = this.draws): void {
		this.tally.draws += draws.length;
		for (const draw of draws) {
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.indices, draw.format);
			pass.drawIndexed(draw.indexCount, draw.count);
		}
	}

	draw(camera: Camera): void {
		const started = performance.now();
		this.tally = { draws: 0, instances: 0, triangles: 0 };
		const { mode } = this.render;
		const show = passesOf(this.render.features);
		const heat = sharesView(mode);
		const wire = mode === "wireframe";
		// The heatmaps and the wireframe are the place's shapes alone; the sun
		// maps' tints are left as they are drawn.
		const tinted = mode === "sunMaps";
		const postOn = this.postOn && show.post && !heat && !wire && !tinted;
		this.shape = glowShape(this.lighting?.post, postOn);
		this.setCamera(camera);
		const encoder = this.device.createCommandEncoder();
		const partsMoved = this.skyDirty;
		const centre = nearSkyCentre(camera.eye);
		const nearMoved = !this.nearCentre || centre.some((v, a) => v !== this.nearCentre![a]);
		if (this.skyDirty || this.sunDirty || nearMoved)
			this.drawSkyMaps(
				encoder,
				{
					far: this.skyDirty,
					sun: this.skyDirty || this.sunDirty,
					near: this.skyDirty || nearMoved,
				},
				centre,
			);
		this.drawCascades(encoder, camera, partsMoved);
		const screen = this.context.getCurrentTexture().createView();
		// A BloomEffect blooms the whole picture, Neon or not: see fsBright.
		const bloom = postOn && !!this.lighting?.post.bloom && show.glow && !heat && !wire && !tinted;
		const glowing =
			(this.glowing || bloom) && !!this.glow && show.glow && !heat && !wire && !tinted;
		const post = postActive(this.lighting?.post, postOn);
		// The place is drawn into its own texture first when anything is added
		// to it after: Neon's glow, or a post effect; or a heatmap's colours.
		const glow = glowing || post || heat ? this.compositeGroup : undefined;
		const q = this.device.queue;
		q.writeBuffer(
			this.postParams[2],
			0,
			new Float32Array([0, 0, glowing ? this.shape.gain : 0, sharesComposite(mode)]),
		);
		if (this.glow && this.shapeSpread !== this.shape.spread) {
			const { w, h } = this.glow;
			const spread = glowSpread(h, this.shape);
			// The narrow blur, then what takes it on to the wide one.
			const narrow = spread * GLOW_NARROW.width;
			const more = spread * Math.sqrt(GLOW_WIDE.width ** 2 - GLOW_NARROW.width ** 2);
			q.writeBuffer(this.postParams[0], 0, new Float32Array([1 / w, 0, 0, narrow]));
			q.writeBuffer(this.postParams[1], 0, new Float32Array([0, 1 / h, 0, narrow]));
			q.writeBuffer(this.postParams[5], 0, new Float32Array([1 / w, 0, 0, more]));
			q.writeBuffer(this.postParams[6], 0, new Float32Array([0, 1 / h, 0, more]));
			this.shapeSpread = this.shape.spread;
		}
		q.writeBuffer(this.gradeBuffer, 0, gradeBlock(this.lighting?.post, postOn));
		if (glowing) {
			if (this.clear.length > 0) this.sortClear(camera.eye);
			this.drawGlow(encoder);
		}
		let pass = encoder.beginRenderPass({
			timestampWrites: this.stamp("scene"),
			colorAttachments: [
				{
					view: this.msaa!.createView(),
					resolveTarget: glow ? this.frame!.createView() : screen,
					clearValue: heat
						? { r: 0, g: 0, b: 0, a: 1 }
						: wire
							? { r: 0.06, g: 0.07, b: 0.09, a: 1 }
							: show.sky
								? { r: 0.56, g: 0.71, b: 0.86, a: 1 }
								: { r: 0.16, g: 0.17, b: 0.19, a: 1 },
					loadOp: "clear",
					storeOp: "discard",
				},
			],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: glow ? "store" : "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		const images = show.images && !heat;
		if (show.sky && !heat && !wire) {
			pass.setPipeline(this.skyPipeline);
			pass.draw(3);
		}
		if (wire) {
			pass.setPipeline(this.wire);
			this.wires(
				pass,
				show.seeThrough ? [...this.draws, ...this.glass, ...this.clear] : this.draws,
			);
			// The wireframe is the place's shapes alone: no effects, and nothing to animate.
			this.drawEffects(pass, camera);
		} else if (mode === "overdraw") {
			this.drawOverdraw(pass, camera);
		} else if (mode === "density") {
			this.drawDensity(pass);
			// None drawn: the parts alone; this only clears the last frame's count.
			this.drawEffects(pass, camera);
		} else {
			pass.setPipeline(this.solidDepth);
			this.solids(pass);
			pass.setPipeline(this.solid);
			this.solids(pass);
			this.count(this.draws);
			if (images) this.drawImages(pass, "solid", camera.eye);
			if (show.seeThrough && heat) {
				// Each see-through layer adds its own share, Glass's included.
				pass.setPipeline(this.heatAdded);
				this.solids(pass, this.glass);
				this.solids(pass, this.clear);
				this.count(this.glass);
				this.count(this.clear);
			} else if (show.seeThrough) {
				if (this.glass.length > 0) {
					pass.setPipeline(this.glassDepth);
					this.solids(pass, this.glass);
					pass.setPipeline(this.glassBlended);
					this.solids(pass, this.glass);
					this.count(this.glass);
				}
				if (this.clear.length > 0) {
					this.sortClear(camera.eye);
					pass.setPipeline(this.blended);
					this.solids(pass, this.clear);
					this.count(this.clear);
				}
			}
			// Over the see-through parts they are on.
			if (images) this.drawImages(pass, "seeThrough", camera.eye);
			// Beams and particles, over everything see-through, farthest first.
			this.drawEffects(pass, camera);
		}
		// The glow is part of the place, added once the place is drawn; what
		// marks the place goes over it, against the place's own depth.
		if (glow) {
			pass.end();
			if (glowing) {
				const b = this.lighting?.post.bloom;
				q.writeBuffer(
					this.postParams[7],
					0,
					new Float32Array([bloomStart(b?.threshold ?? 2), 0, BLOOM_STEEP, BLOOM_STRENGTH]),
				);
				this.blurGlow(encoder, bloom);
			}
			if (post) this.blurTheFrame(encoder);
			pass = encoder.beginRenderPass({
				timestampWrites: this.stamp("post"),
				colorAttachments: [
					{
						view: this.msaa!.createView(),
						resolveTarget: screen,
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						loadOp: "clear",
						storeOp: "discard",
					},
				],
				depthStencilAttachment: {
					view: this.depth!.createView(),
					depthLoadOp: "load",
					depthStoreOp: "discard",
				},
			});
			pass.setPipeline(this.composite);
			pass.setBindGroup(0, glow);
			pass.draw(3);
			pass.setBindGroup(0, this.bind);
		}
		if (this.selection) {
			pass.setPipeline(this.hideBehind ? this.linesBehind : this.lines);
			pass.setVertexBuffer(0, this.edges.vertices);
			pass.setVertexBuffer(1, this.selection.buffer);
			pass.setIndexBuffer(this.edges.indices, "uint16");
			pass.drawIndexed(this.edges.indexCount, this.selection.count);
		}
		if (this.handleDraws.length > 0) {
			pass.setPipeline(this.handle);
			for (const h of this.handleDraws) {
				const m = this.handleMeshes[h.mesh];
				pass.setVertexBuffer(0, m.vertices);
				pass.setVertexBuffer(1, h.buffer);
				pass.setIndexBuffer(m.indices, "uint16");
				pass.drawIndexed(m.indexCount, h.count);
			}
		}
		if (this.overlay) {
			pass.setPipeline(this.over);
			pass.setVertexBuffer(0, this.overlay.buffer);
			pass.draw(this.overlay.count);
		}
		pass.end();
		const read = this.readStamps(encoder);
		this.device.queue.submit([encoder.finish()]);
		read?.();
		this.lastTally = this.tally;
		this.cpuMs = performance.now() - started;
	}

	settled(): Promise<void> {
		return this.device.queue.onSubmittedWorkDone();
	}

	/** The place's Beams and ParticleEmitters: see `effectsGpu.ts`. */
	private effects?: GpuEffects;

	private drawEffects(pass: GPURenderPassEncoder, camera: Camera): void {
		const fx = this.effects;
		if (!fx) return;
		const show = passesOf(this.render.features);
		const on = { beams: show.beams, particles: show.particles };
		fx.draw(
			pass,
			camera,
			this.width,
			this.height,
			this.lighting,
			this.render,
			on,
			performance.now() / 1000,
		);
		if (fx.last.draws === 0) return;
		pass.setBindGroup(0, this.bind);
		this.tally.draws += fx.last.draws;
		this.tally.triangles += fx.last.quads * 2;
	}

	animates(): boolean {
		return this.effects?.last.moving ?? false;
	}

	// The Overdraw and Triangle density views: see renderViews.ts.
	private countSolid?: GPURenderPipeline;
	private imageCount?: GPURenderPipeline;
	private density?: GPURenderPipeline;
	private densityLayout!: GPUBindGroupLayout;
	private densityTris?: { buffer: GPUBuffer; group: GPUBindGroup; room: number };

	/** The views' pipelines: overdraw's counts, added up, and triangle density's colours. */
	private viewPipelines(
		module: GPUShaderModule,
		layout: GPUBindGroupLayout,
		buffers: GPUVertexBufferLayout[],
	): void {
		const d = this.device;
		const added: GPUColorTargetState = {
			format: this.format,
			blend: {
				color: { srcFactor: "one", dstFactor: "one" },
				alpha: { srcFactor: "one", dstFactor: "one" },
			},
		};
		// Every fragment of the solid parts, as the depth pre-pass draws them, before its depth test.
		this.pipeline((p) => (this.countSolid = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsCount", targets: [added] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		// Every fragment of an image in front of the solid parts.
		this.pipeline((p) => (this.imageCount = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsImage",
				buffers: [
					{
						arrayStride: IMAGE_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x3" },
							{ shaderLocation: 2, offset: 24, format: "float32x2" },
							{ shaderLocation: 3, offset: 32, format: "float32x4" },
						],
					},
				],
			},
			fragment: { module, entryPoint: "fsCount", targets: [added] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: SAMPLES },
		});
		// Each draw's triangles, at its own offset: a draw is one mesh.
		this.densityLayout = d.createBindGroupLayout({
			entries: [
				{
					binding: 2,
					visibility: STAGE.VERTEX,
					buffer: { hasDynamicOffset: true, minBindingSize: 16 },
				},
			],
		});
		this.pipeline((p) => (this.density = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout, this.densityLayout] }),
			vertex: { module, entryPoint: "vsDensity", buffers },
			fragment: { module, entryPoint: "fsDensity", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "greater" },
			multisample: { count: SAMPLES },
		});
	}

	/**
	 * Overdraw: every fragment of the solid parts, as the depth pre-pass draws
	 * them before its depth test hides any; then, in front of them, each
	 * see-through part, image, beam and particle; each adding one.
	 */
	private drawOverdraw(pass: GPURenderPassEncoder, camera: Camera): void {
		const show = passesOf(this.render.features);
		if (!this.countSolid || !this.imageCount) return;
		pass.setPipeline(this.countSolid);
		this.solids(pass);
		pass.setPipeline(this.solidDepth);
		this.solids(pass);
		this.count(this.draws);
		if (show.images) this.drawImages(pass, "solid", camera.eye, this.imageCount);
		if (show.seeThrough) {
			pass.setPipeline(this.heatAdded);
			this.solids(pass, this.glass);
			this.solids(pass, this.clear);
			this.count(this.glass);
			this.count(this.clear);
		}
		if (show.images) this.drawImages(pass, "seeThrough", camera.eye, this.imageCount);
		this.drawEffects(pass, camera);
	}

	/**
	 * Triangle density: every part, see-through ones as if solid, coloured by
	 * its mesh's triangles against its size (vsDensity).
	 */
	private drawDensity(pass: GPURenderPassEncoder): void {
		const all = passesOf(this.render.features).seeThrough
			? [...this.draws, ...this.glass, ...this.clear]
			: this.draws;
		if (!this.density || all.length === 0) return;
		// A slot a draw, at the 256 bytes dynamic offsets keep to.
		const slot = 256;
		const d = this.device;
		if (!this.densityTris || this.densityTris.room < all.length) {
			this.densityTris?.buffer.destroy();
			const room = Math.max(all.length, (this.densityTris?.room ?? 0) * 2, 64);
			const buffer = d.createBuffer({ size: room * slot, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			const group = d.createBindGroup({
				layout: this.densityLayout,
				entries: [{ binding: 2, resource: { buffer, size: 16 } }],
			});
			this.densityTris = { buffer, group, room };
		}
		const tris = new Float32Array((all.length * slot) / 4);
		all.forEach((draw, k) => {
			tris[(k * slot) / 4] = draw.indexCount / 3;
		});
		d.queue.writeBuffer(this.densityTris.buffer, 0, tris);
		pass.setPipeline(this.density);
		this.tally.draws += all.length;
		all.forEach((draw, k) => {
			pass.setBindGroup(1, this.densityTris!.group, [k * slot]);
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.indices, draw.format);
			pass.drawIndexed(draw.indexCount, draw.count);
		});
		this.count(all);
	}

	private imageLayout!: GPUBindGroupLayout;
	private imageSampler!: GPUSampler;
	private imagePipeline!: GPURenderPipeline;
	private imageDepth!: GPURenderPipeline;
	private imageVertices: GPUBuffer | null = null;
	private imageList: ImageQuad[] = [];
	private imageGroups = new Map<string, { texture: GPUTexture; group: GPUBindGroup }>();

	/** The scene's Decals and Textures, as triangles grouped by image. */
	private setImages(scene: PlaceScene): void {
		this.imageVertices?.destroy();
		this.imageVertices = null;
		const { vertices, quads } = imageQuads(scene.images ?? []);
		this.imageList = quads;
		if (vertices.length === 0) return;
		this.imageVertices = this.device.createBuffer({
			size: vertices.byteLength,
			usage: BUFFER.VERTEX | BUFFER.COPY_DST,
		});
		this.device.queue.writeBuffer(this.imageVertices, 0, vertices);
	}

	setImage(asset: string, image: ImageBitmap): void {
		if (this.imageGroups.has(asset)) return;
		const texture = this.device.createTexture({
			size: [image.width, image.height],
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		this.device.queue.copyExternalImageToTexture(
			{ source: image },
			{ texture, premultipliedAlpha: false },
			[image.width, image.height],
		);
		const group = this.device.createBindGroup({
			layout: this.imageLayout,
			entries: [
				{ binding: 0, resource: texture.createView() },
				{ binding: 1, resource: this.imageSampler },
			],
		});
		this.imageGroups.set(asset, { texture, group });
	}

	/** One layer's images whose texture has arrived, onto their faces, farthest first. */
	private drawImages(
		pass: GPURenderPassEncoder,
		layer: ImageLayer,
		eye: number[],
		colour: GPURenderPipeline = this.imagePipeline,
	): void {
		if (!this.imageVertices || this.imageList.length === 0) return;
		const order = imageOrder(this.imageList, layer, eye, (asset) => this.imageGroups.has(asset));
		if (order.length === 0) return;
		pass.setVertexBuffer(0, this.imageVertices);
		// The solid parts' images then go into the depth, for the see-through parts drawn after.
		for (const pipeline of layer === "solid" ? [colour, this.imageDepth] : [colour]) {
			pass.setPipeline(pipeline);
			let bound = "";
			for (const q of order) {
				const asset = this.imageList[q].asset;
				if (asset !== bound) {
					pass.setBindGroup(1, this.imageGroups.get(asset)!.group);
					bound = asset;
				}
				pass.draw(6, 1, q * 6);
			}
		}
	}

	/** Every image whose texture has arrived, over what glows, in the glow's pass. */
	private veilImages(pass: GPURenderPassEncoder): void {
		if (!this.imageVertices || this.imageList.length === 0) return;
		pass.setPipeline(this.imageVeil);
		pass.setVertexBuffer(0, this.imageVertices);
		this.imageList.forEach((quad, q) => {
			const held = this.imageGroups.get(quad.asset);
			if (!held) return;
			pass.setBindGroup(1, held.group);
			pass.draw(6, 1, q * 6);
		});
	}

	private looks!: GPUTexture;
	private loaded = new Set<number>();
	private layout!: GPUBindGroupLayout;
	private lookSampler!: GPUSampler;
	private skySampler!: GPUSampler;
	private skyImages?: GPUTexture;
	private skyOn = false;

	setSky(faces: readonly ImageBitmap[] | null): void {
		const d = this.device;
		this.skyImages?.destroy();
		const [w, h] = faces ? [faces[0].width, faces[0].height] : [1, 1];
		this.skyImages = d.createTexture({
			size: [w, h, 6],
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		faces?.forEach((source, layer) => {
			d.queue.copyExternalImageToTexture(
				{ source },
				{ texture: this.skyImages!, origin: [0, 0, layer], premultipliedAlpha: false },
				[w, h],
			);
		});
		this.skyOn = faces !== null;
		this.rebind();
	}

	private sunTexture?: GPUTexture;

	setSunImage(image: ImageBitmap | null): void {
		const d = this.device;
		this.sunTexture?.destroy();
		const [w, h] = image ? [image.width, image.height] : [1, 1];
		this.sunTexture = d.createTexture({
			size: [w, h],
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		if (image)
			d.queue.copyExternalImageToTexture(
				{ source: image },
				{ texture: this.sunTexture, premultipliedAlpha: false },
				[w, h],
			);
		if (this.skyImages) this.rebind();
	}

	/** The shaders' textures and samplers, made again when one is replaced. */
	private rebind(): void {
		this.bind = this.device.createBindGroup({
			layout: this.layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: this.looks.createView({ dimension: "2d-array" }) },
				{ binding: 2, resource: this.lookSampler },
				{ binding: 3, resource: this.skyImages!.createView({ dimension: "2d-array" }) },
				{ binding: 4, resource: this.skySampler },
				{ binding: 5, resource: this.sunTexture!.createView() },
				{ binding: 6, resource: this.skyMaps.createView({ dimension: "2d-array" }) },
				{ binding: 7, resource: this.skyCompare },
				{ binding: 8, resource: { buffer: this.skyUniform } },
				{ binding: 9, resource: { buffer: this.lightBuffers.data } },
				{ binding: 10, resource: { buffer: this.lightBuffers.table } },
				{ binding: 11, resource: { buffer: this.lightBuffers.index } },
				{ binding: 12, resource: this.sunMaps.createView({ dimension: "2d-array" }) },
				{ binding: 13, resource: { buffer: this.cascadeUniform } },
			],
		});
	}

	// -- sky visibility: see skyBlock ------------------------------------------------

	private skyMaps!: GPUTexture;
	private skyCompare!: GPUSampler;
	private skyUniform!: GPUBuffer;
	private skyDepth!: GPURenderPipeline;
	private skyViewGroups: { buffer: GPUBuffer; group: GPUBindGroup }[] = [];
	/** All the maps are drawn again before the next frame: the parts moved. */
	private skyDirty = true;
	/** The sun's map alone is drawn again: the sun moved. */
	private sunDirty = true;
	/** Where the near maps were last drawn round: see nearSkyCentre. */
	private nearCentre: number[] | null = null;
	private skyKey = -1;
	private sunKey = "";
	private lightKey = -1;
	/** The place's lights and the grid that finds them: see lightGrid. */
	private lightBuffers!: { data: GPUBuffer; table: GPUBuffer; index: GPUBuffer };

	private setLights(lights: readonly number[] | undefined): void {
		const d = this.device;
		// The same lights again, after an edit elsewhere: the grid already holds them.
		const key = fingerprint(lights);
		if (key === this.lightKey && this.lightKey !== -1) return;
		this.lightKey = key;
		const old = this.lightBuffers;
		const grid = lightGridFor(lights);
		const store = (data: Float32Array | Uint32Array) => {
			const buffer = d.createBuffer({
				size: Math.max(16, data.byteLength),
				usage: BUFFER.STORAGE | BUFFER.COPY_DST,
			});
			d.queue.writeBuffer(buffer, 0, data);
			return buffer;
		};
		this.lightBuffers = {
			data: store(new Float32Array(lights && lights.length > 0 ? lights : [0, 0, 0, 0])),
			table: store(grid.table),
			index: store(grid.index),
		};
		if (old) for (const b of [old.data, old.table, old.index]) b.destroy();
	}

	private makeSkyMaps(buffers: GPUVertexBufferLayout[]): void {
		const d = this.device;
		this.skyMaps = d.createTexture({
			size: [SKY_MAP, SKY_MAP, SKY_LAYERS],
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		this.skyCompare = d.createSampler({
			compare: "less-equal",
			magFilter: "linear",
			minFilter: "linear",
		});
		this.skyUniform = d.createBuffer({
			size: SKY_BLOCK * 4,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		const layout = d.createBindGroupLayout({
			entries: [{ binding: 0, visibility: STAGE.VERTEX, buffer: {} }],
		});
		const module = d.createShaderModule({
			code: `struct D { viewProj: mat4x4f };
@group(0) @binding(0) var<uniform> d: D;
struct VIn { @location(0) pos: vec3f, @location(2) c0: vec3f, @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) p: vec3f, @location(8) look: u32 };
@vertex fn vsDepth(v: VIn) -> @builtin(position) vec4f {
	// A part with CastShadow off (NO_SHADOW) is left out, past the far plane.
	if ((v.look & 0x80000000u) != 0u) { return vec4f(0.0, 0.0, 2.0, 1.0); }
	return d.viewProj * vec4f(mat3x3f(v.c0, v.c1, v.c2) * v.pos + v.p, 1.0);
}`,
		});
		this.pipeline((p) => (this.skyDepth = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
			vertex: { module, entryPoint: "vsDepth", buffers },
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
		});
		this.sunMaps = d.createTexture({
			size: [CASCADE_MAP, CASCADE_MAP, SUN_CASCADES.length],
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
		});
		this.cascadeUniform = d.createBuffer({
			size: CASCADE_BLOCK * 4,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		this.cascadeGroups = SUN_CASCADES.map(() => {
			const buffer = d.createBuffer({ size: 64, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			return {
				buffer,
				group: d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] }),
			};
		});
		this.skyViewGroups = Array.from({ length: SKY_LAYERS }, () => {
			const buffer = d.createBuffer({ size: 64, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
			return {
				buffer,
				group: d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] }),
			};
		});
		this.makeSkyOpen();
	}

	// -- the near sky maps opened: thin occluders taken out ---------------------------

	/** Two float scratch maps, and each pass's pipeline and bind groups. */
	private skyOpen?: {
		fromDepth: GPURenderPipeline;
		float: GPURenderPipeline;
		toDepth: GPURenderPipeline;
		scratch: [GPUTexture, GPUTexture];
		/** Pass 1 a near layer: its own depth into scratch 0. */
		first: GPUBindGroup[];
		/** Passes 2, 3 and 4: scratch 0 into 1, 1 into 0, 0 into the layer. */
		rest: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
	};

	/**
	 * Opening each near sky map (the farthest depth over a few texels, then the
	 * nearest): what is thinner than SKY_OPEN studs across, seen from the sky,
	 * no longer hides it, as Studio's coarse lighting lets the sky past window
	 * struts and rails; walls, floors and roofs still do.
	 */
	private makeSkyOpen(): void {
		const d = this.device;
		const module = d.createShaderModule({
			code: /* wgsl */ `
@group(0) @binding(0) var srcDepth: texture_depth_2d_array;
@group(0) @binding(1) var srcFloat: texture_2d<f32>;
// The step across the map, how many texels either side, and 1 for the nearest.
@group(0) @binding(2) var<uniform> f: vec4f;
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	return vec4f(xy, 0.0, 1.0);
}
fn texelAt(c: vec2i) -> vec2i { return clamp(c, vec2i(0), vec2i(${SKY_MAP - 1})); }
@fragment fn fsFromDepth(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let c = vec2i(pos.xy);
	let st = vec2i(f.xy);
	let r = i32(f.z);
	var m = 0.0;
	for (var j = -r; j <= r; j++) { m = max(m, textureLoad(srcDepth, texelAt(c + st * j), 0, 0)); }
	return vec4f(m, 0.0, 0.0, 1.0);
}
fn along(pos: vec4f) -> f32 {
	let c = vec2i(pos.xy);
	let st = vec2i(f.xy);
	let r = i32(f.z);
	let least = f.w > 0.5;
	var m = select(0.0, 2.0, least);
	for (var j = -r; j <= r; j++) {
		let v = textureLoad(srcFloat, texelAt(c + st * j), 0).r;
		m = select(max(m, v), min(m, v), least);
	}
	return m;
}
@fragment fn fsFloat(@builtin(position) pos: vec4f) -> @location(0) vec4f { return vec4f(along(pos), 0.0, 0.0, 1.0); }
@fragment fn fsToDepth(@builtin(position) pos: vec4f) -> @builtin(frag_depth) f32 { return along(pos); }
`,
		});
		const layout = d.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: STAGE.FRAGMENT,
					texture: { sampleType: "depth", viewDimension: "2d-array" },
				},
				{ binding: 1, visibility: STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
				{ binding: 2, visibility: STAGE.FRAGMENT, buffer: {} },
			],
		});
		const pipelineLayout = d.createPipelineLayout({ bindGroupLayouts: [layout] });
		const toFloat = (entryPoint: string) =>
			d.createRenderPipeline({
				layout: pipelineLayout,
				vertex: { module, entryPoint: "vsFull" },
				fragment: { module, entryPoint, targets: [{ format: "r32float" }] },
				primitive: { topology: "triangle-list" },
			});
		const toDepth = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsFull" },
			fragment: { module, entryPoint: "fsToDepth", targets: [] },
			primitive: { topology: "triangle-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "always" },
		});
		const scratch = [0, 1].map(() =>
			d.createTexture({
				size: [SKY_MAP, SKY_MAP],
				format: "r32float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			}),
		) as [GPUTexture, GPUTexture];
		// SKY_OPEN studs across, as near maps' texels: see nearSkyInto.
		const texel = (2 * SKY_NEAR * 1.75) / SKY_MAP;
		const r = Math.max(1, Math.round(SKY_OPEN / 2 / texel));
		const uniform = (v: number[]) => this.make(new Float32Array(v), BUFFER.UNIFORM);
		const across = uniform([1, 0, r, 0]);
		const passes = [uniform([0, 1, r, 0]), uniform([1, 0, r, 1]), uniform([0, 1, r, 1])];
		// A layer not drawn into here, where a pass needs a depth view bound but reads none.
		const idle = this.skyMaps.createView({
			dimension: "2d-array",
			baseArrayLayer: 0,
			arrayLayerCount: 1,
		});
		const group = (depth: GPUTextureView, from: GPUTexture, buffer: GPUBuffer) =>
			d.createBindGroup({
				layout,
				entries: [
					{ binding: 0, resource: depth },
					{ binding: 1, resource: from.createView() },
					{ binding: 2, resource: { buffer } },
				],
			});
		this.skyOpen = {
			fromDepth: toFloat("fsFromDepth"),
			float: toFloat("fsFloat"),
			toDepth,
			scratch,
			first: Array.from({ length: SKY_VIEWS }, (_, k) =>
				group(
					this.skyMaps.createView({
						dimension: "2d-array",
						baseArrayLayer: SKY_NEAR_LAYER + k,
						arrayLayerCount: 1,
					}),
					scratch[1],
					across,
				),
			),
			rest: [
				group(idle, scratch[0], passes[0]),
				group(idle, scratch[1], passes[1]),
				group(idle, scratch[0], passes[2]),
			],
		};
	}

	/** Opens the near maps just drawn: see makeSkyOpen. */
	private openNearMaps(encoder: GPUCommandEncoder): void {
		const o = this.skyOpen;
		if (!o) return;
		const toScratch = (k: 0 | 1) => ({
			colorAttachments: [
				{ view: o.scratch[k].createView(), loadOp: "clear" as const, storeOp: "store" as const },
			],
		});
		for (let k = 0; k < SKY_VIEWS; k++) {
			const steps: [GPURenderPassDescriptor, GPURenderPipeline, GPUBindGroup][] = [
				[toScratch(0), o.fromDepth, o.first[k]],
				[toScratch(1), o.float, o.rest[0]],
				[toScratch(0), o.float, o.rest[1]],
				[
					{
						colorAttachments: [],
						depthStencilAttachment: {
							view: this.skyMaps.createView({
								dimension: "2d",
								baseArrayLayer: SKY_NEAR_LAYER + k,
								arrayLayerCount: 1,
							}),
							depthLoadOp: "load",
							depthStoreOp: "store",
						},
					},
					o.toDepth,
					o.rest[2],
				],
			];
			for (const [desc, pipeline, bound] of steps) {
				const pass = encoder.beginRenderPass(desc);
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, bound);
				pass.draw(3);
				pass.end();
			}
		}
	}

	// -- the sun's cascades: see cascadeBlock ----------------------------------------

	private sunMaps!: GPUTexture;
	private cascadeUniform!: GPUBuffer;
	private cascadeGroups: { buffer: GPUBuffer; group: GPUBindGroup }[] = [];
	/** The cascades last drawn, to draw them again only when they moved. */
	private cascadeLast: Float32Array = new Float32Array(CASCADE_BLOCK);
	/** The place's box, kept with its fingerprint. */
	private box: { min: number[]; max: number[] } | null = null;

	/** The sun's cascades for this view, drawn again when they or the parts moved. */
	private drawCascades(encoder: GPUCommandEncoder, camera: Camera, partsMoved: boolean): void {
		// Shadows frozen from the Rendering panel: the maps drawn last are sampled as they are.
		if (this.render.freezeShadows) return;
		const l = this.lighting;
		const block = cascadeBlock(
			camera,
			this.width / this.height,
			l?.sun ?? [0, 1, 0],
			this.box,
			l?.shadowSoftness ?? 0.2,
			l?.sunShadows ?? true,
			true,
		);
		if (!partsMoved && block.every((v, i) => v === this.cascadeLast[i])) return;
		this.cascadeLast = block;
		const q = this.device.queue;
		q.writeBuffer(this.cascadeUniform, 0, block);
		if (block[SUN_CASCADES.length * 16 + 7] !== 1) return;
		this.cascadeGroups.forEach(({ buffer, group }, k) => {
			q.writeBuffer(buffer, 0, block.subarray(k * 16, k * 16 + 16));
			const pass = encoder.beginRenderPass({
				timestampWrites: this.stamp("shadows"),
				colorAttachments: [],
				depthStencilAttachment: {
					view: this.sunMaps.createView({ dimension: "2d", baseArrayLayer: k, arrayLayerCount: 1 }),
					depthClearValue: 1,
					depthLoadOp: "clear",
					depthStoreOp: "store",
				},
			});
			pass.setPipeline(this.skyDepth);
			pass.setBindGroup(0, group);
			this.solids(pass);
			pass.end();
		});
	}

	/**
	 * The place's depth from each sky direction and the sun, into the maps:
	 * the whole place's when parts moved, the sun's when it moved, and the
	 * near maps round `centre` when either did or the camera moved a step.
	 */
	private drawSkyMaps(
		encoder: GPUCommandEncoder,
		which: { far: boolean; sun: boolean; near: boolean },
		centre: number[],
	): void {
		// Shadows frozen from the Rendering panel: the maps drawn last are sampled as they are.
		if (this.render.freezeShadows) return;
		this.skyDirty = false;
		this.sunDirty = false;
		this.nearCentre = centre;
		const q = this.device.queue;
		const box = this.scene ? sceneBox(this.scene) : null;
		const block = skyBlock(box, this.lighting?.sun ?? [0, 1, 0], true);
		if (box) nearSkyInto(block, box, centre, true);
		q.writeBuffer(this.skyUniform, 0, block);
		if (!box) return;
		this.skyViewGroups.forEach(({ buffer, group }, k) => {
			const drawn = k < SKY_VIEWS ? which.far : k === SKY_VIEWS ? which.sun : which.near;
			if (!drawn) return;
			q.writeBuffer(buffer, 0, block.subarray(k * 16, k * 16 + 16));
			const pass = encoder.beginRenderPass({
				timestampWrites: this.stamp("shadows"),
				colorAttachments: [],
				depthStencilAttachment: {
					view: this.skyMaps.createView({ dimension: "2d", baseArrayLayer: k, arrayLayerCount: 1 }),
					depthClearValue: 1,
					depthLoadOp: "clear",
					depthStoreOp: "store",
				},
			});
			pass.setPipeline(this.skyDepth);
			pass.setBindGroup(0, group);
			this.solids(pass);
			pass.end();
		});
		if (which.near && passesOf(this.render.features).thinParts) this.openNearMaps(encoder);
	}

	setLook(layer: number, levels: readonly (HTMLCanvasElement | ImageBitmap)[]): void {
		levels.forEach((source, mipLevel) => {
			this.device.queue.copyExternalImageToTexture(
				{ source },
				{ texture: this.looks, mipLevel, origin: [0, 0, layer] },
				[source.width, source.height],
			);
		});
		this.loaded.add(layer);
		this.device.queue.writeBuffer(this.uniform, UNIFORM_MATERIALS, materialBlock(this.loaded));
	}

	destroy(): void {
		this.effects?.destroy();
		this.device?.destroy();
	}

	async pick(camera: Camera, x: number, y: number): Promise<number> {
		this.setCamera(camera);
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.pickTarget!.createView(),
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: this.pickDepth!.createView(),
				depthClearValue: 0,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.ids);
		pass.setScissorRect(Math.min(x, this.width - 1), Math.min(y, this.height - 1), 1, 1);
		this.solids(pass);
		this.solids(pass, this.clear);
		this.solids(pass, this.glass);
		pass.end();
		encoder.copyTextureToBuffer(
			{
				texture: this.pickTarget!,
				origin: { x: Math.min(x, this.width - 1), y: Math.min(y, this.height - 1) },
			},
			{ buffer: this.pickRead, bytesPerRow: 256 },
			{ width: 1, height: 1 },
		);
		this.device.queue.submit([encoder.finish()]);
		await this.pickRead.mapAsync(MAP_READ);
		const id = new Uint32Array(this.pickRead.getMappedRange().slice(0, 4))[0];
		this.pickRead.unmap();
		return id - 1;
	}
}
