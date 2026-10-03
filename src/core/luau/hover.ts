/**
 * What the code editor says about the name under the pointer.
 *
 * `Instance.new("Part")` returns a Part, and hovering `new` says so, with what
 * a Part is and a link to its page. The same for a class written as a string,
 * a class or datatype named in the code, a datatype's constructor or constant,
 * a local whose declaration says what it holds, and a property read off one.
 *
 * Where the name stands is read off the tree: the name after a dot is an
 * `index` node's, after a colon a `methodCall`'s, a key a table's field. A
 * name the tree does not place -- in a statement that does not parse -- is
 * described as a bare name, from what is in scope.
 *
 * Pure, and in core, so it can be tested without an editor: the editor only
 * draws what this returns.
 */

import { CLASSES, DATATYPES } from "../robloxData.js";
import { ENGINE, signatureText } from "../robloxEngine.js";
import { nilableProperty } from "../robloxNilable.js";
import { propertiesOf } from "../robloxProperties.js";
import { CLASS_SUMMARIES, DATATYPE_STATICS, DATATYPE_SUMMARIES } from "../robloxStatics.js";
import type { Expr, Stat, TableField } from "./ast.js";
import { docCommentBefore, docFor, docRegistry, mergeDocs, withRelated, type DocComment } from "./docComment.js";
import { luauFile, type LuauFile } from "./file.js";
import {
	chainOf, classOfGlobal, eventsOf, type FunctionSignature, heldBy, membersInCode, methodsOf, signatureOf,
	signatureParts, stringValue, type TableMember, takesClassName, typeOfValue,
} from "./infer.js";
import { instanceAt, type InstanceNode } from "./instances.js";
import type { Token } from "./lexer.js";
import { isRequire } from "./requires.js";
import { declarationAt, localsAt, localsInFile, type LocalKind, type ScopedName } from "./scope.js";
import { type AnyNode, nodesAt, visitBlock } from "./visit.js";

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

/** A module a local holds, as hover is told it by whoever followed the require. */
export interface ModuleInfo {
	file: string;
	path?: string[];
	kind: string;
	detail?: string;
	doc?: DocComment;
}

const DOCS = "https://create.roblox.com/docs/reference/engine";
const CLASS_SET = new Set(CLASSES);
const DATATYPE_SET = new Set(DATATYPES);

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

/**
 * A name that is an instance the project knows: `Shared` in
 * `ReplicatedStorage.Shared.Util`, with its class and where it is.
 */
export function instanceHover(src: string, pos: number, root: InstanceNode, self?: readonly string[]): Hover | null {
	const found = instanceAt(src, pos, root, self);
	if (!found) return null;
	const { className } = found.node;
	return {
		from: found.from,
		to: found.to,
		code: `${found.node.name}: ${className}`,
		role: `instance · ${found.path.join(".")}${found.node.fromProject ? " · from the project's files" : ""}`,
		...(CLASS_SUMMARIES[className] ? { summary: CLASS_SUMMARIES[className] } : {}),
		...(CLASS_SET.has(className) ? { link: classLink(className) } : {}),
	};
}

/**
 * A signature with the types its doc comment gives, where the code gives none:
 * `(...) -> ()` under `@param ... any` and `@return Promise<...any>` reads
 * `(...: any) -> Promise<...any>`. Types written in the code win.
 */
export function withDocTypes(signature: FunctionSignature, doc: DocComment | undefined): string {
	let params = signature.params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(", ");
	let returns = `(${signature.returns})`;
	if (doc && signature.params.length > 0 && signature.params.every((p) => !p.type)) {
		params = signature.params.map(({ name }) => {
			const param = doc.params.find((p) => p.name === name || p.name === `${name}?`);
			if (!param?.type) return name;
			if (!param.name.endsWith("?")) return `${name}: ${param.type}`;
			return `${name}: ${param.type.includes("->") ? `(${param.type})` : param.type}?`;
		}).join(", ");
	}
	if (doc && signature.returns === "" && doc.returns.length) {
		const types = doc.returns.map((r) => r.type);
		returns = types.length === 1 ? types[0] : `(${types.join(", ")})`;
	}
	return `(${params}) -> ${returns}`;
}

/** A member put on a table by the code or the graph: `Occupancy.value: (tank: Model) -> (Instance)`. */
function aboutMember(owner: string, member: TableMember, from: number, to: number): Hover {
	// An `@prop name type` gives a field the type the code does not.
	const typed = member.signature ? withDocTypes(member.signature, member.doc) : member.detail;
	const detail = typed || member.doc?.subject?.type || "";
	return {
		from, to,
		code: `${owner}${member.kind === "method" ? ":" : "."}${member.name}${detail ? `: ${detail}` : ""}`,
		role: member.kind,
		...(member.doc ? { doc: member.doc } : {}),
	};
}

/**
 * A member that holds a required module, with the module's description where
 * its own comment has none -- a bare `@prop` -- and where the module is.
 */
function withModule(hover: Hover, module: ModuleInfo | undefined): Hover {
	if (!module) return hover;
	const doc = mergeDocs(hover.doc, module.doc);
	const where = module.path ? module.path.join(".") : module.file;
	return { ...hover, role: `${hover.role ?? "field"} · module ${where}`, ...(doc ? { doc } : {}) };
}

/** What every part of a hover is asked with: the name, where it is, and what the editor knows. */
interface Ask {
	src: string;
	file: LuauFile;
	word: string;
	from: number;
	to: number;
	roblox: boolean;
	tableMembers: ReadonlyMap<string, TableMember[]>;
	modules: ReadonlyMap<string, ModuleInfo>;
}

/** Where a name stands, read off the nodes around it. */
type Place =
	/** After a dot: `x.name`, or `function M.name()`. `object` is what is before the dot, when it is an expression. */
	| { kind: "field"; chain?: string; object?: Expr; call?: Expr }
	/** After a colon: `x:name(…)`, or `function M:name()`, which is no call. */
	| { kind: "method"; chain?: string; object?: Expr; call: boolean }
	/** A key written in a table constructor, and the local or global the table is written to. */
	| { kind: "key"; field: Extract<TableField, { kind: "named" }>; owner?: string }
	| { kind: "name" };

/**
 * `tableMembers` is what the graph puts on its tables, for code typed into a
 * graph: functions a Declare Function attaches to a table variable. A file on
 * its own has no graph, and its own `function Table.name` statements are read
 * from the text.
 */
export function hoverAt(
	src: string, pos: number, roblox = true,
	tableMembers: ReadonlyMap<string, TableMember[]> = new Map(),
	modules: ReadonlyMap<string, ModuleInfo> = new Map(),
): Hover | null {
	const file = luauFile(src);
	// A class written as the string a call is given: `Instance.new("Part")`.
	const quoted = roblox ? file.tokens.find((t) => t.kind === "string" && t.start < pos && pos < t.end) : undefined;
	if (quoted) return classString(file, quoted);

	const token = nameAt(file.tokens, pos);
	if (!token) return null;
	const ask: Ask = { src, file, word: token.text, from: token.start, to: token.end, roblox, tableMembers, modules };
	const place = placeOf(nodesAt(file.block, token.start), token);
	switch (place.kind) {
		case "field":
			return afterDot(ask, place);
		case "method":
			return afterColon(ask, place);
		case "key":
			return tableKey(ask, place);
		case "name":
			return bareName(ask);
	}
}

/**
 * The name the pointer is on, or just after -- or a word in a comment, which
 * a doc comment's `@return Lid` makes worth describing too.
 */
function nameAt(tokens: readonly Token[], pos: number): { text: string; start: number; end: number } | undefined {
	const name = tokens.find((t) => t.kind === "name" && t.start <= pos && pos < t.end)
		?? tokens.find((t) => t.kind === "name" && t.end === pos);
	if (name) return name;
	const comment = tokens.find((t) => t.kind === "comment" && t.start <= pos && pos <= t.end);
	if (!comment) return undefined;
	for (const word of comment.text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
		const start = comment.start + (word.index ?? 0);
		if (start <= pos && pos <= start + word[0].length) return { text: word[0], start, end: start + word[0].length };
	}
	return undefined;
}

/** A string that is a class's name, given to a call that takes one. */
function classString(file: LuauFile, token: Token): Hover | null {
	const name = stringValue({ kind: "string", raw: token.text, start: token.start, end: token.end });
	if (!name || !CLASS_SET.has(name)) return null;
	// The string is the innermost node at its start; the call holding it is next out.
	const path = nodesAt(file.block, token.start);
	const [call, string] = path.slice(-2);
	if (string?.role !== "expr" || string.node.kind !== "string" || call?.role !== "expr" || !takesClassName(call.node)) {
		return null;
	}
	const args = call.node.kind === "call" || call.node.kind === "methodCall" ? call.node.args : [];
	return args[0] === string.node ? aboutClass(name, token.start, token.end) : null;
}

function placeOf(path: readonly AnyNode[], token: { start: number }): Place {
	for (let i = path.length - 1; i >= 0; i--) {
		const { role, node } = path[i];
		if (role === "expr") {
			if (node.kind === "index" && node.name.start === token.start) {
				const outer = path[i - 1];
				const call = outer?.role === "expr" && outer.node.kind === "call" && outer.node.callee === node ? outer.node : undefined;
				return { kind: "field", chain: chainOf(node.object), object: node.object, ...(call ? { call } : {}) };
			}
			if (node.kind === "methodCall" && node.method.start === token.start) {
				return { kind: "method", chain: chainOf(node.object), object: node.object, call: true };
			}
			if (node.kind === "table") {
				const field = node.fields.find((f) => f.kind === "named" && f.name.start === token.start);
				if (field?.kind === "named") return { kind: "key", field, ...ownerOfTable(path, i, node) };
			}
		}
		if (role === "stat" && node.kind === "functionStat") {
			const names = node.path.map((n) => n.name);
			if (node.method?.start === token.start) return { kind: "method", chain: names.join("."), call: false };
			const at = node.path.findIndex((n) => n.start === token.start);
			if (at > 0) return { kind: "field", chain: names.slice(0, at).join(".") };
		}
	}
	return { kind: "name" };
}

/**
 * The local or global a table at `path[at]` is written to: `Sift` for the
 * table in `local Sift = { … }` or `Sift = { … }`, through casts and brackets.
 */
function ownerOfTable(path: readonly AnyNode[], at: number, table: Expr): { owner?: string } {
	let child = table;
	let i = at - 1;
	for (; i >= 0; i--) {
		const outer = path[i];
		if (outer.role !== "expr") break;
		const { node } = outer;
		if (!((node.kind === "cast" && node.value === child) || (node.kind === "paren" && node.inner === child))) break;
		child = node;
	}
	const holder = path[i];
	if (holder?.role !== "stat") return {};
	const stat = holder.node;
	if (stat.kind === "local" || stat.kind === "const") {
		const name = stat.names[stat.values.indexOf(child)]?.name;
		return name ? { owner: name } : {};
	}
	if (stat.kind === "assign") {
		const target = stat.targets[stat.values.indexOf(child)];
		return target?.kind === "name" ? { owner: target.name } : {};
	}
	return {};
}

/** The name an expression ends in, as the word before a dot or colon is read: `b` in `a.b`. */
function lastName(expr: Expr | undefined): string | undefined {
	if (expr?.kind === "name") return expr.name;
	return expr?.kind === "index" ? expr.name.name : undefined;
}

/** The local an expression is, when it is a bare name one is declared as. */
function localNamed(src: string, expr: Expr | undefined): ScopedName | undefined {
	if (expr?.kind !== "name") return undefined;
	return (localsInFile(src, expr.start) ?? localsAt(src, expr.start)).find((n) => n.name === expr.name);
}

/** After a dot: an enum, a datatype's constructor or constant, a local's property, or a table's member. */
function afterDot(ask: Ask, place: Extract<Place, { kind: "field" }>): Hover | null {
	const { src, word, from, to, roblox } = ask;
	const owner = place.object ? lastName(place.object) : place.chain?.split(".").at(-1);

	// `Enum.Material`, and `Enum.Material.Plastic`.
	if (roblox && place.chain === "Enum" && ENGINE.enums[word]) {
		return { from, to, code: `Enum.${word}`, role: "enum", summary: ENGINE.enums[word].summary, link: enumLink(word) };
	}
	if (roblox && owner && place.chain === `Enum.${owner}` && ENGINE.enums[owner]) {
		const item = ENGINE.enums[owner].items.find((i) => i.name === word);
		if (item) {
			return {
				from, to, code: `Enum.${owner}.${word} = ${item.value}`, role: "enum item", summary: item.summary, link: enumLink(owner),
			};
		}
	}

	const local = localNamed(src, place.object);
	if (local && roblox) {
		const about = memberOfClass(heldBy(local.typeText, local.value).className, word, from, to);
		if (about) return about;
	}

	// A function or field put on the table: `function Occupancy.value(…)`
	// in the file, or a Declare Function the graph wires onto it. The
	// owner may be a chain: `Promise.prototype.andThen`.
	if (place.chain !== undefined) {
		const chain = place.chain;
		// A local that holds a required module has that module's members.
		const outside = !local || isRequire(local.value);
		const onTable = membersInCode(src, chain).find((m) => m.name === word)
			?? (outside ? ask.tableMembers.get(chain)?.find((m) => m.name === word) : undefined);
		if (onTable) {
			const held = ask.modules.get(`${chain}.${word}`)
				?? (onTable.aliasOf ? ask.modules.get(`${chain}.${onTable.aliasOf}`) : undefined);
			return withModule(aboutMember(chain, onTable, from, to), held);
		}
	}
	if (local || !owner) return null;

	const item = roblox ? DATATYPE_STATICS[owner]?.find((s) => s.name === word) : undefined;
	if (!item) return null;
	// `Instance.new("Part")` returns the class it is given.
	if (owner === "Instance" && word === "new" && place.call?.kind === "call") {
		const called = stringValue(place.call.args[0]);
		if (called && CLASS_SET.has(called)) return aboutClass(called, from, to, `Instance.new${item.detail} → ${called}`, "constructor");
	}
	const code = item.kind === "constant" ? `${owner}.${word}: ${item.detail}` : `${owner}.${word}${item.detail}`;
	return { from, to, code, role: item.kind, summary: item.summary, link: datatypeLink(owner) };
}

/** A property or event of a class, read with a dot off an instance of it. */
function memberOfClass(className: string | undefined, word: string, from: number, to: number): Hover | undefined {
	if (!className) return undefined;
	const property = propertiesOf(className).find((p) => p.name === word);
	if (property) {
		const nilable = nilableProperty(className, word) ? "?" : "";
		return {
			from, to,
			code: `${className}.${word}: ${property.enum ?? property.type ?? "unknown"}${nilable}`,
			role: "property",
			summary: property.summary,
			link: classLink(className),
		};
	}
	const event = eventsOf(className).find((e) => e.name === word);
	if (!event) return undefined;
	return {
		from, to,
		code: `${event.from}.${word}${signatureText(event.params)}`,
		role: "event",
		summary: event.summary,
		link: classLink(event.from),
	};
}

/**
 * After a colon: a method the file declares on a table, where it declares it
 * or where it is called; or, called on what a local or a service holds, a
 * Roblox class's method -- found up the hierarchy, so `existing:IsA(…)` is
 * Object's.
 */
function afterColon(ask: Ask, place: Extract<Place, { kind: "method" }>): Hover | null {
	const { src, word, from, to } = ask;
	if (place.chain !== undefined) {
		const method = membersInCode(src, place.chain).find((m) => m.name === word && m.kind === "method");
		if (method) return aboutMember(place.chain, method, from, to);
	}
	if (!ask.roblox || !place.call) return null;
	const owner = lastName(place.object);
	const local = localNamed(src, place.object);
	const className = local ? heldBy(local.typeText, local.value).className : owner ? classOfGlobal(owner) : undefined;
	const method = className ? methodsOf(className).find((m) => m.name === word) : undefined;
	if (!method) return null;
	return {
		from, to,
		code: `${method.from}:${word}${method.detail}${method.returns ? ` → ${method.returns}` : ""}`,
		role: "method",
		summary: method.summary,
		link: classLink(method.from),
	};
}

/**
 * A key written in a table: `Array = …` inside `local Sift = { … }` is
 * Sift's member, and hovers as `Sift.Array` does -- @prop and all.
 */
function tableKey(ask: Ask, place: Extract<Place, { kind: "key" }>): Hover {
	const { src, word, from, to } = ask;
	const member = place.owner ? membersInCode(src, place.owner).find((m) => m.name === word) : undefined;
	if (member && place.owner) return withModule(aboutMember(place.owner, member, from, to), ask.modules.get(`${place.owner}.${word}`));
	const doc = docFor(docCommentBefore(src, place.field.start), word);
	const detail = typeOfValue(place.field.value, src);
	return { from, to, code: `${word}${detail ? `: ${detail}` : ""}`, role: "field", ...(doc ? { doc } : {}) };
}

/**
 * A name on its own: a local of the code's own, a global function the file
 * declares, a type its comments describe, or a Roblox class or datatype.
 */
function bareName(ask: Ask): Hover | null {
	const { src, word, from, to, roblox } = ask;
	// Its own declaration has not finished where its name is written, so the
	// end of that line is asked too — hovering `local tbl = { … }` describes `tbl`.
	const lineEnd = src.indexOf("\n", to);
	const local = declarationAt(src, from)
		?? localsInFile(src, from)?.find((n) => n.name === word)
		?? localsAt(src, from).find((n) => n.name === word)
		?? localsAt(src, lineEnd < 0 ? src.length : lineEnd).find((n) => n.name === word);
	if (local) return aboutLocal(ask, local);

	// A global function the file declares: `function count()`, where it is
	// declared or called.
	const global = globalFunction(ask.file, word);
	if (global) {
		const doc = docFor(docCommentBefore(src, global.start), word);
		const code = `${word}: ${withDocTypes(signatureParts(global.func, src), doc)}`;
		return { from, to, code, role: "function", ...(doc ? { doc } : {}) };
	}

	// An `@interface` or `@type` the file's Moonwave comments describe.
	if (/@(interface|type)\b/.test(src)) {
		const entry = docRegistry(src).find((e) => (e.tag === "interface" || e.tag === "type") && e.name === word);
		if (entry) {
			return {
				from, to,
				code: entry.doc.subject?.type ? `type ${word} = ${entry.doc.subject.type}` : `type ${word}`,
				role: entry.tag === "interface" ? "interface" : "type",
				doc: entry.doc,
			};
		}
	}

	if (roblox && CLASS_SET.has(word)) return aboutClass(word, from, to);
	if (roblox && DATATYPE_SET.has(word)) {
		return { from, to, code: word, role: "datatype", summary: DATATYPE_SUMMARIES[word], link: datatypeLink(word) };
	}
	return null;
}

/** A local of the code's own: what it was declared as, and the comment that says what it is. */
function aboutLocal(ask: Ask, local: ScopedName): Hover {
	const { src, word, from, to } = ask;
	const held = heldBy(local.typeText, local.value);
	// Its type: as written, or a function's signature, or what its value
	// evidently is. The kind of name goes underneath, quieter.
	const type = local.typeText
		?? (local.func ? signatureOf(local.func, src) : typeOfValue(local.value, src))
		?? (held.keys ? "table" : undefined);
	const code = type ? `${word}: ${type}` : word;
	const role = LOCAL_ROLE[local.kind];
	// `local Flux = require(…)`: what the module is, and where.
	const module = isRequire(local.value) ? ask.modules.get(word) : undefined;
	if (module) {
		const where = module.path ? module.path.join(".") : module.file;
		return {
			from, to,
			code: `${word}: ${module.kind === "function" && module.detail ? module.detail : "module"}`,
			role: `module · ${where}`,
			...(module.doc ? { doc: module.doc } : {}),
		};
	}
	// Its own comment, or the one above the `function name()` that defines
	// it later: `local Clean: (obj) -> ()` declared first is a common shape.
	const definedBy = local.declaredAt === undefined ? undefined : globalFunction(ask.file, word);
	const own = (local.declaredAt === undefined ? undefined : docFor(docCommentBefore(src, local.declaredAt), word))
		?? (definedBy ? docFor(docCommentBefore(src, definedBy.start), word) : undefined)
		// `@class Sift` standing anywhere in the file, for `local Sift`.
		?? (/@class\b/.test(src) ? docRegistry(src).find((e) => e.tag === "class" && e.name === word)?.doc : undefined);
	const doc = own && /@(interface|type)\b/.test(src) ? withRelated(own, docRegistry(src)) : own;
	const typed = doc && local.func && !local.typeText ? `${word}: ${withDocTypes(signatureParts(local.func, src), doc)}` : code;
	if (ask.roblox && held.className) return { ...aboutClass(held.className, from, to, typed, role), ...(doc ? { doc } : {}) };
	return { from, to, code: typed, role, ...(doc ? { doc } : {}) };
}

/** `function name()` at any depth of the file, with no table in front of it. */
function globalFunction(file: LuauFile, name: string): Extract<Stat, { kind: "functionStat" }> | undefined {
	let found: Extract<Stat, { kind: "functionStat" }> | undefined;
	visitBlock(file.block, {
		stat: (stat) => {
			if (found) return false;
			if (stat.kind === "functionStat" && stat.path.length === 1 && !stat.method && stat.path[0].name === name) found = stat;
			return !found;
		},
		expr: () => !found,
	});
	return found;
}
