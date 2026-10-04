/**
 * A table cell of type names, drawn as the type field draws its value: the
 * type's wire colour, then its name in the code face.
 *
 * Each backticked name in the cell becomes one; the text between them, the
 * commas, stays as it is. Both renderers call this, so the docs window and
 * the published site draw the same chip.
 */

import { escapeXml } from "./preview.js";

export function typeCellHtml(
	cell: string,
	colorOf?: (type: string, kind: "data") => string,
): string {
	return cell
		.split("`")
		.map((part, i) => {
			if (i % 2 === 0) return escapeXml(part);
			const dot = colorOf
				? `<span class="type-dot" style="background:${escapeXml(colorOf(part, "data"))}"></span>`
				: "";
			return `<span class="type-chip">${dot}<code>${escapeXml(part)}</code></span>`;
		})
		.join("");
}
