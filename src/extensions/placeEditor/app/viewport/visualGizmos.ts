/**
 * The place editor's gizmos, as Studio's visualization options draw them:
 * Attachments, welds and mechanical constraints as wire lines over the view,
 * through whatever is in front, each kind switched on its own. What is picked
 * shows its own whichever are off, as Studio shows a picked Attachment or
 * constraint. Drawn from `PlaceScene.gizmos` (see `../../core/gizmos.ts`), the
 * nearest to the camera, found again as `gizmos.ts`'s light ranges are.
 *
 * - An Attachment is a small ball, three circles, with its Axis (its X) as a
 *   yellow arrow and its SecondaryAxis (its Y) as an orange one.
 * - A WeldConstraint is a line between its parts' middles, a cross on each.
 * - A Weld or Motor6D is a cross where C0 puts the joint, lines to each part.
 * - A RopeConstraint hangs from Attachment0 to Attachment1, sagging by the
 *   length it has to spare; a RodConstraint is straight, ringed at each end; a
 *   SpringConstraint coils its Coils round at its Radius.
 * - A HingeConstraint is a ring round its axis at each Attachment, and its
 *   limits as an arc when they are on; a BallSocketConstraint a ball at
 *   Attachment0, and its limit as a cone.
 * - Any other constraint is a line between its Attachments.
 *
 * Sizes grow with the distance from the camera, so a gizmo far off stays
 * readable. The colours follow Studio's look and are to be fitted to its
 * screen captures.
 */

import type { EffectFrame } from "../../core/effects.js";
import type { SceneGizmos, SceneJoint } from "../../core/gizmos.js";
import { across, Lines } from "./gizmos.js";

/** Which gizmos are drawn: the view's alone, for the session. */
export interface GizmoSettings {
	/** Every Attachment near the camera. */
	attachments: boolean;
	/** Mechanical constraints near the camera, with their Attachments: Studio's Show Constraint Details. */
	constraints: boolean;
	/** WeldConstraints, Welds and Motor6Ds near the camera: Studio's Show Welds. */
	welds: boolean;
	/** What is picked, and what is in it, shows its own with the rest off. */
	picked: boolean;
}

export const DEFAULT_GIZMOS: GizmoSettings = {
	attachments: false,
	constraints: false,
	welds: false,
	picked: true,
};

/** Each switch's label, in the order shown. */
export const GIZMO_SWITCHES: readonly (readonly [keyof GizmoSettings, string])[] = [
	["attachments", "Attachments"],
	["constraints", "Constraints"],
	["welds", "Welds"],
	["picked", "With the selection"],
];

/** How far from the camera a gizmo may be and still be drawn, in studs. */
export const VISUAL_REACH = 250;
/** The most Attachments drawn, and the most joints: the nearest. */
export const MOST_ATTACHMENTS = 300;
export const MOST_JOINTS = 300;

/** The distance at which a gizmo is drawn its base size; nearer is smaller, further larger. */
const BASE_DISTANCE = 40;
const ATTACHMENT_RADIUS = 0.3;
const AXIS_LENGTH = 1.5;

export const ATTACHMENT_COLOUR = [0.3, 0.88, 0.38];
export const AXIS_COLOUR = [1, 0.86, 0.2];
export const SECONDARY_COLOUR = [1, 0.52, 0.16];
/** A disabled joint's colour, times this. */
const DISABLED = 0.45;

type V = readonly number[];

const add = (a: V, b: V, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V, b: V) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V, k: number) => [a[0] * k, a[1] * k, a[2] * k];
const mid = (a: V, b: V) => scale(add(a, b), 0.5);
/** A frame's X and Y axes: an Attachment's Axis and SecondaryAxis. */
const xAxis = (f: EffectFrame) => [f.rotation[0], f.rotation[3], f.rotation[6]];
const yAxis = (f: EffectFrame) => [f.rotation[1], f.rotation[4], f.rotation[7]];

/** Anything to draw at all: a switch on, or something picked to show. */
export function gizmosOn(settings: GizmoSettings, picked: boolean): boolean {
	return (
		settings.attachments || settings.constraints || settings.welds || (settings.picked && picked)
	);
}

/** How large a gizmo `d` studs from the camera is drawn. */
export function gizmoScale(d: number): number {
	return Math.min(4, Math.max(0.5, d / BASE_DISTANCE));
}

/** A short cross of the world's three axes at `p`, `r` each way. */
function cross3(lines: Lines, p: V, r: number): void {
	lines.line(add(p, [-r, 0, 0]), add(p, [r, 0, 0]));
	lines.line(add(p, [0, -r, 0]), add(p, [0, r, 0]));
	lines.line(add(p, [0, 0, -r]), add(p, [0, 0, r]));
}

/** An arrow from `p` along unit `d`, `l` long, its head square to `side`. */
function arrow(lines: Lines, p: V, d: V, side: V, l: number): void {
	const tip = add(p, d, l);
	lines.line(p, tip);
	const back = add(tip, d, -l * 0.28);
	lines.line(tip, add(back, side, l * 0.14));
	lines.line(tip, add(back, side, -l * 0.14));
}

/** A ball of radius `r` at `p` as three circles, square to `f`'s axes. */
function ball(lines: Lines, p: V, f: EffectFrame, r: number): void {
	const x = xAxis(f);
	const y = yAxis(f);
	const z = [f.rotation[2], f.rotation[5], f.rotation[8]];
	lines.arc(p, x, y, r);
	lines.arc(p, y, z, r);
	lines.arc(p, x, z, r);
}

/** One Attachment's lines: see the file's head. */
export function attachmentLines(frame: EffectFrame, s: number, out: number[]): void {
	const p = frame.position;
	const x = xAxis(frame);
	const y = yAxis(frame);
	const lines = new Lines(ATTACHMENT_COLOUR, out);
	ball(lines, p, frame, ATTACHMENT_RADIUS * s);
	lines.col = AXIS_COLOUR;
	arrow(lines, add(p, x, ATTACHMENT_RADIUS * s), x, y, AXIS_LENGTH * s);
	lines.col = SECONDARY_COLOUR;
	arrow(lines, add(p, y, ATTACHMENT_RADIUS * s), y, x, AXIS_LENGTH * s * 0.8);
}

/** A rope's points from `a` to `b`, hanging by what `length` has over their distance. */
export function ropePoints(a: V, b: V, length: number | undefined, steps = 16): number[][] {
	const d = len(sub(b, a));
	const spare = (length ?? d) - d;
	// A parabola's length is about d + 8h²/3d: the sag that takes up the spare.
	const sag =
		d > 1e-4 && spare > 1e-4 ? Math.min(Math.sqrt((3 * d * spare) / 8), (length ?? 0) / 2) : 0;
	const out: number[][] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const p = add(a, sub(b, a), t);
		out.push([p[0], p[1] - 4 * sag * t * (1 - t), p[2]]);
	}
	return out;
}

/** One weld's or constraint's lines: see the file's head. `s` is its size from the camera. */
export function jointLines(j: SceneJoint, s: number, out: number[]): void {
	const colour = j.enabled ? j.colour : j.colour.map((c) => c * DISABLED);
	const lines = new Lines(colour, out);
	const a = j.from.position;
	const b = j.to?.position;
	switch (j.kind) {
		case "weld": {
			if (!b) return;
			lines.line(a, b);
			cross3(lines, a, 0.25 * s);
			cross3(lines, b, 0.25 * s);
			return;
		}
		case "joint": {
			const at = j.at ?? a;
			cross3(lines, at, 0.3 * s);
			lines.line(a, at);
			if (b) lines.line(at, b);
			return;
		}
		case "rope": {
			if (!b) return;
			const points = ropePoints(a, b, j.length);
			for (let i = 1; i < points.length; i++) lines.line(points[i - 1], points[i]);
			return;
		}
		case "rod": {
			if (!b) return;
			lines.line(a, b);
			const [u, v] = across(sub(b, a));
			const r = Math.max((j.thickness ?? 0.1) / 2, 0.08 * s);
			lines.arc(a, u, v, r);
			lines.arc(b, u, v, r);
			return;
		}
		case "spring": {
			if (!b) return;
			const axis = sub(b, a);
			if (len(axis) < 1e-4) return;
			const [u, v] = across(axis);
			const coils = Math.min(Math.max(Math.round(j.coils ?? 3), 1), 50);
			const r = Math.max(j.radius ?? 0.4, 0.05);
			const steps = coils * 16;
			let last = a;
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				const angle = 2 * Math.PI * coils * t;
				const lift = i === steps ? 0 : 1;
				const p = add(
					add(add(a, axis, t), u, r * Math.cos(angle) * lift),
					v,
					r * Math.sin(angle) * lift,
				);
				lines.line(last, p);
				last = p;
			}
			return;
		}
		case "hinge": {
			const r = Math.max(j.radius ?? 0.15, 0.4 * s);
			for (const f of j.to ? [j.from, j.to] : [j.from]) {
				const x = xAxis(f);
				const y = yAxis(f);
				const z = [f.rotation[2], f.rotation[5], f.rotation[8]];
				lines.arc(f.position, y, z, r);
				lines.line(add(f.position, x, -r * 1.6), add(f.position, x, r * 1.6));
			}
			if (b && len(sub(b, a)) > r) lines.line(a, b);
			if (j.limits) {
				// The swing its limits allow, from Attachment0's SecondaryAxis round its Axis.
				const y = yAxis(j.from);
				const z = [j.from.rotation[2], j.from.rotation[5], j.from.rotation[8]];
				const from = ((j.lower ?? -45) * Math.PI) / 180;
				const to = ((j.upper ?? 45) * Math.PI) / 180;
				const far = Math.max(r * 2.4, 1.6 * s);
				lines.arc(a, y, z, far, Math.min(from, to), Math.max(from, to));
				for (const t of [from, to])
					lines.line(a, add(add(a, y, far * Math.cos(t)), z, far * Math.sin(t)));
			}
			return;
		}
		case "ball": {
			const r = Math.max(j.radius ?? 0.15, 0.25 * s);
			ball(lines, a, j.from, r);
			if (b && len(sub(b, a)) > r) lines.line(a, b);
			if (j.limits) {
				// The cone its UpperAngle allows round Attachment0's Axis.
				const x = xAxis(j.from);
				const [u, v] = across(x);
				const half = (Math.min(Math.max(j.upper ?? 45, 0), 180) * Math.PI) / 180;
				const l = 2 * s;
				const rim = add(a, x, l * Math.cos(half));
				const rr = l * Math.sin(half);
				lines.arc(rim, u, v, rr);
				for (const side of [u, v, scale(u, -1), scale(v, -1)]) lines.line(a, add(rim, side, rr));
			}
			return;
		}
		default: {
			if (b) lines.line(a, b);
			else cross3(lines, a, 0.3 * s);
		}
	}
}

/** Where a joint is, for how near it is: its middle. */
const jointAt = (j: SceneJoint) =>
	j.to ? mid(j.from.position, j.to.position) : (j.at ?? j.from.position);

const isWeld = (j: SceneJoint) => j.kind === "weld" || j.kind === "joint";

/**
 * The lines for the gizmos `settings` shows from `eye`. `picked` is every row
 * picked and every row inside one, for `GizmoSettings.picked`.
 */
export function visualGizmoLines(
	gizmos: SceneGizmos | undefined,
	settings: GizmoSettings,
	eye: V,
	picked: ReadonlySet<number> = new Set(),
	reach = VISUAL_REACH,
): Float32Array {
	if (!gizmos) return new Float32Array();
	const withPick = settings.picked && picked.size > 0;
	const dist = (p: V) => len(sub(p, eye));
	const out: number[] = [];

	// Joints: those switched on and near, and those picked or tying what is.
	const joints: [number, number, SceneJoint][] = [];
	for (const j of gizmos.joints) {
		const shown = isWeld(j) ? settings.welds : settings.constraints;
		const mine = withPick && (picked.has(j.id) || j.ties.some((t) => picked.has(t)));
		const d = dist(jointAt(j));
		if (mine) joints.push([0, d, j]);
		else if (shown && d <= reach) joints.push([1, d, j]);
	}
	joints.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
	const drawn = joints.slice(0, MOST_JOINTS);
	// A constraint drawn shows its Attachments, as Studio's details do.
	const ends = new Set<number>();
	for (const [, d, j] of drawn) {
		jointLines(j, gizmoScale(d), out);
		if (!isWeld(j)) for (const t of j.ties) ends.add(t);
	}

	const attachments: [number, number, (typeof gizmos.attachments)[number]][] = [];
	for (const a of gizmos.attachments) {
		const d = dist(a.frame.position);
		const mine = withPick && (picked.has(a.id) || (a.part !== undefined && picked.has(a.part)));
		if (mine || ends.has(a.id)) attachments.push([0, d, a]);
		else if (settings.attachments && d <= reach) attachments.push([1, d, a]);
	}
	attachments.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
	for (const [, d, a] of attachments.slice(0, MOST_ATTACHMENTS))
		attachmentLines(a.frame, gizmoScale(d), out);
	return new Float32Array(out);
}
