/**
 * The binary format's chunks, as bytes: walking them, opening them and
 * sealing new ones, and the little-endian and transposed numbers inside.
 *
 * The reader, the writer and the adder each walk a place chunk by chunk and
 * each need a chunk's payload, whether it is stored, LZ4 or zstd. Written
 * once here, a damaged chunk is refused the same way by all three, and a
 * fourth compression would be one change.
 *
 * Not what a chunk means -- `binary.ts` decodes INST, PROP and PRNT -- only
 * how one is framed.
 */

import { RbxError } from "./dom.js";
import { lz4Compress, lz4Decompress } from "./lz4.js";
import { isZstd, ZSTD_MOST_PER_BYTE, zstdDecompress } from "./zstd.js";

/** A chunk as it stands in the file. */
export interface Chunk {
	/** Four characters: `INST`, `PROP`, `PRNT`, `SSTR`, `META`, `END\0`. */
	name: string;
	/** The chunk exactly as it came, header and all, for writing back untouched. */
	whole: Uint8Array;
	/** The stored payload: compressed, unless `compressed` is 0. */
	raw: Uint8Array;
	/** The compressed size, or 0 for a payload stored as it is. */
	compressed: number;
	/** The payload's size once opened. */
	length: number;
}

/** Where the chunks start: after the 32-byte header. */
export const FIRST_CHUNK = 32;

/** A little-endian u32 at `o`. */
export function u32(b: Uint8Array, o: number): number {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** Writes a little-endian u32 at `o`. */
export function putU32(out: Uint8Array, o: number, v: number): void {
	out[o] = v & 255;
	out[o + 1] = (v >>> 8) & 255;
	out[o + 2] = (v >>> 16) & 255;
	out[o + 3] = (v >>> 24) & 255;
}

/**
 * The most one chunk may open to. A chunk's header states its length, and
 * that much is set aside before any of it is read, so the length is held to
 * this first. Far past what a real place's chunk holds, and still a size any
 * machine the daemon or the web app runs on can set aside.
 */
export const LARGEST_CHUNK = 256 * 1024 * 1024;

/**
 * The most all of one file's chunks may open to together. They are opened one
 * at a time, so this is not what is held at once; it bounds how long reading
 * one file can take.
 */
export const LARGEST_PLACE = 4 * LARGEST_CHUNK;

/**
 * The most LZ4 can make of a byte: a length byte of 255 adds 255 to a match.
 * A little more is allowed for what a block's first token says on its own.
 */
const LZ4_MOST_PER_BYTE = 255;

/**
 * Every chunk from the header to `END`, which is the last one given. Throws
 * `RbxError` for a chunk that runs past the end of the file, for one that
 * says it opens to more than it could, and for a file that stops before its
 * `END`.
 */
export function readChunks(bytes: Uint8Array): Chunk[] {
	const out: Chunk[] = [];
	let p = FIRST_CHUNK;
	let total = 0;
	while (p + 16 <= bytes.length) {
		const name = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
		const compressed = u32(bytes, p + 4);
		const length = u32(bytes, p + 8);
		const size = compressed === 0 ? length : compressed;
		if (p + 16 + size > bytes.length)
			throw new RbxError(`the ${name.trim()} chunk runs past the end of the file`);
		const raw = bytes.subarray(p + 16, p + 16 + size);
		if (compressed !== 0) {
			const says = `the ${name.trim()} chunk says it opens to ${length} bytes`;
			const most = isZstd(raw)
				? compressed * ZSTD_MOST_PER_BYTE
				: compressed * LZ4_MOST_PER_BYTE + 64;
			if (length > LARGEST_CHUNK) throw new RbxError(`${says}, more than a place's chunk holds`);
			if (length > most)
				throw new RbxError(`${says}, more than its ${compressed} compressed bytes can`);
		}
		total += length;
		if (total > LARGEST_PLACE)
			throw new RbxError(
				`the file opens to more than ${LARGEST_PLACE / 2 ** 30} GiB, far more than a place holds`,
			);
		out.push({ name, whole: bytes.subarray(p, p + 16 + size), raw, compressed, length });
		p += 16 + size;
		if (name === "END\0") return out;
	}
	throw new RbxError("the file stops before its END chunk");
}

/**
 * A chunk's payload, opened: stored as it is, or LZ4, or zstd, as its own magic
 * says. Neither decompressor makes more than the length `readChunks` allowed.
 */
export function chunkData(chunk: Chunk): Uint8Array {
	if (chunk.compressed === 0) return chunk.raw;
	const data = isZstd(chunk.raw)
		? zstdDecompress(chunk.raw, chunk.length)
		: lz4Decompress(chunk.raw, chunk.length);
	if (data.length !== chunk.length)
		throw new RbxError(`the ${chunk.name.trim()} chunk decompressed to the wrong length`);
	return data;
}

/** A new chunk around `payload`, LZ4-compressed as Rojo writes its builds. */
export function sealChunk(name: string, payload: Uint8Array): Uint8Array {
	const packed = lz4Compress(payload);
	const out = new Uint8Array(16 + packed.length);
	out.set(new TextEncoder().encode(name.padEnd(4, "\0").slice(0, 4)), 0);
	putU32(out, 4, packed.length);
	putU32(out, 8, payload.length);
	putU32(out, 12, 0);
	out.set(packed, 16);
	return out;
}

/** A zigzagged integer back to its sign. */
export function unzigzag(v: number): number {
	return (v >>> 1) ^ -(v & 1);
}

/** An integer zigzagged, so small negatives stay small. */
export function zigzag(v: number): number {
	return ((v << 1) ^ (v >> 31)) >>> 0;
}

/** `count` transposed big-endian u32s at `at`: all the first bytes, then all the second. */
export function transposedU32s(b: Uint8Array, at: number, count: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		out.push(
			((b[at + i] << 24) |
				(b[at + count + i] << 16) |
				(b[at + 2 * count + i] << 8) |
				b[at + 3 * count + i]) >>>
				0,
		);
	}
	return out;
}

/** Referents as INST and PRNT list them: transposed, zigzagged, each the difference from the last. */
export function readReferents(b: Uint8Array, at: number, count: number): number[] {
	let acc = 0;
	return transposedU32s(b, at, count).map((raw) => (acc += unzigzag(raw)));
}

/** Text as XML CDATA, with any `]]>` in it split across two sections. */
export function cdata(text: string): string {
	return `<![CDATA[${text.split("]]>").join("]]]]><![CDATA[>")}]]>`;
}
