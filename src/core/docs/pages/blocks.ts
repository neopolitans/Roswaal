/**
 * Helpers that build blocks for more than one page.
 */

import type { Registry } from "../../nodes/index.js";
import { previewOf } from "../preview.js";
import type { Block } from "../site.js";

/**
 * A code sample, written out as it reads.
 *
 * The backticks open and close on lines of their own, and the closing one
 * sets the margin: that much indentation is taken off every line, so the
 * sample can sit at the page's indentation and still come out flush. A blank
 * line may be left empty. Inside, `\`` and `\\` and `\${` are escaped as in
 * any template.
 *
 *     text: code`
 *         local x = 1
 *         print(x)
 *         `,
 */
export function code(strings: TemplateStringsArray, ...values: unknown[]): string {
	let text = strings[0];
	values.forEach((value, i) => {
		text += String(value) + strings[i + 1];
	});
	const lines = text.split("\n");
	const margin = lines.pop() ?? "";
	if (lines.shift() !== "" || /\S/.test(margin)) {
		throw new Error("A code sample's backticks open and close on lines of their own.");
	}
	return lines
		.map((line) => {
			if (line.startsWith(margin)) return line.slice(margin.length);
			if (line === "") return line;
			throw new Error(`A code sample's line sits left of its closing backtick: ${line}`);
		})
		.join("\n");
}

/**
 * A preview block for named nodes, in the order they are named.
 *
 * A node that is not in this registry is skipped rather than drawn as a gap: a
 * guide is written against the built-in library, and a project that has trimmed
 * it should lose the picture, not the page.
 */
export function previews(registry: Registry, ids: string[], caption?: string): Block[] {
	const nodes = ids
		.map((id) => registry.get(id))
		.filter((def): def is NonNullable<typeof def> => def !== undefined)
		// Wrapped, not point-free: `previewOf` takes a config second and `map`
		// would hand it the index.
		.map((def) => previewOf(def));
	return nodes.length > 0 ? [{ t: "preview", nodes, caption }] : [];
}
