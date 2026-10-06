/**
 * The release notes on the published site: the dots on what this browser has
 * not seen, in the contents of every page and on the release notes pages; the
 * versions dropdown; and links to one release -- `0.144.html#v0.144.2` marking
 * that release's lines, and an address from when every release was on the
 * front page, `release-notes.html#v0.119.0`, sent on to where it is now.
 *
 * The behaviour is the Docs window's, from `src/app/releaseNotes.ts`; this only
 * finds the page and reads the address, which the Docs window cannot use.
 */

import {
	latestRelease,
	markNewReleases,
	movedRelease,
	releasesSeen,
	rememberReleases,
	showRelease,
	wireReleasePages,
} from "../../src/app/releaseNotes.ts";

// A test runs the bundle without a page; there is nothing to wire then.
if (typeof document.querySelector === "function") {
	let seen: string | null = null;
	try {
		seen = releasesSeen(localStorage);
	} catch {
		// No storage, no dots.
	}
	const nav = document.querySelector<HTMLElement>(".docs-nav");
	if (nav) markNewReleases(nav, seen);

	const article = document.querySelector<HTMLElement>(".docs-article");
	const latest = article ? latestRelease(article) : null;
	if (article && latest) {
		const moved = movedRelease(article, location.hash);
		if (moved && !article.querySelector(`[id="${CSS.escape(location.hash.slice(1))}"]`)) {
			location.replace(moved.href);
		} else {
			markNewReleases(article, seen);
			try {
				rememberReleases(localStorage, latest);
			} catch {
				// As above.
			}
			wireReleasePages(article, (target) => {
				location.href = target.href;
			});
			const follow = () => {
				const version = /^#v(.+)$/.exec(decodeURIComponent(location.hash))?.[1];
				if (version) showRelease(article, version);
			};
			follow();
			addEventListener("hashchange", follow);
		}
	}
}
