/**
 * Which locals are in scope, read from the parse rather than scanned.
 *
 * The scanner this replaces found every `local` in a snippet, so a name
 * declared inside an `if` was offered after the `if` had closed, and nothing
 * declared inside the code being typed was offered at all. The tree knows
 * where each block starts and stops, so both questions have exact answers:
 *
 * - `topLevelLocals`: what a Code Block leaves behind for the blocks
 *   that run after it — its top-level locals, and nothing nested.
 * - `localsAt`: what is in scope at a point inside the code — enclosing
 *   blocks, function parameters, loop variables — for completing as you type.
 */

import type { Binding, Block, Expr, FunctionBody, Stat } from "./ast.js";
import { luauFile } from "./file.js";
import { parseChunk } from "./parser.js";
import { contains, type Visitor, visitBlock, visitExpr, visitStat } from "./visit.js";

export type LocalKind = "local" | "function" | "parameter" | "loop variable";

export interface ScopedName {
	name: string;
	kind: LocalKind;
	/** The type written beside it, as written: `local part: Part`. */
	typeText?: string;
	/** What it was declared with, for working out what it holds. */
	value?: Expr;
	/** A local function's definition, for its signature. */
	func?: FunctionBody;
	/** Where the statement that declares it starts, for the doc comment above. */
	declaredAt?: number;
}

/** A binding's written type as text, for a name that carries it. */
function typeTextOf(binding: Binding, src: string): { typeText?: string } {
	return binding.type ? { typeText: src.slice(binding.type.start, binding.type.end).trim() } : {};
}

/** Names a statement leaves in scope for the statements after it. */
function declared(stat: Stat, src: string): ScopedName[] {
	switch (stat.kind) {
		case "local":
		case "const":
			return stat.names.map((b, i) => ({
				name: b.name,
				kind: "local" as const,
				declaredAt: stat.start,
				...typeTextOf(b, src),
				...(stat.values[i] ? { value: stat.values[i] } : {}),
			}));
		case "localFunction":
			return [{ name: stat.name.name, kind: "function", func: stat.func, declaredAt: stat.start }];
		default:
			return [];
	}
}

/**
 * The locals a block of code declares at its top level: what is still in
 * scope after it, for a Code Block that runs later. In order, once each.
 */
export function topLevelLocals(src: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const stat of luauFile(src).block) {
		for (const { name } of declared(stat, src)) {
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

	return new ScopeWalk(before, offset).names(best.value, offset);
}

/**
 * The names in scope at `offset` in a whole file, read from the file as it
 * stands rather than the text before the point.
 *
 * For hover, over code that is finished: `localsAt` closes open blocks with
 * `end`, which cannot close an open call, so a point inside a callback passed
 * as an argument -- `promise:andThen(function() … end)` -- found nothing.
 * Undefined when the file does not parse, for the caller to fall back.
 */
export function localsInFile(src: string, offset: number): ScopedName[] | undefined {
	const file = luauFile(src);
	if (file.errors.length > 0) return undefined;
	return localsInParsed(file.block, src, offset);
}

/** `localsInFile` over a parse already made: a check that asks at every name parses once. */
export function localsInParsed(block: Block, src: string, offset: number): ScopedName[] {
	return new ScopeWalk(src, offset).names(block, src.length);
}

/**
 * One question -- what is in scope at `at` -- asked of one tree. `src` is the
 * text the tree was read from, for the types written beside names.
 */
class ScopeWalk {
	private readonly found: ScopedName[] = [];

	constructor(
		private readonly src: string,
		private readonly at: number,
	) {}

	/** The names in scope, innermost declaration of each, in declaration order. */
	names(block: Block, to: number): ScopedName[] {
		this.block(block, 0, to);
		const out: ScopedName[] = [];
		const seen = new Set<string>();
		for (let i = this.found.length - 1; i >= 0; i--) {
			if (seen.has(this.found[i].name)) continue;
			seen.add(this.found[i].name);
			out.unshift(this.found[i]);
		}
		return out;
	}

	/**
	 * The statements of a block that begins at `from` and ends at `to`: what
	 * each finished statement declares, then into the one the point is inside.
	 */
	private block(block: Block, from: number, to: number): void {
		if (this.at < from || this.at > to) return;
		for (const stat of block) {
			if (stat.end <= this.at) {
				this.found.push(...declared(stat, this.src));
				continue;
			}
			if (stat.start <= this.at) this.enter(stat);
			return;
		}
	}

	private enter(stat: Stat): void {
		const at = this.at;
		switch (stat.kind) {
			case "localFunction":
				// Its own name is in scope inside it: a local function can recurse.
				this.found.push({
					name: stat.name.name,
					kind: "function",
					func: stat.func,
					declaredAt: stat.start,
				});
				this.function(stat.func);
				return;
			case "functionStat":
			case "typeFunction":
				this.function(stat.func);
				return;
			// A block runs from the keyword that opens it to the one that closes
			// it, so a point in an empty block, or before its first statement, is
			// still inside that block and no other.
			case "do":
				this.block(stat.body, stat.start, stat.endKeyword.start);
				return;
			case "while":
				if (at <= stat.condition.end) return this.functionsIn(stat.condition);
				this.block(stat.body, stat.doKeyword.end, stat.endKeyword.start);
				return;
			case "repeat":
				// The condition sees the body's locals: `repeat local x = f() until x`.
				if (at >= stat.untilKeyword.end) {
					for (const inner of stat.body) this.found.push(...declared(inner, this.src));
					return this.functionsIn(stat.condition);
				}
				this.block(stat.body, stat.start, stat.untilKeyword.start);
				return;
			case "if":
				stat.clauses.forEach((clause, i) => {
					if (contains(clause.condition, at)) this.functionsIn(clause.condition);
					const next = stat.clauses[i + 1]?.keyword ?? stat.elseKeyword ?? stat.endKeyword;
					this.block(clause.body, clause.thenKeyword.end, next.start);
				});
				if (stat.orElse && stat.elseKeyword)
					this.block(stat.orElse, stat.elseKeyword.end, stat.endKeyword.start);
				return;
			case "numericFor": {
				const range = stat.step ?? stat.to;
				if (at <= range.end) return this.functionsIn(range);
				this.found.push({
					name: stat.variable.name,
					kind: "loop variable",
					...typeTextOf(stat.variable, this.src),
				});
				this.block(stat.body, stat.doKeyword.end, stat.endKeyword.start);
				return;
			}
			case "genericFor": {
				const last = stat.values[stat.values.length - 1];
				if (last && at <= last.end) return this.functionsIn(last);
				for (const v of stat.variables)
					this.found.push({ name: v.name, kind: "loop variable", ...typeTextOf(v, this.src) });
				this.block(stat.body, stat.doKeyword.end, stat.endKeyword.start);
				return;
			}
			default:
				// A local's own name is not in scope in its value — `local x = x`
				// reads the outer one — so only functions written inside it matter.
				this.functionsInStat(stat);
		}
	}

	private function(func: FunctionBody): void {
		for (const param of func.params)
			this.found.push({ name: param.name, kind: "parameter", ...typeTextOf(param, this.src) });
		this.block(func.body, func.paramsClose.end, func.endKeyword.start);
	}

	/** Into the function expression the point is inside, anywhere in `node`. */
	private functionsIn(node: Expr): void {
		visitExpr(node, this.intoFunctions());
	}

	/** `functionsIn`, for a statement that opens no block of its own. */
	private functionsInStat(stat: Stat): void {
		visitStat(stat, this.intoFunctions());
	}

	/** A walk that keeps to the nodes around the point and enters the function it finds. */
	private intoFunctions(): Visitor {
		return {
			stat: (stat) => contains(stat, this.at),
			type: (type) => contains(type, this.at),
			expr: (expr) => {
				if (!contains(expr, this.at)) return false;
				if (expr.kind !== "function") return true;
				this.function(expr.func);
				return false;
			},
		};
	}
}

/**
 * The local whose name is written at `offset`, where it is declared:
 * `local function count<T>(` with the cursor on `count`.
 *
 * `localsAt` reads only the text before a point, and a declaration whose
 * parameters run onto the next lines does not read on its own, so the name
 * of one was never found there. This reads the whole file instead.
 */
export function declarationAt(src: string, offset: number): ScopedName | undefined {
	let found: ScopedName | undefined;
	visitBlock(luauFile(src).block, {
		stat: (stat) => {
			if (found) return false;
			if (stat.kind === "localFunction" && contains(stat.name, offset)) {
				found = declared(stat, src)[0];
			} else if (stat.kind === "local" || stat.kind === "const") {
				// The name only: a binding's span runs on over its type, `x: Part`.
				const i = stat.names.findIndex(
					(b) => b.start <= offset && offset <= b.start + b.name.length,
				);
				if (i !== -1) found = declared(stat, src)[i];
			}
			return !found;
		},
		expr: () => !found,
	});
	return found;
}
