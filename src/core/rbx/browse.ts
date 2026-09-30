/**
 * A place as the DataModel browser shows it: the tree in one compact answer,
 * and one instance's properties as text when it is picked.
 *
 * The editor never parses a place itself. The host does, once per version of
 * the file, and answers with names and classes; properties are formatted here
 * on request, so a place of ten thousand parts costs a list of names up front
 * and nothing more.
 */

import { ENGINE, type EngineProperty } from "../robloxEngine.js";
import { type Prop, type RbxDocument, type RbxInstance, text } from "./dom.js";

/**
 * The tree, depth first: each node is `[class, name, parent, flags]`, the
 * class an index into `classes`, the parent an index into `nodes` or -1.
 * Children follow the Explorer: services in its order, everything else by name.
 */
export interface PlaceOutline {
	classes: string[];
	nodes: [number, string, number, number][];
}

/** A service the Explorer keeps out of sight: empty and not one of its usual list. */
export const TUCKED = 1;

/** The services Studio's Explorer shows, in its order. */
const EXPLORER_SERVICES = [
	"Workspace", "Players", "Lighting", "MaterialService", "ReplicatedFirst", "ReplicatedStorage",
	"ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Teams",
	"SoundService", "TextChatService",
];

const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function sortedRoots(doc: RbxDocument): RbxInstance[] {
	const rank = (inst: RbxInstance) => {
		const i = EXPLORER_SERVICES.indexOf(inst.className);
		return i === -1 ? EXPLORER_SERVICES.length : i;
	};
	return [...doc.roots].sort((a, b) => rank(a) - rank(b) || byName.compare(a.name, b.name));
}

/** The outline, and the instances in the order its indices name them. */
export function outlinePlace(doc: RbxDocument): { outline: PlaceOutline; order: RbxInstance[] } {
	const classes: string[] = [];
	const classIndex = new Map<string, number>();
	const nodes: PlaceOutline["nodes"] = [];
	const order: RbxInstance[] = [];

	const visit = (inst: RbxInstance, parent: number, flags: number) => {
		let cls = classIndex.get(inst.className);
		if (cls === undefined) {
			cls = classes.push(inst.className) - 1;
			classIndex.set(inst.className, cls);
		}
		const index = nodes.push([cls, inst.name, parent, flags]) - 1;
		order.push(inst);
		const children = [...inst.children].sort((a, b) => byName.compare(a.name, b.name));
		for (const child of children) visit(child, index, 0);
	};
	for (const root of sortedRoots(doc)) {
		const usual = EXPLORER_SERVICES.includes(root.className);
		visit(root, -1, !usual && root.children.length === 0 ? TUCKED : 0);
	}
	return { outline: { classes, nodes }, order };
}

/**
 * A cheap identity for a place's bytes, so the host parses a file once per
 * version of it. Every byte counts: a place re-saved at the same length is
 * still a different place.
 */
export function fingerprint(bytes: Uint8Array): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	const words = Math.floor(bytes.length / 4);
	const view = new DataView(bytes.buffer, bytes.byteOffset, words * 4);
	for (let i = 0; i < words; i++) {
		const w = view.getUint32(i * 4, true);
		h1 = Math.imul(h1 ^ w, 0x01000193);
		h2 = Math.imul(h2 + w, 0x5bd1e995) ^ (h2 >>> 13);
	}
	for (let i = words * 4; i < bytes.length; i++) h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
	return `${bytes.length.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export interface PlaceProperty {
	/** As Studio names it, where the file stores it under another name. */
	name: string;
	/** The value's type, as the file stores it or as the attribute says. */
	type: string;
	value: string;
	/** Studio's Properties heading; "Attributes" and "Tags" for those. */
	category: string;
	/** A colour to draw beside the value, as `#rrggbb`. */
	color?: string;
	/** For a reference: the index of the instance it points at. */
	ref?: number;
}

export interface PlaceInstanceInfo {
	index: number;
	className: string;
	name: string;
	/** Names from the service down, its own last. */
	path: string[];
	/** The class's one-line description from the engine documentation. */
	summary?: string;
	properties: PlaceProperty[];
}

/** Studio's Properties headings, in its order; anything else after, by name. */
const CATEGORY_ORDER = ["Data", "Appearance", "Text", "Image", "Behavior", "Part", "Transform", "Pivot", "Collision", "Assembly", "Character", "Physics", "Surface"];
const LAST = ["Other", "Tags", "Attributes"];

/** Properties under their headings, the headings in the order Studio shows them. */
export function groupProperties(properties: readonly PlaceProperty[]): [string, PlaceProperty[]][] {
	const by = new Map<string, PlaceProperty[]>();
	for (const p of properties) {
		const list = by.get(p.category);
		if (list) list.push(p);
		else by.set(p.category, [p]);
	}
	const rank = (c: string) => {
		const i = CATEGORY_ORDER.indexOf(c);
		if (i !== -1) return i;
		const j = LAST.indexOf(c);
		return j === -1 ? CATEGORY_ORDER.length : CATEGORY_ORDER.length + 1 + j;
	};
	return [...by].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

export const isScriptClass = (cls: string) => cls === "Script" || cls === "LocalScript" || cls === "ModuleScript";

/**
 * Containers Studio makes for you inside a service: not services themselves,
 * but special in the same way, so the same blue folder.
 */
const CONTAINERS = new Set(["StarterPlayerScripts", "StarterCharacterScripts", "StarterGear"]);

/**
 * The glyph an instance is drawn with, and the class that colours it: the
 * project tree's for the same thing, and a cube for the rest.
 */
export function classGlyph(className: string, service: boolean, open: boolean): { icon: string; tone: string } {
	if (isScriptClass(className)) {
		const tone = className === "Script" ? "server" : className === "LocalScript" ? "local" : "module";
		return { icon: "luauScript", tone: `luau tree-script-${tone}` };
	}
	const folder = open ? "folderOpen" : "folder";
	if (service || CONTAINERS.has(className)) return { icon: folder, tone: "tree-folder-special" };
	if (className === "Folder") return { icon: folder, tone: "tree-folder-plain" };
	return { icon: "instance", tone: "place-instance" };
}

/** Stored under one name, shown under Studio's. */
const RENAMED: Record<string, string> = {
	Color3uint8: "Color",
	formFactorRaw: "FormFactor",
	MaterialVariantSerialized: "MaterialVariant",
};

/** Kept in the file for Studio's own bookkeeping; nothing a developer reads. */
const INTERNAL = new Set(["AttributesSerialize", "Tags", "SourceAssetId", "HistoryId", "ScriptGuid", "UniqueId", "Capabilities", "DefinesCapabilities"]);

function engineProperty(className: string, name: string): EngineProperty | undefined {
	const lower = name.toLowerCase();
	for (let cls: string | undefined = className; cls; cls = ENGINE.classes[cls]?.superclass) {
		const found = ENGINE.classes[cls]?.properties.find((p) => p.name.toLowerCase() === lower);
		if (found) return found;
	}
	return undefined;
}

const num = (n: number) => {
	if (!Number.isFinite(n)) return String(n);
	const r = Math.round(n * 1000) / 1000;
	return Object.is(r, -0) ? "0" : String(r);
};

const hex = (rgb: number[]) => "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");

/** Studio's Orientation: the rotation as degrees about X, Y and Z, applied Y, X, Z. */
function orientation(r: number[]): number[] {
	const deg = 180 / Math.PI;
	const rx = Math.asin(Math.max(-1, Math.min(1, -r[5])));
	const ry = Math.atan2(r[2], r[8]);
	const rz = Math.atan2(r[3], r[4]);
	return [rx * deg, ry * deg, rz * deg];
}

function cframe(value: { position: number[]; rotation: number[] }): string {
	const at = value.position.map(num).join(", ");
	const turned = orientation(value.rotation);
	return turned.every((d) => Math.abs(d) < 0.0005) ? at : `${at} · turned ${turned.map(num).join(", ")}°`;
}

/** Printable text, or undefined for bytes that are not. */
function printable(bytes: Uint8Array): string | undefined {
	const s = text(bytes);
	// eslint-disable-next-line no-control-regex
	if (s.includes("�") || /[\x00-\x08\x0e-\x1f]/.test(s)) return undefined;
	return s;
}

const clip = (s: string, n = 240) => (s.length > n ? s.slice(0, n) + "…" : s);

function enumName(enumType: string | undefined, value: number): string | undefined {
	const items = enumType ? ENGINE.enums[enumType]?.items : undefined;
	return items?.find((i) => i.value === value)?.name;
}

function formatValue(
	prop: Prop, name: string, engine: EngineProperty | undefined, indexOf: (inst: RbxInstance) => number | undefined,
): Pick<PlaceProperty, "value" | "color" | "ref"> {
	const v = prop.value as never;
	switch (prop.type) {
		case "String":
		case "ProtectedString": {
			const bytes = prop.value as Uint8Array;
			if (name === "Source") {
				const lines = bytes.length === 0 ? 0 : text(bytes).split("\n").length;
				return { value: `${lines} line${lines === 1 ? "" : "s"} of Luau` };
			}
			const s = printable(bytes);
			return { value: s === undefined ? `${bytes.length} bytes` : clip(s) };
		}
		case "Bool":
			return { value: String(v) };
		case "Int32":
		case "Int64":
			return { value: String(v) };
		case "Float32":
		case "Float64":
			return { value: num(v) };
		case "Enum": {
			const named = enumName(engine?.type, v);
			return { value: named ? `${named} (${v})` : String(v) };
		}
		case "BrickColor":
			return { value: `BrickColor ${v}` };
		case "Ref": {
			const target = prop.value as RbxInstance | null;
			if (!target) return { value: "nil" };
			const index = indexOf(target);
			return { value: target.name, ...(index === undefined ? {} : { ref: index }) };
		}
		case "UniqueId":
			return { value: String(v) };
		case "SharedString":
			return { value: `${(prop.value as Uint8Array).length} bytes, shared` };
		case "Vector2":
		case "Vector3":
		case "NumberRange":
		case "Rect":
			return { value: (prop.value as number[]).map(num).join(", ") };
		case "Color3": {
			const rgb = (prop.value as number[]).map((c) => c * 255);
			return { value: rgb.map((c) => String(Math.round(c))).join(", "), color: hex(rgb) };
		}
		case "Color3uint8": {
			const rgb = prop.value as number[];
			return { value: rgb.join(", "), color: hex(rgb) };
		}
		case "CFrame":
			return { value: cframe(prop.value as never) };
		case "OptionalCFrame":
			return { value: prop.value ? cframe(prop.value as never) : "nil" };
		case "UDim": {
			const [s, o] = prop.value as number[];
			return { value: `${num(s)}, ${o}` };
		}
		case "UDim2": {
			const [sx, ox, sy, oy] = prop.value as number[];
			return { value: `{${num(sx)}, ${ox}}, {${num(sy)}, ${oy}}` };
		}
	}
	return { value: "" };
}

/** Everything the browser shows about one instance. */
export function describeInstance(
	inst: RbxInstance, index: number, indexOf: (inst: RbxInstance) => number | undefined,
): PlaceInstanceInfo {
	const properties: PlaceProperty[] = [];
	for (const [stored, prop] of inst.props) {
		if (INTERNAL.has(stored)) continue;
		const engine = engineProperty(inst.className, RENAMED[stored] ?? stored);
		const name = engine?.name ?? RENAMED[stored] ?? stored;
		properties.push({
			name,
			type: prop.type,
			category: engine?.category || "Other",
			...formatValue(prop, stored, engine, indexOf),
		});
	}
	const tags = inst.props.get("Tags")?.value;
	if (tags instanceof Uint8Array && tags.length) {
		for (const tag of text(tags).split("\0").filter(Boolean)) {
			properties.push({ name: tag, type: "Tag", value: "", category: "Tags" });
		}
	}
	const attributes = inst.props.get("AttributesSerialize")?.value;
	if (attributes instanceof Uint8Array && attributes.length > 4) properties.push(...readAttributes(attributes));

	const path: string[] = [];
	for (let cur: RbxInstance | null = inst; cur; cur = cur.parent) path.unshift(cur.name);
	const summary = ENGINE.classes[inst.className]?.summary;
	return {
		index,
		className: inst.className,
		name: inst.name,
		path,
		...(summary ? { summary } : {}),
		properties: properties.sort((a, b) => byName.compare(a.name, b.name)),
	};
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

/**
 * `AttributesSerialize`, as Studio writes it: a count, then a name, a type
 * byte and a value for each. Only the types below are read; the first one that
 * is not ends the list with a line saying so, since the length of an unknown
 * value cannot be known and a guess would misread every attribute after it.
 */
export function readAttributes(bytes: Uint8Array): PlaceProperty[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let p = 0;
	const need = (n: number) => {
		if (p + n > bytes.length) throw new RangeError("attribute runs past the end");
	};
	const u8 = () => (need(1), bytes[p++]);
	const u32 = () => (need(4), (p += 4), view.getUint32(p - 4, true));
	const i32 = () => (need(4), (p += 4), view.getInt32(p - 4, true));
	const f32 = () => (need(4), (p += 4), view.getFloat32(p - 4, true));
	const f64 = () => (need(8), (p += 8), view.getFloat64(p - 8, true));
	const str = () => {
		const n = u32();
		need(n);
		p += n;
		return text(bytes.subarray(p - n, p));
	};
	const floats = (n: number) => Array.from({ length: n }, f32);

	const out: PlaceProperty[] = [];
	const add = (name: string, type: string, value: string, color?: string) =>
		out.push({ name, type, value, category: "Attributes", ...(color ? { color } : {}) });
	try {
		const count = u32();
		for (let i = 0; i < count; i++) {
			const name = str();
			const type = u8();
			switch (type) {
				case 0x02: add(name, "string", clip(str())); break;
				case 0x03: add(name, "boolean", String(u8() !== 0)); break;
				case 0x04: add(name, "number", String(i32())); break;
				case 0x05: add(name, "number", num(f32())); break;
				case 0x06: add(name, "number", num(f64())); break;
				case 0x09: { const s = f32(); add(name, "UDim", `${num(s)}, ${i32()}`); break; }
				case 0x0a: {
					const sx = f32(), ox = i32(), sy = f32(), oy = i32();
					add(name, "UDim2", `{${num(sx)}, ${ox}}, {${num(sy)}, ${oy}}`);
					break;
				}
				case 0x0e: add(name, "BrickColor", `BrickColor ${u32()}`); break;
				case 0x0f: {
					const rgb = floats(3).map((c) => c * 255);
					add(name, "Color3", rgb.map((c) => String(Math.round(c))).join(", "), hex(rgb));
					break;
				}
				case 0x10: add(name, "Vector2", floats(2).map(num).join(", ")); break;
				case 0x11: add(name, "Vector3", floats(3).map(num).join(", ")); break;
				case 0x14: {
					const position = floats(3);
					const id = u8();
					const rotation = id === 0 ? floats(9) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
					// A non-zero id names one of the axis-aligned rotations,
					// which are not worth a table here: say where it is.
					add(name, "CFrame", id === 0 ? cframe({ position, rotation }) : `${position.map(num).join(", ")} · turned`);
					break;
				}
				case 0x15: {
					const enumType = str();
					const value = u32();
					add(name, "EnumItem", `Enum.${enumType}.${enumName(enumType, value) ?? value}`);
					break;
				}
				case 0x17: {
					const n = u32();
					const keys = Array.from({ length: n }, () => floats(3));
					add(name, "NumberSequence", `${n} keypoint${n === 1 ? "" : "s"}, ${keys.map((k) => num(k[2])).join(" → ")}`);
					break;
				}
				case 0x19: {
					const n = u32();
					for (let k = 0; k < n; k++) floats(5);
					add(name, "ColorSequence", `${n} keypoint${n === 1 ? "" : "s"}`);
					break;
				}
				case 0x1b: add(name, "NumberRange", floats(2).map(num).join(", ")); break;
				case 0x1c: add(name, "Rect", floats(4).map(num).join(", ")); break;
				default:
					add(name, "?", "not read");
					if (count - i - 1 > 0) add("…", "?", `${count - i - 1} more not read`);
					return out;
			}
		}
	} catch {
		add("…", "?", "the rest could not be read");
	}
	return out;
}
