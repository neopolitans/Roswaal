/**
 * A place loading without holding the page: the lights' grid made quickly and
 * the same as it always was, textures handed over a few a frame, and base64
 * decoded by the browser's own decoder where there is one.
 */

import { describe, expect, it } from "vitest";
import { lightGridFor } from "../src/app/viewport/prepare.js";
import { trickle } from "../src/app/viewport/trickle.js";
import { LIGHT_CELL, LIGHT_TABLE, lightGrid, lightHash } from "../src/app/viewport/view.js";
import { fromBase64, fromBase64ByHand, toBase64 } from "../src/core/base64.js";
import { LIGHT_STRIDE, LIGHT_SURFACE } from "../src/core/rbx/scene.js";

/** The grid as it was first written, Sets and all: what the quick one must match. */
function slowGrid(lights: readonly number[]) {
	const buckets = new Map<number, Set<number>>();
	const count = lights.length / LIGHT_STRIDE;
	for (let i = 0; i < count; i++) {
		const o = i * LIGHT_STRIDE;
		const c = [lights[o], lights[o + 1], lights[o + 2]];
		const face =
			lights[o + 7] === LIGHT_SURFACE
				? Math.hypot(lights[o + 12], lights[o + 13], lights[o + 14]) +
					Math.hypot(lights[o + 16], lights[o + 17], lights[o + 18])
				: 0;
		const reach = lights[o + 3] + face;
		const lo = c.map((v) => Math.floor((v - reach) / LIGHT_CELL));
		const hi = c.map((v) => Math.floor((v + reach) / LIGHT_CELL));
		for (let x = lo[0]; x <= hi[0]; x++)
			for (let y = lo[1]; y <= hi[1]; y++)
				for (let z = lo[2]; z <= hi[2]; z++) {
					const near = [x, y, z].map((k, a) =>
						Math.min(Math.max(c[a], k * LIGHT_CELL), (k + 1) * LIGHT_CELL),
					);
					if (Math.hypot(near[0] - c[0], near[1] - c[1], near[2] - c[2]) > reach) continue;
					const h = lightHash(x, y, z);
					let set = buckets.get(h);
					if (!set) buckets.set(h, (set = new Set()));
					set.add(i);
				}
	}
	const table = new Uint32Array(LIGHT_TABLE * 2);
	const index: number[] = [];
	for (const [h, set] of buckets) {
		table[h * 2] = index.length;
		table[h * 2 + 1] = set.size;
		index.push(...set);
	}
	return { table, index: new Uint32Array(index.length > 0 ? index : [0]) };
}

/** A repeatable stream of numbers in [0, 1). */
function random(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/** `count` lights, some SurfaceLights, some on a cell's edge exactly, some reaching a long way. */
function someLights(count: number, seed: number): number[] {
	const r = random(seed);
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const light = new Array(LIGHT_STRIDE).fill(0);
		const onEdge = i % 5 === 0;
		for (let a = 0; a < 3; a++)
			light[a] = onEdge ? Math.round(r() * 40 - 20) * LIGHT_CELL : r() * 2000 - 1000;
		// Ranges that meet a cell's corner exactly, and ones that do not.
		light[3] = i % 7 === 0 ? LIGHT_CELL : i % 3 === 0 ? 60 : 1 + r() * 40;
		light[7] = i % 4 === 0 ? LIGHT_SURFACE : 0;
		for (const at of [12, 13, 14, 16, 17, 18]) light[at] = r() * 6 - 3;
		out.push(...light);
	}
	return out;
}

describe("the lights' grid", () => {
	it("is the same, hash for hash and light for light, as it was", () => {
		for (const [count, seed] of [
			[1, 1],
			[40, 2],
			[300, 3],
		]) {
			const lights = someLights(count, seed);
			const quick = lightGrid(lights);
			const slow = slowGrid(lights);
			expect(quick.index.length).toBe(slow.index.length);
			expect(Buffer.from(quick.table.buffer).equals(Buffer.from(slow.table.buffer))).toBe(true);
			expect(Buffer.from(quick.index.buffer).equals(Buffer.from(slow.index.buffer))).toBe(true);
		}
	});

	it("lists lights crowded into one cell once each, in order", () => {
		const lights = [...someLights(1, 9), ...someLights(1, 9), ...someLights(1, 9)];
		expect(lightGrid(lights)).toEqual(slowGrid(lights));
	});

	it("is made once for a place's lights, and kept with them", () => {
		const lights = someLights(10, 4);
		expect(lightGridFor(lights)).toBe(lightGridFor(lights));
		expect(lightGridFor([...lights])).not.toBe(lightGridFor(lights));
		expect(lightGridFor(undefined).index.length).toBe(1);
	});
});

describe("textures handed over a few a frame", () => {
	/** A clock moved by hand, and the frames waited for. */
	function frames() {
		let now = 0;
		const waiting: (() => void)[] = [];
		return {
			now: () => now,
			later: (run: () => void) => waiting.push(run),
			pass: (ms: number) => {
				now += ms;
			},
			async frame() {
				const run = waiting.splice(0);
				for (const r of run) r();
				await new Promise((resolve) => setTimeout(resolve, 0));
			},
		};
	}

	it("runs as many as fit in its budget, then waits for the next frame", async () => {
		const f = frames();
		const t = trickle({ budget: 8, now: f.now, later: f.later });
		const ran: number[] = [];
		for (let i = 0; i < 5; i++)
			t.add(() => {
				ran.push(i);
				f.pass(3);
			});
		await new Promise((resolve) => setTimeout(resolve, 0));
		// 0, 1 and 2 take 9 ms between them: the budget is spent after the third.
		expect(ran).toEqual([0, 1, 2]);
		expect(t.waiting).toBe(2);
		await f.frame();
		expect(ran).toEqual([0, 1, 2, 3, 4]);
		expect(t.waiting).toBe(0);
	});

	it("waits for an async job before the next, and goes on past one that fails", async () => {
		const f = frames();
		const t = trickle({ budget: 100, now: f.now, later: f.later });
		const ran: string[] = [];
		let finish: () => void = () => undefined;
		t.add(
			() =>
				new Promise<void>((resolve) => {
					finish = () => {
						ran.push("slow");
						resolve();
					};
				}),
		);
		t.add(() => {
			throw new Error("broken");
		});
		t.add(() => ran.push("after"));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(ran).toEqual([]);
		finish();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(ran).toEqual(["slow", "after"]);
	});

	it("starts again for a job added once it has drained", async () => {
		const f = frames();
		const t = trickle({ now: f.now, later: f.later });
		const ran: number[] = [];
		t.add(() => ran.push(1));
		await new Promise((resolve) => setTimeout(resolve, 0));
		t.add(() => ran.push(2));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(ran).toEqual([1, 2]);
	});
});

describe("base64", () => {
	it("decodes the same with the native decoder as by hand", () => {
		const r = random(5);
		for (const length of [0, 1, 2, 3, 4, 1000, 65537]) {
			const bytes = Uint8Array.from({ length }, () => Math.floor(r() * 256));
			const text = toBase64(bytes);
			expect([...fromBase64(text)]).toEqual([...bytes]);
			expect([...fromBase64ByHand(text)]).toEqual([...bytes]);
		}
	});
});
