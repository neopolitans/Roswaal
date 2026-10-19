/**
 * Changing one property of one instance in a place.
 *
 * As in `writer.ts`, **only that value changes**. A binary place is copied
 * chunk for chunk, and the one `PROP` chunk that holds the value is opened,
 * has that instance's bytes replaced, and is sealed again; every other chunk
 * goes out as the bytes it came in as. An XML place has the text of the one
 * property element replaced and the rest of the file left as written.
 *
 * True or false, numbers, text, enums, colours and BrickColors; vectors,
 * sizes and UDims, a field a component; and CFrames, as a position and an
 * orientation in degrees. Only properties the engine lets a script set: not
 * read only, hidden or deprecated, and writable at no security level. `Name` and
 * `Source` are left out: a name is what the project's files find an instance
 * by, and a script's source is its project file's to write.
 *
 * The file written is read back before it is handed over, and refused unless
 * it holds the new value and every instance the old one did.
 */

import { toBase64 } from "../base64.js";
import { md5 } from "../md5.js";
import { isInstanceClass, isSubclassOf } from "../roblox.js";
import type { EngineProperty } from "../robloxEngine.js";
import { ENGINE } from "../robloxEngine.js";
import { isBinaryRbx } from "./binary.js";
import {
	chunkData,
	FIRST_CHUNK,
	putReferents,
	putU32,
	readChunks,
	readReferents,
	sealChunk,
	u32,
	zigzag,
} from "./chunks.js";
import {
	type CFrameValue,
	type Prop,
	type PropType,
	type RbxDocument,
	RbxError,
	type RbxInstance,
} from "./dom.js";
import { readRbx } from "./index.js";
import { float32Text } from "./serialize.js";
import { parseXml, type XmlElement } from "./xml.js";

/**
 * How a value is edited: a box to tick, a number, text, a list, a colour, a
 * field a component, or a CFrame's position and orientation.
 */
export type EditKind =
	| "bool"
	| "int"
	| "number"
	| "string"
	| "enum"
	| "color"
	| "brickcolor"
	| "vector"
	| "cframe"
	| "ref";

/** A CFrame as Studio's Properties shows it: where it is, and how it is turned. */
export interface CFrameEdit {
	position: number[];
	/** Degrees about X, Y and Z, applied Y, then X, then Z. */
	orientation: number[];
}

/** A property that may be changed, and its value as the editor edits it. */
export interface PropertyEdit {
	/** The name the file stores it under, which is what a change names. */
	stored: string;
	kind: EditKind;
	/**
	 * By kind: a boolean; a number for `int`, `number`, `enum` and
	 * `brickcolor`; text for `string`; `[r, g, b]` from 0 to 255 for `color`;
	 * the components for `vector`, in `fields`' order; a `CFrameEdit` for
	 * `cframe`.
	 */
	value: boolean | number | string | number[] | CFrameEdit;
	/** For a vector, what each component is called: X, Y, Z; Scale, Offset. */
	fields?: string[];
	/** For a vector, which components are whole numbers: a UDim's offset. */
	whole?: boolean[];
	/** For an enum, its name. */
	enum?: string;
	/** For an enum, the items it may be set to: the current one, and every one not deprecated. */
	items?: { name: string; value: number }[];
	/**
	 * For a reference, the class what it points at must be: a Model's
	 * PrimaryPart is a BasePart, an ObjectValue's Value any Instance. Its
	 * `value` is the name of what it points at now, or empty for nothing.
	 */
	refClass?: string;
	/** An attribute rather than a property: `stored` is its name, and the change goes to `AttributesSerialize`. */
	attribute?: true;
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
		case "Ref": {
			if (!isInstanceClass(type)) return undefined;
			return { stored, kind: "ref", value: (v as RbxInstance | null)?.name ?? "", refClass: type };
		}
		case "CFrame": {
			if (type !== "CFrame") return undefined;
			const cf = v as CFrameValue;
			return {
				stored,
				kind: "cframe",
				value: { position: [...cf.position], orientation: orientationOf(cf.rotation) },
			};
		}
		default: {
			const vector = VECTORS[prop.type];
			if (!vector || type !== vector.engine) return undefined;
			return {
				stored,
				kind: "vector",
				value: [...(v as number[])],
				fields: vector.fields,
				...(vector.whole ? { whole: vector.whole } : {}),
			};
		}
	}
}

const to255 = (c: number) => Math.max(0, Math.min(255, Math.round(c)));

/** The kinds of vector, by how the file stores them: the engine's name and each component's. */
const VECTORS: Partial<Record<PropType, { engine: string; fields: string[]; whole?: boolean[] }>> =
	{
		Vector3: { engine: "Vector3", fields: ["X", "Y", "Z"] },
		Vector2: { engine: "Vector2", fields: ["X", "Y"] },
		UDim: { engine: "UDim", fields: ["Scale", "Offset"], whole: [false, true] },
		UDim2: {
			engine: "UDim2",
			fields: ["X Scale", "X Offset", "Y Scale", "Y Offset"],
			whole: [false, true, false, true],
		},
		NumberRange: { engine: "NumberRange", fields: ["Min", "Max"] },
		Rect: { engine: "Rect", fields: ["Min X", "Min Y", "Max X", "Max Y"] },
	};

const DEG = 180 / Math.PI;

/** Studio's Orientation: a rotation, row-major, as degrees about X, Y and Z, applied Y, X, Z. */
export function orientationOf(r: readonly number[]): number[] {
	const rx = Math.asin(Math.max(-1, Math.min(1, -r[5])));
	const ry = Math.atan2(r[2], r[8]);
	const rz = Math.atan2(r[3], r[4]);
	return [rx * DEG, ry * DEG, rz * DEG];
}

/** The rotation an orientation in degrees is: about Y, then X, then Z. Row-major. */
export function rotationOf([x, y, z]: readonly number[]): number[] {
	const [cx, sx] = [Math.cos(x / DEG), Math.sin(x / DEG)];
	const [cy, sy] = [Math.cos(y / DEG), Math.sin(y / DEG)];
	const [cz, sz] = [Math.cos(z / DEG), Math.sin(z / DEG)];
	return [
		cy * cz + sy * sx * sz,
		-cy * sz + sy * sx * cz,
		sy * cx,
		cx * sz,
		cx * cz,
		-sx,
		-sy * cz + cy * sx * sz,
		sy * sz + cy * sx * cz,
		cy * cx,
	];
}

/**
 * The new value in the form the place stores it, from what the editor sent.
 * Throws `RbxError`, worded for the developer, for a value the property
 * cannot hold.
 */
export function storedValue(
	edit: PropertyEdit,
	prop: Prop,
	input: unknown,
	/** For a reference, the instance an index names: the outline's numbering. */
	instanceAt?: (index: number) => RbxInstance | undefined,
): unknown {
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
		case "vector": {
			const fields = edit.fields ?? [];
			if (
				!Array.isArray(input) ||
				input.length !== fields.length ||
				!input.every((n) => typeof n === "number" && Number.isFinite(n))
			)
				throw new RbxError(`${name} is ${fields.length} numbers: ${fields.join(", ")}`);
			edit.whole?.forEach((isWhole, i) => {
				if (isWhole && (!whole(input[i]) || input[i] < INT32_MIN || input[i] > INT32_MAX))
					throw new RbxError(`${name}'s ${fields[i]} is a whole number`);
			});
			if (prop.type === "NumberRange" && input[0] > input[1])
				throw new RbxError(`${name}'s Min is above its Max`);
			return [...input];
		}
		case "ref": {
			// Nothing is an answer: a Model with no PrimaryPart, an empty ObjectValue.
			if (input === null) return null;
			const target = whole(input) ? instanceAt?.(input) : undefined;
			if (!target) throw new RbxError(`${name} points at an instance in the place, or at nothing`);
			if (!isSubclassOf(target.className, edit.refClass))
				throw new RbxError(
					`${name} is a ${edit.refClass}, and ${target.name} is a ${target.className}`,
				);
			if (target.ref === undefined)
				throw new RbxError(`"${target.name}" has no identity in the file`);
			return target;
		}
		case "cframe": {
			const given = input as Partial<CFrameEdit> | null;
			const three = (v: unknown): v is number[] =>
				Array.isArray(v) &&
				v.length === 3 &&
				v.every((n) => typeof n === "number" && Number.isFinite(n));
			if (!given || typeof given !== "object" || !three(given.position))
				throw new RbxError(`${name}'s Position is three numbers: X, Y, Z`);
			if (given.orientation !== undefined && !three(given.orientation))
				throw new RbxError(`${name}'s Orientation is three numbers of degrees: X, Y, Z`);
			// Turned only when an orientation was given: a position alone keeps the
			// rotation exactly, rather than as it rounds through degrees.
			const was = prop.value as CFrameValue;
			return {
				position: [given.position[0], given.position[1], given.position[2]],
				rotation: given.orientation ? rotationOf(given.orientation) : [...was.rotation],
			} satisfies CFrameValue;
		}
	}
}

/** Whether two stored values are the same value. */
function same(type: PropType, a: unknown, b: unknown): boolean {
	// The same instance, whichever reading of the file it came from.
	if (type === "Ref")
		return ((a as RbxInstance | null)?.ref ?? null) === ((b as RbxInstance | null)?.ref ?? null);
	if (a instanceof Uint8Array && b instanceof Uint8Array)
		return a.length === b.length && a.every((x, i) => x === b[i]);
	// Floats as the file holds them: 32 bits, whichever format read them.
	const numbers = (x: readonly number[], y: readonly number[]) =>
		x.length === y.length && x.every((n, i) => Math.fround(n) === Math.fround(y[i]));
	if (type === "CFrame") {
		const [p, q] = [a as CFrameValue, b as CFrameValue];
		return numbers(p.position, q.position) && numbers(p.rotation, q.rotation);
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (type === "Color3uint8") return a.length === b.length && a.every((x, i) => x === b[i]);
		return numbers(a, b);
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

/**
 * The properties a place may lack, which Studio writes for every instance,
 * and the type it writes each as: Tags are shared, since most are the same.
 */
export const ADDED_IF_MISSING: ReadonlyMap<string, "String" | "SharedString"> = new Map([
	["AttributesSerialize", "String"],
	["Tags", "SharedString"],
]);

/**
 * The place with an empty String property `stored` on every instance of
 * `className`: what Studio writes as each instance's AttributesSerialize and
 * Tags, and a place written without them lacks. The one value is then written
 * over it as any other is.
 */
export function withEmptyString(
	given: Uint8Array,
	doc: RbxDocument,
	className: string,
	stored: string,
	type: "String" | "SharedString" = "String",
): Uint8Array {
	if (doc.format === "binary") {
		// A shared one points every instance at the empty entry of the table.
		const { bytes, index } =
			type === "SharedString" ? withShared(given, new Uint8Array(0)) : { bytes: given, index: 0 };
		const parts: Uint8Array[] = [bytes.subarray(0, FIRST_CHUNK)];
		let found: { classId: number; count: number } | null = null;
		let added = false;
		for (const chunk of readChunks(bytes)) {
			if (chunk.name === "INST") {
				const data = chunkData(chunk);
				const nameLength = u32(data, 4);
				const name = new TextDecoder().decode(data.subarray(8, 8 + nameLength));
				if (name === className)
					found = { classId: u32(data, 0), count: u32(data, 8 + nameLength + 1) };
			}
			// Every class's properties come before the parents.
			if (chunk.name === "PRNT" && found && !added) {
				const label = utf8.encode(stored);
				const prop = new Uint8Array(8 + label.length + 1 + 4 * found.count);
				putU32(prop, 0, found.classId);
				putU32(prop, 4, label.length);
				prop.set(label, 8);
				prop[8 + label.length] = TYPE_BYTE[type]!;
				if (type === "SharedString")
					for (let slot = 0; slot < found.count; slot++)
						putTransposed(prop, 8 + label.length + 1, found.count, slot, index);
				parts.push(sealChunk("PROP", prop));
				added = true;
			}
			parts.push(chunk.whole);
		}
		if (!added) throw new RbxError(`the file has no ${className} to give ${stored}`);
		const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
		let o = 0;
		for (const part of parts) {
			out.set(part, o);
			o += part.length;
		}
		return out;
	}

	let source = new TextDecoder().decode(given);
	const key = type === "SharedString" ? sharedKey(new Uint8Array(0)) : "";
	if (type === "SharedString") source = withSharedXml(source, key, new Uint8Array(0));
	const element =
		type === "SharedString"
			? `<SharedString name="${stored}">${key}</SharedString>`
			: `<BinaryString name="${stored}"></BinaryString>`;
	const at: number[] = [];
	const visit = (el: XmlElement) => {
		if (el.name === "Item" && el.attrs.class === className) {
			const props = el.children.find((c) => c.name === "Properties");
			if (props && !props.children.some((c) => c.attrs.name === stored)) at.push(props.end);
		}
		el.children.forEach(visit);
	};
	visit(parseXml(source));
	let out = source;
	for (const end of at.sort((a, b) => b - a))
		out = `${out.slice(0, end)}${element}${out.slice(end)}`;
	return utf8.encode(out);
}

/** The key a shared string is filed under here: its MD5. Studio's own keys are only names. */
function sharedKey(value: Uint8Array): string {
	return toBase64(md5(value));
}

/**
 * The binary place with `value` in its table of shared strings, and where it
 * is: the entry already holding it, or a new one at the end. A place with no
 * table gets one before its instances, where Studio writes it.
 */
function withShared(bytes: Uint8Array, value: Uint8Array): { bytes: Uint8Array; index: number } {
	const chunks = readChunks(bytes);
	const table = chunks.find((c) => c.name === "SSTR");
	const entries: { hash: Uint8Array; value: Uint8Array }[] = [];
	if (table) {
		const data = chunkData(table);
		const count = u32(data, 4);
		let p = 8;
		for (let i = 0; i < count; i++) {
			const hash = data.subarray(p, p + 16);
			const length = u32(data, p + 16);
			entries.push({ hash, value: data.subarray(p + 20, p + 20 + length) });
			p += 20 + length;
		}
	}
	const known = entries.findIndex(
		(e) => e.value.length === value.length && e.value.every((b, i) => b === value[i]),
	);
	if (known !== -1) return { bytes, index: known };
	entries.push({ hash: md5(value), value });

	const size = 8 + entries.reduce((sum, e) => sum + 20 + e.value.length, 0);
	const data = new Uint8Array(size);
	putU32(data, 4, entries.length);
	let p = 8;
	for (const e of entries) {
		data.set(e.hash.subarray(0, 16), p);
		putU32(data, p + 16, e.value.length);
		data.set(e.value, p + 20);
		p += 20 + e.value.length;
	}
	const sealed = sealChunk("SSTR", data);
	const parts: Uint8Array[] = [bytes.subarray(0, FIRST_CHUNK)];
	let placed = false;
	for (const chunk of chunks) {
		if (chunk.name === "SSTR") {
			parts.push(sealed);
			placed = true;
			continue;
		}
		if (!placed && chunk.name === "INST") {
			parts.push(sealed);
			placed = true;
		}
		parts.push(chunk.whole);
	}
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let o = 0;
	for (const part of parts) {
		out.set(part, o);
		o += part.length;
	}
	return { bytes: out, index: entries.length - 1 };
}

/** The XML place with `value` filed under `key` in its SharedStrings, made if there are none. */
function withSharedXml(source: string, key: string, value: Uint8Array): string {
	const roblox = parseXml(source).children.find((c) => c.name === "roblox");
	if (!roblox) throw new RbxError("not a Roblox XML place: there is no <roblox> element");
	const table = roblox.children.find((c) => c.name === "SharedStrings");
	if (table?.children.some((c) => c.attrs.md5 === key)) return source;
	const entry = `<SharedString md5="${key}">${toBase64(value)}</SharedString>`;
	const at = table ? table.end : roblox.end;
	const text = table ? entry : `<SharedStrings>${entry}</SharedStrings>`;
	return `${source.slice(0, at)}${text}${source.slice(at)}`;
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
	UDim: 6,
	UDim2: 7,
	BrickColor: 11,
	Color3: 12,
	Vector2: 13,
	Vector3: 14,
	CFrame: 16,
	Enum: 18,
	NumberRange: 23,
	Rect: 24,
	Ref: 19,
	Color3uint8: 26,
	Int64: 27,
	SharedString: 28,
};

/** Bytes a value takes, for the fixed-size types. */
const SIZE: Record<number, number> = {
	2: 1,
	3: 4,
	4: 4,
	5: 8,
	6: 8,
	7: 16,
	11: 4,
	12: 12,
	13: 8,
	14: 12,
	18: 4,
	19: 4,
	28: 4,
	23: 8,
	24: 16,
	26: 3,
	27: 8,
};

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
	// A shared string is an index into the place's table, which takes the value first.
	if (type === "SharedString") {
		const shared = withShared(bytes, value as Uint8Array);
		bytes = shared.bytes;
		value = shared.index;
	}
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
	if (type === 16) return patchCFrame(data, base, slot, count, value as CFrameValue);
	if (data.length !== base + count * SIZE[type])
		throw new RbxError("a property chunk is not the length its values need");
	const out = data.slice();
	switch (type) {
		case 2:
			out[base + slot] = value ? 1 : 0;
			break;
		case 28:
			// Where the value is in the place's table of shared strings.
			putTransposed(out, base, count, slot, value as number);
			break;
		case 19: {
			// Each referent is the difference from the one before, so the run is
			// read, changed in one place and written again. -1 is nothing.
			const refs = readReferents(data, base, count);
			refs[slot] = ((value as RbxInstance | null)?.ref as number | undefined) ?? -1;
			putReferents(out, base, refs);
			break;
		}
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
		// Floats a component at a time, each component's run after the last.
		case 12:
		case 13:
		case 14:
		case 24:
			(value as number[]).forEach((c, i) =>
				putTransposed(out, base + i * 4 * count, count, slot, rotated(c)),
			);
			break;
		case 6: {
			const [scale, offset] = value as number[];
			putTransposed(out, base, count, slot, rotated(scale));
			putTransposed(out, base + 4 * count, count, slot, zigzag(offset));
			break;
		}
		case 7: {
			// Stored X scale, Y scale, then X offset, Y offset.
			const [xs, xo, ys, yo] = value as number[];
			putTransposed(out, base, count, slot, rotated(xs));
			putTransposed(out, base + 4 * count, count, slot, rotated(ys));
			putTransposed(out, base + 8 * count, count, slot, zigzag(xo));
			putTransposed(out, base + 12 * count, count, slot, zigzag(yo));
			break;
		}
		case 23: {
			// Two little-endian floats a value, one value after another.
			const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
			const [min, max] = value as number[];
			view.setFloat32(base + 8 * slot, min, true);
			view.setFloat32(base + 8 * slot + 4, max, true);
			break;
		}
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

/**
 * CFrames are a rotation each -- a byte naming one of the 24 square turns, or
 * 0 and the whole matrix -- then every X, every Y and every Z. The rotations
 * are not all one size, so the chunk is rebuilt: the changed one as its
 * matrix, the others as the bytes they were.
 */
function patchCFrame(
	data: Uint8Array,
	base: number,
	slot: number,
	count: number,
	value: CFrameValue,
): Uint8Array {
	const rotations: Uint8Array[] = [];
	let at = base;
	for (let i = 0; i < count; i++) {
		if (at >= data.length) throw new RbxError("a property chunk ends in the middle of a value");
		const size = data[at] === 0 ? 37 : 1;
		rotations.push(data.subarray(at, at + size));
		at += size;
	}
	if (data.length - at !== 12 * count)
		throw new RbxError("a property chunk is not the length its values need");
	const matrix = new Uint8Array(37);
	const view = new DataView(matrix.buffer);
	value.rotation.forEach((c, i) => view.setFloat32(1 + 4 * i, c, true));
	rotations[slot] = matrix;

	const head = base + rotations.reduce((sum, r) => sum + r.length, 0);
	const out = new Uint8Array(head + 12 * count);
	out.set(data.subarray(0, base), 0);
	let o = base;
	for (const r of rotations) {
		out.set(r, o);
		o += r.length;
	}
	out.set(data.subarray(at), head);
	value.position.forEach((c, i) =>
		putTransposed(out, head + i * 4 * count, count, slot, rotated(c)),
	);
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
	Vector2: "Vector2",
	Vector3: "Vector3",
	UDim: "UDim",
	UDim2: "UDim2",
	NumberRange: "NumberRange",
	Rect: "Rect2D",
	CFrame: "CoordinateFrame",
	Ref: "Ref",
	SharedString: "SharedString",
};

const R = ["R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"];

/** The child elements a type keeps its components in, and each one's text. */
function childFields(type: PropType, value: unknown): [string, string][] | undefined {
	const f = float32Text;
	const v = value as number[];
	switch (type) {
		case "Vector3":
			return [
				["X", f(v[0])],
				["Y", f(v[1])],
				["Z", f(v[2])],
			];
		case "Vector2":
			return [
				["X", f(v[0])],
				["Y", f(v[1])],
			];
		case "UDim":
			return [
				["S", f(v[0])],
				["O", String(v[1])],
			];
		case "UDim2":
			return [
				["XS", f(v[0])],
				["XO", String(v[1])],
				["YS", f(v[2])],
				["YO", String(v[3])],
			];
		case "CFrame": {
			const cf = value as CFrameValue;
			return [
				["X", f(cf.position[0])],
				["Y", f(cf.position[1])],
				["Z", f(cf.position[2])],
				...R.map((n, i): [string, string] => [n, f(cf.rotation[i])]),
			];
		}
		default:
			return undefined;
	}
}

/** One splice per child, each its component's text; undefined when any child is missing. */
function spliceChildren(el: XmlElement, fields: [string, string][]) {
	const found = fields.map(([n]) => el.children.find((c) => c.name === n));
	if (!found.every(Boolean)) return undefined;
	return found.map((c, i) => ({ start: c!.start, end: c!.end, text: fields[i][1] }));
}

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
	// An asset link is a String to the reader, kept in a Content element;
	// attributes and tags are too, kept as base64 in a BinaryString.
	const link = type === "String" && el.name === "Content";
	const binary = type === "String" && el.name === "BinaryString";
	if (el.name !== ELEMENT[type] && !link && !binary)
		throw new RbxError(`${stored} is not stored as a ${type}`);

	if (type === "SharedString") {
		// The key in the element, the value in the table at the end of the file.
		const key = sharedKey(value as Uint8Array);
		const keyed = `${source.slice(0, el.start)}${key}${source.slice(el.end)}`;
		return utf8.encode(withSharedXml(keyed, key, value as Uint8Array));
	}
	const splices: { start: number; end: number; text: string }[] = [];
	if (binary) {
		splices.push(content(source, el, toBase64(value as Uint8Array)));
	} else if (link) {
		const url = new TextDecoder().decode(value as Uint8Array);
		splices.push(content(source, el, url ? `<url>${escapeText(url)}</url>` : "<null></null>"));
	} else if (childFields(type, value)) {
		// Each component's own element, so the file keeps its layout; written
		// out whole only when one is missing.
		const fields = childFields(type, value)!;
		const each = spliceChildren(el, fields);
		if (each) splices.push(...each);
		else splices.push(content(source, el, fields.map(([n, t]) => `<${n}>${t}</${n}>`).join("")));
	} else if (type === "Rect") {
		const [x0, y0, x1, y1] = (value as number[]).map(float32Text);
		const ends = ["min", "max"].map((n) => el.children.find((c) => c.name === n));
		const each = ends.every(Boolean)
			? [
					spliceChildren(ends[0]!, [
						["X", x0],
						["Y", y0],
					]),
					spliceChildren(ends[1]!, [
						["X", x1],
						["Y", y1],
					]),
				]
			: [];
		if (each.length && each.every(Boolean))
			splices.push(...each.flat().filter((s) => s !== undefined));
		else
			splices.push(
				content(
					source,
					el,
					`<min><X>${x0}</X><Y>${y0}</Y></min><max><X>${x1}</X><Y>${y1}</Y></max>`,
				),
			);
	} else if (type === "NumberRange") {
		const [min, max] = (value as number[]).map(float32Text);
		splices.push(content(source, el, `${min} ${max} `));
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
		case "Ref":
			return String((value as RbxInstance | null)?.ref ?? "null");
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
