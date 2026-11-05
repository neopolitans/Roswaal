/**
 * The viewport's renderer where WebGPU is not: WebGL2, with the same shading,
 * outline and picking as WebGpuView.
 */

import { type LightingParams, lightingBlock } from "../../core/rbx/lighting.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { boxEdges, meshFor } from "./geometry.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
import { type Camera, FOV, HANDLE_ALPHA, SELECT, SELECT_WIDTH, type ViewRenderer } from "./view.js";

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
vec3 lit(vec3 albedo, vec3 n, vec3 world) {
	vec3 toEye = L[6].xyz - world;
	float d = length(toEye);
	vec3 v = toEye / max(d, 1e-4);
	vec3 l = L[0].xyz;
	float ndl = max(dot(n, l), 0.0);
	vec3 h = normalize(l + v);
	float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.12;
	vec3 fill = L[2].rgb * (0.9 + 0.1 * n.y);
	vec3 c = albedo * (fill + L[1].rgb * ndl) + L[1].rgb * spec * ndl;
	if (L[8].z > 0.5) {
		c = mix(c, L[9].rgb, clamp((d - L[8].x) / max(L[8].y - L[8].x, 1.0), 0.0, 1.0));
	} else {
		float thin = exp(-max(world.y, 0.0) * 0.004);
		c = mix(c, L[10].rgb, 1.0 - exp(-d * L[4].w * thin));
	}
	return c;
}
`;
const VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm;
layout(location=2) in vec3 c0; layout(location=3) in vec3 c1; layout(location=4) in vec3 c2; layout(location=5) in vec3 p;
layout(location=6) in vec4 colour; layout(location=7) in uint id;
uniform mat4 viewProj; uniform float outline; uniform float handle; uniform vec3 screen;
out vec3 vColour; out vec3 vWorld; out vec3 vNormal; flat out uint vId;
void main() {
	mat3 m = mat3(c0, c1, c2);
	vec3 s = vec3(length(c0), length(c1), length(c2));
	vNormal = normalize(m * (nrm / max(s * s, vec3(1e-6))));
	vWorld = m * pos + p;
	gl_Position = viewProj * vec4(vWorld, 1.0);
	// An outline's edge as a band, as WebGpuView's vsLine draws it.
	if (outline > 0.5) {
		vec3 grow = (s + vec3(0.04)) / max(s, vec3(1e-4));
		vec4 a = viewProj * vec4(m * (pos * grow) + p, 1.0);
		vec4 b = viewProj * vec4(m * (nrm * grow) + p, 1.0);
		bool end = (gl_VertexID & 2) == 2;
		float side = (gl_VertexID & 1) == 1 ? 1.0 : -1.0;
		vec2 dir = normalize((b.xy / max(b.w, 1e-4) - a.xy / max(a.w, 1e-4)) * screen.xy + vec2(1e-6, 0.0));
		vec2 off = (vec2(-dir.y, dir.x) * side + dir * (end ? 1.0 : -1.0)) * screen.z / screen.xy;
		gl_Position = end ? b : a;
		gl_Position.xy += off * gl_Position.w;
	}
	vColour = pow(colour.rgb, vec3(2.2));
	vId = id;
	// A handle's depth squeezed into the front hundredth, as in WebGpuView.
	if (handle > 0.5) gl_Position.z = ((gl_Position.z / gl_Position.w + 1.0) * 0.01 - 1.0) * gl_Position.w;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vColour; in vec3 vWorld; in vec3 vNormal; flat in uint vId;
uniform float outline; uniform vec3 select; uniform float handle; uniform float alpha;
${COMMON}
out vec4 o;
void main() {
	vec3 n = normalize(vNormal);
	if (outline > 0.5) o = vec4(select, 1.0);
	else if (handle > 0.5) o = vec4(pow(vColour * (0.72 + 0.38 * max(dot(n, normalize(vec3(0.4, 1.0, 0.25))), 0.0)), vec3(1.0 / 2.2)), alpha);
	else o = vec4(display(lit(vColour, n, vWorld)), 1.0);
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
	private edgeMesh!: { vertices: WebGLBuffer; indices: WebGLBuffer; count: number };
	private selection: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number } | null =
		null;
	private pickFbo!: WebGLFramebuffer;
	private pickColour!: WebGLRenderbuffer;
	private pickDepth!: WebGLRenderbuffer;
	private width = 1;
	private height = 1;

	private canvas: HTMLCanvasElement | null = null;

	async init(canvas: HTMLCanvasElement, scene: PlaceScene): Promise<void> {
		this.canvas = canvas;
		const gl = canvas.getContext("webgl2", {
			antialias: true,
			powerPreference: "high-performance",
		});
		if (!gl) throw new Error("no WebGL2");
		this.gl = gl;
		this.main = this.link(VS, FS);
		this.ids = this.link(VS, FS_ID);
		this.over = this.link(VS_OVER, FS_OVER);
		this.skyProgram = this.link(VS_SKY, FS_SKY);
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
		for (const d of this.draws) gl.deleteVertexArray(d.vao);
		for (const b of this.sceneBuffers) gl.deleteBuffer(b);
		this.draws = [];
		this.sceneBuffers = [];
		for (const kind of SCENE_KINDS) {
			const { data, count } = scene.kinds[kind];
			if (count === 0) continue;
			const mesh = meshFor(kind);
			const vb = this.buffer(gl.ARRAY_BUFFER, mesh.vertices);
			const eb = this.buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
			const ib = this.buffer(gl.ARRAY_BUFFER, data);
			this.sceneBuffers.push(vb, eb, ib);
			this.draws.push({ vao: this.vao(vb, ib, eb), indexCount: mesh.indices.length, count });
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
		const band = SELECT_WIDTH * (this.width / (this.canvas?.clientWidth || this.width));
		gl.uniform3f(prog.screen, this.width, this.height, band);
		gl.uniform3f(prog.select, SELECT[0], SELECT[1], SELECT[2]);
		gl.uniform1f(prog.handle, 0);
	}

	private solids(): void {
		const gl = this.gl;
		for (const d of this.draws) {
			gl.bindVertexArray(d.vao);
			gl.drawElementsInstanced(gl.TRIANGLES, d.indexCount, gl.UNSIGNED_SHORT, 0, d.count);
		}
		gl.bindVertexArray(null);
	}

	draw(camera: Camera): void {
		const gl = this.gl;
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
		if (this.selection) {
			this.use(this.main, camera, true);
			gl.disable(gl.DEPTH_TEST);
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
		const out = new Uint32Array(4);
		gl.readPixels(px, py, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, out);
		gl.disable(gl.SCISSOR_TEST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return out[0] - 1;
	}
}
