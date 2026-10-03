/**
 * The search index: every page as the words a search matches against.
 *
 * Apart from the ranking in `search.ts`, because building it needs the whole
 * page model and ranking needs none of it — the published site ships the
 * ranking and fetches the index the build wrote.
 */

import { blockText, stripMarkup } from "./markup.js";
import type { SearchEntry } from "./search.js";
import type { DocSite } from "./site.js";

export function buildSearchIndex(site: DocSite): SearchEntry[] {
	const out: SearchEntry[] = [];
	for (const section of site.sections) {
		for (const page of section.pages) {
			out.push({
				slug: page.slug,
				title: page.title,
				// Without its markup: the search box prints it as it is.
				summary: stripMarkup(page.summary),
				section: section.title,
				body: page.blocks.map(blockText).join(" ").toLowerCase(),
				nodeId: page.nodeId,
			});
		}
	}
	return out;
}
