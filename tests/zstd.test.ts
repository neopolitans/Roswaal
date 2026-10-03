/**
 * The zstd decoder, held to Node's own.
 *
 * Node 24 compresses and decompresses zstd natively, so every case here is
 * made by `zstdCompressSync` at several levels and must come back byte for
 * byte. The inputs are chosen to reach each part of the format: raw and RLE
 * blocks, every literals mode, FSE-compressed and repeated sequence tables,
 * the repeat offsets, and frames larger than one block.
 */

import { constants, zstdCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { RbxError } from "../src/core/rbx/dom.js";
import { isZstd, zstdDecompress } from "../src/core/rbx/zstd.js";

const compress = (data: Uint8Array, level: number): Uint8Array =>
	new Uint8Array(
		zstdCompressSync(data, { params: { [constants.ZSTD_c_compressionLevel]: level } }),
	);

/** A deterministic pseudo-random source, so a failure reproduces. */
function random(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const text = (s: string) => new TextEncoder().encode(s);

function luauLike(lines: number, seed: number): Uint8Array {
	const r = random(seed);
	const words = [
		"local",
		"function",
		"end",
		"if",
		"then",
		"return",
		"game",
		"workspace",
		"Players",
		"Instance.new",
		"Vector3.new",
		"CFrame",
		"self",
		"nil",
		"true",
		"false",
	];
	let out = "";
	for (let i = 0; i < lines; i++) {
		const n = 2 + Math.floor(r() * 8);
		const parts: string[] = [];
		for (let k = 0; k < n; k++)
			parts.push(
				words[Math.floor(r() * words.length)] + (r() < 0.3 ? String(Math.floor(r() * 1000)) : ""),
			);
		out += "\t".repeat(Math.floor(r() * 4)) + parts.join(" ") + "\n";
	}
	return text(out);
}

function noise(length: number, seed: number): Uint8Array {
	const r = random(seed);
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i++) out[i] = Math.floor(r() * 256);
	return out;
}

/** Bytes shaped like a place's property arrays: runs, small integers, repeats. */
function propertyLike(length: number, seed: number): Uint8Array {
	const r = random(seed);
	const out = new Uint8Array(length);
	for (let i = 0; i < length; ) {
		const kind = r();
		const run = 1 + Math.floor(r() * 200);
		for (let k = 0; k < run && i < length; k++, i++) {
			out[i] =
				kind < 0.4
					? 0
					: kind < 0.7
						? Math.floor(r() * 8)
						: kind < 0.85
							? out[Math.max(0, i - 16)]
							: Math.floor(r() * 256);
		}
	}
	return out;
}

const CASES: [string, Uint8Array][] = [
	["empty", new Uint8Array(0)],
	["one byte", Uint8Array.of(42)],
	["a short string", text("Hello, Roswaal!")],
	["one byte repeated", new Uint8Array(100_000).fill(7)],
	["Luau-like text", luauLike(2_000, 1)],
	["a lot of Luau-like text", luauLike(40_000, 2)],
	["noise", noise(50_000, 3)],
	[
		"noise with repeats",
		(() => {
			const n = noise(4_000, 4);
			const out = new Uint8Array(200_000);
			for (let i = 0; i < out.length; i += n.length)
				out.set(n.subarray(0, Math.min(n.length, out.length - i)), i);
			return out;
		})(),
	],
	["property-like arrays", propertyLike(300_000, 5)],
	["small property-like arrays", propertyLike(700, 6)],
];

describe("zstd", () => {
	for (const [name, data] of CASES) {
		for (const level of [1, 3, 9, 19]) {
			it(`reads ${name} at level ${level}`, () => {
				const frame = compress(data, level);
				expect(isZstd(frame)).toBe(true);
				const back = zstdDecompress(frame, data.length);
				expect(back.length).toBe(data.length);
				expect(Buffer.from(back).equals(Buffer.from(data))).toBe(true);
			});
		}
	}

	it("reads without being told the size", () => {
		const data = luauLike(5_000, 7);
		expect(Buffer.from(zstdDecompress(compress(data, 3))).equals(Buffer.from(data))).toBe(true);
	});

	it("reads two frames one after the other", () => {
		const a = luauLike(300, 8);
		const b = propertyLike(3_000, 9);
		const both = new Uint8Array([...compress(a, 3), ...compress(b, 5)]);
		expect(
			Buffer.from(zstdDecompress(both)).equals(Buffer.from(new Uint8Array([...a, ...b]))),
		).toBe(true);
	});

	/**
	 * A frame cut off anywhere used to read past its end as empty blocks that
	 * were never the last, and the loop never finished.
	 */
	it("refuses a frame cut off anywhere, as a damaged place", () => {
		const data = luauLike(2_000, 10);
		const frame = compress(data, 3);
		for (let cut = 4; cut < frame.length; cut++) {
			let thrown: unknown;
			try {
				const back = zstdDecompress(frame.subarray(0, cut), data.length);
				// A cut inside the trailing checksum still holds every block.
				expect(Buffer.from(back).equals(Buffer.from(data))).toBe(true);
				continue;
			} catch (error) {
				thrown = error;
			}
			expect(thrown, `cut at ${cut} of ${frame.length}`).toBeInstanceOf(RbxError);
		}
	});

	/** It used to come back the right length, padded with zeros, and pass. */
	it("refuses a raw block shorter than it says", () => {
		const header = (100 << 3) | 1;
		const frame = Uint8Array.of(
			0x28,
			0xb5,
			0x2f,
			0xfd, // magic
			0x20,
			100, // single segment, content size 100
			header & 0xff,
			(header >> 8) & 0xff,
			header >> 16,
			1,
			2,
			3,
		);
		expect(() => zstdDecompress(frame, 100)).toThrow(RbxError);
	});

	it("refuses what is not zstd", () => {
		expect(isZstd(text("<roblox!"))).toBe(false);
		expect(() => zstdDecompress(text("not a frame at all"))).toThrow(/not a zstd frame/);
	});
});
