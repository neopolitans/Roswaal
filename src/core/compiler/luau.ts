/** Luau lexical helpers: identifiers, literals, and safe expression splicing. */

import type { Literal } from "../schema.js";
import { quoteString } from "./quote.js";

const RESERVED = new Set([
	"and", "break", "do", "else", "elseif", "end", "false", "for", "function",
	"if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
	"until", "while",
	// Contextual in Luau, but shadowing them produces baffling code.
	"continue", "export", "type", "self",
]);

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isIdentifier(s: string): boolean {
	return IDENT_RE.test(s) && !RESERVED.has(s);
}

/**
 * Coerce arbitrary user text into a valid, non-reserved Luau identifier.
 * Deterministic: the same input always yields the same output, which matters
 * because generated files are committed.
 */
export function toIdentifier(s: string, fallback = "value"): string {
	let out = s.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
	if (out === "") out = fallback;
	if (/^[0-9]/.test(out)) out = "_" + out;
	if (RESERVED.has(out)) out = out + "_";
	return out;
}

/**
 * Allocates collision-free identifiers, block by block.
 *
 * ## Why this is a stack and not a set
 *
 * It used to be one set for the whole file, so a name taken anywhere was taken
 * everywhere. Two functions could not both call their parameter `character`,
 * and the second one got `character2` -- for a collision with a name that had
 * gone out of scope before the second function was even written. In a module
 * being converted a page at a time that is worse than ugly: it means the
 * generated file stops matching the file it is a conversion of, and the numbers
 * move every time a name is added further up.
 *
 * Luau's own rule is the right one. A frame is a block -- a function body, a
 * loop body, a branch arm -- and a name is taken if anything *enclosing* has
 * taken it. Siblings do not see each other, so two arms of the same `if` may
 * each declare `restore`, exactly as hand-written Luau does.
 *
 * ## Shadowing is still avoided
 *
 * `taken` walks the whole enclosing chain, so an inner block asking for a name
 * an outer block already holds still gets `name2`. Luau would accept the
 * shadow; a reader following a variable down the page would not.
 *
 * Names belonging to the file rather than to a block -- services, requires,
 * hoisted functions, script variables -- are claimed with `reserve`, which
 * writes into the outermost frame from wherever it is called. A service
 * discovered halfway down a loop body is still declared at the top of the file,
 * so its name has to outlive the block that asked for it.
 */
export class NameScope {
	private frames: Set<string>[] = [new Set()];
	private counter = 0;

	/** Claims a name for the whole file, wherever it was asked for. */
	reserve(name: string): void {
		this.frames[0].add(name);
	}

	/** Opens a block. Every name taken inside it is released by `pop`. */
	push(): void {
		this.frames.push(new Set());
	}

	/** Closes the innermost block. The outermost one cannot be closed. */
	pop(): void {
		if (this.frames.length > 1) this.frames.pop();
	}

	/** Runs `fn` inside a block of its own. */
	within<T>(fn: () => T): T {
		this.push();
		try {
			return fn();
		} finally {
			this.pop();
		}
	}

	private taken(name: string): boolean {
		return this.frames.some((frame) => frame.has(name));
	}

	/** A stable, readable name derived from `hint`, uniquified if taken. */
	unique(hint: string, fallback = "value"): string {
		const base = toIdentifier(hint, fallback);
		const frame = this.frames[this.frames.length - 1];
		if (!this.taken(base)) {
			frame.add(base);
			return base;
		}
		for (let i = 2; ; i++) {
			const candidate = `${base}${i}`;
			if (!this.taken(candidate)) {
				frame.add(candidate);
				return candidate;
			}
		}
	}

	/**
	 * A name that belongs to the file, asked for from wherever.
	 *
	 * The counterpart to `reserve` for a name that still has to be derived: a
	 * service or a required module is hoisted to the top, so it must not be
	 * released when the block that first mentioned it closes.
	 */
	uniqueForFile(hint: string, fallback = "value"): string {
		const frames = this.frames;
		this.frames = [frames[0]];
		try {
			return this.unique(hint, fallback);
		} finally {
			this.frames = frames;
		}
	}

	/** An anonymous temporary. Prefixed so it can never shadow a user name. */
	temp(hint?: string): string {
		this.counter += 1;
		const suffix = hint ? "_" + toIdentifier(hint, "v") : "";
		return this.unique(`_rw${this.counter}${suffix}`, `_rw${this.counter}`);
	}
}

export { quoteString } from "./quote.js";

export function numberLiteral(n: number): string {
	if (Number.isNaN(n)) return "0/0";
	if (n === Infinity) return "math.huge";
	if (n === -Infinity) return "-math.huge";
	return String(n);
}

export function literalToLuau(lit: Literal): string {
	switch (lit.t) {
		case "nil": return "nil";
		case "boolean": return lit.v ? "true" : "false";
		case "number": return numberLiteral(lit.v);
		case "string": return quoteString(lit.v);
		case "raw": return lit.v;
	}
}

/**
 * True when `expr` can be spliced into a larger expression without parentheses.
 *
 * Conservative on purpose: a false negative costs a redundant pair of parens,
 * a false positive silently changes precedence.
 */
export function isAtomic(expr: string): boolean {
	const e = expr.trim();
	if (e === "") return true;
	if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(e)) return true;
	if (/^(true|false|nil)$/.test(e)) return true;
	if (/^"([^"\\]|\\.)*"$/.test(e)) return true;
	if (/^'([^'\\]|\\.)*'$/.test(e)) return true;
	if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(e)) return true;
	// A postfix chain: name, then any run of .field / [ ... ] / ( ... ) / :method( ... ).
	if (/^[A-Za-z_][A-Za-z0-9_]*[.:[(]/.test(e) && isBalancedChain(e)) return true;
	// An empty or fully-wrapped table or parenthesised group.
	if ((e.startsWith("(") || e.startsWith("{")) && closesAtEnd(e)) return true;
	return false;
}

/**
 * True when `expr` is a plain access path: a name, then only `.field` and
 * `[key]` steps, with no call anywhere in it.
 *
 * ## What it is for
 *
 * The emitter binds a pure value to a local as soon as two things read it, so
 * that an expensive or side-effecting expression is not worked out twice. That
 * is right for a call and wrong for `restore.weld`: hand-written Luau writes
 * the path again, and hoisting it costs a line, a name that says nothing, and —
 * less obviously — a *stale read*, because a Set Index between the two uses
 * would not reach the local.
 *
 * So a path may be repeated and anything else may not. The test is deliberately
 * narrow: no `(` at all, which rules out a call, a method call and a
 * parenthesised group in one character. `t[i]` qualifies because `i` is itself
 * a name; `t[f()]` does not.
 */
export function isAccessPath(expr: string): boolean {
	const e = expr.trim();
	if (e === "" || e.includes("(")) return false;
	return ACCESS_PATH.test(e);
}

const ACCESS_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^[\]()]*\])*$/;

/** Wraps `expr` in parentheses unless it is already safe to splice. */
export function paren(expr: string): string {
	return isAtomic(expr) ? expr : `(${expr})`;
}

// ---------------------------------------------------------------------------
// Precedence
//
// The emitter used to guard every splice with `paren`, which asks one question:
// "could this expression be anything other than an atom?" That is always safe
// and frequently wrong to read — `not a` inside an `or` is not ambiguous in any
// language Luau resembles, and `(not humanoid) or (not root)` is three pairs of
// parentheses saying what the operators already said.
//
// So a splice now asks the narrower question instead: *what does this position
// need*, and does the expression already bind at least that tightly. A
// redundant pair is still cheap and a missing one still silently reassociates,
// so every judgement below errs towards wrapping — but it errs from a much
// better starting point.
// ---------------------------------------------------------------------------

/**
 * Binding strength, loosest first. The numbers are Luau's own ordering; only
 * their relative order is meaningful.
 *
 * `cast` sits at the bottom with `or` rather than where Luau's grammar puts it
 * (tighter than unary). `x :: T` is legal in more positions than it is readable
 * in, and Roswaal's own cast template brings its parentheses with it, so
 * nothing is gained by being clever here and a misread type is expensive.
 */
export const PREC = {
	/** A function argument, a table entry, the right of an assignment. */
	lowest: 0,
	cast: 1,
	or: 1,
	and: 2,
	compare: 3,
	concat: 4,
	add: 5,
	mul: 6,
	unary: 7,
	power: 8,
	/** `.field`, `[i]`, `(args)`, `:method()` — and anything already an atom. */
	postfix: 9,
} as const;

/**
 * Binary operators by spelling.
 *
 * `right` is Luau's associativity, which decides which *side* of the operator
 * may hold another use of it without parentheses. `associative` is the stronger
 * claim that regrouping does not change the answer, which is true of `and`,
 * `or` and `..` and — in floating point — not of `+` or `*`.
 */
const BINARY: Record<string, { prec: number; right?: boolean; associative?: boolean }> = {
	or: { prec: PREC.or, associative: true },
	and: { prec: PREC.and, associative: true },
	"==": { prec: PREC.compare },
	"~=": { prec: PREC.compare },
	"<=": { prec: PREC.compare },
	">=": { prec: PREC.compare },
	"<": { prec: PREC.compare },
	">": { prec: PREC.compare },
	"..": { prec: PREC.concat, right: true, associative: true },
	"+": { prec: PREC.add },
	"-": { prec: PREC.add },
	"*": { prec: PREC.mul },
	"/": { prec: PREC.mul },
	"//": { prec: PREC.mul },
	"%": { prec: PREC.mul },
	"^": { prec: PREC.power, right: true },
};

/** What the operand on each side of `op` has to bind at least as tightly as. */
function operandPrecedence(op: string): { left: number; right: number } {
	const { prec, right, associative } = BINARY[op];
	if (associative) return { left: prec, right: prec };
	return right ? { left: prec + 1, right: prec } : { left: prec, right: prec + 1 };
}

/**
 * Operators long enough that a shorter one is a prefix of them, longest first.
 * `<=` has to be tried before `<`, or every `a <= b` reads as `a < (= b)`.
 */
const BINARY_SPELLINGS = ["==", "~=", "<=", ">=", "//", "..", "<", ">", "+", "-", "*", "/", "%", "^"];

/** A Lua numeral: hexadecimal, or decimal with an optional fraction and exponent. */
const NUMERAL = /^(?:0[xX][0-9a-fA-F_]+|[0-9][0-9_]*(?:\.[0-9_]*)?(?:[eE][+-]?[0-9]+)?)/;

/**
 * How tightly an expression binds, judged from its text.
 *
 * Lexical rather than parsed, for the same reason `isAtomic` is: the emitter
 * builds strings, and the alternative is carrying a precedence alongside every
 * expression through every template, fold and split in the file. What it has to
 * be right about is generated Luau, which is one line, well-formed, and made of
 * the operators listed above.
 *
 * Returns `PREC.postfix` for anything with no operator at the top level, which
 * is the answer for an identifier, a call chain, a table, and a parenthesised
 * group alike.
 */
export function expressionPrecedence(expr: string): number {
	const e = expr.trim();
	if (e === "") return PREC.postfix;
	// A negative number is a literal, not an application of unary minus, and
	// `isAtomic` has always agreed. Anything else leading with `-` is not.
	if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(e)) return PREC.postfix;
	// Luau's if-expression and a function literal both run to the end of
	// themselves, so anything placed after one belongs to it.
	if (/^(if|function)\b/.test(e)) return PREC.lowest;

	let lowest: number = PREC.postfix;
	let depth = 0;
	let previous: "operand" | "operator" = "operator";

	for (let i = 0; i < e.length; ) {
		const c = e[i];

		if (c === '"' || c === "'") {
			i = skipString(e, i);
			previous = "operand";
			continue;
		}
		if (c === "[" && (e[i + 1] === "[" || e[i + 1] === "=")) {
			const end = skipLongString(e, i);
			if (end > i) {
				i = end;
				previous = "operand";
				continue;
			}
		}
		if (c === "(" || c === "[" || c === "{") {
			depth++;
			i++;
			// An opening bracket after an operand is a call or an index, which
			// leaves us with an operand again; after an operator it opens one.
			previous = "operand";
			continue;
		}
		if (c === ")" || c === "]" || c === "}") {
			depth--;
			i++;
			previous = "operand";
			continue;
		}
		if (/\s/.test(c)) {
			i++;
			continue;
		}

		// A numeral, taken whole. Piecemeal, its `.` reads as a field access and
		// its `e+` as an addition, and `2 ^ 8` came out as "something unknown".
		if (/[0-9]/.test(c)) {
			const number = NUMERAL.exec(e.slice(i));
			i += number ? number[0].length : 1;
			previous = "operand";
			continue;
		}

		if (/[A-Za-z_]/.test(c)) {
			const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(e.slice(i))![0];
			i += word.length;
			if (depth === 0 && (word === "and" || word === "or")) {
				lowest = Math.min(lowest, BINARY[word].prec);
				previous = "operator";
			} else if (word === "not") {
				if (depth === 0) lowest = Math.min(lowest, PREC.unary);
				previous = "operator";
			} else {
				previous = "operand";
			}
			continue;
		}

		if (c === ":" && e[i + 1] === ":") {
			if (depth === 0) lowest = Math.min(lowest, PREC.cast);
			i += 2;
			previous = "operator";
			continue;
		}
		if (c === "#") {
			if (depth === 0) lowest = Math.min(lowest, PREC.unary);
			i++;
			previous = "operator";
			continue;
		}

		// Before the single characters below, because `.` is the start of `..`
		// and `=` the start of `==`, and taking either one character at a time
		// loses the operator entirely.
		const op = BINARY_SPELLINGS.find((spelling) => e.startsWith(spelling, i));
		if (op) {
			// A `-` directly after another operator is unary, and a unary
			// application binds tighter than any binary one.
			const unary = op === "-" && previous === "operator";
			if (depth === 0) lowest = Math.min(lowest, unary ? PREC.unary : BINARY[op].prec);
			i += op.length;
			previous = "operator";
			continue;
		}

		if (c === ":" || c === "." || c === "," || c === ";" || c === "=") {
			i++;
			previous = c === "," || c === ";" ? "operator" : "operand";
			// A comma at depth 0 is an expression list, not an expression.
			if (depth === 0 && (c === "," || c === ";")) lowest = PREC.lowest;
			continue;
		}

		// Something unrecognised at the top level: assume the worst.
		if (depth === 0) lowest = PREC.lowest;
		i++;
		previous = "operand";
	}

	return lowest;
}

function skipString(text: string, start: number): number {
	const quote = text[start];
	for (let i = start + 1; i < text.length; i++) {
		if (text[i] === "\\") {
			i++;
			continue;
		}
		if (text[i] === quote) return i + 1;
	}
	return text.length;
}

/** `[[ … ]]`, `[==[ … ]==]`. Returns `start` when this is not one. */
function skipLongString(text: string, start: number): number {
	const open = /^\[(=*)\[/.exec(text.slice(start));
	if (!open) return start;
	const close = `]${open[1]}]`;
	const end = text.indexOf(close, start + open[0].length);
	return end === -1 ? text.length : end + close.length;
}

/**
 * Parenthesises `expr` only when the position it is going into binds tighter
 * than the expression itself does.
 */
export function parenAt(expr: string, needed: number): string {
	const e = expr.trim();
	if (needed <= PREC.lowest) return e;
	return expressionPrecedence(e) >= needed ? e : `(${e})`;
}

/**
 * What each operand of `$args(<separator>)` has to bind at least as tightly as.
 *
 * Two answers rather than one, because folding is left to right and most
 * operators are not associative: `a - (b - c)` is not `a - b - c`, and in
 * floating point neither is `a * (b / c)` reliably `a * b / c`. Only the three
 * that genuinely re-group — `and`, `or` and `..` — let a later operand sit at
 * the separator's own level.
 *
 * A separator that is not an operator at all (a comma, for a call's arguments)
 * needs nothing: every expression is a legal argument.
 */
export function foldPrecedence(separator: string): { first: number; rest: number } {
	const op = separator.trim();
	if (op === "" || op === "," || op === ";") return { first: PREC.lowest, rest: PREC.lowest };
	// An unknown separator is something hand-written in a template. Treat the
	// operands as though they were being indexed, which is what `paren` did for
	// every separator before this existed.
	if (!BINARY[op]) return { first: PREC.postfix, rest: PREC.postfix };
	const { left, right } = operandPrecedence(op);
	return { first: left, rest: right };
}

/**
 * What a placeholder's position in a template needs, read off the text either
 * side of it.
 *
 * Short and hand-written is what makes this workable: a template is one line of
 * Luau with holes in it, so "the operator immediately to the left" is a
 * question with an answer rather than a parse.
 */
export function templatePrecedence(template: string, start: number, end: number): number {
	const before = template.slice(0, start).trimEnd();
	const after = template.slice(end).trimStart();
	return Math.max(fromPreceding(before), fromFollowing(after));
}

function fromPreceding(before: string): number {
	if (before === "") return PREC.lowest;
	const word = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before)?.[0];
	if (word) {
		if (word === "not") return PREC.unary;
		if (word === "and" || word === "or") return operandPrecedence(word).right;
		return PREC.lowest;
	}
	if (before.endsWith("::")) return PREC.postfix;
	// A lone "=" is an assignment or a comparison's right-hand side; both are
	// already at the lowest precedence, so nothing needs wrapping.
	if (before.endsWith("=") && !BINARY_SPELLINGS.some((op) => op.length > 1 && before.endsWith(op))) {
		return PREC.lowest;
	}
	if (before.endsWith("#")) return PREC.unary;
	const op = BINARY_SPELLINGS.find((spelling) => before.endsWith(spelling));
	// Text before the hole means the hole is this operator's right operand.
	if (op) return operandPrecedence(op).right;
	// A hole reached through `.` or `:` is part of a postfix chain. An open
	// bracket before it is the opposite: `f(` and `t[` both start a position
	// where any expression at all is legal.
	if (/[.:]$/.test(before)) return PREC.postfix;
	return PREC.lowest;
}

function fromFollowing(after: string): number {
	if (after === "") return PREC.lowest;
	const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(after)?.[0];
	if (word) return word === "and" || word === "or" ? operandPrecedence(word).left : PREC.lowest;
	// A lone "=" means this placeholder is the assignment target, and Luau will
	// not accept a parenthesised one in every position.
	if (after.startsWith("=") && !after.startsWith("==")) return PREC.lowest;
	if (after.startsWith("::")) return PREC.postfix;
	if (/^[.:[(]/.test(after)) return PREC.postfix;
	const op = BINARY_SPELLINGS.find((spelling) => after.startsWith(spelling));
	// Text after the hole means the hole is this operator's left operand.
	if (op) return operandPrecedence(op).left;
	return PREC.lowest;
}

/** True when the first bracket opened is only closed by the final character. */
function closesAtEnd(e: string): boolean {
	let depth = 0;
	for (let i = 0; i < e.length; i++) {
		const c = e[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") {
			depth--;
			if (depth === 0 && i !== e.length - 1) return false;
			if (depth < 0) return false;
		}
	}
	return depth === 0;
}

/**
 * Verifies the expression is a bracket-balanced postfix chain with no
 * top-level operators or whitespace-separated tokens.
 */
function isBalancedChain(e: string): boolean {
	let depth = 0;
	let inString: string | null = null;
	for (let i = 0; i < e.length; i++) {
		const c = e[i];
		if (inString) {
			if (c === "\\") { i++; continue; }
			if (c === inString) inString = null;
			continue;
		}
		if (c === '"' || c === "'") { inString = c; continue; }
		if (c === "(" || c === "[" || c === "{") { depth++; continue; }
		if (c === ")" || c === "]" || c === "}") { depth--; if (depth < 0) return false; continue; }
		// At the top level anything other than chain punctuation means this is a
		// compound expression, which needs parentheses to splice safely.
		if (depth === 0 && !/[A-Za-z0-9_.:]/.test(c)) return false;
	}
	return depth === 0 && inString === null;
}

/** Indents a multi-line snippet by `n` tabs, leaving blank lines untouched. */
export function indentBlock(text: string, n: number): string {
	const pad = "\t".repeat(n);
	return text
		.split("\n")
		.map((l) => (l.trim() === "" ? l : pad + l))
		.join("\n");
}
