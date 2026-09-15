/**
 * Wire routing.
 *
 * Three styles. `rigid` turns at right angles; `angular` leaves its pin level,
 * takes one straight run, and arrives level — a diagonal rather than a corner
 * treatment, which is what it was until 0.47.0 and was not what the shape is
 * for. Where a diagonal cannot be drawn, because the input is behind the
 * output, angular falls back to rigid's lane with its corners cut.
 *
 * The properties tested here are the ones a reader would otherwise take on
 * trust from the name: that `rigid` really has no diagonals, that `angular`
 * really is one straight run between two stubs, and that no corner treatment
 * ever makes a wire double back on itself.
 */

import { describe, expect, it } from "vitest";

import { wirePath, type Vec, type WireStyle } from "../src/app/geometry.js";
import { NODE } from "../src/app/layers.js";

/**
 * The points of a path, in order.
 *
 * Both rigid styles emit only `M` and `L`, so a path is its vertices and
 * nothing is hidden in a curve. A `C` in here would be a bug rather than
 * something to parse.
 */
function points(d: string): Vec[] {
	expect(d, "a rigid wire should contain no curves").not.toMatch(/[CQAS]/);
	return [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => ({
		x: Number(m[1]),
		y: Number(m[2]),
	}));
}

/** Every segment, as its own delta. */
function segments(d: string): Vec[] {
	const p = points(d);
	return p.slice(1).map((point, i) => ({ x: point.x - p[i].x, y: point.y - p[i].y }));
}

const EPSILON = 0.05;
const axisAligned = (s: Vec) => Math.abs(s.x) < EPSILON || Math.abs(s.y) < EPSILON;
const degenerate = (s: Vec) => Math.hypot(s.x, s.y) < EPSILON;

/** The cases a wire actually meets on a canvas. */
const CASES: { name: string; from: Vec; to: Vec }[] = [
	{ name: "straight across", from: { x: 0, y: 0 }, to: { x: 300, y: 0 } },
	{ name: "down and across", from: { x: 0, y: 0 }, to: { x: 300, y: 140 } },
	{ name: "up and across", from: { x: 0, y: 200 }, to: { x: 300, y: 40 } },
	{ name: "a short hop", from: { x: 0, y: 0 }, to: { x: 60, y: 18 } },
	{ name: "backwards, a loop", from: { x: 400, y: 100 }, to: { x: 80, y: 260 } },
	{ name: "backwards at the same height", from: { x: 400, y: 100 }, to: { x: 80, y: 100 } },
	{ name: "barely apart", from: { x: 0, y: 0 }, to: { x: 8, y: 4 } },
];

const STYLES: WireStyle[] = ["curved", "rigid", "angular"];

describe("every style", () => {
	it("starts at the output pin and ends at the input pin", () => {
		for (const style of STYLES) {
			for (const c of CASES) {
				const d = wirePath(c.from, c.to, style);
				expect(d, `${style} / ${c.name}`).toMatch(
					new RegExp(`^M\\s*${c.from.x}\\s+${c.from.y}\\b`),
				);
				expect(d, `${style} / ${c.name}`).toMatch(
					new RegExp(`${c.to.x}\\s+${c.to.y}\\s*$`),
				);
			}
		}
	});

	/**
	 * Curved is the default and has to stay so. Everything that does not pass a
	 * style — the documentation's node previews, and the static site builder —
	 * depends on it, and a reference page should draw a wire the way the
	 * reference draws a wire rather than however the last person to build the
	 * site had their editor set.
	 */
	it("defaults to curved", () => {
		expect(wirePath({ x: 0, y: 0 }, { x: 200, y: 60 })).toBe(
			wirePath({ x: 0, y: 0 }, { x: 200, y: 60 }, "curved"),
		);
		expect(wirePath({ x: 0, y: 0 }, { x: 200, y: 60 })).toContain("C");
	});
});

describe("rigid", () => {
	it("bends at right angles and nowhere else", () => {
		for (const c of CASES) {
			for (const s of segments(wirePath(c.from, c.to, "rigid"))) {
				if (degenerate(s)) continue;
				expect(axisAligned(s), `${c.name}: segment (${s.x}, ${s.y}) is not axis-aligned`)
					.toBe(true);
			}
		}
	});

	it("leaves the output rightwards and enters the input leftwards", () => {
		for (const c of CASES) {
			const p = points(wirePath(c.from, c.to, "rigid"));
			expect(p[1].x, `${c.name}: first move`).toBeGreaterThan(p[0].x);
			const last = p[p.length - 1];
			expect(last.x, `${c.name}: last move`).toBeGreaterThan(p[p.length - 2].x);
		}
	});

	/**
	 * The detour a backwards wire has to take. Without the lane offset, two pins
	 * at the same height collapse the whole route onto one straight line
	 * *through* both nodes — which reads as a wire passing behind them rather
	 * than as one going back.
	 */
	/**
	 * Nodes set close together still wire straight across. A gap shorter than
	 * two stubs used to take the backwards detour, and drew a loop between two
	 * nodes whose pins faced each other.
	 */
	it("takes a short forward gap directly rather than round a loop", () => {
		const p = points(wirePath({ x: 0, y: 0 }, { x: 24, y: 60 }, "rigid"));
		expect(p).toHaveLength(4);
		for (let i = 1; i < p.length; i++) expect(p[i].x).toBeGreaterThanOrEqual(p[i - 1].x);
	});

	it("steps a backwards wire out of line even when its pins are level", () => {
		const level = points(wirePath({ x: 400, y: 100 }, { x: 80, y: 100 }, "rigid"));
		expect(level.length).toBeGreaterThan(2);
		const ys = level.map((p) => p.y);
		expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(NODE.wireBackstep);
	});
});

describe("angular", () => {
	/**
	 * The shape the name promises: out level, one straight run, in level.
	 *
	 * Four points, and the middle run is the only thing that is not horizontal.
	 * It drew a chamfered right angle for eleven releases — which passes a test
	 * about 45-degree corners and is not the style anybody was asking for.
	 */
	it("is one straight run between two level stubs", () => {
		const path = points(wirePath({ x: 0, y: 0 }, { x: 300, y: 140 }, "angular"));
		expect(path).toHaveLength(4);
		expect(path[0]).toEqual({ x: 0, y: 0 });
		expect(path[1]).toEqual({ x: NODE.wireStub, y: 0 });
		expect(path[2]).toEqual({ x: 300 - NODE.wireStub, y: 140 });
		expect(path[3]).toEqual({ x: 300, y: 140 });
	});

	it("leaves and arrives level with the pins", () => {
		for (const c of CASES) {
			const segs = segments(wirePath(c.from, c.to, "angular"));
			expect(axisAligned(segs[0]), `${c.name}: leaves at an angle`).toBe(true);
			expect(
				axisAligned(segs[segs.length - 1]),
				`${c.name}: arrives at an angle`,
			).toBe(true);
		}
	});

	/** Two pins on one line is one line, not a line with two points added. */
	it("draws level pins as a single run", () => {
		expect(points(wirePath({ x: 0, y: 0 }, { x: 300, y: 0 }, "angular"))).toHaveLength(2);
	});

	/**
	 * The stub shrinks rather than overlapping its partner. Two full stubs on a
	 * hop shorter than both would send the middle run backwards, which is the
	 * one thing a wire must never look like it is doing.
	 */
	it("shortens its stubs on a hop too small for them", () => {
		const path = points(wirePath({ x: 0, y: 0 }, { x: 20, y: 30 }, "angular"));
		expect(path[1].x).toBeLessThanOrEqual(10);
		expect(path[1].x).toBeGreaterThan(0);
		expect(path[2].x).toBeGreaterThanOrEqual(10);
	});

	/**
	 * Backwards there is no straight line that does not cross the node it came
	 * from, so the lane is the honest answer — and its corners are cut, which is
	 * the one place the old chamfer still earns its keep.
	 */
	it("keeps rigid's lane when the input is behind the output", () => {
		const back = { from: { x: 400, y: 100 }, to: { x: 80, y: 260 } };
		const rigid = points(wirePath(back.from, back.to, "rigid"));
		const angular = points(wirePath(back.from, back.to, "angular"));
		expect(angular[0]).toEqual(rigid[0]);
		expect(angular[angular.length - 1]).toEqual(rigid[rigid.length - 1]);
		// One sharp corner becomes two chamfer points.
		expect(angular.length).toBe(rigid.length + (rigid.length - 2));
	});

	/**
	 * A chamfer is clamped to half the shorter adjoining segment. Without that
	 * clamp two short runs would each have the full cut taken out of them, the
	 * cuts would overlap, and the wire would double back — most likely on the
	 * short hops, which is where a graph is densest.
	 */
	it("never lets a corner cut reverse the run it is cutting into", () => {
		for (const c of CASES) {
			const segs = segments(wirePath(c.from, c.to, "angular"));
			for (let i = 1; i < segs.length; i++) {
				const previous = segs[i - 1];
				const current = segs[i];
				if (degenerate(previous) || degenerate(current)) continue;
				// Two consecutive segments may turn, but never fold back onto the
				// direction they just came from.
				const dot = previous.x * current.x + previous.y * current.y;
				const magnitude = Math.hypot(previous.x, previous.y) * Math.hypot(current.x, current.y);
				expect(dot / magnitude, `${c.name}: segment ${i} doubles back`).toBeGreaterThan(-0.5);
			}
		}
	});
});
