/**
 * The place's Beams and ParticleEmitters, animated: each frame, the beams'
 * strips (facing the camera where they do, their textures scrolled) and the
 * particles' quads, simulated here in typed arrays and laid out as one buffer
 * of quads both renderers draw the same way, farthest first. See
 * `core/rbx/effects.ts` for what is read from the place.
 *
 * Nothing here touches the GPU or the page: it is numbers in and numbers out,
 * so the simulation is the same in both renderers and can be tested.
 */

import {
	beamControls,
	bezier,
	bezierTangent,
	colourAt,
	numberAt,
	type SceneBeam,
	type SceneEffects,
	type SceneEmitter,
} from "../../core/rbx/effects.js";

/**
 * Words a vertex: position, image position, colour as RGBA8 (Color and 1 -
 * Transparency), then LightEmission, LightInfluence and Brightness.
 */
export const EFFECT_VERTEX = 9;
/** Four vertices a quad, drawn as two triangles by `quadIndices`. */
export const QUAD_VERTICES = 4;

/** The most particles one emitter keeps alive, and the most in the whole view. */
export const PARTICLES_PER_EMITTER = 1000;
export const PARTICLES_MOST = 20000;
/** Emitters further than this from the camera, in studs, are not simulated. */
export const EMITTER_REACH = 600;
/** The longest step the simulation takes: a frame after a pause does not jump. */
export const LONGEST_STEP = 0.1;
/** How a newly reached emitter is brought to how it would look by now: steps of this long, at most this many. */
const WARM_STEP = 1 / 15;
const WARM_STEPS = 150;

/**
 * Stand-in images, for an effect with none or whose image has not arrived:
 * plain white, which a beam with no Texture is drawn in; a soft round dot for
 * a particle; and a band soft at its edges for a beam whose image is not here.
 */
export const FALLBACK_WHITE = "~white";
export const FALLBACK_DOT = "~dot";
export const FALLBACK_BAND = "~band";

/** The stand-ins' pixels, `size` square, RGBA8, white with the alpha of each shape. */
export function fallbackPixels(kind: string, size = 64): Uint8Array {
	const out = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const o = (y * size + x) * 4;
			const dx = ((x + 0.5) / size) * 2 - 1;
			const dy = ((y + 0.5) / size) * 2 - 1;
			let a = 1;
			if (kind === FALLBACK_DOT) {
				const r = Math.min(1, Math.hypot(dx, dy));
				a = (1 - r * r) ** 2;
			} else if (kind === FALLBACK_BAND) a = 1 - dy * dy;
			out[o] = out[o + 1] = out[o + 2] = 255;
			out[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
		}
	return out;
}

/** Two triangles a quad, for `quads` quads: corners 0, 1, 2 and 0, 2, 3. */
export function quadIndices(quads: number): Uint32Array {
	const out = new Uint32Array(quads * 6);
	for (let q = 0; q < quads; q++) {
		const v = q * 4;
		out.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
	}
	return out;
}

/** A run of quads drawn with one image. */
export interface EffectBatch {
	/** The image's asset id, or one of the stand-ins. */
	texture: string;
	first: number;
	count: number;
}

/** One frame of effects, as the renderers draw them. */
export interface EffectFrame {
	/** `quads` quads of `QUAD_VERTICES` vertices of `EFFECT_VERTEX` words. */
	vertices: Float32Array;
	quads: number;
	batches: EffectBatch[];
	/** Beams drawn, and particles alive in the simulation. */
	beams: number;
	particles: number;
	/** Whether the next frame would look different: particles alive or coming, or a texture scrolling. */
	moving: boolean;
}

/** What the effects are drawn for: where the camera is and what it sees. */
export interface EffectView {
	eye: number[];
	at: number[];
	/** Width over height. */
	aspect: number;
	/** The vertical field of view, in radians. */
	fov: number;
}

/** The Rendering panel's switches for them. */
export interface EffectShow {
	beams: boolean;
	particles: boolean;
}

/** A small, fast seeded random: mulberry32. Numbers from 0 up to 1. */
export function seeded(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Enum.NormalId as an axis and a sign: Right, Top, Back, Left, Bottom, Front. */
const NORMALS: [number, number][] = [
	[0, 1],
	[1, 1],
	[2, 1],
	[0, -1],
	[1, -1],
	[2, -1],
];

/**
 * Where a new particle starts and which way it goes, in its emitter's own
 * space (studs from its middle, along its axes), into `pos` and `dir` (unit
 * length). A part emits from its box in the emitter's Shape: a Box from its
 * volume or surface, towards EmissionDirection; a Sphere from the ball in the
 * box, outward, ShapePartial of it round EmissionDirection; a Cylinder round
 * EmissionDirection's axis, outward, narrowing to ShapePartial at the end it
 * points to; a Disc square to EmissionDirection, from ShapePartial of its
 * radius out to its rim, towards EmissionDirection. ShapeInOut turns the
 * direction round. An Attachment emits from its point, towards EmissionDirection.
 */
export function emitPoint(
	e: SceneEmitter,
	random: () => number,
	pos: number[],
	dir: number[],
): void {
	const [axis, sign] = NORMALS[e.direction] ?? NORMALS[1];
	const a1 = (axis + 1) % 3;
	const a2 = (axis + 2) % 3;
	pos[0] = pos[1] = pos[2] = 0;
	dir[0] = dir[1] = dir[2] = 0;
	dir[axis] = sign;
	const size = e.box;
	if (!size) return;
	const surface = e.shapeStyle === 1;
	const partial = Math.max(0, Math.min(1, e.shapePartial));
	if (e.shape === 1) {
		// Sphere: a direction within ShapePartial of the sphere round the axis.
		const c = 1 - 2 * partial + 2 * partial * random();
		const s = Math.sqrt(Math.max(0, 1 - c * c));
		const phi = random() * 2 * Math.PI;
		const u = [0, 0, 0];
		u[axis] = c * sign;
		u[a1] = s * Math.cos(phi);
		u[a2] = s * Math.sin(phi);
		const r = surface ? 1 : Math.cbrt(random());
		for (let k = 0; k < 3; k++) {
			pos[k] = u[k] * r * size[k] * 0.5;
			dir[k] = u[k];
		}
	} else if (e.shape === 2) {
		// Cylinder: along the axis, round it, narrowing towards the end it points to.
		const h = random();
		const narrow = 1 + (partial - 1) * h;
		const r = (surface ? 1 : Math.sqrt(random())) * narrow;
		const phi = random() * 2 * Math.PI;
		const cx = Math.cos(phi);
		const cy = Math.sin(phi);
		pos[axis] = (h - 0.5) * size[axis] * sign;
		pos[a1] = cx * r * size[a1] * 0.5;
		pos[a2] = cy * r * size[a2] * 0.5;
		dir[axis] = 0;
		dir[a1] = cx;
		dir[a2] = cy;
	} else if (e.shape === 3) {
		// Disc: square to the axis through the middle, ShapePartial of the radius out.
		const inner = partial;
		const r = surface ? 1 : Math.sqrt(inner * inner + (1 - inner * inner) * random());
		const phi = random() * 2 * Math.PI;
		pos[a1] = Math.cos(phi) * r * size[a1] * 0.5;
		pos[a2] = Math.sin(phi) * r * size[a2] * 0.5;
	} else if (surface) {
		// Box surface: a face picked by its area, then a point on it.
		const areas = [size[1] * size[2], size[0] * size[2], size[0] * size[1]];
		const total = 2 * (areas[0] + areas[1] + areas[2]);
		let pick = random() * total;
		let face = 0;
		for (; face < 5; face++) {
			pick -= areas[face % 3];
			if (pick <= 0) break;
		}
		const f = face % 3;
		for (let k = 0; k < 3; k++) pos[k] = (random() - 0.5) * size[k];
		pos[f] = (face < 3 ? 0.5 : -0.5) * size[f];
	} else for (let k = 0; k < 3; k++) pos[k] = (random() - 0.5) * size[k];
	const flip = e.shapeInOut === 1 || (e.shapeInOut === 2 && random() < 0.5);
	if (flip) for (let k = 0; k < 3; k++) dir[k] = -dir[k];
}

/** `dir` (unit) turned by up to half of SpreadAngle's two angles, in degrees, about two axes square to it. */
export function spreadDirection(
	dir: number[],
	spread: [number, number],
	random: () => number,
): void {
	if (spread[0] === 0 && spread[1] === 0) return;
	const ax = ((random() - 0.5) * spread[0] * Math.PI) / 180;
	const ay = ((random() - 0.5) * spread[1] * Math.PI) / 180;
	// Two axes square to dir: X and Z for a direction straight up, as for Top.
	const ref = Math.abs(dir[1]) < 0.99 ? [0, 1, 0] : [0, 0, 1];
	let p = cross(ref, dir);
	p = scale(p, 1 / (Math.hypot(p[0], p[1], p[2]) || 1));
	const q = cross(dir, p);
	// Tilted towards p by ax and towards q by ay.
	const tx = Math.tan(Math.max(-1.5, Math.min(1.5, ax)));
	const ty = Math.tan(Math.max(-1.5, Math.min(1.5, ay)));
	let d = [0, 1, 2].map((k) => dir[k] + p[k] * tx + q[k] * ty);
	// Past a quarter turn the tangent would lose it: turn about p and q in turn instead.
	if (Math.abs(ax) > 1.5 || Math.abs(ay) > 1.5) {
		d = turnAbout(turnAbout(dir, q, ax), p, -ay);
	}
	const n = Math.hypot(d[0], d[1], d[2]) || 1;
	for (let k = 0; k < 3; k++) dir[k] = d[k] / n;
}

function cross(a: number[], b: number[]): number[] {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function scale(a: number[], k: number): number[] {
	return [a[0] * k, a[1] * k, a[2] * k];
}
function unit(a: number[]): number[] {
	const n = Math.hypot(a[0], a[1], a[2]);
	return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}
/** `v` turned round the unit axis `k` by `angle`, Rodrigues' way. */
function turnAbout(v: number[], k: number[], angle: number): number[] {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
	const x = cross(k, v);
	return [0, 1, 2].map((a) => v[a] * c + x[a] * s + k[a] * d * (1 - c));
}

/** Words a particle: position, velocity, age, lifetime, rotation, its speed, then its random picks. */
const P = 14;
const AGE = 6;
const LIFE = 7;
const ROT = 8;
const SPIN = 9;
/** Its picks within the Size and Transparency envelopes, -1 to 1; its flipbook rate and start. */
const SIZE_PICK = 10;
const SEE_PICK = 11;
const FRAME_RATE = 12;
const FRAME_START = 13;

interface Emitter {
	def: SceneEmitter;
	random: () => number;
	data: Float32Array;
	count: number;
	cap: number;
	/** Particles owed, as a fraction carried from frame to frame. */
	owed: number;
	/** Being simulated: in reach of the camera. */
	awake: boolean;
	/** Where it is, and how far round that its particles go. */
	centre: number[];
	radius: number;
}

/**
 * The place's Beams and ParticleEmitters, as they look at a moment. `seed`
 * makes every emitter's randomness the same from run to run.
 */
export class EffectsSim {
	private emitters: Emitter[] = [];
	private beams: SceneBeam[] = [];
	private last: number | null = null;
	private elapsed = 0;
	private vertices = new Float32Array(0);
	private words = new Uint32Array(0);
	/** Particles alive across every emitter. */
	private alive = 0;

	constructor(effects: SceneEffects | undefined, seed = 1) {
		this.beams = effects?.beams ?? [];
		for (const def of effects?.emitters ?? []) {
			const life = Math.max(def.lifetime[0], def.lifetime[1]);
			const cap = Math.min(PARTICLES_PER_EMITTER, Math.ceil(def.rate * life) + 1);
			const speed = Math.max(Math.abs(def.speed[0]), Math.abs(def.speed[1]));
			const half = def.box ? Math.hypot(def.box[0], def.box[1], def.box[2]) / 2 : 0;
			const travel = speed * life + 0.5 * Math.hypot(...def.acceleration) * life * life;
			const grow = Math.max(...def.size.map((k) => k[1] + Math.abs(k[2])));
			this.emitters.push({
				def,
				random: seeded(Math.imul(def.id + 1, 0x9e3779b1) ^ seed),
				data: new Float32Array(cap * P),
				count: 0,
				cap,
				owed: 0,
				awake: false,
				centre: def.frame.position,
				radius: half + Math.min(travel, EMITTER_REACH) + grow,
			});
		}
	}

	/** Whether there is anything to draw at all. */
	get empty(): boolean {
		return this.beams.length === 0 && this.emitters.length === 0;
	}

	/**
	 * Moves the particles on to `now`, in seconds, and lays out what `view`
	 * sees. `ready` says whether an image has arrived; what has not is drawn
	 * with a stand-in.
	 */
	frame(
		view: EffectView,
		now: number,
		show: EffectShow,
		ready: (asset: string) => boolean,
	): EffectFrame {
		const dt = this.last === null ? 0 : Math.max(0, Math.min(LONGEST_STEP, now - this.last));
		this.last = now;
		this.elapsed += dt;
		const eye = view.eye;
		const forward = unit([view.at[0] - eye[0], view.at[1] - eye[1], view.at[2] - eye[2]]);
		let right = unit(cross(forward, [0, 1, 0]));
		if (right[0] === 0 && right[1] === 0 && right[2] === 0) right = [1, 0, 0];
		const up = cross(right, forward);
		// Half the view's diagonal, as an angle: what is further round than that is out of view.
		const diagonal = Math.atan(Math.tan(view.fov / 2) * Math.hypot(1, view.aspect));
		const seen = (centre: number[], radius: number) => {
			const d = [centre[0] - eye[0], centre[1] - eye[1], centre[2] - eye[2]];
			const dist = Math.hypot(d[0], d[1], d[2]);
			if (dist <= radius) return true;
			const along = (d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2]) / dist;
			return Math.acos(Math.max(-1, Math.min(1, along))) < diagonal + Math.asin(radius / dist);
		};

		let moving = false;
		const batches: (EffectBatch & { far: number; fill: (at: number) => number })[] = [];
		let quads = 0;
		if (show.particles) {
			for (const em of this.emitters) {
				const d = Math.hypot(em.centre[0] - eye[0], em.centre[1] - eye[1], em.centre[2] - eye[2]);
				const near = d - em.radius < EMITTER_REACH;
				if (!near) {
					if (em.awake) this.sleep(em);
					continue;
				}
				if (!em.awake) this.wake(em);
				else this.step(em, dt * em.def.timeScale);
				if (em.def.timeScale > 0) moving = true;
				if (em.count === 0 || !seen(em.centre, em.radius)) continue;
				const count = em.count;
				const texture = em.def.texture && ready(em.def.texture) ? em.def.texture : FALLBACK_DOT;
				batches.push({
					texture,
					first: 0,
					count,
					far: d - em.def.zOffset,
					fill: (at) => this.particleQuads(em, at, eye, right, up, forward),
				});
				quads += count;
			}
		} else for (const em of this.emitters) if (em.awake) this.sleep(em);

		let beams = 0;
		if (show.beams)
			for (const beam of this.beams) {
				const [p0, , , p3] = beamControls(beam);
				const mid = [0, 1, 2].map((k) => (p0[k] + p3[k]) / 2);
				const reach = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]) / 2;
				const radius =
					reach +
					Math.abs(beam.curve0) +
					Math.abs(beam.curve1) +
					Math.max(beam.width0, beam.width1);
				if (!seen(mid, radius)) continue;
				const has = !!beam.texture && ready(beam.texture);
				const texture =
					has && beam.texture ? beam.texture : beam.texture ? FALLBACK_BAND : FALLBACK_WHITE;
				if (has && beam.textureSpeed !== 0) moving = true;
				beams++;
				batches.push({
					texture,
					first: 0,
					count: beam.segments,
					far: Math.hypot(mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]) - beam.zOffset,
					fill: (at) => this.beamQuads(beam, at, eye, has),
				});
				quads += beam.segments;
			}

		this.room(quads);
		// Farthest first: blended and writing no depth, the nearer has to come last.
		batches.sort((a, b) => b.far - a.far);
		let at = 0;
		const out: EffectBatch[] = [];
		for (const b of batches) {
			const made = b.fill(at);
			if (made === 0) continue;
			const prev = out[out.length - 1];
			if (prev && prev.texture === b.texture && prev.first + prev.count === at) prev.count += made;
			else out.push({ texture: b.texture, first: at, count: made });
			at += made;
		}
		return {
			vertices: this.vertices.subarray(0, at * QUAD_VERTICES * EFFECT_VERTEX),
			quads: at,
			batches: out,
			beams,
			particles: this.alive,
			moving,
		};
	}

	/** Room in the buffer for `quads` quads. */
	private room(quads: number): void {
		const need = quads * QUAD_VERTICES * EFFECT_VERTEX;
		if (this.vertices.length >= need) return;
		this.vertices = new Float32Array(Math.max(need, this.vertices.length * 2));
		this.words = new Uint32Array(this.vertices.buffer);
	}

	/** An emitter out of reach: its particles let go. */
	private sleep(em: Emitter): void {
		this.alive -= em.count;
		em.count = 0;
		em.owed = 0;
		em.awake = false;
	}

	/** An emitter come into reach: run on as far as its longest lifetime, so it looks as it would by now. */
	private wake(em: Emitter): void {
		em.awake = true;
		const life = Math.max(em.def.lifetime[0], em.def.lifetime[1]);
		const steps = Math.min(WARM_STEPS, Math.ceil(life / WARM_STEP));
		const dt = steps > 0 ? life / steps : 0;
		for (let i = 0; i < steps; i++) this.step(em, dt);
	}

	/** One step of `dt` seconds: the old move on and die, the new are born. */
	private step(em: Emitter, dt: number): void {
		if (dt <= 0) return;
		const def = em.def;
		const data = em.data;
		const [ax, ay, az] = def.acceleration;
		const keep = def.drag !== 0 ? 0.5 ** (def.drag * dt) : 1;
		for (let i = 0; i < em.count; ) {
			const o = i * P;
			data[o + AGE] += dt;
			if (data[o + AGE] >= data[o + LIFE]) {
				// Its place taken by the last.
				em.count--;
				this.alive--;
				data.copyWithin(o, em.count * P, em.count * P + P);
				continue;
			}
			data[o + 3] = (data[o + 3] + ax * dt) * keep;
			data[o + 4] = (data[o + 4] + ay * dt) * keep;
			data[o + 5] = (data[o + 5] + az * dt) * keep;
			data[o] += data[o + 3] * dt;
			data[o + 1] += data[o + 4] * dt;
			data[o + 2] += data[o + 5] * dt;
			data[o + ROT] += data[o + SPIN] * dt;
			i++;
		}
		em.owed += def.rate * dt;
		const born = Math.floor(em.owed);
		em.owed -= born;
		for (let n = 0; n < born; n++) {
			if (em.count >= em.cap || this.alive >= PARTICLES_MOST) {
				em.owed = 0;
				break;
			}
			// Born somewhere within the step, and moved on by what is left of it.
			this.spawn(em, dt * em.random());
		}
	}

	private scratchPos = [0, 0, 0];
	private scratchDir = [0, 0, 0];

	private spawn(em: Emitter, into: number): void {
		const def = em.def;
		const random = em.random;
		const pick = (r: [number, number]) => r[0] + (r[1] - r[0]) * random();
		const life = pick(def.lifetime);
		if (life <= 0) return;
		const pos = this.scratchPos;
		const dir = this.scratchDir;
		emitPoint(def, random, pos, dir);
		spreadDirection(dir, def.spread, random);
		const speed = pick(def.speed);
		const r = def.frame.rotation;
		const p = def.frame.position;
		const o = em.count * P;
		const data = em.data;
		for (let k = 0; k < 3; k++) {
			const world = p[k] + r[k * 3] * pos[0] + r[k * 3 + 1] * pos[1] + r[k * 3 + 2] * pos[2];
			const v = (r[k * 3] * dir[0] + r[k * 3 + 1] * dir[1] + r[k * 3 + 2] * dir[2]) * speed;
			data[o + 3 + k] = v + def.acceleration[k] * into;
			data[o + k] = world + v * into;
		}
		data[o + AGE] = into;
		data[o + LIFE] = life;
		data[o + SPIN] = (pick(def.rotSpeed) * Math.PI) / 180;
		data[o + ROT] = (pick(def.rotation) * Math.PI) / 180 + data[o + SPIN] * into;
		data[o + SIZE_PICK] = random() * 2 - 1;
		data[o + SEE_PICK] = random() * 2 - 1;
		data[o + FRAME_RATE] = Math.min(30, Math.max(0, pick(def.flipbook.framerate)));
		data[o + FRAME_START] = def.flipbook.startRandom ? random() : 0;
		em.count++;
		this.alive++;
	}

	private order = new Uint32Array(0);
	private away = new Float32Array(0);
	private colour = [0, 0, 0];

	/** An emitter's particles as quads from quad `at`, farthest first; how many were laid out. */
	private particleQuads(
		em: Emitter,
		at: number,
		eye: number[],
		right: number[],
		up: number[],
		forward: number[],
	): number {
		const def = em.def;
		const data = em.data;
		const n = em.count;
		if (this.order.length < n) {
			this.order = new Uint32Array(n * 2);
			this.away = new Float32Array(n * 2);
		}
		const order = this.order;
		const away = this.away;
		for (let i = 0; i < n; i++) {
			const o = i * P;
			const dx = data[o] - eye[0];
			const dy = data[o + 1] - eye[1];
			const dz = data[o + 2] - eye[2];
			away[i] = dx * forward[0] + dy * forward[1] + dz * forward[2];
			order[i] = i;
		}
		const sorted = order.subarray(0, n).sort((a, b) => away[b] - away[a]);
		const v = this.vertices;
		const w = this.words;
		const fb = def.flipbook;
		const frames = fb.layout > 0 ? fb.columns * fb.rows : 1;
		const colour = this.colour;
		let made = 0;
		for (const i of sorted) {
			const o = i * P;
			const age = data[o + AGE];
			const life = data[o + LIFE];
			const t = Math.min(1, age / life);
			const see = numberAt(def.transparency, t, data[o + SEE_PICK]);
			const alpha = 1 - Math.max(0, Math.min(1, see));
			// Nothing shows: drawing it would cost its pixels for nothing.
			if (alpha < 0.5 / 255) continue;
			const size = Math.max(0, numberAt(def.size, t, data[o + SIZE_PICK]));
			if (size <= 0) continue;
			const squash = numberAt(def.squash, t);
			// Squash above 0 makes it narrower and taller, below 0 the other way.
			const sx = squash >= 0 ? 1 / (1 + squash) : 1 - squash;
			const sy = squash >= 0 ? 1 + squash : 1 / (1 - squash);
			let px = data[o];
			let py = data[o + 1];
			let pz = data[o + 2];
			let half = size / 2;
			if (def.zOffset !== 0) {
				// Towards the camera by ZOffset, its size on screen kept.
				const tx = eye[0] - px;
				const ty = eye[1] - py;
				const tz = eye[2] - pz;
				const dist = Math.hypot(tx, ty, tz) || 1;
				const z = Math.min(def.zOffset, dist - 0.05);
				px += (tx / dist) * z;
				py += (ty / dist) * z;
				pz += (tz / dist) * z;
				half *= (dist - z) / dist;
			}
			// Its two axes, by Orientation, then turned by its rotation (clockwise for positive).
			let ax = right;
			let ay = up;
			const vx = data[o + 3];
			const vy = data[o + 4];
			const vz = data[o + 5];
			const speed = Math.hypot(vx, vy, vz);
			if (def.orientation === 1) {
				const to = unit([eye[0] - px, 0, eye[2] - pz]);
				ax = to[0] === 0 && to[2] === 0 ? right : [to[2], 0, -to[0]];
				ay = [0, 1, 0];
			} else if (def.orientation === 2 && speed > 1e-6) {
				ay = [vx / speed, vy / speed, vz / speed];
				const side = unit(cross(ay, [eye[0] - px, eye[1] - py, eye[2] - pz]));
				ax = side[0] === 0 && side[1] === 0 && side[2] === 0 ? right : side;
			} else if (def.orientation === 3 && speed > 1e-6) {
				const n = [vx / speed, vy / speed, vz / speed];
				const ref = Math.abs(n[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
				ax = unit(cross(ref, n));
				ay = cross(n, ax);
			}
			const rot = data[o + ROT];
			const c = Math.cos(rot) * half;
			const s = Math.sin(rot) * half;
			const rx0 = (ax[0] * c - ay[0] * s) * sx;
			const rx1 = (ax[1] * c - ay[1] * s) * sx;
			const rx2 = (ax[2] * c - ay[2] * s) * sx;
			const ry0 = (ay[0] * c + ax[0] * s) * sy;
			const ry1 = (ay[1] * c + ax[1] * s) * sy;
			const ry2 = (ay[2] * c + ax[2] * s) * sy;
			// The flipbook's frame, by FlipbookMode.
			let u0 = 0;
			let v0 = 0;
			let du = 1;
			let dv = 1;
			if (frames > 1) {
				const f = flipbookFrame(
					fb.mode,
					frames,
					t,
					age * data[o + FRAME_RATE] + data[o + FRAME_START] * frames,
					i,
				);
				du = 1 / fb.columns;
				dv = 1 / fb.rows;
				u0 = (f % fb.columns) * du;
				v0 = Math.floor(f / fb.columns) * dv;
			}
			colourAt(def.color, t, colour);
			const word = packColour(colour, alpha);
			let b = (at + made) * QUAD_VERTICES * EFFECT_VERTEX;
			// Top left, top right, bottom right, bottom left.
			for (let q = 0; q < 4; q++) {
				const cx = q === 0 || q === 3 ? -1 : 1;
				const cy = q < 2 ? 1 : -1;
				v[b] = px + rx0 * cx + ry0 * cy;
				v[b + 1] = py + rx1 * cx + ry1 * cy;
				v[b + 2] = pz + rx2 * cx + ry2 * cy;
				v[b + 3] = cx < 0 ? u0 : u0 + du;
				v[b + 4] = cy > 0 ? v0 : v0 + dv;
				w[b + 5] = word;
				v[b + 6] = def.lightEmission;
				v[b + 7] = def.lightInfluence;
				v[b + 8] = def.brightness;
				b += EFFECT_VERTEX;
			}
			made++;
		}
		return made;
	}

	/** A beam as quads from quad `at`, one a segment; how many were laid out. */
	private beamQuads(beam: SceneBeam, at: number, eye: number[], textured: boolean): number {
		const [p0, p1, p2, p3] = beamControls(beam);
		const n = beam.segments;
		// Where each segment's ends are, and how far along the beam, in studs.
		const points: number[][] = [];
		const along: number[] = [0];
		for (let i = 0; i <= n; i++) {
			points.push(bezier(p0, p1, p2, p3, i / n));
			if (i > 0) {
				const a = points[i - 1];
				const b = points[i];
				along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
			}
		}
		// The texture's run along the beam: TextureLength times for Stretch, once
		// every TextureLength studs for Wrap and Static; moved on by TextureSpeed
		// a second, from Attachment0 towards Attachment1.
		const scroll = textured ? this.elapsed * beam.textureSpeed : 0;
		const uAt = (i: number) => {
			const tile =
				beam.textureMode === 0
					? (i / n) * beam.textureLength
					: along[i] / Math.max(beam.textureLength, 1e-3);
			return tile - scroll;
		};
		// Not facing the camera, the beam lies flat along the attachments' Z axes.
		const z0 = [beam.from.rotation[2], beam.from.rotation[5], beam.from.rotation[8]];
		const z1 = [beam.to.rotation[2], beam.to.rotation[5], beam.to.rotation[8]];
		const edges: number[][][] = [];
		const colour = this.colour;
		const words: number[] = [];
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			let p = points[i];
			const tangent = unit(bezierTangent(p0, p1, p2, p3, Math.min(Math.max(t, 1e-4), 1 - 1e-4)));
			let side: number[];
			if (beam.faceCamera)
				side = unit(cross(tangent, [eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]]));
			else {
				const z = [0, 1, 2].map((k) => z0[k] + (z1[k] - z0[k]) * t);
				const d = z[0] * tangent[0] + z[1] * tangent[1] + z[2] * tangent[2];
				side = unit([z[0] - tangent[0] * d, z[1] - tangent[1] * d, z[2] - tangent[2] * d]);
			}
			let half = (beam.width0 + (beam.width1 - beam.width0) * t) / 2;
			if (beam.zOffset !== 0) {
				const to = [eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]];
				const dist = Math.hypot(to[0], to[1], to[2]) || 1;
				const z = Math.min(beam.zOffset, dist - 0.05);
				p = p.map((v, k) => v + (to[k] / dist) * z);
				half *= (dist - z) / dist;
			}
			edges.push([p.map((v, k) => v + side[k] * half), p.map((v, k) => v - side[k] * half)]);
			colourAt(beam.color, t, colour);
			const see = numberAt(beam.transparency, t);
			words.push(packColour(colour, 1 - Math.max(0, Math.min(1, see))));
		}
		const v = this.vertices;
		const w = this.words;
		for (let i = 0; i < n; i++) {
			const base = (at + i) * QUAD_VERTICES * EFFECT_VERTEX;
			const corners: [number[], number, number, number][] = [
				[edges[i][0], uAt(i), 0, words[i]],
				[edges[i + 1][0], uAt(i + 1), 0, words[i + 1]],
				[edges[i + 1][1], uAt(i + 1), 1, words[i + 1]],
				[edges[i][1], uAt(i), 1, words[i]],
			];
			for (let q = 0; q < 4; q++) {
				const [pos, cu, cv, word] = corners[q];
				const b = base + q * EFFECT_VERTEX;
				v[b] = pos[0];
				v[b + 1] = pos[1];
				v[b + 2] = pos[2];
				v[b + 3] = cu;
				v[b + 4] = cv;
				w[b + 5] = word;
				v[b + 6] = beam.lightEmission;
				v[b + 7] = beam.lightInfluence;
				v[b + 8] = beam.brightness;
			}
		}
		return n;
	}
}

/**
 * A flipbook's frame, 0 to `frames` - 1, by Enum.ParticleFlipbookMode: Loop
 * runs through them at its rate; OneShot once over the particle's life, `t`;
 * PingPong forth and back; Random a frame picked afresh each step. `run` is
 * how many frames' time it has been going, its random start included.
 */
export function flipbookFrame(
	mode: number,
	frames: number,
	t: number,
	run: number,
	particle: number,
): number {
	let f: number;
	if (mode === 1) f = Math.floor(t * frames);
	else if (mode === 2) {
		const cycle = Math.max(1, frames * 2 - 2);
		const k = Math.floor(run) % cycle;
		f = k < frames ? k : cycle - k;
	} else if (mode === 3) {
		const h = Math.imul((particle + 1) * 7919 + Math.floor(run), 0x9e3779b1) >>> 0;
		f = Math.floor(((h ^ (h >>> 16)) / 4294967296) * frames);
	} else f = Math.floor(run) % frames;
	return Math.max(0, Math.min(frames - 1, f));
}

/** Red, green and blue from 0 to 1 and an alpha, as one RGBA8 word. */
export function packColour(rgb: number[], alpha: number): number {
	const b = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
	return (b(rgb[0]) | (b(rgb[1]) << 8) | (b(rgb[2]) << 16) | (b(alpha) << 24)) >>> 0;
}

/**
 * The light a lit effect is drawn in, linear: Ambient and OutdoorAmbient
 * everywhere, and the sun as it would light a face turned half to it, as a
 * camera-facing quad on average is. An approximation: no shadows, no lights.
 */
export function effectLight(l: {
	sun: number[];
	sunColour: number[];
	ambient: number[];
	indoor?: number[];
}): number[] {
	const up = Math.max(0, l.sun[1] ?? 0);
	const sun = 0.35 + 0.15 * up;
	return [0, 1, 2].map((k) => (l.indoor?.[k] ?? 0) + l.ambient[k] + l.sunColour[k] * sun);
}

/** What a particle or beam pixel adds to the render heatmap, in its units: an image read, its colour, the air, the blend. */
export const EFFECT_COST = 4;

/** Floats in the block the effects' shaders read: see `effectBlock`. */
export const EFFECT_BLOCK = 16 + 4 * 5;

/**
 * The block the effects' shaders read: the view's matrix; the camera and
 * 2 to the ExposureCompensation; the light a lit effect is drawn in and the
 * Rendering panel's mode; Lighting's fog (start, end, on) and the haze's
 * density; the fog's colour and whether haze is drawn; the haze's colour and
 * a pixel's share of the render heatmap.
 */
export function effectBlock(
	viewProj: Float32Array,
	eye: number[],
	l: {
		sun: number[];
		sunColour: number[];
		ambient: number[];
		indoor?: number[];
		exposure: number;
		hazeDensity: number;
		hazeColour: number[];
		fog: { start: number; end: number; colour: number[]; on: boolean };
	},
	mode: number,
	haze: boolean,
	costShare: number,
): Float32Array {
	const out = new Float32Array(EFFECT_BLOCK);
	out.set(viewProj, 0);
	out.set([eye[0], eye[1], eye[2], l.exposure], 16);
	out.set([...effectLight(l), mode], 20);
	out.set([l.fog.start, l.fog.end, l.fog.on ? 1 : 0, l.hazeDensity], 24);
	out.set([...l.fog.colour, haze ? 1 : 0], 28);
	out.set([...l.hazeColour, costShare], 32);
	return out;
}
