/**
 * Luau, as tokens.
 *
 * The first half of a real parser. Until now every reader of Luau text in
 * Roswaal was its own scanner — the bracket check, the `local` finder, the
 * precedence guesser, the pack reader — and each knew a different subset of
 * the language: one skipped backtick strings and one did not, none knew a
 * long bracket with `=` in it. This is the one lexer they can all stand on.
 *
 * ## Lossless
 *
 * Every character of the source belongs to exactly one token, whitespace and
 * comments included, so joining every token's `text` gives back the source
 * byte for byte. That is the test it is held to, and it is what lets a later
 * tool rewrite one token and leave the rest of a file exactly as it was.
 *
 * ## Never throws
 *
 * Code half-typed into a Custom Code node is the normal case, not an
 * exception. Something that cannot be read becomes an `error` token carrying
 * the reason, and lexing carries on after it.
 *
 * ## Interpolated strings
 *
 * `` `a {b} c` `` is not one token: the braces hold ordinary Luau. It comes
 * out as `interpBegin` (`` `a { ``), the tokens of `b`, then `interpEnd`
 * (`` } c` ``) — or `interpMid` (`} … {`) between holes, or `interpSimple`
 * for a backtick string with none. A `{` inside a hole is a table and is
 * counted, so only the `}` that closes the hole resumes the string.
 */

export type TokenKind =
	| "whitespace"
	| "comment"
	| "name"
	| "keyword"
	| "number"
	| "string"
	| "interpSimple"
	| "interpBegin"
	| "interpMid"
	| "interpEnd"
	| "symbol"
	| "error"
	| "eof";

export interface Token {
	kind: TokenKind;
	/** Exactly the source it covers. */
	text: string;
	/** Offset of the first character, and one past the last. */
	start: number;
	end: number;
	/** Why an `error` token could not be read. */
	message?: string;
}

/**
 * Reserved words: never a name. `continue`, `type`, `export` and `typeof` are
 * not here — Luau keeps them usable as names and decides from context, so the
 * parser does too.
 */
export const KEYWORDS: ReadonlySet<string> = new Set([
	"and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if",
	"in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

/** Longest first, so `...` wins over `..` and `//=` over `//`. */
const SYMBOLS = [
	"...", "//=", "..=",
	"::", "->", "==", "~=", "<=", ">=", "..", "//",
	"+=", "-=", "*=", "/=", "%=", "^=",
	"+", "-", "*", "/", "%", "^", "#", "<", ">", "=", "(", ")", "{", "}", "[", "]",
	";", ":", ",", ".", "?", "|", "&", "@",
];

const isDigit = (c: string) => c >= "0" && c <= "9";
const isNameStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isNameChar = (c: string) => isNameStart(c) || isDigit(c);
const isHex = (c: string) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isSpace = (c: string) => c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\f" || c === "\v";

/** The level of a long bracket opening at `at` — `[[` is 0, `[==[` is 2 — or -1. */
function longBracketLevel(src: string, at: number): number {
	if (src[at] !== "[") return -1;
	let i = at + 1;
	while (src[i] === "=") i++;
	return src[i] === "[" ? i - at - 1 : -1;
}

export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	/** One entry per open interpolation hole: the `{` nesting inside it. */
	const holes: number[] = [];
	let i = 0;

	const push = (kind: TokenKind, start: number, end: number, message?: string) => {
		tokens.push({ kind, text: src.slice(start, end), start, end, ...(message ? { message } : {}) });
	};

	/**
	 * The body of a long bracket from `from`, which is just past its opener.
	 * Returns the offset past the closer, or -1 if it never closes.
	 */
	const closeLong = (from: number, level: number): number => {
		const closer = "]" + "=".repeat(level) + "]";
		const at = src.indexOf(closer, from);
		return at < 0 ? -1 : at + closer.length;
	};

	/**
	 * A quoted string's body from just past its quote. Returns the offset past
	 * the closing quote, or an error and where the string stopped.
	 */
	const closeQuoted = (from: number, quote: string): { end: number; error?: string } => {
		let j = from;
		while (j < src.length) {
			const c = src[j];
			if (c === quote) return { end: j + 1 };
			if (c === "\n" || c === "\r") return { end: j, error: "This string is not closed before the end of the line." };
			if (c === "\\") {
				const next = src[j + 1];
				if (next === "z") {
					// Skips the escape and every whitespace character after it.
					j += 2;
					while (j < src.length && isSpace(src[j])) j++;
					continue;
				}
				// A backslash before a line break continues the string onto the
				// next line; `\r\n` is one break.
				if (next === "\r" && src[j + 2] === "\n") {
					j += 3;
					continue;
				}
				j += 2;
				continue;
			}
			j++;
		}
		return { end: src.length, error: "This string is not closed before the end of the code." };
	};

	/**
	 * An interpolated string's text from `from` up to a hole or the closing
	 * backtick. `opened` says whether it stopped at a `{`.
	 */
	const scanInterp = (from: number): { end: number; opened: boolean; error?: string } => {
		let j = from;
		while (j < src.length) {
			const c = src[j];
			if (c === "`") return { end: j + 1, opened: false };
			if (c === "{") return { end: j + 1, opened: true };
			if (c === "\n" || c === "\r") {
				return { end: j, opened: false, error: "This string is not closed before the end of the line." };
			}
			if (c === "\\") {
				j += src[j + 1] === "\r" && src[j + 2] === "\n" ? 3 : 2;
				continue;
			}
			j++;
		}
		return { end: src.length, opened: false, error: "This string is not closed before the end of the code." };
	};

	while (i < src.length) {
		const c = src[i];
		const start = i;

		if (isSpace(c)) {
			while (i < src.length && isSpace(src[i])) i++;
			push("whitespace", start, i);
			continue;
		}

		// Comments: `--` to the end of the line, or `--[==[ … ]==]`.
		if (c === "-" && src[i + 1] === "-") {
			const level = longBracketLevel(src, i + 2);
			if (level >= 0) {
				const end = closeLong(i + 2 + level + 2, level);
				if (end < 0) {
					push("error", start, src.length, "This comment is not closed before the end of the code.");
					i = src.length;
				} else {
					push("comment", start, end);
					i = end;
				}
				continue;
			}
			while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
			push("comment", start, i);
			continue;
		}

		if (isNameStart(c)) {
			while (i < src.length && isNameChar(src[i])) i++;
			push(KEYWORDS.has(src.slice(start, i)) ? "keyword" : "name", start, i);
			continue;
		}

		// Numbers: decimal with `_` separators, a fraction and an exponent;
		// `0x` hex and `0b` binary. `.5` starts with a dot.
		if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
			if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
				i += 2;
				while (i < src.length && (isHex(src[i]) || src[i] === "_")) i++;
			} else if (c === "0" && (src[i + 1] === "b" || src[i + 1] === "B")) {
				i += 2;
				while (i < src.length && (src[i] === "0" || src[i] === "1" || src[i] === "_")) i++;
			} else {
				while (i < src.length && (isDigit(src[i]) || src[i] === "_")) i++;
				if (src[i] === "." && src[i + 1] !== ".") {
					i++;
					while (i < src.length && (isDigit(src[i]) || src[i] === "_")) i++;
				}
				if (src[i] === "e" || src[i] === "E") {
					let j = i + 1;
					if (src[j] === "+" || src[j] === "-") j++;
					if (isDigit(src[j] ?? "")) {
						i = j;
						while (i < src.length && (isDigit(src[i]) || src[i] === "_")) i++;
					}
				}
			}
			// `1abc` is not a number followed by a name; it is a mistake.
			if (i < src.length && isNameChar(src[i])) {
				while (i < src.length && isNameChar(src[i])) i++;
				push("error", start, i, "This is not a number Luau can read.");
				continue;
			}
			push("number", start, i);
			continue;
		}

		if (c === "\"" || c === "'") {
			const { end, error } = closeQuoted(i + 1, c);
			push(error ? "error" : "string", start, end, error);
			i = end;
			continue;
		}

		if (c === "[") {
			const level = longBracketLevel(src, i);
			if (level >= 0) {
				const end = closeLong(i + level + 2, level);
				if (end < 0) {
					push("error", start, src.length, "This string is not closed before the end of the code.");
					i = src.length;
				} else {
					push("string", start, end);
					i = end;
				}
				continue;
			}
		}

		if (c === "`") {
			const { end, opened, error } = scanInterp(i + 1);
			if (error) push("error", start, end, error);
			else push(opened ? "interpBegin" : "interpSimple", start, end);
			if (opened) holes.push(0);
			i = end;
			continue;
		}

		// Braces inside an interpolation hole: a `{` is a table and nests; the
		// `}` that closes the hole resumes the string.
		if (holes.length > 0) {
			if (c === "{") {
				holes[holes.length - 1]++;
			} else if (c === "}") {
				if (holes[holes.length - 1] === 0) {
					holes.pop();
					const { end, opened, error } = scanInterp(i + 1);
					if (error) push("error", start, end, error);
					else push(opened ? "interpMid" : "interpEnd", start, end);
					if (opened) holes.push(0);
					i = end;
					continue;
				}
				holes[holes.length - 1]--;
			}
		}

		const symbol = SYMBOLS.find((s) => src.startsWith(s, i));
		if (symbol) {
			i += symbol.length;
			push("symbol", start, i);
			continue;
		}

		i++;
		push("error", start, i, `"${c}" is not part of Luau.`);
	}

	tokens.push({ kind: "eof", text: "", start: src.length, end: src.length });
	return tokens;
}

/** The tokens a parser reads: everything but whitespace and comments. */
export function significant(tokens: readonly Token[]): Token[] {
	return tokens.filter((t) => t.kind !== "whitespace" && t.kind !== "comment");
}

/**
 * Turns offsets into 1-based lines and columns, for messages. Built once per
 * source and asked many times.
 */
export function lineIndex(src: string): (offset: number) => { line: number; column: number } {
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === "\n") starts.push(i + 1);
	}
	return (offset) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo + 1, column: offset - starts[lo] + 1 };
	};
}
