/**
 * The code editor's hover: what the name under the pointer is, in one line,
 * with a sentence on it and a link to its Roblox docs page.
 *
 * What to say is worked out in core (`hoverAt`); this only draws it.
 */

import { hoverTooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { hoverAt } from "../core/luau/hover.js";
import type { DocComment } from "../core/luau/docComment.js";
import { highlightLuau } from "./highlight.js";
import type { Target } from "../core/schema.js";
import type { TableMember } from "../core/luau/infer.js";

export function luauHover(
	getTarget: () => Target,
	getMembers: () => ReadonlyMap<string, TableMember[]> = () => new Map(),
): Extension {
	return hoverTooltip((view, pos) => {
		const hover = hoverAt(view.state.doc.toString(), pos, getTarget() !== "lune", getMembers());
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
				if (hover.doc) dom.append(renderDoc(hover.doc));
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

/** Luau as the editor colours it, one span per token. */
function highlighted(source: string, into: HTMLElement): void {
	highlightLuau(source).forEach((line, i) => {
		if (i > 0) into.append("\n");
		for (const token of line) {
			if (token.cls === "") {
				into.append(token.text);
				continue;
			}
			const span = document.createElement("span");
			span.className = token.cls;
			span.textContent = token.text;
			into.append(span);
		}
	});
}

/**
 * A line of doc prose: `code`, **bold**, and links. A link to a web page
 * opens; one relative to a Moonwave site has nowhere to go, so it is its words.
 */
function inline(text: string, into: HTMLElement): void {
	const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		into.append(text.slice(last, match.index));
		last = match.index! + match[0].length;
		if (match[1] !== undefined) {
			const code = document.createElement("code");
			code.textContent = match[1];
			into.append(code);
		} else if (match[2] !== undefined) {
			const strong = document.createElement("strong");
			strong.textContent = match[2];
			into.append(strong);
		} else if (/^https?:\/\//.test(match[4])) {
			const link = document.createElement("a");
			link.href = match[4];
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.textContent = match[3];
			into.append(link);
		} else {
			into.append(match[3]);
		}
	}
	into.append(text.slice(last));
}

/** A doc comment: its prose and examples, then what it takes and gives. */
function renderDoc(doc: DocComment): HTMLElement {
	const box = document.createElement("div");
	box.className = "luau-hover-doc";
	if (doc.deprecated !== undefined) {
		const note = document.createElement("p");
		note.className = "luau-hover-deprecated";
		note.textContent = doc.deprecated ? `Deprecated: ${doc.deprecated}` : "Deprecated";
		box.append(note);
	}

	// Paragraphs split on blank lines; a fenced block is kept whole.
	const lines = doc.text.split("\n");
	for (let i = 0; i < lines.length; ) {
		const fence = /^\s*```\s*(\w*)/.exec(lines[i]);
		if (fence) {
			const body: string[] = [];
			for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
			i++;
			const pre = document.createElement("pre");
			const code = document.createElement("code");
			const source = body.join("\n").replace(/\t/g, "  ");
			if (!fence[1] || /^(lua|luau)$/i.test(fence[1])) highlighted(source, code);
			else code.textContent = source;
			pre.append(code);
			box.append(pre);
			continue;
		}
		// Moonwave's notes: `:::caution` to `:::`, drawn as a paragraph with
		// its kind in front.
		const admonition = /^\s*:::\s*(\w+)/.exec(lines[i]);
		if (admonition) {
			const body: string[] = [];
			for (i++; i < lines.length && !/^\s*:::\s*$/.test(lines[i]); i++) body.push(lines[i].trim());
			i++;
			const note = document.createElement("p");
			note.className = "luau-hover-note";
			const kind = document.createElement("strong");
			kind.textContent = `${admonition[1][0].toUpperCase()}${admonition[1].slice(1)}: `;
			note.append(kind);
			inline(body.filter(Boolean).join(" "), note);
			box.append(note);
			continue;
		}
		const para: string[] = [];
		for (; i < lines.length && lines[i].trim() !== "" && !/^\s*(```|:::)/.test(lines[i]); i++) para.push(lines[i].trim());
		if (para.length) {
			const p = document.createElement("p");
			inline(para.join(" "), p);
			box.append(p);
		}
		while (i < lines.length && lines[i].trim() === "") i++;
	}

	const rows: [string, { name?: string; type?: string; description?: string }[]][] = [
		["Parameters", doc.params],
		["Returns", doc.returns],
		["Errors", doc.errors],
	];
	for (const [title, items] of rows) {
		if (!items.length) continue;
		const list = document.createElement("dl");
		list.className = "luau-hover-tags";
		const head = document.createElement("dt");
		head.textContent = title;
		list.append(head);
		for (const item of items) {
			const row = document.createElement("dd");
			const code = document.createElement("code");
			highlighted(item.name ? `${item.name}${item.type ? `: ${item.type}` : ""}` : item.type ?? "", code);
			row.append(code);
			if (item.description) {
				row.append(" \u2014 ");
				inline(item.description, row);
			}
			list.append(row);
		}
		box.append(list);
	}
	if (doc.yields) {
		const note = document.createElement("p");
		note.className = "luau-hover-yields";
		note.textContent = "Yields";
		box.append(note);
	}
	return box;
}
