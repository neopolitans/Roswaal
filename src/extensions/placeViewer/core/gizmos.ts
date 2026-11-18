/**
 * A place's Attachments, welds and constraints, for the place viewer's
 * gizmos: where each one is, read once from the DataModel and sent with the
 * scene, as plain numbers the viewer draws wire lines from (see
 * `../app/viewport/visualGizmos.ts`).
 *
 * The properties mean what Roblox's Creator Documentation says they do: an
 * Attachment is a point and orientation in the part it is in; a WeldConstraint
 * holds Part0 and Part1 as they are; a Weld or Motor6D joins Part1 to Part0 at
 * Part0's CFrame times C0; a mechanical constraint acts between Attachment0
 * and Attachment1, and its Color, Length, Radius, Thickness and Coils are what
 * it is drawn with.
 */

import type { RbxInstance } from "../../../core/rbx/dom.js";
import { brickColorRgb } from "./brickColors.js";
import { attachmentFrame, type EffectFrame } from "./effects.js";

export interface SceneAttachment {
	/** The Attachment's row in the DataModel browser. */
	id: number;
	/** The row of the part it is in, when it is in one. */
	part?: number;
	/** Its frame in the world. */
	frame: EffectFrame;
}

/**
 * How a joint is drawn: `weld` a WeldConstraint, between its parts; `joint` a
 * Weld, Motor6D or another JointInstance, through the point C0 names; the rest
 * mechanical constraints between their Attachments, `other` those drawn as a
 * line alone.
 */
export type JointKind = "weld" | "joint" | "rope" | "rod" | "spring" | "hinge" | "ball" | "other";

export interface SceneJoint {
	/** The joint's row in the DataModel browser. */
	id: number;
	kind: JointKind;
	className: string;
	/** The rows it ties: its Attachments and their parts, or its two parts. For "when picked". */
	ties: number[];
	/** Attachment0's frame in the world, or Part0's. */
	from: EffectFrame;
	/** Attachment1's, or Part1's; none for a constraint with one Attachment. */
	to?: EffectFrame;
	/** A JointInstance's point in the world: Part0's CFrame times C0. */
	at?: number[];
	/** Its colour, 0 to 1 a channel: a Constraint's Color, else its kind's. */
	colour: number[];
	enabled: boolean;
	/** RopeConstraint's and RodConstraint's Length; SpringConstraint's FreeLength. */
	length?: number;
	/** HingeConstraint's, BallSocketConstraint's and SpringConstraint's Radius. */
	radius?: number;
	thickness?: number;
	coils?: number;
	/** LimitsEnabled, and the limits in degrees: a hinge's LowerAngle and UpperAngle, a ball socket's UpperAngle. */
	limits?: boolean;
	lower?: number;
	upper?: number;
}

export interface SceneGizmos {
	attachments: SceneAttachment[];
	joints: SceneJoint[];
}

/** Each kind's colour where a joint has no Color of its own: welds have none. */
export const JOINT_COLOURS: Record<JointKind, number[]> = {
	weld: [0.36, 0.8, 0.6],
	joint: [0.5, 0.72, 1],
	rope: [0.78, 0.6, 0.36],
	rod: [0.75, 0.75, 0.78],
	spring: [0.75, 0.75, 0.78],
	hinge: [1, 0.72, 0.2],
	ball: [1, 0.72, 0.2],
	other: [0.85, 0.5, 1],
};

/** Motor6D, which animates, apart from the welds that hold still. */
export const MOTOR_COLOUR = [0.85, 0.5, 1];

/** The JointInstances: a Part0, a Part1, and C0 and C1. */
const JOINT_INSTANCES = new Set([
	"Weld",
	"ManualWeld",
	"ManualGlue",
	"Motor6D",
	"Motor",
	"VelocityMotor",
	"Snap",
	"Glue",
	"Rotate",
	"RotateP",
	"RotateV",
]);

const MECHANICAL: Record<string, JointKind> = {
	RopeConstraint: "rope",
	RodConstraint: "rod",
	SpringConstraint: "spring",
	HingeConstraint: "hinge",
	BallSocketConstraint: "ball",
};

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function num(inst: RbxInstance, name: string): number | undefined {
	const v = inst.props.get(name)?.value;
	return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function ref(inst: RbxInstance, ...names: string[]): RbxInstance | undefined {
	for (const name of names) {
		const v = inst.props.get(name)?.value as RbxInstance | null | undefined;
		if (v && typeof v === "object" && "className" in v) return v;
	}
	return undefined;
}

function frameOf(inst: RbxInstance | undefined): EffectFrame | undefined {
	const cf = inst?.props.get("CFrame")?.value as EffectFrame | undefined;
	return cf && Array.isArray(cf.rotation) && Array.isArray(cf.position)
		? { rotation: [...cf.rotation], position: [...cf.position] }
		: undefined;
}

/** `frame` times the point `p`. */
function apply(frame: EffectFrame, p: readonly number[]): number[] {
	const r = frame.rotation;
	return [0, 1, 2].map(
		(i) => frame.position[i] + r[i * 3] * p[0] + r[i * 3 + 1] * p[1] + r[i * 3 + 2] * p[2],
	);
}

const isAttachment = (inst: RbxInstance | undefined): inst is RbxInstance =>
	inst?.className === "Attachment" || inst?.className === "Bone";

/** The Attachments, welds and constraints under `workspace`. */
export function sceneGizmos(
	workspace: RbxInstance | undefined,
	idOf: (inst: RbxInstance) => number | undefined,
): SceneGizmos {
	const attachments: SceneAttachment[] = [];
	const joints: SceneJoint[] = [];
	const rows = (...of: (RbxInstance | null | undefined)[]) => {
		const out: number[] = [];
		for (const inst of of) {
			const id = inst ? idOf(inst) : undefined;
			if (id !== undefined && !out.includes(id)) out.push(id);
		}
		return out;
	};
	const visit = (inst: RbxInstance) => {
		for (const child of inst.children) visit(child);
		const id = idOf(inst);
		if (id === undefined) return;
		const enabled = inst.props.get("Enabled")?.value !== false;
		if (inst.className === "Attachment") {
			const frame = attachmentFrame(inst);
			const part = inst.parent ? idOf(inst.parent) : undefined;
			if (frame)
				attachments.push({
					id,
					...(part !== undefined && frameOf(inst.parent ?? undefined) ? { part } : {}),
					frame: { rotation: [...frame.rotation], position: [...frame.position] },
				});
			return;
		}
		if (inst.className === "WeldConstraint") {
			// Saved as Part0Internal and Part1Internal; Part0 and Part1 read the same.
			const p0 = ref(inst, "Part0", "Part0Internal");
			const p1 = ref(inst, "Part1", "Part1Internal");
			const from = frameOf(p0);
			const to = frameOf(p1);
			if (!from || !to) return;
			joints.push({
				id,
				kind: "weld",
				className: inst.className,
				ties: rows(p0, p1),
				from,
				to,
				colour: JOINT_COLOURS.weld,
				enabled,
			});
			return;
		}
		if (JOINT_INSTANCES.has(inst.className)) {
			const p0 = ref(inst, "Part0");
			const p1 = ref(inst, "Part1");
			const from = frameOf(p0);
			if (!from) return;
			const c0 = (inst.props.get("C0")?.value as EffectFrame | undefined)?.position;
			const to = frameOf(p1);
			joints.push({
				id,
				kind: "joint",
				className: inst.className,
				ties: rows(p0, p1),
				from,
				...(to ? { to } : {}),
				at: apply(from, Array.isArray(c0) ? c0 : [0, 0, 0]),
				colour: inst.className === "Motor6D" ? MOTOR_COLOUR : JOINT_COLOURS.joint,
				enabled,
			});
			return;
		}
		if (!inst.className.endsWith("Constraint") || !inst.props.has("Attachment0")) return;
		const a0 = ref(inst, "Attachment0");
		const a1 = ref(inst, "Attachment1");
		const ends = [a0, a1].filter(isAttachment);
		if (ends.length === 0) return;
		const from = attachmentFrame(ends[0]) ?? { rotation: IDENTITY, position: [0, 0, 0] };
		const to = ends[1] ? attachmentFrame(ends[1]) : undefined;
		const kind: JointKind = to ? (MECHANICAL[inst.className] ?? "other") : "other";
		const brick = num(inst, "Color");
		const joint: SceneJoint = {
			id,
			kind,
			className: inst.className,
			ties: rows(ends[0], ends[0].parent, ends[1], ends[1]?.parent),
			from,
			...(to ? { to } : {}),
			colour: (brick !== undefined && brickColorRgb(brick)) || JOINT_COLOURS[kind],
			enabled,
		};
		const take = (key: "length" | "radius" | "thickness" | "coils", name: string) => {
			const v = num(inst, name);
			if (v !== undefined) joint[key] = v;
		};
		take("length", kind === "spring" ? "FreeLength" : "Length");
		take("radius", "Radius");
		take("thickness", "Thickness");
		take("coils", "Coils");
		if (kind === "hinge" || kind === "ball") {
			joint.limits = inst.props.get("LimitsEnabled")?.value === true;
			if (kind === "hinge") {
				const lower = num(inst, "LowerAngle");
				if (lower !== undefined) joint.lower = lower;
			}
			const upper = num(inst, "UpperAngle");
			if (upper !== undefined) joint.upper = upper;
		}
		joints.push(joint);
	};
	if (workspace) visit(workspace);
	return { attachments, joints };
}
