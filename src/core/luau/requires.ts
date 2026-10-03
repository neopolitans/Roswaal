/**
 * What a `require` in hand-written Luau points at, and what the module it
 * reaches gives back.
 *
 * Two halves of one question -- "what is `Flux.new`?" -- split where the disk
 * comes in. This half is pure: it reads the requiring file for where each
 * `require` goes, as an instance path (`game`, `script`, a local holding
 * either, `:GetService`, `:WaitForChild`, `.Parent`) or a string, and reads a
 * module's text for what it returns. The project layer turns the first into a
 * file and hands this the file's text for the second.
 */

import type { Block, Expr, Stat } from "./ast.js";
import { docCommentBefore, docFor, docRegistry, type DocComment } from "./docComment.js";
import {
	memberFor, membersInCode, signatureOf, stringValue, type TableMember, typeOfValue, withRegistry,
} from "./infer.js";
import { luauFile } from "./file.js";
import { localsInFile, localsInParsed } from "./scope.js";
import { visitBlock } from "./visit.js";

/**
 * Where a require goes. An instance path starts at `game` or at the requiring
 * script, and `..` is `.Parent`. A string is a path, as written.
 */
export type RequireTarget =
	| { kind: "instance"; from: "game" | "script"; names: string[] }
	| { kind: "string"; spec: string };

/** A local that holds a module: `local Flux = require(Packages.Flux)`. */
export interface RequireBinding {
	name: string;
	target: RequireTarget;
}

/** How many locals deep a path is followed: `local a = b.C` where `b` is a local. */
const DEPTH = 12;

/**
 * The instance or string an expression names, when the code says for certain.
 * `parsed` is the file's parse, when the caller has one: locals are looked up
 * in it rather than by parsing the file again at every name.
 */
export function targetOf(expr: Expr, src: string, depth = 0, parsed?: Block): RequireTarget | undefined {
	if (depth > DEPTH) return undefined;
	switch (expr.kind) {
		case "string": {
			const spec = stringValue(expr);
			return spec === undefined ? undefined : { kind: "string", spec };
		}
		case "paren":
			return targetOf(expr.inner, src, depth + 1, parsed);
		case "cast":
			return targetOf(expr.value, src, depth + 1, parsed);
		case "name": {
			if (expr.name === "game") return { kind: "instance", from: "game", names: [] };
			if (expr.name === "script") return { kind: "instance", from: "script", names: [] };
			if (expr.name === "workspace") return { kind: "instance", from: "game", names: ["Workspace"] };
			const locals = parsed ? localsInParsed(parsed, src, expr.start) : localsInFile(src, expr.start);
			const local = locals?.find((n) => n.name === expr.name);
			return local?.value ? targetOf(local.value, src, depth + 1, parsed) : undefined;
		}
		case "index":
		case "indexExpr": {
			const name = expr.kind === "index" ? expr.name.name : expr.key.kind === "string" ? stringValue(expr.key) : undefined;
			if (name === undefined) return undefined;
			const base = targetOf(expr.object, src, depth + 1, parsed);
			if (base?.kind !== "instance") return undefined;
			return { ...base, names: [...base.names, name === "Parent" ? ".." : name] };
		}
		case "methodCall": {
			const method = expr.method.name;
			const arg = expr.args[0]?.kind === "string" ? stringValue(expr.args[0]) : undefined;
			if (arg === undefined) return undefined;
			const base = targetOf(expr.object, src, depth + 1, parsed);
			if (base?.kind !== "instance") return undefined;
			if (method === "GetService" && base.from === "game" && base.names.length === 0) return { ...base, names: [arg] };
			if (method === "WaitForChild") return { ...base, names: [...base.names, arg] };
			// `FindFirstChild(name, true)` searches every descendant, so where
			// it lands is not a path the code says.
			if (method === "FindFirstChild" && expr.args.length === 1) return { ...base, names: [...base.names, arg] };
			return undefined;
		}
		default:
			return undefined;
	}
}

const isRequireCall = (expr: Expr | undefined): expr is Extract<Expr, { kind: "call" }> =>
	expr?.kind === "call" && expr.callee.kind === "name" && expr.callee.name === "require" && expr.args.length === 1;

/** Whether a local's value is a `require(…)`, so what it holds is a module. */
export const isRequire = (expr: Expr | undefined): boolean => isRequireCall(expr);

/**
 * Every local in the file that holds a required module, with where it goes --
 * and every field of a named table that does, as `Owner.field`: Sift's
 * `Array = require(script.Array)` in `local Sift = { … }` is `Sift.Array`,
 * as is `Sift.Array = require(…)`.
 */
export function requiresIn(src: string): RequireBinding[] {
	const out: RequireBinding[] = [];
	const push = (name: string, value: Expr | undefined) => {
		if (!isRequireCall(value)) return;
		const target = targetOf(value.args[0], src);
		if (target) out.push({ name, target });
	};
	const fields = (owner: string, value: Expr | undefined) => {
		let table = value;
		while (table && (table.kind === "cast" || table.kind === "paren")) table = table.kind === "cast" ? table.value : table.inner;
		if (table?.kind !== "table") return;
		for (const field of table.fields) if (field.kind === "named") push(`${owner}.${field.name.name}`, field.value);
	};
	visitBlock(luauFile(src).block, {
		stat: (stat) => {
			if (stat.kind === "local" || stat.kind === "const") {
				stat.names.forEach((binding, i) => {
					push(binding.name, stat.values[i]);
					fields(binding.name, stat.values[i]);
				});
			} else if (stat.kind === "assign") {
				stat.targets.forEach((target, i) => {
					if (target.kind === "index" && target.object.kind === "name") push(`${target.object.name}.${target.name.name}`, stat.values[i]);
				});
			}
		},
	});
	return out;
}

/** What a module gives back to whoever requires it. */
export interface ModuleExports {
	kind: "table" | "function" | "value" | "module";
	/** A table's functions and fields, with the comments above them. */
	members: TableMember[];
	/** A function's signature, or a value's type when it is evident. */
	detail?: string;
	/** The comment at the top of the module, above its first statement. */
	doc?: DocComment;
	/** It returns what another require returns: a Wally thunk does. */
	reexport?: RequireTarget;
	/** The local it returns, by name: its fields' requires are `owner.field`. */
	owner?: string;
}

/**
 * What the module's last top-level `return` gives back: a local table and
 * what the file puts on it, a table written out, a function, or another
 * module passed straight through.
 */
export function moduleExports(src: string): ModuleExports {
	const block = luauFile(src).block;
	const last = [...block].reverse().find((s) => s.kind === "return") as Extract<Stat, { kind: "return" }> | undefined;
	const first = block[0];
	// A block comment says what the module is; `-- SERVICES` above the first
	// line of code is a heading, not a description.
	const top = first ? docCommentBefore(src, first.start) : undefined;
	const value = last?.values[0] ? unwrap(last.values[0]) : undefined;
	// Or the `@class` Moonwave gives the table it returns, wherever that stands.
	const classDoc = value?.kind === "name" && /@class\b/.test(src)
		? docRegistry(src).find((e) => e.tag === "class" && e.name === value.name)?.doc
		: undefined;
	const doc = (top?.style === "block" && !top.subject ? top : undefined) ?? classDoc;
	const owner = value?.kind === "name" ? value.name : undefined;
	const out = (e: Omit<ModuleExports, "doc">): ModuleExports => ({ ...e, ...(doc ? { doc } : {}), ...(owner ? { owner } : {}) });
	if (!value) return out({ kind: "value", members: [] });
	if (isRequireCall(value)) {
		const target = targetOf(value.args[0], src);
		return out({ kind: "module", members: [], ...(target ? { reexport: target } : {}) });
	}
	if (value.kind === "function") return out({ kind: "function", members: [], detail: signatureOf(value.func, src) });
	if (value.kind === "table") return out({ kind: "table", members: fieldsOf(value, src) });
	if (value.kind === "name") {
		const local = localsInFile(src, value.start)?.find((n) => n.name === value.name);
		// `local Flux = require(…)` then `return Flux`: the other module's.
		if (isRequireCall(local?.value)) {
			const target = targetOf(local.value.args[0], src);
			return out({ kind: "module", members: [], ...(target ? { reexport: target } : {}) });
		}
		if (local?.value && local.value !== value) {
			const held = unwrap(local.value);
			if (held.kind === "table") {
				const put = membersInCode(src, value.name);
				const written = fieldsOf(held, src, value.name);
				return out({ kind: "table", members: [...put, ...written.filter((w) => !put.some((p) => p.name === w.name))] });
			}
		}
		const written = local?.value?.kind === "table" ? fieldsOf(local.value, src, value.name) : [];
		const put = membersInCode(src, value.name);
		// What the file puts on the table after, over what it was written with.
		const members = [...put, ...written.filter((w) => !put.some((p) => p.name === w.name))];
		if (local?.func) return out({ kind: "function", members, detail: signatureOf(local.func, src) });
		// `function Button(props) … end` then `return Button`: a global the
		// file defines, and the comment above it says what the module is.
		const global = local ? undefined : block.find((s): s is Extract<Stat, { kind: "functionStat" }> =>
			s.kind === "functionStat" && s.path.length === 1 && !s.method && s.path[0].name === value.name);
		if (global) {
			const above = docFor(docCommentBefore(src, global.start), value.name) ?? doc;
			return { kind: "function", members, detail: signatureOf(global.func, src), ...(above ? { doc: above } : {}) };
		}
		return out({ kind: members.length || local?.value?.kind === "table" ? "table" : "value", members });
	}
	return out({ kind: "value", members: [], ...(typeOfValue(value, src) ? { detail: typeOfValue(value, src) } : {}) });
}

/**
 * The value under what dresses it: `(x)`, `x :: T`, `table.freeze(x)` and
 * `setmetatable(x, mt)` all give back `x` as far as its members go.
 */
function unwrap(expr: Expr, depth = 0): Expr {
	if (depth > 8) return expr;
	if (expr.kind === "paren") return unwrap(expr.inner, depth + 1);
	if (expr.kind === "cast") return unwrap(expr.value, depth + 1);
	if (expr.kind === "call" && expr.args.length > 0) {
		const callee = expr.callee;
		const isFreeze = callee.kind === "index" && callee.object.kind === "name" && callee.object.name === "table" && callee.name.name === "freeze";
		const isSetmetatable = callee.kind === "name" && callee.name === "setmetatable";
		if (isFreeze || isSetmetatable) return unwrap(expr.args[0], depth + 1);
	}
	return expr;
}

/**
 * A table constructor's named fields, as members, with the comments above
 * them -- or, for a table called `owner`, what its `@prop`s say.
 */
function fieldsOf(table: Extract<Expr, { kind: "table" }>, src: string, owner?: string): TableMember[] {
	const out: TableMember[] = [];
	for (const field of table.fields) {
		if (field.kind !== "named") continue;
		// `new = Signal.new`: the function the file defines, with its comment.
		const value = field.value;
		if (value.kind === "index" && value.object.kind === "name") {
			const source = membersInCode(src, value.object.name).find((m) => m.name === value.name.name);
			if (source) {
				out.push({ ...source, name: field.name.name, kind: source.kind === "method" ? "function" : source.kind });
				continue;
			}
		}
		const doc = docFor(docCommentBefore(src, field.start), field.name.name);
		out.push({ ...memberFor(field.name.name, field.value, src), ...(doc ? { doc } : {}) });
	}
	return withRegistry(out, src, owner);
}
