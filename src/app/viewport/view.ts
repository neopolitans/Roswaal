/**
 * What both renderers do, so the viewport does not know which it has: draw a
 * view, outline what is selected, say what is under a pixel, and follow the
 * canvas when it changes size.
 */

import type { LightingParams, PostEffects } from "../../core/rbx/lighting.js";
import { MATERIAL_SHADE, MATERIALS } from "../../core/rbx/materials.js";
import { type FileMesh, meshBounds } from "../../core/rbx/mesh.js";
import {
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneImage,
	type SceneKind,
	type SceneMesh,
} from "../../core/rbx/scene.js";
import type { Handles } from "./handles.js";

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
/** How wide the glow's blur is, in its own texels, for a glow `high` texels high. */
export function glowSpread(high: number): number {
	return GLOW_SPREAD * high;
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
