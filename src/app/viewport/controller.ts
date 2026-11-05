/**
 * The viewport's working parts, outside React: the renderer, the camera, the
 * tool and its handles, picking, and the corner's text and axes. App keeps one
 * for the session, so the camera is where it was when the tab comes back; the
 * `Viewport` component lends it a canvas while the tab is in front.
 */

import type { PlaceOutline } from "../../core/rbx/browse.js";
import type { LightingParams } from "../../core/rbx/lighting.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";
import { HandleBuilder } from "./handles.js";
import type { Camera, ViewRenderer } from "./view.js";
import { WebGl2View } from "./webgl2.js";
import { WebGpuView } from "./webgpu.js";

export const TOOLS = [
	["select", "Select", "1"],
	["move", "Move", "2"],
	["rotate", "Rotate", "3"],
	["scale", "Scale", "4"],
] as const;
export type Tool = (typeof TOOLS)[number][0];

/** What the bar and Properties show, for React. */
export interface ViewportState {
	tool: Tool;
	speed: number;
	backend: "WebGPU" | "WebGL2" | null;
	/** WebGPU was asked for and was not there. */
	fellBack: boolean;
	/** Why nothing is drawn, when nothing can be. */
	error: string | null;
	/** The place as drawn: parts by shape, and what lights it. */
	summary: { parts: number; meshes: number; transparent: number; notes: string[] } | null;
}

export type ViewportPlace = PlaceScene & { lighting: LightingParams; outline: PlaceOutline };

/** Studs a second at 1×: a walk across M103's tank in about half a second. */
const BASE_SPEED = 24;
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
	gizmo: HTMLElement;
	rotation: HTMLElement;
	rate: HTMLElement;
}

export class ViewportController {
	private state: ViewportState = {
		tool: "select",
		speed: 1,
		backend: null,
		fellBack: false,
		error: null,
		summary: null,
	};
	private listeners = new Set<() => void>();
	private place: ViewportPlace | null = null;
	/** Each drawn part's 14 words, by its row in the DataModel browser. */
	private words = new Map<number, Float32Array>();
	private kids: number[][] = [];
	private workspace = -1;
	private selected: number | null = null;
	private cam = { target: [0, 0, 0], yaw: 0.8, pitch: 0.42, dist: 60 };
	private framed = false;
	private view: ViewRenderer | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private els: ViewportElements | null = null;
	private mounted = 0;
	private pending = false;
	private holding = 0;
	private looping = false;
	private frames: number[] = [];
	private held = new Set<string>();
	private flying = false;
	private turning = 0;

	constructor(private readonly onPick: (index: number | null) => void) {}

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
		for (const k of SCENE_KINDS) {
			const { data, count } = place.kinds[k];
			const u = new Uint32Array(data.buffer, data.byteOffset, data.length);
			for (let i = 0; i < count; i++)
				this.words.set(
					u[i * SCENE_STRIDE + 13],
					data.slice(i * SCENE_STRIDE, (i + 1) * SCENE_STRIDE),
				);
		}
		const { nodes, classes } = place.outline;
		this.kids = nodes.map(() => []);
		this.workspace = -1;
		nodes.forEach(([cls, , parent], i) => {
			if (parent >= 0) this.kids[parent].push(i);
			else if (classes[cls] === "Workspace") this.workspace = i;
		});
		if (this.selected !== null && this.selected >= nodes.length) this.selected = null;
		this.set({
			summary: {
				parts: this.words.size,
				meshes: place.kinds.mesh.count,
				transparent: place.transparent,
				notes: place.lighting.notes,
			},
		});
		if (this.view) {
			this.view.setScene(place);
			this.view.setLighting(place.lighting);
			this.view.setOverlay(this.frustumLines());
			this.refreshSelection();
		} else void this.start();
		if (!this.framed) {
			this.framed = true;
			this.fitAll();
		}
	}

	/** The instance picked elsewhere -- the tree, or Properties -- to outline. Leaves the camera be. */
	select(index: number | null): void {
		if (index === this.selected) return;
		this.selected = index;
		this.refreshSelection();
	}

	private refreshSelection(): void {
		this.view?.setSelection(
			this.selected === null ? new Float32Array() : this.boxFor(this.selected),
		);
		this.drawHandles();
		this.redraw();
	}

	/** A part's own box, or one round every part inside an instance, square to the world. */
	private boxFor(index: number): Float32Array {
		const own = this.words.get(index);
		if (own) return own;
		const lo = [Infinity, Infinity, Infinity];
		const hi = [-Infinity, -Infinity, -Infinity];
		const visit = (i: number) => {
			const w = this.words.get(i);
			if (w)
				for (let c = 0; c < 8; c++) {
					const s = [c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5];
					for (let a = 0; a < 3; a++) {
						const v = w[9 + a] + w[a] * s[0] + w[3 + a] * s[1] + w[6 + a] * s[2];
						lo[a] = Math.min(lo[a], v);
						hi[a] = Math.max(hi[a], v);
					}
				}
			for (const k of this.kids[i] ?? []) visit(k);
		};
		visit(index);
		if (lo[0] === Infinity) return new Float32Array();
		return new Float32Array([
			hi[0] - lo[0],
			0,
			0,
			0,
			hi[1] - lo[1],
			0,
			0,
			0,
			hi[2] - lo[2],
			(lo[0] + hi[0]) / 2,
			(lo[1] + hi[1]) / 2,
			(lo[2] + hi[2]) / 2,
			0,
			0,
		]);
	}

	/** What a click on a part picks: the highest Model in Workspace that holds it, or with Alt or Shift the part. */
	private clickTarget(part: number, partItself: boolean): number {
		if (partItself || !this.place) return part;
		const { nodes, classes } = this.place.outline;
		let top = part;
		for (let p = nodes[part]?.[2] ?? -1; p >= 0 && p !== this.workspace; p = nodes[p][2])
			if (classes[nodes[p][0]] === "Model") top = p;
		return top;
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

	private camera(): Camera {
		return {
			eye: this.eye(),
			at: this.cam.target,
			near: Math.min(2, Math.max(0.1, this.cam.dist * 0.01)),
			far: Math.max(40000, this.cam.dist * 200),
		};
	}

	/** Frames the selection (F); Studio's camera by what its frustum covers. */
	frameSelection(): void {
		if (this.selected === null) return;
		const studio = this.place?.camera;
		if (studio && this.selected === studio.id) {
			const r = studio.rotation;
			this.cam.target = [0, 1, 2].map((a) => studio.position[a] - r[a * 3 + 2] * 5);
			this.cam.dist = 34;
			this.redraw();
			return;
		}
		const b = this.boxFor(this.selected);
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

	setTool(tool: Tool): void {
		this.set({ tool });
		this.drawHandles();
		this.redraw();
	}

	private setSpeed(speed: number): void {
		this.set({ speed: Math.max(0.05, Math.min(50, speed)) });
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
		const b = this.selected === null ? null : this.boxFor(this.selected);
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

	/** WASD along the look, Q and E down and up, for as long as they are held. */
	private fly(): void {
		if (this.flying) return;
		this.flying = true;
		let last = performance.now();
		const step = (now: number) => {
			if (this.held.size === 0 || !this.mounted) {
				this.flying = false;
				return;
			}
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const b = this.back();
			const right = [Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw)];
			const move = [0, 0, 0];
			for (const code of this.held) {
				const [x, y, z] = MOVES[code];
				for (let a = 0; a < 3; a++) move[a] += right[a] * x - b[a] * z + (a === 1 ? y : 0);
			}
			const d = BASE_SPEED * this.state.speed * dt;
			for (let a = 0; a < 3; a++) this.cam.target[a] += move[a] * d;
			this.redraw();
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	// -- drawing -------------------------------------------------------------------

	/**
	 * Lends the controller a holder for its canvas and the corner's parts, while
	 * the tab is in front. Answers with the function that takes them back.
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
		const rate = setInterval(() => this.showRate(), 250);
		this.attachGizmo(els.gizmo);
		void this.start();
		return () => {
			if (this.mounted !== run) return;
			this.mounted = 0;
			removeEventListener("keydown", keys.down);
			removeEventListener("keyup", keys.up);
			removeEventListener("blur", keys.blur);
			resize.disconnect();
			clearInterval(rate);
			this.held.clear();
			this.view?.destroy();
			this.view = null;
			this.canvas?.remove();
			this.canvas = null;
			this.els = null;
		};
	}

	private starting = false;

	private async start(): Promise<void> {
		const els = this.els;
		const place = this.place;
		if (!els || !place || this.view || this.starting) return;
		this.starting = true;
		const run = this.mounted;
		const make = () => {
			this.canvas?.remove();
			const canvas = document.createElement("canvas");
			canvas.className = "vp-canvas";
			els.holder.append(canvas);
			const dpr = Math.min(2, devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.round(els.holder.clientWidth * dpr));
			canvas.height = Math.max(1, Math.round(els.holder.clientHeight * dpr));
			this.canvas = canvas;
			return canvas;
		};
		let view: ViewRenderer = new WebGpuView();
		let fellBack = false;
		try {
			try {
				await view.init(make(), place);
			} catch {
				fellBack = true;
				view = new WebGl2View();
				await view.init(make(), place);
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
		view.setLighting(place.lighting);
		view.setOverlay(this.frustumLines());
		this.view = view;
		this.set({ backend: view.backend, fellBack, error: null });
		if (this.place !== place) view.setScene(this.place ?? place);
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
	private redraw(): void {
		if (this.pending || !this.view) return;
		this.pending = true;
		requestAnimationFrame((now) => {
			this.pending = false;
			if (!this.view) return;
			const camera = this.camera();
			if (this.state.tool !== "select" && this.selected !== null) this.drawHandles(camera.eye);
			this.view.draw(camera);
			this.frames.push(now);
			this.showRotation();
		});
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
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	/** Frames drawn in the last second; idle rather than slow when nothing has moved. */
	private showRate(): void {
		const now = performance.now();
		while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
		const last = this.frames.at(-1);
		const idle = last === undefined || now - last > 400;
		if (this.els)
			this.els.rate.textContent = `${idle ? "Idle" : `${this.frames.length}Hz`} (${this.state.backend ?? "…"})`;
	}

	/**
	 * The camera's rotation as Roblox writes an Orientation: X tilts the view up,
	 * Y turns it left, and this camera never rolls. With no turn it looks down
	 * -Z, as Roblox's does.
	 */
	private showRotation(): void {
		if (!this.els) return;
		const x = (-this.cam.pitch * 180) / Math.PI;
		let y = ((this.cam.yaw * 180) / Math.PI) % 360;
		if (y > 180) y -= 360;
		if (y <= -180) y += 360;
		// No "-0.0": a turn that rounds to nothing is nothing.
		const deg = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
		this.els.rotation.textContent = `X ${deg(x)}°  Y ${deg(y)}°  Z 0.0°`;
		this.drawGizmo();
	}

	/**
	 * The axes, as Blender draws them: where X, Y and Z point from this camera,
	 * the positive ends labelled, the negative ends plainer, nearest on top.
	 */
	private drawGizmo(): void {
		const svg = this.els?.gizmo.querySelector("svg");
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
	 * The chosen tool's handles round the selection, square to the world, in
	 * Studio's axis colours, the same size on screen near or far.
	 */
	private drawHandles(eye?: number[]): void {
		if (!this.view) return;
		const { tool } = this.state;
		const b = this.selected !== null && tool !== "select" ? this.boxFor(this.selected) : null;
		const built = new HandleBuilder();
		if (b && b.length >= SCENE_STRIDE) {
			const c = [b[9], b[10], b[11]];
			const half = [0, 1, 2].map(
				(a) => (Math.abs(b[a]) + Math.abs(b[3 + a]) + Math.abs(b[6 + a])) / 2,
			);
			const from = eye ?? this.camera().eye;
			const k = Math.hypot(from[0] - c[0], from[1] - c[1], from[2] - c[2]) * 0.016;
			// Out at the selection's faces, but never further than this on screen:
			// a 2048-stud baseplate keeps its handles in view.
			const out = (a: number) => Math.min(half[a], k * 12);
			const at = (dir: number[], d: number) => c.map((v, a) => v + dir[a] * d);
			for (const [axis, col] of AXES) {
				const a = axis[0] ? 0 : axis[1] ? 1 : 2;
				if (tool === "rotate") {
					const radius = Math.min(
						Math.max(Math.hypot(half[0], half[1], half[2]) * 1.05, k * 6),
						k * 16,
					);
					built.ring(c, axis, radius, k * 0.36, col);
					continue;
				}
				for (const sign of [1, -1]) {
					const dir = axis.map((v) => v * sign);
					const tip = at(dir, out(a) + k * 6.5);
					built.along("cylinder", at(dir, out(a) + k * 0.8), tip, k * 0.36, col);
					if (tool === "move") built.along("cone", tip, at(dir, out(a) + k * 9), k * 1.6, col);
					else built.ball(at(dir, out(a) + k * 7.3), k * 2.1, col);
				}
			}
		}
		this.view.setHandles(built.build());
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

	// -- input -------------------------------------------------------------------

	/** The view's keys, while it is in front: never while typing, nor with Ctrl or Cmd held. */
	private keys() {
		const typing = (e: KeyboardEvent) =>
			Boolean(
				(e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]"),
			) || Boolean(document.querySelector("dialog[open], .dialog-backdrop"));
		return {
			down: (e: KeyboardEvent) => {
				if (typing(e) || e.ctrlKey || e.metaKey) return;
				if (MOVES[e.code] && !e.altKey) {
					this.held.add(e.code);
					this.fly();
					return;
				}
				if (e.key === "f" || e.key === "F") this.frameSelection();
				else if (e.key === "Home") this.fitAll();
				else if (e.key === "Escape" && this.selected !== null) this.onPick(null);
				else {
					// The bar's order. Studio's Ctrl+1 to Ctrl+4 are the browser's, for its own tabs.
					const pick = TOOLS.find(([, , key]) => key === e.key);
					if (pick && !e.altKey) this.setTool(pick[0]);
				}
			},
			up: (e: KeyboardEvent) => this.held.delete(e.code),
			blur: () => this.held.clear(),
		};
	}

	/**
	 * Mouse and touch: left-drag orbits, right-drag looks, middle or Shift-drag
	 * pans, two fingers pinch and pan, and a tap that did not move picks.
	 */
	private attach(el: HTMLCanvasElement): void {
		const pointers = new Map<number, { x: number; y: number }>();
		let moved = 0;
		let mode: "orbit" | "look" | "pan" = "orbit";
		let pinch = 0;
		el.addEventListener("contextmenu", (e) => e.preventDefault());
		el.addEventListener("pointerdown", (e) => {
			el.setPointerCapture(e.pointerId);
			this.hold(true);
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			moved = 0;
			mode = e.button === 2 ? "look" : e.button === 1 || e.shiftKey ? "pan" : "orbit";
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
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
		el.addEventListener("pointerup", async (e) => {
			if (!pointers.has(e.pointerId)) return;
			pointers.delete(e.pointerId);
			this.hold(false);
			if (pointers.size > 0 || moved > 6 || !this.view || e.button !== 0) return;
			const box = el.getBoundingClientRect();
			const dpr = el.width / box.width;
			const id = await this.view.pick(
				this.camera(),
				Math.floor((e.clientX - box.left) * dpr),
				Math.floor((e.clientY - box.top) * dpr),
			);
			const target = id >= 0 ? this.clickTarget(id, e.altKey || e.shiftKey) : null;
			this.select(target);
			this.onPick(target);
		});
		el.addEventListener("pointercancel", (e) => {
			if (pointers.delete(e.pointerId)) this.hold(false);
		});
		el.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault();
				// Shift turns a wheel's turn sideways in most browsers: either way, a notch.
				if (e.shiftKey) {
					const d = e.deltaY || e.deltaX;
					if (d !== 0) this.setSpeed(this.state.speed * (d > 0 ? 1 / 1.25 : 1.25));
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
