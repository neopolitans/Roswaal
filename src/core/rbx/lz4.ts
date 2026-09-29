/**
 * LZ4 block decompression: how Roblox compresses the chunks of a model, and of
 * a place built by Rojo. Studio's own place saves use zstd (`zstd.ts`).
 *
 * The block format only -- no frame, no checksum. The place format gives each
 * chunk's decompressed length, so the output is sized once and a block that
 * does not fill it exactly is refused.
 */

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
		if (d + literals > length || s + literals > src.length) throw new Error("an LZ4 block that runs past its end");
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
		if (offset === 0 || offset > d || d + match > length) throw new Error("an LZ4 match outside the block");
		let from = d - offset;
		for (let i = 0; i < match; i++) out[d++] = out[from++];
	}
	if (d !== length) throw new Error(`an LZ4 block of ${d} bytes where ${length} were promised`);
	return out;
}
