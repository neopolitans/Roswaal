/**
 * The code editor's hover: what the name under the pointer is, in one line,
 * with a sentence on it and a link to its Roblox docs page.
 *
 * What to say is worked out in core (`hoverAt`); this only draws it.
 */

import { hoverTooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { hoverAt } from "../core/luau/hover.js";
import type { Target } from "../core/schema.js";

export function luauHover(getTarget: () => Target): Extension {
	return hoverTooltip((view, pos) => {
		const hover = hoverAt(view.state.doc.toString(), pos, getTarget() !== "lune");
		if (!hover) return null;
		return {
			pos: hover.from,
			end: hover.to,
			above: true,
			create: () => {
				const dom = document.createElement("div");
				dom.className = "luau-hover";
				const code = document.createElement("code");
				code.textContent = hover.code;
				dom.append(code);
				if (hover.summary) {
					const summary = document.createElement("p");
					summary.textContent = hover.summary.replace(/`/g, "");
					dom.append(summary);
				}
				if (hover.link) {
					const link = document.createElement("a");
					link.href = hover.link.href;
					link.target = "_blank";
					link.rel = "noopener noreferrer";
					link.textContent = hover.link.label;
					dom.append(link);
				}
				return { dom };
			},
		};
	}, { hoverTime: 350 });
}
