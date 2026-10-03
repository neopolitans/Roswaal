/**
 * The documentation's search: the index built from the site, and the one
 * ranking every search box uses — the editor's palette, the published site's
 * sidebar and its palette.
 */

import { blockText, stripMarkup } from "./markup.js";
import type { DocSite } from "./site.js";

export interface SearchEntry {
	slug: string;
	title: string;
	summary: string;
	section: string;
	/** Everything on the page, lowercased, for substring matching. */
	body: string;
	nodeId?: string;
}

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

/**
 * Ranked matches for a query.
 *
 * The same shape of scoring as the node palette, and for the same reason: a
 * title you half-remember should beat a page that merely mentions the word.
 * Searching the docs for "branch" must find the Branch node, not the six guide
 * paragraphs that use the word in passing.
 */
export function searchDocs(index: SearchEntry[], query: string, limit = 20): SearchEntry[] {
	return rankDocs(index, query, limit).map((hit) => hit.entry);
}

/** A hit and what it scored, for a caller that wants to say *why* it matched. */
export interface DocsHit {
	entry: SearchEntry;
	score: number;
	/**
	 * The query is in this page's name — its title, or the id of the node it
	 * documents — rather than somewhere in its prose.
	 *
	 * The palette splits on it: a page called what you typed is a different kind
	 * of answer from a page that mentions it once, and a list that runs the two
	 * together makes you read all of it to find that out.
	 */
	named: boolean;
}

/** The lowest score a match on the name can produce. See `scoreEntry`. */
const NAME_MATCH = 40;

export function rankDocs(index: SearchEntry[], query: string, limit = 20): DocsHit[] {
	const q = query.trim().toLowerCase();
	if (q === "") return [];

	return index
		.map((entry) => ({ entry, score: scoreEntry(entry, q), named: false }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
		.slice(0, limit)
		.map((hit) => ({ ...hit, named: hit.score >= NAME_MATCH }));
}

function scoreEntry(entry: SearchEntry, q: string): number {
	const title = entry.title.toLowerCase();
	if (title === q) return 120;
	if (title.startsWith(q)) return 100;
	if (title.includes(q)) return 60;
	if (entry.nodeId?.toLowerCase().includes(q)) return 40;
	if (entry.summary.toLowerCase().includes(q)) return 25;
	if (entry.body.includes(q)) return 10;
	return 0;
}
