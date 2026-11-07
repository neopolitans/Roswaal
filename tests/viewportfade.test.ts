/**
 * The touch controls' fade: a while after the last touch lets go, never while
 * one is held, and awake again at the first touch.
 */

import { describe, expect, it } from "vitest";
import { FADE_AFTER, type FadeTimers, fader } from "../src/app/viewport/fade.js";

/** A clock moved by hand, with the one wait a fader keeps. */
function clock() {
	let now = 0;
	const waits = new Map<number, { at: number; run: () => void }>();
	let next = 0;
	const timers: FadeTimers = {
		set(run, ms) {
			waits.set(++next, { at: now + ms, run });
			return next;
		},
		clear(handle) {
			waits.delete(handle as number);
		},
	};
	const pass = (ms: number) => {
		now += ms;
		for (const [id, w] of [...waits]) {
			if (w.at <= now) {
				waits.delete(id);
				w.run();
			}
		}
	};
	return { timers, pass, waiting: () => waits.size };
}

function watch(after = FADE_AFTER) {
	const c = clock();
	const heard: boolean[] = [];
	const f = fader((faded) => heard.push(faded), after, c.timers);
	return { ...c, f, heard };
}

describe("fader", () => {
	it("waits about three seconds", () => {
		expect(FADE_AFTER).toBe(3000);
	});

	it("fades once the wait is up, untouched from the start", () => {
		const { pass, heard } = watch();
		pass(FADE_AFTER - 1);
		expect(heard).toEqual([]);
		pass(1);
		expect(heard).toEqual([true]);
	});

	it("wakes at the first touch and fades a wait after it lets go", () => {
		const { f, pass, heard } = watch();
		pass(FADE_AFTER);
		f.down(1);
		expect(heard).toEqual([true, false]);
		pass(FADE_AFTER * 4);
		expect(heard).toEqual([true, false]);
		f.up(1);
		pass(FADE_AFTER - 1);
		expect(heard).toEqual([true, false]);
		pass(1);
		expect(heard).toEqual([true, false, true]);
	});

	it("starts the wait again at each touch", () => {
		const { f, pass, heard } = watch();
		pass(FADE_AFTER - 100);
		f.down(1);
		f.up(1);
		pass(FADE_AFTER - 100);
		expect(heard).toEqual([]);
		pass(100);
		expect(heard).toEqual([true]);
	});

	it("stays awake while any of two touches is held", () => {
		const { f, pass, heard } = watch();
		f.down(1);
		f.down(2);
		f.up(1);
		pass(FADE_AFTER * 2);
		expect(heard).toEqual([]);
		f.up(2);
		pass(FADE_AFTER);
		expect(heard).toEqual([true]);
	});

	it("tells only of changes", () => {
		const { f, heard } = watch();
		f.down(1);
		f.up(1);
		f.down(2);
		expect(heard).toEqual([]);
	});

	it("takes no notice of a touch it never saw come down", () => {
		const { f, pass, heard } = watch();
		f.down(1);
		f.up(7);
		pass(FADE_AFTER);
		expect(heard).toEqual([]);
	});

	it("keeps no wait once stopped", () => {
		const { f, pass, heard, waiting } = watch();
		f.stop();
		expect(waiting()).toBe(0);
		pass(FADE_AFTER);
		expect(heard).toEqual([]);
	});
});
