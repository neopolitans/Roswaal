/**
 * Writing a whole place from a document: the binary format and the XML one.
 *
 * `writer.ts` and `adder.ts` change a place that already exists and keep
 * every byte they do not need to touch. This writes one from nothing, which is
 * what a new project's place is, and what a place converted from one format
 * to the other will be.
 *
 * Every property the document holds is written, of every type the readers
 * decode. Shared strings go in a table keyed by the MD5 of each value, as
 * Studio keys them. A property the reader skipped is not in the document, so
 * it is not here either, and Studio gives the instance its own default for
 * it; `convertPlace` says which kinds those were.
 *
 * Instances are written depth first, parents before children, and numbered in
 * that order, so the same document is the same file every time.
 */

import { md5 } from "../md5.js";
import { findProperty } from "../robloxEngine.js";
import { cdata, putU32, sealChunk, zigzag } from "./chunks.js";
import {
	type CFrameValue,
	type Prop,
	type RbxDocument,
	RbxError,
	type RbxInstance,
	walk,
} from "./dom.js";
import { readRbx } from "./index.js";

const utf8 = new TextEncoder();

/** The instances in the order they are written, and the number each is given. */
function order(doc: RbxDocument): { list: RbxInstance[]; ref: Map<RbxInstance, number> } {
	const list = [...walk(doc.roots)];
	return { list, ref: new Map(list.map((inst, i) => [inst, i])) };
}

function refused(prop: string, type: string): never {
	throw new RbxError(`${prop} is a ${type}, which is not written yet`);
}

/** A place's shared strings, each once, in the order first met, keyed by its MD5. */
class SharedStrings {
	readonly values: { bytes: Uint8Array; hash: Uint8Array; key: string }[] = [];
	private index = new Map<string, number>();
	/** Where `bytes` is in the table, adding it the first time. */
	add(bytes: Uint8Array): number {
		const hash = md5(bytes);
		const key = base64(hash);
		let at = this.index.get(key);
		if (at === undefined) {
			at = this.values.push({ bytes, hash, key }) - 1;
			this.index.set(key, at);
		}
		return at;
	}
	key(bytes: Uint8Array): string {
		return this.values[this.add(bytes)].key;
	}
}

// ---------------------------------------------------------------------------
// Binary
// ---------------------------------------------------------------------------

const TYPE_BYTE: Record<string, number> = {
	String: 1,
	Bool: 2,
	Int32: 3,
	Float32: 4,
	Float64: 5,
	UDim: 6,
	UDim2: 7,
	BrickColor: 11,
	Color3: 12,
	Vector2: 13,
	Vector3: 14,
	CFrame: 16,
	Enum: 18,
	Ref: 19,
	NumberRange: 23,
	Rect: 24,
	Color3uint8: 26,
	Int64: 27,
	SharedString: 28,
	ProtectedString: 29,
	OptionalCFrame: 30,
	UniqueId: 31,
};

/** A chunk's payload, built up a value at a time. */
class Bytes {
	private parts: number[] = [];
	u8(v: number) {
		this.parts.push(v & 255);
	}
	u32(v: number) {
		for (let i = 0; i < 4; i++) this.parts.push((v >>> (8 * i)) & 255);
	}
	f32(v: number) {
		scratch.setFloat32(0, v, true);
		for (let i = 0; i < 4; i++) this.u8(scratch.getUint8(i));
	}
	f64(v: number) {
		scratch.setFloat64(0, v, true);
		for (let i = 0; i < 8; i++) this.u8(scratch.getUint8(i));
	}
	bytes(b: ArrayLike<number>) {
		for (let i = 0; i < b.length; i++) this.parts.push(b[i]);
	}
	string(s: string | Uint8Array) {
		const b = typeof s === "string" ? utf8.encode(s) : s;
		this.u32(b.length);
		this.bytes(b);
	}
	/** Big-endian u32s, transposed: every first byte, then every second. */
	transposed(values: readonly number[]) {
		const n = values.length;
		const out = new Uint8Array(n * 4);
		values.forEach((v, i) => {
			for (let k = 0; k < 4; k++) out[k * n + i] = (v >>> (24 - 8 * k)) & 255;
		});
		this.bytes(out);
	}
	ints(values: readonly number[]) {
		this.transposed(values.map(zigzag));
	}
	floats(values: readonly number[]) {
		this.transposed(values.map(rotated));
	}
	/** Each the difference from the one before, as INST and PRNT list them. */
	referents(refs: readonly number[]) {
		let last = 0;
		this.ints(
			refs.map((r) => {
				const d = r - last;
				last = r;
				return d;
			}),
		);
	}
	done(): Uint8Array {
		return Uint8Array.from(this.parts);
	}
}

const scratch = new DataView(new ArrayBuffer(8));

/** A float's bits with the sign moved to the bottom, as the format stores them. */
function rotated(v: number): number {
	scratch.setFloat32(0, v);
	const b = scratch.getUint32(0);
	return ((b << 1) | (b >>> 31)) >>> 0;
}

const IDENTITY: CFrameValue = { position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] };

function cframes(w: Bytes, values: readonly (CFrameValue | null)[]) {
	// Rotation id 0 and the whole matrix: always readable, if not the smallest.
	for (const v of values) {
		w.u8(0);
		for (const c of (v ?? IDENTITY).rotation) w.f32(c);
	}
	for (let k = 0; k < 3; k++) w.floats(values.map((v) => (v ?? IDENTITY).position[k]));
}

function binaryValues(
	w: Bytes,
	name: string,
	type: string,
	vs: readonly unknown[],
	ref: Map<RbxInstance, number>,
	shared: SharedStrings,
) {
	const nums = vs as number[];
	const tuples = vs as number[][];
	switch (type) {
		case "String":
		case "ProtectedString":
			for (const v of vs) w.string(v as Uint8Array);
			return;
		case "Bool":
			for (const v of vs) w.u8(v ? 1 : 0);
			return;
		case "Int32":
			w.ints(nums);
			return;
		case "Float32":
			w.floats(nums);
			return;
		case "Float64":
			for (const v of nums) w.f64(v);
			return;
		case "UDim":
			w.floats(tuples.map((v) => v[0]));
			w.ints(tuples.map((v) => v[1]));
			return;
		case "UDim2":
			w.floats(tuples.map((v) => v[0]));
			w.floats(tuples.map((v) => v[2]));
			w.ints(tuples.map((v) => v[1]));
			w.ints(tuples.map((v) => v[3]));
			return;
		case "BrickColor":
		case "Enum":
			w.transposed(nums.map((v) => v >>> 0));
			return;
		case "SharedString":
			w.transposed(vs.map((v) => shared.add(v as Uint8Array)));
			return;
		case "Color3":
		case "Vector3":
			for (let k = 0; k < 3; k++) w.floats(tuples.map((v) => v[k]));
			return;
		case "Vector2":
			for (let k = 0; k < 2; k++) w.floats(tuples.map((v) => v[k]));
			return;
		case "Rect":
			for (let k = 0; k < 4; k++) w.floats(tuples.map((v) => v[k]));
			return;
		case "CFrame":
			cframes(w, vs as CFrameValue[]);
			return;
		case "OptionalCFrame":
			w.u8(16);
			cframes(w, vs as (CFrameValue | null)[]);
			w.u8(2);
			for (const v of vs) w.u8(v ? 1 : 0);
			return;
		case "Ref":
			w.referents(vs.map((v) => (v ? (ref.get(v as RbxInstance) ?? -1) : -1)));
			return;
		case "NumberRange":
			for (const [a, b] of tuples) {
				w.f32(a);
				w.f32(b);
			}
			return;
		case "Color3uint8":
			for (let k = 0; k < 3; k++) w.bytes(tuples.map((v) => v[k]));
			return;
		case "Int64": {
			const n = vs.length;
			const out = new Uint8Array(n * 8);
			vs.forEach((v, i) => {
				const big = BigInt(v as bigint);
				let z = BigInt.asUintN(64, (big << 1n) ^ (big >> 63n));
				for (let k = 7; k >= 0; k--) {
					out[k * n + i] = Number(z & 255n);
					z >>= 8n;
				}
			});
			w.bytes(out);
			return;
		}
		case "UniqueId": {
			const n = vs.length;
			const out = new Uint8Array(n * 16);
			vs.forEach((hex, i) => {
				for (let k = 0; k < 16; k++)
					out[k * n + i] = parseInt((hex as string).slice(2 * k, 2 * k + 2), 16);
			});
			w.bytes(out);
			return;
		}
	}
	refused(name, type);
}

/**
 * A value for an instance that lacks a property its classmates have. Binary
 * stores every property of a class for each of its instances, so one has to
 * be written, and zero is the only one known; a document read from a binary
 * place never lacks one.
 */
function blank(type: string): unknown {
	switch (type) {
		case "String":
		case "ProtectedString":
		case "SharedString":
			return new Uint8Array(0);
		case "Bool":
			return false;
		case "Int64":
			return 0n;
		case "UDim":
			return [0, 0];
		case "UDim2":
		case "Rect":
			return [0, 0, 0, 0];
		case "Vector2":
		case "NumberRange":
			return [0, 0];
		case "Color3":
		case "Vector3":
		case "Color3uint8":
			return [0, 0, 0];
		case "CFrame":
			return IDENTITY;
		case "Ref":
		case "OptionalCFrame":
			return null;
		case "UniqueId":
			return "0".repeat(32);
		default:
			return 0;
	}
}

/** Each class's instances, the classes by name. */
function byClass(list: readonly RbxInstance[]): [string, RbxInstance[]][] {
	const by = new Map<string, RbxInstance[]>();
	for (const inst of list) {
		const same = by.get(inst.className);
		if (same) same.push(inst);
		else by.set(inst.className, [inst]);
	}
	return [...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Every property a class's instances hold, by name, with its type. */
function propsOf(insts: readonly RbxInstance[]): [string, string][] {
	const types = new Map<string, string>();
	for (const inst of insts)
		for (const [name, prop] of inst.props) {
			const was = types.get(name);
			if (was && was !== prop.type)
				throw new RbxError(
					`${inst.className}.${name} is a ${was} on one instance and a ${prop.type} on another`,
				);
			types.set(name, prop.type);
		}
	return [...types].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The document as a binary place, every chunk LZ4-compressed as Rojo writes them. */
export function writeBinaryPlace(doc: RbxDocument): Uint8Array {
	const { list, ref } = order(doc);
	const classes = byClass(list);
	const chunks: Uint8Array[] = [];

	const header = new Bytes();
	header.bytes(utf8.encode("<roblox!"));
	header.bytes([0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]);
	header.u8(0);
	header.u8(0);
	header.u32(classes.length);
	header.u32(list.length);
	header.u32(0);
	header.u32(0);
	chunks.push(header.done());

	const meta = new Bytes();
	meta.u32(1);
	meta.string("ExplicitAutoJoints");
	meta.string("true");
	chunks.push(sealChunk("META", meta.done()));

	const shared = new SharedStrings();
	const insts: Uint8Array[] = [];
	const props: Uint8Array[] = [];
	classes.forEach(([className, members], id) => {
		const service = members.some((inst) => inst.service);
		const w = new Bytes();
		w.u32(id);
		w.string(className);
		w.u8(service ? 1 : 0);
		w.u32(members.length);
		w.referents(members.map((inst) => ref.get(inst)!));
		if (service) for (const _ of members) w.u8(1);
		insts.push(sealChunk("INST", w.done()));

		for (const [name, type] of propsOf(members)) {
			const typeByte = TYPE_BYTE[type];
			if (typeByte === undefined) refused(`${className}.${name}`, type);
			const p = new Bytes();
			p.u32(id);
			p.string(name);
			p.u8(typeByte);
			const values = members.map((inst) => inst.props.get(name)?.value ?? blank(type));
			binaryValues(p, `${className}.${name}`, type, values, ref, shared);
			props.push(sealChunk("PROP", p.done()));
		}
	});
	// The table goes before the instances, as Studio writes it, once every
	// property that points into it has been met.
	if (shared.values.length) {
		const t = new Bytes();
		t.u32(0);
		t.u32(shared.values.length);
		for (const v of shared.values) {
			t.bytes(v.hash);
			t.string(v.bytes);
		}
		chunks.push(sealChunk("SSTR", t.done()));
	}
	chunks.push(...insts, ...props);

	const prnt = new Bytes();
	prnt.u8(0);
	prnt.u32(list.length);
	prnt.referents(list.map((inst) => ref.get(inst)!));
	prnt.referents(list.map((inst) => (inst.parent ? (ref.get(inst.parent) ?? -1) : -1)));
	chunks.push(sealChunk("PRNT", prnt.done()));

	// END is stored, not compressed, as Studio and Rojo both write it.
	const end = new Uint8Array(16 + 9);
	end.set(utf8.encode("END\0"), 0);
	putU32(end, 8, 9);
	end.set(utf8.encode("</roblox>"), 16);
	chunks.push(end);

	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** Kept in a `BinaryString` element whatever they hold, as Studio writes them. */
const BINARY_STRINGS = new Set([
	"AttributesSerialize",
	"Tags",
	"SmoothGrid",
	"PhysicsGrid",
	"MaterialColors",
	"CollisionGroupData",
]);

const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The shortest text that reads back as the same 32-bit float. */
export function float32Text(v: number): string {
	if (Number.isNaN(v)) return "NAN";
	if (!Number.isFinite(v)) return v > 0 ? "INF" : "-INF";
	const f = Math.fround(v);
	for (let digits = 1; digits <= 9; digits++) {
		const s = Number(f.toPrecision(digits));
		if (Math.fround(s) === f) return String(s);
	}
	return String(f);
}

function float64(v: number): string {
	if (Number.isNaN(v)) return "NAN";
	if (!Number.isFinite(v)) return v > 0 ? "INF" : "-INF";
	return String(v);
}

const fields = (names: readonly string[], values: readonly number[], f = float32Text) =>
	names.map((n, i) => `<${n}>${f(values[i])}</${n}>`).join("");

function base64(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

/** Bytes worth writing as text: UTF-8 with no control characters but tabs and newlines. */
function asText(bytes: Uint8Array): string | undefined {
	let s: string;
	try {
		s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
	// eslint-disable-next-line no-control-regex
	return /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s) ? undefined : s;
}

const R = ["R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"];

function cframeXml(v: CFrameValue): string {
	return fields(["X", "Y", "Z"], v.position) + fields(R, v.rotation);
}

function xmlProperty(
	className: string,
	name: string,
	prop: Prop,
	referent: (inst: RbxInstance) => string | undefined,
	shared: SharedStrings,
): string {
	const n = escapeXml(name);
	const v = prop.value;
	const tuple = v as number[];
	const el = (tag: string, body: string) => `<${tag} name="${n}">${body}</${tag}>`;
	switch (prop.type) {
		case "String": {
			const text = asText(v as Uint8Array);
			// An asset link is a Content element in XML; Studio leaves one
			// written as a string empty.
			if (text !== undefined && findProperty(className, name)?.type === "ContentId")
				return el("Content", text ? `<url>${escapeXml(text)}</url>` : "<null></null>");
			return text === undefined || BINARY_STRINGS.has(name)
				? el("BinaryString", base64(v as Uint8Array))
				: el("string", escapeXml(text));
		}
		case "ProtectedString":
			return el("ProtectedString", cdata(new TextDecoder().decode(v as Uint8Array)));
		case "Bool":
			return el("bool", v ? "true" : "false");
		case "Int32":
			return el("int", String(v));
		case "Int64":
			return el("int64", String(v));
		case "Float32":
			return el("float", float32Text(v as number));
		case "Float64":
			return el("double", float64(v as number));
		case "Enum":
			return el("token", String(v));
		case "BrickColor":
			return el("BrickColor", String(v));
		case "Ref": {
			const target = v ? referent(v as RbxInstance) : undefined;
			return el("Ref", target ?? "null");
		}
		case "UniqueId":
			return el("UniqueId", String(v));
		case "SharedString":
			return el("SharedString", shared.key(v as Uint8Array));
		case "Vector2":
			return el("Vector2", fields(["X", "Y"], tuple));
		case "Vector3":
			return el("Vector3", fields(["X", "Y", "Z"], tuple));
		case "Color3":
			return el("Color3", fields(["R", "G", "B"], tuple));
		case "Color3uint8": {
			const [r, g, b] = tuple;
			return el("Color3uint8", String(((255 << 24) | (r << 16) | (g << 8) | b) >>> 0));
		}
		case "CFrame":
			return el("CoordinateFrame", cframeXml(v as CFrameValue));
		case "OptionalCFrame":
			return el(
				"OptionalCoordinateFrame",
				v ? `<CFrame>${cframeXml(v as CFrameValue)}</CFrame>` : "",
			);
		case "UDim":
			return el("UDim", `<S>${float32Text(tuple[0])}</S><O>${tuple[1]}</O>`);
		case "UDim2": {
			const [xs, xo, ys, yo] = tuple;
			return el(
				"UDim2",
				`<XS>${float32Text(xs)}</XS><XO>${xo}</XO><YS>${float32Text(ys)}</YS><YO>${yo}</YO>`,
			);
		}
		case "NumberRange":
			return el("NumberRange", `${float32Text(tuple[0])} ${float32Text(tuple[1])} `);
		case "Rect":
			return el(
				"Rect2D",
				`<min>${fields(["X", "Y"], tuple)}</min><max>${fields(["X", "Y"], tuple.slice(2))}</max>`,
			);
	}
	refused(name, prop.type);
}

/**
 * A referent for each instance, unique in the file. Studio reads any string
 * here; these follow its `RBX` and 32 hex digits so the file looks like one it
 * wrote, and are numbered so the same place is written the same way each time.
 */
function referentOf(n: number): string {
	return `RBX${(n + 1).toString(16).toUpperCase().padStart(32, "0")}`;
}

/** The document as `.rbxlx` text: Studio's legacy format, and readable in a diff. */
export function writeXmlPlace(doc: RbxDocument): string {
	const { ref } = order(doc);
	const shared = new SharedStrings();
	const referent = (inst: RbxInstance) => {
		const n = ref.get(inst);
		return n === undefined ? undefined : referentOf(n);
	};
	const item = (inst: RbxInstance, depth: number): string => {
		const pad = "\t".repeat(depth);
		const props = [...inst.props]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(
				([name, prop]) => `${pad}\t\t${xmlProperty(inst.className, name, prop, referent, shared)}`,
			);
		return [
			`${pad}<Item class="${escapeXml(inst.className)}" referent="${referent(inst)}">`,
			`${pad}\t<Properties>`,
			...props,
			`${pad}\t</Properties>`,
			...inst.children.map((child) => item(child, depth + 1)),
			`${pad}</Item>`,
		].join("\n");
	};
	const items = doc.roots.map((root) => item(root, 1)).join("\n");
	const table = shared.values.length
		? `\t<SharedStrings>\n${shared.values
				.map((v) => `\t\t<SharedString md5="${v.key}">${base64(v.bytes)}</SharedString>`)
				.join("\n")}\n\t</SharedStrings>\n`
		: "";
	return (
		'<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" ' +
		'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
		'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n' +
		'\t<Meta name="ExplicitAutoJoints">true</Meta>\n' +
		"\t<External>null</External>\n" +
		"\t<External>nil</External>\n" +
		`${items}\n` +
		table +
		"</roblox>\n"
	);
}

/** The two formats a place can be saved in. */
export type PlaceFormat = "rbxl" | "rbxlx";

/** A place's format, by its file name. */
export function placeFormatOf(file: string): PlaceFormat {
	return /\.rbxlx$/i.test(file) ? "rbxlx" : "rbxl";
}

/** A place in the other format, and the kinds of property it could not carry over. */
export interface ConvertedPlace {
	bytes: Uint8Array;
	/**
	 * Property types the reader does not decode, with how many properties of
	 * each the place held: left out of the converted file, for Studio to give
	 * their defaults. Empty when nothing was lost.
	 */
	leftOut: [string, number][];
}

/** The kinds of property a conversion of these bytes would leave out. */
export function leftOutOf(bytes: Uint8Array): [string, number][] {
	return [...readRbx(bytes).undecoded].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * The place saved as `to`. Read and written again from nothing, so everything
 * the reader decodes goes across and nothing else does; bytes already in that
 * format are handed back as they are.
 */
export function convertPlace(bytes: Uint8Array, to: PlaceFormat): ConvertedPlace {
	const doc = readRbx(bytes);
	if ((doc.format === "binary") === (to === "rbxl")) return { bytes, leftOut: [] };
	return {
		bytes: to === "rbxl" ? writeBinaryPlace(doc) : utf8.encode(writeXmlPlace(doc)),
		leftOut: [...doc.undecoded].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
	};
}
