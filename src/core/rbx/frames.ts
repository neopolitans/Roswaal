/**
 * Moving parts and Models whole, as a drag in the place editor does: one
 * rigid turn and shift, applied to each part's CFrame and each Model's
 * WorldPivot, and the values they held before, which put them back exactly.
 */

import { isSubclassOf } from "../roblox.js";
import { type CFrameValue, RbxError, type RbxInstance, walk } from "./dom.js";
import type { PropertyWrite } from "./edit.js";

/** `by` after `cf`: `cf` turned and moved as `by` turns and moves the world. */
export function composeFrame(by: CFrameValue, cf: CFrameValue): CFrameValue {
	const a = by.rotation;
	const b = cf.rotation;
	const rotation: number[] = [];
	for (let i = 0; i < 3; i++)
		for (let j = 0; j < 3; j++)
			rotation.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
	const p = cf.position;
	const position = [0, 1, 2].map(
		(i) => a[i * 3] * p[0] + a[i * 3 + 1] * p[1] + a[i * 3 + 2] * p[2] + by.position[i],
	) as [number, number, number];
	return { position, rotation };
}

const isPart = (inst: RbxInstance) => isSubclassOf(inst.className, "BasePart");
/** A Model a drag moves: not Workspace, nor another world of its own. */
const isModel = (inst: RbxInstance) =>
	isSubclassOf(inst.className, "Model") && !isSubclassOf(inst.className, "WorldRoot");

/** Whether a drag can move `inst`: a part, or a Model. */
export function movable(inst: RbxInstance): boolean {
	return isPart(inst) || isModel(inst);
}

/** A stored frame: a part's CFrame, or a Model's WorldPivot when it has one. */
function frameOf(inst: RbxInstance): PropertyWrite | null {
	const stored = isPart(inst) ? "CFrame" : isModel(inst) ? "WorldPivotData" : null;
	const value = stored ? inst.props.get(stored)?.value : undefined;
	if (!stored || !value || typeof value !== "object") return null;
	return { inst, stored, value };
}

/**
 * The frames moving `targets` changes, as they are now: a part's own CFrame
 * (the parts inside it stay, as in Studio), and in a Model every part and
 * every pivot it holds. A target inside another target moves once, with it.
 */
export function framesOf(targets: readonly RbxInstance[]): PropertyWrite[] {
	const picked = new Set(targets);
	const out: PropertyWrite[] = [];
	for (const target of targets) {
		if (!movable(target)) throw new RbxError(`${target.name} is not a part or a Model`);
		let inside = false;
		for (let up = target.parent; up && !inside; up = up.parent) inside = picked.has(up);
		if (inside) continue;
		const each = isPart(target) ? [target] : [...walk([target])];
		for (const inst of each) {
			const frame = frameOf(inst);
			if (frame) out.push(frame);
		}
	}
	return out;
}

/** `frames` turned and moved by `by`: what a drag writes. */
export function movedBy(frames: readonly PropertyWrite[], by: CFrameValue): PropertyWrite[] {
	return frames.map((f) => ({ ...f, value: composeFrame(by, f.value as CFrameValue) }));
}

/** Whether `v` reads as a CFrame: three numbers and nine, all finite. */
export function isFrame(v: unknown): v is CFrameValue {
	if (!v || typeof v !== "object") return false;
	const { position, rotation } = v as { position?: unknown; rotation?: unknown };
	const finite = (a: unknown, n: number) =>
		Array.isArray(a) &&
		a.length === n &&
		a.every((x) => typeof x === "number" && Number.isFinite(x));
	return finite(position, 3) && finite(rotation, 9);
}
