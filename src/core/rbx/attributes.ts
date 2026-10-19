/**
 * Changing an instance's attributes and tags, as the place file keeps them.
 *
 * `AttributesSerialize` is a count, then a name, a type byte and a value for
 * each attribute; `Tags` is the tag names joined with NUL. Both are rewritten
 * whole and written as the String property they are, through `writeProperty`
 * like any other, and an attribute that is not changed keeps its bytes as they
 * were. A list holding a type whose length is not known here is not rewritten
 * at all: everything after it would be guessed at.
 */

import { RbxError } from "./dom.js";
import type { PropertyEdit } from "./edit.js";

export interface AttributeEntry {
	name: string;
	/** The type byte, as Studio writes it: 0x02 a string, 0x06 a number... */
	type: number;
	/** The value's bytes, after the type byte. */
	value: Uint8Array;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** Bytes a value of a fixed-size type takes. */
const FIXED: Record<number, number> = {
	0x03: 1, // bool
	0x04: 4, // int32
	0x05: 4, // float
	0x06: 8, // double
	0x09: 8, // UDim
	0x0a: 16, // UDim2
	0x0e: 4, // BrickColor
	0x0f: 12, // Color3
	0x10: 8, // Vector2
	0x11: 12, // Vector3
	0x1b: 8, // NumberRange
	0x1c: 16, // Rect
};

/** The attributes, or null when one is of a type this cannot measure. */
export function attributeEntries(blob: Uint8Array): AttributeEntry[] | null {
	if (blob.length === 0) return [];
	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	let p = 0;
	const u32 = () => {
		if (p + 4 > blob.length) throw new RangeError("past the end");
		p += 4;
		return view.getUint32(p - 4, true);
	};
	const skip = (n: number) => {
		if (p + n > blob.length) throw new RangeError("past the end");
		p += n;
	};
	try {
		const count = u32();
		const out: AttributeEntry[] = [];
		for (let i = 0; i < count; i++) {
			const length = u32();
			skip(length);
			const name = fromUtf8.decode(blob.subarray(p - length, p));
			skip(1);
			const type = blob[p - 1];
			const start = p;
			if (FIXED[type] !== undefined) skip(FIXED[type]);
			else if (type === 0x02) skip(u32());
			else if (type === 0x14) {
				// A CFrame: a position, then a rotation id, and the rotation
				// itself only when the id is 0.
				skip(12);
				skip(1);
				if (blob[p - 1] === 0) skip(36);
			} else if (type === 0x15) {
				skip(u32());
				skip(4);
			} else if (type === 0x17) skip(u32() * 12);
			else if (type === 0x19) skip(u32() * 20);
			else return null;
			out.push({ name, type, value: blob.slice(start, p) });
		}
		return p === blob.length ? out : null;
	} catch {
		return null;
	}
}

/** The list written back, in its order. */
export function encodeAttributes(entries: readonly AttributeEntry[]): Uint8Array {
	const parts: Uint8Array[] = [le32(entries.length)];
	for (const entry of entries) {
		const name = utf8.encode(entry.name);
		parts.push(le32(name.length), name, Uint8Array.of(entry.type), entry.value);
	}
	return join(parts);
}

/** The types an attribute is added as, by what Properties calls them. */
export const NEW_ATTRIBUTE_TYPES: Readonly<Record<string, number>> = {
	string: 0x02,
	boolean: 0x03,
	number: 0x06,
	Vector3: 0x11,
	Color3: 0x0f,
};

/** What a new attribute holds until it is changed: Studio's own defaults. */
export function defaultAttribute(type: number): Uint8Array {
	if (type === 0x02) return le32(0);
	if (FIXED[type] === undefined) throw new RbxError("an attribute of that type is not added here");
	return new Uint8Array(FIXED[type]);
}

/**
 * Why a name cannot be an attribute's, or null when it can: letters, digits
 * and underscores, at most 100 of them, not starting with RBX, which Roblox
 * keeps for itself.
 */
export function attributeNameProblem(name: string): string | null {
	if (name === "") return "An attribute needs a name.";
	if (name.length > 100) return "An attribute's name is at most 100 characters.";
	if (!/^[A-Za-z0-9_]+$/.test(name))
		return "An attribute's name is letters, digits and underscores.";
	if (/^RBX/i.test(name)) return "Names starting with RBX are Roblox's own.";
	return null;
}

/** How an attribute is changed in Properties, for the kinds Properties edits. */
export function attributeEdit(entry: AttributeEntry): PropertyEdit | undefined {
	// Roblox’s own, which Studio writes for itself: RBX_LightingTechnologyUnifiedMigration.
	if (robloxOwn(entry.name)) return undefined;
	const view = new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength);
	const f32 = (i: number) => view.getFloat32(i * 4, true);
	const base = { stored: entry.name, attribute: true as const };
	switch (entry.type) {
		case 0x02:
			return { ...base, kind: "string", value: fromUtf8.decode(entry.value.subarray(4)) };
		case 0x03:
			return { ...base, kind: "bool", value: entry.value[0] !== 0 };
		case 0x04:
			return { ...base, kind: "int", value: view.getInt32(0, true) };
		case 0x05:
			return { ...base, kind: "number", value: f32(0) };
		case 0x06:
			return { ...base, kind: "number", value: view.getFloat64(0, true) };
		case 0x0e:
			return { ...base, kind: "brickcolor", value: view.getUint32(0, true) };
		case 0x0f:
			return {
				...base,
				kind: "color",
				value: [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(f32(i) * 255)))),
			};
		case 0x10:
			return { ...base, kind: "vector", value: [f32(0), f32(1)], fields: ["X", "Y"] };
		case 0x11:
			return { ...base, kind: "vector", value: [f32(0), f32(1), f32(2)], fields: ["X", "Y", "Z"] };
		case 0x09:
			return {
				...base,
				kind: "vector",
				value: [f32(0), view.getInt32(4, true)],
				fields: ["Scale", "Offset"],
				whole: [false, true],
			};
		case 0x0a:
			return {
				...base,
				kind: "vector",
				value: [f32(0), view.getInt32(4, true), f32(2), view.getInt32(12, true)],
				fields: ["X Scale", "X Offset", "Y Scale", "Y Offset"],
				whole: [false, true, false, true],
			};
		case 0x1b:
			return { ...base, kind: "vector", value: [f32(0), f32(1)], fields: ["Min", "Max"] };
		case 0x1c:
			return {
				...base,
				kind: "vector",
				value: [f32(0), f32(1), f32(2), f32(3)],
				fields: ["Min X", "Min Y", "Max X", "Max Y"],
			};
		default:
			return undefined;
	}
}

/** An attribute's new value bytes, from what the editor sends, checked as Studio would. */
export function attributeValue(entry: AttributeEntry, input: unknown): Uint8Array {
	const edit = attributeEdit(entry);
	const name = entry.name;
	if (!edit) throw new RbxError(`${name} is not an attribute of a kind changed here`);
	const numbers = (n: number) =>
		Array.isArray(input) &&
		input.length === n &&
		input.every((v) => typeof v === "number" && Number.isFinite(v));
	const out = new Uint8Array(entry.type === 0x02 ? 0 : (FIXED[entry.type] ?? 0));
	const view = new DataView(out.buffer);
	switch (entry.type) {
		case 0x02: {
			if (typeof input !== "string") throw new RbxError(`${name} is text`);
			const bytes = utf8.encode(input);
			return join([le32(bytes.length), bytes]);
		}
		case 0x03:
			if (typeof input !== "boolean") throw new RbxError(`${name} is true or false`);
			out[0] = input ? 1 : 0;
			return out;
		case 0x04:
			if (
				!Number.isInteger(input) ||
				(input as number) < -(2 ** 31) ||
				(input as number) >= 2 ** 31
			)
				throw new RbxError(`${name} is a whole number`);
			view.setInt32(0, input as number, true);
			return out;
		case 0x05:
		case 0x06:
			if (typeof input !== "number" || !Number.isFinite(input))
				throw new RbxError(`${name} is a number`);
			if (entry.type === 0x05) view.setFloat32(0, input, true);
			else view.setFloat64(0, input, true);
			return out;
		case 0x0e:
			if (!Number.isInteger(input) || (input as number) < 1 || (input as number) > 0xffff)
				throw new RbxError(`${name} is a BrickColor number`);
			view.setUint32(0, input as number, true);
			return out;
		case 0x0f:
			if (
				!numbers(3) ||
				!(input as number[]).every((c) => Number.isInteger(c) && c >= 0 && c <= 255)
			)
				throw new RbxError(`${name} is three numbers from 0 to 255`);
			(input as number[]).forEach((c, i) => view.setFloat32(i * 4, c / 255, true));
			return out;
		default: {
			const fields = edit.fields ?? [];
			if (!numbers(fields.length))
				throw new RbxError(`${name} is ${fields.length} numbers: ${fields.join(", ")}`);
			const v = input as number[];
			if (entry.type === 0x1b && v[0] > v[1]) throw new RbxError(`${name}'s Min is above its Max`);
			v.forEach((n, i) => {
				if (edit.whole?.[i]) {
					if (!Number.isInteger(n)) throw new RbxError(`${name}'s ${fields[i]} is a whole number`);
					view.setInt32(i * 4, n, true);
				} else view.setFloat32(i * 4, n, true);
			});
			return out;
		}
	}
}

/** An attribute Roblox keeps for itself, which is shown and never changed here. */
export function robloxOwn(name: string): boolean {
	return /^RBX/i.test(name);
}

/** The tags, in the order the file keeps them. */
export function tagsOf(blob: Uint8Array): string[] {
	return fromUtf8.decode(blob).split("\0").filter(Boolean);
}

/** Tags written back, as Studio keeps them: the names joined with NUL. */
export function encodeTags(tags: readonly string[]): Uint8Array {
	return utf8.encode(tags.join("\0"));
}

/** Why a tag cannot be added, or null when it can. */
export function tagProblem(tag: string, tags: readonly string[]): string | null {
	if (tag === "") return "A tag needs a name.";
	if (tag.length > 100) return "A tag is at most 100 characters.";
	if (tag.includes("\0")) return "A tag cannot hold a NUL character.";
	if (tags.includes(tag)) return `It is tagged ${tag} already.`;
	return null;
}

function le32(n: number): Uint8Array {
	const out = new Uint8Array(4);
	new DataView(out.buffer).setUint32(0, n, true);
	return out;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}
