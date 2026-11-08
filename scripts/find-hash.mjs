/**
 * Finds the constants for the viewport shaders' hash, `mixBits`, by search.
 *
 * Usage: node scripts/find-hash.mjs [candidates]
 *
 * The shaders want a random-looking number for each cell of a pattern. The
 * usual one-liners carry constants copied from snippet to snippet, of no clear
 * origin. These are Roswaal's own: a fixed seed draws candidate shifts and odd
 * multipliers for the shape
 *
 *     x ^= x >> a; x *= b; x ^= x >> c; x *= d; x ^= x >> e;
 *
 * and each is scored by its avalanche: flipping any one input bit should flip
 * each output bit half the time. The score is the root mean square of how far
 * every bit pair strays from a half, times a thousand. The lowest wins, and
 * the same seed always finds the same constants.
 */

import { pathToFileURL } from "node:url";

const CANDIDATES = Number(process.argv[2] ?? 3000);
const SAMPLES = 2048;

/** A small seeded generator, so the search can be run again and agree. */
function generator(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x9e3779b9) >>> 0;
		let z = s;
		z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
		z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
		return (z ^ (z >>> 15)) >>> 0;
	};
}

export function mixer([a, b, c, d, e]) {
	return (v) => {
		let x = v >>> 0;
		x ^= x >>> a;
		x = Math.imul(x, b);
		x ^= x >>> c;
		x = Math.imul(x, d);
		x ^= x >>> e;
		return x >>> 0;
	};
}

/** How far the mixer's avalanche is from perfect: 0 is ideal. */
export function bias(mix, samples = SAMPLES, seed = 1) {
	const next = generator(seed);
	const flips = new Float64Array(32 * 32);
	for (let n = 0; n < samples; n++) {
		const x = next();
		const h = mix(x);
		for (let i = 0; i < 32; i++) {
			let changed = (h ^ mix(x ^ (1 << i))) >>> 0;
			for (let j = 0; j < 32; j++, changed >>>= 1) flips[i * 32 + j] += changed & 1;
		}
	}
	let sum = 0;
	for (const f of flips) sum += (f / samples - 0.5) ** 2;
	return Math.sqrt(sum / flips.length) * 1000;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const draw = generator(0x524f5357); // "ROSW"
	const shift = () => 13 + (draw() % 6); // 13 to 18
	let best = null;
	for (let n = 0; n < CANDIDATES; n++) {
		const k = [shift(), (draw() | 1) >>> 0, shift(), (draw() | 1) >>> 0, shift()];
		const score = bias(mixer(k), 512);
		if (!best || score < best.score) best = { k, score };
	}
	// The winner, scored again on more samples than the search could afford.
	const final = bias(mixer(best.k), 1 << 15);
	const hex = (n) => `0x${n.toString(16).padStart(8, "0")}`;
	console.log(
		`shifts ${best.k[0]}, ${best.k[2]}, ${best.k[4]}; multipliers ${hex(best.k[1])}, ${hex(best.k[3])}; bias ${final.toFixed(1)}`,
	);
}
