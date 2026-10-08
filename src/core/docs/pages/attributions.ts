/**
 * The `attributions` page of the documentation. `buildSite` places it.
 */

import {
	type Attribution,
	DEPENDENCIES,
	HOW_IT_IS_MADE,
	INSPIRATIONS,
	NAME_NOTICE,
	NOT_AFFILIATED,
	TARGETS,
	TESTED_WITH,
	TRADEMARKS,
} from "../attributions.js";
import type { Block, DocPage } from "../site.js";

/**
 * Who made what Roswaal is built on, and what it is named after.
 *
 * A page rather than only `ATTRIBUTIONS.md`, because the people who need to read it
 * are not all reading the repository. Written for whoever holds an entry, at a
 * glance: one sentence each, where it is, and the licence of what Roswaal
 * carries -- with every licence Roswaal carries at the end, in full.
 */
export function attributionsPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Roswaal is 0BSD. Everything on this page belongs to someone else: what Roswaal " +
				"uses, how, and under which licence. Every licence Roswaal carries is at the end, " +
				"exactly as it was published.",
		},
		{
			t: "note",
			kind: "info",
			text:
				`**${NOT_AFFILIATED}** Trademarks belong to their owners, and are named only to say ` +
				"what something is.",
		},
		{ t: "h", level: 2, text: NAME_NOTICE.title },
	];

	for (const line of NAME_NOTICE.body) blocks.push({ t: "p", text: line });

	/**
	 * Four headings, because they are four different claims. Everything under
	 * "built on" ships inside Roswaal or is something it could not run without;
	 * "inspired by" is work it only learned from. Listing an inspiration under
	 * "built on" would claim a relationship that does not exist.
	 *
	 * The licence column is the licence of what Roswaal carries: where nothing
	 * of theirs ships, none is needed, and naming one would suggest otherwise.
	 */
	const group = (heading: string, lede: string, entries: Attribution[], what = "Project") => {
		if (entries.length === 0) return;
		blocks.push({ t: "h", level: 2, text: heading });
		blocks.push({ t: "p", text: lede });
		blocks.push({
			t: "table",
			head: [what, "By", "Licence"],
			rows: entries.map((a) => [
				a.url ? `[${a.name}](${a.url})` : a.name,
				a.holder ?? "—",
				a.ships && a.licence ? a.licence : "None needed",
			]),
		});
		for (const entry of entries) {
			blocks.push({ t: "h", level: 3, text: entry.name });
			blocks.push({ t: "p", text: entry.note });
			blocks.push({ t: "p", text: `**Where:** ${entry.where}` });
			if (entry.quote) blocks.push({ t: "note", kind: "info", text: `"${entry.quote}"` });
		}
	};

	group(
		"What Roswaal is designed for",
		"The language and runtimes the code Roswaal generates is written for.",
		TARGETS,
		"Platform",
	);
	group(
		"What Roswaal is built on",
		"What ships inside Roswaal, and the tools and formats it works with.",
		DEPENDENCIES,
	);
	group(
		"What Roswaal is tested with",
		"Libraries named in these pages as examples. Nothing of theirs ships.",
		TESTED_WITH,
		"Library",
	);
	group(
		"What Roswaal is inspired by",
		"Conventions Roswaal learned from. No code, assets, content or dependency.",
		INSPIRATIONS,
	);

	blocks.push({ t: "h", level: 2, text: "Trademarks" });
	blocks.push({ t: "ul", items: TRADEMARKS.map((mark) => mark.line) });

	blocks.push({ t: "h", level: 2, text: "Licences" });
	blocks.push({
		t: "p",
		text:
			"Each licence Roswaal keeps by hand, exactly as its holder published it, with where it " +
			"came from and its SHA-256 to check it against the original.",
	});
	blocks.push({ t: "licences" });

	blocks.push({ t: "h", level: 2, text: "Roswaal itself" });
	blocks.push({
		t: "note",
		kind: "good",
		text:
			"Everything in this repository that is Roswaal's own is **0BSD**: use it, " +
			"modify it, ship it, train on it, no attribution required. The list above " +
			"is what that does *not* cover.",
	});

	blocks.push({ t: "h", level: 2, text: "How Roswaal is made" });
	for (const line of HOW_IT_IS_MADE) blocks.push({ t: "p", text: line });

	return {
		slug: "attributions",
		title: "Attributions",
		summary:
			"What Roswaal is built on, who made it, under which licence, and each licence in full.",
		narrow: true,
		blocks,
	};
}
