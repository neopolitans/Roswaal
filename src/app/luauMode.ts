/**
 * A CodeMirror stream tokeniser for Luau.
 *
 * CodeMirror ships a Lua mode, but Lua is not Luau: it does not know
 * `continue`, `export type`, compound assignment, integer division, or
 * backtick interpolation, and it highlights `+=` as two separate operators.
 * The differences are exactly the ones a Roblox developer types all day, so
 * the mode is worth the sixty lines.
 *
 * This is highlighting, not parsing. It has no opinion about whether the code
 * is correct — that is the linter's job.
 */

import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";

const KEYWORDS = new Set([
	"and", "break", "do", "else", "elseif", "end", "false", "for", "function",
	"goto", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then",
	"true", "until", "while",
	// Luau's additions. Contextual in the grammar, but colouring them always is
	// closer to right than never.
	"continue", "export", "type",
]);

/** Globals Roblox and Luau put in scope without a require. */
const GLOBALS = new Set([
	"game", "workspace", "script", "shared", "plugin", "_G", "_VERSION", "self",
	"Enum", "Instance", "Vector2", "Vector3", "CFrame", "Color3", "UDim", "UDim2",
	"Ray", "Rect", "Region3", "TweenInfo", "NumberRange", "NumberSequence",
	"ColorSequence", "BrickColor", "Random", "Font", "task", "math", "string",
	"table", "os", "coroutine", "utf8", "bit32", "buffer", "debug", "vector",
	"print", "warn", "error", "assert", "pcall", "xpcall", "select", "type",
	"typeof", "tostring", "tonumber", "pairs", "ipairs", "next", "unpack",
	"setmetatable", "getmetatable", "rawget", "rawset", "rawequal", "rawlen",
	"require", "tick", "time", "delay", "spawn", "wait", "newproxy",
]);

interface LuauState {
	/** Nesting depth of a long string or comment, or -1 when in neither. */
	longLevel: number;
	inLongComment: boolean;
	/** The quote character of an unterminated interpolated string, if any. */
	inInterpolation: boolean;
}

/**
 * One token, or null for whitespace.
 *
 * A free function rather than a method on the parser object, and that is not a
 * style choice. CodeMirror pulls `token` off the parser and calls it bare —
 * `readToken(streamParser.token, stream, state)` — so `this` inside it is
 * `undefined` in a module, and the two places below that resume after opening a
 * long bracket threw every time they were reached. Recursing by name is the
 * whole fix.
 */
function tokenLuau(stream: StringStream, state: LuauState): string | null {
	// Long strings and long comments span lines, so they are resumed here
	// before anything else is considered.
	if (state.longLevel >= 0) {
		const closing = "]" + "=".repeat(state.longLevel) + "]";
		const found = stream.string.indexOf(closing, stream.pos);
		if (found === -1) {
			stream.skipToEnd();
		} else {
			stream.pos = found + closing.length;
			state.longLevel = -1;
		}
		return state.inLongComment ? "comment" : "string";
	}

	if (stream.eatSpace()) return null;

	// Comments, including the long form.
	if (stream.match("--")) {
		const long = matchLongBracket(stream);
		if (long !== null) {
			state.longLevel = long;
			state.inLongComment = true;
			return tokenLuau(stream, state);
		}
		stream.skipToEnd();
		return "comment";
	}

	// Long strings.
	const long = matchLongBracket(stream);
	if (long !== null) {
		state.longLevel = long;
		state.inLongComment = false;
		return tokenLuau(stream, state);
	}

	const ch = stream.peek();

	// Interpolated strings: `hello {name}`. Treated as one string token;
	// colouring the holes differently would need a real parser.
	if (ch === "`") {
		stream.next();
		readUntilQuote(stream, "`");
		return "string";
	}
	if (ch === '"' || ch === "'") {
		stream.next();
		readUntilQuote(stream, ch);
		return "string";
	}

	if (/\d/.test(ch ?? "") || (ch === "." && /\d/.test(stream.string[stream.pos + 1] ?? ""))) {
		// Matched whole rather than eaten character by character. Eating the
		// digit-ish set first swallows the `e` of `1e-9` and then has nothing
		// left to recognise the exponent by, so the `-9` came out as an operator
		// and a second number.
		if (
			// Hex takes a `p` exponent rather than an `e`: `0x1p4` is a number.
			!stream.match(/^0[xX][0-9a-fA-F_]+(?:\.[0-9a-fA-F_]*)?(?:[pP][+-]?\d+)?/) &&
			!stream.match(/^0[bB][01_]+/) &&
			!stream.match(/^(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?/)
		) {
			// Unreachable given the test above, and a stalled tokeniser hangs the
			// tab rather than colouring something oddly.
			stream.next();
		}
		return "number";
	}

	if (/[A-Za-z_]/.test(ch ?? "")) {
		stream.eatWhile(/[A-Za-z0-9_]/);
		const word = stream.current();
		if (KEYWORDS.has(word)) return "keyword";
		if (GLOBALS.has(word)) return "variableName.standard";
		// A name immediately followed by "(" is being called.
		if (stream.peek() === "(" || stream.peek() === "{" || stream.peek() === '"') {
			return "variableName.function";
		}
		return "variableName";
	}

	// Compound assignment and the two-character operators Luau adds.
	if (stream.match(/^(\.\.\.|\.\.=|\/\/=|[+\-*/%^]=|\.\.|==|~=|<=|>=|::|\/\/)/)) {
		return "operator";
	}
	if (stream.match(/^[+\-*/%^#<>=&|~?]/)) return "operator";
	if (stream.match(/^[[\](){}]/)) return "bracket";
	if (stream.match(/^[.,;:]/)) return "punctuation";

stream.next();
return null;
}

export const luauParser: StreamParser<LuauState> = {
	name: "luau",

	startState(): LuauState {
		return { longLevel: -1, inLongComment: false, inInterpolation: false };
	},

	token: tokenLuau,

	languageData: {
		commentTokens: { line: "--", block: { open: "--[[", close: "]]" } },
		indentOnInput: /^\s*(end|else|elseif|until|\})$/,
		closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
	},
};

/**
 * Matches an opening long bracket — `[[`, `[=[`, `[==[` — and returns its
 * level, or null. The level has to be remembered so the matching close is the
 * one with the same number of equals signs.
 */
function matchLongBracket(stream: {
	string: string;
	pos: number;
	match: (pattern: RegExp) => RegExpMatchArray | null | boolean;
}): number | null {
	const matched = stream.match(/^\[(=*)\[/) as RegExpMatchArray | null;
	return matched ? matched[1].length : null;
}

function readUntilQuote(
	stream: { string: string; pos: number; next: () => string | void }, quote: string,
): void {
	while (stream.pos < stream.string.length) {
		const c = stream.string[stream.pos];
		if (c === "\\") {
			stream.pos += 2;
			continue;
		}
		stream.pos += 1;
		if (c === quote) return;
	}
}

export const luauLanguage = StreamLanguage.define(luauParser);
