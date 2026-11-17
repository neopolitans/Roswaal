/**
 * The viewer's gizmos: which Attachments, welds and constraints are drawn
 * from the camera, by the switches and by what is picked, and the wire lines
 * each kind is drawn as.
 */

import { describe, expect, it } from "vitest";
import {
	ATTACHMENT_COLOUR,
	AXIS_COLOUR,
	attachmentLines,
	DEFAULT_GIZMOS,
	type GizmoSettings,
	gizmoScale,
	gizmosOn,
	jointLines,
	MOST_JOINTS,
	ropePoints,
	SECONDARY_COLOUR,
	VISUAL_REACH,
	visualGizmoLines,
} from "../src/app/viewport/visualGizmos.js";
import type { EffectFrame } from "../src/core/rbx/effects.js";
import type { SceneGizmos, SceneJoint } from "../src/core/rbx/gizmos.js";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const at = (position: number[], rotation = IDENTITY): EffectFrame => ({ position, rotation });

/** Each line's two ends and its colour. */
function lines(out: ArrayLike<number>): { a: number[]; b: number[]; col: number[] }[] {
	const all = Array.from(out);
	const got: { a: number[]; b: number[]; col: number[] }[] = [];
	for (let i = 0; i + 12 <= all.length; i += 12)
		got.push({ a: all.slice(i, i + 3), b: all.slice(i + 6, i + 9), col: all.slice(i + 3, i + 6) });
	return got;
}
const near = (p: number[], q: number[], e = 1e-4) => p.every((x, i) => Math.abs(x - q[i]) < e);

const joint = (over: Partial<SceneJoint>): SceneJoint => ({
	id: 1,
	kind: "rope",
	className: "RopeConstraint",
	ties: [],
	from: at([0, 0, 0]),
	to: at([10, 0, 0]),
	colour: [1, 0, 0],
	enabled: true,
	...over,
});

const ALL: GizmoSettings = { attachments: true, constraints: true, welds: true, picked: true };
const NONE: GizmoSettings = { attachments: false, constraints: false, welds: false, picked: true };

describe("an Attachment's lines", () => {
	it("are a ball, then its Axis and SecondaryAxis as arrows", () => {
		const out: number[] = [];
		attachmentLines(at([5, 0, 0]), 1, out);
		const got = lines(out);
		const ball = got.filter((l) => near(l.col, ATTACHMENT_COLOUR));
		const axis = got.filter((l) => near(l.col, AXIS_COLOUR));
		const second = got.filter((l) => near(l.col, SECONDARY_COLOUR));
		expect(ball.length).toBe(96);
		// Each arrow a shaft and a two-line head; the Axis along X, the SecondaryAxis along Y.
		expect(axis).toHaveLength(3);
		expect(second).toHaveLength(3);
		expect(axis[0].b[0]).toBeGreaterThan(6);
		expect(axis[0].b[1]).toBeCloseTo(0);
		expect(second[0].b[1]).toBeGreaterThan(1);
		expect(second[0].b[0]).toBeCloseTo(5);
	});

	it("grow with the distance from the camera, within bounds", () => {
		expect(gizmoScale(4)).toBe(0.5);
		expect(gizmoScale(40)).toBe(1);
		expect(gizmoScale(80)).toBe(2);
		expect(gizmoScale(10_000)).toBe(4);
	});
});

describe("a joint's lines", () => {
	it("hang a rope by the length it has to spare, and keep a taut one straight", () => {
		const slack = ropePoints([0, 0, 0], [10, 0, 0], 12);
		expect(slack[0]).toEqual([0, 0, 0]);
		expect(near(slack[slack.length - 1], [10, 0, 0])).toBe(true);
		const low = Math.min(...slack.map((p) => p[1]));
		expect(low).toBeLessThan(-2);
		// About as long as the rope.
		let length = 0;
		for (let i = 1; i < slack.length; i++)
			length += Math.hypot(...slack[i].map((x, k) => x - slack[i - 1][k]));
		expect(length).toBeGreaterThan(11.5);
		expect(length).toBeLessThan(12.5);
		for (const p of ropePoints([0, 0, 0], [10, 0, 0], 8)) expect(p[1]).toBe(0);
	});

	it("coil a spring round its axis, from end to end", () => {
		const out: number[] = [];
		jointLines(joint({ kind: "spring", coils: 4, radius: 0.5 }), 1, out);
		const got = lines(out);
		expect(got).toHaveLength(64);
		expect(got[0].a).toEqual([0, 0, 0]);
		expect(near(got[got.length - 1].b, [10, 0, 0])).toBe(true);
		for (const l of got.slice(1, -1)) expect(Math.hypot(l.a[1], l.a[2])).toBeCloseTo(0.5);
	});

	it("draw a weld between its parts, and a Motor6D through its joint", () => {
		const weld: number[] = [];
		jointLines(joint({ kind: "weld" }), 1, weld);
		expect(lines(weld)[0]).toMatchObject({ a: [0, 0, 0], b: [10, 0, 0] });
		const motor: number[] = [];
		jointLines(joint({ kind: "joint", at: [4, 2, 0] }), 1, motor);
		const got = lines(motor);
		// Three for the cross, then each part to the joint.
		expect(got[3]).toMatchObject({ a: [0, 0, 0], b: [4, 2, 0] });
		expect(got[4]).toMatchObject({ a: [4, 2, 0], b: [10, 0, 0] });
	});

	it("dim one that is off", () => {
		const out: number[] = [];
		jointLines(joint({ kind: "rod", enabled: false }), 1, out);
		expect(lines(out)[0].col[0]).toBeCloseTo(0.45);
	});

	it("show a hinge's limits as an arc only with them on", () => {
		const off: number[] = [];
		const on: number[] = [];
		jointLines(joint({ kind: "hinge", limits: false, lower: -90, upper: 90 }), 1, off);
		jointLines(joint({ kind: "hinge", limits: true, lower: -90, upper: 90 }), 1, on);
		expect(lines(on).length).toBeGreaterThan(lines(off).length);
	});
});

describe("which gizmos are drawn", () => {
	const gizmos: SceneGizmos = {
		attachments: [
			{ id: 10, part: 20, frame: at([0, 0, 0]) },
			{ id: 11, part: 21, frame: at([10, 0, 0]) },
			{ id: 12, part: 22, frame: at([VISUAL_REACH + 100, 0, 0]) },
		],
		joints: [
			joint({ id: 30, kind: "rod", ties: [10, 20, 11, 21] }),
			joint({ id: 31, kind: "weld", ties: [20, 21] }),
		],
	};
	const count = (settings: GizmoSettings, picked?: Set<number>) =>
		lines(visualGizmoLines(gizmos, settings, [0, 0, 0], picked)).length;
	const attachmentCount = (out: Float32Array) =>
		lines(out).filter((l) => near(l.col, AXIS_COLOUR)).length / 3;

	it("are none with every switch off and nothing picked", () => {
		expect(gizmosOn(DEFAULT_GIZMOS, false)).toBe(false);
		expect(gizmosOn(DEFAULT_GIZMOS, true)).toBe(true);
		expect(count(NONE)).toBe(0);
		expect(visualGizmoLines(undefined, ALL, [0, 0, 0])).toHaveLength(0);
	});

	it("are the near Attachments, with Attachments on", () => {
		const out = visualGizmoLines(gizmos, { ...NONE, attachments: true }, [0, 0, 0]);
		expect(attachmentCount(out)).toBe(2);
	});

	it("bring a drawn constraint's Attachments, but not a weld's", () => {
		const constraints = visualGizmoLines(gizmos, { ...NONE, constraints: true }, [0, 0, 0]);
		expect(attachmentCount(constraints)).toBe(2);
		const welds = visualGizmoLines(gizmos, { ...NONE, welds: true }, [0, 0, 0]);
		expect(attachmentCount(welds)).toBe(0);
		expect(lines(welds).length).toBeGreaterThan(0);
	});

	it("show what is picked, however far, and what ties to a picked part", () => {
		const far = visualGizmoLines(gizmos, NONE, [0, 0, 0], new Set([12]));
		expect(attachmentCount(far)).toBe(1);
		// A picked part: its Attachment, the rod and the weld tying it, and the rod's far end.
		const part = visualGizmoLines(gizmos, NONE, [0, 0, 0], new Set([20]));
		expect(attachmentCount(part)).toBe(2);
		expect(count(NONE, new Set([20]))).toBeGreaterThan(count({ ...NONE, constraints: true }));
		// With the selection off, the pick shows nothing.
		expect(count({ ...NONE, picked: false }, new Set([20]))).toBe(0);
	});

	it("are the nearest, so many stay cheap", () => {
		const many: SceneGizmos = {
			attachments: [],
			joints: Array.from({ length: MOST_JOINTS + 50 }, (_, i) =>
				joint({ id: i, kind: "weld", from: at([i / 2, 0, 0]), to: at([i / 2, 1, 0]) }),
			),
		};
		const got = lines(visualGizmoLines(many, ALL, [0, 0, 0]));
		// Seven lines a weld: the line and two crosses.
		expect(got).toHaveLength(MOST_JOINTS * 7);
		expect(Math.max(...got.map((l) => l.a[0]))).toBeLessThan(MOST_JOINTS / 2);
	});
});
