/**
 * A property's value as the place file holds it, carried as JSON and back
 * without losing a bit: what an undo puts back.
 *
 * The editor's own forms round: a colour to whole numbers from 0 to 255, a
 * rotation through degrees. These do not. Bytes go as base64, a bigint as its
 * digits, a number JSON cannot hold (NaN, the infinities, -0) by name, and an
 * instance as whatever `pointer` makes of it, since an instance is named by
 * where it is and that is the caller's to say.
 */

import { fromBase64, toBase64 } from "../base64.js";
import { type Prop, type PropType, type RbxInstance, text, walk } from "./dom.js";

/** JSON. */
export type Raw = null | boolean | number | string | Raw[] | { [key: string]: Raw };

/** A stored value with its type: what a property held. */
export interface RawProp {
	type: PropType;
	value: Raw;
}

const isInstance = (v: object): v is RbxInstance =>
	"children" in v && "props" in v && v.props instanceof Map;

/** `value` as JSON, each instance in it as `pointer` names it. */
export function encodeRaw(value: unknown, pointer: (inst: RbxInstance) => Raw): Raw {
	if (value === null || value === undefined) return null;
	switch (typeof value) {
		case "boolean":
		case "string":
			return value;
		case "number":
			if (Number.isNaN(value)) return { $f: "NaN" };
			if (value === Infinity) return { $f: "Infinity" };
			if (value === -Infinity) return { $f: "-Infinity" };
			if (Object.is(value, -0)) return { $f: "-0" };
			return value;
		case "bigint":
			return { $n: value.toString() };
		case "object":
			break;
		default:
			throw new Error(`a ${typeof value} in a stored value`);
	}
	if (value instanceof Uint8Array) return { $b: toBase64(value) };
	if (Array.isArray(value)) return value.map((v) => encodeRaw(v, pointer));
	if (isInstance(value)) return { $i: pointer(value) };
	const out: { [key: string]: Raw } = {};
	for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = encodeRaw(v, pointer);
	return out;
}

const NUMBERS: Record<string, number> = {
	NaN: Number.NaN,
	Infinity: Number.POSITIVE_INFINITY,
	"-Infinity": Number.NEGATIVE_INFINITY,
	"-0": -0,
};

/**
 * The stored value `raw` encodes, each instance found by `instance`. Throws
 * on anything `encodeRaw` would not have made.
 */
export function decodeRaw(raw: unknown, instance: (pointer: Raw) => unknown): unknown {
	if (raw === null || typeof raw === "boolean" || typeof raw === "string") return raw;
	if (typeof raw === "number") {
		if (!Number.isFinite(raw)) throw new Error("a number JSON cannot hold");
		return raw;
	}
	if (Array.isArray(raw)) return raw.map((v) => decodeRaw(v, instance));
	if (typeof raw !== "object") throw new Error("not a stored value");
	const o = raw as Record<string, unknown>;
	const keys = Object.keys(o);
	if (keys.length === 1) {
		const [key] = keys;
		const v = o[key];
		if (key === "$f") {
			if (typeof v !== "string" || !(v in NUMBERS)) throw new Error("not a number");
			return NUMBERS[v];
		}
		if (key === "$n") {
			if (typeof v !== "string" || !/^-?\d+$/.test(v)) throw new Error("not a whole number");
			return BigInt(v);
		}
		if (key === "$b") {
			if (typeof v !== "string") throw new Error("not base64");
			return fromBase64(v);
		}
		if (key === "$i") return instance(v as Raw);
	}
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (key.startsWith("$")) throw new Error(`${key} in a stored value`);
		out[key] = decodeRaw(o[key], instance);
	}
	return out;
}

/**
 * An instance of a deleted tree, as JSON: its class, its parent's place in
 * the list (-1 for the one at the top, which comes first), and its values.
 */
export interface RawItem {
	className: string;
	parent: number;
	props: Record<string, RawProp>;
}

/**
 * Where a value in a tree points: at another in the tree, by its place in the
 * list; at an instance of the place, by its index in the outline; or nowhere.
 */
export type RawPointer = { local: number } | { at: number } | null;

/** The tree under `root`, parents first, pointing outside it by `indexOf`. */
export function encodeTree(
	root: RbxInstance,
	indexOf: (inst: RbxInstance) => number | undefined,
): RawItem[] {
	const list = [...walk([root])];
	const local = new Map(list.map((inst, k) => [inst, k]));
	const pointer = (inst: RbxInstance): RawPointer => {
		const k = local.get(inst);
		if (k !== undefined) return { local: k };
		const at = indexOf(inst);
		return at === undefined ? null : { at };
	};
	return list.map((inst) => {
		const props: Record<string, RawProp> = {};
		for (const [name, prop] of inst.props)
			props[name] = { type: prop.type, value: encodeRaw(prop.value, pointer) };
		return {
			className: inst.className,
			parent: inst === root ? -1 : local.get(inst.parent!)!,
			props,
		};
	});
}

/**
 * The tree `items` describes, apart from any place: what it points at outside
 * itself as `outside` gives each index. Throws on a list `encodeTree` would
 * not have made.
 */
export function decodeTree(items: unknown, outside: (index: number) => unknown): RbxInstance {
	if (!Array.isArray(items) || items.length === 0) throw new Error("no instances");
	const list: RbxInstance[] = items.map((item: unknown, k) => {
		const { className, parent, props } = (item ?? {}) as Partial<RawItem>;
		if (typeof className !== "string" || className === "") throw new Error("an instance's class");
		const top = k === 0;
		if (typeof parent !== "number" || (top ? parent !== -1 : !(parent >= 0 && parent < k)))
			throw new Error("an instance's parent");
		if (typeof props !== "object" || props === null) throw new Error("an instance's values");
		return { className, name: "", parent: null, children: [], props: new Map(), service: false };
	});
	const pointed = (p: Raw): unknown => {
		if (p === null) return null;
		const { local, at } = p as { local?: unknown; at?: unknown };
		if (typeof local === "number" && list[local]) return list[local];
		if (typeof at === "number" && Number.isInteger(at)) return outside(at);
		throw new Error("a reference");
	};
	(items as RawItem[]).forEach((item, k) => {
		const inst = list[k];
		if (k > 0) {
			inst.parent = list[item.parent];
			inst.parent.children.push(inst);
		}
		for (const [name, raw] of Object.entries(item.props)) {
			if (typeof raw?.type !== "string") throw new Error(`${name}'s type`);
			const prop: Prop = { type: raw.type, value: decodeRaw(raw.value, pointed) };
			inst.props.set(name, prop);
		}
		inst.name = text(inst.props.get("Name")?.value);
	});
	return list[0];
}
