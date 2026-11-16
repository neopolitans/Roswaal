/**
 * WebGpuView's Beams and ParticleEmitters: the quads `EffectsSim` lays out,
 * drawn after the see-through parts, farthest first, hidden by what is in
 * front and hiding nothing. Each image is the one a Decal of it would show,
 * bound in the same group; until it arrives, a stand-in.
 *
 * Blended as Roblox documents LightEmission: 0 over what is behind, 1 added
 * to it, and between the two in between, in one blend by premultiplying.
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

const BUFFER = { INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, COPY_DST: 0x8 } as const;
const STAGE = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;
const TEXTURE = { COPY_DST: 0x2, TEXTURE_BINDING: 0x4 } as const;

/** The effects' shader: its own block, and the image in group 1 as Decals have it. */
export const EFFECT_SHADER = /* wgsl */ `
struct FxU {
	viewProj: mat4x4f,
	camPos: vec4f, light: vec4f, fog: vec4f, fogColour: vec4f, hazeColour: vec4f,
};
@group(0) @binding(0) var<uniform> fx: FxU;
@group(1) @binding(0) var image: texture_2d<f32>;
@group(1) @binding(1) var imageSampler: sampler;
struct FxOut {
	@builtin(position) clip: vec4f, @location(0) world: vec3f, @location(1) uv: vec2f,
	@location(2) colour: vec4f, @location(3) look: vec3f,
};
@vertex fn vsFx(@location(0) pos: vec3f, @location(1) uv: vec2f, @location(2) colour: vec4f, @location(3) look: vec3f) -> FxOut {
	var o: FxOut;
	o.clip = fx.viewProj * vec4f(pos, 1.0);
	o.world = pos;
	o.uv = uv;
	o.colour = colour;
	o.look = look;
	return o;
}
fn fxAces(colour: vec3f) -> vec3f {
	let i = mat3x3f(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
	let o = mat3x3f(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
	let v = i * colour;
	let a = v * (v + 0.0245786) - 0.000090537;
	let b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return clamp(o * (a / b), vec3f(0.0), vec3f(1.0));
}
fn fxDisplay(c: vec3f) -> vec3f {
	return pow(fxAces(c * fx.camPos.w), vec3f(1.0 / 2.2));
}
// How much of the air's colour lies over a point this far off: the fog, or the haze.
fn fxAir(d: f32, y: f32) -> vec4f {
	if (fx.fogColour.w < 0.5) { return vec4f(0.0); }
	if (fx.fog.z > 0.5) {
		let k = clamp((d - fx.fog.x) / max(fx.fog.y - fx.fog.x, 1.0), 0.0, 1.0);
		return vec4f(fx.fogColour.rgb, k);
	}
	let thin = exp(-max(y, 0.0) * 0.004);
	return vec4f(fx.hazeColour.rgb, 1.0 - exp(-d * fx.fog.w * thin));
}
@fragment fn fsFx(i: FxOut) -> @location(0) vec4f {
	let t = textureSample(image, imageSampler, i.uv);
	// The render heatmap: the pixel's share, added to what is behind.
	if (fx.light.w > 4.5) { return vec4f(fx.hazeColour.w, 0.0, 0.0, 0.0); }
	let a = t.a * i.colour.a;
	let albedo = pow(t.rgb * i.colour.rgb, vec3f(2.2));
	let air = fxAir(length(fx.camPos.xyz - i.world), i.world.y);
	// Lit, through the display curve as a face is; or its own colour times Brightness.
	let lit = fxDisplay(mix(albedo * fx.light.rgb, air.rgb, air.a));
	let own = pow(min(mix(albedo * i.look.z, air.rgb, air.a), vec3f(1.0)), vec3f(1.0 / 2.2));
	var c = mix(own, lit, clamp(i.look.y, 0.0, 1.0));
	if (fx.light.w > 2.5) { c = pow(min(albedo, vec3f(1.0)), vec3f(1.0 / 2.2)); }
	let added = clamp(i.look.x, 0.0, 1.0);
	return vec4f(c * a, a * (1.0 - added));
}
`;

/** The renderer's own, which the effects share: its pipeline maker, and its images' group. */
export interface GpuEffectsHost {
	device: GPUDevice;
	format: GPUTextureFormat;
	samples: number;
	imageLayout: GPUBindGroupLayout;
	imageSampler: GPUSampler;
	/** A pipeline made the way the renderer makes its own, set once it is ready. */
	pipeline(set: (p: GPURenderPipeline) => void, desc: GPURenderPipelineDescriptor): void;
	/** An image's group, once it has arrived. */
	imageGroup(asset: string): GPUBindGroup | undefined;
}

export class GpuEffects {
	private sim = new EffectsSim(undefined);
	private drawn!: GPURenderPipeline;
	private layout: GPUBindGroupLayout;
	private uniform: GPUBuffer;
	private group: GPUBindGroup;
	private vertices: GPUBuffer | null = null;
	private indices: GPUBuffer | null = null;
	/** Quads the buffers hold room for. */
	private room = 0;
	private fallbacks = new Map<string, GPUBindGroup>();
	/** What the last frame drew, for the Rendering panel, and whether it moves. */
	last: Pick<EffectFrame, "beams" | "particles" | "moving"> & { draws: number; quads: number } = {
		beams: 0,
		particles: 0,
		moving: false,
		draws: 0,
		quads: 0,
	};

	constructor(private readonly host: GpuEffectsHost) {
		const d = host.device;
		this.layout = d.createBindGroupLayout({
			entries: [{ binding: 0, visibility: STAGE.VERTEX | STAGE.FRAGMENT, buffer: {} }],
		});
		this.uniform = d.createBuffer({
			size: EFFECT_BLOCK * 4,
			usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
		});
		this.group = d.createBindGroup({
			layout: this.layout,
			entries: [{ binding: 0, resource: { buffer: this.uniform } }],
		});
		const module = d.createShaderModule({ code: EFFECT_SHADER });
		host.pipeline((p) => (this.drawn = p), {
			layout: d.createPipelineLayout({ bindGroupLayouts: [this.layout, host.imageLayout] }),
			vertex: {
				module,
				entryPoint: "vsFx",
				buffers: [
					{
						arrayStride: EFFECT_VERTEX * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" },
							{ shaderLocation: 1, offset: 12, format: "float32x2" },
							{ shaderLocation: 2, offset: 20, format: "unorm8x4" },
							{ shaderLocation: 3, offset: 24, format: "float32x3" },
						],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fsFx",
				targets: [
					{
						format: host.format,
						blend: {
							color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
						},
					},
				],
			},
			// Both sides: a beam or a turned particle is seen from behind too.
			primitive: { topology: "triangle-list", cullMode: "none" },
			depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "greater" },
			multisample: { count: host.samples },
		});
		for (const kind of [FALLBACK_WHITE, FALLBACK_DOT, FALLBACK_BAND]) {
			const size = 64;
			const texture = d.createTexture({
				size: [size, size],
				format: "rgba8unorm",
				usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
			});
			d.queue.writeTexture(
				{ texture },
				fallbackPixels(kind, size) as BufferSource,
				{ bytesPerRow: size * 4 },
				[size, size],
			);
			this.fallbacks.set(
				kind,
				d.createBindGroup({
					layout: host.imageLayout,
					entries: [
						{ binding: 0, resource: texture.createView() },
						{ binding: 1, resource: host.imageSampler },
					],
				}),
			);
		}
	}

	/** The scene's effects, started afresh. */
	setEffects(effects: SceneEffects | undefined): void {
		this.sim = new EffectsSim(effects);
	}

	/**
	 * This frame's effects into `pass`, after the see-through parts. Leaves
	 * group 0 bound to the effects' own block: the caller binds its own again.
	 */
	draw(
		pass: GPURenderPassEncoder,
		camera: Camera,
		width: number,
		height: number,
		lighting: LightingParams | undefined,
		render: RenderSettings,
		show: EffectShow,
		now: number,
	): void {
		const mode = render.mode;
		const none = { beams: 0, particles: 0, moving: false, draws: 0, quads: 0 };
		// The lighting heatmap is of lights reaching surfaces; the wireframe of the place's shapes.
		if (this.sim.empty || !lighting || mode === "wireframe" || mode === "lights" || !this.drawn) {
			this.last = none;
			return;
		}
		const ready = (asset: string) => this.host.imageGroup(asset) !== undefined;
		const aspect = width / height;
		const frame = this.sim.frame(
			{ eye: camera.eye, at: camera.at, aspect, fov: FOV },
			now,
			show,
			ready,
		);
		this.last = { ...frame, draws: 0, quads: frame.quads };
		if (frame.quads === 0) return;
		const d = this.host.device;
		if (frame.quads > this.room) {
			this.room = Math.max(frame.quads, this.room * 2, 256);
			this.vertices?.destroy();
			this.indices?.destroy();
			this.vertices = d.createBuffer({
				size: this.room * QUAD_VERTICES * EFFECT_VERTEX * 4,
				usage: BUFFER.VERTEX | BUFFER.COPY_DST,
			});
			const indices = quadIndices(this.room);
			this.indices = d.createBuffer({
				size: indices.byteLength,
				usage: BUFFER.INDEX | BUFFER.COPY_DST,
			});
			d.queue.writeBuffer(this.indices, 0, indices);
		}
		if (!this.vertices || !this.indices) return;
		d.queue.writeBuffer(this.vertices, 0, frame.vertices);
		const viewProj = multiply(
			perspective(FOV, aspect, camera.near, camera.far, true, true),
			lookAt(camera.eye, camera.at),
		);
		d.queue.writeBuffer(
			this.uniform,
			0,
			effectBlock(
				viewProj,
				camera.eye,
				lighting,
				RENDER_MODE_CODE[mode],
				render.show.haze,
				EFFECT_COST / COST_FULL,
			),
		);
		pass.setPipeline(this.drawn);
		pass.setBindGroup(0, this.group);
		pass.setVertexBuffer(0, this.vertices);
		pass.setIndexBuffer(this.indices, "uint32");
		for (const batch of frame.batches) {
			const group = this.fallbacks.get(batch.texture) ?? this.host.imageGroup(batch.texture);
			if (!group) continue;
			pass.setBindGroup(1, group);
			pass.drawIndexed(batch.count * 6, 1, batch.first * 6);
			this.last.draws++;
		}
	}

	destroy(): void {
		this.vertices?.destroy();
		this.indices?.destroy();
		this.uniform.destroy();
	}
}
