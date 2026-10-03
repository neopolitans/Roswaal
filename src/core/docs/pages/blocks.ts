/**
 * Helpers that build blocks for more than one page.
 */

import type { Registry } from "../../nodes/index.js";
import { previewOf } from "../preview.js";
import type { Block } from "../site.js";

/**
 * A line break, for the code samples written out in this file.
 *
 * As a code unit rather than an escape, the way `PageEditor.tsx` does it: these
 * pages are edited by tools as often as by hand, and an escape sequence is one
 * more thing that has to survive every one of them intact.
 */
export const NEWLINE = String.fromCharCode(10);

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
