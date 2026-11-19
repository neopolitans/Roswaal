/**
 * A place's Beams and ParticleEmitters as the place editor draws them: what
 * each one is, read once from the DataModel and sent with the scene, as plain
 * numbers the viewer animates every frame (see `../app/viewport/effects.ts`).
 *
 * The properties mean what Roblox's Creator Documentation says they do: a
 * Beam is a cubic Bézier from Attachment0 to Attachment1, its middle control
 * points CurveSize0 along Attachment0's X axis and CurveSize1 back along
 * Attachment1's; a ParticleEmitter in a part emits from the part's box in its
 * Shape, and one in an Attachment from the attachment's point.
 */

import { assetIdOf } from "../../../core/rbx/browse.js";
import {
	type ColorKeypoint,
	type NumberKeypoint,
	type RbxInstance,
	stringProp,
} from "../../../core/rbx/dom.js";

/** A frame in the world: a row-major 3x3 rotation and a position. */
export interface EffectFrame {
	rotation: number[];
	position: number[];
}

export interface SceneBeam {
	/** The Beam's row in the DataModel browser. */
	id: number;
	/** Attachment0's and Attachment1's world frames. */
	from: EffectFrame;
	to: EffectFrame;
	curve0: number;
	curve1: number;
	width0: number;
	width1: number;
	segments: number;
	faceCamera: boolean;
	/** The image's asset id; none for a beam drawn in its colour alone. */
	texture?: string;
	/** Enum.TextureMode: Stretch 0, Wrap 1, Static 2. */
	textureMode: number;
	textureLength: number;
	textureSpeed: number;
	color: ColorKeypoint[];
	transparency: NumberKeypoint[];
	lightEmission: number;
	lightInfluence: number;
	brightness: number;
	zOffset: number;
}

export interface SceneEmitter {
	/** The ParticleEmitter's row in the DataModel browser. */
	id: number;
	/** Where it emits from: its part's frame, or its Attachment's. */
	frame: EffectFrame;
	/** The part's size; none for an Attachment, which emits from a point. */
	box?: number[];
	/** Enum.ParticleEmitterShape: Box 0, Sphere 1, Cylinder 2, Disc 3. */
	shape: number;
	/** Enum.ParticleEmitterShapeStyle: Volume 0, Surface 1. */
	shapeStyle: number;
	/** Enum.ParticleEmitterShapeInOut: Outward 0, Inward 1, InAndOut 2. */
	shapeInOut: number;
	shapePartial: number;
	/** Enum.NormalId of the face it emits from. */
	direction: number;
	rate: number;
	lifetime: [number, number];
	speed: [number, number];
	/** Degrees, about the emission direction's two cross axes. */
	spread: [number, number];
	acceleration: number[];
	drag: number;
	rotation: [number, number];
	rotSpeed: [number, number];
	size: NumberKeypoint[];
	transparency: NumberKeypoint[];
	squash: NumberKeypoint[];
	color: ColorKeypoint[];
	texture?: string;
	lightEmission: number;
	lightInfluence: number;
	brightness: number;
	/** Enum.ParticleOrientation: FacingCamera 0, FacingCameraWorldUp 1, VelocityParallel 2, VelocityPerpendicular 3. */
	orientation: number;
	zOffset: number;
	timeScale: number;
	/** Enum.ParticleFlipbookLayout: None 0, 2x2 1, 4x4 2, 8x8 3, Custom 4; then its grid. */
	flipbook: {
		layout: number;
		columns: number;
		rows: number;
		/** Enum.ParticleFlipbookMode: Loop 0, OneShot 1, PingPong 2, Random 3. */
		mode: number;
		framerate: [number, number];
		startRandom: boolean;
	};
}

export interface SceneEffects {
	beams: SceneBeam[];
	emitters: SceneEmitter[];
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function num(inst: RbxInstance, name: string, fallback: number): number {
	const v = inst.props.get(name)?.value;
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pair(inst: RbxInstance, name: string, fallback: [number, number]): [number, number] {
	const v = inst.props.get(name)?.value;
	return Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x === "number")
		? [v[0] as number, v[1] as number]
		: fallback;
}

function vec3(inst: RbxInstance, name: string): number[] | undefined {
	const v = inst.props.get(name)?.value;
	return Array.isArray(v) && v.length === 3 ? (v as number[]) : undefined;
}

function numbers(inst: RbxInstance, name: string, fallback: number): NumberKeypoint[] {
	const v = inst.props.get(name)?.value;
	return Array.isArray(v) && v.length > 0
		? (v as NumberKeypoint[])
		: [
				[0, fallback, 0],
				[1, fallback, 0],
			];
}

function colours(inst: RbxInstance, name: string): ColorKeypoint[] {
	const v = inst.props.get(name)?.value;
	return Array.isArray(v) && v.length > 0
		? (v as ColorKeypoint[])
		: [
				[0, 1, 1, 1, 0],
				[1, 1, 1, 1, 0],
			];
}

/** The image's asset id: a Content value's uri, else the ContentId string. */
function textureOf(inst: RbxInstance): string | undefined {
	const content = inst.props.get("TextureContent")?.value as { uri?: string } | undefined;
	const raw = content?.uri || stringProp(inst, "Texture") || "";
	return assetIdOf(raw.trim());
}

/** `frame` then `by`: CFrame multiplication. */
function compose(frame: EffectFrame, by: EffectFrame): EffectFrame {
	const a = frame.rotation;
	const b = by.rotation;
	const o = by.position;
	return {
		rotation: Array.from({ length: 9 }, (_, n) => {
			const i = Math.floor(n / 3);
			const j = n % 3;
			return a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
		}),
		position: [0, 1, 2].map(
			(i) => frame.position[i] + a[i * 3] * o[0] + a[i * 3 + 1] * o[1] + a[i * 3 + 2] * o[2],
		),
	};
}

function frameOf(inst: RbxInstance | null | undefined): EffectFrame | undefined {
	const cf = inst?.props.get("CFrame")?.value as EffectFrame | undefined;
	return cf && Array.isArray(cf.rotation) && Array.isArray(cf.position) ? cf : undefined;
}

/**
 * An Attachment's frame in the world: its CFrame in the part it is in, or in
 * the world where what it is in has none (Terrain's).
 */
export function attachmentFrame(attachment: RbxInstance): EffectFrame | undefined {
	const own = frameOf(attachment) ?? { rotation: IDENTITY, position: [0, 0, 0] };
	const holder = frameOf(attachment.parent);
	return holder ? compose(holder, own) : own;
}

const isEnabled = (inst: RbxInstance) => inst.props.get("Enabled")?.value !== false;

/** The Beams and ParticleEmitters under `workspace` that show anything. */
export function sceneEffects(
	workspace: RbxInstance | undefined,
	idOf: (inst: RbxInstance) => number | undefined,
): SceneEffects {
	const beams: SceneBeam[] = [];
	const emitters: SceneEmitter[] = [];
	const visit = (inst: RbxInstance) => {
		for (const child of inst.children) visit(child);
		if (inst.className === "Beam") {
			const beam = beamOf(inst, idOf(inst));
			if (beam) beams.push(beam);
		} else if (inst.className === "ParticleEmitter") {
			const emitter = emitterOf(inst, idOf(inst));
			if (emitter) emitters.push(emitter);
		}
	};
	if (workspace) visit(workspace);
	return { beams, emitters };
}

function beamOf(inst: RbxInstance, id: number | undefined): SceneBeam | undefined {
	if (id === undefined || !isEnabled(inst)) return undefined;
	const a0 = inst.props.get("Attachment0")?.value as RbxInstance | null | undefined;
	const a1 = inst.props.get("Attachment1")?.value as RbxInstance | null | undefined;
	if (a0?.className !== "Attachment" || a1?.className !== "Attachment") return undefined;
	const from = attachmentFrame(a0);
	const to = attachmentFrame(a1);
	if (!from || !to) return undefined;
	const transparency = numbers(inst, "Transparency", 0.5);
	if (transparency.every((k) => k[1] >= 0.999)) return undefined;
	const width0 = num(inst, "Width0", 1);
	const width1 = num(inst, "Width1", 1);
	if (width0 === 0 && width1 === 0) return undefined;
	return {
		id,
		from,
		to,
		curve0: num(inst, "CurveSize0", 0),
		curve1: num(inst, "CurveSize1", 0),
		width0,
		width1,
		segments: Math.max(1, Math.min(1000, Math.round(num(inst, "Segments", 10)))),
		faceCamera: inst.props.get("FaceCamera")?.value === true,
		...(textureOf(inst) ? { texture: textureOf(inst) } : {}),
		textureMode: num(inst, "TextureMode", 0),
		textureLength: num(inst, "TextureLength", 1),
		textureSpeed: num(inst, "TextureSpeed", 1),
		color: colours(inst, "Color"),
		transparency,
		lightEmission: num(inst, "LightEmission", 0),
		lightInfluence: num(inst, "LightInfluence", 0),
		brightness: num(inst, "Brightness", 1),
		zOffset: num(inst, "ZOffset", 0),
	};
}

/** The flipbook grids Enum.ParticleFlipbookLayout names, columns by rows. */
const FLIPBOOK_GRIDS: Record<number, number> = { 1: 2, 2: 4, 3: 8 };

function emitterOf(inst: RbxInstance, id: number | undefined): SceneEmitter | undefined {
	if (id === undefined || !isEnabled(inst)) return undefined;
	const holder = inst.parent;
	if (!holder) return undefined;
	const rate = num(inst, "Rate", 20);
	const lifetime = pair(inst, "Lifetime", [5, 10]);
	if (rate <= 0 || Math.max(lifetime[0], lifetime[1]) <= 0) return undefined;
	let frame: EffectFrame | undefined;
	let size: number[] | undefined;
	if (holder.className === "Attachment") frame = attachmentFrame(holder);
	else {
		frame = frameOf(holder);
		size = vec3(holder, "size") ?? vec3(holder, "Size");
		if (!size) return undefined;
	}
	if (!frame) return undefined;
	const transparency = numbers(inst, "Transparency", 0);
	if (transparency.every((k) => k[1] - Math.abs(k[2]) >= 0.999)) return undefined;
	const layout = num(inst, "FlipbookLayout", 0);
	const grid = FLIPBOOK_GRIDS[layout];
	const columns =
		layout === 4 ? Math.max(1, Math.round(num(inst, "FlipbookSizeX", 1))) : (grid ?? 1);
	const rows = layout === 4 ? Math.max(1, Math.round(num(inst, "FlipbookSizeY", 1))) : (grid ?? 1);
	const texture = textureOf(inst);
	return {
		id,
		frame,
		...(size ? { box: [...size] } : {}),
		shape: num(inst, "Shape", 0),
		shapeStyle: num(inst, "ShapeStyle", 0),
		shapeInOut: num(inst, "ShapeInOut", 0),
		shapePartial: num(inst, "ShapePartial", 1),
		direction: num(inst, "EmissionDirection", 1),
		rate,
		lifetime,
		speed: pair(inst, "Speed", [5, 5]),
		spread: pair(inst, "SpreadAngle", [0, 0]),
		acceleration: vec3(inst, "Acceleration") ?? [0, 0, 0],
		drag: num(inst, "Drag", 0),
		rotation: pair(inst, "Rotation", [0, 0]),
		rotSpeed: pair(inst, "RotSpeed", [0, 0]),
		size: numbers(inst, "Size", 1),
		transparency,
		squash: numbers(inst, "Squash", 0),
		color: colours(inst, "Color"),
		...(texture ? { texture } : {}),
		lightEmission: num(inst, "LightEmission", 0),
		lightInfluence: num(inst, "LightInfluence", 0),
		brightness: num(inst, "Brightness", 1),
		orientation: num(inst, "Orientation", 0),
		zOffset: num(inst, "ZOffset", 0),
		timeScale: Math.max(0, Math.min(1, num(inst, "TimeScale", 1))),
		flipbook: {
			layout: columns * rows > 1 ? layout : 0,
			columns,
			rows,
			mode: num(inst, "FlipbookMode", 0),
			framerate: pair(inst, "FlipbookFramerate", [1, 1]),
			startRandom: inst.props.get("FlipbookStartRandom")?.value === true,
		},
	};
}

/** The asset ids the effects' textures name, once each. */
export function effectTextures(effects: SceneEffects | undefined): string[] {
	if (!effects) return [];
	const out = new Set<string>();
	for (const b of effects.beams) if (b.texture) out.add(b.texture);
	for (const e of effects.emitters) if (e.texture) out.add(e.texture);
	return [...out];
}

/**
 * A NumberSequence at `t`, 0 to 1: straight lines between its keypoints. With
 * `spread`, -1 to 1, each keypoint's envelope moves its value that share of
 * the way out, as a particle's random pick within the envelope does.
 */
export function numberAt(keys: readonly NumberKeypoint[], t: number, spread = 0): number {
	const n = keys.length;
	if (n === 0) return 0;
	const value = (k: NumberKeypoint) => k[1] + k[2] * spread;
	if (t <= keys[0][0] || n === 1) return value(keys[0]);
	for (let i = 1; i < n; i++) {
		const b = keys[i];
		if (t <= b[0]) {
			const a = keys[i - 1];
			const span = b[0] - a[0];
			const k = span > 0 ? (t - a[0]) / span : 1;
			return value(a) + (value(b) - value(a)) * k;
		}
	}
	return value(keys[n - 1]);
}

/** A ColorSequence at `t`, 0 to 1, into `out` as red, green and blue from 0 to 1. */
export function colourAt(
	keys: readonly ColorKeypoint[],
	t: number,
	out: number[] = [0, 0, 0],
): number[] {
	const n = keys.length;
	if (n === 0) {
		out[0] = out[1] = out[2] = 1;
		return out;
	}
	let a = keys[n - 1];
	let b = a;
	let k = 0;
	if (t <= keys[0][0]) a = b = keys[0];
	else
		for (let i = 1; i < n; i++) {
			if (t <= keys[i][0]) {
				a = keys[i - 1];
				b = keys[i];
				const span = b[0] - a[0];
				k = span > 0 ? (t - a[0]) / span : 1;
				break;
			}
		}
	for (let c = 0; c < 3; c++) out[c] = a[c + 1] + (b[c + 1] - a[c + 1]) * k;
	return out;
}

/** A cubic Bézier's point at `t` from four control points. */
export function bezier(
	p0: number[],
	p1: number[],
	p2: number[],
	p3: number[],
	t: number,
): number[] {
	const s = 1 - t;
	const a = s * s * s;
	const b = 3 * s * s * t;
	const c = 3 * s * t * t;
	const d = t * t * t;
	return [0, 1, 2].map((i) => a * p0[i] + b * p1[i] + c * p2[i] + d * p3[i]);
}

/** Its direction of travel at `t`: the derivative, not made unit length. */
export function bezierTangent(
	p0: number[],
	p1: number[],
	p2: number[],
	p3: number[],
	t: number,
): number[] {
	const s = 1 - t;
	return [0, 1, 2].map(
		(i) => 3 * s * s * (p1[i] - p0[i]) + 6 * s * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]),
	);
}

/** A beam's four control points, as Roblox documents them. */
export function beamControls(beam: SceneBeam): number[][] {
	const p0 = beam.from.position;
	const p3 = beam.to.position;
	const x0 = [beam.from.rotation[0], beam.from.rotation[3], beam.from.rotation[6]];
	const x1 = [beam.to.rotation[0], beam.to.rotation[3], beam.to.rotation[6]];
	return [
		p0,
		p0.map((v, i) => v + x0[i] * beam.curve0),
		p3.map((v, i) => v - x1[i] * beam.curve1),
		p3,
	];
}
