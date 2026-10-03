/**
 * `trackPointer`: a drag ends on a release or a cancel, once, and leaves no
 * listener behind. Driven through a bare EventTarget, since vitest has no DOM.
 */

import { describe, expect, it } from "vitest";

import { trackPointer } from "../src/app/pointer.js";

function pointer(type: string, pointerId: number, clientX = 0): PointerEvent {
	// A plain Event carrying the fields the helper reads. There is no
	// PointerEvent constructor outside a browser.
	return Object.assign(new Event(type), { pointerId, clientX }) as unknown as PointerEvent;
}

function drag(target: EventTarget) {
	const moves: number[] = [];
	const ends: (PointerEvent | undefined)[] = [];
	const stop = trackPointer(
		{ pointerId: 1 },
		{ move: (e) => moves.push(e.clientX), end: (release) => ends.push(release) },
		{ target },
	);
	return { moves, ends, stop };
}

describe("trackPointer", () => {
	it("follows moves and ends on a release, with the release", () => {
		const target = new EventTarget();
		const { moves, ends } = drag(target);
		target.dispatchEvent(pointer("pointermove", 1, 10));
		target.dispatchEvent(pointer("pointermove", 1, 20));
		const up = pointer("pointerup", 1, 25);
		target.dispatchEvent(up);
		target.dispatchEvent(pointer("pointermove", 1, 30));
		expect(moves).toEqual([10, 20]);
		expect(ends).toEqual([up]);
	});

	it("ends on a cancel, with no release, and stops listening", () => {
		const target = new EventTarget();
		const { moves, ends } = drag(target);
		target.dispatchEvent(pointer("pointercancel", 1));
		target.dispatchEvent(pointer("pointermove", 1, 30));
		target.dispatchEvent(pointer("pointerup", 1));
		expect(moves).toEqual([]);
		expect(ends).toEqual([undefined]);
	});

	it("ignores every other pointer", () => {
		const target = new EventTarget();
		const { moves, ends } = drag(target);
		target.dispatchEvent(pointer("pointermove", 2, 10));
		target.dispatchEvent(pointer("pointerup", 2));
		target.dispatchEvent(pointer("pointercancel", 2));
		expect(moves).toEqual([]);
		expect(ends).toEqual([]);
	});

	it("can be stopped by the caller, once", () => {
		const target = new EventTarget();
		const { moves, ends, stop } = drag(target);
		stop();
		stop();
		target.dispatchEvent(pointer("pointermove", 1, 10));
		target.dispatchEvent(pointer("pointerup", 1));
		expect(moves).toEqual([]);
		expect(ends).toEqual([undefined]);
	});
});
