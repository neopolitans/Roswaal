/**
 * WebGl2View's Beams and ParticleEmitters, as `effectsGpu.ts` draws them in
 * WebGPU: the quads `EffectsSim` lays out, after the see-through parts,
 * farthest first, depth-tested and writing none, blended by LightEmission.
 */

import type { SceneEffects } from "../../core/rbx/effects.js";
import type { LightingParams } from "../../core/rbx/lighting.js";
import {
	EFFECT_BLOCK,
	EFFECT_COST,
	EFFECT_VERTEX,
	type EffectFrame,
	type EffectShow,
	EffectsSim,
	effectBlock,
	FALLBACK_BAND,
	FALLBACK_DOT,
	FALLBACK_WHITE,
	fallbackPixels,
	QUAD_VERTICES,
	quadIndices,
} from "./effects.js";
import { lookAt, multiply, perspective } from "./math.js";
import { type Camera, COST_FULL, FOV, RENDER_MODE_CODE, type RenderSettings } from "./view.js";

const VS_FX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 pos; layout(location = 1) in vec2 uv; layout(location = 2) in vec4 colour; layout(location = 3) in vec3 look;
uniform vec4 FX[${EFFECT_BLOCK / 4}];
out vec3 vWorld; out vec2 vUv; out vec4 vColour; out vec3 vLook;
#ifdef LOG_DEPTH
out float vDepthW;
#endif
void main() {
	mat4 viewProj = mat4(FX[0], FX[1], FX[2], FX[3]);
	gl_Position = viewProj * vec4(pos, 1.0);
	vWorld = pos; vUv = uv; vColour = colour; vLook = look;
#ifdef LOG_DEPTH
	vDepthW = 1.0 + gl_Position.w;
#endif
}`;

const FS_FX = `#version 300 es
precision highp float;
in vec3 vWorld; in vec2 vUv; in vec4 vColour; in vec3 vLook;
#ifdef LOG_DEPTH
in float vDepthW; uniform float logFar;
#endif
uniform vec4 FX[${EFFECT_BLOCK / 4}];
uniform sampler2D fxImage;
out vec4 o;
vec3 fxAces(vec3 colour) {
	mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
	mat3 m = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
	vec3 v = i * colour;
	vec3 a = v * (v + 0.0245786) - 0.000090537;
	vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return clamp(m * (a / b), vec3(0.0), vec3(1.0));
}
vec3 fxDisplay(vec3 c) { return pow(fxAces(c * FX[4].w), vec3(1.0 / 2.2)); }
vec4 fxAir(float d, float y) {
	if (FX[7].w < 0.5) return vec4(0.0);
	if (FX[6].z > 0.5) return vec4(FX[7].rgb, clamp((d - FX[6].x) / max(FX[6].y - FX[6].x, 1.0), 0.0, 1.0));
	float thin = exp(-max(y, 0.0) * 0.004);
	return vec4(FX[8].rgb, 1.0 - exp(-d * FX[6].w * thin));
}
void main() {
#ifdef LOG_DEPTH
	gl_FragDepth = log2(max(vDepthW, 1e-6)) * logFar;
#endif
	vec4 t = texture(fxImage, vUv);
	if (FX[5].w > 4.5) { o = vec4(FX[8].w, 0.0, 0.0, 0.0); return; }
	float a = t.a * vColour.a;
	vec3 albedo = pow(t.rgb * vColour.rgb, vec3(2.2));
	vec4 air = fxAir(length(FX[4].xyz - vWorld), vWorld.y);
	vec3 lit = fxDisplay(mix(albedo * FX[5].rgb, air.rgb, air.a));
	vec3 own = pow(min(mix(albedo * vLook.z, air.rgb, air.a), vec3(1.0)), vec3(1.0 / 2.2));
	vec3 c = mix(own, lit, clamp(vLook.y, 0.0, 1.0));
	if (FX[5].w > 2.5) c = pow(min(albedo, vec3(1.0)), vec3(1.0 / 2.2));
	o = vec4(c * a, a * (1.0 - clamp(vLook.x, 0.0, 1.0)));
}`;

/** What the effects need of WebGl2View: its context, its depth, and its images. */
export interface GlEffectsHost {
	gl: WebGL2RenderingContext;
	/** Depth reversed into a float buffer (EXT_clip_control); else logarithmic depth is written. */
	reversed: boolean;
	/** The depth test that keeps what is nearer. */
	nearer: number;
	/** An image's texture, once it has arrived. */
	imageTexture(asset: string): WebGLTexture | undefined;
}

export class GlEffects {
	private sim = new EffectsSim(undefined);
	private program: WebGLProgram;
	private block: WebGLUniformLocation | null;
	private logFar: WebGLUniformLocation | null;
	private vao: WebGLVertexArrayObject;
	private vertices: WebGLBuffer;
	private indices: WebGLBuffer;
	private room = 0;
	private fallbacks = new Map<string, WebGLTexture>();
	last: Pick<EffectFrame, "beams" | "particles" | "moving"> & { draws: number; quads: number } = {
		beams: 0,
		particles: 0,
		moving: false,
		draws: 0,
		quads: 0,
	};

	constructor(private readonly host: GlEffectsHost) {
		const gl = host.gl;
		const define = (src: string) =>
			host.reversed
				? src
				: src.replace("#version 300 es\n", "#version 300 es\n#define LOG_DEPTH\n");
		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, define(src));
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(s) ?? "effects shader");
			return s;
		};
		const program = gl.createProgram()!;
		gl.attachShader(program, compile(gl.VERTEX_SHADER, VS_FX));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS_FX));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(gl.getProgramInfoLog(program) ?? "effects link");
		this.program = program;
		this.block = gl.getUniformLocation(program, "FX[0]") ?? gl.getUniformLocation(program, "FX");
		this.logFar = gl.getUniformLocation(program, "logFar");
		this.vao = gl.createVertexArray()!;
		this.vertices = gl.createBuffer()!;
		this.indices = gl.createBuffer()!;
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
		const stride = EFFECT_VERTEX * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 20);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 24);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.activeTexture(gl.TEXTURE2);
		for (const kind of [FALLBACK_WHITE, FALLBACK_DOT, FALLBACK_BAND]) {
			const size = 64;
			const texture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				size,
				size,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				fallbackPixels(kind, size),
			);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.fallbacks.set(kind, texture);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
	}

	setEffects(effects: SceneEffects | undefined): void {
		this.sim = new EffectsSim(effects);
	}

	/** This frame's effects into what is bound, after the see-through parts. Leaves the state as it found it. */
	draw(
		camera: Camera,
		width: number,
		height: number,
		lighting: LightingParams | undefined,
		render: RenderSettings,
		show: EffectShow,
		now: number,
	): void {
		const mode = render.mode;
		if (this.sim.empty || !lighting || mode === "wireframe" || mode === "lights") {
			this.last = { beams: 0, particles: 0, moving: false, draws: 0, quads: 0 };
			return;
		}
		const gl = this.host.gl;
		const ready = (asset: string) => this.host.imageTexture(asset) !== undefined;
		const aspect = width / height;
		const frame = this.sim.frame(
			{ eye: camera.eye, at: camera.at, aspect, fov: FOV },
			now,
			show,
			ready,
		);
		this.last = { ...frame, draws: 0, quads: frame.quads };
		if (frame.quads === 0) return;
		gl.bindVertexArray(this.vao);
		if (frame.quads > this.room) {
			this.room = Math.max(frame.quads, this.room * 2, 256);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
			gl.bufferData(
				gl.ARRAY_BUFFER,
				this.room * QUAD_VERTICES * EFFECT_VERTEX * 4,
				gl.DYNAMIC_DRAW,
			);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(this.room), gl.STATIC_DRAW);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.vertices);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		const reversed = this.host.reversed;
		const viewProj = multiply(
			perspective(FOV, aspect, camera.near, camera.far, reversed, reversed),
			lookAt(camera.eye, camera.at),
		);
		gl.useProgram(this.program);
		gl.uniform4fv(
			this.block,
			effectBlock(
				viewProj,
				camera.eye,
				lighting,
				RENDER_MODE_CODE[mode],
				render.show.haze,
				EFFECT_COST / COST_FULL,
			),
		);
		if (this.logFar) gl.uniform1f(this.logFar, 1 / Math.log2(camera.far + 1));
		gl.uniform1i(gl.getUniformLocation(this.program, "fxImage"), 2);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(this.host.nearer);
		gl.depthMask(false);
		gl.disable(gl.CULL_FACE);
		gl.activeTexture(gl.TEXTURE2);
		for (const batch of frame.batches) {
			const texture = this.fallbacks.get(batch.texture) ?? this.host.imageTexture(batch.texture);
			if (!texture) continue;
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.drawElements(gl.TRIANGLES, batch.count * 6, gl.UNSIGNED_INT, batch.first * 6 * 4);
			this.last.draws++;
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(null);
		gl.enable(gl.CULL_FACE);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
	}

	destroy(): void {
		const gl = this.host.gl;
		gl.deleteBuffer(this.vertices);
		gl.deleteBuffer(this.indices);
		gl.deleteVertexArray(this.vao);
		gl.deleteProgram(this.program);
		for (const t of this.fallbacks.values()) gl.deleteTexture(t);
	}
}
