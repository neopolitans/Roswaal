/**
 * Writing scripts back into a place.
 *
 * **Only a script's source changes, and nothing else is touched.** A binary
 * place is copied chunk for chunk: the one chunk per script class that holds
 * `Source` is rebuilt, LZ4-compressed as Rojo writes its builds, and every
 * other chunk -- parts, meshes, lighting, the properties this reader does not
 * even decode -- goes out as the exact bytes it came in as. An XML place has
 * the text of each changed `Source` element replaced and the rest of the file
 * left as written.
 *
 * Adding instances is not done here. A new script means a value of every
 * property its class carries, for the new instance, in the file's own layout;
 * that is its own piece of work, and a place that half-gained a script would
 * be worse than one that did not gain it.
 */

import { isBinaryRbx } from "./binary.js";
import { type RbxDocument, RbxError, type RbxInstance, SCRIPT_CLASSES } from "./dom.js";
import { lz4Compress, lz4Decompress } from "./lz4.js";
import { parseXml, type XmlElement } from "./xml.js";
import { isZstd, zstdDecompress } from "./zstd.js";

export interface SourceChange {
	inst: RbxInstance;
	source: string;
}

/** The place, with each change's script holding its new source. */
export function writeSources(bytes: Uint8Array, doc: RbxDocument, changes: readonly SourceChange[]): Uint8Array {
	if (changes.length === 0) return bytes.slice();
	for (const change of changes) {
		if (change.inst.ref === undefined) throw new RbxError(`"${change.inst.name}" has no identity in the file`);
		if (!SCRIPT_CLASSES.has(change.inst.className)) throw new RbxError(`"${change.inst.name}" is not a script`);
	}
	if (doc.format === "binary") {
		if (!isBinaryRbx(bytes)) throw new RbxError("the document was read from a different file");
		return writeBinary(bytes, changes);
	}
	return writeXml(new TextDecoder().decode(bytes), changes);
}

const utf8 = new TextEncoder();

function u32(b: Uint8Array, o: number): number {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function putU32(out: Uint8Array, o: number, v: number): void {
	out[o] = v & 255;
	out[o + 1] = (v >>> 8) & 255;
	out[o + 2] = (v >>> 16) & 255;
	out[o + 3] = (v >>> 24) & 255;
}

/** Delta-encoded, zigzagged, transposed referents, as an INST chunk lists them. */
function referents(b: Uint8Array, o: number, count: number): number[] {
	const out: number[] = [];
	let acc = 0;
	for (let i = 0; i < count; i++) {
		const raw = ((b[o + i] << 24) | (b[o + count + i] << 16) | (b[o + 2 * count + i] << 8) | b[o + 3 * count + i]) >>> 0;
		acc += (raw >>> 1) ^ -(raw & 1);
		out.push(acc);
	}
	return out;
}

function writeBinary(bytes: Uint8Array, changes: readonly SourceChange[]): Uint8Array {
	const bySource = new Map<number, string>();
	for (const change of changes) bySource.set(change.inst.ref as number, change.source);

	const parts: Uint8Array[] = [bytes.subarray(0, 32)];
	/** Class id to its referents, for the script classes only. */
	const scriptClasses = new Map<number, number[]>();
	let p = 32;
	let written = 0;

	while (p + 16 <= bytes.length) {
		const name = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
		const compressed = u32(bytes, p + 4);
		const length = u32(bytes, p + 8);
		const size = compressed === 0 ? length : compressed;
		const whole = bytes.subarray(p, p + 16 + size);
		const raw = bytes.subarray(p + 16, p + 16 + size);
		p += 16 + size;

		if (name !== "INST" && name !== "PROP") {
			parts.push(whole);
			if (name === "END\0") break;
			continue;
		}
		const data = compressed === 0 ? raw : isZstd(raw) ? zstdDecompress(raw, length) : lz4Decompress(raw, length);
		const classId = u32(data, 0);
		const nameLength = u32(data, 4);
		const label = new TextDecoder().decode(data.subarray(8, 8 + nameLength));

		if (name === "INST") {
			if (SCRIPT_CLASSES.has(label)) {
				const count = u32(data, 8 + nameLength + 1);
				scriptClasses.set(classId, referents(data, 8 + nameLength + 5, count));
			}
			parts.push(whole);
			continue;
		}

		const refs = scriptClasses.get(classId);
		const type = data[8 + nameLength];
		if (!refs || label !== "Source" || (type !== 1 && type !== 29) || !refs.some((r) => bySource.has(r))) {
			parts.push(whole);
			continue;
		}

		// The one chunk that changes: every script of this class's source, in
		// the order the class lists them, with the changed ones replaced.
		const values: Uint8Array[] = [];
		let at = 8 + nameLength + 1;
		for (const ref of refs) {
			const n = u32(data, at);
			const old = data.subarray(at + 4, at + 4 + n);
			at += 4 + n;
			const next = bySource.get(ref);
			if (next !== undefined) written++;
			values.push(next === undefined ? old : utf8.encode(next));
		}
		const head = data.subarray(0, 8 + nameLength + 1);
		const payload = new Uint8Array(head.length + values.reduce((sum, v) => sum + 4 + v.length, 0));
		payload.set(head, 0);
		let o = head.length;
		for (const v of values) {
			putU32(payload, o, v.length);
			payload.set(v, o + 4);
			o += 4 + v.length;
		}
		const packed = lz4Compress(payload);
		const chunk = new Uint8Array(16 + packed.length);
		chunk.set(utf8.encode("PROP"), 0);
		putU32(chunk, 4, packed.length);
		putU32(chunk, 8, payload.length);
		putU32(chunk, 12, 0);
		chunk.set(packed, 16);
		parts.push(chunk);
	}
	if (written !== bySource.size) {
		throw new RbxError(`only ${written} of ${bySource.size} scripts were found in the file`);
	}

	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let o = 0;
	for (const part of parts) {
		out.set(part, o);
		o += part.length;
	}
	return out;
}

/** Text as CDATA, with any `]]>` in it split across two sections. */
function cdata(text: string): string {
	return `<![CDATA[${text.split("]]>").join("]]]]><![CDATA[>")}]]>`;
}

function writeXml(source: string, changes: readonly SourceChange[]): Uint8Array {
	const bySource = new Map<string, string>();
	for (const change of changes) bySource.set(String(change.inst.ref), change.source);

	const splices: { start: number; end: number; text: string }[] = [];
	const visit = (el: XmlElement) => {
		if (el.name === "Item" && el.attrs.referent !== undefined && bySource.has(el.attrs.referent)) {
			const props = el.children.find((c) => c.name === "Properties");
			const target = props?.children.find((c) => c.attrs.name === "Source" && (c.name === "ProtectedString" || c.name === "string"));
			if (!target) throw new RbxError(`"${el.attrs.referent}" has no Source to write`);
			splices.push({ start: target.start, end: target.end, text: cdata(bySource.get(el.attrs.referent)!) });
		}
		el.children.forEach(visit);
	};
	visit(parseXml(source));
	if (splices.length !== bySource.size) {
		throw new RbxError(`only ${splices.length} of ${bySource.size} scripts were found in the file`);
	}

	// From the end, so each splice leaves the offsets before it where they were.
	splices.sort((a, b) => b.start - a.start);
	let out = source;
	for (const s of splices) out = out.slice(0, s.start) + s.text + out.slice(s.end);
	return utf8.encode(out);
}
