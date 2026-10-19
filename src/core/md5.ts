/**
 * MD5, for the one thing that needs it: a place's shared strings.
 *
 * Studio keys each shared string by the MD5 of its bytes, in the binary
 * format's SSTR chunk and in an XML place's `<SharedStrings>` table, so a
 * place Roswaal writes has to key them the same way. Not for anything that
 * needs to be secure: MD5 is not, and nothing here relies on it being so.
 *
 * Written here rather than taken from the platform because the web app has no
 * MD5: Web Crypto leaves it out.
 */

const S = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
	20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
	10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/** The sines MD5 is built on, as its specification derives them. */
const K = Array.from(
	{ length: 64 },
	(_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
);

/** The 16-byte MD5 of `bytes`. */
export function md5(bytes: Uint8Array): Uint8Array {
	// Padded to a multiple of 64 bytes: a 1 bit, zeros, and the length in bits.
	const length = bytes.length;
	const padded = new Uint8Array((((length + 8) >>> 6) + 1) * 64);
	padded.set(bytes);
	padded[length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
	view.setUint32(padded.length - 4, Math.floor(length / 2 ** 29) >>> 0, true);

	let a0 = 0x67452301;
	let b0 = 0xefcdab89;
	let c0 = 0x98badcfe;
	let d0 = 0x10325476;
	const m = new Uint32Array(16);
	for (let block = 0; block < padded.length; block += 64) {
		for (let i = 0; i < 16; i++) m[i] = view.getUint32(block + i * 4, true);
		let a = a0;
		let b = b0;
		let c = c0;
		let d = d0;
		for (let i = 0; i < 64; i++) {
			let f: number;
			let g: number;
			if (i < 16) {
				f = (b & c) | (~b & d);
				g = i;
			} else if (i < 32) {
				f = (d & b) | (~d & c);
				g = (5 * i + 1) % 16;
			} else if (i < 48) {
				f = b ^ c ^ d;
				g = (3 * i + 5) % 16;
			} else {
				f = c ^ (b | ~d);
				g = (7 * i) % 16;
			}
			const sum = (a + f + K[i] + m[g]) >>> 0;
			a = d;
			d = c;
			c = b;
			b = (b + ((sum << S[i]) | (sum >>> (32 - S[i])))) >>> 0;
		}
		a0 = (a0 + a) >>> 0;
		b0 = (b0 + b) >>> 0;
		c0 = (c0 + c) >>> 0;
		d0 = (d0 + d) >>> 0;
	}
	const out = new Uint8Array(16);
	const result = new DataView(out.buffer);
	[a0, b0, c0, d0].forEach((word, i) => result.setUint32(i * 4, word, true));
	return out;
}
