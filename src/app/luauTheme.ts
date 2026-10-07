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

import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const luauHighlight = HighlightStyle.define([
	{ tag: tags.keyword, color: "var(--code-keyword)" },
	{ tag: tags.string, color: "var(--code-string)" },
	{ tag: tags.number, color: "var(--code-number)" },
	{ tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
	// A doc tag in a comment, `@param` or `@prop`, set apart as the hover sets it.
	{ tag: tags.meta, color: "var(--code-type)", fontStyle: "italic" },
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

/**
 * How the editors' tooltips look: hover, signature, lint, completion.
 *
 * In the editors' theme rather than in theme.css, because a tooltip is not
 * inside the editor it belongs to: `luauExtensions` renders them into the
 * page's body, so a hover near the top of the code editor is not cut off by
 * the edge of its box. A theme's rules follow them there; a stylesheet rule
 * scoped to the editor's box would not.
 *
 * Exported as well, for the front page tour's drawing of the completion list,
 * which is plain HTML and takes these as CSS (`themeCss`).
 */
export const TOOLTIP_STYLE: Record<string, Record<string, string>> = {
	".cm-tooltip": {
		background: "var(--bg-panel)",
		border: "1px solid var(--border-strong)",
		borderRadius: "var(--radius-sm)",
		boxShadow: "var(--shadow-popover)",
		color: "var(--fg)",
	},
	".cm-diagnostic": {
		borderLeftColor: "var(--danger)",
		background: "var(--bg-panel)",
		color: "var(--fg)",
		fontFamily: "inherit",
	},

	// Completion, as the front page tour draws it: a list hung from the line
	// being typed on, its edge the accent the word being completed is
	// underlined in (`.cm-completing`, in theme.css), so the two read as one
	// field and its answers.
	".cm-tooltip.cm-tooltip-autocomplete": {
		borderTop: "2px solid var(--accent)",
		borderRadius: "0 0 8px 8px",
	},
	// Near the bottom of the window the list opens upwards, and hangs the other way.
	".cm-tooltip.cm-tooltip-autocomplete.cm-tooltip-above": {
		borderTop: "1px solid var(--border-strong)",
		borderBottom: "2px solid var(--accent)",
		borderRadius: "8px 8px 0 0",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul": {
		padding: "4px 0",
		borderRadius: "inherit",
		fontFamily: '"Cascadia Mono", Consolas, monospace',
		fontSize: "var(--text-sm)",
		// Ten rows, then it scrolls.
		maxHeight: "calc(10 * (1.6em + 6px) + 8px)",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
		padding: "3px 10px",
		lineHeight: "1.6",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
		background: "var(--accent)",
		color: "#fff",
	},
	// What matched what was typed: in the accent, not underlined, so a row
	// reads as the name it offers.
	".cm-completionMatchedText": {
		textDecoration: "none",
		fontWeight: "600",
		color: "var(--accent)",
	},
	"li[aria-selected] .cm-completionMatchedText": { color: "inherit" },
	".cm-completionDetail": {
		marginLeft: "10px",
		fontStyle: "normal",
		opacity: "0.7",
		fontSize: "var(--text-xs)",
	},
};

/**
 * Theme rules as a stylesheet under `scope`: what the tour draws with, from the
 * same rules the editors use.
 */
export function themeCss(scope: string, spec: Record<string, Record<string, string>>): string {
	const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
	return Object.entries(spec)
		.map(
			([selector, rules]) =>
				`${scope} ${selector} { ${Object.entries(rules)
					.map(([name, value]) => `${kebab(name)}: ${value};`)
					.join(" ")} }`,
		)
		.join("\n");
}

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

	...TOOLTIP_STYLE,
});
