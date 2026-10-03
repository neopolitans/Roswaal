/**
 * LZ4 block decompression: how Roblox compresses the chunks of a model, and of
 * a place built by Rojo. Studio's own place saves use zstd (`zstd.ts`).
 *
 * The block format only -- no frame, no checksum. The place format gives each
 * chunk's decompressed length, so the output is sized once and a block that
 * does not fill it exactly is refused.
 */

import { RbxError } from "./dom.js";

export function lz4Decompress(src: Uint8Array, length: number): Uint8Array {
	const out = new Uint8Array(length);
	let s = 0;
	let d = 0;
	while (s < src.length) {
		const token = src[s++];
		let literals = token >> 4;
		if (literals === 15) {
			let b: number;
			do {
				b = src[s++];
				literals += b;
			} while (b === 255);
		}
		if (d + literals > length || s + literals > src.length) throw new RbxError("an LZ4 block that runs past its end");
		out.set(src.subarray(s, s + literals), d);
		s += literals;
		d += literals;
		if (s >= src.length) break;
		const offset = src[s] | (src[s + 1] << 8);
		s += 2;
		let match = token & 15;
		if (match === 15) {
			let b: number;
			do {
				b = src[s++];
				match += b;
			} while (b === 255);
		}
		match += 4;
		if (offset === 0 || offset > d || d + match > length) throw new RbxError("an LZ4 match outside the block");
		let from = d - offset;
		for (let i = 0; i < match; i++) out[d++] = out[from++];
	}
	if (d !== length) throw new RbxError(`an LZ4 block of ${d} bytes where ${length} were promised`);
	return out;
}

/**
 * LZ4 block compression, for the chunks the place writer rewrites.
 *
 * Greedy, one hash table, no search: a rewritten chunk is a few megabytes of
 * source at most, and what matters is that Studio reads it, not that it is
 * as small as Studio would have made it. The block rules are kept exactly --
 * no match starts in the last twelve bytes, and the last five are literals --
 * because a decoder is allowed to rely on them.
 */
export function lz4Compress(src: Uint8Array): Uint8Array {
	const n = src.length;
	const out = new Uint8Array(n + Math.ceil(n / 255) + 16);
	let o = 0;
	const lengthBytes = (value: number) => {
		while (value >= 255) {
			out[o++] = 255;
			value -= 255;
		}
		out[o++] = value;
	};
	const sequence = (from: number, to: number, offset: number, match: number) => {
		const literals = to - from;
		const matchCode = match > 0 ? match - 4 : 0;
		out[o++] = (Math.min(literals, 15) << 4) | (match > 0 ? Math.min(matchCode, 15) : 0);
		if (literals >= 15) lengthBytes(literals - 15);
		out.set(src.subarray(from, to), o);
		o += literals;
		if (match === 0) return;
		out[o++] = offset & 255;
		out[o++] = offset >> 8;
		if (matchCode >= 15) lengthBytes(matchCode - 15);
	};
	const read32 = (p: number) => src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24);

	const table = new Int32Array(1 << 16).fill(-1);
	let anchor = 0;
	let i = 0;
	const limit = n - 12;
	while (i < limit) {
		const word = read32(i);
		const h = Math.imul(word, 2654435761) >>> 16;
		const candidate = table[h];
		table[h] = i;
		if (candidate >= 0 && i - candidate <= 65535 && read32(candidate) === word) {
			let length = 4;
			const most = n - 5 - i;
			while (length < most && src[candidate + length] === src[i + length]) length++;
			sequence(anchor, i, i - candidate, length);
			i += length;
			anchor = i;
		} else {
			i++;
		}
	}
	sequence(anchor, n, 0, 0);
	return out.subarray(0, o);
}
