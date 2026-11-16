/**
 * What both renderers do, so the viewport does not know which it has: draw a
 * view, outline what is selected, say what is under a pixel, and follow the
 * canvas when it changes size.
 */

import type { LightingParams, PostEffects } from "../../core/rbx/lighting.js";
import { MATERIAL_SHADE, MATERIALS } from "../../core/rbx/materials.js";
import { type FileMesh, meshBounds } from "../../core/rbx/mesh.js";
import {
	LIGHT_STRIDE,
	LIGHT_SURFACE,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneImage,
	type SceneKind,
	type SceneMesh,
} from "../../core/rbx/scene.js";
import type { Handles } from "./handles.js";
import { lookAt, type Mat4, multiply } from "./math.js";

export interface Camera {
	eye: number[];
	at: number[];
	/** The nearest the view sees: a little, in proportion to how far out the camera is. */
	near: number;
	/** How far the view reaches: well past anything in a place, as Studio's view does. */
	far: number;
}

export interface ViewRenderer {
	readonly backend: "WebGPU" | "WebGL2";
	init(canvas: HTMLCanvasElement, scene: PlaceScene): Promise<void>;
	resize(width: number, height: number): void;
	/**
	 * The boxes to outline, in the scene's own instance layout, each in the
	 * colour and alpha its colour word holds: what is picked, and what the
	 * pointer is over.
	 */
	setSelection(boxes: Float32Array): void;
	/** How wide the outline is, in CSS pixels, and whether what is in front of it hides it. */
	setOutline(width: number, hideBehind: boolean): void;
	/** Whether see-through Glass hides the see-through parts behind it, as it does in Studio. */
	setGlassHides(on: boolean): void;
	/** Coloured lines over everything -- a tool's handles: x, y, z, r, g, b for each end. */
	setOverlay(lines: Float32Array): void;
	/** The tool's handles, as solid shapes drawn in front of everything. */
	setHandles(handles: Handles): void;
	/** The place's light: Lighting, its Atmosphere and its Sky. */
	setLighting(lighting: LightingParams): void;
	/** The place drawn again, after an instance is added. */
	setScene(scene: PlaceScene): void;
	draw(camera: Camera): void;
	/** The instance id under a pixel, or -1 for the sky. */
	pick(camera: Camera, x: number, y: number): Promise<number>;
	/** A material texture, as its mip levels, into its layer; drawn from then on. */
	setLook(layer: number, levels: HTMLCanvasElement[]): void;
	/**
	 * A Decal's or Texture's image, by the asset id the scene's `images` name;
	 * the faces showing it are drawn from then on.
	 */
	setImage(asset: string, image: ImageBitmap): void;
	/**
	 * A Sky's six images, in `SKY_FACES` order and all one size, drawn in place
	 * of the sky made here; or none, for that sky again.
	 */
	setSky(faces: readonly ImageBitmap[] | null): void;
	/** A Sky's own sun image, drawn where the sun is; or none. */
	setSunImage(image: ImageBitmap | null): void;
	/**
	 * Meshes, by their place in the scene's `meshes`, as `meshGeometry` makes
	 * them: rows naming one are drawn as it from then on, the rest as boxes.
	 */
	setMeshes(meshes: ReadonlyMap<number, MeshGeometry>): void;
	/** Whether the place's post effects are drawn: Settings › Scene view. */
	setPostEffects(on: boolean): void;
	/** Gives the GPU back: a browser keeps only so many contexts. */
	destroy(): void;
}

/** A Decal or Texture vertex: position, normal, image position, then tint and alpha. */
export const IMAGE_VERTEX = 12;

/** When an image is drawn: see `SceneImage.layer`. */
export type ImageLayer = "solid" | "seeThrough";

/**
 * Neon's glow, as measured in Studio: blurred this wide, as a share of the
 * view's height, and added over the finished frame in linear light at this
 * strength, so a face's own edge glows half as bright again as its colour.
 */
export const GLOW_SPREAD = 0.0134;
export const GLOW_GAIN = 2.6;

/**
 * Studio's Neon glow is its bloom: a place with no BloomEffect, or one that is
 * off, glows as a BloomEffect of these settings does, and one that is on
 * replaces them. The glow above was measured at these.
 */
export const BLOOM_DEFAULT = { intensity: 1, size: 24, threshold: 2 };

/** How the glow is drawn: see `glowShape`. */
export interface GlowShape {
	/** The blur's sigma, as a share of the view's height. */
	spread: number;
	/** How strongly it is added over the frame, in linear light. */
	gain: number;
	/**
	 * For Neon: the brightest channel's light at which it starts to glow, the
	 * light taken off before it does, and the Transparency at which its glow is
	 * gone.
	 */
	gate: [number, number, number, number];
}

/**
 * Per Size: the halo's width and strength, as shares of Size 24's, fitted to
 * Studio's captures of Size 8, 24 and 56 (sigma 3.9, 13.9 and 27.1 pixels in
 * a view 1049 tall). The width does not grow in step with Size, and a wide
 * halo is stronger, not the same light spread thinner.
 */
const BLOOM_SIZES: [number, number, number][] = [
	[0, 0, 1.08],
	[8, 0.28, 1.08],
	[24, 1, 1],
	[56, 1.95, 1.92],
];

/**
 * Per Threshold: where Neon starts to glow, the Transparency its glow is gone
 * at, and how much stronger it is than at Threshold 2. Fitted to Studio's
 * captures of greys and olive at several Transparencies, at Threshold 0, 0.5,
 * 1 and 2. Lower Thresholds let dimmer and more see-through Neon glow.
 */
const BLOOM_THRESHOLDS: [number, number, number, number][] = [
	[0, 0.45, 1.6, 1.5],
	[0.5, 0.55, 1.25, 1.35],
	[1, 0.65, 0.9, 1.25],
	[2, 0.7, 0.3, 1],
];

/** `table`'s rows, by their first column, read at `x`: straight lines between them, the last one carried on past them. */
function between(table: number[][], x: number): number[] {
	const at = table.findIndex((row) => row[0] >= x);
	const i = Math.max(1, at < 0 ? table.length - 1 : at);
	const [a, b] = [table[i - 1], table[i]];
	const k = (x - a[0]) / (b[0] - a[0]);
	return a.map((v, c) => v * (1 - k) + b[c] * k);
}

/**
 * The glow a place's BloomEffect asks for, or Studio's own when it has none
 * on, or post effects are off in Settings. Its strength grows more slowly than
 * Intensity does, as Intensity to the 0.6 in Studio's captures of 0.5, 1 and 2.
 * Above Threshold 2 only one capture was taken (10, where nothing glows), so
 * there the start rises by 0.7 a unit, a guess.
 */
export function glowShape(post: PostEffects | undefined, on: boolean): GlowShape {
	const { intensity, size, threshold } = (on && post?.bloom) || BLOOM_DEFAULT;
	const t = Math.max(0, threshold);
	const [, start, gone, strength] =
		t <= 2 ? between(BLOOM_THRESHOLDS, t) : [t, 0.7 + 0.7 * (t - 2), 0.3, 1];
	const [, wide, strong] = between(BLOOM_SIZES, Math.max(0, size));
	return {
		spread: GLOW_SPREAD * Math.max(0, wide),
		gain: GLOW_GAIN * strength * strong * Math.max(0, intensity) ** 0.6,
		gate: [start, 0.15 * t, gone, 0],
	};
}

/**
 * Sky visibility: the place is seen from this many directions over the sky, as
 * depth maps, and a point lit by OutdoorAmbient and the sky's fill by the share
 * of them that see it, as Studio lights only what the sky can reach. The sun's
 * own map comes after them.
 */
export const SKY_VIEWS = 8;
/** Each map's side, in texels: about 4 studs a texel over a place 4,000 studs across. */
export const SKY_MAP = 1024;
/** Floats in the block the shaders read: a matrix a map, then one vec4. */
export const SKY_BLOCK = 16 * (SKY_VIEWS + 1) + 4;

/** Towards the sky: straight up, then the rest round the horizon, 45 degrees above it. */
export function skyDirections(): number[][] {
	const out = [[0, 1, 0]];
	const up = Math.PI / 4;
	for (let k = 0; k < SKY_VIEWS - 1; k++) {
		const a = (k / (SKY_VIEWS - 1)) * 2 * Math.PI;
		out.push([Math.cos(up) * Math.cos(a), Math.sin(up), Math.cos(up) * Math.sin(a)]);
	}
	return out;
}

/** The box round every solid part, or null for a place with none. */
export function sceneBox(scene: PlaceScene): { min: number[]; max: number[] } | null {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (const kind of SCENE_KINDS) {
		const { data, count } = scene.kinds[kind];
		for (let r = 0; r < count; r++) {
			const o = r * SCENE_STRIDE;
			for (let a = 0; a < 3; a++) {
				const half =
					0.5 * (Math.abs(data[o + a]) + Math.abs(data[o + 3 + a]) + Math.abs(data[o + 6 + a]));
				const at = data[o + 9 + a];
				if (!Number.isFinite(at)) continue;
				min[a] = Math.min(min[a], at - half);
				max[a] = Math.max(max[a], at + half);
			}
		}
	}
	return min[0] <= max[0] ? { min, max } : null;
}

/**
 * The place seen from `dir`, towards the sky, square on to it and far enough
 * off to hold all of `box`: an orthographic view, depth 0 at the sky's side.
 * `zeroToOne` for WebGPU's depth, else WebGL's -1 to 1.
 */
export function skyView(
	box: { min: number[]; max: number[] },
	dir: number[],
	zeroToOne: boolean,
): { matrix: Mat4; reach: number } {
	const centre = box.min.map((v, a) => (v + box.max[a]) / 2);
	const reach = Math.hypot(...box.max.map((v, a) => v - box.min[a])) / 2 + 1;
	const eye = centre.map((v, a) => v + dir[a] * reach);
	const view = lookAt(eye, centre, Math.abs(dir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
	const far = 2 * reach;
	const proj = new Float32Array(16);
	proj[0] = 1 / reach;
	proj[5] = 1 / reach;
	proj[10] = zeroToOne ? -1 / far : -2 / far;
	proj[14] = zeroToOne ? 0 : -1;
	proj[15] = 1;
	return { matrix: multiply(proj, view), reach };
}

/**
 * The block the shaders read for sky visibility: each map's view, the sun's
 * last, then a texel's width in studs, depth a stud, and whether the maps are
 * drawn. Off, every point sees all of the sky, as before they existed.
 */
export function skyBlock(
	box: { min: number[]; max: number[] } | null,
	sun: number[],
	zeroToOne: boolean,
): Float32Array {
	const block = new Float32Array(SKY_BLOCK);
	if (!box) return block;
	let reach = 1;
	[...skyDirections(), sun].forEach((dir, k) => {
		const view = skyView(box, dir, zeroToOne);
		block.set(view.matrix, k * 16);
		reach = view.reach;
	});
	block.set([(2 * reach) / SKY_MAP, (zeroToOne ? 1 : 2) / (2 * reach), 0, 1], 16 * (SKY_VIEWS + 1));
	return block;
}

/**
 * The lights are found per pixel through a hashed grid: the world in cells
 * this many studs wide, each cell's lights listed under its hash. Two cells
 * that share a hash share a list, which only costs a light that is then too
 * far off to count.
 */
export const LIGHT_CELL = 16;
export const LIGHT_TABLE = 65536;
/** At most this many lights are added at a pixel. */
export const LIGHT_MOST = 64;

/**
 * A fingerprint of numbers, FNV-1a over their float bits: to tell a place
 * sent again after an edit from one whose parts or lights moved, so an edit to
 * Lighting does not redraw the sky's maps or rebuild the lights' grid.
 */
export function fingerprint(...lists: (ArrayLike<number> | undefined)[]): number {
	let h = 0x811c9dc5;
	for (const list of lists) {
		if (!list) continue;
		const words =
			list instanceof Float32Array
				? new Uint32Array(list.buffer, list.byteOffset, list.length)
				: new Uint32Array(Float32Array.from(list).buffer);
		for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 0x01000193);
		h = Math.imul(h ^ words.length, 0x01000193);
	}
	return h >>> 0;
}

/** A fingerprint of what a place's solid parts are and where: see fingerprint. */
export function sceneFingerprint(scene: PlaceScene): number {
	return fingerprint(...SCENE_KINDS.map((k) => scene.kinds[k].data));
}

/** A cell's hash, as the shaders work it out: see LIGHT_CELL. */
export function lightHash(cx: number, cy: number, cz: number): number {
	return (
		((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) >>> 0) &
		(LIGHT_TABLE - 1)
	);
}

/**
 * Each hash's lights: `table` holds an offset into `index` and a count per
 * hash, `index` the lights' numbers. A light is listed in every cell its
 * Range reaches, once a hash.
 */
export function lightGrid(lights: readonly number[] | undefined): {
	table: Uint32Array;
	index: Uint32Array;
} {
	const buckets = new Map<number, Set<number>>();
	const count = (lights?.length ?? 0) / LIGHT_STRIDE;
	for (let i = 0; i < count; i++) {
		const o = i * LIGHT_STRIDE;
		const c = [lights![o], lights![o + 1], lights![o + 2]];
		// A SurfaceLight reaches its Range from anywhere on its face.
		const face =
			lights![o + 7] === LIGHT_SURFACE
				? Math.hypot(lights![o + 12], lights![o + 13], lights![o + 14]) +
					Math.hypot(lights![o + 16], lights![o + 17], lights![o + 18])
				: 0;
		const reach = lights![o + 3] + face;
		const lo = c.map((v) => Math.floor((v - reach) / LIGHT_CELL));
		const hi = c.map((v) => Math.floor((v + reach) / LIGHT_CELL));
		for (let x = lo[0]; x <= hi[0]; x++)
			for (let y = lo[1]; y <= hi[1]; y++)
				for (let z = lo[2]; z <= hi[2]; z++) {
					// The cell's nearest point to the light, against the reach.
					const near = [x, y, z].map((k, a) =>
						Math.min(Math.max(c[a], k * LIGHT_CELL), (k + 1) * LIGHT_CELL),
					);
					if (Math.hypot(near[0] - c[0], near[1] - c[1], near[2] - c[2]) > reach) continue;
					const h = lightHash(x, y, z);
					let set = buckets.get(h);
					if (!set) buckets.set(h, (set = new Set()));
					set.add(i);
				}
	}
	const table = new Uint32Array(LIGHT_TABLE * 2);
	const index: number[] = [];
	for (const [h, set] of buckets) {
		table[h * 2] = index.length;
		table[h * 2 + 1] = set.size;
		index.push(...set);
	}
	return { table, index: new Uint32Array(index.length > 0 ? index : [0]) };
}

/**
 * The sun's shadow near the camera: maps of the place as the sun sees it, each
 * reaching this far from the camera, sharp close by and coarser further out.
 * Past the last, the whole-place map (skyBlock's) takes over.
 */
export const SUN_CASCADES = [64, 256, 1024];
/** Each cascade's side, in texels. */
export const CASCADE_MAP = 1024;
/** Floats in the block the shaders read: a matrix a cascade, how far each reaches, and a texel's width in each. */
export const CASCADE_BLOCK = 16 * SUN_CASCADES.length + 8;

/**
 * The cascades for a view: each slice of the view, held in a sphere, seen by
 * the sun square on from beyond the whole place, so what casts a shadow into
 * the slice from outside it still does. Each map is moved only by whole texels
 * as the camera moves, so its edges do not crawl. Then how far each reaches,
 * the shadows' softness as a width in studs, and their texels' widths with
 * whether they are on.
 */
export function cascadeBlock(
	camera: Camera,
	aspect: number,
	sun: number[],
	box: { min: number[]; max: number[] } | null,
	softness: number,
	on: boolean,
	zeroToOne: boolean,
): Float32Array {
	const block = new Float32Array(CASCADE_BLOCK);
	const n = SUN_CASCADES.length;
	// GlobalShadows off: no shadow from the sun at all, the whole-place map's included.
	if (!on) block[n * 16 + 7] = 2;
	if (!box || !on) return block;
	const back = Math.hypot(...sun) > 0 ? sun.map((v) => v / Math.hypot(...sun)) : [0, 1, 0];
	const up0 = Math.abs(back[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
	const cross = (a: number[], b: number[]) => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
	const unit = (a: number[]) => a.map((v) => v / Math.hypot(...a));
	const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	const x = unit(cross(up0, back));
	const y = cross(back, x);
	const ahead = unit(camera.at.map((v, i) => v - camera.eye[i]));
	const tan = Math.tan(FOV / 2);
	// How far the place reaches along the sun's line, either side of a point.
	const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
		k & 1 ? box.max[0] : box.min[0],
		k & 2 ? box.max[1] : box.min[1],
		k & 4 ? box.max[2] : box.min[2],
	]);
	let near = 0;
	SUN_CASCADES.forEach((far, i) => {
		const mid = (near + far) / 2;
		const corner = (d: number) => Math.hypot(d * tan * aspect, d * tan, d - mid);
		const radius = Math.max(corner(near), corner(far)) + 1;
		let centre = camera.eye.map((v, a) => v + ahead[a] * mid);
		const texel = (2 * radius) / CASCADE_MAP;
		const cx = dot(centre, x);
		const cy = dot(centre, y);
		centre = centre.map(
			(v, a) =>
				v +
				x[a] * (Math.round(cx / texel) * texel - cx) +
				y[a] * (Math.round(cy / texel) * texel - cy),
		);
		const along = corners.map((c) => dot(c, back) - dot(centre, back));
		const top = Math.max(radius, ...along) + 1;
		const depth = top - Math.min(-radius, ...along) + 1;
		const eye = centre.map((v, a) => v + back[a] * top);
		const view = new Float32Array(16);
		[x, y, back].forEach((axis, r) => {
			view[r] = axis[0];
			view[4 + r] = axis[1];
			view[8 + r] = axis[2];
			view[12 + r] = -dot(axis, eye);
		});
		view[15] = 1;
		const proj = new Float32Array(16);
		proj[0] = 1 / radius;
		proj[5] = 1 / radius;
		proj[10] = zeroToOne ? -1 / depth : -2 / depth;
		proj[14] = zeroToOne ? 0 : -1;
		proj[15] = 1;
		block.set(multiply(proj, view), i * 16);
		block[n * 16 + i] = far;
		block[n * 16 + 4 + i] = texel;
		near = far;
	});
	// Softness as a width in studs: ShadowSoftness 0.2 blurs an edge over about a third of a stud.
	block[n * 16 + 3] = 0.1 + Math.max(0, Math.min(1, softness)) * 1.2;
	block[n * 16 + 7] = 1;
	return block;
}

/** How wide the glow's blur is, in its own texels, for a glow `high` texels high. */
export function glowSpread(high: number, shape?: GlowShape): number {
	return (shape?.spread ?? GLOW_SPREAD) * high;
}

/** One Decal or Texture quad, for ordering: its image, its layer and its middle. */
export interface ImageQuad {
	asset: string;
	layer: ImageLayer;
	centre: number[];
}

/**
 * The scene's Decals and Textures as triangles, six vertices a quad in the
 * scene's order, with what each quad is for ordering them every frame.
 */
export function imageQuads(images: readonly SceneImage[]): {
	vertices: Float32Array;
	quads: ImageQuad[];
} {
	const vertices = new Float32Array(images.length * 6 * IMAGE_VERTEX);
	const quads: ImageQuad[] = [];
	let at = 0;
	for (const image of images) {
		// Top left, bottom right, top right; top left, bottom left, bottom right:
		// anticlockwise seen from in front of the face, which is what both
		// renderers draw. The other way round, every image was culled as the
		// back of its quad.
		for (const corner of [0, 2, 1, 0, 3, 2]) {
			vertices.set(image.corners.slice(corner * 3, corner * 3 + 3), at);
			vertices.set(image.normal, at + 3);
			vertices.set(image.uv.slice(corner * 2, corner * 2 + 2), at + 6);
			vertices.set([...image.tint, image.alpha], at + 8);
			at += IMAGE_VERTEX;
		}
		const c = image.corners;
		quads.push({
			asset: image.asset,
			layer: image.layer ?? "solid",
			centre: [0, 1, 2].map((k) => (c[k] + c[3 + k] + c[6 + k] + c[9 + k]) / 4),
		});
	}
	return { vertices, quads };
}

/**
 * Which quads of a layer to draw, farthest from `eye` first, whose image has
 * arrived. Blended and writing no depth, the nearer image has to come last to
 * be in front: drawn as they came, a far image could cover a near one.
 */
export function imageOrder(
	quads: readonly ImageQuad[],
	layer: ImageLayer,
	eye: readonly number[],
	ready: (asset: string) => boolean,
): number[] {
	const order: [number, number][] = [];
	quads.forEach((quad, i) => {
		if (quad.layer !== layer || !ready(quad.asset)) return;
		const d =
			(quad.centre[0] - eye[0]) ** 2 +
			(quad.centre[1] - eye[1]) ** 2 +
			(quad.centre[2] - eye[2]) ** 2;
		order.push([i, d]);
	});
	return order.sort((a, b) => b[1] - a[1]).map(([i]) => i);
}

export const FOV = (70 * Math.PI) / 180;
/** How much of a handle shows while it is not held: the place shows through it. */
export const HANDLE_ALPHA = 0.6;

/**
 * A shape's see-through instances, farthest from `eye` first, into `out`:
 * blended, the far ones have to be drawn before the near ones in front of them.
 */
export function backToFront(
	from: Float32Array,
	count: number,
	eye: number[],
	out: Float32Array,
): void {
	const stride = SCENE_STRIDE;
	const order = Array.from({ length: count }, (_, i) => i);
	const away = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const dx = from[i * stride + 9] - eye[0];
		const dy = from[i * stride + 10] - eye[1];
		const dz = from[i * stride + 11] - eye[2];
		away[i] = dx * dx + dy * dy + dz * dz;
	}
	order.sort((a, b) => away[b] - away[a]);
	order.forEach((from_, to) => {
		out.set(from.subarray(from_ * stride, (from_ + 1) * stride), to * stride);
	});
}

type Instances = { data: Float32Array; count: number };

/**
 * A scene's see-through parts in the two sets they are drawn in: see-through
 * Glass, and the rest. Studio draws no see-through part behind see-through
 * Glass, and places are built for that; with `glassHides` off, every
 * see-through part shows through Glass instead, and the Glass set is empty.
 */
export function seeThroughSets(
	scene: PlaceScene,
	glassHides: boolean,
): { clear: Record<SceneKind, Instances>; glass: Record<SceneKind, Instances> } {
	const clear = {} as Record<SceneKind, Instances>;
	const glass = {} as Record<SceneKind, Instances>;
	const stride = SCENE_STRIDE;
	for (const kind of SCENE_KINDS) {
		const all = scene.translucent[kind];
		const words = new Uint32Array(all.data.buffer, all.data.byteOffset, all.count * stride);
		const isGlass = (i: number) =>
			glassHides && MATERIALS[words[i * stride + 14] & 255]?.shade === MATERIAL_SHADE.glass;
		const pick = (want: boolean): Instances => {
			const rows = Array.from({ length: all.count }, (_, i) => i).filter(
				(i) => isGlass(i) === want,
			);
			if (rows.length === all.count) return all;
			const data = new Float32Array(rows.length * stride);
			rows.forEach((from, to) => {
				data.set(all.data.subarray(from * stride, (from + 1) * stride), to * stride);
			});
			return { data, count: rows.length };
		};
		clear[kind] = pick(false);
		glass[kind] = pick(true);
	}
	return { clear, glass };
}

/**
 * How much brighter Studio shows a Sky's images than their own pixels, in
 * linear light, before the display curve: fitted to Studio's captures of a
 * dark one, which the curve's toe takes down to nearly black as they show.
 */
export const SKY_GAIN = 1.6;

/**
 * How much light a Sky's own sun image adds, over its own pixels, after the
 * display curve: fitted to Studio's captures of one, whose reds stay red where
 * a curve would have turned them white.
 */
export const SUN_GAIN = 12;

/**
 * Where a direction meets a Sky's images, as Studio lays them round the view:
 * which face, by its place in `SKY_FACES`, and where on it, 0 to 1 across and
 * down. Measured from Studio's captures looking down each axis, matched to
 * the six images: the four sides upright,
 * Up turned a quarter clockwise and Dn a quarter anticlockwise. Both
 * renderers' shaders do the same.
 */
export function skyLookup(d: readonly number[]): { face: number; u: number; v: number } {
	const [x, y, z] = d;
	const [ax, ay, az] = d.map(Math.abs);
	const at = (face: number, u: number, v: number) => ({ face, u: u * 0.5 + 0.5, v: v * 0.5 + 0.5 });
	if (ax >= ay && ax >= az) return x > 0 ? at(3, z / ax, -y / ax) : at(4, -z / ax, -y / ax);
	if (az >= ay) return z > 0 ? at(0, -x / az, -y / az) : at(2, x / az, -y / az);
	return y > 0 ? at(5, -z / ay, -x / ay) : at(1, -z / ay, x / ay);
}

/** A mesh's triangles as rows draw them: position and normal a vertex, as the boxes are. */
export interface MeshGeometry {
	vertices: Float32Array;
	indices: Uint32Array;
}

/**
 * A mesh as `use` draws it, in the space a row is scaled from. A MeshPart's
 * fills the unit box, -0.5 to 0.5 on each axis, which the row stretches to
 * its part's size. A SpecialMesh's keeps its own studs and centre, times the
 * part's Scale over its size, which the row's size then undoes. Normals are
 * turned with it, so they stay square to the surface.
 */
export function meshGeometry(mesh: FileMesh, use: SceneMesh): MeshGeometry {
	const { min, max } = meshBounds(mesh);
	const size = max.map((v, a) => Math.max(v - min[a], 1e-4));
	const centre = max.map((v, a) => (v + min[a]) / 2);
	const fit = !use.scale;
	const scale = use.scale ?? [1, 1, 1];
	const count = mesh.positions.length / 3;
	const vertices = new Float32Array(count * 6);
	for (let v = 0; v < count; v++) {
		const n = [0, 1, 2].map((a) => {
			const value = mesh.normals[v * 3 + a];
			return fit ? value * size[a] : value / (scale[a] || 1);
		});
		const length = Math.hypot(n[0], n[1], n[2]);
		for (let a = 0; a < 3; a++) {
			const p = mesh.positions[v * 3 + a];
			vertices[v * 6 + a] = fit ? (p - centre[a]) / size[a] : p * scale[a];
			vertices[v * 6 + 3 + a] = length > 1e-6 ? n[a] / length : a === 1 ? 1 : 0;
		}
	}
	return { vertices, indices: mesh.indices };
}

/**
 * A set of rows split by the mesh each draws: the rows whose mesh `ready`
 * has, by its place in the scene's `meshes`, and the rest, which stay boxes.
 */
export function splitByMesh(
	from: { data: Float32Array; count: number },
	ready: (slot: number) => boolean,
): {
	rest: { data: Float32Array; count: number };
	meshes: Map<number, { data: Float32Array; count: number }>;
} {
	const stride = SCENE_STRIDE;
	const words = new Uint32Array(from.data.buffer, from.data.byteOffset, from.count * stride);
	const rows = new Map<number, number[]>();
	const rest: number[] = [];
	for (let i = 0; i < from.count; i++) {
		const slot = (words[i * stride + 14] >>> 16) - 1;
		if (slot >= 0 && ready(slot)) {
			const list = rows.get(slot) ?? [];
			list.push(i);
			rows.set(slot, list);
		} else rest.push(i);
	}
	const gather = (list: number[]) => {
		if (list.length === from.count) return from;
		const data = new Float32Array(list.length * stride);
		list.forEach((row, to) => {
			data.set(from.data.subarray(row * stride, (row + 1) * stride), to * stride);
		});
		return { data, count: list.length };
	};
	const meshes = new Map<number, { data: Float32Array; count: number }>();
	for (const [slot, list] of rows) meshes.set(slot, gather(list));
	return { rest: gather(rest), meshes };
}

/**
 * How wide a BlurEffect of `size` blurs, as a Gaussian's sigma in pixels of a
 * view `high` pixels tall. Fitted to Studio's captures of Size 8 and 24 in a
 * view 1049 pixels tall (sigma 2 and 9): it grows faster than Size does.
 */
export function blurSigma(size: number, high: number): number {
	return 0.115 * Math.max(0, size) ** 1.37 * (high / 1049);
}

/**
 * A ColorCorrectionEffect as the composite reads it, two vec4s: brightness,
 * contrast, saturation and whether it is on; then the tint. Fitted to Studio's
 * captures, it works on the display values: Brightness adds, Contrast scales
 * round mid-grey by 1 + Contrast, Saturation scales away from grey by
 * 1 + Saturation, and the tint multiplies.
 */
export function gradeBlock(post: PostEffects | undefined, on: boolean): Float32Array {
	const c = on ? post?.colour : undefined;
	return new Float32Array(
		c ? [c.brightness, c.contrast, c.saturation, 1, ...c.tint, 0] : [0, 0, 0, 0, 1, 1, 1, 0],
	);
}

/** Whether anything in the composite's post chain is on. */
export function postActive(post: PostEffects | undefined, on: boolean): boolean {
	return on && !!post && (!!post.colour || (post.blur ?? 0) > 0);
}

/** How wide the outline round what is picked is drawn, in CSS pixels. */
export const SELECT_WIDTH = 2.5;

/** Studio's selection blue, as the outline round what is picked. */
export const SELECT: [number, number, number] = [0.05, 0.6, 1];

/** A part's row, to outline it in the selection's blue at this alpha, from 0 to 255. */
export function tintedOutline(box: Float32Array, alpha: number): Float32Array {
	const tinted = box.slice(0, SCENE_STRIDE);
	const [r, g, b] = SELECT.map((v) => Math.round(v * 255));
	new Uint32Array(tinted.buffer, tinted.byteOffset, tinted.length)[12] =
		r | (g << 8) | (b << 16) | (alpha << 24);
	return tinted;
}
