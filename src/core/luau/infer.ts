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

import type { Expr, FunctionBody } from "./ast.js";
import { parseChunk } from "./parser.js";
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

/** The class a call names, when it is one of the calls that name one. */
export function classOfCall(expr: Expr): string | undefined {
	if (expr.kind === "methodCall" && INSTANCE_FINDERS[expr.method.name]) return "Instance";
	if (expr.kind === "call" && expr.callee.kind === "index" && expr.callee.object.kind === "name"
		&& expr.callee.object.name === "Instance" && expr.callee.name.name === "new") {
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
 * A function's type as Luau writes it: `(name: string) -> (RemoteEvent)`.
 * Parameters keep the types written beside them; what it returns is its
 * written return type, or `()` when it says none.
 */
export function signatureOf(func: FunctionBody, src: string): string {
	const text = (span: { start: number; end: number }) => src.slice(span.start, span.end).trim();
	const params = func.params.map((p) => (p.type ? `${p.name}: ${text(p.type)}` : p.name));
	if (func.varargs) params.push(func.varargs.type ? `...: ${text(func.varargs.type)}` : "...");
	const returns = func.returns ? text(func.returns).replace(/^\((.*)\)$/s, "$1") : "";
	return `(${params.join(", ")}) -> (${returns})`;
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
}

/**
 * What the code puts on a table by name: `function Occupancy.value(…)` and
 * `function Occupancy:reset()` anywhere in the file, and
 * `Occupancy.VALUE_NAME = …` assignments. A generated module is written this
 * way — a table, then its functions declared on it — so without this the
 * functions a module exports were invisible to hover and completion.
 */
export function membersInCode(src: string, owner: string): TableMember[] {
	const out: TableMember[] = [];
	const seen = new Set<string>();
	const add = (member: TableMember) => {
		if (seen.has(member.name)) return;
		seen.add(member.name);
		out.push(member);
	};
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (!node || typeof node !== "object") return;
		const stat = node as { kind?: string };
		if (stat.kind === "function") {
			const fn = node as Extract<import("./ast.js").Stat, { kind: "function" }>;
			if (fn.path.length === 1 && fn.path[0].name === owner && fn.method) {
				add({ name: fn.method.name, kind: "method", detail: signatureOf(fn.func, src) });
			} else if (fn.path.length === 2 && fn.path[0].name === owner && !fn.method) {
				add({ name: fn.path[1].name, kind: "function", detail: signatureOf(fn.func, src) });
			}
		} else if (stat.kind === "assign") {
			const assign = node as Extract<import("./ast.js").Stat, { kind: "assign" }>;
			assign.targets.forEach((target, i) => {
				if (target.kind === "index" && target.object.kind === "name" && target.object.name === owner) {
					const value = assign.values[i];
					const isFunction = value?.kind === "function";
					add({
						name: target.name.name,
						kind: isFunction ? "function" : "field",
						detail: typeOfValue(value, src) ?? "",
					});
				}
			});
		}
		for (const value of Object.values(node)) {
			if (value && typeof value === "object") visit(value);
		}
	};
	visit(parseChunk(src).value);
	return out;
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
