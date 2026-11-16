/**
 * Beams and ParticleEmitters in the place viewer: what is read from a place,
 * the sequences and curves they follow, where particles are born, and how the
 * simulation steps and lays them out.
 */

import { describe, expect, it } from "vitest";

import {
	EFFECT_VERTEX,
	EffectsSim,
	emitPoint,
	FALLBACK_BAND,
	FALLBACK_DOT,
	FALLBACK_WHITE,
	flipbookFrame,
	PARTICLES_PER_EMITTER,
	packColour,
	QUAD_VERTICES,
	quadIndices,
	seeded,
	spreadDirection,
} from "../src/app/viewport/effects.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import {
	beamControls,
	bezier,
	colourAt,
	effectTextures,
	numberAt,
	type SceneBeam,
	type SceneEmitter,
} from "../src/core/rbx/effects.js";
import { readRbx } from "../src/core/rbx/index.js";
import { buildPlaceScene } from "../src/core/rbx/scene.js";
import { writeBinaryPlace } from "../src/core/rbx/serialize.js";

const utf8 = new TextEncoder();
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** A quarter turn about Y: the frame's X points down world -Z. */
const QUARTER_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const close = (a: number[], b: number[], digits = 4) =>
	a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe("sequences", () => {
	const keys: [number, number, number][] = [
		[0, 0, 0],
		[0.5, 1, 0.5],
		[1, 0.2, 0],
	];
	it("run straight between keypoints, held past the ends", () => {
		expect(numberAt(keys, 0)).toBe(0);
		expect(numberAt(keys, 0.25)).toBeCloseTo(0.5);
		expect(numberAt(keys, 0.75)).toBeCloseTo(0.6);
		expect(numberAt(keys, 1)).toBeCloseTo(0.2);
		expect(numberAt(keys, 2)).toBeCloseTo(0.2);
		expect(numberAt([[0, 3, 0]], 0.7)).toBe(3);
	});
	it("move each keypoint by its envelope times the pick", () => {
		expect(numberAt(keys, 0.5, 1)).toBeCloseTo(1.5);
		expect(numberAt(keys, 0.5, -1)).toBeCloseTo(0.5);
		expect(numberAt(keys, 0.25, 1)).toBeCloseTo(0.75);
	});
	it("blend colours the same way", () => {
		const c = colourAt(
			[
				[0, 1, 0, 0, 0],
				[1, 0, 0, 1, 0],
			],
			0.25,
		);
		close(c, [0.75, 0, 0.25]);
	});
});

describe("a beam's curve", () => {
	const beam = (curve0: number, curve1: number): SceneBeam => ({
		id: 1,
		from: { rotation: IDENTITY, position: [0, 0, 0] },
		to: { rotation: IDENTITY, position: [10, 0, 0] },
		curve0,
		curve1,
		width0: 2,
		width1: 4,
		segments: 4,
		faceCamera: false,
		textureMode: 0,
		textureLength: 1,
		textureSpeed: 1,
		color: [
			[0, 1, 1, 1, 0],
			[1, 1, 1, 1, 0],
		],
		transparency: [
			[0, 0, 0],
			[1, 0, 0],
		],
		lightEmission: 0,
		lightInfluence: 0,
		brightness: 1,
		zOffset: 0,
	});
	it("has its middle points CurveSize along Attachment0's X and back along Attachment1's", () => {
		const [p0, p1, p2, p3] = beamControls(beam(3, 2));
		close(p0, [0, 0, 0]);
		close(p1, [3, 0, 0]);
		close(p2, [8, 0, 0]);
		close(p3, [10, 0, 0]);
	});
	it("is a cubic Bézier from end to end", () => {
		const [p0, p1, p2, p3] = beamControls(beam(0, 0));
		close(bezier(p0, p1, p2, p3, 0), [0, 0, 0]);
		close(bezier(p0, p1, p2, p3, 1), [10, 0, 0]);
		const arched = [
			[0, 0, 0],
			[0, 4, 0],
			[10, 4, 0],
			[10, 0, 0],
		];
		close(bezier(arched[0], arched[1], arched[2], arched[3], 0.5), [5, 3, 0]);
	});
	it("is laid out a quad a segment, its width along the attachments' Y, Width0 to Width1", () => {
		const sim = new EffectsSim({ beams: [beam(0, 0)], emitters: [] });
		const frame = sim.frame(
			{ eye: [5, 5, 20], at: [5, 0, 0], aspect: 1, fov: 1.2 },
			0,
			{ beams: true, particles: true },
			() => false,
		);
		expect(frame.quads).toBe(4);
		expect(frame.beams).toBe(1);
		// Untextured: plain white, and nothing to animate.
		expect(frame.batches).toEqual([{ texture: FALLBACK_WHITE, first: 0, count: 4 }]);
		expect(frame.moving).toBe(false);
		const v = frame.vertices;
		const at = (q: number, c: number) =>
			Array.from(
				v.subarray(
					(q * QUAD_VERTICES + c) * EFFECT_VERTEX,
					(q * QUAD_VERTICES + c) * EFFECT_VERTEX + 3,
				),
			);
		// Studio draws a beam between unturned attachments upright: its width up the Y axis.
		close(at(0, 0), [0, 1, 0]);
		close(at(0, 3), [0, -1, 0]);
		close(at(3, 1), [10, 2, 0]);
		close(at(3, 2), [10, -2, 0]);
	});
	it("scrolls a texture that has arrived, and stands in a soft band for one that has not", () => {
		const textured = { ...beam(0, 0), texture: "5", textureSpeed: 0.5 };
		const sim = new EffectsSim({ beams: [textured], emitters: [] });
		const view = { eye: [5, 5, 20], at: [5, 0, 0], aspect: 1, fov: 1.2 };
		const show = { beams: true, particles: true };
		expect(sim.frame(view, 0, show, () => false).batches[0].texture).toBe(FALLBACK_BAND);
		const first = sim.frame(view, 0, show, () => true);
		expect(first.moving).toBe(true);
		// Down the image along the beam, as Studio draws it; across it, across.
		const v0 = first.vertices[4];
		expect([first.vertices[3], first.vertices[3 + EFFECT_VERTEX * 2]]).toEqual([0, 1]);
		const later = sim.frame(view, 0.1, show, () => true);
		// Stretch, once along the beam; half a texture a second, towards Attachment1.
		expect(later.vertices[4]).toBeCloseTo(v0 - 0.05, 5);
	});
	it("is left out with Beams off, and out of view", () => {
		const sim = new EffectsSim({ beams: [beam(0, 0)], emitters: [] });
		const view = { eye: [5, 5, 20], at: [5, 0, 0], aspect: 1, fov: 1.2 };
		expect(sim.frame(view, 0, { beams: false, particles: true }, () => false).quads).toBe(0);
		const away = { eye: [5, 5, 20], at: [5, 5, 40], aspect: 1, fov: 1.2 };
		expect(sim.frame(away, 0, { beams: true, particles: true }, () => false).quads).toBe(0);
	});
});

function emitter(over: Partial<SceneEmitter> = {}): SceneEmitter {
	return {
		id: 7,
		frame: { rotation: IDENTITY, position: [0, 0, 0] },
		box: [4, 2, 6],
		shape: 0,
		shapeStyle: 0,
		shapeInOut: 0,
		shapePartial: 1,
		direction: 1,
		rate: 10,
		lifetime: [2, 2],
		speed: [5, 5],
		spread: [0, 0],
		acceleration: [0, 0, 0],
		drag: 0,
		rotation: [0, 0],
		rotSpeed: [0, 0],
		size: [
			[0, 1, 0],
			[1, 1, 0],
		],
		transparency: [
			[0, 0, 0],
			[1, 0, 0],
		],
		squash: [
			[0, 0, 0],
			[1, 0, 0],
		],
		color: [
			[0, 1, 1, 1, 0],
			[1, 1, 1, 1, 0],
		],
		lightEmission: 0,
		lightInfluence: 0,
		brightness: 1,
		orientation: 0,
		zOffset: 0,
		timeScale: 1,
		flipbook: { layout: 0, columns: 1, rows: 1, mode: 0, framerate: [1, 1], startRandom: false },
		...over,
	};
}

describe("where a particle is born", () => {
	const random = seeded(42);
	const pos = [0, 0, 0];
	const dir = [0, 0, 0];
	it("is inside a Box, heading towards EmissionDirection", () => {
		for (let i = 0; i < 200; i++) {
			emitPoint(emitter({ direction: 2 }), random, pos, dir);
			expect(Math.abs(pos[0])).toBeLessThanOrEqual(2);
			expect(Math.abs(pos[1])).toBeLessThanOrEqual(1);
			expect(Math.abs(pos[2])).toBeLessThanOrEqual(3);
			expect(dir).toEqual([0, 0, 1]);
		}
	});
	it("is on a Box's surface for Surface", () => {
		for (let i = 0; i < 200; i++) {
			emitPoint(emitter({ shapeStyle: 1 }), random, pos, dir);
			const out = [Math.abs(pos[0]) / 2, Math.abs(pos[1]), Math.abs(pos[2]) / 3];
			expect(Math.max(...out)).toBeCloseTo(1, 6);
		}
	});
	it("is on a Sphere's surface, outward, within ShapePartial of it round the axis", () => {
		const e = emitter({ shape: 1, shapeStyle: 1, shapePartial: 0.25, box: [4, 4, 4] });
		for (let i = 0; i < 200; i++) {
			emitPoint(e, random, pos, dir);
			expect(Math.hypot(pos[0], pos[1], pos[2])).toBeCloseTo(2, 5);
			close(
				dir,
				pos.map((v) => v / 2),
				5,
			);
			// A quarter of the sphere round +Y: cos at least 1 - 2 * 0.25.
			expect(dir[1]).toBeGreaterThanOrEqual(0.5 - 1e-6);
		}
	});
	it("is between ShapePartial and the rim of a Disc, square to the axis", () => {
		const e = emitter({ shape: 3, shapePartial: 0.5, box: [4, 1, 4] });
		for (let i = 0; i < 200; i++) {
			emitPoint(e, random, pos, dir);
			expect(pos[1]).toBe(0);
			const r = Math.hypot(pos[0], pos[2]) / 2;
			expect(r).toBeGreaterThanOrEqual(0.5 - 1e-6);
			expect(r).toBeLessThanOrEqual(1 + 1e-6);
			expect(dir).toEqual([0, 1, 0]);
		}
	});
	it("heads out from a Cylinder's axis, and in for Inward", () => {
		const e = emitter({ shape: 2, shapeStyle: 1, shapeInOut: 1, box: [4, 4, 4] });
		for (let i = 0; i < 100; i++) {
			emitPoint(e, random, pos, dir);
			expect(dir[1]).toBeCloseTo(0);
			// Inward: towards the axis.
			expect(dir[0] * pos[0] + dir[2] * pos[2]).toBeLessThan(0);
		}
	});
	it("is the point of an Attachment", () => {
		emitPoint(emitter({ box: undefined, direction: 4 }), random, pos, dir);
		expect(pos).toEqual([0, 0, 0]);
		expect(dir).toEqual([0, -1, 0]);
	});
	it("is turned by up to half of SpreadAngle", () => {
		for (let i = 0; i < 200; i++) {
			const d = [0, 1, 0];
			spreadDirection(d, [40, 40], random);
			expect(Math.hypot(...d)).toBeCloseTo(1);
			// Twenty degrees each way about two axes: within about 28 of straight up.
			expect(Math.acos(d[1])).toBeLessThan((29 * Math.PI) / 180);
		}
	});
});

describe("the simulation", () => {
	const view = { eye: [0, 5, 30], at: [0, 5, 0], aspect: 16 / 9, fov: (70 * Math.PI) / 180 };
	const show = { beams: true, particles: true };
	it("is warmed to how it would look by now, Rate a second for Lifetime", () => {
		const sim = new EffectsSim({ beams: [], emitters: [emitter()] });
		const frame = sim.frame(view, 0, show, () => false);
		// Ten a second living two seconds: about twenty.
		expect(frame.particles).toBeGreaterThanOrEqual(18);
		expect(frame.particles).toBeLessThanOrEqual(21);
		expect(frame.moving).toBe(true);
		expect(frame.batches[0].texture).toBe(FALLBACK_DOT);
	});
	it("is the same from run to run", () => {
		const a = new EffectsSim({ beams: [], emitters: [emitter({ spread: [30, 30] })] });
		const b = new EffectsSim({ beams: [], emitters: [emitter({ spread: [30, 30] })] });
		const fa = a.frame(view, 0, show, () => false);
		const fb = b.frame(view, 0, show, () => false);
		expect(Array.from(fa.vertices)).toEqual(Array.from(fb.vertices));
	});
	it("moves particles by speed, acceleration and drag", () => {
		const e = emitter({
			rate: 1,
			lifetime: [100, 100],
			acceleration: [0, -2, 0],
			drag: 1,
			box: undefined,
		});
		const sim = new EffectsSim({ beams: [], emitters: [e] });
		sim.frame(view, 0, show, () => false);
		const step = (sim as unknown as { emitters: { data: Float32Array; count: number }[] })
			.emitters[0];
		const before = step.data.slice(0, 14);
		sim.frame(view, 0.05, show, () => false);
		const after = step.data.slice(0, 14);
		// Velocity: accelerated, then halved per second of Drag.
		const vy = (before[4] - 2 * 0.05) * 0.5 ** 0.05;
		expect(after[4]).toBeCloseTo(vy, 4);
		expect(after[1]).toBeCloseTo(before[1] + vy * 0.05, 4);
		expect(after[6]).toBeCloseTo(before[6] + 0.05, 5);
	});
	it("keeps to its caps", () => {
		const sim = new EffectsSim({
			beams: [],
			emitters: [emitter({ rate: 5000, lifetime: [10, 10] })],
		});
		expect(sim.frame(view, 0, show, () => false).particles).toBe(PARTICLES_PER_EMITTER);
	});
	it("leaves out what is wholly see-through, lets go of what is out of reach, and stops with Particles off", () => {
		const faint = emitter({
			transparency: [
				[0, 1, 0],
				[1, 1, 0],
			],
		});
		const sim = new EffectsSim({ beams: [], emitters: [faint] });
		const frame = sim.frame(view, 0, show, () => false);
		expect(frame.particles).toBeGreaterThan(0);
		expect(frame.quads).toBe(0);
		const far = { ...view, eye: [0, 5, 5000], at: [0, 5, 4000] };
		expect(sim.frame(far, 0.016, show, () => false).particles).toBe(0);
		const off = new EffectsSim({ beams: [], emitters: [emitter()] });
		const none = off.frame(view, 0, { beams: true, particles: false }, () => false);
		expect(none.particles).toBe(0);
		expect(none.moving).toBe(false);
	});
	it("draws a particle Size wide, facing the camera, in its colour and alpha", () => {
		const e = emitter({
			rate: 1,
			lifetime: [100, 100],
			speed: [0, 0],
			box: undefined,
			size: [
				[0, 2, 0],
				[1, 2, 0],
			],
			transparency: [
				[0, 0.5, 0],
				[1, 0.5, 0],
			],
			color: [
				[0, 1, 0, 0, 0],
				[1, 1, 0, 0, 0],
			],
		});
		const sim = new EffectsSim({ beams: [], emitters: [e] });
		const frame = sim.frame(view, 0, show, () => false);
		const v = frame.vertices;
		const corner = (c: number) => Array.from(v.subarray(c * EFFECT_VERTEX, c * EFFECT_VERTEX + 3));
		close(corner(0), [-1, 1, 0]);
		close(corner(2), [1, -1, 0]);
		const word = new Uint32Array(v.buffer, v.byteOffset, v.length)[5];
		expect(word).toBe(packColour([1, 0, 0], 0.5));
	});
});

describe("drawing helpers", () => {
	it("index two triangles a quad", () => {
		expect(Array.from(quadIndices(2))).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
	});
	it("pick a flipbook's frame by its mode", () => {
		expect(flipbookFrame(0, 4, 0, 5.5, 0)).toBe(1);
		expect(flipbookFrame(1, 4, 0.6, 0, 0)).toBe(2);
		// PingPong over four frames: 0 1 2 3 2 1 0 ...
		expect([0, 1, 2, 3, 4, 5, 6].map((r) => flipbookFrame(2, 4, 0, r, 0))).toEqual([
			0, 1, 2, 3, 2, 1, 0,
		]);
		const random = flipbookFrame(3, 16, 0, 3, 9);
		expect(random).toBeGreaterThanOrEqual(0);
		expect(random).toBeLessThan(16);
	});
});

// -- read from a place --------------------------------------------------------

function inst(
	className: string,
	props: Record<string, [PropType, unknown]>,
	children: RbxInstance[] = [],
): RbxInstance {
	const made: RbxInstance = {
		className,
		name: className,
		parent: null,
		children,
		props: new Map<string, Prop>([
			["Name", { type: "String", value: utf8.encode(className) }],
			...Object.entries(props).map(([k, [type, value]]): [string, Prop] => [k, { type, value }]),
		]),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const at = (position: number[], rotation = IDENTITY): [PropType, unknown] => [
	"CFrame",
	{ position, rotation },
];

/** A place of `children` in Workspace, written as Studio's binary and read back. */
function placeOf(...children: RbxInstance[]): RbxInstance {
	const workspace = inst("Workspace", {}, children);
	const instances: RbxInstance[] = [];
	const all = (i: RbxInstance) => {
		instances.push(i);
		for (const c of i.children) all(c);
	};
	all(workspace);
	const bytes = writeBinaryPlace({
		format: "binary",
		roots: [workspace],
		instances,
		undecoded: new Map(),
	});
	const read = readRbx(bytes);
	const ws = read.roots.find((r) => r.className === "Workspace");
	if (!ws) throw new Error("no Workspace");
	return ws;
}

describe("a place's effects", () => {
	const beamProps = (
		a0: RbxInstance,
		a1: RbxInstance,
		over: Record<string, [PropType, unknown]> = {},
	) => ({
		Attachment0: ["Ref", a0] as [PropType, unknown],
		Attachment1: ["Ref", a1] as [PropType, unknown],
		Width0: ["Float32", 2] as [PropType, unknown],
		Width1: ["Float32", 3] as [PropType, unknown],
		CurveSize0: ["Float32", 1] as [PropType, unknown],
		CurveSize1: ["Float32", 0] as [PropType, unknown],
		Segments: ["Int32", 6] as [PropType, unknown],
		Texture: ["String", utf8.encode("rbxassetid://123")] as [PropType, unknown],
		Transparency: [
			"NumberSequence",
			[
				[0, 0, 0],
				[1, 0.5, 0],
			],
		] as [PropType, unknown],
		Color: [
			"ColorSequence",
			[
				[0, 1, 0, 0, 0],
				[1, 0, 0, 1, 0],
			],
		] as [PropType, unknown],
		Enabled: ["Bool", true] as [PropType, unknown],
		...over,
	});

	it("are read with their attachments' world frames and their sequences", () => {
		const a0 = inst("Attachment", { CFrame: at([0, 1, 0]) });
		const a1 = inst("Attachment", { CFrame: at([2, 0, 0], QUARTER_Y) });
		const post = inst("Part", { CFrame: at([10, 0, 0], QUARTER_Y), size: ["Vector3", [1, 4, 1]] }, [
			a0,
			a1,
		]);
		const beam = inst("Beam", beamProps(a0, a1));
		post.children.push(beam);
		beam.parent = post;
		const workspace = placeOf(post);
		const ids = new Map<RbxInstance, number>();
		let next = 0;
		const scene = buildPlaceScene(workspace, (i) => {
			if (!ids.has(i)) ids.set(i, next++);
			return ids.get(i);
		});
		const [read] = scene.effects?.beams ?? [];
		expect(read).toBeDefined();
		close(read.from.position, [10, 1, 0]);
		// The part's quarter turn: its X runs down world -Z.
		close(read.to.position, [10, 0, -2]);
		// Two quarter turns: a half turn about Y.
		close(read.to.rotation, [-1, 0, 0, 0, 1, 0, 0, 0, -1]);
		expect(read.width0).toBe(2);
		expect(read.segments).toBe(6);
		expect(read.texture).toBe("123");
		expect(read.transparency[1][1]).toBeCloseTo(0.5);
		expect(read.color[1].slice(1, 4)).toEqual([0, 0, 1]);
		expect(effectTextures(scene.effects)).toEqual(["123"]);
	});

	it("leave out what is off, wholly see-through or without its attachments", () => {
		const a0 = inst("Attachment", { CFrame: at([0, 1, 0]) });
		const a1 = inst("Attachment", { CFrame: at([0, -1, 0]) });
		const off = inst("Beam", beamProps(a0, a1, { Enabled: ["Bool", false] }));
		const clear = inst(
			"Beam",
			beamProps(a0, a1, {
				Transparency: [
					"NumberSequence",
					[
						[0, 1, 0],
						[1, 1, 0],
					],
				],
			}),
		);
		const loose = inst("Beam", beamProps(a0, a1, { Attachment1: ["Ref", null] }));
		const emitterOff = inst("ParticleEmitter", { Enabled: ["Bool", false], Rate: ["Float32", 5] });
		const part = inst("Part", { CFrame: at([0, 0, 0]), size: ["Vector3", [2, 2, 2]] }, [
			a0,
			a1,
			off,
			clear,
			loose,
			emitterOff,
		]);
		let n = 0;
		const scene = buildPlaceScene(placeOf(part), () => n++);
		expect(scene.effects).toBeUndefined();
	});

	it("read an emitter in a part from its box, and one in an Attachment from its point", () => {
		const point = inst("Attachment", { CFrame: at([0, 2, 0]) });
		const fromPoint = inst("ParticleEmitter", {
			Rate: ["Float32", 12],
			Lifetime: ["NumberRange", [1, 3]],
			Speed: ["NumberRange", [2, 4]],
			SpreadAngle: ["Vector2", [10, 20]],
			EmissionDirection: ["Enum", 4],
			Texture: ["String", utf8.encode("http://www.roblox.com/asset/?id=77")],
			Size: [
				"NumberSequence",
				[
					[0, 1, 0.5],
					[1, 2, 0],
				],
			],
		});
		point.children.push(fromPoint);
		fromPoint.parent = point;
		// A binary file keeps every property of a class for each instance: these are given theirs.
		const fromBox = inst("ParticleEmitter", {
			Rate: ["Float32", 3],
			Lifetime: ["NumberRange", [2, 2]],
			Shape: ["Enum", 1],
		});
		const part = inst("Part", { CFrame: at([5, 0, 0]), size: ["Vector3", [2, 4, 6]] }, [
			point,
			fromBox,
		]);
		let n = 0;
		const scene = buildPlaceScene(placeOf(part), () => n++);
		const [first, second] = scene.effects?.emitters ?? [];
		expect(first.box).toBeUndefined();
		close(first.frame.position, [5, 2, 0]);
		expect(first.lifetime).toEqual([1, 3]);
		expect(first.speed).toEqual([2, 4]);
		expect(first.spread).toEqual([10, 20]);
		expect(first.direction).toBe(4);
		expect(first.texture).toBe("77");
		expect(first.size[0][2]).toBeCloseTo(0.5);
		expect(second.box).toEqual([2, 4, 6]);
		expect(second.shape).toBe(1);
		expect(second.rate).toBe(3);
	});
});
