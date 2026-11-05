/**
 * The viewport's renderer where WebGPU is: sized to its canvas, drawn only
 * when asked, with the selection outlined over everything.
 */

import { type LightingParams, lightingBlock } from "../../core/rbx/lighting.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { boxEdges, meshFor } from "./geometry.js";
import { HANDLE_KINDS, type Handles, handleMesh } from "./handles.js";
import { invert, lookAt, multiply, perspective } from "./math.js";
import { type Camera, FOV, HANDLE_ALPHA, SELECT, type ViewRenderer } from "./view.js";

// WebGPU's flags, as the spec numbers them: TypeScript's DOM types have the
// interfaces but not these namespaces.
const BUFFER = { MAP_READ: 0x1, COPY_DST: 0x8, INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40 } as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;
const TEXTURE = { COPY_SRC: 0x1, RENDER_ATTACHMENT: 0x10 } as const;
const MAP_READ = 0x1;

const SAMPLES = 4;
const SHADER = /* wgsl */ `
struct U {
	viewProj: mat4x4f, invViewProj: mat4x4f,
	sun: vec4f, sunColour: vec4f, ambient: vec4f, zenith: vec4f, horizon: vec4f, ground: vec4f,
	camPos: vec4f, select: vec4f, fog: vec4f, fogColour: vec4f, hazeColour: vec4f,
};
@group(0) @binding(0) var<uniform> u: U;
struct VIn {
	@location(0) pos: vec3f, @location(1) nrm: vec3f,
	@location(2) c0: vec3f, @location(3) c1: vec3f, @location(4) c2: vec3f, @location(5) p: vec3f,
	@location(6) colour: vec4f, @location(7) id: u32,
};
struct VOut {
	@builtin(position) clip: vec4f, @location(0) colour: vec3f, @location(1) @interpolate(flat) id: u32,
	@location(2) world: vec3f, @location(3) normal: vec3f,
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
// A surface: the sun with a soft highlight, the ambient, the sky's fill, then
// the haze between it and the camera.
fn lit(albedo: vec3f, n: vec3f, world: vec3f) -> vec3f {
	let toEye = u.camPos.xyz - world;
	let d = length(toEye);
	let v = toEye / max(d, 1e-4);
	let l = u.sun.xyz;
	let ndl = max(dot(n, l), 0.0);
	let h = normalize(l + v);
	let spec = pow(max(dot(n, h), 0.0), 40.0) * 0.12;
	let fill = u.ambient.rgb * (0.9 + 0.1 * n.y);
	var c = albedo * (fill + u.sunColour.rgb * ndl) + u.sunColour.rgb * spec * ndl;
	if (u.fog.z > 0.5) {
		c = mix(c, u.fogColour.rgb, clamp((d - u.fog.x) / max(u.fog.y - u.fog.x, 1.0), 0.0, 1.0));
	} else {
		// Thinner with height, as air is.
		let thin = exp(-max(world.y, 0.0) * 0.004);
		c = mix(c, u.hazeColour.rgb, 1.0 - exp(-d * u.horizon.w * thin));
	}
	return c;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f { return vec4f(display(lit(i.colour, normalize(i.normal), i.world)), 1.0); }
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
// depth squeezed into the front hundredth of the range, so it is in front of
// the place and still in front of or behind the other handles as it should be.
@vertex fn vsHandle(v: VIn) -> VOut {
	var o = shade(v);
	o.clip.z = o.clip.z * 0.01;
	return o;
}
@fragment fn fsHandle(i: VOut) -> @location(0) vec4f {
	let n = normalize(i.normal);
	let shadeK = 0.72 + 0.38 * max(dot(n, normalize(vec3f(0.4, 1.0, 0.25))), 0.0);
	return vec4f(pow(i.colour * shadeK, vec3f(1.0 / 2.2)), u.sun.w);
}
@vertex fn vsLine(v: VIn) -> VOut {
	let m = mat3x3f(v.c0, v.c1, v.c2);
	var o: VOut;
	// A hair outside the part, so the outline is not lost in its faces.
	o.world = m * (v.pos * 1.02) + v.p;
	o.clip = u.viewProj * vec4f(o.world, 1.0);
	o.colour = u.select.rgb;
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
@fragment fn fsLine(i: VOut) -> @location(0) vec4f { return vec4f(i.colour, 1.0); }
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
	private edges!: { vertices: GPUBuffer; indices: GPUBuffer; indexCount: number };
	private selection: { buffer: GPUBuffer; count: number } | null = null;
	private msaa?: GPUTexture;
	private depth?: GPUTexture;
	private pickTarget?: GPUTexture;
	private pickDepth?: GPUTexture;
	private pickRead!: GPUBuffer;
	private width = 1;
	private height = 1;

	async init(canvas: HTMLCanvasElement, scene: PlaceScene): Promise<void> {
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
				],
			},
		];
		const layout = d.createBindGroupLayout({
			entries: [{ binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: {} }],
		});
		const pipelineLayout = d.createPipelineLayout({ bindGroupLayouts: [layout] });
		const depth = {
			format: "depth32float" as const,
			depthWriteEnabled: true,
			depthCompare: "less" as const,
		};
		this.solid = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vs", buffers },
			fragment: { module, entryPoint: "fs", targets: [{ format: this.format }] },
			primitive: { topology: "triangle-list", cullMode: "back" },
			depthStencil: depth,
			multisample: { count: SAMPLES },
		});
		// Over everything, as Studio's selection box is.
		this.lines = d.createRenderPipeline({
			layout: pipelineLayout,
			vertex: { module, entryPoint: "vsLine", buffers },
			fragment: { module, entryPoint: "fsLine", targets: [{ format: this.format }] },
			primitive: { topology: "line-list" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
			multisample: { count: SAMPLES },
		});
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
		this.uniform = d.createBuffer({ size: 304, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
		this.bind = d.createBindGroup({
			layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
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
		for (const d of this.draws) for (const b of [d.vertices, d.indices, d.instances]) b.destroy();
		this.draws = [];
		for (const kind of SCENE_KINDS) {
			const { data, count } = scene.kinds[kind];
			if (count === 0) continue;
			const mesh = meshFor(kind);
			this.draws.push({
				vertices: this.make(mesh.vertices, BUFFER.VERTEX),
				indices: this.make(mesh.indices, BUFFER.INDEX),
				indexCount: mesh.indices.length,
				instances: this.make(data, BUFFER.VERTEX),
				count,
			});
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
	}

	setSelection(boxes: Float32Array): void {
		this.selection?.buffer.destroy();
		const count = boxes.length / SCENE_STRIDE;
		this.selection = count > 0 ? { buffer: this.make(boxes, BUFFER.VERTEX), count } : null;
	}

	private setCamera(camera: Camera): void {
		const vp = multiply(
			perspective(FOV, this.width / this.height, camera.near, camera.far, true),
			lookAt(camera.eye, camera.at),
		);
		const u = new Float32Array(76);
		u.set(vp, 0);
		u.set(invert(vp), 16);
		u.set(lightingBlock(this.lighting, camera.eye, SELECT, HANDLE_ALPHA), 32);
		this.device.queue.writeBuffer(this.uniform, 0, u);
	}

	private solids(pass: GPURenderPassEncoder): void {
		for (const draw of this.draws) {
			pass.setVertexBuffer(0, draw.vertices);
			pass.setVertexBuffer(1, draw.instances);
			pass.setIndexBuffer(draw.indices, "uint16");
			pass.drawIndexed(draw.indexCount, draw.count);
		}
	}

	draw(camera: Camera): void {
		this.setCamera(camera);
		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.msaa!.createView(),
					resolveTarget: this.context.getCurrentTexture().createView(),
					clearValue: { r: 0.56, g: 0.71, b: 0.86, a: 1 },
					loadOp: "clear",
					storeOp: "discard",
				},
			],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.skyPipeline);
		pass.draw(3);
		pass.setPipeline(this.solid);
		this.solids(pass);
		if (this.selection) {
			pass.setPipeline(this.lines);
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
				depthClearValue: 1,
				depthLoadOp: "clear",
				depthStoreOp: "discard",
			},
		});
		pass.setBindGroup(0, this.bind);
		pass.setPipeline(this.ids);
		pass.setScissorRect(Math.min(x, this.width - 1), Math.min(y, this.height - 1), 1, 1);
		this.solids(pass);
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
