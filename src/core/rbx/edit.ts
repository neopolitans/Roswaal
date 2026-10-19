/**
 * Changing one property of one instance in a place.
 *
 * As in `writer.ts`, **only that value changes**. A binary place is copied
 * chunk for chunk, and the one `PROP` chunk that holds the value is opened,
 * has that instance's bytes replaced, and is sealed again; every other chunk
 * goes out as the bytes it came in as. An XML place has the text of the one
 * property element replaced and the rest of the file left as written.
 *
 * Only simple values -- true or false, numbers, text, enums, colours and
 * BrickColors -- and only properties the engine lets a script set: not read
 * only, hidden or deprecated, and writable at no security level. `Name` and
 * `Source` are left out: a name is what the project's files find an instance
 * by, and a script's source is its project file's to write.
 *
 * The file written is read back before it is handed over, and refused unless
 * it holds the new value and every instance the old one did.
 */

import type { EngineProperty } from "../robloxEngine.js";
import { ENGINE } from "../robloxEngine.js";
import { isBinaryRbx } from "./binary.js";
import {
	chunkData,
	FIRST_CHUNK,
	putU32,
	readChunks,
	readReferents,
	sealChunk,
	u32,
	zigzag,
} from "./chunks.js";
import { type Prop, type PropType, type RbxDocument, RbxError, type RbxInstance } from "./dom.js";
import { readRbx } from "./index.js";
import { parseXml, type XmlElement } from "./xml.js";

/** How a value is edited: a box to tick, a number, text, a list, a colour. */
export type EditKind = "bool" | "int" | "number" | "string" | "enum" | "color" | "brickcolor";

/** A property that may be changed, and its value as the editor edits it. */
export interface PropertyEdit {
	/** The name the file stores it under, which is what a change names. */
	stored: string;
	kind: EditKind;
	/**
	 * By kind: a boolean; a number for `int`, `number`, `enum` and
	 * `brickcolor`; text for `string`; `[r, g, b]` from 0 to 255 for `color`.
	 */
	value: boolean | number | string | number[];
	/** For an enum, its name. */
	enum?: string;
	/** For an enum, the items it may be set to: the current one, and every one not deprecated. */
	items?: { name: string; value: number }[];
}

/** Never changed here, whatever the engine allows. */
const KEPT = new Set(["Name", "Source"]);

/** Tags that mean a script cannot set the property, or should not. */
const UNSETTABLE = new Set(["ReadOnly", "NotScriptable", "Hidden", "Deprecated"]);

/** Whether the engine lets a script set this property. */
export function settable(engine: EngineProperty): boolean {
	if (engine.deprecated) return false;
	if ((engine.tags ?? []).some((tag) => UNSETTABLE.has(tag))) return false;
	const security = engine.security;
	const write = typeof security === "string" ? security : security?.write;
	return write === undefined || write === "None";
}

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/** The most text a string property is given here: far past any a developer types. */
const LONGEST_TEXT = 200_000;

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder("utf-8", { fatal: true });

/** Text that is printable, for a string property worth editing as text. */
function editableText(bytes: Uint8Array): string | undefined {
	let s: string;
	try {
		s = fromUtf8.decode(bytes);
	} catch {
		return undefined;
	}
	// eslint-disable-next-line no-control-regex
	return /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s) ? undefined : s;
}

/**
 * How a stored property is edited, or undefined when it is not: the engine
 * does not let a script set it, or its value is not one of the simple kinds.
 */
export function editFor(
	stored: string,
	prop: Prop,
	engine: EngineProperty | undefined,
): PropertyEdit | undefined {
	if (!engine || KEPT.has(engine.name) || KEPT.has(stored) || !settable(engine)) return undefined;
	const type = engine.type;
	const v = prop.value;
	switch (prop.type) {
		case "Bool":
			return type === "boolean" ? { stored, kind: "bool", value: v as boolean } : undefined;
		case "Int32":
			return type === "int" ? { stored, kind: "int", value: v as number } : undefined;
		case "Int64": {
			const n = Number(v as bigint);
			return type === "int64" && Number.isSafeInteger(n)
				? { stored, kind: "int", value: n }
				: undefined;
		}
		case "Float32":
		case "Float64":
			return type === "float" || type === "double" || type === "number"
				? { stored, kind: "number", value: v as number }
				: undefined;
		case "String": {
			if (type !== "string" && type !== "ContentId") return undefined;
			const s = editableText(v as Uint8Array);
			return s === undefined ? undefined : { stored, kind: "string", value: s };
		}
		case "Enum": {
			const found = ENGINE.enums[type];
			if (!found) return undefined;
			const items = found.items
				.filter((item) => !item.deprecated || item.value === v)
				.map(({ name, value }) => ({ name, value }));
			return { stored, kind: "enum", value: v as number, enum: type, items };
		}
		case "Color3":
			return type === "Color3"
				? { stored, kind: "color", value: (v as number[]).map((c) => to255(c * 255)) }
				: undefined;
		case "Color3uint8":
			return type === "Color3" ? { stored, kind: "color", value: [...(v as number[])] } : undefined;
		case "BrickColor":
			return type === "BrickColor" ? { stored, kind: "brickcolor", value: v as number } : undefined;
		default:
			return undefined;
	}
}

const to255 = (c: number) => Math.max(0, Math.min(255, Math.round(c)));

/**
 * The new value in the form the place stores it, from what the editor sent.
 * Throws `RbxError`, worded for the developer, for a value the property
 * cannot hold.
 */
export function storedValue(edit: PropertyEdit, prop: Prop, input: unknown): unknown {
	const name = edit.stored;
	const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
	switch (edit.kind) {
		case "bool":
			if (typeof input !== "boolean") throw new RbxError(`${name} is true or false`);
			return input;
		case "int":
			if (!whole(input)) throw new RbxError(`${name} is a whole number`);
			if (prop.type === "Int64") {
				if (!Number.isSafeInteger(input)) throw new RbxError(`${input} is too large for ${name}`);
				return BigInt(input);
			}
			if (input < INT32_MIN || input > INT32_MAX)
				throw new RbxError(`${name} is a whole number from ${INT32_MIN} to ${INT32_MAX}`);
			return input;
		case "number":
			if (typeof input !== "number" || !Number.isFinite(input))
				throw new RbxError(`${name} is a number`);
			return prop.type === "Float32" ? Math.fround(input) : input;
		case "string": {
			if (typeof input !== "string") throw new RbxError(`${name} is text`);
			if (input.length > LONGEST_TEXT)
				throw new RbxError(`${name} takes at most ${LONGEST_TEXT} characters`);
			// eslint-disable-next-line no-control-regex
			if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input))
				throw new RbxError(`${name} cannot hold control characters`);
			return utf8.encode(input);
		}
		case "enum": {
			const items = ENGINE.enums[edit.enum ?? ""]?.items ?? [];
			if (!whole(input) || !items.some((item) => item.value === input))
				throw new RbxError(`${input} is not one of Enum.${edit.enum}`);
			return input;
		}
		case "color": {
			if (
				!Array.isArray(input) ||
				input.length !== 3 ||
				!input.every((c) => whole(c) && c >= 0 && c <= 255)
			)
				throw new RbxError(`${name} is three numbers from 0 to 255`);
			return prop.type === "Color3uint8" ? [...input] : input.map((c: number) => c / 255);
		}
		case "brickcolor":
			if (!whole(input) || input < 1 || input > 0xffff)
				throw new RbxError(`${name} is a BrickColor number`);
			return input;
	}
}

/** Whether two stored values are the same value. */
function same(type: PropType, a: unknown, b: unknown): boolean {
	if (a instanceof Uint8Array && b instanceof Uint8Array)
		return a.length === b.length && a.every((x, i) => x === b[i]);
	if (Array.isArray(a) && Array.isArray(b)) {
		const round = type === "Color3" ? Math.fround : (n: number) => n;
		return a.length === b.length && a.every((x, i) => round(x) === round(b[i]));
	}
	if (type === "Float32") return Math.fround(a as number) === Math.fround(b as number);
	return a === b;
}

/**
 * The place with `inst`'s property `stored` holding `value`, which is in the
 * form `storedValue` gives. Nothing else in the file changes.
 */
export function writeProperty(
	bytes: Uint8Array,
	doc: RbxDocument,
	inst: RbxInstance,
	stored: string,
	value: unknown,
): Uint8Array {
	if (inst.ref === undefined) throw new RbxError(`"${inst.name}" has no identity in the file`);
	const prop = inst.props.get(stored);
	if (!prop) throw new RbxError(`"${inst.name}" has no ${stored} in the file`);
	let out: Uint8Array;
	if (doc.format === "binary") {
		if (!isBinaryRbx(bytes)) throw new RbxError("the document was read from a different file");
		out = writeBinary(bytes, inst.ref as number, stored, prop.type, value);
	} else {
		out = writeXml(new TextDecoder().decode(bytes), String(inst.ref), stored, prop.type, value);
	}

	// Read back: the new value where it was asked for, and nothing lost.
	const again = readRbx(out);
	const found = again.instances.find((other) => other.ref === inst.ref);
	const now = found?.props.get(stored);
	if (again.instances.length !== doc.instances.length || !now || !same(prop.type, now.value, value))
		throw new RbxError(`${stored} did not read back as written, so the place was left as it was`);
	return out;
}

// ---------------------------------------------------------------------------
// Binary
// ---------------------------------------------------------------------------

/** The type byte a PROP chunk carries, for the types written here. */
const TYPE_BYTE: Partial<Record<PropType, number>> = {
	String: 1,
	Bool: 2,
	Int32: 3,
	Float32: 4,
	Float64: 5,
	BrickColor: 11,
	Color3: 12,
	Enum: 18,
	Color3uint8: 26,
	Int64: 27,
};

/** Bytes a value takes, for the fixed-size types. */
const SIZE: Record<number, number> = { 2: 1, 3: 4, 4: 4, 5: 8, 11: 4, 12: 12, 18: 4, 26: 3, 27: 8 };

const bits = new DataView(new ArrayBuffer(8));

/** A float's bits with the sign moved to the bottom, as the format stores them. */
function rotated(v: number): number {
	bits.setFloat32(0, v);
	const b = bits.getUint32(0);
	return ((b << 1) | (b >>> 31)) >>> 0;
}

/** One big-endian u32 into a transposed array: its byte k at `base + k * count + slot`. */
function putTransposed(out: Uint8Array, base: number, count: number, slot: number, v: number) {
	for (let k = 0; k < 4; k++) out[base + k * count + slot] = (v >>> (24 - 8 * k)) & 255;
}

function writeBinary(
	bytes: Uint8Array,
	ref: number,
	stored: string,
	type: PropType,
	value: unknown,
): Uint8Array {
	const typeByte = TYPE_BYTE[type];
	if (typeByte === undefined) throw new RbxError(`a ${type} value is not written here`);
	const parts: Uint8Array[] = [bytes.subarray(0, FIRST_CHUNK)];
	/** The instance's class, and where it stands among that class's instances. */
	let target: { classId: number; slot: number; count: number } | null = null;
	let written = false;

	for (const chunk of readChunks(bytes)) {
		const { name, whole } = chunk;
		if (name !== "INST" && name !== "PROP") {
			parts.push(whole);
			continue;
		}
		const data = chunkData(chunk);
		const classId = u32(data, 0);
		const nameLength = u32(data, 4);
		if (name === "INST") {
			const count = u32(data, 8 + nameLength + 1);
			const slot = readReferents(data, 8 + nameLength + 5, count).indexOf(ref);
			if (slot !== -1) target = { classId, slot, count };
			parts.push(whole);
			continue;
		}
		const label = new TextDecoder().decode(data.subarray(8, 8 + nameLength));
		if (!target || classId !== target.classId || label !== stored) {
			parts.push(whole);
			continue;
		}
		const at = 8 + nameLength;
		if (data[at] !== typeByte) throw new RbxError(`${stored} is not stored as a ${type}`);
		parts.push(sealChunk("PROP", patch(data, at + 1, typeByte, target, value)));
		written = true;
	}
	if (!written) throw new RbxError(`the file stores no ${stored} for this instance`);

	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let o = 0;
	for (const part of parts) {
		out.set(part, o);
		o += part.length;
	}
	return out;
}

/** A PROP chunk's payload with one instance's value replaced. */
function patch(
	data: Uint8Array,
	base: number,
	type: number,
	{ slot, count }: { slot: number; count: number },
	value: unknown,
): Uint8Array {
	if (type === 1) return patchString(data, base, slot, count, value as Uint8Array);
	if (data.length !== base + count * SIZE[type])
		throw new RbxError("a property chunk is not the length its values need");
	const out = data.slice();
	switch (type) {
		case 2:
			out[base + slot] = value ? 1 : 0;
			break;
		case 3:
			putTransposed(out, base, count, slot, zigzag(value as number));
			break;
		case 4:
			putTransposed(out, base, count, slot, rotated(value as number));
			break;
		case 5:
			new DataView(out.buffer, out.byteOffset, out.byteLength).setFloat64(
				base + 8 * slot,
				value as number,
				true,
			);
			break;
		case 11:
		case 18:
			putTransposed(out, base, count, slot, (value as number) >>> 0);
			break;
		case 12:
			(value as number[]).forEach((c, i) =>
				putTransposed(out, base + i * 4 * count, count, slot, rotated(c)),
			);
			break;
		case 26:
			(value as number[]).forEach((c, i) => {
				out[base + i * count + slot] = c;
			});
			break;
		case 27: {
			const v = value as bigint;
			let z = BigInt.asUintN(64, (v << 1n) ^ (v >> 63n));
			for (let k = 7; k >= 0; k--) {
				out[base + k * count + slot] = Number(z & 255n);
				z >>= 8n;
			}
			break;
		}
	}
	return out;
}

/** Strings are each a length and their bytes, one after another: rebuilt. */
function patchString(
	data: Uint8Array,
	base: number,
	slot: number,
	count: number,
	value: Uint8Array,
): Uint8Array {
	const values: Uint8Array[] = [];
	let at = base;
	for (let i = 0; i < count; i++) {
		if (at + 4 > data.length) throw new RbxError("a property chunk ends in the middle of a value");
		const n = u32(data, at);
		if (at + 4 + n > data.length)
			throw new RbxError("a property chunk ends in the middle of a value");
		values.push(i === slot ? value : data.subarray(at + 4, at + 4 + n));
		at += 4 + n;
	}
	if (at !== data.length) throw new RbxError("a property chunk is not the length its values need");
	const out = new Uint8Array(base + values.reduce((sum, v) => sum + 4 + v.length, 0));
	out.set(data.subarray(0, base), 0);
	let o = base;
	for (const v of values) {
		putU32(out, o, v.length);
		out.set(v, o + 4);
		o += 4 + v.length;
	}
	return out;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/** The element a type is written as, for the types written here. */
const ELEMENT: Partial<Record<PropType, string>> = {
	String: "string",
	Bool: "bool",
	Int32: "int",
	Int64: "int64",
	Float32: "float",
	Float64: "double",
	Enum: "token",
	BrickColor: "BrickColor",
	Color3: "Color3",
	Color3uint8: "Color3uint8",
};

const escapeText = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function writeXml(
	source: string,
	referent: string,
	stored: string,
	type: PropType,
	value: unknown,
): Uint8Array {
	let item: XmlElement | undefined;
	const visit = (el: XmlElement) => {
		if (item) return;
		if (el.name === "Item" && el.attrs.referent === referent) item = el;
		else el.children.forEach(visit);
	};
	visit(parseXml(source));
	const props = item?.children.find((c) => c.name === "Properties");
	const el = props?.children.find((c) => c.attrs.name === stored);
	if (!el) throw new RbxError(`the file stores no ${stored} for this instance`);
	// An asset link is a String to the reader, kept in a Content element.
	const link = type === "String" && el.name === "Content";
	if (el.name !== ELEMENT[type] && !link)
		throw new RbxError(`${stored} is not stored as a ${type}`);

	const splices: { start: number; end: number; text: string }[] = [];
	if (link) {
		const url = new TextDecoder().decode(value as Uint8Array);
		splices.push(content(source, el, url ? `<url>${escapeText(url)}</url>` : "<null></null>"));
	} else if (type === "Color3") {
		const rgb = (value as number[]).map(String);
		const parts = ["R", "G", "B"].map((n) => el.children.find((c) => c.name === n));
		if (parts.every(Boolean))
			parts.forEach((p, i) => splices.push({ start: p!.start, end: p!.end, text: rgb[i] }));
		else splices.push(content(source, el, `<R>${rgb[0]}</R><G>${rgb[1]}</G><B>${rgb[2]}</B>`));
	} else {
		splices.push(content(source, el, xmlText(type, value, el)));
	}

	// From the end, so each splice leaves the offsets before it where they were.
	splices.sort((a, b) => b.start - a.start);
	let out = source;
	for (const s of splices) out = out.slice(0, s.start) + s.text + out.slice(s.end);
	return utf8.encode(out);
}

/**
 * An element's content replaced by `text`. One written `<string name="X"/>`
 * has no content to replace, so its whole tag is rewritten as an opening and
 * a closing one around the text.
 */
function content(
	source: string,
	el: XmlElement,
	text: string,
): { start: number; end: number; text: string } {
	if (el.start === el.end && source.slice(el.start - 2, el.start) === "/>") {
		const start = source.lastIndexOf("<", el.start - 1);
		const tag = source.slice(start, el.start - 2).trimEnd();
		return { start, end: el.end, text: `${tag}>${text}</${el.name}>` };
	}
	return { start: el.start, end: el.end, text };
}

function xmlText(type: PropType, value: unknown, el: XmlElement): string {
	switch (type) {
		case "String":
			return escapeText(new TextDecoder().decode(value as Uint8Array));
		case "Bool":
			return value ? "true" : "false";
		case "Color3uint8": {
			// The top byte is kept as the file had it: Studio writes FF there.
			const top = (Number(el.text.trim()) >>> 24) & 255 || 255;
			const [r, g, b] = value as number[];
			return String(((top << 24) | (r << 16) | (g << 8) | b) >>> 0);
		}
		default:
			return String(value);
	}
}
