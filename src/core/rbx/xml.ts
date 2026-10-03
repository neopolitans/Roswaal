/**
 * Reading Roblox's XML format: `.rbxlx` places and `.rbxmx` models.
 *
 * `<roblox>` holds `<Item class=".." referent="..">` elements, each with a
 * `<Properties>` block and its children as further items; `<SharedStrings>` at
 * the end holds the values `<SharedString>` properties point to. A property's
 * element name is its type.
 *
 * The XML parser is this file's own, not the browser's `DOMParser`: the reader
 * runs in the daemon and the CLI as well, and the subset Roblox writes --
 * elements, attributes, text, CDATA, entities, comments and a declaration -- is
 * small. Types it does not decode are counted in `undecoded`, as in
 * `binary.ts`, so the two readers leave out the same things.
 */

import { ENGINE } from "../robloxEngine.js";
import {
	asRbxError, type CFrameValue, type Prop, type PropType, type RbxDocument, RbxError, type RbxInstance,
} from "./dom.js";

export interface XmlElement {
	name: string;
	attrs: Record<string, string>;
	children: XmlElement[];
	text: string;
	/** Where the element's content starts and ends in the source, for splicing. */
	start: number;
	end: number;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
	if (!s.includes("&")) return s;
	return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, body: string) => {
		if (body[0] === "#") {
			const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			// Past the last code point, `fromCodePoint` throws; such a
			// reference is left as written.
			return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
		return ENTITIES[body] ?? whole;
	});
}

export function parseXml(src: string): XmlElement {
	let p = 0;
	const root: XmlElement = { name: "#document", attrs: {}, children: [], text: "", start: 0, end: src.length };
	const stack: XmlElement[] = [root];
	const fail = (what: string): never => {
		const line = src.slice(0, p).split("\n").length;
		throw new RbxError(`the XML ${what} on line ${line}`);
	};

	while (p < src.length) {
		const lt = src.indexOf("<", p);
		const top = stack[stack.length - 1];
		if (lt === -1) {
			top.text += decodeEntities(src.slice(p));
			break;
		}
		if (lt > p) top.text += decodeEntities(src.slice(p, lt));
		p = lt;
		if (src.startsWith("<!--", p)) {
			const end = src.indexOf("-->", p);
			if (end === -1) fail("has a comment that never closes");
			p = end + 3;
		} else if (src.startsWith("<![CDATA[", p)) {
			const end = src.indexOf("]]>", p);
			if (end === -1) fail("has a CDATA section that never closes");
			top.text += src.slice(p + 9, end);
			p = end + 3;
		} else if (src.startsWith("<?", p) || src.startsWith("<!", p)) {
			const end = src.indexOf(">", p);
			if (end === -1) fail("has a declaration that never closes");
			p = end + 1;
		} else if (src[p + 1] === "/") {
			const end = src.indexOf(">", p);
			if (end === -1) fail("has a closing tag that never closes");
			const name = src.slice(p + 2, end).trim();
			if (top.name !== name) fail(`closes <${name}> inside <${top.name}>`);
			top.end = p;
			stack.pop();
			p = end + 1;
		} else {
			const match = /^<([A-Za-z_][\w.:-]*)/.exec(src.slice(p, p + 256));
			if (!match) fail("has a tag that is not one");
			const el: XmlElement = { name: match![1], attrs: {}, children: [], text: "", start: 0, end: 0 };
			p += match![0].length;
			for (;;) {
				while (/\s/.test(src[p] ?? "")) p++;
				if (src[p] === ">") {
					p++;
					el.start = p;
					top.children.push(el);
					stack.push(el);
					break;
				}
				if (src.startsWith("/>", p)) {
					p += 2;
					el.start = el.end = p;
					top.children.push(el);
					break;
				}
				const attr = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(p, p + 4096));
				if (!attr) fail(`has a malformed attribute in <${el.name}>`);
				el.attrs[attr![1]] = decodeEntities(attr![3] ?? attr![4]);
				p += attr![0].length;
			}
		}
	}
	if (stack.length !== 1) throw new RbxError(`the XML ends inside <${stack[stack.length - 1].name}>`);
	return root;
}

const utf8 = new TextEncoder();

function base64(s: string): Uint8Array {
	const clean = s.replace(/\s+/g, "");
	const bin = atob(clean);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

const child = (el: XmlElement, name: string): string => el.children.find((c) => c.name === name)?.text.trim() ?? "0";
const num = (s: string): number => {
	const t = s.trim();
	if (t === "INF") return Infinity;
	if (t === "-INF") return -Infinity;
	if (t === "NAN") return NaN;
	return Number(t);
};

function cframe(el: XmlElement): CFrameValue {
	const r = ["R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"].map((n) => num(child(el, n)));
	return { position: [num(child(el, "X")), num(child(el, "Y")), num(child(el, "Z"))], rotation: r };
}

/** A property element's value, or undefined for a type this does not decode. */
function readValue(el: XmlElement, shared: Map<string, Uint8Array>): [PropType, unknown] | undefined {
	const t = el.text;
	switch (el.name) {
		case "string":
			return ["String", utf8.encode(t)];
		case "ProtectedString":
			return ["ProtectedString", utf8.encode(t)];
		case "BinaryString":
			return ["String", base64(t)];
		case "bool":
			return ["Bool", t.trim() === "true"];
		case "int":
			return ["Int32", num(t)];
		case "int64": {
			const digits = t.trim() || "0";
			if (!/^-?\d+$/.test(digits)) throw new RbxError(`an int64 property holds "${digits.slice(0, 40)}", which is not a whole number`);
			return ["Int64", BigInt(digits)];
		}
		case "float":
			return ["Float32", num(t)];
		case "double":
			return ["Float64", num(t)];
		case "token":
			return ["Enum", num(t)];
		case "BrickColor":
			return ["BrickColor", num(t)];
		case "Ref":
			return ["Ref", t.trim()];
		case "UniqueId":
			return ["UniqueId", t.trim().toLowerCase()];
		case "SharedString":
			return ["SharedString", shared.get(t.trim()) ?? new Uint8Array(0)];
		case "Vector2":
			return ["Vector2", [num(child(el, "X")), num(child(el, "Y"))]];
		case "Vector3":
			return ["Vector3", [num(child(el, "X")), num(child(el, "Y")), num(child(el, "Z"))]];
		case "Color3":
			return ["Color3", [num(child(el, "R")), num(child(el, "G")), num(child(el, "B"))]];
		case "Color3uint8": {
			const v = num(t) >>> 0;
			return ["Color3uint8", [(v >> 16) & 255, (v >> 8) & 255, v & 255]];
		}
		case "CoordinateFrame":
			return ["CFrame", cframe(el)];
		case "OptionalCoordinateFrame": {
			const cf = el.children.find((c) => c.name === "CFrame");
			return ["OptionalCFrame", cf ? cframe(cf) : null];
		}
		case "UDim":
			return ["UDim", [num(child(el, "S")), num(child(el, "O"))]];
		case "UDim2":
			return ["UDim2", [num(child(el, "XS")), num(child(el, "XO")), num(child(el, "YS")), num(child(el, "YO"))]];
		case "NumberRange": {
			const [a, b] = t.trim().split(/\s+/).map(num);
			return ["NumberRange", [a ?? 0, b ?? 0]];
		}
		case "Rect2D": {
			const min = el.children.find((c) => c.name === "min");
			const max = el.children.find((c) => c.name === "max");
			return ["Rect", [num(min ? child(min, "X") : "0"), num(min ? child(min, "Y") : "0"), num(max ? child(max, "X") : "0"), num(max ? child(max, "Y") : "0")]];
		}
		default:
			return undefined;
	}
}

const isServiceClass = (className: string): boolean =>
	(ENGINE.classes[className]?.tags ?? []).includes("Service");

/** Reads an XML place or model. Throws `RbxError` for a file it cannot read, and nothing else. */
export function readXml(source: string): RbxDocument {
	try {
		return decodeXml(source);
	} catch (error) {
		throw asRbxError(error, "the file is damaged");
	}
}

function decodeXml(source: string): RbxDocument {
	const doc = parseXml(source);
	const roblox = doc.children.find((c) => c.name === "roblox");
	if (!roblox) throw new RbxError("not a Roblox XML place or model: there is no <roblox> element");

	const shared = new Map<string, Uint8Array>();
	for (const block of roblox.children.filter((c) => c.name === "SharedStrings")) {
		for (const s of block.children) if (s.attrs.md5 !== undefined) shared.set(s.attrs.md5, base64(s.text));
	}

	const instances: RbxInstance[] = [];
	const byRef = new Map<string, RbxInstance>();
	const undecoded = new Map<string, number>();
	const pendingRefs: { inst: RbxInstance; prop: string; ref: string }[] = [];

	const build = (el: XmlElement, parent: RbxInstance | null): RbxInstance => {
		const className = el.attrs.class ?? "";
		const inst: RbxInstance = {
			className,
			name: className,
			parent,
			children: [],
			props: new Map(),
			service: parent === null && isServiceClass(className),
			...(el.attrs.referent ? { ref: el.attrs.referent } : {}),
		};
		instances.push(inst);
		if (el.attrs.referent) byRef.set(el.attrs.referent, inst);
		for (const part of el.children) {
			if (part.name === "Properties") {
				for (const propEl of part.children) {
					const propName = propEl.attrs.name;
					if (propName === undefined) continue;
					const decoded = readValue(propEl, shared);
					if (!decoded) {
						undecoded.set(propEl.name, (undecoded.get(propEl.name) ?? 0) + 1);
						continue;
					}
					const [type, value] = decoded;
					if (type === "Ref") {
						pendingRefs.push({ inst, prop: propName, ref: value as string });
						continue;
					}
					inst.props.set(propName, { type, value } satisfies Prop);
					if (propName === "Name") inst.name = new TextDecoder().decode(value as Uint8Array);
				}
			} else if (part.name === "Item") {
				inst.children.push(build(part, inst));
			}
		}
		return inst;
	};

	const roots = roblox.children.filter((c) => c.name === "Item").map((el) => build(el, null));
	for (const { inst, prop, ref } of pendingRefs) {
		inst.props.set(prop, { type: "Ref", value: byRef.get(ref) ?? null });
	}
	return { format: "xml", roots, instances, undecoded };
}
