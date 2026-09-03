/**
 * A parser for Luau table literals, used to read `.nodedef.luau` node packs.
 *
 * It parses; it does not execute. That distinction is the whole reason this
 * file exists rather than a call into Lune: a node pack is data a project
 * downloads from somewhere, and running it would mean running a stranger's
 * code every time the editor opens a project. Parsing a literal gives Roblox
 * developers the syntax they already write in, with none of that.
 *
 * The grammar is deliberately small — the value half of Luau and nothing else:
 *
 *     return { key = "value", ["other"] = 1, nested = { true, false, nil } }
 *
 * Function calls, concatenation, arithmetic, and variable references are all
 * rejected with a line number, because supporting any of them would mean
 * evaluating something.
 */

export class LuauParseError extends Error {
	constructor(message: string, readonly line: number) {
		super(`line ${line}: ${message}`);
	}
}

type Token =
	| { kind: "punct"; value: string; line: number }
	| { kind: "name"; value: string; line: number }
	| { kind: "string"; value: string; line: number }
	| { kind: "number"; value: number; line: number }
	| { kind: "keyword"; value: "true" | "false" | "nil" | "return"; line: number }
	| { kind: "eof"; line: number };

const KEYWORDS = new Set(["true", "false", "nil", "return"]);
const PUNCTUATION = new Set(["{", "}", "[", "]", "=", ",", ";", "-"]);

/**
 * Parses a Luau chunk of the form `return <value>` and returns plain JS data.
 * A chunk with no `return` yields the last table literal in the file, so a
 * pack can be written either way.
 */
export function parseLuauData(source: string): unknown {
	const tokens = tokenize(source);
	const parser = new Parser(tokens);
	return parser.parseChunk();
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	let line = 1;

	const peek = (offset = 0) => source[i + offset];

	while (i < source.length) {
		const c = source[i];

		if (c === "\n") {
			line++;
			i++;
			continue;
		}
		if (c === " " || c === "\t" || c === "\r") {
			i++;
			continue;
		}

		// Comments: -- to end of line, or --[[ ... ]] across lines.
		if (c === "-" && peek(1) === "-") {
			i += 2;
			if (peek() === "[" && peek(1) === "[") {
				i += 2;
				while (i < source.length && !(peek() === "]" && peek(1) === "]")) {
					if (source[i] === "\n") line++;
					i++;
				}
				i += 2;
			} else {
				while (i < source.length && source[i] !== "\n") i++;
			}
			continue;
		}

		// Long strings, which Roblox developers reach for in descriptions.
		if (c === "[" && peek(1) === "[") {
			i += 2;
			const start = i;
			while (i < source.length && !(peek() === "]" && peek(1) === "]")) {
				if (source[i] === "\n") line++;
				i++;
			}
			if (i >= source.length) throw new LuauParseError("unterminated long string", line);
			tokens.push({ kind: "string", value: source.slice(start, i), line });
			i += 2;
			continue;
		}

		if (c === '"' || c === "'") {
			const { value, next, lines } = readQuoted(source, i, c, line);
			tokens.push({ kind: "string", value, line });
			i = next;
			line += lines;
			continue;
		}

		if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(peek(1) ?? ""))) {
			const start = i;
			while (i < source.length && /[0-9.eExXa-fA-F+_-]/.test(source[i])) {
				// A minus only belongs to the number when it follows an exponent.
				if (source[i] === "-" && !/[eE]/.test(source[i - 1] ?? "")) break;
				if (source[i] === "+" && !/[eE]/.test(source[i - 1] ?? "")) break;
				i++;
			}
			const text = source.slice(start, i).replace(/_/g, "");
			const value = Number(text);
			if (Number.isNaN(value)) throw new LuauParseError(`bad number "${text}"`, line);
			tokens.push({ kind: "number", value, line });
			continue;
		}

		if (/[A-Za-z_]/.test(c)) {
			const start = i;
			while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
			const word = source.slice(start, i);
			if (KEYWORDS.has(word)) {
				tokens.push({ kind: "keyword", value: word as "true", line });
			} else {
				tokens.push({ kind: "name", value: word, line });
			}
			continue;
		}

		if (PUNCTUATION.has(c)) {
			tokens.push({ kind: "punct", value: c, line });
			i++;
			continue;
		}

		throw new LuauParseError(
			`unexpected character "${c}". Node packs hold data only — no expressions or calls.`,
			line,
		);
	}

	tokens.push({ kind: "eof", line });
	return tokens;
}

const ESCAPES: Record<string, string> = {
	n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v",
	"\\": "\\", '"': '"', "'": "'", "\n": "\n",
};

function readQuoted(
	source: string, start: number, quote: string, line: number,
): { value: string; next: number; lines: number } {
	let i = start + 1;
	let out = "";
	let lines = 0;

	while (i < source.length) {
		const c = source[i];
		if (c === quote) return { value: out, next: i + 1, lines };
		if (c === "\n") throw new LuauParseError("unterminated string", line + lines);

		if (c === "\\") {
			const escape = source[i + 1];
			if (escape === undefined) break;
			if (/[0-9]/.test(escape)) {
				// Decimal escape: up to three digits.
				let digits = "";
				let j = i + 1;
				while (digits.length < 3 && /[0-9]/.test(source[j] ?? "")) digits += source[j++];
				out += String.fromCharCode(Number(digits));
				i = j;
				continue;
			}
			out += ESCAPES[escape] ?? escape;
			if (escape === "\n") lines++;
			i += 2;
			continue;
		}
		out += c;
		i++;
	}
	throw new LuauParseError("unterminated string", line + lines);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
	private at = 0;

	constructor(private tokens: Token[]) {}

	private peek(): Token {
		return this.tokens[this.at];
	}

	private next(): Token {
		return this.tokens[this.at++];
	}

	private expect(value: string): Token {
		const token = this.next();
		if (token.kind !== "punct" || token.value !== value) {
			throw new LuauParseError(`expected "${value}"`, token.line);
		}
		return token;
	}

	private isPunct(value: string): boolean {
		const token = this.peek();
		return token.kind === "punct" && token.value === value;
	}

	parseChunk(): unknown {
		// Skip anything before the return, so a pack may carry a header comment
		// or (harmlessly) a `--!strict` line.
		while (this.peek().kind !== "eof") {
			const token = this.peek();
			if (token.kind === "keyword" && token.value === "return") {
				this.next();
				return this.parseValue();
			}
			if (token.kind === "punct" && token.value === "{") {
				return this.parseTable();
			}
			this.next();
		}
		throw new LuauParseError("expected a table, or `return { ... }`", this.peek().line);
	}

	private parseValue(): unknown {
		const token = this.peek();

		if (token.kind === "punct" && token.value === "{") return this.parseTable();
		if (token.kind === "punct" && token.value === "-") {
			this.next();
			const number = this.next();
			if (number.kind !== "number") throw new LuauParseError("expected a number", number.line);
			return -number.value;
		}
		if (token.kind === "string" || token.kind === "number") {
			this.next();
			return token.value;
		}
		if (token.kind === "keyword") {
			this.next();
			if (token.value === "true") return true;
			if (token.value === "false") return false;
			if (token.value === "nil") return null;
			throw new LuauParseError(`unexpected "${token.value}"`, token.line);
		}
		if (token.kind === "name") {
			throw new LuauParseError(
				`unexpected "${token.value}". A node pack is data: only strings, numbers, booleans, nil and tables.`,
				token.line,
			);
		}
		throw new LuauParseError("expected a value", token.line);
	}

	/**
	 * Returns an array when every entry was positional, and an object as soon as
	 * one is named. That is the shape callers want, and node packs never mix the
	 * two in practice.
	 */
	private parseTable(): unknown {
		const open = this.expect("{");
		const positional: unknown[] = [];
		const named: Record<string, unknown> = {};
		let hasNamed = false;

		while (!this.isPunct("}")) {
			if (this.peek().kind === "eof") {
				throw new LuauParseError("unterminated table", open.line);
			}

			// ["key"] = value
			if (this.isPunct("[")) {
				this.next();
				const key = this.parseValue();
				this.expect("]");
				this.expect("=");
				named[String(key)] = this.parseValue();
				hasNamed = true;
			} else if (this.peek().kind === "name" && this.isAssignment()) {
				const key = this.next() as { value: string };
				this.expect("=");
				named[key.value] = this.parseValue();
				hasNamed = true;
			} else {
				positional.push(this.parseValue());
			}

			if (this.isPunct(",") || this.isPunct(";")) this.next();
			else break;
		}
		if (!this.isPunct("}")) {
			// Reported against the opening brace, not the end of the file: in a
			// pack of forty nodes, "line 12" is the useful half of the answer.
			throw new LuauParseError(
				`unterminated table opened here (expected "}")`,
				open.line,
			);
		}
		this.next();

		if (!hasNamed) return positional;
		// A table with both kinds keeps the positional entries under Lua's own
		// 1-based indices, rather than quietly dropping them.
		positional.forEach((value, index) => {
			named[String(index + 1)] = value;
		});
		return named;
	}

	/** Distinguishes `key = value` from a bare name, which is not legal here. */
	private isAssignment(): boolean {
		const following = this.tokens[this.at + 1];
		return following?.kind === "punct" && following.value === "=";
	}
}
