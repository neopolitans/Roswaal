/**
 * The release notes page on the published site: its search, filters and jump
 * bar, the dots on releases this browser has not seen, and links to one
 * release -- `release-notes.html#v0.119.0` -- opening the fold it is in.
 *
 * The behaviour is the Docs window's, from `src/app/releaseNotes.ts`; this only
 * finds the page and reads the address, which the Docs window cannot use.
 */

import { markNewReleases, revealRelease, wireReleaseNotes } from "../../src/app/releaseNotes.ts";

// A test runs the bundle without a page; there is nothing to wire then.
const article =
	typeof document.querySelector === "function"
		? document.querySelector<HTMLElement>(".docs-article")
		: null;
if (article?.querySelector("[data-release-tools]")) {
	try {
		markNewReleases(article, localStorage);
	} catch {
		// No storage, no dots.
	}
	wireReleaseNotes(article);
	const follow = () => {
		const id = decodeURIComponent(location.hash.slice(1));
		const target = id ? document.getElementById(id) : null;
		if (target && article.contains(target)) revealRelease(target);
	};
	follow();
	addEventListener("hashchange", follow);
}
