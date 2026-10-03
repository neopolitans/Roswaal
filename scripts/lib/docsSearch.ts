/**
 * The published site's sidebar search, and its code blocks' Copy button.
 *
 * Bundled into `docs.js` by `bundleBrowser`. The ranking is `rankDocs` itself,
 * the function the editor's palette calls, so the site and the app cannot
 * disagree about which page is the best answer — nor about the order of two
 * pages that score the same.
 *
 * Published as `window.__roswaalSearch` for `docsChrome.js`, whose palette is
 * the same search in a different shape: one index, one ranking, one fetch.
 *
 * Every string from the index reaches the page as text, never as markup: a
 * title is the author's words, and the page should print what they typed.
 */

import { rankDocs, type SearchEntry } from "../../src/core/docs/search.ts";

/** What `docsChrome.js` reads off the window. */
export interface SharedSearch {
	index: SearchEntry[] | null;
	ready: Promise<void> | null;
	/** The best matches for `query`, best first. */
	rank(query: string, limit: number): SearchEntry[];
}

declare global {
	interface Window {
		__roswaalSearch?: SharedSearch;
	}
}

/** How many results the sidebar lists. */
const SIDEBAR_HITS = 25;

/** A result row: the page's title over the section it is in. */
function hitRow(prefix: string, entry: SearchEntry): HTMLAnchorElement {
	const link = document.createElement("a");
	link.className = "docs-hit";
	link.href = `${prefix}${entry.slug}.html`;
	const title = document.createElement("span");
	title.className = "title";
	title.textContent = entry.title;
	const where = document.createElement("span");
	where.className = "where";
	where.textContent = entry.section;
	link.append(title, where);
	return link;
}

function attachSearch(): void {
	const field = document.getElementById("q");
	const box = field instanceof HTMLInputElement ? field : null;
	const results = document.getElementById("results");
	const tree = document.getElementById("tree");
	const up = (document.documentElement.dataset.slug ?? "").split("/").length - 1;
	const prefix = "../".repeat(up);

	const shared: SharedSearch = {
		index: null,
		ready: null,
		rank: (query, limit) => rankDocs(shared.index ?? [], query, limit).map((hit) => hit.entry),
	};
	window.__roswaalSearch = shared;

	shared.ready = fetch(`${prefix}search.json`)
		// Written by `build-docs.mjs` from `buildSearchIndex`, beside this script.
		.then((response) => response.json() as Promise<SearchEntry[]>)
		.then((index) => {
			shared.index = index;
			if (!box || !results || !tree) return;
			box.addEventListener("input", () => {
				const query = box.value.trim();
				if (query === "") {
					results.hidden = true;
					tree.hidden = false;
					return;
				}
				const hits = shared.rank(query, SIDEBAR_HITS);
				if (hits.length === 0) {
					const empty = document.createElement("div");
					empty.className = "empty";
					empty.textContent = "Nothing matches.";
					results.replaceChildren(empty);
				} else {
					results.replaceChildren(...hits.map((entry) => hitRow(prefix, entry)));
				}
				results.hidden = false;
				tree.hidden = true;
			});
		});
}

/** Copy on a code block's button; select the code instead where that is refused. */
function attachCopy(): void {
	document.addEventListener("click", (event) => {
		if (!(event.target instanceof Element)) return;
		const button = event.target.closest<HTMLElement>("[data-copy]");
		const pre = button?.closest(".docs-code")?.querySelector("pre");
		if (!button || !pre) return;
		navigator.clipboard.writeText(pre.innerText).then(
			() => {
				button.textContent = "Copied";
			},
			() => {
				// Refused, so select it instead and say what to press. Same fallback
				// the in-app panel uses, for the same reason.
				const range = document.createRange();
				range.selectNodeContents(pre);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				button.textContent = "Press Ctrl+C";
			},
		);
		setTimeout(() => {
			button.textContent = "Copy";
		}, 1800);
	});
}

attachSearch();
attachCopy();
