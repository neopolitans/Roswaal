/**
 * The viewport's working parts, outside React: the renderer, the camera, the
 * tool and its handles, picking, and the corner's text and axes. App keeps one
 * for the session, so the camera is where it was when the tab comes back; the
 * `Viewport` component lends it a canvas while the tab is in front.
 */

import type { PlaceOutline } from "../../core/rbx/browse.js";
import type { RbxInstance } from "../../core/rbx/dom.js";
import { effectTextures } from "../../core/rbx/effects.js";
import { type LightingParams, SKY_FACES } from "../../core/rbx/lighting.js";
import type { FileMesh } from "../../core/rbx/mesh.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { addUnions, unionOutline, unionsWaiting } from "../../core/rbx/unions.js";
import { addTo, sameItems } from "../placeSelection.js";
import { boxAround } from "./box.js";
import { FrameHistory, frameInterval } from "./frameGraph.js";
import { rayPick } from "./geometry.js";
import { gizmoCell, lightGizmoLines } from "./gizmos.js";
import { HandleBuilder } from "./handles.js";
import { type Heaviest, heaviest, meshCosts } from "./heaviest.js";
import { loadImages } from "./images.js";
import {
	boxTargets,
	outermostModel,
	partsInRect,
	rectBetween,
	screenPoint,
	stepDown,
	type ViewShot,
} from "./marquee.js";
import { loadMeshes } from "./meshes.js";
import { startingText } from "./readout.js";
import { clampSpeed, SPEED_NOTCH } from "./speed.js";
import { layersUsed, loadLayer } from "./textures.js";
import {
	type DragMode,
	dragMode,
	picks,
	showsHandles,
	type Tool,
	toolAfter,
	toolForKey,
} from "./tools.js";
import { trickle } from "./trickle.js";
import { loadUnionModels } from "./unions.js";
import {
	type Camera,
	DEFAULT_RENDER,
	FOV,
	type MeshGeometry,
	madeGeometry,
	meshGeometry,
	type RenderSettings,
	type RenderStats,
	splitByMesh,
	tintedOutline,
	type ViewRenderer,
} from "./view.js";
import { litFor } from "./renderFeatures.js";

/** Of `rows`, those that draw a MeshPart's or FileMesh's mesh, or its box: not a mesh made here. */
function meshPartRows(rows: { data: Float32Array; count: number }, place: PlaceScene): number {
	return splitByMesh(rows, (slot) => !!place.meshes?.[slot]?.made).rest.count;
}

/** How the view is drawn, from Settings: which renderer, and the outline's width and depth. */
export interface ViewportOptions {
	/** Automatic, WebGPU where the browser has it; or either by name. */
	renderer: "auto" | "webgpu" | "webgl2";
	/** In CSS pixels. */
	outlineWidth: number;
	/** What is in front of an outline hides it, rather than the outline showing through. */
	hideBehind: boolean;
	/** See-through Glass hides the see-through parts behind it, as it does in Studio. */
	glassHides: boolean;
	/** The place's post effects (ColorCorrection, Blur and the rest) are drawn. */
	postEffects: boolean;
	/** Modify DataModel Instances: the editing tools are offered only with it on. */
	editable: boolean;
	/** The most frames a second while it moves; `vsync` the display's, `unlimited` as fast as it goes. */
	frameRate: number | "vsync" | "unlimited";
	/** Alt and a click, or a long press, picks one Model further in each time, rather than the part. */
	altClickSteps: boolean;
}

/**
 * What a click on a part reaches: the highest Model in Workspace that holds
 * it, one step further in than what is picked, or the part itself.
 */
type Reach = "top" | "down" | "part";

/** How far a press moves, in CSS pixels, before it is a drag rather than a click. */
const DRAG = 6;

/** The outline round what is picked, and the fainter one round what the pointer is over. */
const PICKED_ALPHA = 255;
const HOVER_ALPHA = 105;

import { WebGl2View } from "./webgl2.js";
import { WebGpuView } from "./webgpu.js";

export { TOOLS, type Tool } from "./tools.js";

/** What the bar and Properties show, for React. */
export interface ViewportState {
	/** Null with Select put down: the camera alone. */
	tool: Tool | null;
	speed: number;
	backend: "WebGPU" | "WebGL2" | null;
	/** WebGPU was asked for and was not there. */
	fellBack: boolean;
	/** Why nothing is drawn, when nothing can be. */
	error: string | null;
	/** The place as drawn: parts by shape, and what lights it. */
	summary: {
		parts: number;
		meshes: number;
		/** Of `meshes`, those drawn as their mesh rather than their box. */
		meshesDrawn: number;
		/** Seen through: Transparency above 0, or ForceField. */
		translucent: number;
		transparent: number;
		notes: [string, string][];
	} | null;
	/** The steps a drag of the handles keeps to, in studs and degrees, each on or off. */
	snap: Snap;
	/** Something is picked, for the bar's Clear. */
	picked: boolean;
	/** Edit Pivot: the handles stand at the pivot of what is picked, square to it. */
	pivotEdit: boolean;
	/** The handles' axes: what is picked's own, or the world's. Ctrl+L, as in Studio. */
	space: "object" | "world";
	/** Modify DataModel Instances is on: the editing tools are offered. */
	editable: boolean;
	/** The Rendering panel's mode and switches: the view's alone, for this session. */
	render: RenderSettings;
	/** The meshes costing the most triangles, and drawn most often: null until meshes are drawn. */
	heaviest: Heaviest | null;
}

export interface Snap {
	move: number;
	moveOn: boolean;
	rotate: number;
	rotateOn: boolean;
}

export type Stick = "move" | "look";

export type ViewportPlace = PlaceScene & { lighting: LightingParams; outline: PlaceOutline };

/** Studs a second at 1×: a walk across M103's tank in about half a second. */
const BASE_SPEED = 24;
/** How long a touch holds still before it picks as Alt and a click do. */
const LONG_PRESS = 500;
/** How fast the look stick turns the camera at its rim, in the right-drag's pixels a second. */
const LOOK_RATE = 320;
const MOVES: Record<string, number[]> = {
	KeyW: [0, 0, 1],
	KeyS: [0, 0, -1],
	KeyA: [-1, 0, 0],
	KeyD: [1, 0, 0],
	KeyE: [0, 1, 0],
	KeyQ: [0, -1, 0],
};
const AXES: [number[], number[]][] = [
	[
		[1, 0, 0],
		[1, 0.32, 0.32],
	],
	[
		[0, 1, 0],
		[0.35, 0.9, 0.35],
	],
	[
		[0, 0, 1],
		[0.3, 0.55, 1],
	],
];
const GIZMO = 104;
const GIZMO_AXES = [
	{ name: "X", dir: [1, 0, 0], col: "#ff5c5c", dark: "#8a3434" },
	{ name: "Y", dir: [0, 1, 0], col: "#6fdc5a", dark: "#3f7a35" },
	{ name: "Z", dir: [0, 0, 1], col: "#5a8dff", dark: "#34508f" },
];
/** What waits on `asap`, and the one channel it is told by. */
const waiting: ((now: number) => void)[] = [];
let channel: MessageChannel | null = null;

/**
 * Runs `run` as soon as the browser has a moment, not at the next frame: what
 * an Unlimited frame rate draws by. A message rather than a timeout, which the
 * browser holds to 4ms apart.
 */
function asap(run: (now: number) => void): void {
	if (!channel) {
		channel = new MessageChannel();
		channel.port1.onmessage = () => {
			const now = performance.now();
			for (const each of waiting.splice(0)) each(now);
		};
	}
	waiting.push(run);
	if (waiting.length === 1) channel.port2.postMessage(null);
}

/** The world's axes. */
const WORLD = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

/** `v` at length 1, or the world's axis `j` where `v` has no length: a part flat on that side. */
function unit(v: number[], j: number): number[] {
	const n = Math.hypot(v[0], v[1], v[2]);
	return n > 1e-9 ? v.map((x) => x / n) : WORLD[j];
}

/** Where the camera stands to look along an axis: on that axis's side, looking back to the centre. */
const ALONG: Record<string, [number, number]> = {
	"+X": [Math.PI / 2, 0],
	"-X": [-Math.PI / 2, 0],
	"+Y": [0, Math.PI / 2 - 0.001],
	"-Y": [0, -Math.PI / 2 + 0.001],
	"+Z": [0, 0],
	"-Z": [Math.PI, 0],
};
const PITCH = Math.PI / 2 - 0.001;
const clampPitch = (p: number) => Math.max(-PITCH, Math.min(PITCH, p));

/** Turns `v` round the unit axis `k` by `angle`, Rodrigues' way. */
function turn(v: number[], k: number[], angle: number): number[] {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
	const x = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
	return [0, 1, 2].map((a) => v[a] * c + x[a] * s + k[a] * d * (1 - c));
}

export interface ViewportElements {
	holder: HTMLElement;
}

/** The axes and the readout over them, which stand on the bar rather than in the view. */
export interface CornerElements {
	gizmo: HTMLElement;
	rotation: HTMLElement;
	rate: HTMLElement;
}

/**
 * An image as a renderer takes it: loadImages already decodes its colours as
 * they are, not multiplied by their alpha, which WebGL2 takes as it is. (It
 * once needed a copy made here, a long task on the page's thread for a large
 * sky face.) WebGPU gets a copy in the browser's own form: Chromium's
 * copyExternalImageToTexture multiplies a grey-and-alpha PNG decoded that way
 * by its alpha though told not to, so a Beam's scan lines (white, alpha 0.1 to
 * 0.4) came out at a third of their light. From the browser's own form the
 * copy is right for every PNG.
 */
function forView(view: ViewRenderer, image: ImageBitmap): Promise<ImageBitmap> {
	if (view.backend !== "WebGPU") return Promise.resolve(image);
	return createImageBitmap(image, { premultiplyAlpha: "default" }).catch(() => image);
}

export class ViewportController {
	private state: ViewportState = {
		tool: "select",
		speed: 1,
		backend: null,
		fellBack: false,
		error: null,
		summary: null,
		snap: { move: 0.5, moveOn: true, rotate: 5, rotateOn: true },
		picked: false,
		pivotEdit: false,
		space: "object",
		editable: false,
		render: DEFAULT_RENDER,
		heaviest: null,
	};
	private listeners = new Set<() => void>();
	private place: ViewportPlace | null = null;
	/** Each drawn part's 14 words, by its row in the DataModel browser. */
	private words = new Map<number, Float32Array>();
	private kids: number[][] = [];
	/** Pivots from the scene: see `PlaceScene.pivots`. */
	private pivots: Record<number, number[]> = {};
	private workspace = -1;
	/** What is picked, by row, the last picked last: the browser's selection too. */
	private selection: readonly number[] = [];
	private cam = { target: [0, 0, 0], yaw: 0.8, pitch: 0.42, dist: 60 };
	private framed = false;
	private view: ViewRenderer | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private els: ViewportElements | null = null;
	private corner: CornerElements | null = null;
	private mounted = 0;
	private pending = false;
	private holding = 0;
	private looping = false;
	private frames: number[] = [];
	private held = new Set<string>();
	/** The touch sticks, each -1 to 1 across and down, and the up and down buttons. */
	private sticks: Record<Stick, [number, number]> = { move: [0, 0], look: [0, 0] };
	private rise = 0;
	private flying = false;
	private turning = 0;

	/** `onPick` hears each pick made in the view: everything picked, the last picked last. */
	constructor(private readonly onPick: (indices: readonly number[]) => void) {
		// Effects stop drawing while the tab is hidden: see `redraw`.
		if (typeof document !== "undefined")
			document.addEventListener("visibilitychange", () => {
				if (!document.hidden) this.redraw();
			});
	}

	// -- for React ---------------------------------------------------------------

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getState = (): ViewportState => this.state;

	private set(patch: Partial<ViewportState>): void {
		this.state = { ...this.state, ...patch };
		for (const l of this.listeners) l();
	}

	// -- the place ---------------------------------------------------------------

	/** The place to draw, from the host: again after the file changes. */
	setPlace(place: ViewportPlace): void {
		this.place = place;
		this.words.clear();
		for (const set of [place.kinds, place.translucent])
			for (const k of SCENE_KINDS) {
				const { data, count } = set[k];
				const u = new Uint32Array(data.buffer, data.byteOffset, data.length);
				for (let i = 0; i < count; i++)
					this.words.set(
						u[i * SCENE_STRIDE + 13],
						data.slice(i * SCENE_STRIDE, (i + 1) * SCENE_STRIDE),
					);
			}
		this.pivots = place.pivots ?? {};
		const { nodes, classes } = place.outline;
		this.kids = nodes.map(() => []);
		this.workspace = -1;
		nodes.forEach(([cls, , parent], i) => {
			if (parent >= 0) this.kids[parent].push(i);
			else if (classes[cls] === "Workspace") this.workspace = i;
		});
		this.selection = this.selection.filter((i) => i < nodes.length);
		this.set({
			picked: this.selection.length > 0,
			summary: {
				parts: this.words.size,
				meshes: meshPartRows(place.kinds.mesh, place) + meshPartRows(place.translucent.mesh, place),
				meshesDrawn: 0,
				translucent: SCENE_KINDS.reduce((n, k) => n + place.translucent[k].count, 0),
				transparent: place.transparent,
				notes: place.lighting.notes,
			},
		});
		if (this.view) {
			this.view.setScene(place);
			this.loadLooks(this.view, place);
			this.loadImages(this.view, place);
			this.view.setLighting(litFor(place.lighting, this.state.render.features));
			this.loadSky(this.view, place.lighting);
			this.loadSunImage(this.view, place.lighting);
			this.loadMeshes(this.view, place);
			this.loadUnions(this.view, place);
			this.view.setOverlay(this.overlayLines());
			this.refreshSelection();
		} else void this.start();
		if (!this.framed) {
			this.framed = true;
			this.fitAll();
		}
	}

	/** What is picked elsewhere -- the tree, or Properties -- to outline, each on its own. Leaves the camera be. */
	select(indices: readonly number[]): void {
		if (sameItems(indices, this.selection)) return;
		this.selection = [...indices];
		if (this.state.picked !== indices.length > 0) this.set({ picked: indices.length > 0 });
		this.refreshSelection();
	}

	/** Picks nothing: the bar's Clear, and Esc. */
	clear(): void {
		if (this.selection.length === 0) return;
		this.select([]);
		this.onPick([]);
	}

	/** What a pick in the view picks, told to the browser. */
	private pickHere(indices: readonly number[]): void {
		this.select(indices);
		this.onPick(this.selection);
	}

	private refreshSelection(): void {
		this.view?.setSelection(this.outlines());
		this.drawHandles();
		this.redraw();
	}

	/** Each thing picked, solid, and what the pointer is over, faint, each in the selection's blue. */
	private outlines(): Float32Array {
		const boxes: Float32Array[] = [];
		const add = (index: number | null, alpha: number) => {
			if (index === null) return;
			const box = this.boxFor(index);
			if (box.length < SCENE_STRIDE) return;
			boxes.push(tintedOutline(box, alpha));
		};
		for (const index of this.selection) add(index, PICKED_ALPHA);
		if (this.hover !== null && !this.selection.includes(this.hover)) add(this.hover, HOVER_ALPHA);
		const out = new Float32Array(boxes.length * SCENE_STRIDE);
		boxes.forEach((b, i) => {
			out.set(b, i * SCENE_STRIDE);
		});
		return out;
	}

	/** The instance the pointer is over, outlined faintly; null for none. */
	private hover: number | null = null;
	private setHover(index: number | null): void {
		if (index === this.hover) return;
		this.hover = index;
		this.refreshSelection();
	}

	private options: ViewportOptions = {
		renderer: "auto",
		outlineWidth: 3.5,
		hideBehind: false,
		glassHides: true,
		postEffects: true,
		editable: false,
		frameRate: "vsync",
		altClickSteps: false,
	};

	/** Settings' say in how the view is drawn: a new renderer starts the view again. */
	renderSettings(): RenderSettings {
		return this.state.render;
	}

	setRender(render: RenderSettings): void {
		const was = this.state.render;
		this.set({ render });
		if (render.features !== was.features && this.place)
			this.view?.setLighting(litFor(this.place.lighting, render.features));
		this.view?.setRender(render);
		if (render.lightRanges !== was.lightRanges) this.view?.setOverlay(this.overlayLines());
		this.redraw();
	}

	/** What the last frame cost, for the Performance panel; null with no view. */
	renderStats(): RenderStats | null {
		return this.view?.stats() ?? null;
	}

	setOptions(options: ViewportOptions): void {
		const was = this.options;
		this.options = options;
		if (options.editable !== this.state.editable) {
			// Editing off takes the editing tools away: back to Select, the handles
			// off the pivot, as they would be in a place opened read-only. No tool
			// stays no tool.
			this.set(
				options.editable
					? { editable: true }
					: {
							editable: false,
							tool: this.state.tool === null ? null : "select",
							pivotEdit: false,
						},
			);
			this.drawHandles();
			this.redraw();
		}
		if (!this.view) return;
		if (was.renderer !== options.renderer) {
			this.view.destroy();
			this.view = null;
			this.canvas?.remove();
			this.pivotMark?.remove();
			this.pivotMark = null;
			this.canvas = null;
			void this.start();
			return;
		}
		this.view.setOutline(options.outlineWidth, options.hideBehind);
		this.view.setGlassHides(options.glassHides);
		this.view.setPostEffects(options.postEffects);
		this.redraw();
	}

	/** The material textures, fetched once each and kept for the session, by layer. */
	private looks = new Map<number, Promise<HTMLCanvasElement[]>>();

	/**
	 * The textures the place's materials use, into the view as each arrives;
	 * until then a material is drawn in its own pattern.
	 */
	private loadLooks(view: ViewRenderer, place: PlaceScene): void {
		for (const layer of layersUsed(place)) {
			let levels = this.looks.get(layer);
			if (!levels) {
				levels = loadLayer(layer);
				this.looks.set(layer, levels);
				// A failed fetch is tried again by the next place or tab.
				levels.catch(() => this.looks.delete(layer));
			}
			levels.then(
				(ready) =>
					this.upload(view, `look:${layer}`, ready, async () => {
						// WebGL2 reads a canvas back from the GPU as it uploads it, waiting on
						// whatever the GPU is doing; a bitmap made first is only copied.
						if (view.backend !== "WebGL2") {
							if (this.view === view) view.setLook(layer, ready);
							return;
						}
						const bitmaps = await Promise.all(
							ready.map((level) => createImageBitmap(level, { premultiplyAlpha: "none" })),
						);
						if (this.view === view) view.setLook(layer, bitmaps);
						for (const bitmap of bitmaps) bitmap.close();
					}),
				() => {},
			);
		}
	}

	/** Textures go to the GPU a few a frame: see `trickle`. */
	private uploads = trickle();
	/** What each view has been given, by what it is, so a place sent again is not uploaded again. */
	private given = new WeakMap<ViewRenderer, Map<string, unknown>>();

	/** Whether `view` has been given `value` as `what`, and nothing since. */
	private gave(view: ViewRenderer, what: string, value: unknown): boolean {
		const had = this.given.get(view);
		return had !== undefined && had.has(what) && had.get(what) === value;
	}

	/**
	 * Gives `view` `value` as `what` through `set`, in its turn among the
	 * uploads, unless the view is gone or already has that value.
	 */
	private upload(view: ViewRenderer, what: string, value: unknown, set: () => unknown): void {
		if (this.gave(view, what, value)) return;
		this.uploads.add(async () => {
			if (this.view !== view || this.gave(view, what, value)) return;
			await set();
			if (this.view !== view) return;
			let had = this.given.get(view);
			if (!had) this.given.set(view, (had = new Map()));
			had.set(what, value);
			this.redraw();
		});
	}

	private images = new Map<string, Promise<ImageBitmap | null>>();

	/**
	 * The images the place's Decals and Textures show, into the view as each
	 * arrives, where Sign in with Roblox has them. Kept for the session, so a
	 * tab or renderer change does not ask again.
	 */
	private loadImages(view: ViewRenderer, place: PlaceScene): void {
		const wanted = [
			...new Set([
				...(place.images ?? []).map((image) => image.asset),
				...effectTextures(place.effects),
			]),
		];
		const fresh = wanted.filter((asset) => !this.images.has(asset));
		const settled = new Map<string, (image: ImageBitmap | null) => void>();
		for (const asset of fresh) {
			this.images.set(asset, new Promise((resolve) => settled.set(asset, resolve)));
		}
		if (fresh.length > 0) {
			void loadImages(fresh, (asset, image) => settled.get(asset)?.(image))
				.catch(() => {})
				.finally(() => {
					// What did not arrive is asked for again next time.
					for (const [asset, resolve] of settled) {
						resolve(null);
						void this.images.get(asset)?.then((image) => {
							if (!image) this.images.delete(asset);
						});
					}
				});
		}
		for (const asset of wanted) {
			void this.images.get(asset)?.then((image) => {
				if (!image || this.view !== view) return;
				this.upload(view, `image:${asset}`, image, async () => {
					const ready = await forView(view, image);
					if (this.view === view) view.setImage(asset, ready);
				});
			});
		}
	}

	/** A Sky's six images, kept for the session by the ids they were asked for under. */
	private sky: { key: string; faces: Promise<ImageBitmap[] | null> } | null = null;

	/**
	 * A Sky's six images into the view once Sign in with Roblox has them all,
	 * at one size; until then, and without a Sky, the sky made here.
	 */
	private loadSky(view: ViewRenderer, lighting: LightingParams): void {
		const box = lighting.skybox;
		if (!box) {
			this.sky = null;
			this.upload(view, "sky", null, () => view.setSky(null));
			return;
		}
		const ids = SKY_FACES.map((face) => box[face]);
		const key = ids.join(",");
		if (this.sky?.key !== key) {
			const got = new Map<string, ImageBitmap>();
			const faces = loadImages(ids, (asset, image) => got.set(asset, image))
				.then(async () => {
					const each = ids.map((id) => got.get(id));
					if (each.some((face) => !face)) return null;
					const first = each[0] as ImageBitmap;
					const size = Math.min(2048, Math.max(first.width, first.height));
					return Promise.all(
						(each as ImageBitmap[]).map((face) =>
							face.width === size && face.height === size
								? face
								: createImageBitmap(face, {
										resizeWidth: size,
										resizeHeight: size,
										premultiplyAlpha: "none",
									}),
						),
					);
				})
				.catch(() => null);
			this.sky = { key, faces };
			// What did not arrive is asked for again next time.
			void faces.then((held) => {
				if (!held && this.sky?.key === key) this.sky = null;
			});
		}
		void this.sky.faces.then((faces) => {
			if (!faces || this.view !== view || this.gave(view, "sky", faces)) return;
			// Each face readied in a turn of its own, then all six into the view at once.
			const ready: ImageBitmap[] = [];
			faces.forEach((face, i) => {
				this.uploads.add(async () => {
					if (this.view === view) ready[i] = await forView(view, face);
				});
			});
			this.upload(view, "sky", faces, () => {
				if (ready.filter(Boolean).length === faces.length) view.setSky(ready);
			});
		});
	}

	/** Meshes read, kept for the session by asset id; null for one that did not arrive or read. */
	private meshCache = new Map<string, Promise<FileMesh | null>>();

	/**
	 * The meshes a place's MeshParts and FileMeshes name, into the view once
	 * Sign in with Roblox has them, each made for the rows that draw it. The
	 * view is given them all at once: each time rebuilds its buffers.
	 */
	private loadMeshes(view: ViewRenderer, place: PlaceScene): void {
		const uses = place.meshes ?? [];
		if (uses.length === 0) {
			view.setMeshes(new Map());
			this.rankMeshes(place, new Map());
			return;
		}
		const fresh = [...new Set(uses.filter((use) => !use.made).map((use) => use.asset))].filter(
			(a) => !this.meshCache.has(a),
		);
		const settled = new Map<string, (mesh: FileMesh | null) => void>();
		for (const asset of fresh)
			this.meshCache.set(asset, new Promise((resolve) => settled.set(asset, resolve)));
		if (fresh.length > 0) {
			void loadMeshes(fresh, (asset, mesh) => settled.get(asset)?.(mesh))
				.catch(() => {})
				.finally(() => {
					// What did not arrive is asked for again next time.
					for (const [asset, resolve] of settled) {
						resolve(null);
						void this.meshCache.get(asset)?.then((mesh) => {
							if (!mesh) this.meshCache.delete(asset);
						});
					}
				});
		}
		// A mesh made here (a union's parts as one surface) is here already: into
		// the view now, so it is not drawn as its box while the rest download.
		const here = new Map<number, MeshGeometry>();
		uses.forEach((use, slot) => {
			if (use.made) here.set(slot, madeGeometry(use.made));
		});
		if (here.size > 0) view.setMeshes(here);
		this.rankMeshes(place, here);
		const reading = uses.map((use) => !use.made && this.meshCache.get(use.asset));
		void Promise.all(reading).then((meshes) => {
			if (this.view !== view || this.place !== place) return;
			const made = new Map(here);
			meshes.forEach((mesh, slot) => {
				if (mesh) made.set(slot, meshGeometry(mesh, uses[slot]));
			});
			// Nothing downloaded: the view has all there is.
			if (made.size === here.size) return;
			view.setMeshes(made);
			this.rankMeshes(place, made);
			const read = (slot: number) => made.has(slot) && !uses[slot].made;
			const drawn = (rows: { data: Float32Array; count: number }) =>
				[...splitByMesh(rows, read).meshes.values()].reduce((n, r) => n + r.count, 0);
			const summary = this.state.summary;
			if (summary)
				this.set({
					summary: {
						...summary,
						meshesDrawn: drawn(place.kinds.mesh) + drawn(place.translucent.mesh),
					},
				});
			this.redraw();
		});
	}

	/** The Mesh Debug panel's lists, from the meshes the view has been given: see `heaviest.ts`. */
	private rankMeshes(place: PlaceScene, meshes: ReadonlyMap<number, MeshGeometry>): void {
		const uses = place.meshes ?? [];
		const costs = meshCosts(
			[place.kinds.mesh, place.translucent.mesh],
			(slot) => {
				const mesh = meshes.get(slot);
				return mesh && mesh.indices.length / 3;
			},
			(slot) => (uses[slot]?.made ? `made:${slot}` : (uses[slot]?.asset ?? `slot:${slot}`)),
		);
		this.set({ heaviest: costs.length > 0 ? heaviest(costs) : null });
	}

	/** Rows from the Mesh Debug panel: picked, as a click in the view picks, and framed. */
	pickRows(rows: readonly number[]): void {
		this.pickHere(rows);
		this.frameSelection();
	}

	/** A DataModel row's name and class, as the tree shows them; empty for none. */
	rowName(row: number): { name: string; className: string } {
		const outline = this.place?.outline;
		const node = outline?.nodes[row];
		return node
			? { name: node[1], className: outline.classes[node[0]] ?? "" }
			: { name: "", className: "" };
	}

	/** Unions' ChildData, kept for the session by the SolidModel asset that held it. */
	private unionModels = new Map<string, readonly RbxInstance[]>();

	/**
	 * The place's unions: each outlined by its own box, and drawn as the parts
	 * it was made from once Sign in with Roblox has its SolidModel asset. The
	 * scene with them added stands in for the host's, so picking and the
	 * meshes their parts draw follow it.
	 */
	private loadUnions(view: ViewRenderer, place: ViewportPlace): void {
		const uses = place.unions ?? [];
		if (uses.length === 0) return;
		for (const use of uses) this.words.set(use.id, unionOutline(use));
		const fresh = unionsWaiting(place).filter((asset) => !this.unionModels.has(asset));
		const arrived =
			fresh.length > 0
				? loadUnionModels(fresh, (asset, roots) => this.unionModels.set(asset, roots)).catch(
						() => {},
					)
				: Promise.resolve();
		void arrived.then(() => {
			if (this.view !== view || this.place !== place) return;
			const drawn = addUnions(place, this.unionModels);
			if (drawn === place) return;
			this.place = drawn;
			view.setScene(drawn);
			this.loadLooks(view, drawn);
			this.loadMeshes(view, drawn);
			this.redraw();
		});
	}

	/** A Sky's own sun image, kept for the session by its asset id. */
	private sunImage: { asset: string; image: Promise<ImageBitmap | null> } | null = null;

	/** A Sky's own sun image into the view once Sign in with Roblox has it; until then, none. */
	private loadSunImage(view: ViewRenderer, lighting: LightingParams): void {
		const asset = lighting.sunImage?.asset;
		if (!asset) {
			this.sunImage = null;
			this.upload(view, "sun", null, () => view.setSunImage(null));
			return;
		}
		if (this.sunImage?.asset !== asset) {
			let got: ImageBitmap | null = null;
			const image = loadImages([asset], (_, bitmap) => {
				got = bitmap;
			})
				.then(() => got)
				.catch(() => null);
			this.sunImage = { asset, image };
			// What did not arrive is asked for again next time.
			void image.then((held) => {
				if (!held && this.sunImage?.asset === asset) this.sunImage = null;
			});
		}
		void this.sunImage.image.then((image) => {
			if (!image || this.view !== view) return;
			this.upload(view, "sun", image, async () => {
				const ready = await forView(view, image);
				if (this.view === view) view.setSunImage(ready);
			});
		});
	}

	/** One pick at a time: WebGPU reads a pick back through one buffer. */
	private picking: Promise<unknown> = Promise.resolve();
	private pickId(x: number, y: number): Promise<number> {
		const run = this.picking.then(() => (this.view ? this.view.pick(this.camera(), x, y) : -1));
		this.picking = run.catch(() => -1);
		return run;
	}

	/** A part's own box, or one round every part inside an instance, square to the world. */
	private boxFor(index: number): Float32Array {
		return this.boxRound([index]);
	}

	/**
	 * One part's own box, or one round every part in all of these: square to a
	 * single model's pivot, as Studio's selection box is, else to the world.
	 */
	private boxRound(indices: readonly number[]): Float32Array {
		const own = indices.length === 1 ? this.words.get(indices[0]) : undefined;
		if (own) return own;
		const pivot = indices.length === 1 ? this.pivots[indices[0]] : undefined;
		return boxAround(this.rowsOf(indices), pivot);
	}

	/** The box round these, square to the world: the handles' in global space. */
	private worldBox(indices: readonly number[]): Float32Array {
		return boxAround(this.rowsOf(indices));
	}

	/** Every drawn part in these and in what they hold. */
	private rowsOf(indices: readonly number[]): ArrayLike<number>[] {
		const rows: ArrayLike<number>[] = [];
		const visit = (i: number) => {
			const w = this.words.get(i);
			if (w) rows.push(w);
			for (const k of this.kids[i] ?? []) visit(k);
		};
		for (const index of indices) visit(index);
		return rows;
	}

	/**
	 * Where one picked thing's pivot is, and its axes: the scene's, else a part's
	 * drawn box's centre and axes, else the middle of its box, square to the world.
	 */
	private pivotOf(index: number): { at: number[]; axes: number[][] } | null {
		const p = this.pivots[index];
		if (p)
			return { at: [p[9], p[10], p[11]], axes: [0, 1, 2].map((j) => [p[j], p[3 + j], p[6 + j]]) };
		const b = this.boxRound([index]);
		if (b.length < SCENE_STRIDE) return null;
		const own = this.words.has(index);
		return {
			at: [b[9], b[10], b[11]],
			axes: own ? [0, 1, 2].map((j) => unit([b[j * 3], b[j * 3 + 1], b[j * 3 + 2]], j)) : WORLD,
		};
	}

	/** What a click on a part picks, by how far it reaches: see Reach. */
	private clickTarget(part: number, reach: Reach): number {
		if (reach === "part" || !this.place) return part;
		const { outline } = this.place;
		return reach === "down"
			? stepDown(outline, this.workspace, part, this.selection)
			: outermostModel(outline, this.workspace, part);
	}

	/** How far a click reaches with these keys: Alt steps in when Settings says so, Shift the part. */
	private reachFor(alt: boolean, shift: boolean): Reach {
		if (alt) return this.options.altClickSteps ? "down" : "part";
		return shift ? "part" : "top";
	}

	// -- the camera ----------------------------------------------------------------

	/** From what the camera looks at back to the camera. */
	private back(): number[] {
		const c = Math.cos(this.cam.pitch);
		return [c * Math.sin(this.cam.yaw), Math.sin(this.cam.pitch), c * Math.cos(this.cam.yaw)];
	}

	private eye(): number[] {
		const b = this.back();
		return this.cam.target.map((v, a) => v + this.cam.dist * b[a]);
	}

	/** The way into the view through a point on it, in CSS pixels from its corner. */
	private rayAt(x: number, y: number, box: { width: number; height: number }): number[] {
		const b = this.back();
		const forward = b.map((v) => -v);
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		const tan = Math.tan(FOV / 2);
		const sx = ((x / box.width) * 2 - 1) * tan * (box.width / box.height);
		const sy = (1 - (y / box.height) * 2) * tan;
		return [0, 1, 2].map((a) => forward[a] + right[a] * sx + up[a] * sy);
	}

	private camera(): Camera {
		return {
			eye: this.eye(),
			at: this.cam.target,
			near: Math.min(2, Math.max(0.1, this.cam.dist * 0.01)),
			far: Math.max(40000, this.cam.dist * 200),
		};
	}

	/** How the camera sees the view now, for what a box drawn on it holds. */
	private shot(box: { width: number; height: number }): ViewShot {
		const forward = this.back().map((v) => -v);
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		return {
			eye: this.eye(),
			forward,
			right,
			up,
			tan: Math.tan(FOV / 2),
			width: box.width,
			height: box.height,
		};
	}

	/** Frames the selection (F); Studio's camera by what its frustum covers. */
	frameSelection(): void {
		if (this.selection.length === 0) return;
		const studio = this.place?.camera;
		if (studio && this.selection.length === 1 && this.selection[0] === studio.id) {
			const r = studio.rotation;
			this.cam.target = [0, 1, 2].map((a) => studio.position[a] - r[a * 3 + 2] * 5);
			this.cam.dist = 34;
			this.redraw();
			return;
		}
		const b = this.boxRound(this.selection);
		if (b.length < SCENE_STRIDE) return;
		this.cam.target = [b[9], b[10], b[11]];
		const r =
			Math.hypot(
				Math.hypot(b[0], b[1], b[2]),
				Math.hypot(b[3], b[4], b[5]),
				Math.hypot(b[6], b[7], b[8]),
			) / 2;
		this.cam.dist = Math.max(8, r * 2.4);
		this.redraw();
	}

	/** Frames the whole place (Home). */
	fitAll(): void {
		if (!this.place) return;
		this.cam.target = [...this.place.centre];
		this.cam.dist = this.place.radius * 1.6;
		this.redraw();
	}

	/**
	 * A tool's key or its button: that tool, or with Select chosen again, no
	 * tool at all. The editing tools wait on Modify DataModel Instances.
	 */
	chooseTool(chosen: Tool): void {
		this.setTool(toolAfter(this.state.tool, chosen, this.state.editable));
	}

	/** Null puts the tool down: the camera alone, and Edit Pivot off with it. */
	setTool(tool: Tool | null): void {
		if (tool !== null && tool !== "select" && !this.state.editable) return;
		this.set(tool === null ? { tool, pivotEdit: false } : { tool });
		if (!picks(tool)) this.setHover(null);
		this.drawHandles();
		this.redraw();
	}

	setSpeed(speed: number): void {
		this.set({ speed: clampSpeed(speed) });
	}

	setSnap(patch: Partial<Snap>): void {
		this.set({ snap: { ...this.state.snap, ...patch } });
	}

	/** A touch stick, pushed `x` across and `y` down, each -1 to 1: moving, or looking round. */
	setStick(stick: Stick, x: number, y: number): void {
		this.sticks[stick] = [x, y];
		if (x !== 0 || y !== 0) this.fly();
	}

	/** The up and down buttons beside the sticks: 1 up, -1 down, 0 neither. */
	setRise(rise: number): void {
		this.rise = rise;
		if (rise !== 0) this.fly();
	}

	private moving(): boolean {
		const { move, look } = this.sticks;
		return (
			this.held.size > 0 ||
			this.rise !== 0 ||
			move.some((v) => v !== 0) ||
			look.some((v) => v !== 0)
		);
	}

	/** Turns the camera where it stands: the right-drag look. */
	private look(dx: number, dy: number): void {
		const eye = this.eye();
		this.cam.yaw -= dx * 0.005;
		this.cam.pitch = clampPitch(this.cam.pitch + dy * 0.005);
		const b = this.back();
		this.cam.target = eye.map((v, a) => v - this.cam.dist * b[a]);
	}

	/** Round the selection where it is on screen, or round the point looked at when nothing is picked. */
	private orbit(dx: number, dy: number): void {
		const b = this.selection.length === 0 ? null : this.boxRound(this.selection);
		const dyaw = -dx * 0.008;
		const pitch = clampPitch(this.cam.pitch + dy * 0.008);
		if (!b || b.length < SCENE_STRIDE) {
			this.cam.yaw += dyaw;
			this.cam.pitch = pitch;
			return;
		}
		const pivot = [b[9], b[10], b[11]];
		const eye = this.eye();
		let v = eye.map((e, a) => e - pivot[a]);
		v = turn(v, [0, 1, 0], dyaw);
		this.cam.yaw += dyaw;
		// Tilting by d turns the camera round its own right by -d.
		v = turn(v, [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)], -(pitch - this.cam.pitch));
		this.cam.pitch = pitch;
		const at = this.back();
		this.cam.target = [0, 1, 2].map((a) => pivot[a] + v[a] - this.cam.dist * at[a]);
	}

	private pan(dx: number, dy: number): void {
		const { yaw, pitch, dist } = this.cam;
		const s = (dist * 0.0016 * 1.6) / Math.min(2, devicePixelRatio || 1);
		const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
		const up = [
			-Math.sin(pitch) * Math.sin(yaw),
			Math.cos(pitch),
			-Math.sin(pitch) * Math.cos(yaw),
		];
		for (let a = 0; a < 3; a++) this.cam.target[a] += (-right[a] * dx + up[a] * dy) * s;
	}

	private turnTo(yaw: number, pitch: number): void {
		const from = [this.cam.yaw, this.cam.pitch];
		// The short way round.
		let dy = yaw - from[0];
		dy = ((((dy + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
		const start = performance.now();
		const run = ++this.turning;
		const step = (now: number) => {
			if (run !== this.turning) return;
			const t = Math.min(1, (now - start) / 260);
			const e = 1 - (1 - t) ** 3;
			this.cam.yaw = from[0] + dy * e;
			this.cam.pitch = from[1] + (pitch - from[1]) * e;
			this.redraw();
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	/**
	 * WASD along the look, Q and E down and up, for as long as they are held;
	 * and the touch sticks and buttons, the same way, as far as they are pushed.
	 */
	private fly(): void {
		if (this.flying) return;
		this.flying = true;
		let last = performance.now();
		const step = (now: number) => {
			if (!this.moving() || !this.mounted) {
				this.flying = false;
				return;
			}
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const [lx, ly] = this.sticks.look;
			if (lx !== 0 || ly !== 0) this.look(lx * LOOK_RATE * dt, ly * LOOK_RATE * dt);
			const b = this.back();
			const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
			const move = [0, 0, 0];
			const push = (x: number, y: number, z: number) => {
				for (let a = 0; a < 3; a++) move[a] += right[a] * x - b[a] * z + (a === 1 ? y : 0);
			};
			for (const code of this.held) push(...(MOVES[code] as [number, number, number]));
			// Pushed up is forward.
			const [mx, my] = this.sticks.move;
			push(mx, this.rise, -my);
			const d = BASE_SPEED * this.state.speed * dt;
			for (let a = 0; a < 3; a++) this.cam.target[a] += move[a] * d;
			this.redraw();
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	// -- drawing -------------------------------------------------------------------

	/**
	 * Lends the controller a holder for its canvas while the tab is in front.
	 * Answers with the function that takes it back.
	 */
	mount(els: ViewportElements): () => void {
		const run = ++this.mounted;
		this.els = els;
		const keys = this.keys();
		addEventListener("keydown", keys.down);
		addEventListener("keyup", keys.up);
		addEventListener("blur", keys.blur);
		const resize = new ResizeObserver(() => this.fit());
		resize.observe(els.holder);
		void this.start();
		return () => {
			if (this.mounted !== run) return;
			this.mounted = 0;
			removeEventListener("keydown", keys.down);
			removeEventListener("keyup", keys.up);
			removeEventListener("blur", keys.blur);
			resize.disconnect();
			this.held.clear();
			this.sticks = { move: [0, 0], look: [0, 0] };
			this.rise = 0;
			this.hideMarquee();
			this.view?.destroy();
			this.view = null;
			this.canvas?.remove();
			this.pivotMark?.remove();
			this.pivotMark = null;
			this.canvas = null;
			this.els = null;
		};
	}

	/** Lends the axes and the readout, from the bar. Answers with the function that takes them back. */
	mountCorner(corner: CornerElements): () => void {
		this.corner = corner;
		this.attachGizmo(corner.gizmo);
		const rate = setInterval(() => this.showRate(), 250);
		this.showRotation();
		return () => {
			clearInterval(rate);
			if (this.corner === corner) this.corner = null;
		};
	}

	private starting = false;
	/** The renderer starting, and the share of its shaders compiled, for the readout. */
	private startup: { backend: ViewRenderer["backend"]; shaders: number | null } | null = null;

	/** Starts `view`, the readout following its shaders as they compile. */
	private async initView(view: ViewRenderer, canvas: HTMLCanvasElement, place: PlaceScene) {
		const startup = { backend: view.backend, shaders: null as number | null };
		this.startup = startup;
		try {
			await view.init(canvas, place, (shaders) => {
				if (shaders === startup.shaders) return;
				startup.shaders = shaders;
				this.showRate();
			});
		} finally {
			if (this.startup === startup) this.startup = null;
		}
	}

	private async start(): Promise<void> {
		const els = this.els;
		const place = this.place;
		if (!els || !place || this.view || this.starting) return;
		this.starting = true;
		const run = this.mounted;
		const make = () => {
			this.canvas?.remove();
			this.pivotMark?.remove();
			this.pivotMark = null;
			const canvas = document.createElement("canvas");
			canvas.className = "vp-canvas";
			els.holder.append(canvas);
			const dpr = Math.min(2, devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.round(els.holder.clientWidth * dpr));
			canvas.height = Math.max(1, Math.round(els.holder.clientHeight * dpr));
			this.canvas = canvas;
			return canvas;
		};
		const gl2 = this.options.renderer === "webgl2";
		let view: ViewRenderer = gl2 ? new WebGl2View() : new WebGpuView();
		let fellBack = false;
		try {
			try {
				await this.initView(view, make(), place);
			} catch (err) {
				if (gl2) throw err;
				fellBack = true;
				view = new WebGl2View();
				await this.initView(view, make(), place);
			}
		} catch (err) {
			this.starting = false;
			this.set({ error: `Neither WebGPU nor WebGL2 is available here: ${String(err)}` });
			return;
		}
		this.starting = false;
		// Taken back while it started.
		if (run !== this.mounted || this.els !== els) {
			view.destroy();
			return;
		}
		view.setLighting(litFor((this.place ?? place).lighting, this.state.render.features));
		view.setOverlay(this.overlayLines());
		view.setOutline(this.options.outlineWidth, this.options.hideBehind);
		view.setGlassHides(this.options.glassHides);
		view.setPostEffects(this.options.postEffects);
		view.setRender(this.state.render);
		this.view = view;
		this.set({ backend: view.backend, fellBack, error: null });
		if (this.place !== place) view.setScene(this.place ?? place);
		this.loadLooks(view, this.place ?? place);
		this.loadImages(view, this.place ?? place);
		this.loadSky(view, (this.place ?? place).lighting);
		this.loadSunImage(view, (this.place ?? place).lighting);
		this.loadMeshes(view, this.place ?? place);
		this.loadUnions(view, this.place ?? place);
		this.attach(this.canvas as HTMLCanvasElement);
		this.refreshSelection();
		this.fit();
	}

	private fit(): void {
		const { view, canvas, els } = this;
		if (!view || !canvas || !els) return;
		const dpr = Math.min(2, devicePixelRatio || 1);
		const w = Math.max(1, Math.round(els.holder.clientWidth * dpr));
		const h = Math.max(1, Math.round(els.holder.clientHeight * dpr));
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
			view.resize(w, h);
		}
		this.redraw();
	}

	/** Draws at the next frame, once however many things asked. */
	/** When the last frame was drawn, for a frame rate's cap. */
	private lastDraw = 0;

	/**
	 * The next frame: the display's, or when the rate is Unlimited, as soon as
	 * the GPU has finished the frame before last, so two are in flight at most.
	 * Not waiting let frames queue up faster than the GPU drew them, and the
	 * view lagged a third of a second behind the pointer.
	 */
	private nextFrame(run: (now: number) => void): void {
		if (this.options.frameRate !== "unlimited") {
			requestAnimationFrame(run);
			return;
		}
		this.inFlight[0].then(
			() => asap(run),
			() => asap(run),
		);
	}

	/** The GPU's work for the frame before last and the last, under Unlimited. */
	private inFlight: [Promise<void>, Promise<void>] = [Promise.resolve(), Promise.resolve()];

	private redraw(): void {
		if (this.pending || !this.view) return;
		this.pending = true;
		this.wantedAt = performance.now();
		const draw = (now: number) => {
			if (!this.view) {
				this.pending = false;
				return;
			}
			// Capped: not yet this frame's turn, so the next one is asked again.
			const rate = this.options.frameRate;
			if (typeof rate === "number" && now - this.lastDraw < 1000 / rate - 1) {
				this.nextFrame(draw);
				return;
			}
			this.lastDraw = now;
			this.pending = false;
			const camera = this.camera();
			if ((showsHandles(this.state.tool) || this.state.pivotEdit) && this.selection.length > 0)
				this.drawHandles(camera.eye);
			this.followGizmos(camera.eye);
			this.view.draw(camera);
			if (rate === "unlimited") this.inFlight = [this.inFlight[1], this.view.settled()];
			this.drawPivot();
			this.frames.push(now);
			this.recordFrame(now);
			this.showRotation();
			// Beams and particles that move keep the view drawing, at the frame
			// rate's pace, until nothing moves, the Rendering panel turns them
			// off, or the tab is hidden; shown again, it carries on.
			if (this.view.animates() && !document.hidden) this.redraw();
		};
		this.nextFrame(draw);
	}

	/** The Performance panel's frame-time graph: see `frameGraph.ts`. */
	private history = new FrameHistory();
	/** When the frame being waited for was asked for, and when the last was drawn. */
	private wantedAt = 0;
	private drawnAt = Number.NEGATIVE_INFINITY;

	/** A frame drawn, into the graph: a few numbers into a ring, nothing drawn. */
	private recordFrame(now: number): void {
		const stats = this.view?.stats();
		const gpu = stats?.gpu;
		const interval = frameInterval(now, this.drawnAt, this.wantedAt);
		this.drawnAt = now;
		this.history.push({
			interval,
			page: stats?.cpu ?? Number.NaN,
			shadows: gpu?.shadows ?? Number.NaN,
			scene: gpu?.scene ?? Number.NaN,
			post: gpu?.post ?? Number.NaN,
		});
	}

	/** The last frames drawn, for the Performance panel's graph. */
	frameHistory(): FrameHistory {
		return this.history;
	}

	/** While any pointer or key is held, the view draws every frame. */
	private hold(on: boolean): void {
		this.holding = Math.max(0, this.holding + (on ? 1 : -1));
		if (this.holding === 0 || this.looping) return;
		this.looping = true;
		const tick = () => {
			if (this.holding === 0 || !this.view) {
				this.looping = false;
				return;
			}
			this.redraw();
			this.nextFrame(tick);
		};
		this.nextFrame(tick);
	}

	/** Frames drawn in the last second; idle rather than slow when nothing has moved. */
	private showRate(): void {
		const now = performance.now();
		while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
		const last = this.frames.at(-1);
		const idle = last === undefined || now - last > 400;
		if (this.corner)
			this.corner.rate.textContent = this.startup
				? startingText(this.startup.backend, this.startup.shaders)
				: `${idle ? "Idle" : `${this.frames.length}Hz`} (${this.state.backend ?? "…"})`;
	}

	/**
	 * The camera's rotation as Roblox writes an Orientation: X tilts the view up,
	 * Y turns it left, and this camera never rolls. With no turn it looks down
	 * -Z, as Roblox's does.
	 */
	private showRotation(): void {
		if (!this.corner) return;
		const x = (-this.cam.pitch * 180) / Math.PI;
		let y = ((this.cam.yaw * 180) / Math.PI) % 360;
		if (y > 180) y -= 360;
		if (y <= -180) y += 360;
		// No "-0.0": a turn that rounds to nothing is nothing.
		const deg = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
		this.corner.rotation.textContent = `X ${deg(x)}°  Y ${deg(y)}°  Z 0.0°`;
		this.drawGizmo();
	}

	/**
	 * The axes, as Blender draws them: where X, Y and Z point from this camera,
	 * the positive ends labelled, the negative ends plainer, nearest on top.
	 */
	private drawGizmo(): void {
		const svg = this.corner?.gizmo.querySelector("svg");
		if (!svg) return;
		const b = this.back();
		const forward = b.map((v) => -v);
		const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
		const up = [
			right[1] * forward[2] - right[2] * forward[1],
			right[2] * forward[0] - right[0] * forward[2],
			right[0] * forward[1] - right[1] * forward[0],
		];
		const R = GIZMO / 2 - 14;
		const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
		const ends = GIZMO_AXES.flatMap((axis) =>
			[1, -1].map((sign) => {
				const d = axis.dir.map((v) => v * sign);
				// Towards the camera is nearer: drawn last.
				return { x: dot(d, right) * R, y: -dot(d, up) * R, depth: -dot(d, forward), axis, sign };
			}),
		).sort((p, q) => p.depth - q.depth);
		svg.innerHTML =
			`<circle class="vp-gizmo-back" r="${GIZMO / 2 - 2}"/>` +
			ends
				.map((e) => {
					const x = e.x.toFixed(1);
					const y = e.y.toFixed(1);
					const id = `${e.sign > 0 ? "+" : "-"}${e.axis.name}`;
					return e.sign > 0
						? `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="${e.axis.col}" stroke-width="2.5" stroke-linecap="round"/>` +
								`<g class="vp-gizmo-end" data-axis="${id}"><circle cx="${x}" cy="${y}" r="9" fill="${e.axis.col}"/><text x="${x}" y="${(e.y + 3.6).toFixed(1)}" text-anchor="middle">${e.axis.name}</text></g>`
						: `<g class="vp-gizmo-end vp-gizmo-neg" data-axis="${id}"><circle cx="${x}" cy="${y}" r="7" fill="${e.axis.dark}" stroke="${e.axis.col}" stroke-width="1.5"/><text x="${x}" y="${(e.y + 3.2).toFixed(1)}" text-anchor="middle">−${e.axis.name}</text></g>`;
				})
				.join("");
	}

	/**
	 * The chosen tool's handles round the selection, all of it in one box, square
	 * to that box -- a part's own axes, a model's pivot -- in Studio's axis
	 * colours, the same size on screen near or far. With Edit Pivot on, the move
	 * and rotate handles both, at the pivot of the one thing picked.
	 */
	private drawHandles(eye?: number[]): void {
		if (!this.view) return;
		const { tool, pivotEdit, space } = this.state;
		const world = space === "world";
		const built = new HandleBuilder();
		const pivot = pivotEdit && this.selection.length === 1 ? this.pivotOf(this.selection[0]) : null;
		const b =
			!pivot && this.selection.length > 0 && showsHandles(tool)
				? world
					? this.worldBox(this.selection)
					: this.boxRound(this.selection)
				: null;
		const frame = pivot
			? { c: pivot.at, axes: world ? WORLD : pivot.axes, half: [0, 0, 0] }
			: b && b.length >= SCENE_STRIDE
				? {
						c: [b[9], b[10], b[11]],
						axes: [0, 1, 2].map((j) => unit([b[j * 3], b[j * 3 + 1], b[j * 3 + 2]], j)),
						half: [0, 1, 2].map((j) => Math.hypot(b[j * 3], b[j * 3 + 1], b[j * 3 + 2]) / 2),
					}
				: null;
		if (frame) {
			const { c, axes, half } = frame;
			const from = eye ?? this.camera().eye;
			const k = Math.hypot(from[0] - c[0], from[1] - c[1], from[2] - c[2]) * 0.016;
			// Out at the selection's faces, but never further than this on screen:
			// a 2048-stud baseplate keeps its handles in view.
			const out = (a: number) => Math.min(half[a], k * 12);
			const at = (dir: number[], d: number) => c.map((v, a) => v + dir[a] * d);
			const rings = pivot || tool === "rotate";
			const arrows = pivot || tool !== "rotate";
			axes.forEach((axis, a) => {
				const col = AXES[a][1];
				if (rings) {
					const radius = pivot
						? k * 8
						: Math.min(Math.max(Math.hypot(half[0], half[1], half[2]) * 1.05, k * 6), k * 16);
					built.ring(c, axis, radius, k * 0.36, col);
				}
				if (!arrows) return;
				for (const sign of [1, -1]) {
					const dir = axis.map((v) => v * sign);
					const tip = at(dir, out(a) + k * 6.5);
					built.along("cylinder", at(dir, out(a) + k * 0.8), tip, k * 0.36, col);
					if (pivot || tool === "move")
						built.along("cone", tip, at(dir, out(a) + k * 9), k * 1.6, col);
					else built.ball(at(dir, out(a) + k * 7.3), k * 2.1, col);
				}
			});
		}
		this.view.setHandles(built.build());
	}

	/** The pivot's mark over the view: drawn over everything, on what one thing is picked. */
	private pivotMark: SVGSVGElement | null = null;

	/**
	 * The pivot of the one thing picked, as Studio shows it: a dot, with its
	 * three axes in their colours, over every part in front of it.
	 */
	private drawPivot(): void {
		const canvas = this.canvas;
		const holder = canvas?.parentElement;
		const pivot = this.selection.length === 1 ? this.pivotOf(this.selection[0]) : null;
		if (!canvas || !holder || !pivot) {
			this.pivotMark?.remove();
			this.pivotMark = null;
			return;
		}
		if (!this.pivotMark || this.pivotMark.parentElement !== holder) {
			this.pivotMark?.remove();
			this.pivotMark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			this.pivotMark.setAttribute("class", "vp-pivot");
			this.pivotMark.setAttribute("aria-hidden", "true");
			holder.append(this.pivotMark);
		}
		const mark = this.pivotMark;
		const box = canvas.getBoundingClientRect();
		Object.assign(mark.style, {
			left: `${canvas.offsetLeft}px`,
			top: `${canvas.offsetTop}px`,
			width: `${box.width}px`,
			height: `${box.height}px`,
		});
		const shot = this.shot(box);
		const centre = screenPoint(shot, pivot.at);
		if (!centre) {
			mark.innerHTML = "";
			return;
		}
		const eye = this.eye();
		const k = Math.hypot(...pivot.at.map((v, a) => v - eye[a])) * 0.016;
		// Its axes only with Edit Pivot on, as Studio shows them: otherwise the dot alone.
		const axes = this.state.pivotEdit ? pivot.axes : [];
		const lines = axes
			.map((axis, a) => {
				const end = screenPoint(
					shot,
					pivot.at.map((v, i) => v + axis[i] * k * 4),
				);
				if (!end) return "";
				const [x, y] = end.map((v) => v.toFixed(1));
				const col = GIZMO_AXES[a].col;
				return `<line x1="${centre[0].toFixed(1)}" y1="${centre[1].toFixed(1)}" x2="${x}" y2="${y}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="3" fill="${col}"/>`;
			})
			.join("");
		mark.innerHTML = `${lines}<circle cx="${centre[0].toFixed(1)}" cy="${centre[1].toFixed(1)}" r="5" fill="#fff" stroke="#14171c" stroke-width="1.5"/>`;
	}

	/** The handles' axes, object or world: Ctrl+L, and the bar's toggle. */
	setSpace(space: "object" | "world"): void {
		if (!this.state.editable) return;
		this.set({ space });
		this.drawHandles();
		this.redraw();
	}

	/** Edit Pivot, on or off: the bar's toggle. */
	setPivotEdit(on: boolean): void {
		if (on && !this.state.editable) return;
		// Its handles want a tool: Select, picked up again.
		this.set(
			on && this.state.tool === null ? { pivotEdit: on, tool: "select" } : { pivotEdit: on },
		);
		this.drawHandles();
		this.redraw();
	}

	/**
	 * Where Studio's camera was when the place was saved, as a frustum ten
	 * studs deep, with a small triangle on its top edge for which way is up.
	 */
	private frustumLines(): Float32Array {
		const studio = this.place?.camera;
		if (!studio) return new Float32Array();
		const fov = studio.fieldOfView * (Math.PI / 180);
		const r = studio.rotation;
		const right = [r[0], r[3], r[6]];
		const up = [r[1], r[4], r[7]];
		const look = [-r[2], -r[5], -r[8]];
		const p = studio.position;
		const D = 10;
		const h = D * Math.tan(fov / 2);
		const w = h * (16 / 9);
		const at = (sx: number, sy: number) =>
			[0, 1, 2].map((a) => p[a] + look[a] * D + right[a] * sx + up[a] * sy);
		const corners = [at(-w, -h), at(w, -h), at(w, h), at(-w, h)];
		const col = [1, 0.84, 0.38];
		const out: number[] = [];
		const line = (a: number[], b: number[]) => out.push(...a, ...col, ...b, ...col);
		for (const c of corners) line(p, c);
		for (let i = 0; i < 4; i++) line(corners[i], corners[(i + 1) % 4]);
		const tip = at(0, h * 1.45);
		line(at(-w * 0.35, h * 1.06), tip);
		line(tip, at(w * 0.35, h * 1.06));
		line(at(w * 0.35, h * 1.06), at(-w * 0.35, h * 1.06));
		return new Float32Array(out);
	}

	/** Where the light ranges were last found from, or null with them off. */
	private gizmoAt: string | null = null;

	/** The overlay: Studio's camera, and with Light ranges on, the lights near `eye`. */
	private overlayLines(eye: number[] = this.eye()): Float32Array {
		const frustum = this.frustumLines();
		if (!this.state.render.lightRanges) {
			this.gizmoAt = null;
			return frustum;
		}
		this.gizmoAt = gizmoCell(eye);
		const gizmos = lightGizmoLines(this.place?.lights, eye);
		if (gizmos.length === 0) return frustum;
		const out = new Float32Array(frustum.length + gizmos.length);
		out.set(frustum);
		out.set(gizmos, frustum.length);
		return out;
	}

	/** The light ranges found again once the camera has moved a step: see `GIZMO_STEP`. */
	private followGizmos(eye: number[]): void {
		if (!this.view || !this.state.render.lightRanges || this.gizmoAt === gizmoCell(eye)) return;
		this.view.setOverlay(this.overlayLines(eye));
	}

	// -- input -------------------------------------------------------------------

	/** The view's keys, while it is in front: never while typing, nor with Ctrl or Cmd held. */
	private keys() {
		const typing = (e: KeyboardEvent) =>
			Boolean(
				(e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]"),
			) || Boolean(document.querySelector("dialog[open], .dialog-backdrop"));
		return {
			down: (e: KeyboardEvent) => {
				// Ctrl+L, Cmd+L on a Mac, as in Studio: the handles' axes, the object's
				// or the world's. Taken from the browser, whose own is the address bar.
				if (
					(e.ctrlKey || e.metaKey) &&
					!e.altKey &&
					!e.shiftKey &&
					e.code === "KeyL" &&
					!typing(e)
				) {
					e.preventDefault();
					this.setSpace(this.state.space === "world" ? "object" : "world");
					return;
				}
				if (typing(e) || e.ctrlKey || e.metaKey) return;
				if (MOVES[e.code] && !e.altKey) {
					this.held.add(e.code);
					this.fly();
					return;
				}
				if (e.key === "f" || e.key === "F") this.frameSelection();
				else if (e.key === "Home") this.fitAll();
				else if (e.key === "Escape") this.clear();
				else {
					// The bar's order. Studio's Ctrl+1 to Ctrl+4 are the browser's, for its own tabs.
					const pick = toolForKey(e.key);
					if (pick && !e.altKey) this.chooseTool(pick);
				}
			},
			up: (e: KeyboardEvent) => this.held.delete(e.code),
			blur: () => this.held.clear(),
		};
	}

	/** The box a left-drag draws, over the canvas; there only while it is drawn. */
	private marquee: HTMLElement | null = null;

	private hideMarquee(): void {
		this.marquee?.remove();
		this.marquee = null;
	}

	/**
	 * The mouse: a click picks, as below. A left-drag draws a box and picks each
	 * part whose centre is inside it, and with Shift adds them to what is
	 * picked. Alt and a left-drag orbits round what is picked, right-drag looks,
	 * and middle-drag, or Shift and a right-drag, pans. Scroll zooms.
	 *
	 * Touch and pen: one finger orbits, or pans with Shift held, two fingers
	 * pinch and pan, a tap picks and a long press picks as Alt and a click do.
	 *
	 * A press that moves no more than DRAG is a click: the GPU's pick, of the
	 * highest Model in Workspace there, or with Alt or Shift the part. With
	 * Settings' `altClickSteps`, Alt picks one Model further in instead.
	 *
	 * With no tool, nothing picks: no click, box, long press or hover outline,
	 * and a left-drag does nothing. The camera's drags all stay.
	 */
	private attach(el: HTMLCanvasElement): void {
		const pointers = new Map<number, { x: number; y: number }>();
		// The pointers that hold the view drawing every frame: see pointerdown.
		const holding = new Set<number>();
		let moved = 0;
		let mode: DragMode = "orbit";
		// Where a left-drag's box started, and whether it adds to what is picked.
		let start: { x: number; y: number; adding: boolean } | null = null;
		let pinch = 0;
		/** The box from where the drag started to the pointer, in CSS pixels from the canvas's corner. */
		const boxTo = (from: { x: number; y: number }, e: PointerEvent) => {
			const r = el.getBoundingClientRect();
			return {
				r,
				rect: rectBetween(from.x - r.left, from.y - r.top, e.clientX - r.left, e.clientY - r.top),
			};
		};
		const drawBox = (from: { x: number; y: number }, e: PointerEvent) => {
			const holder = el.parentElement;
			if (!holder) return;
			if (!this.marquee) {
				this.marquee = document.createElement("div");
				this.marquee.className = "vp-marquee";
				holder.append(this.marquee);
			}
			const { rect } = boxTo(from, e);
			const s = this.marquee.style;
			s.left = `${el.offsetLeft + rect.left}px`;
			s.top = `${el.offsetTop + rect.top}px`;
			s.width = `${rect.right - rect.left}px`;
			s.height = `${rect.bottom - rect.top}px`;
		};
		const takeBox = (from: { x: number; y: number; adding: boolean }, e: PointerEvent) => {
			const { r, rect } = boxTo(from, e);
			// Each part's outermost Model, as a click takes it, and the parts no Model holds.
			const parts = partsInRect(this.words, this.shot(r), rect);
			const inside = this.place ? boxTargets(this.place.outline, this.workspace, parts) : parts;
			if (from.adding && inside.length === 0) return;
			this.pickHere(from.adding ? addTo(this.selection, inside) : inside);
		};
		// A touch held still picks as Alt and a click do, where a touch screen has no Alt.
		let press: ReturnType<typeof setTimeout> | undefined;
		let pressed = false;
		const unpress = () => {
			clearTimeout(press);
			press = undefined;
		};
		const idAt = (x: number, y: number) => {
			const box = el.getBoundingClientRect();
			const dpr = el.width / box.width;
			return this.pickId(Math.floor((x - box.left) * dpr), Math.floor((y - box.top) * dpr));
		};
		// The mouse over the view outlines, faintly, what a click there would pick:
		// a ray against the parts' own shapes, once a frame while it moves.
		let aim: { x: number; y: number; alt: boolean; shift: boolean } | null = null;
		let aiming = 0;
		// The part the ray last met, -1 for none: a step down moves on after each click.
		let aimed = -1;
		const hoverAimed = () => {
			this.setHover(
				aim && aimed >= 0 ? this.clickTarget(aimed, this.reachFor(aim.alt, aim.shift)) : null,
			);
		};
		// `toggle` is Ctrl, Cmd on a Mac: what the click reaches joins what is
		// picked, or leaves it, rather than replacing it.
		const pickAt = async (x: number, y: number, reach: Reach, toggle = false) => {
			if (!this.view || !picks(this.state.tool)) return;
			const id = await idAt(x, y);
			if (!toggle) this.pickHere(id >= 0 ? [this.clickTarget(id, reach)] : []);
			else if (id >= 0) {
				const target = this.clickTarget(id, reach);
				this.pickHere(
					this.selection.includes(target)
						? this.selection.filter((i) => i !== target)
						: [...this.selection, target],
				);
			}
			// What the next click would pick, which a step down has just moved.
			if (aim) hoverAimed();
		};
		el.addEventListener("pointermove", (e) => {
			if (e.pointerType !== "mouse" || pointers.size > 0) return;
			// With no tool nothing is picked, so nothing is outlined as if it would be.
			if (!picks(this.state.tool)) {
				aim = null;
				aimed = -1;
				return;
			}
			aim = { x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey };
			if (aiming) return;
			aiming = requestAnimationFrame(() => {
				aiming = 0;
				if (!aim || !this.place || pointers.size > 0 || !picks(this.state.tool)) return;
				const box = el.getBoundingClientRect();
				aimed = rayPick(this.place, this.eye(), this.rayAt(aim.x - box.left, aim.y - box.top, box));
				hoverAimed();
			});
		});
		el.addEventListener("pointerleave", () => {
			aim = null;
			aimed = -1;
			this.setHover(null);
		});
		el.addEventListener("contextmenu", (e) => e.preventDefault());
		el.addEventListener("pointerdown", (e) => {
			el.setPointerCapture(e.pointerId);
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			moved = 0;
			pressed = false;
			mode = dragMode(e, this.state.tool);
			// Drawn every frame only while the camera can move. A box is drawn over
			// the view and changes nothing in it: held, a box redrew the whole place
			// each frame for nothing, and a large place stalled as the drag began.
			if ((mode !== "box" && mode !== "none") || pointers.size > 1) {
				holding.add(e.pointerId);
				this.hold(true);
			}
			start =
				mode === "box"
					? { x: e.clientX, y: e.clientY, adding: e.shiftKey || e.ctrlKey || e.metaKey }
					: null;
			this.hideMarquee();
			unpress();
			if (pointers.size === 1 && e.pointerType !== "mouse" && picks(this.state.tool)) {
				const { clientX: x, clientY: y } = e;
				press = setTimeout(() => {
					press = undefined;
					if (moved > DRAG || pointers.size !== 1) return;
					pressed = true;
					void pickAt(x, y, this.reachFor(true, false));
				}, LONG_PRESS);
			}
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				pinch = Math.hypot(a.x - b.x, a.y - b.y);
			}
		});
		el.addEventListener("pointermove", (e) => {
			const last = pointers.get(e.pointerId);
			if (!last) return;
			const dx = e.clientX - last.x;
			const dy = e.clientY - last.y;
			moved += Math.abs(dx) + Math.abs(dy);
			if (moved > DRAG) unpress();
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (mode === "box") {
				if (start && moved > DRAG) drawBox(start, e);
				return;
			}
			// A left-drag with no tool moves nothing, as in Studio.
			if (mode === "none") return;
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				const d = Math.hypot(a.x - b.x, a.y - b.y);
				if (pinch > 0) this.cam.dist = Math.max(2, this.cam.dist * (pinch / d));
				pinch = d;
				this.pan(dx / 2, dy / 2);
			} else if (mode === "pan") this.pan(dx, dy);
			else if (mode === "look") this.look(dx, dy);
			else this.orbit(dx, dy);
			this.redraw();
		});
		el.addEventListener("pointerup", (e) => {
			if (!pointers.has(e.pointerId)) return;
			pointers.delete(e.pointerId);
			if (holding.delete(e.pointerId)) this.hold(false);
			unpress();
			this.hideMarquee();
			const from = start;
			start = null;
			if (mode === "box" && from && moved > DRAG && e.button === 0) {
				takeBox(from, e);
				return;
			}
			// A long press has picked already.
			if (pressed || pointers.size > 0 || moved > DRAG || e.button !== 0) return;
			void pickAt(
				e.clientX,
				e.clientY,
				this.reachFor(e.altKey, e.shiftKey),
				e.ctrlKey || e.metaKey,
			);
		});
		el.addEventListener("pointercancel", (e) => {
			unpress();
			this.hideMarquee();
			start = null;
			pointers.delete(e.pointerId);
			if (holding.delete(e.pointerId)) this.hold(false);
		});
		el.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault();
				// Shift turns a wheel's turn sideways in most browsers: either way, a notch.
				if (e.shiftKey) {
					const d = e.deltaY || e.deltaX;
					if (d !== 0) this.setSpeed(this.state.speed * (d > 0 ? 1 / SPEED_NOTCH : SPEED_NOTCH));
					return;
				}
				this.cam.dist = Math.max(2, this.cam.dist * Math.exp(e.deltaY * 0.0012));
				this.redraw();
			},
			{ passive: false },
		);
	}

	/** A click on an axis's end looks along it; a drag orbits. */
	private attachGizmo(gizmo: HTMLElement): void {
		let down: { x: number; y: number; moved: number; axis?: string } | null = null;
		gizmo.onpointerdown = (e) => {
			// Which end was pressed, read now: once the gizmo has the pointer, events are its own.
			const axis = (e.target as Element).closest?.<SVGGElement>("[data-axis]")?.dataset.axis;
			gizmo.setPointerCapture(e.pointerId);
			down = { x: e.clientX, y: e.clientY, moved: 0, axis };
			this.hold(true);
		};
		gizmo.onpointermove = (e) => {
			if (!down) return;
			const dx = e.clientX - down.x;
			const dy = e.clientY - down.y;
			down.moved += Math.abs(dx) + Math.abs(dy);
			down.x = e.clientX;
			down.y = e.clientY;
			this.cam.yaw -= dx * 0.012;
			this.cam.pitch = clampPitch(this.cam.pitch + dy * 0.012);
			this.redraw();
		};
		gizmo.onpointerup = () => {
			if (!down) return;
			const clicked = down.moved < 4;
			const along = down.axis ? ALONG[down.axis] : undefined;
			down = null;
			this.hold(false);
			if (clicked && along) this.turnTo(along[0], along[1]);
		};
		gizmo.onpointercancel = () => {
			if (down) this.hold(false);
			down = null;
		};
	}
}
