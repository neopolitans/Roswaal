/**
 * Wire routing.
 *
 * Three styles, one router. `rigid` and `angular` are the *same* Manhattan
 * route drawn two ways — sharp corners or 45-degree chamfers — so most of what
 * is worth asserting is that the two agree about where the wire goes and differ
 * only in how it turns.
 *
 * The properties tested here are the ones a reader would otherwise have to take
 * on trust from the name: that `rigid` really has no diagonals, that `angular`'s
 * diagonals really are 45 degrees, and that a chamfer never overshoots the
 * segment it is cutting into — which would draw a wire that visibly doubles
 * back on itself.
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
	 * The claim the name makes. Anything not axis-aligned is a corner cut, and a
	 * corner cut is 45 degrees or it is not the thing being advertised.
	 */
	it("draws every diagonal at exactly 45 degrees", () => {
		for (const c of CASES) {
			for (const s of segments(wirePath(c.from, c.to, "angular"))) {
				if (degenerate(s) || axisAligned(s)) continue;
				expect(
					Math.abs(Math.abs(s.x) - Math.abs(s.y)),
					`${c.name}: segment (${s.x}, ${s.y}) is not 45 degrees`,
				).toBeLessThan(EPSILON);
			}
		}
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

	/**
	 * The two rigid styles are one route drawn two ways. If they disagreed about
	 * where a wire goes, changing style would move wires rather than restyle
	 * them — and a developer trying angular to see whether they like it would be
	 * comparing two different graphs.
	 */
	it("follows the same route as rigid", () => {
		for (const c of CASES) {
			const rigid = points(wirePath(c.from, c.to, "rigid"));
			const angular = points(wirePath(c.from, c.to, "angular"));
			// Every angular vertex lies on the rigid path's bounding shape: same
			// start, same end, same number of turns before chamfering.
			expect(angular[0]).toEqual(rigid[0]);
			expect(angular[angular.length - 1]).toEqual(rigid[rigid.length - 1]);
			// One sharp corner becomes two chamfer points.
			const corners = rigid.length - 2;
			expect(angular.length, c.name).toBe(rigid.length + corners);
		}
	});
});
