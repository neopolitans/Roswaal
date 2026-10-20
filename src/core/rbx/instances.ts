/**
 * Adding, deleting, moving and duplicating instances in a place.
 *
 * A binary place keeps each property of a class in one column, a value for
 * every instance of it, so a class that gains or loses an instance is written
 * again whole: its INST chunk and each of its PROP chunks, from the document,
 * by the serializer's own writers. Every other class's chunks go out as they
 * came in, bar the class number at the head of each where a class that lost
 * its last instance leaves a gap to close. The parent table is written again.
 * A class holding a property Roswaal does not read is refused rather than
 * written again without it.
 *
 * An XML place has the text of the instances concerned cut, copied or moved,
 * and the rest of the file left as written.
 *
 * Studio's rules come first, learnt by asking it to make every class there is
 * under every kind of parent: services stay where they are, a class it will
 * not make in a place is not made, and the few classes that need a particular
 * parent are only put in one. A new instance takes what a fresh one starts
 * with in Studio (`classDefaults.ts`), and its own UniqueId.
 *
 * The file written is read back and compared with what was meant, instance by
 * instance and value by value, and refused unless the two agree.
 */

import { classChain, isSubclassOf } from "../roblox.js";
import {
	chunkData,
	FIRST_CHUNK,
	putU32,
	readChunks,
	readReferents,
	sealChunk,
	u32,
} from "./chunks.js";
import { baseDefaults, classDefaults } from "./classDefaults.js";
import { type Prop, type RbxDocument, RbxError, type RbxInstance, walk } from "./dom.js";
import { nameProblem, withSharedXml } from "./edit.js";
import { readRbx } from "./index.js";
import { classProblem, parentProblem, targetProblem } from "./instanceRules.js";
import { Bytes, blank, classChunks, SharedStrings, xmlProperty } from "./serialize.js";
import { parseXml, type XmlElement } from "./xml.js";

/** An instance as the file names it: its referent. */
export type InstanceRef = number | string;

export {
	addableClasses,
	classProblem,
	parentProblem,
	targetProblem,
} from "./instanceRules.js";

/** One change to a place's tree, naming instances by `T`: a referent, or the instance itself. */
export type InstanceChange<T = InstanceRef> =
	| { kind: "add"; parent: T; className: string; name: string }
	| { kind: "delete"; target: T }
	| { kind: "move"; target: T; parent: T }
	| { kind: "duplicate"; target: T };

// ---------------------------------------------------------------------------
// Studio's rules
// ---------------------------------------------------------------------------

/** Why `change` cannot be made, or undefined if it can. */
export function changeProblem(change: InstanceChange<RbxInstance>): string | undefined {
	if (change.kind === "add")
		return (
			classProblem(change.className) ??
			parentProblem(change.className, change.parent.className) ??
			nameProblem(change.name)
		);
	const { target } = change;
	const problem = targetProblem(target.className, !target.parent || target.service);
	if (problem || change.kind !== "move") return problem;
	for (let at: RbxInstance | null = change.parent; at; at = at.parent)
		if (at === target) return "An instance cannot go inside itself";
	if (change.parent === target.parent) return `${target.name} is in ${change.parent.name} already`;
	return parentProblem(target.className, change.parent.className);
}

// ---------------------------------------------------------------------------
// The change, on the document
// ---------------------------------------------------------------------------

const utf8 = new TextEncoder();
const text = new TextDecoder();

/** What a fresh instance's HistoryId holds. */
const NO_HISTORY = "0".repeat(32);

function randomHex(bytes: number): string {
	const out = new Uint8Array(bytes);
	crypto.getRandomValues(out);
	return Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A GUID in the form Studio gives a script, braced and upper case. */
function scriptGuid(): string {
	const hex = randomHex(16).toUpperCase().split("");
	hex[12] = "4";
	hex[16] = "89AB"[parseInt(hex[16], 16) & 3];
	const h = hex.join("");
	return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
}

/** Names for the instances a change makes. */
interface Ids {
	ref(): InstanceRef;
	uniqueId(): string;
}

/**
 * New referents, past every one in the file, and new UniqueIds as Studio
 * makes them in a session: one random part and the time, counting up after.
 */
function idsFor(doc: RbxDocument): Ids {
	const taken = new Set(doc.instances.map((inst) => inst.ref));
	let last = Math.max(
		-1,
		...doc.instances.map((inst) => (typeof inst.ref === "number" ? inst.ref : -1)),
	);
	const since2021 = Math.floor((Date.now() - Date.UTC(2021, 0, 1)) / 1000);
	const session = randomHex(8) + (since2021 >>> 0).toString(16).padStart(8, "0");
	let index = 0;
	return {
		ref() {
			if (doc.format === "binary") return ++last;
			for (;;) {
				const ref = `RBX${randomHex(16).toUpperCase()}`;
				if (!taken.has(ref)) {
					taken.add(ref);
					return ref;
				}
			}
		},
		uniqueId: () => session + (++index).toString(16).padStart(8, "0"),
	};
}

/** A new instance's own identity, wherever its other values came from. */
function renew(props: Map<string, Prop>, ids: Ids) {
	if (props.has("UniqueId")) props.set("UniqueId", { type: "UniqueId", value: ids.uniqueId() });
	if (props.has("HistoryId")) props.set("HistoryId", { type: "UniqueId", value: NO_HISTORY });
	const guid = props.get("ScriptGuid");
	if (guid) props.set("ScriptGuid", { type: guid.type, value: utf8.encode(scriptGuid()) });
}

/**
 * What a new `className` holds. In a place with one already, that one's
 * properties, as a binary place has a column for each: the default where
 * there is one, nothing in a reference, and otherwise its value. In a place
 * with none, the defaults.
 */
function newProps(doc: RbxDocument, className: string, name: string, ids: Ids): Map<string, Prop> {
	const chain = classChain(className);
	const defaults = classDefaults(className, chain) ?? baseDefaults(chain);
	const peer = doc.instances.find((inst) => inst.className === className);
	const props = new Map<string, Prop>();
	if (peer) {
		for (const [key, prop] of peer.props) {
			const given = defaults.get(key);
			if (given)
				props.set(
					key,
					given.type === prop.type ? given : { type: prop.type, value: blank(prop.type) },
				);
			else props.set(key, prop.type === "Ref" ? { type: "Ref", value: null } : prop);
		}
	} else {
		for (const [key, prop] of defaults) props.set(key, prop);
		if (doc.instances.some((inst) => inst.props.has("UniqueId")))
			props.set("UniqueId", { type: "UniqueId", value: "" });
		if (isSubclassOf(className, "LuaSourceContainer"))
			props.set("ScriptGuid", { type: "String", value: new Uint8Array(0) });
	}
	props.set("Name", { type: props.get("Name")?.type ?? "String", value: utf8.encode(name) });
	renew(props, ids);
	return props;
}

/** What a change did to the document, which is then what the file should hold. */
interface Applied {
	/** Instances it made, each parent before its children. */
	added: RbxInstance[];
	/** Instances it took out, with everything under them. */
	removed: Set<RbxInstance>;
	/** Instances whose references to a removed one now point at nothing. */
	cleared: Set<RbxInstance>;
	/** For a duplicate, each instance copied and its copy, parents first. */
	copies: Map<RbxInstance, RbxInstance>;
	/** The instance made or moved. */
	focus: RbxInstance | undefined;
}

function detach(inst: RbxInstance) {
	const siblings = inst.parent!.children;
	siblings.splice(siblings.indexOf(inst), 1);
}

function apply(doc: RbxDocument, change: InstanceChange<RbxInstance>, ids: Ids): Applied {
	const applied: Applied = {
		added: [],
		removed: new Set(),
		cleared: new Set(),
		copies: new Map(),
		focus: undefined,
	};
	switch (change.kind) {
		case "add": {
			const { parent, className, name } = change;
			const inst: RbxInstance = {
				className,
				name,
				parent,
				children: [],
				props: newProps(doc, className, name, ids),
				service: false,
				ref: ids.ref(),
			};
			parent.children.push(inst);
			applied.added.push(inst);
			applied.focus = inst;
			break;
		}
		case "delete": {
			for (const inst of walk([change.target])) applied.removed.add(inst);
			detach(change.target);
			doc.instances = doc.instances.filter((inst) => !applied.removed.has(inst));
			// As Studio does: what pointed at a deleted instance points at nothing.
			for (const inst of doc.instances)
				for (const [name, prop] of inst.props)
					if (prop.type === "Ref" && applied.removed.has(prop.value as RbxInstance)) {
						inst.props.set(name, { type: "Ref", value: null });
						applied.cleared.add(inst);
					}
			break;
		}
		case "move": {
			const { target, parent } = change;
			detach(target);
			target.parent = parent;
			parent.children.push(target);
			applied.focus = target;
			break;
		}
		case "duplicate": {
			const copy = (from: RbxInstance, parent: RbxInstance): RbxInstance => {
				const props = new Map(from.props);
				renew(props, ids);
				const inst: RbxInstance = {
					className: from.className,
					name: from.name,
					parent,
					children: [],
					props,
					service: false,
					ref: ids.ref(),
				};
				applied.copies.set(from, inst);
				applied.added.push(inst);
				for (const child of from.children) inst.children.push(copy(child, inst));
				return inst;
			};
			const { target } = change;
			const siblings = target.parent!.children;
			const root = copy(target, target.parent!);
			siblings.splice(siblings.indexOf(target) + 1, 0, root);
			// A reference inside the copied tree points into the copy.
			for (const inst of applied.added)
				for (const [name, prop] of inst.props) {
					const to =
						prop.type === "Ref" ? applied.copies.get(prop.value as RbxInstance) : undefined;
					if (to) inst.props.set(name, { type: "Ref", value: to });
				}
			applied.focus = root;
			break;
		}
	}
	doc.instances.push(...applied.added);
	return applied;
}

// ---------------------------------------------------------------------------
// The change, in the file
// ---------------------------------------------------------------------------

/**
 * The place with `change` made, and the referent of the instance it made or
 * moved. Throws `RbxError`, leaving nothing changed, for a change Studio would
 * not make or a place this cannot write it into.
 */
export function changeInstances(
	bytes: Uint8Array,
	change: InstanceChange,
): { bytes: Uint8Array; ref: InstanceRef | undefined } {
	const doc = readRbx(bytes);
	const byRef = new Map(doc.instances.map((inst) => [inst.ref, inst]));
	const find = (ref: InstanceRef) => {
		const inst = ref === undefined ? undefined : byRef.get(ref);
		if (!inst) throw new RbxError("That instance is no longer in the place");
		return inst;
	};
	const resolved: InstanceChange<RbxInstance> =
		change.kind === "add"
			? { ...change, parent: find(change.parent) }
			: change.kind === "move"
				? { ...change, target: find(change.target), parent: find(change.parent) }
				: { ...change, target: find(change.target) };
	const problem = changeProblem(resolved);
	if (problem) throw new RbxError(problem);

	const before = [...doc.instances];
	const applied = apply(doc, resolved, idsFor(doc));
	const out =
		doc.format === "binary"
			? writeBinary(bytes, before, doc, applied)
			: utf8.encode(writeXml(text.decode(bytes), resolved, applied));
	readsBack(out, doc);
	return { bytes: out, ref: applied.focus?.ref };
}

function joined(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

function writeBinary(
	bytes: Uint8Array,
	before: readonly RbxInstance[],
	doc: RbxDocument,
	applied: Applied,
): Uint8Array {
	const chunks = readChunks(bytes);
	const opened = chunks.map((chunk) =>
		chunk.name === "INST" || chunk.name === "PROP" || chunk.name === "PRNT" || chunk.name === "SSTR"
			? chunkData(chunk)
			: undefined,
	);
	const label = (data: Uint8Array) => text.decode(data.subarray(8, 8 + u32(data, 4)));

	// The file's classes by number, and a property of each the reader skipped.
	const classOf = new Map<number, string>();
	const unread = new Map<string, string>();
	const sample = new Map<string, RbxInstance>();
	for (const inst of before) if (!sample.has(inst.className)) sample.set(inst.className, inst);
	chunks.forEach((chunk, at) => {
		const data = opened[at];
		if (chunk.name === "INST") classOf.set(u32(data!, 0), label(data!));
		if (chunk.name !== "PROP") return;
		const className = classOf.get(u32(data!, 0));
		const prop = label(data!);
		const one = className === undefined ? undefined : sample.get(className);
		if (className && one && !one.props.has(prop) && !unread.has(className))
			unread.set(className, prop);
	});
	const idOfFile = new Map([...classOf].map(([id, name]) => [name, id]));

	// Every class with an instance left, and those this change touched.
	const members = new Map<string, RbxInstance[]>();
	for (const inst of doc.instances) {
		const list = members.get(inst.className);
		if (list) list.push(inst);
		else members.set(inst.className, [inst]);
	}
	const touched = new Set<string>();
	for (const inst of [...applied.added, ...applied.removed, ...applied.cleared])
		touched.add(inst.className);

	// Referents run from nought to one short of the count, or Studio will not
	// open the file: one past the end moves into the gap a deleted one left,
	// and its class, and every class pointing at it, is written again.
	const count = doc.instances.length;
	const byFileRef = new Map(doc.instances.map((inst) => [inst.ref as number, inst]));
	const usedRefs = new Set<number>();
	for (const inst of doc.instances)
		if ((inst.ref as number) < count) usedRefs.add(inst.ref as number);
	const gaps: number[] = [];
	for (let r = 0; r < count; r++) if (!usedRefs.has(r)) gaps.push(r);
	const renumbered = new Set<RbxInstance>();
	for (const inst of doc.instances)
		if ((inst.ref as number) >= count) {
			inst.ref = gaps.shift()!;
			renumbered.add(inst);
			touched.add(inst.className);
		}
	if (renumbered.size)
		for (const inst of doc.instances)
			for (const prop of inst.props.values())
				if (prop.type === "Ref" && renumbered.has(prop.value as RbxInstance))
					touched.add(inst.className);
	const rewritten = [...touched].filter((name) => members.has(name));
	for (const name of rewritten) {
		const prop = unread.get(name);
		if (prop)
			throw new RbxError(
				`${name}.${prop} is stored in a way Roswaal does not read yet, so the place was left as it was`,
			);
	}

	// Class numbers run from nought with no gaps: a new class takes the place
	// of an emptied one, and a class numbered past the end moves into the rest.
	const total = members.size;
	const idOf = new Map<string, number>();
	for (const [name, id] of idOfFile) if (members.has(name)) idOf.set(name, id);
	const used = new Set(idOf.values());
	const holes: number[] = [];
	for (let id = 0; id < total; id++) if (!used.has(id)) holes.push(id);
	const newClasses = [...members.keys()].filter((name) => !idOfFile.has(name));
	for (const name of newClasses) idOf.set(name, holes.shift()!);
	for (const [name, id] of idOf) if (id >= total) idOf.set(name, holes.shift()!);

	// The shared strings the file has, in its order, so the indices it holds stay right.
	const shared = new SharedStrings();
	const tableAt = chunks.findIndex((chunk) => chunk.name === "SSTR");
	if (tableAt !== -1) {
		const data = opened[tableAt]!;
		let p = 8;
		const entries: { bytes: Uint8Array; hash: Uint8Array }[] = [];
		for (let i = 0; i < u32(data, 4); i++) {
			const hash = data.subarray(p, p + 16);
			const length = u32(data, p + 16);
			entries.push({ hash, bytes: data.subarray(p + 20, p + 20 + length) });
			p += 20 + length;
		}
		shared.seed(entries);
	}
	const seeded = shared.values.length;

	const ref = new Map(doc.instances.map((inst) => [inst, inst.ref as number]));
	const written = new Map(
		rewritten.map((name) => [
			name,
			classChunks(idOf.get(name)!, name, members.get(name)!, ref, shared),
		]),
	);

	let table: Uint8Array | undefined;
	if (shared.values.length > seeded) {
		const t = new Bytes();
		t.u32(tableAt === -1 ? 0 : u32(opened[tableAt]!, 0));
		t.u32(shared.values.length);
		for (const v of shared.values) {
			t.bytes(v.hash);
			t.string(v.bytes);
		}
		table = sealChunk("SSTR", t.done());
	}

	const header = bytes.slice(0, FIRST_CHUNK);
	putU32(header, 16, total);
	putU32(header, 20, doc.instances.length);
	const parts: Uint8Array[] = [header];
	const lastInst = chunks.map((chunk) => chunk.name).lastIndexOf("INST");
	let parented = false;
	chunks.forEach((chunk, at) => {
		const data = opened[at];
		if (chunk.name === "SSTR") {
			parts.push(table ?? chunk.whole);
			table = undefined;
		} else if (chunk.name === "INST" || chunk.name === "PROP") {
			if (table && chunk.name === "INST") {
				parts.push(table);
				table = undefined;
			}
			const name = classOf.get(u32(data!, 0))!;
			const again = written.get(name);
			const id = idOf.get(name);
			if (chunk.name === "INST" && again) parts.push(again.inst);
			else if (!again && id !== undefined) {
				// A class this change left alone, renumbered if it moved.
				if (id === u32(data!, 0)) parts.push(chunk.whole);
				else {
					const copy = data!.slice();
					putU32(copy, 0, id);
					parts.push(sealChunk(chunk.name, copy));
				}
			}
			if (at === lastInst) for (const name of newClasses) parts.push(written.get(name)!.inst);
		} else if (chunk.name === "PRNT") {
			for (const again of written.values()) parts.push(...again.props);
			parts.push(parents(data!, byFileRef, applied));
			parented = true;
		} else parts.push(chunk.whole);
	});
	if (!parented) throw new RbxError("the file has no PRNT chunk");
	return joined(parts);
}

/** The parent table again: each pair the file had, with its parent as it now is, then the new ones. */
function parents(data: Uint8Array, live: Map<number, RbxInstance>, applied: Applied): Uint8Array {
	const count = u32(data, 1);
	const children = readReferents(data, 5, count);
	const pairs: RbxInstance[] = [];
	for (const child of children) {
		const inst = live.get(child);
		if (inst && !applied.added.includes(inst)) pairs.push(inst);
	}
	pairs.push(...applied.added);
	const w = new Bytes();
	w.u8(data[0]);
	w.u32(pairs.length);
	w.referents(pairs.map((inst) => inst.ref as number));
	w.referents(pairs.map((inst) => (inst.parent ? (inst.parent.ref as number) : -1)));
	return sealChunk("PRNT", w.done());
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

function itemsByRef(root: XmlElement): Map<string, XmlElement> {
	const out = new Map<string, XmlElement>();
	const visit = (el: XmlElement) => {
		if (el.name === "Item" && el.attrs.referent) out.set(el.attrs.referent, el);
		el.children.forEach(visit);
	};
	visit(root);
	return out;
}

/** Where an Item's text is: its opening tag to past its closing one, and the indent of its line. */
function itemSpan(source: string, el: XmlElement): { from: number; to: number; indent: string } {
	const from = source.lastIndexOf("<Item", el.start);
	const lineStart = source.lastIndexOf("\n", from) + 1;
	const lead = source.slice(lineStart, from);
	return { from, to: el.end + "</Item>".length, indent: /^[ \t]*$/.test(lead) ? lead : "" };
}

/** `from` to `to` widened to take the line break and indent before it, when it has a line of its own. */
function wholeLine(source: string, from: number, to: number, indent: string): [number, number] {
	let start = from - indent.length;
	if (source[start - 1] === "\n") start--;
	if (source[start - 1] === "\r") start--;
	return source.slice(start, from).trim() === "" ? [start, to] : [from, to];
}

/** The source with `item(indent)` as the last child of the Item `parent` names. */
function insertChild(
	source: string,
	parent: string,
	item: (indent: string, newline: string) => string,
): string {
	const el = itemsByRef(parseXml(source)).get(parent);
	if (!el) throw new RbxError("That instance is no longer in the place");
	const { indent } = itemSpan(source, el);
	const at = el.end;
	const newline = source.includes("\r\n") ? "\r\n" : "\n";
	const laidOut = source.slice(at - indent.length - 1, at) === `\n${indent}`;
	if (!laidOut) return source.slice(0, at) + item("", "") + source.slice(at);
	return `${source.slice(0, at)}\t${item(`${indent}\t`, newline)}${newline}${indent}${source.slice(at)}`;
}

/** Splices, made from the last back so each one's place stays right. */
function spliced(source: string, edits: { from: number; to: number; text: string }[]): string {
	let out = source;
	for (const e of [...edits].sort((a, b) => b.from - a.from))
		out = out.slice(0, e.from) + e.text + out.slice(e.to);
	return out;
}

function writeXml(source: string, change: InstanceChange<RbxInstance>, applied: Applied): string {
	const items = itemsByRef(parseXml(source));
	const elementOf = (inst: RbxInstance) => {
		const el = items.get(String(inst.ref));
		if (!el) throw new RbxError(`${inst.name} has no referent in the file`);
		return el;
	};

	switch (change.kind) {
		case "add": {
			const inst = applied.focus!;
			const shared = new SharedStrings();
			const referent = (i: RbxInstance) => (typeof i.ref === "string" ? i.ref : undefined);
			const props = [...inst.props]
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([name, prop]) => xmlProperty(inst.className, name, prop, referent, shared));
			let out = insertChild(source, String(change.parent.ref), (indent, nl) =>
				[
					`<Item class="${inst.className}" referent="${inst.ref}">`,
					`${indent}\t<Properties>`,
					...props.map((p) => `${indent}\t\t${p}`),
					`${indent}\t</Properties>`,
					`${indent}</Item>`,
				].join(nl),
			);
			for (const v of shared.values) out = withSharedXml(out, v.key, v.bytes);
			return out;
		}
		case "delete": {
			const span = itemSpan(source, elementOf(change.target));
			const [from, to] = wholeLine(source, span.from, span.to, span.indent);
			const gone = new Set([...applied.removed].map((inst) => String(inst.ref)));
			const edits = [{ from, to, text: "" }];
			// What pointed at a deleted instance points at nothing.
			const visit = (el: XmlElement) => {
				if (el.name === "Ref" && gone.has(el.text.trim()) && (el.start < from || el.start > to))
					edits.push({ from: el.start, to: el.end, text: "null" });
				el.children.forEach(visit);
			};
			visit(parseXml(source));
			return spliced(source, edits);
		}
		case "move": {
			const span = itemSpan(source, elementOf(change.target));
			const item = source.slice(span.from, span.to);
			const [from, to] = wholeLine(source, span.from, span.to, span.indent);
			const without = source.slice(0, from) + source.slice(to);
			return insertChild(without, String(change.parent.ref), (indent) =>
				span.indent ? item.split(`\n${span.indent}`).join(`\n${indent}`) : item,
			);
		}
		case "duplicate": {
			const span = itemSpan(source, elementOf(change.target));
			const original = source.slice(span.from, span.to);
			const fragment = parseXml(original);
			const pairs = [...applied.copies];
			const renamed = new Map(pairs.map(([from, to]) => [String(from.ref), String(to.ref)]));
			const edits: { from: number; to: number; text: string }[] = [];
			let n = 0;
			const visit = (el: XmlElement, copy: RbxInstance | undefined) => {
				if (el.name === "Item") {
					copy = pairs[n++]?.[1];
					if (!copy) throw new RbxError("the copy does not match the file");
					const open = original.lastIndexOf("<Item", el.start);
					const tag = original.slice(open, el.start);
					edits.push({
						from: open,
						to: el.start,
						text: tag.replace(/referent="[^"]*"/, `referent="${copy.ref}"`),
					});
				} else if (copy && el.attrs.name !== undefined) {
					const prop = el.attrs.name;
					if (el.name === "Ref" && renamed.has(el.text.trim()))
						edits.push({ from: el.start, to: el.end, text: renamed.get(el.text.trim())! });
					else if ((prop === "UniqueId" || prop === "HistoryId") && el.name === "UniqueId")
						edits.push({ from: el.start, to: el.end, text: String(copy.props.get(prop)!.value) });
					else if (prop === "ScriptGuid" && copy.props.get(prop)?.type === "String")
						edits.push({
							from: el.start,
							to: el.end,
							text: text.decode(copy.props.get(prop)!.value as Uint8Array),
						});
				}
				for (const child of el.children) visit(child, copy);
			};
			visit(fragment, undefined);
			const copied = spliced(original, edits);
			const nl = source.includes("\r\n") ? "\r\n" : "\n";
			const lead = span.indent || source[span.from - 1] === "\n" ? `${nl}${span.indent}` : "";
			return source.slice(0, span.to) + lead + copied + source.slice(span.to);
		}
	}
}

// ---------------------------------------------------------------------------
// Reading back
// ---------------------------------------------------------------------------

function sameValue(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a === "number" && typeof b === "number")
		return (Number.isNaN(a) && Number.isNaN(b)) || Math.fround(a) === Math.fround(b);
	if (a instanceof Uint8Array || b instanceof Uint8Array)
		return (
			a instanceof Uint8Array &&
			b instanceof Uint8Array &&
			a.length === b.length &&
			a.every((x, i) => x === b[i])
		);
	if (Array.isArray(a) || Array.isArray(b))
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((x, i) => sameValue(x, b[i]))
		);
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	// An instance, from a reference: the same one if the file names it the same.
	if ("children" in a || "children" in b) return (a as RbxInstance).ref === (b as RbxInstance).ref;
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	return [...keys].every((k) =>
		sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
	);
}

/** Throws unless `out` reads back as `doc`: the same instances, parents and values. */
function readsBack(out: Uint8Array, doc: RbxDocument): void {
	const fail = (what: string): never => {
		throw new RbxError(`${what} did not read back as written, so the place was left as it was`);
	};
	const again = readRbx(out);
	if (again.instances.length !== doc.instances.length) fail("The place's instances");
	const byRef = new Map(again.instances.map((inst) => [inst.ref, inst]));
	for (const inst of doc.instances) {
		if (inst.ref === undefined) continue;
		const now = byRef.get(inst.ref);
		if (!now || now.className !== inst.className || now.parent?.ref !== inst.parent?.ref)
			fail(inst.name);
		if (now!.props.size !== inst.props.size) fail(inst.name);
		for (const [name, prop] of inst.props) {
			const read = now!.props.get(name);
			if (!read || !sameValue(prop.value, read.value)) fail(`${inst.name}.${name}`);
		}
	}
}
