/**
 * The Rendering panel's frame-time graph: the ring of frames it keeps, how a
 * frame's interval is measured, and how the graph is scaled.
 */

import { describe, expect, it } from "vitest";
import {
	FRAME_HISTORY,
	FRAME_RUN,
	FrameHistory,
	type FrameSample,
	frameInterval,
	gpuTotal,
	graphTop,
	graphY,
} from "../src/app/viewport/frameGraph.js";

const frame = (interval: number, gpu?: [number, number, number]): FrameSample => ({
	interval,
	page: 1,
	shadows: gpu?.[0] ?? Number.NaN,
	scene: gpu?.[1] ?? Number.NaN,
	post: gpu?.[2] ?? Number.NaN,
});

describe("FrameHistory", () => {
	it("keeps the last frames, oldest first", () => {
		const h = new FrameHistory(4);
		for (let i = 1; i <= 6; i++) h.push(frame(i));
		expect(h.length).toBe(4);
		expect(h.samples().map((s) => s.interval)).toEqual([3, 4, 5, 6]);
		expect(h.at(0).interval).toBe(3);
	});

	it("holds fewer before it fills", () => {
		const h = new FrameHistory(4);
		h.push(frame(7));
		h.push(frame(8));
		expect(h.samples().map((s) => s.interval)).toEqual([7, 8]);
	});

	it("counts what is added, so the graph draws only when something was", () => {
		const h = new FrameHistory();
		expect(h.size).toBe(FRAME_HISTORY);
		const before = h.version;
		h.push(frame(16));
		expect(h.version).toBe(before + 1);
		h.clear();
		expect(h.length).toBe(0);
	});

	it("keeps what was not timed as not timed", () => {
		const h = new FrameHistory(2);
		h.push(frame(16));
		expect(Number.isNaN(gpuTotal(h.at(0)))).toBe(true);
		h.push(frame(16, [1, 2, 0.5]));
		expect(gpuTotal(h.at(1))).toBe(3.5);
	});
});

describe("frameInterval", () => {
	it("is the time since the last frame while the view keeps drawing", () => {
		// Wanted just after the last frame; a hitch shows whole.
		expect(frameInterval(1100, 1000, 1004)).toBe(100);
		expect(frameInterval(1016.7, 1000, 1001)).toBeCloseTo(16.7);
	});

	it("is the time since it was wanted after the view sat idle", () => {
		expect(frameInterval(5016, 1000, 5000)).toBe(16);
		expect(frameInterval(5016, 1000, 1000 + FRAME_RUN + 1)).toBe(5016 - 1000 - FRAME_RUN - 1);
	});

	it("is never below nothing", () => {
		expect(frameInterval(5000, 1000, 5004)).toBe(0);
	});
});

describe("graph scale", () => {
	it("keeps both guides in view while frames are quick", () => {
		expect(graphTop([frame(16.7), frame(17)])).toBe(40);
		expect(graphTop([])).toBe(40);
	});

	it("grows to hold a hitch, the GPU's time counted too", () => {
		expect(graphTop([frame(16), frame(70)])).toBe(80);
		expect(graphTop([frame(16, [30, 50, 10])])).toBe(160);
		expect(graphTop([frame(5000)])).toBe(320);
	});

	it("places milliseconds from the top edge, clamped to the graph", () => {
		expect(graphY(0, 40, 80)).toBe(80);
		expect(graphY(20, 40, 80)).toBe(40);
		expect(graphY(400, 40, 80)).toBe(0);
		expect(graphY(Number.NaN, 40, 80)).toBe(80);
	});
});
