/**
 * What the code editor says about the name under the pointer.
 *
 * `Instance.new("Part")` returns a Part, and hovering `new` says so, with what
 * a Part is and a link to its page. The same for a class written as a string,
 * a class or datatype named in the code, a datatype's constructor or constant,
 * a local whose declaration says what it holds, and a property read off one.
 *
 * Pure, and in core, so it can be tested without an editor: the editor only
 * draws what this returns.
 */

import {
	classOfGlobal, eventsOf, heldBy, membersInCode, methodsOf, signatureOf, stringValue, typeOfValue,
	type TableMember,
} from "./infer.js";
import { ENGINE, signatureText } from "../robloxEngine.js";
import { docCommentBefore, docFor, type DocComment } from "./docComment.js";
import { tokenize } from "./lexer.js";
import { declarationAt, localsAt, localsInFile, type LocalKind } from "./scope.js";
import { parseChunk } from "./parser.js";
import type { Stat } from "./ast.js";
import { CLASSES, DATATYPES } from "../robloxData.js";
import { propertiesOf } from "../robloxProperties.js";
import { nilableProperty } from "../robloxNilable.js";
import { CLASS_SUMMARIES, DATATYPE_STATICS, DATATYPE_SUMMARIES } from "../robloxStatics.js";

export interface Hover {
	/** The span of source the hover describes. */
	from: number;
	to: number;
	/** The name and its type, as Luau-ish code: `INPUT2: string`, `Instance.new(className: string) → Part`. */
	code: string;
	/** What kind of name it is — local, parameter, class, property — shown under the code. */
	role?: string;
	summary?: string;
	link?: { label: string; href: string };
	/** The code's own documentation comment for it, when it has one. */
	doc?: DocComment;
}

const DOCS = "https://create.roblox.com/docs/reference/engine";
const CLASS_SET = new Set(CLASSES);
const DATATYPE_SET = new Set(DATATYPES);

/** Calls whose first string argument is a class name. */
const CLASS_CALL = /(Instance\.new|:IsA|:FindFirstChildOfClass|:FindFirstChildWhichIsA|:FindFirstAncestorOfClass|:FindFirstAncestorWhichIsA|:GetService)\s*\(\s*$/;

function classLink(name: string): Hover["link"] {
	return { label: `${name} - Roblox Creator Docs`, href: `${DOCS}/classes/${name}` };
}

function datatypeLink(name: string): Hover["link"] {
	return { label: `${name} - Roblox Creator Docs`, href: `${DOCS}/datatypes/${name}` };
}

function enumLink(name: string): Hover["link"] {
	return { label: `${name} - Roblox Creator Docs`, href: `${DOCS}/enums/${name}` };
}

function aboutClass(name: string, from: number, to: number, code = name, role = "class"): Hover {
	return { from, to, code, role, summary: CLASS_SUMMARIES[name], link: classLink(name) };
}

/** How each kind of local is named under its type. */
const LOCAL_ROLE: Record<LocalKind, string> = {
	local: "local",
	function: "local function",
	parameter: "parameter",
	"loop variable": "loop variable",
};

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);

/**
 * A signature with the types its doc comment gives, where the code gives none:
 * `(...) -> ()` under `@param ... any` and `@return Promise<...any>` reads
 * `(...: any) -> Promise<...any>`. Types written in the code win.
 */
export function withDocTypes(detail: string, doc: DocComment | undefined): string {
	const parts = /^\((.*)\) -> (.*)$/.exec(detail);
	if (!doc || !parts) return detail;
	let [, params, returns] = parts;
	if (params && !params.includes(":")) {
		params = params.split(", ").map((name) => {
			const param = doc.params.find((p) => p.name === name || p.name === `${name}?`);
			if (!param?.type) return name;
			if (!param.name.endsWith("?")) return `${name}: ${param.type}`;
			return `${name}: ${param.type.includes("->") ? `(${param.type})` : param.type}?`;
		}).join(", ");
	}
	if (returns === "()" && doc.returns.length) {
		const types = doc.returns.map((r) => r.type);
		returns = types.length === 1 ? types[0] : `(${types.join(", ")})`;
	}
	return `(${params}) -> ${returns}`;
}

/** A member put on a table by the code or the graph: `Occupancy.value: (tank: Model) -> (Instance)`. */
function aboutMember(owner: string, member: TableMember, from: number, to: number): Hover {
	const detail = withDocTypes(member.detail, member.doc);
	return {
		from, to,
		code: `${owner}${member.kind === "method" ? ":" : "."}${member.name}${detail ? `: ${detail}` : ""}`,
		role: member.kind,
		...(member.doc ? { doc: member.doc } : {}),
	};
}

/** The names before `end`, joined by dots: `Promise.prototype` in `Promise.prototype:andThen`. */
function chainBefore(src: string, end: number): { chain: string; from: number } {
	let from = end;
	for (;;) {
		let start = from;
		while (isWordChar(src[start - 1])) start--;
		if (start === from) break;
		from = start;
		if (src[from - 1] !== "." || !isWordChar(src[from - 2])) break;
		from--;
	}
	return { chain: src.slice(from, end), from };
}

/**
 * `tableMembers` is what the graph puts on its tables, for code typed into a
 * graph: functions a Declare Function attaches to a table variable. A file on
 * its own has no graph, and its own `function Table.name` statements are read
 * from the text.
 */
export function hoverAt(
	src: string, pos: number, roblox = true,
	tableMembers: ReadonlyMap<string, TableMember[]> = new Map(),
): Hover | null {
	// A class written as the string a call is given: `Instance.new("Part")`.
	if (roblox) {
		const token = tokenize(src).find((t) => t.kind === "string" && t.start < pos && pos < t.end);
		if (token) {
			const name = stringValue({ kind: "string", raw: token.text, start: token.start, end: token.end });
			if (name && CLASS_SET.has(name) && CLASS_CALL.test(src.slice(0, token.start))) {
				return aboutClass(name, token.start, token.end);
			}
			return null;
		}
	}

	let from = pos;
	let to = pos;
	while (isWordChar(src[from - 1])) from--;
	while (isWordChar(src[to])) to++;
	if (from === to || !/^[A-Za-z_]/.test(src.slice(from, to))) return null;
	const word = src.slice(from, to);

	// After a dot: a datatype's constructor or constant, or a local's property.
	if (src[from - 1] === ".") {
		let ownerFrom = from - 1;
		while (isWordChar(src[ownerFrom - 1])) ownerFrom--;
		const owner = src.slice(ownerFrom, from - 1);

		// `Enum.Material`, and `Enum.Material.Plastic`.
		if (roblox && owner === "Enum" && ENGINE.enums[word]) {
			return { from, to, code: `Enum.${word}`, role: "enum", summary: ENGINE.enums[word].summary, link: enumLink(word) };
		}
		if (roblox && src.slice(ownerFrom - 5, ownerFrom) === "Enum." && ENGINE.enums[owner]) {
			const item = ENGINE.enums[owner].items.find((i) => i.name === word);
			if (item) {
				return {
					from, to,
					code: `Enum.${owner}.${word} = ${item.value}`,
					role: "enum item",
					summary: item.summary,
					link: enumLink(owner),
				};
			}
		}

		const local = localsAt(src, ownerFrom).find((n) => n.name === owner);
		if (local) {
			const held = heldBy(local.typeText, local.value);
			if (roblox && held.className) {
				const property = propertiesOf(held.className).find((p) => p.name === word);
				if (property) {
					return {
						from, to,
						code: `${held.className}.${word}: ${property.enum ?? property.type ?? "unknown"}${
							nilableProperty(held.className, word) ? "?" : ""}`,
						role: "property",
						summary: property.summary,
						link: classLink(held.className),
					};
				}
				const event = eventsOf(held.className).find((e) => e.name === word);
				if (event) {
					return {
						from, to,
						code: `${event.from}.${word}${signatureText(event.params)}`,
						role: "event",
						summary: event.summary,
						link: classLink(event.from),
					};
				}
			}
		}

		// A function or field put on the table: `function Occupancy.value(…)`
		// in the file, or a Declare Function the graph wires onto it. The
		// owner may be a chain: `Promise.prototype.andThen`.
		const { chain } = chainBefore(src, from - 1);
		const onTable = membersInCode(src, chain).find((m) => m.name === word)
			?? (local ? undefined : tableMembers.get(chain)?.find((m) => m.name === word));
		if (onTable) return aboutMember(chain, onTable, from, to);
		if (local) return null;

		const item = roblox ? DATATYPE_STATICS[owner]?.find((s) => s.name === word) : undefined;
		if (item) {
			// `Instance.new("Part")` returns the class it is given.
			if (owner === "Instance" && word === "new") {
				const called = /^\s*\(\s*["']([A-Za-z0-9_]+)["']/.exec(src.slice(to))?.[1];
				if (called && CLASS_SET.has(called)) {
					return aboutClass(called, from, to, `Instance.new${item.detail} → ${called}`, "constructor");
				}
			}
			const code = item.kind === "constant"
				? `${owner}.${word}: ${item.detail}`
				: `${owner}.${word}${item.detail}`;
			return { from, to, code, role: item.kind, summary: item.summary, link: datatypeLink(owner) };
		}
		return null;
	}

	// A method the file declares, where it declares it or where it is called
	// on the table: `function Promise.prototype:andThen(…)`.
	if (src[from - 1] === ":" && isWordChar(src[from - 2])) {
		const { chain } = chainBefore(src, from - 1);
		const method = membersInCode(src, chain).find((m) => m.name === word && m.kind === "method");
		if (method) return aboutMember(chain, method, from, to);
	}

	// After a colon, and followed by a call: a method, looked up on the class
	// its owner holds — a local's, or a service reached by name — and every
	// class above it. `existing:IsA(…)` is Instance's.
	if (roblox && src[from - 1] === ":" && isWordChar(src[from - 2]) && /^\s*[("'{]/.test(src.slice(to))) {
		let ownerFrom = from - 1;
		while (isWordChar(src[ownerFrom - 1])) ownerFrom--;
		const owner = src.slice(ownerFrom, from - 1);
		const local = localsAt(src, ownerFrom).find((n) => n.name === owner);
		const className = local ? heldBy(local.typeText, local.value).className : classOfGlobal(owner);
		const method = className ? methodsOf(className).find((m) => m.name === word) : undefined;
		if (method) {
			return {
				from, to,
				code: `${method.from}:${word}${method.detail}${method.returns ? ` → ${method.returns}` : ""}`,
				role: "method",
				summary: method.summary,
				link: classLink(method.from),
			};
		}
		return null;
	}

	// A local of the code's own: what it was declared as. Its own declaration
	// has not finished where its name is written, so the end of that line is
	// asked too — hovering `local tbl = { … }` describes `tbl`.
	const lineEnd = src.indexOf("\n", to);
	const local = declarationAt(src, from)
		?? localsInFile(src, from)?.find((n) => n.name === word)
		?? localsAt(src, from).find((n) => n.name === word)
		?? localsAt(src, lineEnd < 0 ? src.length : lineEnd).find((n) => n.name === word);
	if (local) {
		const held = heldBy(local.typeText, local.value);
		// Its type: as written, or a function's signature, or what its value
		// evidently is. The kind of name goes underneath, quieter.
		const type = local.typeText
			?? (local.func ? signatureOf(local.func, src) : typeOfValue(local.value, src))
			?? (held.keys ? "table" : undefined);
		const code = type ? `${word}: ${type}` : word;
		const role = LOCAL_ROLE[local.kind];
		// Its own comment, or the one above the `function name()` that defines
		// it later: `local Clean: (obj) -> ()` declared first is a common shape.
		const definedBy = local.declaredAt === undefined ? undefined : globalFunction(src, word);
		const doc = (local.declaredAt === undefined ? undefined : docFor(docCommentBefore(src, local.declaredAt), word))
			?? (definedBy ? docFor(docCommentBefore(src, definedBy.start), word) : undefined);
		const typed = doc && type && local.func && !local.typeText ? `${word}: ${withDocTypes(type, doc)}` : code;
		if (roblox && held.className) return { ...aboutClass(held.className, from, to, typed, role), ...(doc ? { doc } : {}) };
		return { from, to, code: typed, role, ...(doc ? { doc } : {}) };
	}

	// A global function the file declares: `function count()`, where it is
	// declared or called.
	const global = globalFunction(src, word);
	if (global) {
		const doc = docFor(docCommentBefore(src, global.start), word);
		return { from, to, code: `${word}: ${withDocTypes(signatureOf(global.func, src), doc)}`, role: "function", ...(doc ? { doc } : {}) };
	}

	if (roblox && CLASS_SET.has(word)) return aboutClass(word, from, to);
	if (roblox && DATATYPE_SET.has(word)) {
		return { from, to, code: word, role: "datatype", summary: DATATYPE_SUMMARIES[word], link: datatypeLink(word) };
	}
	return null;
}

/** `function name()` at any depth of the file, with no table in front of it. */
function globalFunction(src: string, name: string): Extract<Stat, { kind: "function" }> | undefined {
	let found: Extract<Stat, { kind: "function" }> | undefined;
	const visit = (node: unknown): void => {
		if (found) return;
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (!node || typeof node !== "object") return;
		const stat = node as Stat;
		if (stat.kind === "function" && "path" in stat && stat.path.length === 1 && !stat.method && stat.path[0].name === name) {
			found = stat;
			return;
		}
		for (const value of Object.values(node)) if (value && typeof value === "object") visit(value);
	};
	visit(parseChunk(src).value);
	return found;
}
