/**
 * The viewport's renderer where WebGPU is not: WebGL2, with the same shading,
 * outline and picking as WebGpuView.
 */

import { type LightingParams, lightingBlock } from "../../core/rbx/lighting.js";
import { MATERIAL_TEXTURES, MATERIALS, materialBlock } from "../../core/rbx/materials.js";
import { sceneGlows } from "./geometry.js";
import { TEXTURE_LEVELS, TEXTURE_SIZE } from "./textures.js";

/** How strong the glow round Neon is, over the frame, as in WebGpuView. */
const GLOW = 0.9;

import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { boxEdges, meshFor } from "./geometry.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
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

const COMMON = `
uniform vec4 L[11];
vec3 sky(vec3 dir) {
	vec3 c = dir.y >= 0.0 ? mix(L[3].rgb, L[4].rgb, clamp(1.0 - dir.y / 0.14, 0.0, 1.0)) : mix(L[4].rgb, L[5].rgb, min(1.0, -dir.y * 5.0));
	float a = dot(dir, L[0].xyz);
	float disc = smoothstep(L[1].w - 0.00002, L[1].w + 0.00008, a);
	float glow = pow(max(a, 0.0), 48.0) * (0.18 + L[5].w * 0.6) + pow(max(a, 0.0), 6.0) * 0.06;
	return c + L[1].rgb * (disc * 4.0 + glow);
}
// Stephen Hill's fit of the ACES curve, as BakingLab (MIT) has it.
vec3 aces(vec3 colour) {
	mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
	mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
	vec3 v = i * colour;
	vec3 a = v * (v + 0.0245786) - 0.000090537;
	vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return clamp(o * (a / b), 0.0, 1.0);
}
vec3 display(vec3 c) { vec3 t = aces(c * L[3].w); return pow(t + 0.007 * (1.0 - t), vec3(1.0 / 2.2)); }
vec3 air(vec3 c, float d, float y) {
	if (L[8].z > 0.5) return mix(c, L[9].rgb, clamp((d - L[8].x) / max(L[8].y - L[8].x, 1.0), 0.0, 1.0));
	float thin = exp(-max(y, 0.0) * 0.004);
	return mix(c, L[10].rgb, 1.0 - exp(-d * L[4].w * thin));
}
`;
// A material's pattern, as WebGpuView's \`pattern\` draws it.
const PATTERNS = `
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 w = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), w.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), w.x), w.y);
}
vec2 cells(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	float id = 0.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 r = g + hash2(i + g) - f;
			float d = dot(r, r);
			if (d < d1) { d2 = d1; d1 = d; id = hash1(i + g); } else if (d < d2) { d2 = d; }
		}
	}
	return vec2(sqrt(d2) - sqrt(d1), id);
}
float edgeOf(float v) { return min(fract(v), 1.0 - fract(v)); }
vec3 pattern(int kind, vec2 uv, float size) {
	switch (kind) {
		case 1: {
			float g = noise2(uv * vec2(0.5, 4.0) / size);
			float s = sin(uv.y * 10.0 / size + g * 7.0) * 0.5 + 0.5;
			return vec3(0.86 + 0.24 * s, 1.0, 0.0);
		}
		case 2: {
			float row = floor(uv.y);
			float x = uv.x + hash1(vec2(row, 7.0)) * 4.0;
			float line = 1.0 - smoothstep(0.02, 0.05, min(edgeOf(uv.y), edgeOf(x / 4.0) * 4.0));
			float g = noise2(vec2(x * 0.5, uv.y * 4.0) / size);
			float s = sin(uv.y * 14.0 + g * 6.0) * 0.5 + 0.5;
			float tint = 0.9 + 0.18 * hash1(vec2(row, floor(x / 4.0)));
			return vec3(tint * (0.88 + 0.16 * s) * (1.0 - 0.5 * line), 1.0 - line, 0.0);
		}
		case 3: {
			float row = floor(uv.y);
			float x = uv.x / 2.0 + 0.5 * (row - 2.0 * floor(row / 2.0));
			float mortar = 1.0 - smoothstep(0.05, 0.09, min(edgeOf(x) * 2.0, edgeOf(uv.y)));
			float tint = 0.86 + 0.24 * hash1(vec2(floor(x), row));
			return vec3(mix(tint, 1.3, mortar), 1.0 - 0.7 * mortar, 0.0);
		}
		case 4:
		case 5: {
			vec2 c = cells(uv * (kind == 5 ? 2.6 : 0.9) / size);
			float edge = 1.0 - smoothstep(0.03, 0.14, c.x);
			return vec3((0.82 + 0.3 * c.y) * (1.0 - 0.55 * edge), 1.0 - edge, 0.0);
		}
		case 6: {
			vec2 r = vec2(uv.x + uv.y, uv.x - uv.y) * 1.2;
			vec2 q = abs(fract(r) - 0.5);
			float bump = 1.0 - smoothstep(0.12, 0.18, q.x * 0.45 + q.y);
			return vec3(0.9 + 0.22 * bump, 1.0 + 0.8 * bump, 0.0);
		}
		case 7: {
			vec2 t = uv / 2.0;
			float grout = 1.0 - smoothstep(0.03, 0.06, min(edgeOf(t.x), edgeOf(t.y)) * 2.0);
			float tint = 0.94 + 0.1 * hash1(floor(t));
			return vec3(mix(tint, 0.68, grout), 1.0 - grout, 0.0);
		}
		case 8: {
			float row = floor(uv.y * 1.5);
			float x = uv.x + 0.5 * (row - 2.0 * floor(row / 2.0));
			float line = 1.0 - smoothstep(0.02, 0.05, edgeOf(x));
			float tint = 0.92 + 0.12 * hash1(vec2(floor(x), row));
			return vec3((0.72 + 0.34 * fract(uv.y * 1.5)) * tint * (1.0 - 0.35 * line), 1.0, 0.0);
		}
		case 9: {
			float w = sin(uv.x * 30.0 / size) * sin(uv.y * 30.0 / size);
			return vec3(0.93 + 0.1 * w, 1.0, 0.0);
		}
		case 10: {
			float n = noise2(uv * 4.0 / size) * 0.5 + hash1(floor(uv * 20.0 / size)) * 0.5;
			return vec3(0.86 + 0.26 * n, 1.0, 0.0);
		}
		case 11: {
			float n = noise2(uv * 0.7 / size) * 0.6 + noise2(uv * 3.0 / size) * 0.4;
			return vec3(0.78 + 0.4 * n, 1.0, 0.0);
		}
		case 12: {
			float n = noise2(uv * 0.6 / size);
			float s = hash1(floor(uv * 28.0 / size));
			return vec3((0.82 + 0.26 * n) * (0.86 + 0.26 * s), 1.0, 0.0);
		}
		case 13: {
			float n = noise2(uv * 1.1 / size) * 0.7 + noise2(uv * 5.0 / size) * 0.3;
			float b = smoothstep(0.42, 0.62, n);
			return vec3(1.0 - 0.32 * b, 1.0 - 0.6 * b, 0.0);
		}
		case 14: {
			vec2 c = cells(uv * 0.8 / size);
			float crack = 1.0 - smoothstep(0.02, 0.08, c.x);
			return vec3((0.4 + 0.25 * c.y) * (1.0 - crack), 1.0 - crack, crack);
		}
		case 15: {
			float n = noise2(uv * 0.5 / size) * 3.0 + noise2(uv * 2.0 / size);
			float vein = 1.0 - smoothstep(0.0, 0.1, abs(sin((uv.x + uv.y) * 0.7 + n * 2.0)));
			return vec3(1.0 - 0.35 * vein, 1.0, 0.0);
		}
	}
	return vec3(1.0, 1.0, 0.0);
}
vec2 faceUv(vec3 local, vec3 ln) {
	vec3 a = abs(ln);
	if (a.y >= a.x && a.y >= a.z) return local.xz;
	if (a.x >= a.z) return local.zy;
	return local.xy;
}
const vec3 LAVA = vec3(1.0, 0.36, 0.06);
`;
// A surface in its material, as WebGpuView's \`surface\` draws it.
const SURFACE = `
uniform vec4 M[${MATERIALS.length * 3}];
uniform mediump sampler2DArray looks;
${PATTERNS}
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 w = f * f * (3.0 - 2.0 * f);
	float x0 = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), w.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), w.x), w.y);
	float x1 = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), w.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), w.x), w.y);
	return mix(x0, x1, w.z);
}
vec4 surface(vec3 colour, vec3 n, vec3 world, float alpha, uint look, vec3 local, vec3 ln) {
	int row = int(look & 255u);
	float shine = float((look >> 8u) & 255u) / 255.0;
	vec4 a = M[row * 3];
	vec4 b = M[row * 3 + 1];
	vec4 tex = M[row * 3 + 2];
	vec3 toEye = L[6].xyz - world;
	float d = length(toEye);
	vec3 v = toEye / max(d, 1e-4);
	vec3 albedo = colour;
	if (a.w > 0.0) {
		float g = noise3(local / b.x) * 0.65 + noise3(local / b.x * 3.1) * 0.35;
		albedo *= 1.0 + a.w * (g - 0.5) * 2.0;
	}
	// A texture once its layer has loaded; the material's own pattern until then.
	vec2 uv = faceUv(local, ln);
	int layer = int(b.w) - 1;
	float detail = texture(looks, vec3(uv / tex.x, float(max(layer, 0)))).r * 2.0;
	vec3 pat = layer >= 0 ? vec3(mix(1.0, detail, tex.y), 1.0, 0.0) : pattern(int(b.z), uv, b.x);
	albedo *= pat.x;
	vec3 c;
	if (b.y > 0.5 && b.y < 1.5) {
		c = albedo * 2.4;
	} else if (b.y > 2.5) {
		float rim = pow(1.0 - abs(dot(n, v)), 2.0);
		c = albedo * (0.6 + rim * 2.5);
		alpha *= clamp(0.15 + rim * 0.85, 0.0, 1.0);
	} else {
		vec3 l = L[0].xyz;
		float ndl = max(dot(n, l), 0.0);
		vec3 h = normalize(l + v);
		float spec = pow(max(dot(n, h), 0.0), a.y) * a.x * pat.y;
		vec3 fill = L[2].rgb * (0.9 + 0.1 * n.y);
		c = albedo * (1.0 - a.z * 0.6) * (fill + L[1].rgb * ndl) + L[1].rgb * mix(vec3(1.0), albedo, a.z) * spec * ndl;
		vec3 seen = sky(reflect(-v, n));
		c += seen * albedo * a.z * a.x * 0.25;
		float mirror = shine;
		if (b.y > 1.5) mirror = max(mirror, 0.2 + 0.5 * pow(1.0 - abs(dot(n, v)), 3.0));
		c = mix(c, seen, mirror);
		c += LAVA * pat.z * 3.0;
	}
	return vec4(air(c, d, world.y), alpha);
}
`;
const VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm;
layout(location=2) in vec3 c0; layout(location=3) in vec3 c1; layout(location=4) in vec3 c2; layout(location=5) in vec3 p;
layout(location=6) in vec4 colour; layout(location=7) in uint id; layout(location=8) in uint look;
uniform mat4 viewProj; uniform float outline; uniform float handle; uniform vec3 screen; uniform vec3 eye;
out vec3 vColour; out vec3 vWorld; out vec3 vNormal; flat out uint vId; out float vAlpha; flat out uint vLook; out vec3 vLocal; out vec3 vLNormal;
void main() {
	mat3 m = mat3(c0, c1, c2);
	vec3 s = vec3(length(c0), length(c1), length(c2));
	vNormal = normalize(m * (nrm / max(s * s, vec3(1e-6))));
	vWorld = m * pos + p;
	gl_Position = viewProj * vec4(vWorld, 1.0);
	// An outline's edge as a band, as WebGpuView's vsLine draws it.
	vColour = pow(colour.rgb, vec3(2.2));
	if (outline > 0.5) {
		vec3 wa = m * pos + p;
		vec3 wb = m * nrm + p;
		wa += (eye - wa) * 0.004;
		wb += (eye - wb) * 0.004;
		vec4 a = viewProj * vec4(wa, 1.0);
		vec4 b = viewProj * vec4(wb, 1.0);
		float e = 0.001;
		bool behind = a.w < e && b.w < e;
		if (a.w < e) a = mix(a, b, (e - a.w) / (b.w - a.w));
		if (b.w < e) b = mix(b, a, (e - b.w) / (a.w - b.w));
		bool end = (gl_VertexID & 2) == 2;
		float side = (gl_VertexID & 1) == 1 ? 1.0 : -1.0;
		vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * screen.xy + vec2(1e-6, 0.0));
		vec2 off = (vec2(-dir.y, dir.x) * side + dir * (end ? 1.0 : -1.0)) * screen.z / screen.xy;
		gl_Position = end ? b : a;
		gl_Position.xy += off * gl_Position.w;
		if (behind) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		// The outline's own colour, as it is to be seen.
		vColour = colour.rgb;
	}
	vId = id;
	vAlpha = colour.a;
	vLook = look;
	vLocal = pos * s;
	vLNormal = nrm;
	// A handle's depth squeezed into the front hundredth, as in WebGpuView.
	if (handle > 0.5) gl_Position.z = ((gl_Position.z / gl_Position.w + 1.0) * 0.01 - 1.0) * gl_Position.w;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vColour; in vec3 vWorld; in vec3 vNormal; flat in uint vId; in float vAlpha; flat in uint vLook; in vec3 vLocal; in vec3 vLNormal;
uniform float outline; uniform vec3 select; uniform float handle; uniform float alpha;
${COMMON}
${SURFACE}
out vec4 o;
void main() {
	vec3 n = normalize(vNormal);
	if (outline > 0.5) o = vec4(vColour, vAlpha);
	else if (handle > 0.5) o = vec4(pow(vColour * (0.72 + 0.38 * max(dot(n, normalize(vec3(0.4, 1.0, 0.25))), 0.0)), vec3(1.0 / 2.2)), alpha);
	else {
		vec4 s = surface(vColour, n, vWorld, vAlpha, vLook, vLocal, vLNormal);
		o = vec4(display(s.rgb), s.a);
	}
}`;
const VS_SKY = `#version 300 es
out vec2 ndc;
void main() {
	vec2 xy = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
	ndc = xy;
	gl_Position = vec4(xy, 0.0, 1.0);
}`;
const FS_SKY = `#version 300 es
precision highp float;
in vec2 ndc; uniform mat4 invViewProj;
${COMMON}
out vec4 o;
void main() {
	vec4 far = invViewProj * vec4(ndc, 1.0, 1.0);
	o = vec4(display(sky(normalize(far.xyz / far.w - L[6].xyz))), 1.0);
}`;
const VS_OVER = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 colour;
uniform mat4 viewProj; out vec3 vColour;
void main() { gl_Position = viewProj * vec4(pos, 1.0); vColour = colour; }`;
const FS_OVER = `#version 300 es
precision highp float; in vec3 vColour; out vec4 o;
void main() { o = vec4(vColour, 1.0); }`;
const VS_FULL = `#version 300 es
out vec2 uv;
void main() {
	vec2 xy = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
	uv = xy * 0.5 + 0.5;
	gl_Position = vec4(xy, 0.0, 1.0);
}`;
// The glow round what gives light, as WebGpuView's POST blurs and adds it.
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D tex; uniform vec4 p; out vec4 o;
void main() {
	float w[5] = float[5](0.227, 0.194, 0.121, 0.054, 0.016);
	vec3 c = texture(tex, uv).rgb * w[0];
	for (int k = 1; k < 5; k++) {
		vec2 d = p.xy * float(k) * 1.5;
		c += (texture(tex, uv + d).rgb + texture(tex, uv - d).rgb) * w[k];
	}
	o = vec4(c, 1.0);
}`;
const FS_ADD = `#version 300 es
precision highp float;
in vec2 uv; uniform sampler2D tex; uniform vec4 p; out vec4 o;
void main() { o = vec4(texture(tex, uv).rgb * 2.0 * p.z, 1.0); }`;
const FS_GLOW = `#version 300 es
precision highp float;
in vec3 vColour; in vec3 vWorld; in vec3 vNormal; flat in uint vId; in float vAlpha; flat in uint vLook; in vec3 vLocal; in vec3 vLNormal;
uniform vec4 M[${MATERIALS.length * 3}];
uniform float seen;
${PATTERNS}
out vec4 o;
void main() {
	vec4 b = M[int(vLook & 255u) * 3 + 1];
	vec3 e = vec3(0.0);
	if (b.y > 0.5 && b.y < 1.5) e = vColour * 0.5;
	else if (int(b.z) == 14) e = LAVA * pattern(14, faceUv(vLocal, vLNormal), b.x).z * 0.5;
	o = vec4(e * (seen > 0.5 ? vAlpha : 1.0), 1.0);
}`;
const FS_ID = `#version 300 es
precision highp float; precision highp int; in vec3 vColour; flat in uint vId; out uint o;
void main() { o = vId + 1u; }`;

interface Program {
	program: WebGLProgram;
	viewProj: WebGLUniformLocation | null;
	sun: WebGLUniformLocation | null;
	outline: WebGLUniformLocation | null;
	select: WebGLUniformLocation | null;
	handle: WebGLUniformLocation | null;
	alpha: WebGLUniformLocation | null;
	block: WebGLUniformLocation | null;
	invViewProj: WebGLUniformLocation | null;
	screen: WebGLUniformLocation | null;
}

export class WebGl2View implements ViewRenderer {
	readonly backend = "WebGL2" as const;
	private gl!: WebGL2RenderingContext;
	private main!: Program;
	private ids!: Program;
	private over!: Program;
	private skyProgram!: Program;
	private lighting!: LightingParams;
	private overlay: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number } | null =
		null;
	private sceneBuffers: WebGLBuffer[] = [];
	private handleMeshes: {
		kind: (typeof HANDLE_KINDS)[number];
		vertices: WebGLBuffer;
		indices: WebGLBuffer;
		indexCount: number;
	}[] = [];
	private handleDraws: {
		vao: WebGLVertexArrayObject;
		buffer: WebGLBuffer;
		indexCount: number;
		count: number;
	}[] = [];
	private draws: { vao: WebGLVertexArrayObject; indexCount: number; count: number }[] = [];
	private clear: {
		vao: WebGLVertexArrayObject;
		indexCount: number;
		count: number;
		instances: WebGLBuffer;
		source: Float32Array;
		sorted: Float32Array;
	}[] = [];
	private clearEye: number[] | null = null;
	/** See-through Glass: its depth first, then its colour, so nothing see-through shows behind it. */
	private glass: { vao: WebGLVertexArrayObject; indexCount: number; count: number }[] = [];
	private glassHides = true;
	private scene?: PlaceScene;
	// The glow: what gives light drawn small, blurred, and added over the frame.
	private glowing = false;
	private glowProgram!: Program;
	private blurProgram!: Program;
	private addProgram!: Program;
	private glowTex: WebGLTexture[] = [];
	private glowFbo: WebGLFramebuffer[] = [];
	private glowDepth!: WebGLRenderbuffer;
	private glowSize: [number, number] = [0, 0];
	private edgeMesh!: { vertices: WebGLBuffer; indices: WebGLBuffer; count: number };
	private selection: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number } | null =
		null;
	private pickFbo!: WebGLFramebuffer;
	private pickColour!: WebGLRenderbuffer;
	private pickDepth!: WebGLRenderbuffer;
	private width = 1;
	private height = 1;

	private canvas: HTMLCanvasElement | null = null;
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

	async init(canvas: HTMLCanvasElement, scene: PlaceScene): Promise<void> {
		this.canvas = canvas;
		const gl = canvas.getContext("webgl2", {
			antialias: true,
			powerPreference: "high-performance",
		});
		if (!gl) throw new Error("no WebGL2");
		this.gl = gl;
		this.main = this.link(VS, FS);
		// The material table: the same for every frame, so set once.
		gl.useProgram(this.main.program);
		gl.uniform4fv(gl.getUniformLocation(this.main.program, "M[0]"), materialBlock());
		// The material textures, on unit 1 for good: the glow's passes use unit 0.
		gl.uniform1i(gl.getUniformLocation(this.main.program, "looks"), 1);
		this.looks = gl.createTexture()!;
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.looks);
		gl.texStorage3D(
			gl.TEXTURE_2D_ARRAY,
			TEXTURE_LEVELS,
			gl.RGBA8,
			TEXTURE_SIZE,
			TEXTURE_SIZE,
			MATERIAL_TEXTURES.length,
		);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
		const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
		if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
		gl.activeTexture(gl.TEXTURE0);
		this.ids = this.link(VS, FS_ID);
		this.over = this.link(VS_OVER, FS_OVER);
		this.skyProgram = this.link(VS_SKY, FS_SKY);
		this.glowProgram = this.link(VS, FS_GLOW);
		gl.useProgram(this.glowProgram.program);
		gl.uniform4fv(gl.getUniformLocation(this.glowProgram.program, "M[0]"), materialBlock());
		this.blurProgram = this.link(VS_FULL, FS_BLUR);
		this.addProgram = this.link(VS_FULL, FS_ADD);
		this.glowTex = [gl.createTexture()!, gl.createTexture()!];
		this.glowFbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
		this.glowDepth = gl.createRenderbuffer()!;
		this.setScene(scene);
		for (const kind of HANDLE_KINDS) {
			const m = handleMesh(kind);
			this.handleMeshes.push({
				kind,
				vertices: this.buffer(gl.ARRAY_BUFFER, m.vertices),
				indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, m.indices),
				indexCount: m.indices.length,
			});
		}
		const e = boxEdges();
		this.edgeMesh = {
			vertices: this.buffer(gl.ARRAY_BUFFER, e.vertices),
			indices: this.buffer(gl.ELEMENT_ARRAY_BUFFER, e.indices),
			count: e.indices.length,
		};
		this.pickFbo = gl.createFramebuffer()!;
		this.pickColour = gl.createRenderbuffer()!;
		this.pickDepth = gl.createRenderbuffer()!;
		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.CULL_FACE);
		this.resize(canvas.width, canvas.height);
	}

	setLighting(lighting: LightingParams): void {
		this.lighting = lighting;
	}

	setScene(scene: PlaceScene): void {
		const gl = this.gl;
		for (const d of [...this.draws, ...this.clear, ...this.glass]) gl.deleteVertexArray(d.vao);
		for (const b of this.sceneBuffers) gl.deleteBuffer(b);
		this.scene = scene;
		this.draws = [];
		this.clear = [];
		this.glass = [];
		this.clearEye = null;
		this.glowing = sceneGlows(scene);
		this.sceneBuffers = [];
		const sets = seeThroughSets(scene, this.glassHides);
		for (const kind of SCENE_KINDS) {
			const mesh = meshFor(kind);
			for (const set of ["solid", "clear", "glass"] as const) {
				const { data, count } = (
					set === "solid" ? scene.kinds : set === "clear" ? sets.clear : sets.glass
				)[kind];
				const seeThrough = set === "clear";
				if (count === 0) continue;
				const vb = this.buffer(gl.ARRAY_BUFFER, mesh.vertices);
				const eb = this.buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
				const ib = this.buffer(gl.ARRAY_BUFFER, data);
				this.sceneBuffers.push(vb, eb, ib);
				const draw = { vao: this.vao(vb, ib, eb), indexCount: mesh.indices.length, count };
				if (seeThrough)
					this.clear.push({
						...draw,
						instances: ib,
						source: data,
						sorted: new Float32Array(data.length),
					});
				else if (set === "glass") this.glass.push(draw);
				else this.draws.push(draw);
			}
		}
	}

	/** The see-through parts sorted again when the camera has moved. */
	private sortClear(eye: number[]): void {
		const was = this.clearEye;
		if (was && Math.hypot(eye[0] - was[0], eye[1] - was[1], eye[2] - was[2]) < 0.01) return;
		this.clearEye = [...eye];
		const gl = this.gl;
		for (const c of this.clear) {
			backToFront(c.source, c.count, eye, c.sorted);
			gl.bindBuffer(gl.ARRAY_BUFFER, c.instances);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.sorted);
		}
	}

	setHandles(handles: Handles): void {
		const gl = this.gl;
		for (const h of this.handleDraws) {
			gl.deleteVertexArray(h.vao);
			gl.deleteBuffer(h.buffer);
		}
		this.handleDraws = [];
		for (const m of this.handleMeshes) {
			const data = handles[m.kind];
			const count = data.length / SCENE_STRIDE;
			if (count === 0) continue;
			const buffer = this.buffer(gl.ARRAY_BUFFER, data);
			this.handleDraws.push({
				vao: this.vao(m.vertices, buffer, m.indices),
				buffer,
				indexCount: m.indexCount,
				count,
			});
		}
	}

	setOverlay(lines: Float32Array): void {
		const gl = this.gl;
		if (this.overlay) {
			gl.deleteVertexArray(this.overlay.vao);
			gl.deleteBuffer(this.overlay.buffer);
		}
		const count = lines.length / 6;
		if (count === 0) {
			this.overlay = null;
			return;
		}
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		const buffer = this.buffer(gl.ARRAY_BUFFER, lines);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
		gl.bindVertexArray(null);
		this.overlay = { vao, buffer, count };
	}

	private buffer(target: number, data: ArrayBufferView): WebGLBuffer {
		const gl = this.gl;
		const b = gl.createBuffer()!;
		gl.bindBuffer(target, b);
		gl.bufferData(target, data, gl.STATIC_DRAW);
		return b;
	}

	private vao(
		vertices: WebGLBuffer,
		instances: WebGLBuffer,
		indices: WebGLBuffer,
	): WebGLVertexArrayObject {
		const gl = this.gl;
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
		gl.bindBuffer(gl.ARRAY_BUFFER, instances);
		const stride = SCENE_STRIDE * 4;
		for (let i = 0; i < 4; i++) {
			gl.enableVertexAttribArray(2 + i);
			gl.vertexAttribPointer(2 + i, 3, gl.FLOAT, false, stride, i * 12);
			gl.vertexAttribDivisor(2 + i, 1);
		}
		gl.enableVertexAttribArray(6);
		gl.vertexAttribPointer(6, 4, gl.UNSIGNED_BYTE, true, stride, 48);
		gl.vertexAttribDivisor(6, 1);
		gl.enableVertexAttribArray(7);
		gl.vertexAttribIPointer(7, 1, gl.UNSIGNED_INT, stride, 52);
		gl.vertexAttribDivisor(7, 1);
		gl.enableVertexAttribArray(8);
		gl.vertexAttribIPointer(8, 1, gl.UNSIGNED_INT, stride, 56);
		gl.vertexAttribDivisor(8, 1);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
		gl.bindVertexArray(null);
		return vao;
	}

	private link(vs: string, fs: string): Program {
		const gl = this.gl;
		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(s) ?? "shader");
			return s;
		};
		const program = gl.createProgram()!;
		gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(gl.getProgramInfoLog(program) ?? "link");
		const at = (n: string) => gl.getUniformLocation(program, n);
		return {
			program,
			viewProj: at("viewProj"),
			sun: at("sun"),
			outline: at("outline"),
			select: at("select"),
			handle: at("handle"),
			alpha: at("alpha"),
			block: at("L[0]") ?? at("L"),
			invViewProj: at("invViewProj"),
			screen: at("screen"),
		};
	}

	resize(width: number, height: number): void {
		const gl = this.gl;
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickColour);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.R32UI, this.width, this.height);
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.RENDERBUFFER,
			this.pickColour,
		);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.RENDERBUFFER,
			this.pickDepth,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.sizeGlow();
	}

	/** The glow's two targets, a quarter of the view's size; the first with depth. */
	private sizeGlow(): void {
		const gl = this.gl;
		const w = Math.max(1, Math.round(this.width / 4));
		const h = Math.max(1, Math.round(this.height / 4));
		if (this.glowSize[0] === w && this.glowSize[1] === h) return;
		this.glowSize = [w, h];
		this.glowTex.forEach((tex, i) => {
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[i]);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		});
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.glowDepth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[0]);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.RENDERBUFFER,
			this.glowDepth,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	/** The place drawn small in the light it gives off, then blurred both ways, twice. */
	private drawGlow(camera: Camera): void {
		const gl = this.gl;
		const [w, h] = this.glowSize;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[0]);
		gl.viewport(0, 0, w, h);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		this.use(this.glowProgram, camera, false);
		const seen = gl.getUniformLocation(this.glowProgram.program, "seen");
		gl.uniform1f(seen, 0);
		this.solids();
		if (this.glass.length > 0) {
			gl.colorMask(false, false, false, false);
			this.solids(this.glass);
			gl.colorMask(true, true, true, true);
		}
		if (this.clear.length > 0) {
			gl.uniform1f(seen, 1);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE);
			gl.depthMask(false);
			this.solids(this.clear);
			gl.depthMask(true);
			gl.disable(gl.BLEND);
		}
		gl.disable(gl.DEPTH_TEST);
		gl.useProgram(this.blurProgram.program);
		const p = gl.getUniformLocation(this.blurProgram.program, "p");
		gl.activeTexture(gl.TEXTURE0);
		for (let round = 0; round < 2; round++)
			for (const [from, into, step] of [
				[0, 1, [1 / w, 0]],
				[1, 0, [0, 1 / h]],
			] as const) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFbo[into]);
				gl.bindTexture(gl.TEXTURE_2D, this.glowTex[from]);
				gl.uniform4f(p, step[0], step[1], 0, 0);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			}
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.enable(gl.DEPTH_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/** The glow added over the frame. */
	private addGlow(): void {
		const gl = this.gl;
		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.useProgram(this.addProgram.program);
		gl.uniform4f(gl.getUniformLocation(this.addProgram.program, "p"), 0, 0, GLOW, 0);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.glowTex[0]);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
	}

	setSelection(boxes: Float32Array): void {
		const gl = this.gl;
		if (this.selection) gl.deleteBuffer(this.selection.buffer);
		const count = boxes.length / SCENE_STRIDE;
		if (count === 0) {
			this.selection = null;
			return;
		}
		const buffer = this.buffer(gl.ARRAY_BUFFER, boxes);
		this.selection = {
			vao: this.vao(this.edgeMesh.vertices, buffer, this.edgeMesh.indices),
			buffer,
			count,
		};
	}

	private use(prog: Program, camera: Camera, outline: boolean): void {
		const gl = this.gl;
		gl.useProgram(prog.program);
		const vp = multiply(
			perspective(FOV, this.width / this.height, camera.near, camera.far, false),
			lookAt(camera.eye, camera.at),
		);
		gl.uniformMatrix4fv(prog.viewProj, false, vp);
		if (prog.invViewProj) gl.uniformMatrix4fv(prog.invViewProj, false, invert(vp));
		if (prog.block)
			gl.uniform4fv(prog.block, lightingBlock(this.lighting, camera.eye, SELECT, HANDLE_ALPHA));
		gl.uniform1f(prog.outline, outline ? 1 : 0);
		const band = this.outlineWidth * (this.width / (this.canvas?.clientWidth || this.width));
		gl.uniform3f(prog.screen, this.width, this.height, band);
		gl.uniform3f(
			gl.getUniformLocation(prog.program, "eye"),
			camera.eye[0],
			camera.eye[1],
			camera.eye[2],
		);
		gl.uniform3f(prog.select, SELECT[0], SELECT[1], SELECT[2]);
		gl.uniform1f(prog.handle, 0);
	}

	private solids(
		draws: { vao: WebGLVertexArrayObject; indexCount: number; count: number }[] = this.draws,
	): void {
		const gl = this.gl;
		for (const d of draws) {
			gl.bindVertexArray(d.vao);
			gl.drawElementsInstanced(gl.TRIANGLES, d.indexCount, gl.UNSIGNED_SHORT, 0, d.count);
		}
		gl.bindVertexArray(null);
	}

	draw(camera: Camera): void {
		const gl = this.gl;
		if (this.glowing) {
			if (this.clear.length > 0) this.sortClear(camera.eye);
			this.drawGlow(camera);
		}
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0.56, 0.71, 0.86, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		this.use(this.skyProgram, camera, false);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.depthMask(true);
		gl.enable(gl.DEPTH_TEST);
		this.use(this.main, camera, false);
		this.solids();
		// See-through Glass: the nearest's depth, then its colour blended at that depth.
		if (this.glass.length > 0) {
			gl.colorMask(false, false, false, false);
			this.solids(this.glass);
			gl.colorMask(true, true, true, true);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.depthFunc(gl.LEQUAL);
			gl.depthMask(false);
			this.solids(this.glass);
			gl.depthMask(true);
			gl.depthFunc(gl.LESS);
			gl.disable(gl.BLEND);
		}
		// The see-through parts: blended, farthest first, hiding nothing themselves.
		if (this.clear.length > 0) {
			this.sortClear(camera.eye);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.depthMask(false);
			this.solids(this.clear);
			gl.depthMask(true);
			gl.disable(gl.BLEND);
		}
		if (this.selection) {
			this.use(this.main, camera, true);
			// Through everything, as Studio's selection box is, or hidden by what is in front.
			if (this.hideBehind) {
				gl.depthFunc(gl.LEQUAL);
				gl.depthMask(false);
			} else gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.bindVertexArray(this.selection.vao);
			gl.disable(gl.CULL_FACE);
			gl.drawElementsInstanced(
				gl.TRIANGLES,
				this.edgeMesh.count,
				gl.UNSIGNED_SHORT,
				0,
				this.selection.count,
			);
			gl.bindVertexArray(null);
			gl.disable(gl.BLEND);
			gl.depthMask(true);
			gl.depthFunc(gl.LESS);
			gl.enable(gl.CULL_FACE);
			gl.enable(gl.DEPTH_TEST);
		}
		if (this.handleDraws.length > 0) {
			this.use(this.main, camera, false);
			gl.uniform1f(this.main.handle, 1);
			gl.uniform1f(this.main.alpha, HANDLE_ALPHA);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			for (const h of this.handleDraws) {
				gl.bindVertexArray(h.vao);
				gl.drawElementsInstanced(gl.TRIANGLES, h.indexCount, gl.UNSIGNED_SHORT, 0, h.count);
			}
			gl.bindVertexArray(null);
			gl.disable(gl.BLEND);
			gl.uniform1f(this.main.handle, 0);
		}
		if (this.overlay) {
			this.use(this.over, camera, false);
			gl.disable(gl.DEPTH_TEST);
			gl.bindVertexArray(this.overlay.vao);
			gl.drawArrays(gl.LINES, 0, this.overlay.count);
			gl.bindVertexArray(null);
			gl.enable(gl.DEPTH_TEST);
		}
		if (this.glowing) this.addGlow();
	}

	private looks!: WebGLTexture;
	private loaded = new Set<number>();

	setLook(layer: number, levels: HTMLCanvasElement[]): void {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.looks);
		levels.forEach((source, level) => {
			gl.texSubImage3D(
				gl.TEXTURE_2D_ARRAY,
				level,
				0,
				0,
				layer,
				source.width,
				source.height,
				1,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source,
			);
		});
		gl.activeTexture(gl.TEXTURE0);
		this.loaded.add(layer);
		const block = materialBlock(this.loaded);
		for (const prog of [this.main, this.glowProgram]) {
			gl.useProgram(prog.program);
			gl.uniform4fv(gl.getUniformLocation(prog.program, "M[0]"), block);
		}
	}

	destroy(): void {
		this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
	}

	async pick(camera: Camera, x: number, y: number): Promise<number> {
		const gl = this.gl;
		const px = Math.min(x, this.width - 1);
		const py = this.height - 1 - Math.min(y, this.height - 1);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFbo);
		gl.viewport(0, 0, this.width, this.height);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(px, py, 1, 1);
		gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
		gl.clear(gl.DEPTH_BUFFER_BIT);
		this.use(this.ids, camera, false);
		this.solids();
		this.solids(this.clear);
		this.solids(this.glass);
		const out = new Uint32Array(4);
		gl.readPixels(px, py, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, out);
		gl.disable(gl.SCISSOR_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return out[0] - 1;
	}
}
