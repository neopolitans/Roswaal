/**
 * A place's Attachments, welds and constraints as the viewer's gizmos take
 * them: where each is in the world, what it ties, and what it is drawn with.
 */

import { describe, expect, it } from "vitest";
import { brickColorRgb } from "../src/core/rbx/brickColors.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { JOINT_COLOURS, MOTOR_COLOUR, sceneGizmos } from "../src/core/rbx/gizmos.js";
import { buildPlaceScene } from "../src/core/rbx/scene.js";

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
		props: new Map<string, Prop>(
			Object.entries(props).map(([k, [type, value]]) => [k, { type, value }]),
		),
		service: false,
	};
	for (const child of children) child.parent = made;
	return made;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Turned a quarter round Y: its X is the world's -Z. */
const QUARTER_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const cf = (position: number[], rotation = IDENTITY) => ["CFrame", { position, rotation }] as const;
const part = (at: number[], kids: RbxInstance[] = [], rotation = IDENTITY) =>
	inst("Part", { CFrame: [...cf(at, rotation)], size: ["Vector3", [2, 2, 2]] }, kids);
const attachment = (at: number[], rotation = IDENTITY) =>
	inst("Attachment", { CFrame: [...cf(at, rotation)] });
const round = (xs: readonly number[]) => xs.map((x) => Math.round(x * 1000) / 1000 + 0);

/** Every instance a row, in the order met. */
function rowsOf(root: RbxInstance) {
	const order: RbxInstance[] = [];
	const walk = (i: RbxInstance) => {
		order.push(i);
		for (const c of i.children) walk(c);
	};
	walk(root);
	return (i: RbxInstance) => {
		const n = order.indexOf(i);
		return n < 0 ? undefined : n;
	};
}

describe("a place's gizmos", () => {
	it("read each Attachment's frame in the world, through its part's", () => {
		const a = attachment([1, 0, 0]);
		const p = part([10, 5, 0], [a], QUARTER_Y);
		const ws = inst("Workspace", {}, [p]);
		const idOf = rowsOf(ws);
		const { attachments } = sceneGizmos(ws, idOf);
		expect(attachments).toHaveLength(1);
		expect(attachments[0].id).toBe(idOf(a));
		expect(attachments[0].part).toBe(idOf(p));
		// The part's X is the world's -Z: one stud along it.
		expect(round(attachments[0].frame.position)).toEqual([10, 5, -1]);
		expect(round(attachments[0].frame.rotation)).toEqual(QUARTER_Y);
	});

	it("read a WeldConstraint between its parts, from Part0Internal as saved", () => {
		const p0 = part([0, 0, 0]);
		const p1 = part([0, 4, 0]);
		const weld = inst("WeldConstraint", {
			Part0Internal: ["Ref", p0],
			Part1Internal: ["Ref", p1],
		});
		const ws = inst("Workspace", {}, [p0, p1, weld]);
		const idOf = rowsOf(ws);
		const [j] = sceneGizmos(ws, idOf).joints;
		expect(j.kind).toBe("weld");
		expect(j.ties).toEqual([idOf(p0), idOf(p1)]);
		expect(j.from.position).toEqual([0, 0, 0]);
		expect(j.to?.position).toEqual([0, 4, 0]);
		expect(j.colour).toEqual(JOINT_COLOURS.weld);
		expect(j.enabled).toBe(true);
	});

	it("put a Weld's and a Motor6D's joint at Part0 times C0", () => {
		const p0 = part([10, 0, 0], [], QUARTER_Y);
		const p1 = part([10, 3, -2]);
		const motor = inst("Motor6D", {
			Part0: ["Ref", p0],
			Part1: ["Ref", p1],
			C0: [...cf([2, 1, 0])],
			Enabled: ["Bool", false],
		});
		const ws = inst("Workspace", {}, [p0, p1, motor]);
		const [j] = sceneGizmos(ws, rowsOf(ws)).joints;
		expect(j.kind).toBe("joint");
		expect(round(j.at ?? [])).toEqual([10, 1, -2]);
		expect(j.colour).toEqual(MOTOR_COLOUR);
		expect(j.enabled).toBe(false);
	});

	it("read a mechanical constraint between its Attachments, with its look", () => {
		const a0 = attachment([0, -1, 0]);
		const a1 = attachment([0, 1, 0]);
		const p0 = part([0, 10, 0], [a0]);
		const p1 = part([6, 10, 0], [a1]);
		const spring = inst("SpringConstraint", {
			Attachment0: ["Ref", a0],
			Attachment1: ["Ref", a1],
			Color: ["BrickColor", 21],
			FreeLength: ["Float32", 5],
			Radius: ["Float32", 0.6],
			Thickness: ["Float32", 0.1],
			Coils: ["Float32", 7],
		});
		const ws = inst("Workspace", {}, [p0, p1, spring]);
		const idOf = rowsOf(ws);
		const [j] = sceneGizmos(ws, idOf).joints;
		expect(j.kind).toBe("spring");
		expect(j.from.position).toEqual([0, 9, 0]);
		expect(j.to?.position).toEqual([6, 11, 0]);
		expect(j.ties).toEqual([idOf(a0), idOf(p0), idOf(a1), idOf(p1)]);
		expect(j.colour).toEqual(brickColorRgb(21));
		expect([j.length, j.radius, j.thickness, j.coils]).toEqual([5, 0.6, 0.1, 7]);
	});

	it("read a hinge's limits, and draw an unknown constraint as a line", () => {
		const a0 = attachment([0, 0, 0]);
		const a1 = attachment([0, 0, 0]);
		const p = part([0, 0, 0], [a0, a1]);
		const hinge = inst("HingeConstraint", {
			Attachment0: ["Ref", a0],
			Attachment1: ["Ref", a1],
			LimitsEnabled: ["Bool", true],
			LowerAngle: ["Float32", -30],
			UpperAngle: ["Float32", 60],
		});
		const prismatic = inst("PrismaticConstraint", {
			Attachment0: ["Ref", a0],
			Attachment1: ["Ref", a1],
		});
		const one = inst("AlignOrientationConstraint", { Attachment0: ["Ref", a0] });
		const ws = inst("Workspace", {}, [p, hinge, prismatic, one]);
		const joints = sceneGizmos(ws, rowsOf(ws)).joints;
		expect(joints.map((j) => j.kind)).toEqual(["hinge", "other", "other"]);
		expect([joints[0].limits, joints[0].lower, joints[0].upper]).toEqual([true, -30, 60]);
		expect(joints[2].to).toBeUndefined();
	});

	it("leave out what has nothing to tie, and Beams, which are drawn as themselves", () => {
		const a0 = attachment([0, 0, 0]);
		const a1 = attachment([0, 0, 0]);
		const p = part([0, 0, 0], [a0, a1]);
		const ws = inst("Workspace", {}, [
			p,
			inst("Beam", { Attachment0: ["Ref", a0], Attachment1: ["Ref", a1] }),
			inst("RopeConstraint", { Attachment0: ["Ref", null], Attachment1: ["Ref", null] }),
			inst("WeldConstraint", { Part0Internal: ["Ref", p], Part1Internal: ["Ref", null] }),
		]);
		expect(sceneGizmos(ws, rowsOf(ws)).joints).toEqual([]);
	});

	it("are carried by the scene only when the place has any", () => {
		const bare = inst("Workspace", {}, [part([0, 0, 0])]);
		expect(buildPlaceScene(bare, rowsOf(bare)).gizmos).toBeUndefined();
		const ws = inst("Workspace", {}, [part([0, 0, 0], [attachment([0, 1, 0])])]);
		expect(buildPlaceScene(ws, rowsOf(ws)).gizmos?.attachments).toHaveLength(1);
	});
});

describe("BrickColor numbers", () => {
	it("are the colours they name", () => {
		expect(round(brickColorRgb(194) ?? [])).toEqual(round([163 / 255, 162 / 255, 165 / 255]));
		expect(brickColorRgb(21)).toEqual([196 / 255, 40 / 255, 28 / 255]);
		expect(brickColorRgb(99999)).toBeUndefined();
	});
});
