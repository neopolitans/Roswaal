/**
 * The code editor's hover: what the name under the pointer is, in one line,
 * with a sentence on it and a link to its Roblox docs page.
 *
 * What to say is worked out in core (`hoverAt`); this only draws it.
 */

import { hoverTooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { hoverAt } from "../core/luau/hover.js";
import { highlightLuau } from "./highlight.js";
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
				// Highlighted as the editor highlights Luau, one span per token.
				// What a call returns follows an arrow, which is not Luau, so the
				// highlighter would leave it plain: it is drawn as the type it is.
				const code = document.createElement("code");
				const [signature, returned] = hover.code.split(" → ");
				for (const line of highlightLuau(signature)) {
					for (const token of line) {
						if (token.cls === "") {
							code.append(token.text);
						} else {
							const span = document.createElement("span");
							span.className = token.cls;
							span.textContent = token.text;
							code.append(span);
						}
					}
				}
				if (returned !== undefined) {
					const type = document.createElement("span");
					type.className = "tok-type";
					type.textContent = returned;
					code.append(" → ", type);
				}
				// The name and its type, and under it, quieter, what kind of
				// name it is: `event: (name: string) -> (RemoteEvent)` over
				// "local function".
				const head = document.createElement("div");
				head.className = "luau-hover-head";
				head.append(code);
				if (hover.role) {
					const role = document.createElement("span");
					role.className = "luau-hover-role";
					role.textContent = hover.role;
					head.append(role);
				}
				dom.append(head);
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
