/**
 * A drawn graph's Custom Code, ready to open.
 *
 * In the editor a Custom Code node opens its Luau in the code editor, and the
 * guides teach it that way; a node in a picture can only show the first line.
 * So each one's Luau goes into the page beside the graph, highlighted and
 * numbered at build time, and the graph's script (`graphView.ts`) opens it,
 * read-only, when the node is clicked. A `<template>`, so it is inert and
 * unseen until then.
 */

import type { NodeScript } from "../schema.js";

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** What a new Custom Code node holds, for one whose Code was never typed into. */
const UNTYPED = "-- your Luau here";

/**
 * `highlight` turns Luau into HTML, one line per `\n`, as the docs' own does;
 * absent, the code is escaped and left plain.
 */
export function nodeCodeHtml(script: NodeScript, highlight?: (code: string) => string): string {
	return script.nodes
		.filter((node) => node.def === "code.custom")
		.map((node) => {
			const literal = node.literals?.code;
			const code = literal && (literal.t === "raw" || literal.t === "string") ? literal.v : UNTYPED;
			const lines = (highlight ? highlight(code) : escapeHtml(code)).split("\n");
			// The numbers and the code as two columns, each one element, so the
			// gutter is one strip from top to bottom as the editor's is. The
			// rows line up because neither column wraps.
			const numbers = lines.map((_, i) => i + 1).join("\n");
			const title = node.label || "Custom Code";
			return `<template data-code-for="${escapeHtml(node.id)}" data-title="${escapeHtml(title)}">` +
				`<div class="code-view"><pre class="code-view-gutter" aria-hidden="true">${numbers}</pre>` +
				`<pre class="code-view-code"><code>${lines.join("\n")}</code></pre></div></template>`;
		})
		.join("");
}
