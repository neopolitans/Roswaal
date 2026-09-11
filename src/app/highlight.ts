/**
 * Syntax highlighting for code shown outside the editor.
 *
 * The documentation shows the Luau a node compiles to, and plain grey text
 * there is a worse answer than the same code three panels away in the Custom
 * Code editor — the reader is comparing the two, and they should look like the
 * same language.
 *
 * **It drives the editor's own tokeniser**, `luauParser`, rather than a second
 * one written for the docs. A separate highlighter would be a second opinion
 * about what a keyword is, and the two would drift the first time Luau gained
 * a word. The colours are the same CSS variables the editor's `HighlightStyle`
 * uses, for the same reason.
 *
 * This is not a code editor: no CodeMirror instance, no state, no DOM
 * measuring. One pass over the text producing spans, which also means the
 * static site can ship highlighted code with no JavaScript at all.
 */

import { StringStream } from "@codemirror/language";

import { luauParser } from "./luauMode.js";

export interface Token {
	text: string;
	/** CSS class, or empty for text with no colour of its own. */
	cls: string;
}

/**
 * CodeMirror token names to class names.
 *
 * Only the tokens `luauParser` actually returns. Anything else falls through
 * uncoloured rather than being guessed at — an unstyled span is invisible, a
 * wrongly styled one is a lie about the language.
 */
const CLASSES: Record<string, string> = {
	keyword: "tok-keyword",
	string: "tok-string",
	number: "tok-number",
	comment: "tok-comment",
	operator: "tok-operator",
	bracket: "tok-bracket",
	punctuation: "tok-punctuation",
	variableName: "",
	"variableName.standard": "tok-global",
	"variableName.function": "tok-function",
	typeName: "tok-type",
	propertyName: "tok-property",
};

/** One array of tokens per line, so a renderer can keep the line structure. */
export function highlightLuau(source: string): Token[][] {
	// Always defined on this parser; the mode is ours, not a plugin's.
	const state = luauParser.startState!(2);
	const out: Token[][] = [];

	for (const line of source.split("\n")) {
		if (line === "") {
			luauParser.blankLine?.(state, 2);
			out.push([]);
			continue;
		}

		const stream = new StringStream(line, 2, 2, 0);
		const tokens: Token[] = [];

		while (!stream.eol()) {
			stream.start = stream.pos;
			const name = luauParser.token(stream, state);

			// A tokeniser that consumed nothing would spin forever. Taking one
			// character keeps the line moving and shows it uncoloured, which is
			// the honest outcome for something the mode did not recognise.
			if (stream.pos === stream.start) stream.next();

			const text = line.slice(stream.start, stream.pos);
			const cls = name === null ? "" : CLASSES[name] ?? "";

			// Runs of the same colour are merged so the DOM stays small: an
			// indented block is otherwise one span per space.
			const last = tokens[tokens.length - 1];
			if (last && last.cls === cls) last.text += text;
			else tokens.push({ text, cls });
		}

		out.push(tokens);
	}

	return out;
}
