/**
 * The viewport's renderer where WebGPU is: sized to its canvas, drawn only
 * when asked, with the selection outlined over everything.
 */

import { type LightingParams, lightingBlock } from "../../core/rbx/lighting.js";
import { MATERIAL_TEXTURES, MATERIALS, materialBlock } from "../../core/rbx/materials.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { boxEdges, meshFor, sceneGlows } from "./geometry.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
import { TEXTURE_LEVELS, TEXTURE_SIZE } from "./textures.js";
import {
	backToFront,
	type Camera,
	FOV,
	HANDLE_ALPHA,
	SELECT,
	SELECT_WIDTH,
	seeThroughSets,
	type ViewRenderer,
} from "./view.js";

// WebGPU's flags, as the spec numbers them: TypeScript's DOM types have the
// interfaces but not these namespaces.
const BUFFER = { MAP_READ: 0x1, COPY_DST: 0x8, INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40 } as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;
const TEXTURE = {
	COPY_SRC: 0x1,
	COPY_DST: 0x2,
	TEXTURE_BINDING: 0x4,
	RENDER_ATTACHMENT: 0x10,
} as const;
/** How strong the glow round Neon is, over the frame. */
const GLOW = 0.7;
const MAP_READ = 0x1;

/**
 * The glow round what gives light of its own: blurred one way and then the
 * other at a quarter of the view's size, then added over the frame.
 */
const POST = /* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
// One texel along the blur, in the source's own units, and how strong the glow is.
@group(0) @binding(2) var<uniform> p: vec4f;
struct Out { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> Out {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
	var o: Out;
	o.clip = vec4f(xy, 0.0, 1.0);
	o.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
	return o;
}
// Nine taps of a Gaussian, spread a little wider than a texel apiece.
@fragment fn fsBlur(i: Out) -> @location(0) vec4f {
	var w = array<f32, 5>(0.227, 0.194, 0.121, 0.054, 0.016);
	var c = textureSample(tex, samp, i.uv).rgb * w[0];
	for (var k = 1; k < 5; k++) {
		let o = p.xy * f32(k) * 2.5;
		c = c + (textureSample(tex, samp, i.uv + o).rgb + textureSample(tex, samp, i.uv - o).rgb) * w[k];
	}
	return vec4f(c, 1.0);
}
// Twice what the glow holds, as it was halved going in, with a dither under
// one step of the frame's 8 bits, so its long soft fall does not come out in bands.
@fragment fn fsAdd(i: Out) -> @location(0) vec4f {
	let c = textureSample(tex, samp, i.uv).rgb * 2.0 * p.z;
	let n = fract(52.9829189 * fract(dot(i.clip.xy, vec2f(0.06711056, 0.00583715)))) - 0.5;
	return vec4f(max(c + n / 255.0 * step(1.0 / 512.0, max(c.r, max(c.g, c.b))), vec3f(0.0)), 1.0);
}
`;

const SAMPLES = 4;
const SHADER = /* wgsl */ `
struct U {
	viewProj: mat4x4f, invViewProj: mat4x4f,
	sun: vec4f, sunColour: vec4f, ambient: vec4f, zenith: vec4f, horizon: vec4f, ground: vec4f,
	camPos: vec4f, select: vec4f, fog: vec4f, fogColour: vec4f, hazeColour: vec4f,
	screen: vec4f,
	// The material table: two rows a material, as \`materialBlock\` writes it.
	mats: array<vec4f, ${MATERIALS.length * 3}>,
};
@group(0) @binding(0) var<uniform> u: U;
// The material textures, a layer each, tinted by the part's Color.
@group(0) @binding(1) var looks: texture_2d_array<f32>;
@group(0) @binding(2) var lookSampler: sampler;
struct VIn {
	@location(0) pos: vec3f, @location(1) nrm: vec3f,
	@location(2) c0: vec3f, @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) p: vec3f,
	@location(6) colour: vec4f, @location(7) id: u32, @location(8) look: u32,
};
struct VOut {
	@builtin(position) clip: vec4f, @location(0) colour: vec3f, @location(1) @interpolate(flat) id: u32,
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
	let a = dot(dir, u.sun.xyz);
	let disc = smoothstep(u.sunColour.w - 0.00002, u.sunColour.w + 0.00008, a);
	let glow = pow(max(a, 0.0), 48.0) * (0.18 + u.ground.w * 0.6) + pow(max(a, 0.0), 6.0) * 0.06;
	return c + u.sunColour.rgb * (disc * 4.0 + glow);
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
// The deepest shadows lifted a touch, as Studio's are.
fn display(c: vec3f) -> vec3f {
	let t = aces(c * u.zenith.w);
	return pow(t + 0.007 * (1.0 - t), vec3f(1.0 / 2.2));
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
// air in front of it. Neon gives its own light; ForceField glows at its rim.
fn surface(i: VOut) -> vec4f {
	let row = i.look & 255u;
	let shine = f32((i.look >> 8u) & 255u) / 255.0;
	let a = u.mats[row * 3u];
	let b = u.mats[row * 3u + 1u];
	let tex = u.mats[row * 3u + 2u];
	let n = normalize(i.normal);
	let toEye = u.camPos.xyz - i.world;
	let d = length(toEye);
	let v = toEye / max(d, 1e-4);
	var albedo = i.colour;
	if (a.w > 0.0) {
		let g = noise3(i.local / b.x) * 0.65 + noise3(i.local / b.x * 3.1) * 0.35;
		albedo = albedo * (1.0 + a.w * (g - 0.5) * 2.0);
	}
	// A texture once its layer has loaded; the material's own pattern until then.
	let uv = faceUv(i.local, i.lnormal);
	let layer = i32(b.w) - 1;
	let look = textureSample(looks, lookSampler, uv / tex.x, max(layer, 0));
	var pat = pattern(u32(b.z), uv, b.x);
	if (layer >= 0) {
		pat = vec3f(mix(1.0, look.r * 2.0, tex.y), 1.0, tex.z * look.g);
	}
	albedo = albedo * pat.x;
	var alpha = i.alpha;
	var c: vec3f;
	if (b.y > 0.5 && b.y < 1.5) {
		c = albedo * 2.4;
	} else if (b.y > 2.5) {
		let rim = pow(1.0 - abs(dot(n, v)), 2.0);
		c = albedo * (0.6 + rim * 2.5);
		alpha = alpha * clamp(0.15 + rim * 0.85, 0.0, 1.0);
	} else {
		let l = u.sun.xyz;
		let ndl = max(dot(n, l), 0.0);
		let h = normalize(l + v);
		let spec = pow(max(dot(n, h), 0.0), a.y) * a.x * pat.y;
		let fill = u.ambient.rgb * (0.9 + 0.1 * n.y);
		c = albedo * (1.0 - a.z * 0.6) * (fill + u.sunColour.rgb * ndl) + u.sunColour.rgb * mix(vec3f(1.0), albedo, a.z) * spec * ndl;
		let seen = sky(reflect(-v, n));
		// A metal shows a little of the sky in its own colour.
		c = c + seen * albedo * a.z * a.x * 0.25;
		// Reflectance, and glass's own, stronger at a glancing angle.
		var mirror = shine;
		if (b.y > 1.5) { mirror = max(mirror, 0.2 + 0.5 * pow(1.0 - abs(dot(n, v)), 3.0)); }
		c = mix(c, seen, mirror);
		c = c + lavaLight(pat.z) * 2.2;
	}
	return vec4f(air(c, d, i.world.y), alpha);
}
// What gives light of its own, for the glow round it: Neon, and CrackedLava's
// cracks. In display terms, as the frame it is added to is: blurred and added
// as linear light it shifted hue and fell away in a dark band at a glowing
// part's edge. Halved, so the glow's 8 bits a channel hold up to twice full.
fn emission(i: VOut) -> vec3f {
	let e = pow(light(i), vec3f(1.0 / 2.2));
	// Neon's glow evened out by how bright its colour looks, so a red blooms as far as a cyan.
	let neon = u.mats[(i.look & 255u) * 3u + 1u].y;
	let seen = dot(e, vec3f(0.2126, 0.7152, 0.0722));
	let even = select(1.0, clamp(0.8 / max(seen, 0.05), 1.0, 1.8), neon > 0.5 && neon < 1.5);
	return e * even * 0.5;
}
fn light(i: VOut) -> vec3f {
	let row = i.look & 255u;
	let b = u.mats[row * 3u + 1u];
	let tex = u.mats[row * 3u + 2u];
	let uv = faceUv(i.local, i.lnormal);
	let layer = i32(b.w) - 1;
	// Sampled before any branch: WGSL samples only in uniform control flow.
	let look = textureSample(looks, lookSampler, uv / tex.x, max(layer, 0));
	if (b.y > 0.5 && b.y < 1.5) { return min(i.colour, vec3f(1.0)); }
	if (tex.z > 0.5 && layer >= 0) { return min(lavaLight(look.g), vec3f(1.0)); }
	if (u32(b.z) == 14u) { return min(lavaLight(pattern(14u, uv, b.x).z), vec3f(1.0)); }
	return vec3f(0.0);
}
@fragment fn fsGlow(i: VOut) -> @location(0) vec4f { return vec4f(emission(i), 1.0); }
@fragment fn fsGlowSeen(i: VOut) -> @location(0) vec4f { return vec4f(emission(i) * i.alpha, 1.0); }
// A solid Neon part marks itself with no alpha, so the glow is added round it
// and not over it: blurred, the glow is weaker at a face's edges and weaker
// again at its corners, and over the part it showed as a shadow there. Drawn
// one even shade, the part meets its glow at its outline, as Studio's does.
@fragment fn fs(i: VOut) -> @location(0) vec4f {
	let s = surface(i);
	let shade = u.mats[(i.look & 255u) * 3u + 1u].y;
	let glows = shade > 0.5 && shade < 1.5 && s.a > 0.999;
	return vec4f(display(s.rgb), select(s.a, 0.0, glows));
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
@fragment fn fsSky(i: SOut) -> @location(0) vec4f {
	let far = u.invViewProj * vec4f(i.ndc, 1.0, 1.0);
	let dir = normalize(far.xyz / far.w - u.camPos.xyz);
	return vec4f(display(sky(dir)), 1.0);
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
`;

interface Draw {
	vertices: GPUBuffer;
	indices: GPUBuffer;
	indexCount: number;
	instances: GPUBuffer;
	count: number;
}

export class WebGpuView implements ViewRenderer {
	readonly backend = "WebGPU" as const;
	private device!: GPUDevice;
	private context!: GPUCanvasContext;
	private format!: GPUTextureFormat;
	private solid!: GPURenderPipeline;
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
	// The glow: what gives light drawn small, blurred, and added over the frame.
	private glowing = false;
	private glowSolid!: GPURenderPipeline;
	private glowSeen!: GPURenderPipeline;
	private blur!: GPURenderPipeline;
	private add!: GPURenderPipeline;
	private postLayout!: GPUBindGroupLayout;
	private sampler!: GPUSampler;
	private postParams: GPUBuffer[] = [];
	private glow?: {
		a: GPUTexture;
		b: GPUTexture;
		depth: GPUTexture;
		groups: GPUBindGroup[];
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

	async init(canvas: HTMLCanvasElement, scene: PlaceScene): Promise<void> {
		this.canvas = canvas;
		const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
		if (!adapter) throw new Error("no WebGPU adapter");
		this.device = await adapter.requestDevice();
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
			],
		});
		const pipelineLayout = d.createPipelineLayout({ bindGroupLayouts: [layout] });
		const depth = {
			format: "depth32float" as const,
			depthWriteEnabled: true,
			depthCompare: "greater" as const,
		};
		this.solid = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fs", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: SAMPLES },
		});
		// The see-through parts: blended over what is behind them, hidden by
		// what is in front, and hiding nothing themselves.
		this.blended = d.createRenderPipeline({
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
		// See-through Glass: the nearest's depth, then its colour blended at that depth.
		this.glassDepth = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fs", targets: [{ format: this.format, writeMask: 0 }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: SAMPLES },
		});
		this.glassBlended = d.createRenderPipeline({
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
		const line = (depthCompare: GPUCompareFunction) =>
			d.createRenderPipeline({
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
		this.lines = line("always");
		this.linesBehind = line("greater-equal");
		this.ids = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsId", targets: [{ format: "r32uint" }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
		});
		this.over = d.createRenderPipeline({
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
		this.handle = d.createRenderPipeline({
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
		this.skyPipeline = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsSky", buffers: [] },
			fragment: { module, entryPoint: "fsSky", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		// The glow's passes: the place drawn small in what it gives off, then blurred and added.
		// Half floats, so six passes of blur do not round the glow's fall into steps.
		const glowTarget = { format: "rgba16float" as const };
		this.glowSolid = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlow", targets: [glowTarget] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
		});
		const adding = {
			color: { srcFactor: "one" as const, dstFactor: "one" as const },
			alpha: { srcFactor: "one" as const, dstFactor: "one" as const },
		};
		this.glowSeen = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlowSeen", targets: [{ ...glowTarget, blend: adding }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
		});
		this.glowGlassDepth = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fsGlow", targets: [{ ...glowTarget, writeMask: 0 }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
		});
		const post = d.createShaderModule({ code: POST });
		this.postLayout = d.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: STAGE.FRAGMENT, texture: {} },
				{ binding: 1, visibility: STAGE.FRAGMENT, sampler: {} },
				{ binding: 2, visibility: STAGE.FRAGMENT, buffer: {} },
			],
		});
		const postPipeline = d.createPipelineLayout({ bindGroupLayouts: [this.postLayout] });
		this.blur = d.createRenderPipeline({
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: { module: post, entryPoint: "fsBlur", targets: [glowTarget] },
			primitive: { topology: "triangle-list" },
		});
		this.add = d.createRenderPipeline({
			layout: postPipeline,
			vertex: { module: post, entryPoint: "vsFull" },
			fragment: {
				module: post,
				entryPoint: "fsAdd",
				// Over what the frame has marked as not glowing itself: its alpha.
				targets: [
					{
						format: this.format,
						blend: {
							color: { srcFactor: "dst-alpha", dstFactor: "one" },
							alpha: { srcFactor: "zero", dstFactor: "one" },
						},
					},
				],
			},
			primitive: { topology: "triangle-list" },
			// In the frame's own pass: see draw.
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
		this.sampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
		// Across, down, and the strength the glow is added at.
		this.postParams = [0, 1, 2].map(() =>
			d.createBuffer({ size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }),
		);
		this.uniform = d.createBuffer({
			size: 320 + MATERIALS.length * 48,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		d.queue.writeBuffer(this.uniform, 320, materialBlock());
		this.looks = d.createTexture({
			size: [TEXTURE_SIZE, TEXTURE_SIZE, MATERIAL_TEXTURES.length],
			mipLevelCount: TEXTURE_LEVELS,
			format: "rgba8unorm",
			usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
		});
		this.bind = d.createBindGroup({
			layout,
			entries: [
				{ binding: 0, resource: { buffer: this.uniform } },
				{ binding: 1, resource: this.looks.createView({ dimension: "2d-array" }) },
				{
					binding: 2,
					resource: d.createSampler({
						addressModeU: "repeat",
						addressModeV: "repeat",
						magFilter: "linear",
						minFilter: "linear",
						mipmapFilter: "linear",
						maxAnisotropy: 4,
					}),
				},
			],
		});

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
	}

	setLighting(lighting: LightingParams): void {
		this.lighting = lighting;
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
		for (const d of [...this.draws, ...this.clear, ...this.glass])
			for (const b of [d.vertices, d.indices, d.instances]) b.destroy();
		this.scene = scene;
		this.draws = [];
		this.clear = [];
		this.glass = [];
		this.clearEye = null;
		this.glowing = sceneGlows(scene);
		const sets = seeThroughSets(scene, this.glassHides);
		for (const kind of SCENE_KINDS) {
			const mesh = meshFor(kind);
			const solid = scene.kinds[kind];
			const seen = sets.clear[kind];
			const glass = sets.glass[kind];
			if (glass.count > 0)
				this.glass.push({
					vertices: this.make(mesh.vertices, BUFFER.VERTEX),
					indices: this.make(mesh.indices, BUFFER.INDEX),
					indexCount: mesh.indices.length,
					instances: this.make(glass.data, BUFFER.VERTEX),
					count: glass.count,
				});
			if (solid.count > 0)
				this.draws.push({
					vertices: this.make(mesh.vertices, BUFFER.VERTEX),
					indices: this.make(mesh.indices, BUFFER.INDEX),
					indexCount: mesh.indices.length,
					instances: this.make(solid.data, BUFFER.VERTEX),
					count: solid.count,
				});
			if (seen.count > 0)
				this.clear.push({
					vertices: this.make(mesh.vertices, BUFFER.VERTEX),
					indices: this.make(mesh.indices, BUFFER.INDEX),
					indexCount: mesh.indices.length,
					instances: this.make(seen.data, BUFFER.VERTEX),
					count: seen.count,
					source: seen.data,
					sorted: new Float32Array(seen.data.length),
				});
		}
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
		for (const t of [this.msaa, this.depth, this.pickTarget, this.pickDepth]) t?.destroy();
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
	}

	/** The glow's targets, a quarter of the view's size, and what reads them. */
	private sizeGlow(): void {
		const w = Math.max(1, Math.round(this.width / 4));
		const h = Math.max(1, Math.round(this.height / 4));
		if (this.glow && this.glow.w === w && this.glow.h === h) return;
		const d = this.device;
		for (const t of [this.glow?.a, this.glow?.b, this.glow?.depth]) t?.destroy();
		const target = () =>
			d.createTexture({
				size: [w, h],
				format: "rgba16float",
				usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
			});
		const a = target();
		const b = target();
		const depth = d.createTexture({
			size: [w, h],
			format: "depth32float",
			usage: TEXTURE.RENDER_ATTACHMENT,
		});
		d.queue.writeBuffer(this.postParams[0], 0, new Float32Array([1 / w, 0, 0, 0]));
		d.queue.writeBuffer(this.postParams[1], 0, new Float32Array([0, 1 / h, 0, 0]));
		d.queue.writeBuffer(this.postParams[2], 0, new Float32Array([0, 0, GLOW, 0]));
		const group = (tex: GPUTexture, params: GPUBuffer) =>
			d.createBindGroup({
				layout: this.postLayout,
				entries: [
					{ binding: 0, resource: tex.createView() },
					{ binding: 1, resource: this.sampler },
					{ binding: 2, resource: { buffer: params } },
				],
			});
		// A across into B, B down into A, and A added over the frame.
		const groups = [
			group(a, this.postParams[0]),
			group(b, this.postParams[1]),
			group(a, this.postParams[2]),
		];
		this.glow = { a, b, depth, groups, w, h };
	}

	/** The place drawn small in the light it gives off, then blurred both ways. */
	private drawGlow(encoder: GPUCommandEncoder): void {
		const glow = this.glow;
		if (!glow) return;
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: glow.a.createView(),
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
			depthStencilAttachment: {
				view: glow.depth.createView(),
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
		pass.end();
		// Three times each way, for a glow wider than nine taps.
		for (let round = 0; round < 3; round++)
			for (const [from, into] of [
				[0, glow.b],
				[1, glow.a],
			] as const) {
				const blur = encoder.beginRenderPass({
					colorAttachments: [
						{
							view: into.createView(),
							loadOp: "clear",
							storeOp: "store",
							clearValue: { r: 0, g: 0, b: 0, a: 1 },
						},
					],
				});
				blur.setPipeline(this.blur);
				blur.setBindGroup(0, glow.groups[from]);
				blur.draw(3);
				blur.end();
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
		const u = new Float32Array(80);
		u.set(vp, 0);
		u.set(invert(vp), 16);
		u.set(lightingBlock(this.lighting, camera.eye, SELECT, HANDLE_ALPHA), 32);
		u.set([this.width, this.height, this.band(), 0], 76);
		this.device.queue.writeBuffer(this.uniform, 0, u);
	}

	private solids(pass: GPURenderPassEncoder, draws: Draw[] = this.draws): void {
		for (const draw of draws) {
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.indices, "uint16");
			pass.drawIndexed(draw.indexCount, draw.count);
		}
	}

	draw(camera: Camera): void {
		this.setCamera(camera);
		const encoder = this.device.createCommandEncoder();
		const screen = this.context.getCurrentTexture().createView();
		if (this.glowing) {
			if (this.clear.length > 0) this.sortClear(camera.eye);
			this.drawGlow(encoder);
		}
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.msaa!.createView(),
					resolveTarget: screen,
					clearValue: { r: 0.56, g: 0.71, b: 0.86, a: 1 },
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
		pass.setPipeline(this.skyPipeline);
		pass.draw(3);
		pass.setPipeline(this.solid);
		this.solids(pass);
		if (this.glass.length > 0) {
			pass.setPipeline(this.glassDepth);
			this.solids(pass, this.glass);
			pass.setPipeline(this.glassBlended);
			this.solids(pass, this.glass);
		}
		if (this.clear.length > 0) {
			this.sortClear(camera.eye);
			pass.setPipeline(this.blended);
			this.solids(pass, this.clear);
		}
		// The glow is part of the place: what marks the place is drawn over it.
		if (this.glowing && this.glow) {
			pass.setPipeline(this.add);
			pass.setBindGroup(0, this.glow.groups[2]);
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
		this.device.queue.submit([encoder.finish()]);
	}

	private looks!: GPUTexture;
	private loaded = new Set<number>();

	setLook(layer: number, levels: HTMLCanvasElement[]): void {
		levels.forEach((source, mipLevel) => {
			this.device.queue.copyExternalImageToTexture(
				{ source },
				{ texture: this.looks, mipLevel, origin: [0, 0, layer] },
				[source.width, source.height],
			);
		});
		this.loaded.add(layer);
		this.device.queue.writeBuffer(this.uniform, 320, materialBlock(this.loaded));
	}

	destroy(): void {
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
