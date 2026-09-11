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
 *
 * ## Types
 *
 * A type annotation is the one place a name means something else: `Model` after
 * `x:` is a type, where the same word elsewhere would be a variable. So the mode
 * keeps track of where a type starts — after `x: `, `::`, `->`, and `type X =` —
 * and where it ends: a comma, `=` or closing bracket at its own depth, or the
 * end of the line. Before this only the handful of type names that are also
 * globals were coloured, and every other annotation read as ordinary names.
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

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What a type can end a line on and still carry on to the next. */
const CONTINUES = new Set(["=", "|", "&", "->", ":", "::", "{", "(", "[", "<"]);

interface LuauState {
	/** Nesting depth of a long string or comment, or -1 when in neither. */
	longLevel: number;
	inLongComment: boolean;
	/** The quote character of an unterminated interpolated string, if any. */
	inInterpolation: boolean;
	/** Bracket depth inside a type, or -1 outside one. */
	typeDepth: number;
	/** `type` was just read as a declaration, so the next name is the type's. */
	declaring: boolean;
	/** The declared name was read, so the next `=` starts the definition. */
	aliasPending: boolean;
	/** The last token that was not whitespace, for telling `x: T` from `obj:Method()`. */
	last: string;
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
	const style = readLuau(stream, state);
	const text = stream.current();
	if (style !== null && text.trim() !== "") state.last = text;
	// A type on one line ends with it, unless the line stops inside brackets or
	// on something that has to be continued.
	if (state.typeDepth === 0 && stream.eol() && !CONTINUES.has(state.last)) state.typeDepth = -1;
	return style;
}

function readLuau(stream: StringStream, state: LuauState): string | null {
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
			return readLuau(stream, state);
		}
		stream.skipToEnd();
		return "comment";
	}

	// Long strings.
	const long = matchLongBracket(stream);
	if (long !== null) {
		state.longLevel = long;
		state.inLongComment = false;
		return readLuau(stream, state);
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
		if (state.typeDepth >= 0) return typeWord(stream, state, word);

		// `type` and `export` are contextual. Followed by a name they begin a
		// declaration; otherwise `type` is the global function and `export` a
		// name like any other.
		if (word === "type" || word === "export") {
			if (stream.match(/^\s+[A-Za-z_]/, false)) {
				if (word === "type") state.declaring = true;
				return "keyword";
			}
			return word === "type" ? "variableName.standard" : "variableName";
		}
		if (state.declaring) {
			state.declaring = false;
			state.aliasPending = true;
			return "typeName";
		}
		if (KEYWORDS.has(word)) return "keyword";
		if (GLOBALS.has(word)) return "variableName.standard";
		// A name immediately followed by "(" is being called.
		if (stream.peek() === "(" || stream.peek() === "{" || stream.peek() === '"') {
			return "variableName.function";
		}
		return "variableName";
	}

	// The three that open a type.
	if (stream.match("::")) {
		state.typeDepth = 0;
		return "operator";
	}
	if (stream.match("->")) {
		if (state.typeDepth < 0) state.typeDepth = 0;
		return "operator";
	}
	if (state.aliasPending && ch === "=" && stream.string[stream.pos + 1] !== "=") {
		stream.next();
		state.aliasPending = false;
		state.typeDepth = 0;
		return "operator";
	}

	if (state.typeDepth >= 0) {
		const typed = typePunctuation(stream, state);
		if (typed !== undefined) return typed;
	}

	// Compound assignment and the two-character operators Luau adds.
	if (stream.match(/^(\.\.\.|\.\.=|\/\/=|[+\-*/%^]=|\.\.|==|~=|<=|>=|\/\/)/)) {
		return "operator";
	}
	if (stream.match(/^[+\-*/%^#<>=&|~?]/)) return "operator";
	if (stream.match(/^[[\](){}]/)) return "bracket";

	// `x: T` is an annotation and `obj:Method()` is a call. The space after the
	// colon is what tells them apart in code anyone actually writes.
	if (ch === ":") {
		stream.next();
		const after = stream.peek();
		const annotates = NAME.test(state.last) || state.last === ")" || state.last === "...";
		if (state.typeDepth < 0 && annotates && after !== undefined && /\s/.test(after)) {
			state.typeDepth = 0;
		}
		return "punctuation";
	}
	if (stream.match(/^[.,;]/)) return "punctuation";

	stream.next();
	return null;
}

/** A name inside a type. */
function typeWord(stream: StringStream, state: LuauState, word: string): string {
	if (word === "typeof" || word === "nil" || word === "true" || word === "false") return "keyword";
	// A field of a table type — `{ weld: WeldConstraint? }` — names the field.
	if (state.typeDepth > 0 && stream.match(/^\s*:(?!:)/, false)) return "propertyName";
	// A keyword at the type's own level means it ended with nothing to say so:
	// `function f(): number end`.
	if (state.typeDepth === 0 && KEYWORDS.has(word)) {
		state.typeDepth = -1;
		return "keyword";
	}
	return "typeName";
}

/**
 * Brackets and separators inside a type, or `undefined` for anything the
 * ordinary rules should take — including whatever ends the type.
 */
function typePunctuation(stream: StringStream, state: LuauState): string | undefined {
	const ch = stream.peek();
	if (ch === "{" || ch === "(" || ch === "[" || ch === "<") {
		stream.next();
		state.typeDepth++;
		return "bracket";
	}
	if (ch === "}" || ch === ")" || ch === "]" || ch === ">") {
		// Closes something the type sits inside — a parameter list.
		if (state.typeDepth === 0) {
			state.typeDepth = -1;
			return undefined;
		}
		stream.next();
		state.typeDepth--;
		return "bracket";
	}
	// The next parameter, or the value after `local x: T =`.
	if ((ch === "," || ch === "=" || ch === ";") && state.typeDepth === 0) {
		state.typeDepth = -1;
		return undefined;
	}
	if (ch === "|" || ch === "&" || ch === "?") {
		stream.next();
		return "operator";
	}
	if (ch === ":") {
		stream.next();
		return "punctuation";
	}
	return undefined;
}

export const luauParser: StreamParser<LuauState> = {
	name: "luau",

	startState(): LuauState {
		return {
			longLevel: -1, inLongComment: false, inInterpolation: false,
			typeDepth: -1, declaring: false, aliasPending: false, last: "",
		};
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
