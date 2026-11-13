/**
 * What both renderers do, so the viewport does not know which it has: draw a
 * view, outline what is selected, say what is under a pixel, and follow the
 * canvas when it changes size.
 */

import type { LightingParams } from "../../core/rbx/lighting.js";
import { MATERIAL_SHADE, MATERIALS } from "../../core/rbx/materials.js";
import {
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneImage,
	type SceneKind,
} from "../../core/rbx/scene.js";
import type { Handles } from "./handles.js";

export interface Camera {
	eye: number[];
	at: number[];
	/** The nearest the view sees: a little, in proportion to how far out the camera is. */
	near: number;
	/** How far the view reaches: well past anything in a place, as Studio's does. */
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
	/** Whether see-through Glass hides the see-through parts behind it, as Studio's does. */
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
	/** Gives the GPU back: a browser keeps only so many contexts. */
	destroy(): void;
}

/** A Decal or Texture vertex: position, normal, image position, then tint and alpha. */
export const IMAGE_VERTEX = 12;

/**
 * The scene's Decals and Textures as triangles, six vertices a quad, grouped
 * by image so each image is one draw: where each image's run starts, and how
 * many vertices it has.
 */
export function imageQuads(images: readonly SceneImage[]): {
	vertices: Float32Array;
	runs: { asset: string; first: number; count: number }[];
} {
	const byAsset = new Map<string, SceneImage[]>();
	for (const image of images) {
		const list = byAsset.get(image.asset);
		if (list) list.push(image);
		else byAsset.set(image.asset, [image]);
	}
	const vertices = new Float32Array(images.length * 6 * IMAGE_VERTEX);
	const runs: { asset: string; first: number; count: number }[] = [];
	let at = 0;
	for (const [asset, list] of byAsset) {
		const first = at / IMAGE_VERTEX;
		for (const image of list) {
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
		}
		runs.push({ asset, first, count: list.length * 6 });
	}
	return { vertices, runs };
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
