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

/** Allocates collision-free identifiers within one compilation unit. */
export class NameScope {
	private used = new Set<string>();
	private counter = 0;

	reserve(name: string): void {
		this.used.add(name);
	}

	/** A stable, readable name derived from `hint`, uniquified if taken. */
	unique(hint: string, fallback = "value"): string {
		const base = toIdentifier(hint, fallback);
		if (!this.used.has(base)) {
			this.used.add(base);
			return base;
		}
		for (let i = 2; ; i++) {
			const candidate = `${base}${i}`;
			if (!this.used.has(candidate)) {
				this.used.add(candidate);
				return candidate;
			}
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

/** Wraps `expr` in parentheses unless it is already safe to splice. */
export function paren(expr: string): string {
	return isAtomic(expr) ? expr : `(${expr})`;
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
