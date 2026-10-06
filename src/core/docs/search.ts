/**
 * The documentation's search ranking: the one every search box uses — the
 * editor's palette, the published site's sidebar and its palette.
 *
 * Imports nothing, so the published site can bundle it on its own. The index
 * it ranks is built by `searchIndex.ts`.
 */

export interface SearchEntry {
	slug: string;
	title: string;
	summary: string;
	section: string;
	/** Everything on the page, lowercased, for substring matching. */
	body: string;
	nodeId?: string;
	/**
	 * A record of what changed -- a minor version's release notes -- rather
	 * than a page that explains something. Found by name as any page is, and
	 * ranked below the explanation when both only mention what was typed:
	 * somebody searching "node design" wants the page about it, not every
	 * version that touched it.
	 */
	record?: boolean;
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
	const quieter = entry.record ? 0.5 : 1;
	if (entry.summary.toLowerCase().includes(q)) return 25 * quieter;
	if (entry.body.includes(q)) return 10 * quieter;
	return 0;
}
