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
	/** `progress` hears the share of the shaders compiled, 0 to 1, as they are. */
	init(
		canvas: HTMLCanvasElement,
		scene: PlaceScene,
		progress?: (shaders: number) => void,
	): Promise<void>;
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
	/** Resolves once the GPU has finished the frames drawn so far. */
	settled(): Promise<void>;
	/** The instance id under a pixel, or -1 for the sky. */
	pick(camera: Camera, x: number, y: number): Promise<number>;
	/** A material texture, as its mip levels, into its layer; drawn from then on. */
	setLook(layer: number, levels: readonly (HTMLCanvasElement | ImageBitmap)[]): void;
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
	/** How the place is drawn, from the Rendering panel: the renderer's alone, never the place's. */
	setRender(render: RenderSettings): void;
	/** What the last frame cost, for the Rendering panel. */
	stats(): RenderStats;
	/**
	 * Whether the next frame would look different though nothing else moved:
	 * particles alive or coming, or a beam's texture scrolling, in the last frame drawn.
	 */
	animates(): boolean;
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

/**
 * A BloomEffect's bloom of the whole picture: how fast the light past its
 * Threshold comes to full, and how strong that is against Neon's glow. See
 * WebGpuView's fsBright.
 */
export const BLOOM_STEEP = 1;
export const BLOOM_STRENGTH = 1;

/**
 * Where a BloomEffect's bloom of the finished picture starts, as the light of
 * a pixel's brightest channel (its display value to the 2.2): 0.88 at
 * Threshold 2, from Studio's screen captures (a face of 238 of 255 does not
 * bloom, one of 247 does), nearer full for a higher Threshold. Other
 * Thresholds than 2 are a guess.
 */
export function bloomStart(threshold: number): number {
	return Math.min(0.98, Math.max(0.5, 1 - 0.24 / Math.max(threshold, 0.1)));
}

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
/**
 * The maps' layers: the whole place's eight, the sun's, then the same eight
 * directions again over a box round the camera (see nearSkyInto).
 */
export const SKY_LAYERS = 2 * SKY_VIEWS + 1;
/** The first near map's layer. */
export const SKY_NEAR_LAYER = SKY_VIEWS + 1;
/**
 * Floats in the block the shaders read: a matrix a layer, then the whole
 * place's maps' vec4, the near maps' vec4, and the near box's centre and half
 * width.
 */
export const SKY_BLOCK = 16 * SKY_LAYERS + 12;
/**
 * The near maps' box round the camera, half its width in studs, and the step
 * its centre keeps to, so they are drawn again only once the camera has moved
 * that far. The whole place's maps, over a place 11,000 studs across, are
 * 11 studs a texel, wider than a wall, and the sky reached into closed rooms.
 */
export const SKY_NEAR = 192;
/**
 * The least of the sky's light a point gets, however closed in: Studio's
 * screen captures of a room with 8-stud walls and Ambient black still read
 * about a fortieth of what reaches outside, once Ambient is taken off.
 */
export const SKY_SEEN_LEAST = 0.025;
export const SKY_NEAR_STEP = 48;
/**
 * What hides the sky in the near maps must be this many studs across, seen
 * from it: thinner, as a window's struts or a rail, it is opened out of the
 * maps. Studio's screen captures show the sun's shadow of such struts and no
 * darkening of the sky's light under them.
 */
export const SKY_OPEN = 4;

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
	block.set(
		[(2 * reach) / SKY_MAP, (zeroToOne ? 1 : 2) / (2 * reach), 1 / SKY_MAP, 1],
		16 * SKY_LAYERS,
	);
	return block;
}

/** Where the near maps are centred for a camera at `eye`: see SKY_NEAR_STEP. */
export function nearSkyCentre(eye: readonly number[]): number[] {
	return eye.map((v) => Math.round(v / SKY_NEAR_STEP) * SKY_NEAR_STEP);
}

/**
 * The near maps' views into `block`, after skyBlock's: the sky directions
 * again, each over SKY_NEAR round `centre` (wide enough to hold the box's
 * cube from any of them), and deep enough along it to hold all of `box`
 * towards the sky, so a roof far above still shades. Then their vec4, as the
 * whole place's, and the box.
 */
export function nearSkyInto(
	block: Float32Array,
	box: { min: number[]; max: number[] } | null,
	centre: readonly number[],
	zeroToOne: boolean,
): void {
	const half = SKY_NEAR * 1.75;
	const corners = box
		? [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
				k & 1 ? box.max[0] : box.min[0],
				k & 2 ? box.max[1] : box.min[1],
				k & 4 ? box.max[2] : box.min[2],
			])
		: [];
	const views = skyDirections().map((dir) => {
		const along = corners.map(
			(c) =>
				dir[0] * (c[0] - centre[0]) + dir[1] * (c[1] - centre[1]) + dir[2] * (c[2] - centre[2]),
		);
		return {
			dir,
			ahead: Math.max(half, ...along) + 1,
			behind: Math.max(half, ...along.map((a) => -a)) + 1,
		};
	});
	const far = Math.max(...views.map((v) => v.ahead + v.behind));
	views.forEach(({ dir, ahead }, k) => {
		const eye = centre.map((v, a) => v + dir[a] * ahead);
		const view = lookAt(eye, [...centre], Math.abs(dir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
		const proj = new Float32Array(16);
		proj[0] = 1 / half;
		proj[5] = 1 / half;
		proj[10] = zeroToOne ? -1 / far : -2 / far;
		proj[14] = zeroToOne ? 0 : -1;
		proj[15] = 1;
		block.set(multiply(proj, view), (SKY_NEAR_LAYER + k) * 16);
	});
	const at = 16 * SKY_LAYERS;
	block.set([(2 * half) / SKY_MAP, (zeroToOne ? 1 : 2) / far, 1 / SKY_MAP, 1], at + 4);
	block.set([centre[0], centre[1], centre[2], SKY_NEAR], at + 8);
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
 * Where a SurfaceLight can light, as the shaders light it: in front of its
 * face, within its Range of the face's nearest point. That lies in a box: the
 * face and its Range either side, its Range deep. Its middle, its three axes
 * (across, up, out) and how far it reaches along each; none for a face with
 * no frame.
 */
export function surfaceBox(
	l: readonly number[],
	o: number,
): { mid: number[]; axes: number[][]; half: number[] } | undefined {
	const range = l[o + 3];
	const out = [l[o + 8], l[o + 9], l[o + 10]];
	const u = [l[o + 12], l[o + 13], l[o + 14]];
	const v = [l[o + 16], l[o + 17], l[o + 18]];
	const lu = Math.hypot(u[0], u[1], u[2]);
	const lv = Math.hypot(v[0], v[1], v[2]);
	const lo = Math.hypot(out[0], out[1], out[2]);
	if (lu < 1e-6 || lv < 1e-6 || lo < 1e-6) return undefined;
	return {
		mid: [0, 1, 2].map((a) => l[o + a] + (out[a] / lo) * (range / 2)),
		axes: [u.map((x) => x / lu), v.map((x) => x / lv), out.map((x) => x / lo)],
		half: [lu + range, lv + range, range / 2],
	};
}

/**
 * Hands `each` the hash of every cell that `box` meets: the cells over the
 * box's own extent along each axis of the world, then those whose cube meets
 * it along each of the box's axes too. It can take a cell that only grazes a
 * corner; it never leaves out one the box reaches.
 */
export function listBox(
	box: { mid: number[]; axes: number[][]; half: number[] },
	each: (hash: number) => void,
): void {
	const { mid, axes, half } = box;
	const c = LIGHT_CELL / 2;
	// The box's reach along the world's axes, and each of its axes' reach over a cell.
	const world = [0, 1, 2].map((w) => axes.reduce((s, ax, k) => s + Math.abs(ax[w]) * half[k], 0));
	const cellReach = axes.map((ax) => c * (Math.abs(ax[0]) + Math.abs(ax[1]) + Math.abs(ax[2])));
	const lo = [0, 1, 2].map((w) => Math.floor((mid[w] - world[w]) / LIGHT_CELL));
	const hi = [0, 1, 2].map((w) => Math.floor((mid[w] + world[w]) / LIGHT_CELL));
	const [a0, a1, a2] = axes;
	const slack = 1 + 1e-9;
	for (let x = lo[0]; x <= hi[0]; x++) {
		const px = x * LIGHT_CELL + c - mid[0];
		const hx = Math.imul(x, 73856093);
		for (let y = lo[1]; y <= hi[1]; y++) {
			const py = y * LIGHT_CELL + c - mid[1];
			const hxy = hx ^ Math.imul(y, 19349663);
			for (let z = lo[2]; z <= hi[2]; z++) {
				const pz = z * LIGHT_CELL + c - mid[2];
				if (Math.abs(px * a0[0] + py * a0[1] + pz * a0[2]) > (half[0] + cellReach[0]) * slack) continue;
				if (Math.abs(px * a1[0] + py * a1[1] + pz * a1[2]) > (half[1] + cellReach[1]) * slack) continue;
				if (Math.abs(px * a2[0] + py * a2[1] + pz * a2[2]) > (half[2] + cellReach[2]) * slack) continue;
				each(((hxy ^ Math.imul(z, 83492791)) >>> 0) & (LIGHT_TABLE - 1));
			}
		}
	}
}

/**
 * Each hash's lights: `table` holds an offset into `index` and a count per
 * hash, `index` the lights' numbers. A light is listed in every cell its
 * Range reaches (a SurfaceLight's, in front of its face: see surfaceBox), once
 * a hash: a hash's lists in the order they were first reached, each list's
 * lights in their own order.
 *
 * A place's lights reach hundreds of thousands of cells, so this keeps to
 * typed arrays and plain numbers: every (hash, light) pair once, then sorted
 * into place by hash.
 */
export function lightGrid(lights: readonly number[] | undefined): {
	table: Uint32Array;
	index: Uint32Array;
} {
	const l = lights ?? [];
	const count = l.length / LIGHT_STRIDE;
	// The light last listed under each hash, to list each light once a hash.
	const last = new Int32Array(LIGHT_TABLE).fill(-1);
	const sizes = new Uint32Array(LIGHT_TABLE);
	// Hashes in the order they were first reached.
	const first: number[] = [];
	let pairs = new Uint32Array(1 << 16);
	let n = 0;
	const list = (h: number, i: number) => {
		if (last[h] === i) return;
		last[h] = i;
		if (sizes[h]++ === 0) first.push(h);
		if (n * 2 === pairs.length) {
			const more = new Uint32Array(pairs.length * 2);
			more.set(pairs);
			pairs = more;
		}
		pairs[n * 2] = h;
		pairs[n * 2 + 1] = i;
		n++;
	};
	for (let i = 0; i < count; i++) {
		const o = i * LIGHT_STRIDE;
		const cx = l[o];
		const cy = l[o + 1];
		const cz = l[o + 2];
		const box = l[o + 7] === LIGHT_SURFACE ? surfaceBox(l, o) : undefined;
		if (box) {
			listBox(box, (h) => list(h, i));
			continue;
		}
		// A SurfaceLight on a face with no frame: its Range from anywhere on the face.
		const face =
			l[o + 7] === LIGHT_SURFACE
				? Math.hypot(l[o + 12], l[o + 13], l[o + 14]) + Math.hypot(l[o + 16], l[o + 17], l[o + 18])
				: 0;
		const reach = l[o + 3] + face;
		// Squared distances settle all but a hair's breadth either side of the
		// reach, where Math.hypot -- the test itself -- decides.
		const inside = reach * reach * (1 - 1e-9);
		const outside = reach * reach * (1 + 1e-9);
		const x1 = Math.floor((cx + reach) / LIGHT_CELL);
		const y1 = Math.floor((cy + reach) / LIGHT_CELL);
		const z1 = Math.floor((cz + reach) / LIGHT_CELL);
		for (let x = Math.floor((cx - reach) / LIGHT_CELL); x <= x1; x++) {
			// The cell's nearest point to the light, against the reach.
			const dx = Math.min(Math.max(cx, x * LIGHT_CELL), (x + 1) * LIGHT_CELL) - cx;
			const hx = Math.imul(x, 73856093);
			for (let y = Math.floor((cy - reach) / LIGHT_CELL); y <= y1; y++) {
				const dy = Math.min(Math.max(cy, y * LIGHT_CELL), (y + 1) * LIGHT_CELL) - cy;
				const dxy = dx * dx + dy * dy;
				if (dxy >= outside) continue;
				const hxy = hx ^ Math.imul(y, 19349663);
				for (let z = Math.floor((cz - reach) / LIGHT_CELL); z <= z1; z++) {
					const dz = Math.min(Math.max(cz, z * LIGHT_CELL), (z + 1) * LIGHT_CELL) - cz;
					const d = dxy + dz * dz;
					if (d >= outside || (d > inside && Math.hypot(dx, dy, dz) > reach)) continue;
					// lightHash(x, y, z), its x and y parts kept from the loops above.
					list(((hxy ^ Math.imul(z, 83492791)) >>> 0) & (LIGHT_TABLE - 1), i);
				}
			}
		}
	}
	const table = new Uint32Array(LIGHT_TABLE * 2);
	let at = 0;
	for (const h of first) {
		table[h * 2] = at;
		table[h * 2 + 1] = sizes[h];
		at += sizes[h];
	}
	const index = new Uint32Array(Math.max(1, n));
	// Each hash's next free slot: pairs come in light order, so each list stays in it.
	const next = new Uint32Array(LIGHT_TABLE);
	for (const h of first) next[h] = table[h * 2];
	for (let p = 0; p < n; p++) index[next[pairs[p * 2]]++] = pairs[p * 2 + 1];
	return { table, index };
}

/**
 * The sun's shadow near the camera: maps of the place as the sun sees it, each
 * reaching this far from the camera, sharp close by and coarser further out.
 * Past the last, the whole-place map (skyBlock's) takes over.
 */
export const SUN_CASCADES = [64, 256, 1024];
/** Each cascade's side, in texels. */
export const CASCADE_MAP = 2048;
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

/**
 * The glow is two blurs added: a narrow one and one twice as wide, as fitted
 * to Studio's captures of Neon dashes, squares and blocks at once (16 Nov
 * 2026): a small source's halo stays tight, a large one's spreads. The
 * widths are shares of glowSpread's; the weights shares of the glow's gain.
 */
export const GLOW_NARROW = { width: 0.57, weight: 0.55 };
export const GLOW_WIDE = { width: 1.14, weight: 0.38 };

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

/** A mesh made here (`SceneMesh.made`), already in the space a row is scaled from. */
export function madeGeometry(made: NonNullable<SceneMesh["made"]>): MeshGeometry {
	return { vertices: new Float32Array(made.vertices), indices: new Uint32Array(made.indices) };
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
		const slot = ((words[i * stride + 14] >>> 16) & 0x7fff) - 1;
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

/**
 * The Rendering panel's views of the place, as engines' editors offer: the
 * place lit in full, then with fewer of its lights, then not at all; its
 * triangles; and two heatmaps, of what each pixel costs to draw and of how
 * many lights reach it; how many surfaces are drawn over each pixel; each
 * part's triangles against its size; and which of the sun's maps shades it.
 */
export type RenderMode =
	| "lit"
	| "shadowed"
	| "global"
	| "unlit"
	| "wireframe"
	| "cost"
	| "lights"
	| "overdraw"
	| "density"
	| "sunMaps";

export const RENDER_MODES: readonly (readonly [RenderMode, string])[] = [
	["lit", "Lighting, lights and shadows"],
	["shadowed", "Global lighting and shadows"],
	["global", "Global lighting only"],
	["unlit", "No lighting"],
	["wireframe", "Wireframe only"],
	["cost", "Render heatmap"],
	["lights", "Lighting heatmap"],
	["overdraw", "Overdraw"],
	["density", "Triangle density"],
	["sunMaps", "Shadow maps"],
];

/** Each mode's number in the shaders. */
export const RENDER_MODE_CODE: Record<RenderMode, number> = {
	lit: 0,
	shadowed: 1,
	global: 2,
	unlit: 3,
	wireframe: 4,
	cost: 5,
	lights: 6,
	overdraw: 7,
	density: 8,
	sunMaps: 9,
};

/** What the renderer draws, each on its own: off leaves it out of the view only. */
export interface RenderShow {
	/** Neon's glow, and CrackedLava's. */
	glow: boolean;
	/** The place's post effects: bloom and colour correction. */
	post: boolean;
	/** Atmosphere and fog. */
	haze: boolean;
	/** The sky behind the place. */
	sky: boolean;
	/** Decals and Textures. */
	images: boolean;
	/** Parts that are see-through, Glass among them. */
	seeThrough: boolean;
	/** Beams. */
	beams: boolean;
	/** ParticleEmitters' particles. */
	particles: boolean;
}

export const RENDER_SHOW: readonly (readonly [keyof RenderShow, string])[] = [
	["glow", "Neon glow"],
	["post", "Post effects"],
	["haze", "Haze and fog"],
	["sky", "Sky"],
	["images", "Decals and Textures"],
	["seeThrough", "See-through parts"],
	["beams", "Beams"],
	["particles", "Particles"],
];

/**
 * How the heatmaps are drawn: by the 16-stud cells the lights are sorted
 * into, each its own colour, or blended between them, each light weighed by
 * how strongly it reaches.
 */
export type RenderHeat = "cells" | "linear";

export const RENDER_HEAT: readonly (readonly [RenderHeat, string])[] = [
	["linear", "Linear heat"],
	["cells", "Cubespots"],
];

export interface RenderSettings {
	mode: RenderMode;
	heat: RenderHeat;
	show: RenderShow;
	/** The lights near the camera drawn as wire shapes of their reach: see `gizmos.ts`. */
	lightRanges: boolean;
	/** The sun's cascades and the sky maps left as last drawn, to compare what they cost. */
	freezeShadows: boolean;
}

export const DEFAULT_RENDER: RenderSettings = {
	mode: "lit",
	heat: "linear",
	show: {
		glow: true,
		post: true,
		haze: true,
		sky: true,
		images: true,
		seeThrough: true,
		beams: true,
		particles: true,
	},
	lightRanges: false,
	freezeShadows: false,
};

/**
 * The heatmaps' scales: a pixel's estimated work, in texture reads and light
 * tests, that shows white, and the lights reaching it that do.
 */
export const COST_FULL = 128;
export const LIGHTS_FULL = 8;

/** One frame's work, as the Rendering panel shows it. */
export interface RenderStats {
	/** Draw calls, instances drawn and their triangles, in the last frame. */
	draws: number;
	instances: number;
	triangles: number;
	/** Beams drawn, and particles alive, in the last frame. */
	beams: number;
	particles: number;
	/** Milliseconds of the page's time spent issuing the last frame. */
	cpu: number;
	/**
	 * Milliseconds of the GPU's time, by pass, where the browser can time
	 * them: the sun's and sky's maps, the place, and its glow and effects.
	 */
	gpu: { shadows: number; scene: number; post: number } | null;
}

/**
 * Overdraw: how many surfaces are drawn over a pixel, each adding one share
 * of this many, which shows white. Coloured by its logarithm, so 1, 2, 4,
 * 8, 16 and 32 lie evenly along the heatmaps' ramp.
 */
export const OVERDRAW_FULL = 32;

/**
 * Triangle density: a part's triangles per square stud of its box's surface,
 * by its logarithm from DENSITY_LOW, the ramp's start, to DENSITY_FULL,
 * white: so ¼, 1, 4, 16 and 64 lie evenly along it. The surface counts as no
 * less than a one-stud cube's six square studs, so a small Part's twelve
 * triangles stay cheap.
 */
export const DENSITY_LOW = 1 / 4;
export const DENSITY_FULL = 64;
export const DENSITY_LEAST_AREA = 6;
/** The least share a drawn part holds, so the composite never draws it black, as nothing. */
export const DENSITY_LEAST = 1 / 64;

/** Triangles per square stud of a box `size` studs across, as the shaders find it. */
export function triangleDensity(triangles: number, size: readonly number[]): number {
	const [x, y, z] = size;
	const area = 2 * (x * y + y * z + z * x);
	return triangles / Math.max(area, DENSITY_LEAST_AREA);
}

/** A density's share of white, as the shaders find it. */
export function densityShare(density: number): number {
	const t =
		Math.log2(Math.max(density, 1e-6) / DENSITY_LOW) / Math.log2(DENSITY_FULL / DENSITY_LOW);
	return Math.min(1, Math.max(DENSITY_LEAST, t));
}

/** Where `n` surfaces lie on the heatmaps' ramp, as the composite finds it: 0 for one, 1 for OVERDRAW_FULL. */
export function overdrawShare(n: number): number {
	return Math.min(1, Math.max(0, Math.log2(Math.max(n, 1)) / Math.log2(OVERDRAW_FULL)));
}

/**
 * The Rendering panel's mode as the place's shaders read it: the lighting
 * they draw (RENDER_MODE_CODE's 0 to 6), whether haze is drawn, whether the
 * heatmaps are linear, and the view drawn over that: 0 none, 1 overdraw,
 * 2 triangle density, 3 the sun's maps. Overdraw and density take the
 * heatmaps' path, the sun's maps the full lighting's.
 */
export function renderDebug(render: RenderSettings): [number, number, number, number] {
	const view: Partial<Record<RenderMode, number>> = { overdraw: 1, density: 2, sunMaps: 3 };
	const w = view[render.mode] ?? 0;
	const x = w === 3 ? 0 : w > 0 ? RENDER_MODE_CODE.cost : RENDER_MODE_CODE[render.mode];
	return [x, render.show.haze ? 1 : 0, render.heat === "linear" ? 1 : 0, w];
}

/** The modes whose frame holds shares in red, for the composite to colour. */
export function sharesView(mode: RenderMode): boolean {
	return mode === "cost" || mode === "lights" || mode === "overdraw" || mode === "density";
}

/**
 * How the composite colours a frame of shares: 0 not at all, 1 the render
 * heatmap's ramp, 2 the same with black where nothing reaches (the lighting
 * heatmap), 3 overdraw's counts, 4 triangle density, shaded by the green.
 */
export function sharesComposite(mode: RenderMode): number {
	const code: Partial<Record<RenderMode, number>> = { cost: 1, lights: 2, overdraw: 3, density: 4 };
	return code[mode] ?? 0;
}

/** The modes the Heat style (Linear heat or Cubespots) changes. */
export function heatStyled(mode: RenderMode): boolean {
	return mode === "cost" || mode === "lights";
}

/** The heatmaps' ramp, as the composite's heatColour draws it: dark green, green, yellow, red, white. */
export function heatRamp(h: number): [number, number, number] {
	const t = Math.min(1, Math.max(0, h));
	const stops: [number, [number, number, number]][] = [
		[0, [0.03, 0.22, 0.06]],
		[0.3, [0.1, 0.72, 0.16]],
		[0.55, [0.95, 0.85, 0.12]],
		[0.8, [0.9, 0.14, 0.06]],
		[1, [1, 1, 1]],
	];
	let k = 0;
	while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
	const [t0, a] = stops[k];
	const [t1, b] = stops[k + 1];
	const f = (t - t0) / (t1 - t0);
	return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * f) as [number, number, number];
}

/**
 * The sun's maps, in the Shadow maps view: each cascade's tint, then the
 * whole-place map's, then none (off every map, or no shadows); and the near
 * sky maps' box edge. Display colours, mixed SUN_MAP_MIX into the picture.
 */
export const SUN_MAP_TINTS: readonly (readonly [number, number, number])[] = [
	[0.95, 0.3, 0.25],
	[0.3, 0.85, 0.35],
	[0.3, 0.5, 1],
	[1, 0.82, 0.2],
	[0.5, 0.5, 0.5],
];
export const SUN_MAP_MIX = 0.45;
export const NEAR_EDGE_TINT: readonly [number, number, number] = [1, 1, 1];

/**
 * A view's legend: a bar coloured as the composite colours it, its ticks
 * spread evenly along it, and what they count; or a key of swatches.
 */
export type RenderLegend =
	| { kind: "bar"; stops: string; ticks: string[]; caption: string }
	| { kind: "key"; items: { colour: string; label: string }[] };

const cssColour = (c: readonly number[]) =>
	`rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(" ")})`;

/** The ramp from `from` to white, as a CSS gradient's stops. */
function rampStops(from: number): string {
	return [0, 0.3, 0.55, 0.8, 1]
		.map((t) => `${cssColour(heatRamp(Math.max(from, t)))} ${t * 100}%`)
		.join(", ");
}

/** The legend of each view after the two heatmaps, which have their own (Viewport.tsx). */
export function renderLegend(mode: RenderMode): RenderLegend | null {
	if (mode === "overdraw") {
		const ticks: string[] = [];
		for (let n = 1; n <= OVERDRAW_FULL; n *= 2) ticks.push(n < OVERDRAW_FULL ? `${n}` : `${n}+`);
		return { kind: "bar", stops: rampStops(0), ticks, caption: "Surfaces a pixel; black for none" };
	}
	if (mode === "density") {
		const ticks: string[] = [];
		for (let d = DENSITY_LOW; d <= DENSITY_FULL; d *= 4)
			ticks.push(d < 1 ? "¼" : d < DENSITY_FULL ? `${d}` : `${d}+`);
		return {
			kind: "bar",
			stops: rampStops(DENSITY_LEAST),
			ticks,
			caption: "Triangles a square stud of each part's box",
		};
	}
	if (mode === "sunMaps") {
		const studs = (n: number) => n.toLocaleString("en-US");
		let from = 0;
		const items = SUN_CASCADES.map((far, k) => {
			const label = `Cascade ${k + 1}: ${studs(from)} to ${studs(far)} studs`;
			from = far;
			return { colour: cssColour(SUN_MAP_TINTS[k]), label };
		});
		const n = SUN_CASCADES.length;
		items.push(
			{ colour: cssColour(SUN_MAP_TINTS[n]), label: `Whole place: past ${studs(from)} studs` },
			{ colour: cssColour(SUN_MAP_TINTS[n + 1]), label: "None: no sun shadow" },
			{ colour: cssColour(NEAR_EDGE_TINT), label: `Near sky maps' edge: ${SKY_NEAR} studs out` },
		);
		return { kind: "key", items };
	}
	return null;
}
