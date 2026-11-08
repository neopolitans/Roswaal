/**
 * The viewport's patterns are drawn from Roswaal's own hash, `mixBits`, whose
 * constants `scripts/find-hash.mjs` found by search rather than copied.
 *
 * Both renderers must carry the same constants, or a place would look
 * different under WebGPU and WebGL2; and the mixer must stay a good one, or
 * patterns would show stripes where they should look random.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { bias, mixer } from "../scripts/find-hash.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (file: string) => readFileSync(join(ROOT, "src/app/viewport", file), "utf8");

/** What `node scripts/find-hash.mjs` prints with its default search. */
const FOUND = [18, 0xe71d6283, 15, 0x1f04730d, 18] as const;

const hex = (n: number) => `0x${n.toString(16).padStart(8, "0")}u`;

describe("the viewport's hash", () => {
	for (const file of ["webgpu.ts", "webgl2.ts"]) {
		it(`is mixBits, with the searched constants, in ${file}`, () => {
			const text = source(file);
			const [a, b, c, d, e] = FOUND;
			const steps = [
				`x ^= x >> ${a}u;`,
				`x *= ${hex(b)};`,
				`x ^= x >> ${c}u;`,
				`x *= ${hex(d)};`,
				`x ^= x >> ${e}u;`,
			];
			let at = text.indexOf("mixBits(");
			expect(at).toBeGreaterThan(-1);
			for (const step of steps) {
				const next = text.indexOf(step, at);
				expect(next, step).toBeGreaterThan(at);
				at = next;
			}
		});

		it(`keeps none of the copied one-liners in ${file}`, () => {
			expect(source(file)).not.toMatch(/43758\.5453|12\.9898|311\.7/);
		});
	}

	it("flips each output bit about half the time for any input bit", () => {
		// The sampling floor at 4096 samples is about 7.8; a mixer with a flaw
		// scores in the hundreds.
		expect(bias(mixer(FOUND), 4096)).toBeLessThan(15);
	});

	it("spreads whole-number cells evenly from 0 up to 1", () => {
		const mix = mixer(FOUND);
		const toUnit = (h: number) => (h >>> 8) / 16777216;
		const buckets = new Array(10).fill(0);
		for (let y = -50; y < 50; y++)
			for (let x = -50; x < 50; x++) {
				const h = mix((x >>> 0) ^ mix(y >>> 0));
				buckets[Math.floor(toUnit(h) * 10)]++;
			}
		for (const count of buckets) expect(Math.abs(count - 1000)).toBeLessThan(120);
	});
});
