/**
 * Which locals are in scope, read from the parse rather than scanned.
 *
 * The scanner this replaces found every `local` in a snippet, so a name
 * declared inside an `if` was offered after the `if` had closed, and nothing
 * declared inside the code being typed was offered at all. The tree knows
 * where each block starts and stops, so both questions have exact answers:
 *
 * - `topLevelLocals`: what a Custom Code block leaves behind for the blocks
 *   that run after it — its top-level locals, and nothing nested.
 * - `localsAt`: what is in scope at a point inside the code — enclosing
 *   blocks, function parameters, loop variables — for completing as you type.
 */

import type { Block, Expr, FunctionBody, Stat } from "./ast.js";
import { parseChunk } from "./parser.js";

export type LocalKind = "local" | "function" | "parameter" | "loop variable";

export interface ScopedName {
	name: string;
	kind: LocalKind;
	/** The type written beside it, as written: `local part: Part`. */
	typeText?: string;
	/** What it was declared with, for working out what it holds. */
	value?: Expr;
}

/** Names a statement leaves in scope for the statements after it. */
function declared(stat: Stat): ScopedName[] {
	switch (stat.kind) {
		case "local":
		case "const":
			return stat.names.map((b, i) => ({
				name: b.name,
				kind: "local" as const,
				...(b.type ? { typeSpan: b.type } : {}),
				...(stat.values[i] ? { value: stat.values[i] } : {}),
			}));
		case "localFunction":
			return [{ name: stat.name.name, kind: "function" }];
		default:
			return [];
	}
}

/**
 * The locals a block of code declares at its top level: what is still in
 * scope after it, for a Custom Code block that runs later. In order, once each.
 */
export function topLevelLocals(src: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const stat of parseChunk(src).value) {
		for (const { name } of declared(stat)) {
			if (seen.has(name)) continue;
			seen.add(name);
			out.push(name);
		}
	}
	return out;
}

/**
 * The names in scope at `offset`, innermost last, once each.
 *
 * Code being typed is usually unfinished — an `if` with no `end` yet — and a
 * statement the parser cannot finish is dropped whole, taking its body's
 * locals with it. So only the text before the cursor is read (nothing after
 * it can be in scope anyway), and blocks it leaves open are closed with `end`
 * until it reads.
 */
export function localsAt(src: string, offset: number): ScopedName[] {
	// A cursor where a value is due — `until |`, `local x = |` — leaves the text
	// unreadable however many blocks are closed, so a placeholder name is tried
	// there too. It sits past the offset, so it can never be offered.
	const before = src.slice(0, offset);
	let best = parseChunk(before);
	for (const filler of ["", " _"]) {
		for (let closers = 0; closers <= 8 && best.errors.length > 0; closers++) {
			const attempt = parseChunk(`${before}${filler}\n${"end\n".repeat(closers)}`);
			if (attempt.errors.length < best.errors.length) best = attempt;
		}
	}

	const found: ScopedName[] = [];
	walkBlock(best.value, offset, found, 0, offset);
	// A written type as its text, so a caller need not keep the source.
	for (const item of found as (ScopedName & { typeSpan?: { start: number; end: number } })[]) {
		if (item.typeSpan) item.typeText = before.slice(item.typeSpan.start, item.typeSpan.end).trim();
		delete item.typeSpan;
	}

	// The innermost declaration of a name is the one in scope.
	const out: ScopedName[] = [];
	const seen = new Set<string>();
	for (let i = found.length - 1; i >= 0; i--) {
		if (seen.has(found[i].name)) continue;
		seen.add(found[i].name);
		out.unshift(found[i]);
	}
	return out;
}

/**
 * Walks the statements of a block that begins at `from` and ends at `to`,
 * adding what each finished statement declares and descending into the one
 * the offset is inside.
 */
function walkBlock(block: Block, at: number, out: ScopedName[], from: number, to: number): void {
	if (at < from || at > to) return;
	for (const stat of block) {
		if (stat.end <= at) {
			out.push(...declared(stat));
			continue;
		}
		if (stat.start <= at) enter(stat, at, out);
		return;
	}
}

function enter(stat: Stat, at: number, out: ScopedName[]): void {
	switch (stat.kind) {
		case "localFunction":
			// Its own name is in scope inside it: a local function can recurse.
			out.push({ name: stat.name.name, kind: "function" });
			enterFunction(stat.func, at, out);
			return;
		case "function":
		case "typeFunction":
			enterFunction(stat.func, at, out);
			return;
		case "do":
			walkBlock(stat.body, at, out, stat.start, stat.end);
			return;
		case "while": {
			if (at <= stat.condition.end) return enterExpr(stat.condition, at, out);
			walkBlock(stat.body, at, out, stat.condition.end, stat.end);
			return;
		}
		case "repeat": {
			// The condition sees the body's locals: `repeat local x = f() until x`.
			if (at >= stat.condition.start) {
				for (const inner of stat.body) out.push(...declared(inner));
				return enterExpr(stat.condition, at, out);
			}
			walkBlock(stat.body, at, out, stat.start, stat.condition.start);
			return;
		}
		case "if": {
			stat.clauses.forEach((clause, i) => {
				if (at >= clause.condition.start && at <= clause.condition.end) enterExpr(clause.condition, at, out);
				const next = stat.clauses[i + 1]?.condition.start ?? stat.orElse?.[0]?.start ?? stat.end;
				walkBlock(clause.body, at, out, clause.condition.end, next);
			});
			if (stat.orElse) {
				const last = stat.clauses[stat.clauses.length - 1];
				const bodyEnd = last.body[last.body.length - 1]?.end ?? last.condition.end;
				walkBlock(stat.orElse, at, out, bodyEnd, stat.end);
			}
			return;
		}
		case "numericFor": {
			const range = stat.step ?? stat.to;
			if (at <= range.end) return enterExpr(range, at, out);
			out.push({ name: stat.variable.name, kind: "loop variable" });
			walkBlock(stat.body, at, out, range.end, stat.end);
			return;
		}
		case "genericFor": {
			const last = stat.values[stat.values.length - 1];
			if (last && at <= last.end) return enterExpr(last, at, out);
			for (const v of stat.variables) out.push({ name: v.name, kind: "loop variable" });
			walkBlock(stat.body, at, out, last?.end ?? stat.start, stat.end);
			return;
		}
		default:
			// A local's own name is not in scope in its value — `local x = x`
			// reads the outer one — so only functions written inside it matter.
			enterExpr(stat, at, out);
	}
}

function enterFunction(func: FunctionBody, at: number, out: ScopedName[]): void {
	for (const param of func.params) {
		out.push({ name: param.name, kind: "parameter", ...(param.type ? { typeSpan: param.type } : {}) } as ScopedName);
	}
	const bodyStart = func.params[func.params.length - 1]?.end ?? func.start;
	walkBlock(func.body, at, out, bodyStart, func.end);
}

/** Finds a function expression the offset is inside, anywhere in `node`. */
function enterExpr(node: unknown, at: number, out: ScopedName[]): void {
	if (Array.isArray(node)) {
		for (const item of node) enterExpr(item, at, out);
		return;
	}
	if (!node || typeof node !== "object") return;
	const span = node as { start?: number; end?: number; kind?: string };
	if (typeof span.start === "number" && typeof span.end === "number" && (at < span.start || at > span.end)) {
		return;
	}
	const expr = node as Expr;
	if (expr.kind === "function") {
		enterFunction(expr.func, at, out);
		return;
	}
	for (const value of Object.values(node)) {
		if (value && typeof value === "object") enterExpr(value, at, out);
	}
}
