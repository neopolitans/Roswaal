/**
 * The look of a Luau editor, in one place.
 *
 * Two things show Luau in a CodeMirror view — the pop-out editor for a code pin
 * and the read-only viewer for a `.luau` file in the project — and the same
 * language should not be two different colours one panel apart. Both import
 * from here.
 *
 * Colours are CSS variables rather than a palette of their own, so the editor
 * follows the app's theme instead of shipping its own light and dark sets.
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const luauHighlight = HighlightStyle.define([
	{ tag: tags.keyword, color: "var(--code-keyword)" },
	{ tag: tags.string, color: "var(--code-string)" },
	{ tag: tags.number, color: "var(--code-number)" },
	{ tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
	{ tag: tags.operator, color: "var(--code-operator)" },
	{ tag: tags.variableName, color: "var(--fg)" },
	{ tag: tags.propertyName, color: "var(--code-property)" },
	{ tag: tags.bool, color: "var(--code-keyword)" },
	// Luau's own globals read as part of the language rather than as names the
	// author chose, so they are tinted apart from ordinary variables.
	{ tag: tags.standard(tags.variableName), color: "var(--code-global)" },
	{ tag: tags.function(tags.variableName), color: "var(--code-function)" },
	// A name in a type annotation, which is a different thing from the same
	// name as a value: `Model` after `x:` is a type, `Instance` in
	// `Instance.new` is the global.
	{ tag: tags.typeName, color: "var(--code-type)" },
	{ tag: tags.bracket, color: "var(--fg-muted)" },
	{ tag: tags.punctuation, color: "var(--fg-muted)" },
]);

export const editorTheme = EditorView.theme({
	"&": { fontSize: "12px", height: "100%", backgroundColor: "var(--bg-canvas)" },
	".cm-content": {
		fontFamily: '"Cascadia Mono", Consolas, monospace',
		padding: "10px 0",
		// See the cursor rule below.
		caretColor: "var(--fg) !important",
	},
	".cm-gutters": {
		backgroundColor: "var(--bg-panel)",
		color: "var(--fg-faint)",
		border: "none",
		borderRight: "1px solid var(--border)",
	},
	".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
	"&.cm-focused": { outline: "none" },
	// The text cursor — the native caret above, the drawn one here — in the
	// theme's own text colour: light on a dark theme, dark on a light one.
	// CodeMirror colours the native caret black unless told its theme is dark,
	// and Roswaal's themes are CSS variables it cannot read, so it was black on
	// every dark theme. Its rule is scoped tighter than this one, hence
	// `!important`.
	".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg) !important" },
	".cm-selectionBackground, ::selection": { backgroundColor: "var(--bg-active)" },
});
