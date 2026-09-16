/**
 * Which page a document is, and where the other two live.
 *
 * Roswaal is three pages out of one bundle — the editor, the documentation
 * window and Node Design — and how you reach them depends on what is serving
 * them, which is why this is a module rather than seven string literals spread
 * across four files.
 *
 * **The daemon** serves `index.html` for every path that is not `/api`, so the
 * pages are clean routes off the root: `/`, `/docs`, `/designer`. That is what
 * the links used to be written as, by hand.
 *
 * **A static host** has no such fallback and no server to ask, so each page is
 * a file that exists: `try.html` and `designer.html`. The documentation is not
 * a page of the bundle there at all — it is the separate static site under
 * `docs/`, which needs no JavaScript to read and documents the built-in library
 * rather than a project's own packs. Worth knowing when following a link from
 * the hosted editor: it lands somewhere that cannot see your packs.
 *
 * And a project site on github.io is served from `/<repo>/` rather than from
 * the root, so every one of those hand-written absolute links pointed at
 * somebody else's space. `BASE_URL` is whatever the bundle was built with, so
 * the same code is right at a sub-path and at an apex domain later.
 */

/** True in the hosted build. Set by `define` in both Vite configs. */
declare const __ROSWAAL_STATIC__: boolean;

/**
 * Which line of development this bundle is from. Set by `define` in both Vite
 * configs, from `ROSWAAL_CHANNEL`.
 */
declare const __ROSWAAL_CHANNEL__: Channel;

/** Whether this bundle was built for a static host rather than the daemon. */
export const IS_STATIC_HOST: boolean = __ROSWAAL_STATIC__;

/**
 * Stable, or the canary.
 *
 * A second axis, not a variation on the first. `IS_STATIC_HOST` says what is
 * serving the bundle — the daemon or a static host — and the channel says which
 * line of development produced it. The two are independent: there is a canary
 * daemon build and a canary hosted build, and both are canary.
 */
export type Channel = "stable" | "canary";

export const CHANNEL: Channel = __ROSWAAL_CHANNEL__;

/** True when this build is not from the stable line. */
export const IS_CANARY: boolean = __ROSWAAL_CHANNEL__ === "canary";

export type Page = "editor" | "docs" | "designer";

/** Vite guarantees a trailing slash: "/" for the daemon, "/Roswaal/" on Pages. */
const base = import.meta.env.BASE_URL;

/**
 * Where a page lives, given where the site is and what is serving it.
 *
 * Pure, and exported, because the two shapes cannot both be observed in one
 * build — the flag is compiled in — and a wrong answer here is a dead link on
 * a published site rather than an error anybody sees while working.
 */
export function hrefFor(
	base: string, staticHost: boolean, page: Page, hash?: string,
): string {
	const root = base.endsWith("/") ? base : base + "/";
	const fragment = hash ? `#${hash}` : "";

	if (staticHost) {
		if (page === "docs") return `${root}docs/${fragment}`;
		if (page === "designer") return `${root}designer.html${fragment}`;
		return `${root}try.html${fragment}`;
	}

	if (page === "docs") return `${root}docs${fragment}`;
	if (page === "designer") return `${root}designer${fragment}`;
	return `${root}${fragment}`;
}

/** Where a page lives, from wherever this document is. */
export function pageHref(page: Page, hash?: string): string {
	return hrefFor(base, __ROSWAAL_STATIC__, page, hash);
}

/**
 * Which page a path is.
 *
 * Matched on the end rather than against the whole path, because the whole path
 * now depends on where the site is mounted: `/docs` under the daemon and
 * `/Roswaal/designer.html` on Pages are the same two answers.
 */
export function pageAt(path: string): Page {
	const trimmed = path.replace(/\/+$/, "");
	if (/\/designer(\.html)?$/.test(trimmed)) return "designer";
	if (/\/docs(\.html)?$/.test(trimmed)) return "docs";
	return "editor";
}

/** Which page this document is. */
export function currentPage(): Page {
	return pageAt(window.location.pathname);
}

/** The window name each page opens into, so a second click reuses the tab. */
export const PAGE_TARGET: Record<Page, string> = {
	editor: "roswaal-editor",
	docs: "roswaal-docs",
	designer: "roswaal-designer",
};
