/**
 * Zstandard decompression, after RFC 8878.
 *
 * Studio compresses every chunk of a saved place with zstd, and a browser has
 * no zstd of its own -- `DecompressionStream` reads deflate and gzip -- so the
 * web app cannot open a place without this. Node has `zlib.zstdDecompressSync`,
 * and the tests hold this decoder to it; this one exists so the daemon and the
 * web app read a place through the same code.
 *
 * Decoding only. Roswaal writes places with LZ4 or stored chunks, which Studio
 * reads as readily, so there is no encoder to keep level with this.
 *
 * Not supported, and refused with a reason rather than guessed at: frames that
 * need a dictionary. Studio does not write them. The content checksum is
 * skipped rather than verified: each place chunk states its decompressed
 * length, and the reader checks that instead.
 */

class ZstdError extends Error {}

const FRAME_MAGIC = 0xfd2fb528;

/** True when the bytes start with a zstd frame. */
export function isZstd(bytes: Uint8Array): boolean {
	return bytes.length >= 4 && readU32(bytes, 0) === FRAME_MAGIC;
}

function readU32(b: Uint8Array, o: number): number {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function highBit(n: number): number {
	return 31 - Math.clz32(n);
}

// ---------------------------------------------------------------------------
// Bit streams

/**
 * A little-endian bit stream read front to back: the FSE table descriptions.
 */
class ForwardBits {
	private bit = 0;
	constructor(
		private readonly b: Uint8Array,
		private readonly start: number,
	) {}

	read(n: number): number {
		let value = 0;
		for (let got = 0; got < n; ) {
			const at = this.bit + got;
			const byte = this.b[this.start + (at >> 3)];
			if (byte === undefined) throw new ZstdError("a table description runs past the block");
			const off = at & 7;
			const take = Math.min(8 - off, n - got);
			value += ((byte >> off) & ((1 << take) - 1)) * 2 ** got;
			got += take;
		}
		this.bit += n;
		return value;
	}

	rewind(n: number): void {
		this.bit -= n;
	}

	/** Bytes used, counting a partly-read last byte as used. */
	get bytes(): number {
		return (this.bit + 7) >> 3;
	}
}

/**
 * A bit stream read back to front: Huffman streams, FSE-coded weights and the
 * sequences. The writer finishes each with a 1 bit above the last real bit, so
 * reading starts just below the highest set bit of the last byte.
 *
 * Reading past the front yields zeros and leaves `left` negative, which is how
 * the weight decoder knows it is done.
 */
class BackwardBits {
	/** Bits not yet read, counted up from the stream's first byte. */
	left: number;
	constructor(
		private readonly b: Uint8Array,
		private readonly start: number,
		end: number,
	) {
		if (end <= start) throw new ZstdError("an empty bit stream");
		const last = b[end - 1];
		if (last === 0) throw new ZstdError("a bit stream without its end marker");
		this.left = (end - 1 - start) * 8 + highBit(last);
	}

	private bits(from: number, n: number): number {
		let value = 0;
		for (let got = 0; got < n; ) {
			const at = from + got;
			if (at < 0) {
				got += Math.min(n - got, -at);
				continue;
			}
			const byte = this.b[this.start + (at >> 3)];
			const off = at & 7;
			const take = Math.min(8 - off, n - got);
			value += ((byte >> off) & ((1 << take) - 1)) * 2 ** got;
			got += take;
		}
		return value;
	}

	read(n: number): number {
		if (n === 0) return 0;
		this.left -= n;
		return this.bits(this.left, n);
	}

	peek(n: number): number {
		return this.bits(this.left - n, n);
	}

	skip(n: number): void {
		this.left -= n;
	}
}

// ---------------------------------------------------------------------------
// FSE

interface FseTable {
	log: number;
	symbol: Uint8Array;
	bits: Uint8Array;
	base: Uint16Array;
}

/** Reads a table description; returns the table and the bytes it took. */
function readFseTable(b: Uint8Array, start: number, maxLog: number, maxSymbol: number): [FseTable, number] {
	const input = new ForwardBits(b, start);
	const log = input.read(4) + 5;
	if (log > maxLog) throw new ZstdError(`an FSE table of accuracy ${log}, past ${maxLog}`);
	const freqs: number[] = [];
	let remaining = 1 << log;
	while (remaining > 0 && freqs.length <= maxSymbol) {
		const bits = highBit(remaining + 1) + 1;
		let value = input.read(bits);
		const lowerMask = (1 << (bits - 1)) - 1;
		const threshold = (1 << bits) - 1 - (remaining + 1);
		if ((value & lowerMask) < threshold) {
			input.rewind(1);
			value &= lowerMask;
		} else if (value > lowerMask) {
			value -= threshold;
		}
		const proba = value - 1;
		remaining -= Math.abs(proba);
		freqs.push(proba);
		if (proba === 0) {
			let repeat = input.read(2);
			for (;;) {
				for (let i = 0; i < repeat && freqs.length <= maxSymbol; i++) freqs.push(0);
				if (repeat !== 3) break;
				repeat = input.read(2);
			}
		}
	}
	if (remaining !== 0 || freqs.length > maxSymbol + 1) throw new ZstdError("an FSE table that does not add up");
	return [buildFseTable(freqs, log), input.bytes];
}

function buildFseTable(freqs: readonly number[], log: number): FseTable {
	const size = 1 << log;
	const symbol = new Uint8Array(size);
	const bits = new Uint8Array(size);
	const base = new Uint16Array(size);
	const next = new Array<number>(freqs.length).fill(0);

	// "Less than 1" probabilities take the last cells, one each.
	let high = size;
	for (let s = 0; s < freqs.length; s++) {
		if (freqs[s] === -1) {
			symbol[--high] = s;
			next[s] = 1;
		}
	}
	const step = (size >> 1) + (size >> 3) + 3;
	const mask = size - 1;
	let pos = 0;
	for (let s = 0; s < freqs.length; s++) {
		if (freqs[s] <= 0) continue;
		next[s] = freqs[s];
		for (let i = 0; i < freqs[s]; i++) {
			symbol[pos] = s;
			do pos = (pos + step) & mask;
			while (pos >= high);
		}
	}
	if (pos !== 0) throw new ZstdError("an FSE table that does not spread");
	for (let i = 0; i < size; i++) {
		const s = symbol[i];
		const state = next[s]++;
		bits[i] = log - highBit(state);
		base[i] = (state << bits[i]) - size;
	}
	return { log, symbol, bits, base };
}

function rleTable(s: number): FseTable {
	return { log: 0, symbol: Uint8Array.of(s), bits: Uint8Array.of(0), base: Uint16Array.of(0) };
}

// Predefined distributions, RFC 8878 section 3.1.1.3.2.2.
const LL_DEFAULT = buildFseTable(
	[4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1],
	6,
);
const ML_DEFAULT = buildFseTable(
	[
		1, 4, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
		1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1,
	],
	6,
);
const OF_DEFAULT = buildFseTable(
	[1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1],
	5,
);

// Baselines and extra bits for the literal length and match length codes.
const LL_BASE = [
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40, 48, 64, 128, 256, 512,
	1024, 2048, 4096, 8192, 16384, 32768, 65536,
];
const LL_BITS = [
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
];
const ML_BASE = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
	33, 34, 35, 37, 39, 41, 43, 47, 51, 59, 67, 83, 99, 131, 259, 515, 1027, 2051, 4099, 8195, 16387, 32771, 65539,
];
const ML_BITS = [
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2,
	3, 3, 4, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
];

// ---------------------------------------------------------------------------
// Huffman

interface HuffmanTable {
	maxBits: number;
	symbol: Uint8Array;
	bits: Uint8Array;
}

/** Reads a Huffman tree description; returns the table and the bytes it took. */
function readHuffmanTable(b: Uint8Array, start: number): [HuffmanTable, number] {
	const header = b[start];
	const weights: number[] = [];
	let used: number;
	if (header < 128) {
		// FSE-compressed weights, decoded with two interleaved states.
		const end = start + 1 + header;
		const [table, tableBytes] = readFseTable(b, start + 1, 6, 255);
		const input = new BackwardBits(b, start + 1 + tableBytes, end);
		let s1 = input.read(table.log);
		let s2 = input.read(table.log);
		for (;;) {
			weights.push(table.symbol[s1]);
			s1 = table.base[s1] + input.read(table.bits[s1]);
			if (input.left < 0) {
				weights.push(table.symbol[s2]);
				break;
			}
			weights.push(table.symbol[s2]);
			s2 = table.base[s2] + input.read(table.bits[s2]);
			if (input.left < 0) {
				weights.push(table.symbol[s1]);
				break;
			}
			if (weights.length > 255) throw new ZstdError("too many Huffman weights");
		}
		used = 1 + header;
	} else {
		const count = header - 127;
		for (let i = 0; i < count; i++) {
			const byte = b[start + 1 + (i >> 1)];
			weights.push(i % 2 === 0 ? byte >> 4 : byte & 15);
		}
		used = 1 + ((count + 1) >> 1);
	}

	// The last weight is implied: it brings the total to a power of two.
	let total = 0;
	for (const w of weights) if (w > 0) total += 1 << (w - 1);
	if (total === 0) throw new ZstdError("a Huffman tree with no weights");
	const maxBits = highBit(total) + 1;
	const leftover = (1 << maxBits) - total;
	if (leftover & (leftover - 1)) throw new ZstdError("a Huffman tree that does not close");
	weights.push(highBit(leftover) + 1);
	if (maxBits > 11) throw new ZstdError(`a Huffman code of ${maxBits} bits`);

	const lengths = weights.map((w) => (w > 0 ? maxBits + 1 - w : 0));
	const size = 1 << maxBits;
	const symbol = new Uint8Array(size);
	const bits = new Uint8Array(size);
	const rankCount = new Array<number>(maxBits + 2).fill(0);
	for (const l of lengths) rankCount[l]++;
	// Longest codes first, from index 0; each length's range fills in symbol order.
	const rankStart = new Array<number>(maxBits + 2).fill(0);
	rankStart[maxBits] = 0;
	for (let l = maxBits; l >= 1; l--) {
		rankStart[l - 1] = rankStart[l] + rankCount[l] * (1 << (maxBits - l));
		bits.fill(l, rankStart[l], rankStart[l - 1]);
	}
	for (let s = 0; s < lengths.length; s++) {
		const l = lengths[s];
		if (l === 0) continue;
		const span = 1 << (maxBits - l);
		symbol.fill(s, rankStart[l], rankStart[l] + span);
		rankStart[l] += span;
	}
	return [{ maxBits, symbol, bits }, used];
}

function decodeHuffmanStream(
	table: HuffmanTable,
	b: Uint8Array,
	start: number,
	end: number,
	out: Uint8Array,
	at: number,
	count: number,
): void {
	const input = new BackwardBits(b, start, end);
	for (let i = 0; i < count; i++) {
		const index = input.peek(table.maxBits);
		out[at + i] = table.symbol[index];
		input.skip(table.bits[index]);
	}
	if (input.left !== 0) throw new ZstdError("a Huffman stream with bits left over");
}

// ---------------------------------------------------------------------------
// Frames and blocks

interface FrameState {
	out: Uint8Array;
	length: number;
	huffman?: HuffmanTable;
	ll?: FseTable;
	of?: FseTable;
	ml?: FseTable;
	reps: [number, number, number];
}

function ensure(state: FrameState, more: number): void {
	const need = state.length + more;
	if (need <= state.out.length) return;
	const grown = new Uint8Array(Math.max(need, state.out.length * 2));
	grown.set(state.out.subarray(0, state.length));
	state.out = grown;
}

/**
 * Decompresses every frame in `input`, skippable frames included.
 *
 * `sizeHint` presizes the output; the place format gives each chunk's length,
 * so the common case never grows the buffer.
 */
export function zstdDecompress(input: Uint8Array, sizeHint = 0): Uint8Array {
	const state: FrameState = { out: new Uint8Array(sizeHint || input.length * 4), length: 0, reps: [1, 4, 8] };
	let p = 0;
	while (p < input.length) {
		const magic = readU32(input, p);
		if ((magic & 0xfffffff0) === 0x184d2a50) {
			p += 8 + readU32(input, p + 4);
			continue;
		}
		if (magic !== FRAME_MAGIC) throw new ZstdError("not a zstd frame");
		p = decodeFrame(input, p + 4, state);
	}
	return state.out.subarray(0, state.length);
}

function decodeFrame(b: Uint8Array, p: number, state: FrameState): number {
	const descriptor = b[p++];
	const fcsFlag = descriptor >> 6;
	const singleSegment = (descriptor >> 5) & 1;
	const checksum = (descriptor >> 2) & 1;
	const dictFlag = descriptor & 3;
	if (descriptor & 8) throw new ZstdError("a frame with its reserved bit set");
	if (!singleSegment) p++; // window descriptor: the whole output is kept anyway
	if (dictFlag !== 0) {
		const dictBytes = [0, 1, 2, 4][dictFlag];
		let id = 0;
		for (let i = 0; i < dictBytes; i++) id += b[p + i] * 2 ** (8 * i);
		if (id !== 0) throw new ZstdError("a frame that needs a dictionary");
		p += dictBytes;
	}
	const fcsBytes = fcsFlag === 0 ? singleSegment : [0, 2, 4, 8][fcsFlag];
	let contentSize = 0;
	for (let i = 0; i < fcsBytes; i++) contentSize += b[p + i] * 2 ** (8 * i);
	if (fcsBytes === 2) contentSize += 256;
	p += fcsBytes;
	if (fcsBytes > 0) ensure(state, contentSize);

	// Tables and repeat offsets belong to one frame.
	state.huffman = state.ll = state.of = state.ml = undefined;
	state.reps = [1, 4, 8];

	for (;;) {
		const header = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
		p += 3;
		const last = header & 1;
		const type = (header >> 1) & 3;
		const size = header >> 3;
		if (type === 0) {
			ensure(state, size);
			state.out.set(b.subarray(p, p + size), state.length);
			state.length += size;
			p += size;
		} else if (type === 1) {
			ensure(state, size);
			state.out.fill(b[p], state.length, state.length + size);
			state.length += size;
			p += 1;
		} else if (type === 2) {
			decodeBlock(b, p, p + size, state);
			p += size;
		} else {
			throw new ZstdError("a reserved block type");
		}
		if (last) break;
	}
	if (checksum) p += 4;
	return p;
}

function decodeBlock(b: Uint8Array, start: number, end: number, state: FrameState): void {
	const [literals, afterLiterals] = decodeLiterals(b, start, state);
	let p = afterLiterals;

	let count = b[p++];
	if (count === 255) {
		count = b[p] + (b[p + 1] << 8) + 0x7f00;
		p += 2;
	} else if (count >= 128) {
		count = ((count - 128) << 8) + b[p++];
	}
	if (count === 0) {
		ensure(state, literals.length);
		state.out.set(literals, state.length);
		state.length += literals.length;
		return;
	}

	const modes = b[p++];
	const pick = (mode: number, previous: FseTable | undefined, fallback: FseTable, maxLog: number, maxSymbol: number): FseTable => {
		switch (mode) {
			case 0:
				return fallback;
			case 1:
				return rleTable(b[p++]);
			case 2: {
				const [table, used] = readFseTable(b, p, maxLog, maxSymbol);
				p += used;
				return table;
			}
			default:
				if (!previous) throw new ZstdError("a repeated table with none before it");
				return previous;
		}
	};
	const ll = (state.ll = pick(modes >> 6, state.ll, LL_DEFAULT, 9, 35));
	const of = (state.of = pick((modes >> 4) & 3, state.of, OF_DEFAULT, 8, 31));
	const ml = (state.ml = pick((modes >> 2) & 3, state.ml, ML_DEFAULT, 9, 52));

	const input = new BackwardBits(b, p, end);
	let llState = input.read(ll.log);
	let ofState = input.read(of.log);
	let mlState = input.read(ml.log);
	const reps = state.reps;
	let lit = 0;

	for (let i = 0; i < count; i++) {
		const ofCode = of.symbol[ofState];
		const llCode = ll.symbol[llState];
		const mlCode = ml.symbol[mlState];
		if (llCode > 35 || mlCode > 52 || ofCode > 31) throw new ZstdError("a sequence code out of range");

		const ofValue = 2 ** ofCode + input.read(ofCode);
		const matchLength = ML_BASE[mlCode] + input.read(ML_BITS[mlCode]);
		const literalLength = LL_BASE[llCode] + input.read(LL_BITS[llCode]);

		let offset: number;
		if (ofValue > 3) {
			offset = ofValue - 3;
			reps[2] = reps[1];
			reps[1] = reps[0];
			reps[0] = offset;
		} else {
			const index = ofValue - 1 + (literalLength === 0 ? 1 : 0);
			if (index === 0) {
				offset = reps[0];
			} else {
				offset = index === 3 ? reps[0] - 1 : reps[index];
				if (index !== 1) reps[2] = reps[1];
				reps[1] = reps[0];
				reps[0] = offset;
			}
		}

		if (lit + literalLength > literals.length) throw new ZstdError("a sequence past its literals");
		ensure(state, literalLength + matchLength);
		const out = state.out;
		out.set(literals.subarray(lit, lit + literalLength), state.length);
		state.length += literalLength;
		lit += literalLength;
		if (offset === 0 || offset > state.length) throw new ZstdError("a match before the start of the output");
		let from = state.length - offset;
		for (let k = 0; k < matchLength; k++) out[state.length++] = out[from++];

		if (i < count - 1) {
			llState = ll.base[llState] + input.read(ll.bits[llState]);
			mlState = ml.base[mlState] + input.read(ml.bits[mlState]);
			ofState = of.base[ofState] + input.read(of.bits[ofState]);
		}
	}
	if (input.left !== 0) throw new ZstdError("a sequence stream with bits left over");

	const rest = literals.length - lit;
	ensure(state, rest);
	state.out.set(literals.subarray(lit), state.length);
	state.length += rest;
}

function decodeLiterals(b: Uint8Array, p: number, state: FrameState): [Uint8Array, number] {
	const b0 = b[p];
	const type = b0 & 3;
	const format = (b0 >> 2) & 3;

	if (type === 0 || type === 1) {
		let size: number;
		let header: number;
		if ((format & 1) === 0) {
			size = b0 >> 3;
			header = 1;
		} else if (format === 1) {
			size = (b0 >> 4) + (b[p + 1] << 4);
			header = 2;
		} else {
			size = (b0 >> 4) + (b[p + 1] << 4) + (b[p + 2] << 12);
			header = 3;
		}
		p += header;
		if (type === 0) return [b.subarray(p, p + size), p + size];
		return [new Uint8Array(size).fill(b[p]), p + 1];
	}

	let regenerated: number;
	let compressed: number;
	let header: number;
	const streams = format === 0 ? 1 : 4;
	if (format <= 1) {
		const h = b0 | (b[p + 1] << 8) | (b[p + 2] << 16);
		regenerated = (h >> 4) & 0x3ff;
		compressed = (h >> 14) & 0x3ff;
		header = 3;
	} else if (format === 2) {
		const h = (b0 | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
		regenerated = (h >>> 4) & 0x3fff;
		compressed = (h >>> 18) & 0x3fff;
		header = 4;
	} else {
		const h = (b0 | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
		const h40 = h + b[p + 4] * 2 ** 32;
		regenerated = Math.floor(h40 / 16) & 0x3ffff;
		compressed = Math.floor(h40 / 2 ** 22) & 0x3ffff;
		header = 5;
	}
	p += header;
	const end = p + compressed;

	if (type === 2) {
		const [table, used] = readHuffmanTable(b, p);
		state.huffman = table;
		p += used;
	} else if (!state.huffman) {
		throw new ZstdError("treeless literals with no tree before them");
	}
	const table = state.huffman;
	const out = new Uint8Array(regenerated);

	if (streams === 1) {
		decodeHuffmanStream(table, b, p, end, out, 0, regenerated);
	} else {
		const s1 = b[p] | (b[p + 1] << 8);
		const s2 = b[p + 2] | (b[p + 3] << 8);
		const s3 = b[p + 4] | (b[p + 5] << 8);
		const segment = Math.ceil(regenerated / 4);
		let at = p + 6;
		const sizes = [s1, s2, s3, end - at - s1 - s2 - s3];
		for (let i = 0; i < 4; i++) {
			const n = i < 3 ? segment : regenerated - 3 * segment;
			decodeHuffmanStream(table, b, at, at + sizes[i], out, i * segment, n);
			at += sizes[i];
		}
	}
	return [out, end];
}

export { ZstdError };
