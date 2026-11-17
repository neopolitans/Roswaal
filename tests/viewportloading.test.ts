/**
 * A place loading without holding the page: the lights' grid made quickly and
 * the same as it always was, textures handed over a few a frame, and base64
 * decoded by the browser's own decoder where there is one.
 */

import { describe, expect, it } from "vitest";
import { lightGridFor } from "../src/app/viewport/prepare.js";
import { trickle } from "../src/app/viewport/trickle.js";
import {
	LIGHT_CELL,
	LIGHT_TABLE,
	lightGrid,
	lightHash,
	surfaceBox,
} from "../src/app/viewport/view.js";
import { fromBase64, fromBase64ByHand, toBase64 } from "../src/core/base64.js";
import { LIGHT_STRIDE, LIGHT_SURFACE } from "../src/core/rbx/scene.js";

/** Whether a cell's cube meets a SurfaceLight's box, worked out plainly. */
function cellMeetsBox(
	box: { mid: number[]; axes: number[][]; half: number[] },
	cell: number[],
): boolean {
	const centre = cell.map((k) => k * LIGHT_CELL + LIGHT_CELL / 2);
	const offset = centre.map((v, a) => v - box.mid[a]);
	return box.axes.every((axis, k) => {
		const along = Math.abs(offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2]);
		const cube = (LIGHT_CELL / 2) * (Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2]));
		return along <= (box.half[k] + cube) * (1 + 1e-9);
	});
}

/** The grid as it was first written, Sets and all: what the quick one must match. */
function slowGrid(lights: readonly number[]) {
	const buckets = new Map<number, Set<number>>();
	const add = (h: number, i: number) => {
		let set = buckets.get(h);
		if (!set) buckets.set(h, (set = new Set()));
		set.add(i);
	};
	const count = lights.length / LIGHT_STRIDE;
	for (let i = 0; i < count; i++) {
		const o = i * LIGHT_STRIDE;
		const box = lights[o + 7] === LIGHT_SURFACE ? surfaceBox(lights, o) : undefined;
		if (box) {
			const reach = [0, 1, 2].map((w) =>
				box.axes.reduce((s, ax, k) => s + Math.abs(ax[w]) * box.half[k], 0),
			);
			const lo = box.mid.map((v, w) => Math.floor((v - reach[w]) / LIGHT_CELL));
			const hi = box.mid.map((v, w) => Math.floor((v + reach[w]) / LIGHT_CELL));
			for (let x = lo[0]; x <= hi[0]; x++)
				for (let y = lo[1]; y <= hi[1]; y++)
					for (let z = lo[2]; z <= hi[2]; z++)
						if (cellMeetsBox(box, [x, y, z])) add(lightHash(x, y, z), i);
			continue;
		}
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
					add(lightHash(x, y, z), i);
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

/** A face's frame: which way it faces, and its two half-sides square to that and each other. */
function frame(r: () => number): number[][] {
	const raw = [r() - 0.5, r() - 0.5, r() - 0.5];
	const len = Math.hypot(raw[0], raw[1], raw[2]) || 1;
	const n = raw.map((x) => x / len);
	const other = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
	const cross = (a: number[], b: number[]) => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
	const u0 = cross(n, other);
	const lu = Math.hypot(u0[0], u0[1], u0[2]);
	const u = u0.map((x) => x / lu);
	const v = cross(n, u);
	const su = 0.5 + r() * 40;
	const sv = 0.5 + r() * 3;
	return [n, u.map((x) => x * su), v.map((x) => x * sv)];
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
		const [n, u, v] = frame(r);
		// One SurfaceLight in eight has a face with no frame, as a broken file might give.
		const framed = i % 8 !== 4;
		for (let a = 0; a < 3; a++) {
			light[8 + a] = framed ? n[a] : 0;
			light[12 + a] = u[a];
			light[16 + a] = v[a];
		}
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

	it("lists a SurfaceLight on a wide face only in front of it, within its Range", () => {
		// A face `side` studs square at y 0, facing up, Range 60.
		const face = (side: number) => {
			const light = new Array(LIGHT_STRIDE).fill(0);
			light[3] = 60;
			light[7] = LIGHT_SURFACE;
			light[9] = 1;
			light[12] = side / 2;
			light[18] = side / 2;
			return light;
		};
		const { table, index } = lightGrid(face(64));
		const lists = (p: number[]) => {
			const h = lightHash(...(p.map((v) => Math.floor(v / LIGHT_CELL)) as [number, number, number]));
			return [...index.slice(table[h * 2], table[h * 2] + table[h * 2 + 1])];
		};
		expect(lists([0, 30, 0])).toEqual([0]);
		expect(lists([90, 10, -90])).toEqual([0]);
		expect(lists([0, 100, 0])).toEqual([]);
		expect(lists([0, -40, 0])).toEqual([]);
		expect(lists([200, 30, 0])).toEqual([]);
		// A face 512 studs square: some 45,000 hashes as a ball round its face, its slab's 7,400 or so.
		expect(lightGrid(face(512)).index.length).toBeLessThan(10_000);
	});

	it("lists every SurfaceLight in the cell of every point it lights", () => {
		const lights = someLights(60, 7);
		const { table, index } = lightGrid(lights);
		const r = random(11);
		for (let i = 0; i < 60; i++) {
			const o = i * LIGHT_STRIDE;
			if (lights[o + 7] !== LIGHT_SURFACE || !surfaceBox(lights, o)) continue;
			const at = [lights[o], lights[o + 1], lights[o + 2]];
			const out = [lights[o + 8], lights[o + 9], lights[o + 10]];
			const u = [lights[o + 12], lights[o + 13], lights[o + 14]];
			const v = [lights[o + 16], lights[o + 17], lights[o + 18]];
			const range = lights[o + 3];
			for (let s = 0; s < 400; s++) {
				const p = [0, 1, 2].map(
					(a) =>
						at[a] +
						(r() * 2 - 1) * (u[a] * 1.5 + v[a] * 1.5) +
						(r() * 2 - 1) * range * 1.2 * (a === 0 ? 1 : 0) +
						(r() * 2 - 1) * range * 1.2 * (a === 1 ? 1 : 0) +
						(r() * 2 - 1) * range * 1.2 * (a === 2 ? 1 : 0),
				);
				// As the shaders light it: in front, within Range of the face's nearest point.
				const off = p.map((x, a) => x - at[a]);
				const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
				if (dot(off, out) < 0.05) continue;
				const cu = Math.max(-1, Math.min(1, dot(off, u) / dot(u, u)));
				const cv = Math.max(-1, Math.min(1, dot(off, v) / dot(v, v)));
				const near = at.map((x, a) => x + u[a] * cu + v[a] * cv);
				if (Math.hypot(...near.map((x, a) => x - p[a])) >= range) continue;
				const h = lightHash(...(p.map((x) => Math.floor(x / LIGHT_CELL)) as [number, number, number]));
				const listed = index.slice(table[h * 2], table[h * 2] + table[h * 2 + 1]);
				expect(listed.includes(i)).toBe(true);
			}
		}
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
