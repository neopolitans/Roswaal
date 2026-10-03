/**
 * What a local in hand-written code holds, as far as the code itself says.
 *
 * Not a type checker. It answers the questions completion and hover ask, from
 * what is written at the declaration and nothing further:
 *
 * - `local part: Part` — the written type.
 * - `local part = Instance.new("Part")`, `game:GetService("Players")`,
 *   `x:FindFirstChildOfClass("Humanoid")`, `thing :: Model` — the class the
 *   call or cast names.
 * - `local scores = { Anne = 500, ["James"] = 300 }` — the keys a table
 *   constructor writes, so `scores.` can offer them.
 *
 * Anything else is unknown, and unknown offers nothing: a guess at what a
 * value holds would be a completion list that lies.
 */

import type { Expr, FunctionBody, Stat } from "./ast.js";
import { docCommentBefore, docFor, docRegistry, registeredDoc, withRelated, type DocComment } from "./docComment.js";
import { luauFile } from "./file.js";
import type { Token } from "./lexer.js";
import { visitBlock } from "./visit.js";
import { CLASSES, CLASS_PARENTS } from "../robloxData.js";
import { isService } from "../roblox.js";
import { CLASS_METHODS, type ClassMethod } from "../robloxStatics.js";
import { ENGINE, type EngineClass, type EngineEvent } from "../robloxEngine.js";

export interface Held {
	/** A Roblox class the value is an instance of. */
	className?: string;
	/** The keys of a table written out in the declaration. */
	keys?: string[];
}

const CLASS_SET = new Set(CLASSES);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Calls on an instance whose string argument names the class they return. */
const CLASS_NAMING_CALLS = new Set([
	"GetService", "FindFirstChildOfClass", "FindFirstChildWhichIsA",
	"FindFirstAncestorOfClass", "FindFirstAncestorWhichIsA",
]);

/** A quoted string's text, for the simple strings class names are written as. */
export function stringValue(expr: Expr | undefined): string | undefined {
	if (!expr || expr.kind !== "string") return undefined;
	const raw = expr.raw;
	if ((raw.startsWith("\"") || raw.startsWith("'")) && raw.length >= 2) return raw.slice(1, -1);
	return undefined;
}

/** A class name from a written type: `Part`, `Part?`, `(Model)`. */
export function classOfTypeText(text: string | undefined): string | undefined {
	const bare = (text ?? "").trim().replace(/^\((.*)\)$/, "$1").replace(/\?$/, "").trim();
	return CLASS_SET.has(bare) ? bare : undefined;
}

/** Calls that find an instance by name: the class is not known, but it is one. */
const INSTANCE_FINDERS: Record<string, string> = {
	FindFirstChild: "Instance?",
	FindFirstAncestor: "Instance?",
	WaitForChild: "Instance",
};

/**
 * The class a name that is not a local stands for: a service reached by its
 * name, as a graph hoists them, and the globals Roblox provides.
 */
export function classOfGlobal(name: string): string | undefined {
	if (name === "game") return "DataModel";
	if (name === "workspace") return "Workspace";
	return isService(name) ? name : undefined;
}

/**
 * A class's methods, its own first and then each ancestor's, once each:
 * `Part` reaches `Instance:IsA` through `BasePart` and the rest.
 */
export function methodsOf(className: string): (ClassMethod & { from: string })[] {
	const out: (ClassMethod & { from: string })[] = [];
	const seen = new Set<string>();
	const walked = new Set<string>();
	let current: string | undefined = className;
	while (current !== undefined && !walked.has(current)) {
		walked.add(current);
		for (const method of CLASS_METHODS[current] ?? []) {
			if (seen.has(method.name)) continue;
			seen.add(method.name);
			out.push({ ...method, from: current });
		}
		current = CLASS_PARENTS[current];
	}
	return out;
}

/**
 * A class's events, its own first and then each ancestor's, once each —
 * `Part` reaches `BasePart.Touched`. Deprecated ones are left out.
 */
export function eventsOf(className: string): (EngineEvent & { from: string })[] {
	const out: (EngineEvent & { from: string })[] = [];
	const seen = new Set<string>();
	const walked = new Set<string>();
	let current: string | undefined = className;
	while (current !== undefined && !walked.has(current)) {
		walked.add(current);
		const found: EngineClass | undefined = ENGINE.classes[current];
		for (const event of found?.events ?? []) {
			if (event.deprecated || seen.has(event.name)) continue;
			seen.add(event.name);
			out.push({ ...event, from: current });
		}
		current = found?.superclass;
	}
	return out;
}

/**
 * Methods whose first argument, as a string, is a class name: what the
 * hover over `x:IsA("Model")` and the completion inside its quotes both ask.
 * `GetService` names a service, which is a class too.
 */
export const CLASS_ARGUMENT_METHODS: ReadonlySet<string> = new Set(["IsA", ...CLASS_NAMING_CALLS]);

/** Whether `callee` is `Instance.new`, the one function whose first argument names a class. */
function isInstanceNew(callee: Expr): boolean {
	return callee.kind === "index" && callee.object.kind === "name" && callee.object.name === "Instance"
		&& callee.name.name === "new";
}

/** Whether a call's first argument names a class: `Instance.new("Part")`, `x:IsA("Model")`. */
export function takesClassName(call: Expr): boolean {
	if (call.kind === "call") return isInstanceNew(call.callee);
	return call.kind === "methodCall" && CLASS_ARGUMENT_METHODS.has(call.method.name);
}

/**
 * What the string being typed after `tokens` names, when they end with the
 * opening bracket of a call that takes a class: `"service"` after
 * `:GetService(`, `"class"` after `Instance.new(` or `:IsA(`. Read from the
 * lexer's tokens, since a call being typed does not parse yet.
 */
export function classCallBefore(tokens: readonly Token[]): "class" | "service" | undefined {
	const at = (back: number) => tokens[tokens.length - back]?.text;
	if (at(1) !== "(") return undefined;
	if (at(3) === ":" && CLASS_ARGUMENT_METHODS.has(at(2) ?? "")) return at(2) === "GetService" ? "service" : "class";
	return at(2) === "new" && at(3) === "." && at(4) === "Instance" ? "class" : undefined;
}

/** The class a call names, when it is one of the calls that name one. */
export function classOfCall(expr: Expr): string | undefined {
	if (expr.kind === "methodCall" && INSTANCE_FINDERS[expr.method.name]) return "Instance";
	if (expr.kind === "call" && isInstanceNew(expr.callee)) {
		const name = stringValue(expr.args[0]);
		return name && CLASS_SET.has(name) ? name : undefined;
	}
	if (expr.kind === "methodCall" && CLASS_NAMING_CALLS.has(expr.method.name)) {
		const name = stringValue(expr.args[0]);
		return name && CLASS_SET.has(name) ? name : undefined;
	}
	return undefined;
}

/**
 * A function's parameters and results, each as written. Kept apart rather
 * than only joined into one string, because a parameter's type may itself be
 * a function type -- `cb: (x: number) -> ()` -- and a string cannot be split
 * back at its commas and arrows reliably.
 */
export interface FunctionSignature {
	/** `...` is the last one when the function takes varargs. */
	params: { name: string; type?: string }[];
	/** What it returns, without the outer brackets: `string, number`; "" for nothing written. */
	returns: string;
}

/** A function's signature, from its definition. */
export function signatureParts(func: FunctionBody, src: string): FunctionSignature {
	const text = (span: { start: number; end: number }) => src.slice(span.start, span.end).trim();
	const params: FunctionSignature["params"] = func.params.map((p) =>
		(p.type ? { name: p.name, type: text(p.type) } : { name: p.name }));
	if (func.varargs) params.push(func.varargs.type ? { name: "...", type: text(func.varargs.type) } : { name: "..." });
	const returns = func.returns ? text(func.returns).replace(/^\((.*)\)$/s, "$1") : "";
	return { params, returns };
}

/** A signature as Luau writes a function's type: `(name: string) -> (RemoteEvent)`. */
export function formatSignature(signature: FunctionSignature): string {
	const params = signature.params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name));
	return `(${params.join(", ")}) -> (${signature.returns})`;
}

/**
 * A function's type as Luau writes it: `(name: string) -> (RemoteEvent)`.
 * Parameters keep the types written beside them; what it returns is its
 * written return type, or `()` when it says none.
 */
export function signatureOf(func: FunctionBody, src: string): string {
	return formatSignature(signatureParts(func, src));
}

const ARITHMETIC = new Set(["+", "-", "*", "/", "//", "%", "^"]);
const COMPARISON = new Set(["==", "~=", "<", "<=", ">", ">="]);

/**
 * The type a value evidently has, from what it is written as: a string is a
 * `string`, `a + b` a `number`, `x == y` a `boolean`, `Instance.new("Part")` a
 * `Part`, a function its signature. Nothing for what it cannot tell — a call
 * whose result nothing here knows.
 */
export function typeOfValue(expr: Expr | undefined, src: string): string | undefined {
	let value = expr;
	while (value && value.kind === "paren") value = value.inner;
	if (!value) return undefined;
	switch (value.kind) {
		case "string":
		case "interpolated":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "nil":
			return "nil";
		case "table":
			return "table";
		case "function":
			return signatureOf(value.func, src);
		case "cast":
			return src.slice(value.type.start, value.type.end).trim();
		case "unary":
			return value.op === "not" ? "boolean" : "number";
		case "binary":
			if (ARITHMETIC.has(value.op)) return "number";
			if (value.op === "..") return "string";
			if (COMPARISON.has(value.op)) return "boolean";
			return undefined;
		default: {
			// The finders say whether they can come back empty: FindFirstChild
			// can, WaitForChild waits until it cannot.
			if (value.kind === "methodCall" && INSTANCE_FINDERS[value.method.name]) {
				return INSTANCE_FINDERS[value.method.name];
			}
			const called = classOfCall(value);
			if (called && value.kind === "methodCall" && value.method.name.startsWith("FindFirst")) return `${called}?`;
			return called;
		}
	}
}

/** Something a table has, because the code or the graph put it there. */
export interface TableMember {
	name: string;
	kind: "function" | "method" | "field";
	/** A function's signature, or a field's type when it is evident; "" when not. */
	detail: string;
	/** A function's parameters and results apart, for the signature help. */
	signature?: FunctionSignature;
	/** The documentation comment above where the code puts it. */
	doc?: DocComment;
	/** Another member of the same table it was set to: `List` for `Sift.List = Sift.Array` is `Array`. */
	aliasOf?: string;
}

/**
 * A member for a value put on a table: a function with its signature, both as
 * text and apart, or a field with the type its value evidently has.
 */
export function memberFor(name: string, value: Expr | undefined, src: string): TableMember {
	if (value?.kind === "function") return functionMember(name, "function", value.func, src);
	return { name, kind: "field", detail: typeOfValue(value, src) ?? "" };
}

/** A member for a function written with its body: `function M.f(…)`. */
export function functionMember(name: string, kind: "function" | "method", func: FunctionBody, src: string): TableMember {
	const signature = signatureParts(func, src);
	return { name, kind, detail: formatSignature(signature), signature };
}

/** `a.b.c` as its names, or undefined for anything that is not a chain of them. */
export function chainOf(expr: Expr): string | undefined {
	if (expr.kind === "name") return expr.name;
	if (expr.kind === "index") {
		const object = chainOf(expr.object);
		return object === undefined ? undefined : `${object}.${expr.name.name}`;
	}
	return undefined;
}

/**
 * What the code puts on a table by name: `function Occupancy.value(…)` and
 * `function Occupancy:reset()` anywhere in the file, and
 * `Occupancy.VALUE_NAME = …` assignments. A generated module is written this
 * way — a table, then its functions declared on it — so without this the
 * functions a module exports were invisible to hover and completion.
 *
 * `owner` may be a chain, `Promise.prototype`, for a table kept inside
 * another. Each member carries the doc comment written above it, and a field
 * that is another member of the same table -- `Promise.async =
 * Promise.defer` -- is described as that member.
 */
export function membersInCode(src: string, owner: string): TableMember[] {
	const out: TableMember[] = [];
	const seen = new Set<string>();
	const aliases: { member: TableMember; of: string }[] = [];
	const add = (member: TableMember, at: number) => {
		if (seen.has(member.name)) return;
		seen.add(member.name);
		const doc = docFor(docCommentBefore(src, at), member.name);
		out.push(doc ? { ...member, doc } : member);
	};
	const onStat = (stat: Stat): void => {
		if (stat.kind === "functionStat") {
			const names = stat.path.map((n) => n.name);
			if (stat.method && names.join(".") === owner) {
				add(functionMember(stat.method.name, "method", stat.func, src), stat.start);
			} else if (!stat.method && names.length >= 2 && names.slice(0, -1).join(".") === owner) {
				add(functionMember(names[names.length - 1], "function", stat.func, src), stat.start);
			}
		} else if ((stat.kind === "local" || stat.kind === "const") && !owner.includes(".")) {
			// `local Crate = { Shelf = … }`: what the table is written with.
			stat.names.forEach((binding, i) => {
				let value = stat.values[i];
				while (value?.kind === "cast" || value?.kind === "paren") value = value.kind === "cast" ? value.value : value.inner;
				if (binding.name !== owner || value?.kind !== "table") return;
				for (const field of value.fields) {
					if (field.kind !== "named") continue;
					add(memberFor(field.name.name, field.value, src), field.start);
				}
			});
		} else if (stat.kind === "assign") {
			stat.targets.forEach((target, i) => {
				if (target.kind !== "index" || chainOf(target.object) !== owner) return;
				const value = stat.values[i];
				const member = memberFor(target.name.name, value, src);
				add(member, stat.start);
				// The member as kept: `add` keeps the first of a name, with its doc.
				const kept = out.find((m) => m.name === member.name);
				if (kept && value?.kind === "index" && chainOf(value.object) === owner) {
					aliases.push({ member: kept, of: value.name.name });
				}
			});
		}
	};
	visitBlock(luauFile(src).block, { stat: onStat });
	for (const { member, of } of aliases) {
		const original = out.find((m) => m.name === of);
		if (!original || original === member) continue;
		Object.assign(member, {
			kind: original.kind,
			detail: original.detail,
			...(original.signature ? { signature: original.signature } : {}),
			aliasOf: original.name,
			...(member.doc || !original.doc ? {} : { doc: original.doc }),
		});
	}
	return withRegistry(out, src, owner.split(".")[0]);
}

/**
 * Members with what the file's Moonwave comments say of them wherever they
 * stand: `--- @prop Array Array` / `--- @within Sift` for `Sift.Array`, and
 * the `@interface`s and `@type`s their parameters and returns name.
 */
export function withRegistry(members: TableMember[], src: string, owner?: string): TableMember[] {
	if (!/@(prop|function|method|interface|type|class)\b/.test(src)) return members;
	const entries = docRegistry(src);
	return members.map((m) => {
		const doc = m.doc ?? registeredDoc(entries, m.name, owner);
		return doc ? { ...m, doc: withRelated(doc, entries) } : m;
	});
}

/** The keys a dot can reach: the ones that are names. */
export function dotKeys(held: Held): string[] {
	return (held.keys ?? []).filter((key) => IDENTIFIER.test(key));
}

/** What a declaration says its value holds. */
export function heldBy(typeText: string | undefined, value: Expr | undefined): Held {
	const written = classOfTypeText(typeText);
	if (written) return { className: written };
	let expr = value;
	while (expr && expr.kind === "paren") expr = expr.inner;
	if (!expr) return {};

	if (expr.kind === "cast" && expr.type.kind === "reference") {
		return CLASS_SET.has(expr.type.name) ? { className: expr.type.name } : {};
	}
	const called = classOfCall(expr);
	if (called) return { className: called };

	if (expr.kind === "table") {
		const keys: string[] = [];
		for (const field of expr.fields) {
			const key = field.kind === "named"
				? field.name.name
				: field.kind === "keyed" ? stringValue(field.key) : undefined;
			// Every string key: brackets reach `["two words"]`, and a dot only
			// the ones that are names — `dotKeys` is that narrower list.
			if (key !== undefined && !keys.includes(key)) keys.push(key);
		}
		return { keys };
	}
	return {};
}
