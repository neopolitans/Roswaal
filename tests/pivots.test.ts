/**
 * Pivots and the boxes square to them: a model's selection box follows its
 * pivot, as Studio's does and as `Model:GetBoundingBox` describes, and a part
 * shows where its pivot is when that is not its centre.
 */

import { describe, expect, it } from "vitest";

import { boxAround } from "../src/app/viewport/box.js";
import type { Prop, PropType, RbxInstance } from "../src/core/rbx/dom.js";
import { buildPlaceScene, modelPivot, partPivot, SCENE_STRIDE } from "../src/core/rbx/scene.js";

function inst(
	className: string,
	props: Record<string, [PropType, unknown]>,
	children: RbxInstance[] = [],
) {
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
const c = Math.SQRT1_2;
/** Turned 45 degrees about Y, row-major. */
const TURNED = [c, 0, c, 0, 1, 0, -c, 0, c];
const frame = (position: number[], rotation = IDENTITY) => ({ position, rotation });
const part = (
	position: number[],
	rotation = IDENTITY,
	extra: Record<string, [PropType, unknown]> = {},
) =>
	inst("Part", {
		CFrame: ["CFrame", frame(position, rotation)],
		size: ["Vector3", [4, 1, 2]],
		...extra,
	});

const close = (a: ArrayLike<number>, b: ArrayLike<number>) =>
	expect(Array.from(a, (v) => Math.round(v * 1e4) / 1e4)).toEqual(
		Array.from(b, (v) => Math.round(v * 1e4) / 1e4),
	);

describe("a model's pivot", () => {
	it("is its PrimaryPart's, turned and moved by that part's PivotOffset", () => {
		const primary = part([10, 0, 0], TURNED, {
			PivotOffset: ["CFrame", frame([0, 2, 0])],
		});
		const model = inst(
			"Model",
			{ PrimaryPart: ["Ref", primary], WorldPivotData: ["OptionalCFrame", frame([99, 99, 99])] },
			[primary],
		);
		const pivot = modelPivot(model);
		close(pivot?.rotation ?? [], TURNED);
		close(pivot?.position ?? [], [10, 2, 0]);
	});

	it("is its WorldPivot without a PrimaryPart", () => {
		const model = inst("Model", {
			PrimaryPart: ["Ref", null],
			WorldPivotData: ["OptionalCFrame", frame([1, 2, 3], TURNED)],
		});
		close(modelPivot(model)?.position ?? [], [1, 2, 3]);
		close(modelPivot(model)?.rotation ?? [], TURNED);
	});

	it("is nothing with neither", () => {
		expect(
			modelPivot(
				inst("Model", { PrimaryPart: ["Ref", null], WorldPivotData: ["OptionalCFrame", null] }),
			),
		).toBeUndefined();
	});

	it("goes in the scene by the model's row, rotation then position", () => {
		const a = part([0, 0, 0]);
		const model = inst("Model", { WorldPivotData: ["OptionalCFrame", frame([5, 6, 7], TURNED)] }, [
			a,
		]);
		const workspace = inst("Workspace", {}, [model]);
		const ids = new Map<RbxInstance, number>([
			[model, 3],
			[a, 4],
		]);
		const scene = buildPlaceScene(workspace, (i) => ids.get(i));
		close(scene.pivots?.[3] ?? [], [...TURNED, 5, 6, 7]);
		// A plain part's pivot is its drawn box's centre and axes, so it is not listed.
		expect(scene.pivots?.[4]).toBeUndefined();
	});
});

describe("a part's pivot", () => {
	it("is its CFrame without a PivotOffset", () => {
		close(partPivot(part([1, 2, 3]))?.position ?? [], [1, 2, 3]);
	});

	it("follows its PivotOffset, in the part's own axes", () => {
		const p = part([0, 0, 0], TURNED, { PivotOffset: ["CFrame", frame([2, 0, 0])] });
		close(partPivot(p)?.position ?? [], [2 * c, 0, -2 * c]);
	});

	it("is in the scene when its PivotOffset moves it", () => {
		const p = part([0, 0, 0], IDENTITY, { PivotOffset: ["CFrame", frame([0, 3, 0])] });
		const scene = buildPlaceScene(inst("Workspace", {}, [p]), () => 0);
		close(scene.pivots?.[0] ?? [], [...IDENTITY, 0, 3, 0]);
	});
});

describe("the box round a model", () => {
	/** A scene row: axes times size, then centre. */
	const row = (centre: number[], size: number[], r = IDENTITY) => {
		const out = new Float32Array(SCENE_STRIDE);
		for (let j = 0; j < 3; j++) for (let a = 0; a < 3; a++) out[j * 3 + a] = r[a * 3 + j] * size[j];
		out.set(centre, 9);
		return out;
	};

	it("is square to the world without a pivot", () => {
		const box = boxAround([row([0, 0, 0], [2, 2, 2]), row([4, 0, 0], [2, 2, 2])]);
		close(box.slice(0, 12), [6, 0, 0, 0, 2, 0, 0, 0, 2, 2, 0, 0]);
	});

	it("is square to the pivot, and fits a turned part exactly", () => {
		const box = boxAround([row([3, 1, 2], [4, 1, 2], TURNED)], TURNED);
		// The part's own box: its axes times its size, at its centre.
		close(box.slice(0, 12), row([3, 1, 2], [4, 1, 2], TURNED).slice(0, 12));
	});

	it("is wider square to the world than square to a turned model", () => {
		const parts = [row([0, 0, 0], [4, 1, 2], TURNED)];
		const world = boxAround(parts);
		const turned = boxAround(parts, TURNED);
		const volume = (b: Float32Array) =>
			Math.hypot(b[0], b[1], b[2]) * Math.hypot(b[3], b[4], b[5]) * Math.hypot(b[6], b[7], b[8]);
		expect(volume(world)).toBeGreaterThan(volume(turned) * 1.5);
	});

	it("is empty round nothing", () => {
		expect(boxAround([]).length).toBe(0);
	});
});
