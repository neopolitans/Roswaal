/**
 * Adding instances to a place: new scripts, and the folders they need.
 *
 * Harder than changing a source, because every property of a class is stored
 * for every instance of it: a new Script needs a value in each of its class's
 * `PROP` chunks, in that chunk's layout. So this knows the layout of each
 * property type it writes, and **refuses** a class that carries one it does
 * not -- a place that half-gained a script is worse than one that did not.
 *
 * The values are chosen rather than copied: a fresh UniqueId, empty attributes
 * and tags, no capabilities, `SourceAssetId` -1. Only a property with no
 * obvious empty value -- a Folder's `IconTint` -- takes an existing instance's.
 * A class the file has no instance of yet gets chunks of its own, holding only
 * `Name` and `Source`; Studio fills in the rest with its defaults.
 *
 * Everything else in the file is kept as it came in, chunk for chunk.
 */

import { isBinaryRbx } from "./binary.js";
import {
	type Chunk,
	cdata,
	chunkData,
	FIRST_CHUNK,
	readChunks,
	readReferents,
	sealChunk,
	u32,
	zigzag,
} from "./chunks.js";
import { type RbxDocument, RbxError, type RbxInstance } from "./dom.js";
import { parseXml, type XmlElement } from "./xml.js";

/** An instance to create, under one in the file or one created before it. */
export interface NewInstance {
	className: string;
	name: string;
	/** For a script. */
	source?: string;
	parent: RbxInstance | NewInstance;
}

const isNew = (p: RbxInstance | NewInstance): p is NewInstance => !("children" in p);

export function addInstances(
	bytes: Uint8Array,
	doc: RbxDocument,
	added: readonly NewInstance[],
): Uint8Array {
	if (added.length === 0) return bytes.slice();
	if (doc.format === "binary") {
		if (!isBinaryRbx(bytes)) throw new RbxError("the document was read from a different file");
		return addBinary(bytes, added);
	}
	return addXml(new TextDecoder().decode(bytes), added);
}

// ---------------------------------------------------------------------------
// Bytes

const utf8 = new TextEncoder();
const text = new TextDecoder();

class Out {
	private parts: Uint8Array[] = [];
	private size = 0;
	bytes(b: Uint8Array) {
		this.parts.push(b);
		this.size += b.length;
	}
	u8(v: number) {
		this.bytes(Uint8Array.of(v & 255));
	}
	u32(v: number) {
		this.bytes(Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255));
	}
	string(s: string | Uint8Array) {
		const b = typeof s === "string" ? utf8.encode(s) : s;
		this.u32(b.length);
		this.bytes(b);
	}
	done(): Uint8Array {
		const out = new Uint8Array(this.size);
		let o = 0;
		for (const p of this.parts) {
			out.set(p, o);
			o += p.length;
		}
		return out;
	}
}

/** Values of `width` bytes each, transposed as the format stores them. */
function untranspose(b: Uint8Array, at: number, count: number, width: number): Uint8Array[] {
	const out: Uint8Array[] = [];
	for (let i = 0; i < count; i++) {
		const v = new Uint8Array(width);
		for (let k = 0; k < width; k++) v[k] = b[at + k * count + i];
		out.push(v);
	}
	return out;
}

function transpose(values: readonly Uint8Array[], width: number): Uint8Array {
	const n = values.length;
	const out = new Uint8Array(n * width);
	values.forEach((v, i) => {
		for (let k = 0; k < width; k++) out[k * n + i] = v[k];
	});
	return out;
}

const be32 = (v: number) =>
	Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);

function encodeReferents(refs: readonly number[]): Uint8Array {
	return transpose(
		refs.map((r, i) => be32(zigzag(i === 0 ? r : r - refs[i - 1]))),
		4,
	);
}

/**
 * How a property type is laid out, for the types a new instance can be given
 * a value of: fixed-width values in `arrays` transposed runs of `width` bytes,
 * or one length-prefixed string each, or one byte each.
 */
type Layout =
	| { kind: "fixed"; arrays: number; width: number }
	| { kind: "string" }
	| { kind: "byte" };

const LAYOUTS: Record<number, Layout> = {
	1: { kind: "string" }, // String
	29: { kind: "string" }, // ProtectedString
	2: { kind: "byte" }, // Bool
	3: { kind: "fixed", arrays: 1, width: 4 }, // Int32
	4: { kind: "fixed", arrays: 1, width: 4 }, // Float32
	11: { kind: "fixed", arrays: 1, width: 4 }, // BrickColor
	12: { kind: "fixed", arrays: 3, width: 4 }, // Color3
	18: { kind: "fixed", arrays: 1, width: 4 }, // Enum
	27: { kind: "fixed", arrays: 1, width: 8 }, // Int64
	28: { kind: "fixed", arrays: 1, width: 4 }, // SharedString
	31: { kind: "fixed", arrays: 1, width: 16 }, // UniqueId
	33: { kind: "fixed", arrays: 1, width: 8 }, // SecurityCapabilities
};

/** One instance's value, as bytes in the layout's own order. */
type Value = Uint8Array;

function readProp(body: Uint8Array, layout: Layout, count: number): Value[] | null {
	if (layout.kind === "string") {
		const out: Value[] = [];
		let p = 0;
		for (let i = 0; i < count; i++) {
			if (p + 4 > body.length) return null;
			const n = u32(body, p);
			out.push(body.subarray(p + 4, p + 4 + n));
			p += 4 + n;
		}
		return p === body.length ? out : null;
	}
	if (layout.kind === "byte")
		return body.length === count ? Array.from(body, (b) => Uint8Array.of(b)) : null;
	const run = count * layout.width;
	if (body.length !== run * layout.arrays) return null;
	const arrays = Array.from({ length: layout.arrays }, (_, a) =>
		untranspose(body, a * run, count, layout.width),
	);
	return Array.from({ length: count }, (_, i) => {
		const v = new Uint8Array(layout.arrays * layout.width);
		arrays.forEach((arr, a) => v.set(arr[i], a * layout.width));
		return v;
	});
}

function writeProp(values: readonly Value[], layout: Layout): Uint8Array {
	const out = new Out();
	if (layout.kind === "string") {
		for (const v of values) out.string(v);
	} else if (layout.kind === "byte") {
		out.bytes(Uint8Array.from(values, (v) => v[0]));
	} else {
		for (let a = 0; a < layout.arrays; a++) {
			out.bytes(
				transpose(
					values.map((v) => v.subarray(a * layout.width, (a + 1) * layout.width)),
					layout.width,
				),
			);
		}
	}
	return out.done();
}

function randomId(): Uint8Array {
	const id = new Uint8Array(16);
	crypto.getRandomValues(id);
	return id;
}

/** Big-endian zigzagged Int64, as the transposed column holds it. */
function int64(v: number): Uint8Array {
	let z = BigInt(v) << 1n;
	if (v < 0) z = ~z;
	const out = new Uint8Array(8);
	for (let k = 7; k >= 0; k--) {
		out[k] = Number(z & 255n);
		z >>= 8n;
	}
	return out;
}

/** A chunk of the file, opened when it is one this changes. */
interface Opened extends Chunk {
	data?: Uint8Array;
}

function addBinary(bytes: Uint8Array, added: readonly NewInstance[]): Uint8Array {
	const chunks: Opened[] = readChunks(bytes).map((chunk) =>
		chunk.name === "INST" || chunk.name === "PROP" || chunk.name === "PRNT" || chunk.name === "SSTR"
			? { ...chunk, data: chunkData(chunk) }
			: chunk,
	);

	// What the file already holds.
	const classes = new Map<string, { id: number; index: number; refs: number[] }>();
	let maxClass = -1;
	let maxRef = -1;
	chunks.forEach((c, index) => {
		if (c.name !== "INST") return;
		const d = c.data!;
		const id = u32(d, 0);
		const n = u32(d, 4);
		const className = text.decode(d.subarray(8, 8 + n));
		const count = u32(d, 8 + n + 1);
		const refs = readReferents(d, 8 + n + 5, count);
		classes.set(className, { id, index, refs });
		maxClass = Math.max(maxClass, id);
		for (const r of refs) maxRef = Math.max(maxRef, r);
	});

	// Referents for the new instances, parents before children.
	const refOf = new Map<NewInstance, number>();
	for (const inst of added) refOf.set(inst, ++maxRef);
	const parentRef = (inst: NewInstance) => {
		const parent = inst.parent;
		const ref = isNew(parent) ? refOf.get(parent) : parent.ref;
		if (typeof ref !== "number")
			throw new RbxError(`"${inst.name}" has a parent the file cannot name`);
		return ref;
	};

	// An empty shared string, for Tags: one already there, or one added.
	const sstrIndex = chunks.findIndex((c) => c.name === "SSTR");
	let emptyShared = -1;
	let sharedEntries: { hash: Uint8Array; value: Uint8Array }[] = [];
	if (sstrIndex >= 0) {
		const d = chunks[sstrIndex].data!;
		const count = u32(d, 4);
		let p = 8;
		for (let i = 0; i < count; i++) {
			const hash = d.subarray(p, p + 16);
			const n = u32(d, p + 16);
			sharedEntries.push({ hash, value: d.subarray(p + 20, p + 20 + n) });
			p += 20 + n;
		}
		emptyShared = sharedEntries.findIndex((e) => e.value.length === 0);
	}
	let sharedChanged = false;
	const emptySharedIndex = () => {
		if (emptyShared >= 0) return emptyShared;
		// MD5 of nothing, which is what Roblox keys an empty shared string by.
		const md5 = Uint8Array.from("d41d8cd98f00b204e9800998ecf8427e".match(/../g)!, (h) =>
			parseInt(h, 16),
		);
		sharedEntries = [...sharedEntries, { hash: md5, value: new Uint8Array(0) }];
		emptyShared = sharedEntries.length - 1;
		sharedChanged = true;
		return emptyShared;
	};

	const byClass = new Map<string, NewInstance[]>();
	for (const inst of added)
		byClass.set(inst.className, [...(byClass.get(inst.className) ?? []), inst]);

	const replaced = new Map<number, Uint8Array>();
	const newInst: Uint8Array[] = [];
	const newProps: Uint8Array[] = [];
	let newClasses = 0;

	for (const [className, list] of byClass) {
		const existing = classes.get(className);
		if (!existing) {
			// A class the file has none of: chunks of its own, Name and Source only.
			const id = ++maxClass;
			newClasses++;
			const refs = list.map((i) => refOf.get(i)!);
			const inst = new Out();
			inst.u32(id);
			inst.string(className);
			inst.u8(0);
			inst.u32(refs.length);
			inst.bytes(encodeReferents(refs));
			newInst.push(sealChunk("INST", inst.done()));
			const props: [string, number, (i: NewInstance) => string][] = [["Name", 1, (i) => i.name]];
			if (list.some((i) => i.source !== undefined))
				props.push(["Source", 1, (i) => i.source ?? ""]);
			for (const [prop, type, value] of props) {
				const out = new Out();
				out.u32(id);
				out.string(prop);
				out.u8(type);
				for (const i of list) out.string(value(i));
				newProps.push(sealChunk("PROP", out.done()));
			}
			continue;
		}

		const { id, index, refs } = existing;
		const count = refs.length;
		const newRefs = list.map((i) => refOf.get(i)!);

		// Every property of the class gains a value for each new instance.
		chunks.forEach((c, at) => {
			if (c.name !== "PROP" || u32(c.data!, 0) !== id) return;
			const d = c.data!;
			const n = u32(d, 4);
			const prop = text.decode(d.subarray(8, 8 + n));
			const type = d[8 + n];
			const layout = LAYOUTS[type];
			const body = d.subarray(8 + n + 1);
			const values = layout ? readProp(body, layout, count) : null;
			if (!layout || !values) {
				throw new RbxError(`${className}.${prop} is stored in a way Roswaal cannot add to yet`);
			}
			const template = values[0];
			const fresh = list.map((inst): Value => {
				switch (prop) {
					case "Name":
						return utf8.encode(inst.name);
					case "Source":
						return utf8.encode(inst.source ?? "");
					case "UniqueId":
						return randomId();
					case "SourceAssetId":
						return int64(-1);
				}
				if (layout.kind === "string") return new Uint8Array(0);
				if (layout.kind === "byte") return Uint8Array.of(0);
				if (type === 28) return be32(emptySharedIndex());
				if (type === 31 || type === 27 || type === 33 || type === 18)
					return new Uint8Array(layout.arrays * layout.width);
				// No obvious empty value: an existing instance's, as a template.
				return template.slice();
			});
			const out = new Out();
			out.bytes(d.subarray(0, 8 + n + 1));
			out.bytes(writeProp([...values, ...fresh], layout));
			replaced.set(at, sealChunk("PROP", out.done()));
		});

		const d = chunks[index].data!;
		const n = u32(d, 4);
		const inst = new Out();
		inst.u32(id);
		inst.bytes(d.subarray(4, 8 + n));
		inst.u8(d[8 + n]);
		inst.u32(count + newRefs.length);
		inst.bytes(encodeReferents([...refs, ...newRefs]));
		if (d[8 + n] === 1) inst.bytes(new Uint8Array(count + newRefs.length).fill(1));
		replaced.set(index, sealChunk("INST", inst.done()));
	}

	// The tree: every existing pair, then the new ones.
	const prntIndex = chunks.findIndex((c) => c.name === "PRNT");
	if (prntIndex < 0) throw new RbxError("the file has no PRNT chunk");
	{
		const d = chunks[prntIndex].data!;
		const count = u32(d, 1);
		const children = readReferents(d, 5, count);
		const parents = readReferents(d, 5 + count * 4, count);
		for (const inst of added) {
			children.push(refOf.get(inst)!);
			parents.push(parentRef(inst));
		}
		const out = new Out();
		out.u8(d[0]);
		out.u32(children.length);
		out.bytes(encodeReferents(children));
		out.bytes(encodeReferents(parents));
		replaced.set(prntIndex, sealChunk("PRNT", out.done()));
	}
	if (sharedChanged && sstrIndex >= 0) {
		const d = chunks[sstrIndex].data!;
		const out = new Out();
		out.u32(u32(d, 0));
		out.u32(sharedEntries.length);
		for (const e of sharedEntries) {
			out.bytes(e.hash);
			out.string(e.value);
		}
		replaced.set(sstrIndex, sealChunk("SSTR", out.done()));
	}

	// Reassembled in the file's own order: new classes' chunks after the last
	// INST and the last PROP, where a reader expects each kind.
	const lastInst = chunks.map((c) => c.name).lastIndexOf("INST");
	const lastProp = chunks.map((c) => c.name).lastIndexOf("PROP");
	const out = new Out();
	const header = bytes.slice(0, FIRST_CHUNK);
	const view = new DataView(header.buffer);
	view.setInt32(16, view.getInt32(16, true) + newClasses, true);
	view.setInt32(20, view.getInt32(20, true) + added.length, true);
	out.bytes(header);
	chunks.forEach((c, at) => {
		out.bytes(replaced.get(at) ?? c.whole);
		if (at === lastInst) newInst.forEach((b) => out.bytes(b));
		if (at === lastProp) newProps.forEach((b) => out.bytes(b));
	});
	return out.done();
}

// ---------------------------------------------------------------------------
// XML

const escapeText = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function referent(): string {
	return (
		"RBX" +
		Array.from(randomId(), (b) => b.toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase()
	);
}

function addXml(source: string, added: readonly NewInstance[]): Uint8Array {
	const children = new Map<RbxInstance | NewInstance, NewInstance[]>();
	for (const inst of added) children.set(inst.parent, [...(children.get(inst.parent) ?? []), inst]);

	const item = (inst: NewInstance): string => {
		const props = [`<string name="Name">${escapeText(inst.name)}</string>`];
		if (inst.source !== undefined)
			props.push(`<ProtectedString name="Source">${cdata(inst.source)}</ProtectedString>`);
		const inner = (children.get(inst) ?? []).map(item).join("");
		return `<Item class="${inst.className}" referent="${referent()}"><Properties>${props.join("")}</Properties>${inner}</Item>`;
	};

	const byRef = new Map<string, XmlElement>();
	const visit = (el: XmlElement) => {
		if (el.name === "Item" && el.attrs.referent) byRef.set(el.attrs.referent, el);
		el.children.forEach(visit);
	};
	visit(parseXml(source));

	const splices: { at: number; text: string }[] = [];
	for (const [parent, list] of children) {
		if (isNew(parent)) continue;
		const el = byRef.get(String(parent.ref));
		if (!el) throw new RbxError(`"${parent.name}" is not in the file`);
		splices.push({ at: el.end, text: list.map(item).join("") });
	}
	splices.sort((a, b) => b.at - a.at);
	let out = source;
	for (const s of splices) out = out.slice(0, s.at) + s.text + out.slice(s.at);
	return utf8.encode(out);
}
