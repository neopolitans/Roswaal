/**
 * What a build calls itself, and what it is warning about.
 *
 * Roswaal is one bundle and more than one product. The daemon build on the
 * stable line is the tool: it has your repository, it writes `.luau` files next
 * to your graphs, and Rojo syncs them into Studio. Two builds are not that, and
 * each has to say so.
 *
 * - The **browser preview** is a way to try the tool without installing
 *   anything — the same editor over a project kept in a browser tab.
 * - The **canary** is the unstable line. Everything lands there first and
 *   reaches the stable build only when it is finished, so a canary build is
 *   work in progress by definition.
 *
 * Someone who meets Roswaal through either has no way to know there is a
 * stable, installed thing behind it. That is what the mark is for. It is not
 * modesty about the tool; it is the difference between *this is what Roswaal
 * is* and *this is what Roswaal is like*.
 *
 * ## The rule
 *
 * **Every surface of a marked build carries its mark, and every link into one
 * is labelled with it.** Both halves matter and they say different things: on a
 * surface it reads "you are here", beside a link "this leads there".
 * `tests/previewbuild.test.ts` holds both, because a rule about something
 * appearing on every page is exactly the kind that decays one new page at a
 * time.
 *
 * It had already decayed once. The chip was a span in the editor's toolbar;
 * Node Design was a whole window of the same build carrying nothing, and the
 * front page's door into it said only "Try it in your browser", which describes
 * the mechanism rather than saying anything about the product.
 *
 * ## One mark, never two
 *
 * A canary browser build is both preview and canary, and it says **canary**. A
 * surface wearing two marks is a surface saying neither, and of the two the
 * canary is the one that changes what a reader should expect — an unfinished
 * build is unfinished whether it is in a tab or on their own machine.
 *
 * ## Why the wording is here and the gate is next door
 *
 * Two things import this: the React windows, and the two pages built in Node —
 * the front page and the documentation site's header. The second pair run under
 * `tsx`, where `__ROSWAAL_STATIC__` does not exist, so anything reaching
 * `pages.ts` throws on import. The gate therefore lives in `previewBuild.tsx`
 * with the component, and the words live here where a build script can read
 * them.
 */

/** Which mark a build wears, if any. `null` is the stable daemon build. */
export type BuildMark = "preview" | "canary";

/** The word on the chip. Lowercase; the stylesheet upper-cases it. */
export const MARK_LABEL: Record<BuildMark, string> = {
	preview: "preview",
	canary: "canary",
};

/**
 * What the word means when you are standing on it.
 *
 * One sentence each, because they are tooltips. The rest is the banner, and
 * after that the Toolbars page.
 */
export const MARK_ON_SURFACE: Record<BuildMark, string> = {
	preview:
		"The browser preview: the same editor, over a project kept in this browser rather than" +
		" in your repository. Install Roswaal to work on files on your own machine.",
	canary:
		"The canary: an unreleased build, where everything lands before it reaches the stable" +
		" one. Expect things to be half-finished, and expect them to change.",
};

/** What each means beside a link that leads there. */
export const MARK_BESIDE_LINK: Record<BuildMark, string> = {
	preview:
		"The browser preview: try Roswaal with nothing to install. Your project is kept in the" +
		" browser, not on your disk.",
	canary: "The canary: an unreleased build. Not the one to start from.",
};

/**
 * The banner, which is not the chip.
 *
 * The chip says which build you are on. It does not say what that means for
 * you, and on a site anyone can reach, the reader who most needs telling is the
 * one who did not choose to be there.
 *
 * Two wordings, because they are two different claims. The app one is about a
 * build that may break. The documentation one is sharper: these pages describe
 * a build that is not out, and documentation is read by people looking for an
 * answer about the version they already have.
 */
export const CANARY_BANNER = {
	app: "This is the canary — an unreleased build of Roswaal, and not the one to start from.",
	docs:
		"These pages document the canary: an unreleased build. What they describe may not be in" +
		" the version you have, and may change before it is.",
	/** Every banner leads somewhere. A warning with no way out gets dismissed. */
	wayOut: "The stable build",
} as const;

/** The chip as markup, for the pages built in Node rather than by React. */
export function markChipMarkup(mark: BuildMark, title = MARK_BESIDE_LINK[mark]): string {
	return (
		`<span class="version preview-chip ${mark}" title="${title.replace(/"/g, "&quot;")}">` +
		`${MARK_LABEL[mark]}</span>`
	);
}

// ---------------------------------------------------------------------------
// The names the preview rule was written under, kept
// ---------------------------------------------------------------------------

/**
 * 0.60.0 shipped this file with one mark in it, and these three names are what
 * the rest of the tree imports. Kept as aliases rather than renamed across
 * eight call sites in a release that is about something else.
 */
export const PREVIEW_LABEL = MARK_LABEL.preview;
export const PREVIEW_ON_SURFACE = MARK_ON_SURFACE.preview;
export const PREVIEW_BESIDE_LINK = MARK_BESIDE_LINK.preview;

/** The preview chip as markup. See `markChipMarkup` for the general form. */
export function previewChipMarkup(title = PREVIEW_BESIDE_LINK): string {
	return markChipMarkup("preview", title);
}
