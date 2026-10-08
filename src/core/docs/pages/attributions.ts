/**
 * The `attributions` page of the documentation. `buildSite` places it.
 */

import { HOW_IT_IS_MADE, NAME_NOTICE, NOT_AFFILIATED } from "../attributions.js";
import type { Block, DocPage } from "../site.js";

/**
 * Who made what Roswaal is built on, and what it is named after.
 *
 * A page rather than only `ATTRIBUTIONS.md`, because the people who need to read it
 * are not all reading the repository. Written so whoever holds an entry can find
 * it at a glance: the browser shows every holder against the seven ways Roswaal
 * uses their work, then each entry in a line, its licence a button that opens
 * the licence itself. Every licence Roswaal carries follows, in full.
 */
export function attributionsPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Roswaal is 0BSD. Everything on this page belongs to someone else. Find your name to " +
				"see what Roswaal uses, how, and under which licence, and open the licence to read it " +
				"exactly as Roswaal carries it.",
		},
		{
			t: "note",
			kind: "info",
			text:
				`**${NOT_AFFILIATED}** Trademarks belong to their owners, and are named only to say ` +
				"what something is.",
		},
		{ t: "attributions" },
		{ t: "h", level: 2, text: "Licences" },
		{
			t: "p",
			text:
				"Each licence Roswaal keeps by hand, exactly as its holder published it, with where it " +
				"came from and its SHA-256 to check it against the original.",
		},
		{ t: "licences" },
		{ t: "h", level: 2, text: "Roswaal itself" },
		{
			t: "note",
			kind: "good",
			text:
				"Everything in this repository that is Roswaal's own is **0BSD**: use it, " +
				"modify it, ship it, train on it, no attribution required. The list above " +
				"is what that does *not* cover.",
		},
		{ t: "p", text: NAME_NOTICE.body[2] },
		{ t: "h", level: 2, text: "How Roswaal is made" },
		...HOW_IT_IS_MADE.map((line): Block => ({ t: "p", text: line })),
	];

	return {
		slug: "attributions",
		title: "Attributions",
		summary:
			"Find your name: what Roswaal uses, how, under which licence, and each licence in full.",
		blocks,
	};
}
