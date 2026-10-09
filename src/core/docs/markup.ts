/**
 * Inline markup, and the strings a block holds.
 *
 * Inline markup is deliberately tiny — `code`, **bold**, *italic*, [links] —
 * because a documentation page that needs more than that is usually a page
 * that should be split. Every renderer parses it here rather than running its
 * own regexes, so they cannot disagree about what a line says.
 */

import { CARRIED_LICENCES } from "../licenceData.js";
import { byHolder, holderStatement, licenceShown, USAGES } from "./attributions.js";
import { listedRegions } from "./layouts.js";
import { mapFigure } from "./mapFigure.js";
import { TAG_LABELS } from "./releaseTags.js";
import type { Block } from "./site.js";
import { legendOf } from "./toolbars.js";

export type Inline =
	| { t: "text"; text: string }
	| { t: "code"; text: string }
	| { t: "strong"; text: string }
	| { t: "em"; text: string }
	| { t: "link"; text: string; href: string };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;

/**
 * Splits a string into inline runs. Deliberately non-recursive: no bold inside
 * a link, no code inside bold. Every renderer gets the same answer because they
 * all call this rather than each running their own regexes.
 */
export function parseInline(text: string): Inline[] {
	const out: Inline[] = [];
	let last = 0;

	for (const match of text.matchAll(INLINE)) {
		const at = match.index;
		if (at > last) out.push({ t: "text", text: text.slice(last, at) });
		const token = match[0];

		if (token.startsWith("`")) {
			out.push({ t: "code", text: token.slice(1, -1) });
		} else if (token.startsWith("**")) {
			out.push({ t: "strong", text: token.slice(2, -2) });
		} else if (token.startsWith("*")) {
			out.push({ t: "em", text: token.slice(1, -1) });
		} else {
			const split = token.indexOf("](");
			out.push({
				t: "link",
				text: token.slice(1, split),
				href: token.slice(split + 2, -1),
			});
		}
		last = at + token.length;
	}

	if (last < text.length) out.push({ t: "text", text: text.slice(last) });
	return out;
}

/**
 * True when a link points at another page of these docs rather than off-site:
 * a bare slug, like `types` or `node/math.add`. A slug is not a URL in any of
 * the three renderers, so each turns one into its own kind of navigation.
 */
export function isPageLink(href: string): boolean {
	return !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#") && !href.startsWith("/");
}

/**
 * How a renderer treats one string of a block.
 *
 * - `inline` goes through `parseInline`, so it may carry markup.
 * - `plain` is escaped and printed as it is: markup in it reaches the reader
 *   as backticks and asterisks.
 * - `code` is source, printed or highlighted verbatim.
 * - `key` is never printed. It is there for search: the node ids in a graph,
 *   which are what somebody looking for a node in a guide will type.
 */
export type StringSlot = "inline" | "plain" | "code" | "key";

export interface BlockString {
	text: string;
	slot: StringSlot;
	/** False for a string the search index leaves out. */
	indexed: boolean;
}

/**
 * Every string a block holds, nested blocks included, in reading order.
 *
 * One walker for every consumer — the search index and the markup tests — so
 * a new string slot is added in one place and both see it. A slot left out
 * here is a slot whose markup nobody checks.
 */
export function blockStrings(block: Block): BlockString[] {
	const out: BlockString[] = [];
	const add = (slot: StringSlot, text: string | undefined, indexed = true): void => {
		if (text !== undefined && text !== "") out.push({ text, slot, indexed });
	};
	switch (block.t) {
		case "h":
			add("inline", block.text);
			add("plain", block.badge);
			add("plain", block.aside);
			break;
		case "p":
			add("inline", block.text);
			break;
		case "ul":
		case "ol":
			for (const item of block.items) add("inline", item);
			break;
		case "code":
			add("code", block.text);
			break;
		case "table":
			for (const cell of block.head ?? []) add("plain", cell);
			for (const cell of block.rows.flat()) add("inline", cell);
			break;
		case "tags":
			for (const tag of block.tags) add("plain", TAG_LABELS[tag]);
			break;
		case "note":
			add("plain", block.label);
			add("inline", block.text);
			for (const item of block.items ?? []) add("inline", item);
			break;
		case "req":
			add("plain", block.id);
			add("inline", block.text);
			add("inline", block.gap);
			break;
		case "compare":
			for (const item of block.items) {
				add("plain", item.label);
				add("inline", item.text);
			}
			break;
		case "pins":
			// The name and the type are what a search is for; the rest of a pin
			// is said again on the page it links to.
			add("plain", block.title, false);
			for (const pin of block.pins) {
				add("plain", pin.name);
				add("plain", pin.type);
				add("inline", pin.description, false);
				add("code", pin.default, false);
			}
			break;
		case "preview":
			for (const node of block.nodes) add("plain", node.title);
			add("plain", block.label);
			add("inline", block.caption);
			break;
		case "graph":
			for (const node of block.script.nodes) add("key", node.def);
			add("inline", block.caption);
			break;
		case "graphs":
			// Every graph's, including the ones not showing: a search finds the
			// page, and the page has them all in it.
			add("inline", block.label);
			for (const one of block.graphs) {
				add("plain", one.title);
				add("inline", one.caption);
				for (const node of one.script.nodes) add("key", node.def);
			}
			break;
		case "nodemap":
			// The names in the tree, which is what somebody looks for: they are
			// the services and folders a reader recognises from their own project.
			// The generated JSON is not indexed -- searching the documentation for
			// `$className` should find the page that explains it, not every page
			// that happens to draw a map.
			for (const row of mapFigure(block.map).rows) add("plain", row.name);
			add("inline", block.caption);
			break;
		case "releaseMinor": {
			const m = block.minor;
			add("plain", `${m.minor}.x`);
			add("inline", m.headline);
			for (const tag of m.tags) add("plain", TAG_LABELS[tag]);
			for (const r of m.releases) {
				add("plain", r.version);
				add("inline", r.headline);
			}
			for (const item of m.watch) add("inline", item.text);
			for (const section of m.sections)
				for (const entry of section.entries) add("inline", entry.text);
			for (const group of m.articles) for (const link of group.links) add("inline", link.text);
			break;
		}
		case "releaseRows":
			for (const row of block.rows) {
				add("plain", row.newest);
				add("inline", row.headline);
			}
			break;
		case "releaseVersions":
		case "releasePager":
			// Ways to other pages, which say nothing of their own.
			break;
		case "attributions":
			for (const usage of USAGES) {
				add("plain", usage.label);
				add("plain", usage.means);
				add("plain", usage.promise);
			}
			for (const { holder, entries } of byHolder()) {
				add("plain", holder);
				add("inline", holderStatement(holder));
				for (const entry of entries) {
					add("plain", entry.name);
					add("plain", licenceShown(entry));
					add("inline", entry.note);
					add("inline", entry.where);
				}
			}
			break;
		case "licences":
			for (const licence of CARRIED_LICENCES) {
				for (const text of [licence.name, licence.spdx, licence.holder, licence.covers]) {
					add("plain", text);
				}
			}
			add("plain", "THIRD-PARTY-NOTICES.txt");
			break;
		case "details":
			add("inline", block.summary);
			add("inline", block.sub);
			add("plain", block.aside);
			for (const inner of block.blocks) out.push(...blockStrings(inner));
			break;
		case "tabs":
			add("inline", block.label);
			for (const tab of block.tabs) {
				add("plain", tab.title);
				for (const inner of tab.blocks) out.push(...blockStrings(inner));
			}
			break;
		case "walkthrough":
			for (const step of block.steps) add("inline", step.text);
			break;
		case "layout":
			add("plain", block.layout.title);
			add("inline", block.layout.summary);
			for (const region of listedRegions(block.layout)) {
				add("plain", region.name);
				add("plain", region.where);
				add("inline", region.what);
			}
			add("inline", block.caption);
			break;
		case "toolbar":
			// The legend, not the drawing. Somebody who cannot find Node Design
			// searches for "Node Design", and the control's name is the only place
			// on the page those two words sit together.
			add("plain", block.bar.title);
			add("inline", block.bar.summary);
			for (const item of legendOf(block.bar)) {
				add("plain", item.name);
				add("plain", item.where);
				add("inline", item.what);
			}
			add("inline", block.caption);
			break;
	}
	return out;
}

/** A line of inline markup as the words a reader sees. */
export function stripMarkup(text: string): string {
	return parseInline(text)
		.map((run) => run.text)
		.join("");
}

/** The words in a block, with markup removed. Feeds the search index. */
export function blockText(block: Block): string {
	return blockStrings(block)
		.filter((one) => one.indexed)
		.map((one) => (one.slot === "inline" ? stripMarkup(one.text) : one.text))
		.join(" ");
}
