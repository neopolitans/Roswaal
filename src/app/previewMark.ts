/**
 * The mark that says you are in the browser build, and what it is warning about.
 *
 * Roswaal is one bundle and two products. The daemon build is the tool: it has
 * your repository, it writes `.luau` files next to your graphs, and Rojo syncs
 * them into Studio. The **browser build** is a way to try that without
 * installing anything — the same editor over a project kept in a browser tab.
 *
 * Those are not the same offer, and somebody who meets Roswaal through the
 * second one has no way to know there is a first. That is what the word is for.
 * It is not modesty about the tool; it is the difference between *this is what
 * Roswaal is* and *this is what Roswaal is like*.
 *
 * ## The rule
 *
 * **Every surface of the browser build carries the mark, and every link into it
 * is labelled with it.** Both halves matter and they say different things: on a
 * surface it reads "you are in the preview", beside a link "this leads to the
 * preview". `tests/previewbuild.test.ts` holds both, because a rule about
 * something appearing on every page is exactly the kind that decays one new
 * page at a time.
 *
 * It had already decayed. The chip was a span in the editor's toolbar; Node
 * Design was a whole window of the same build carrying nothing, and the front
 * page's door into it said only "Try it in your browser", which describes the
 * mechanism rather than saying anything about the product.
 *
 * ## Why the wording is here and the component is next door
 *
 * Two things import this: the React windows, and the two pages built in Node —
 * the front page and the documentation site's header. The second pair run under
 * `tsx`, where `__ROSWAAL_STATIC__` does not exist, so anything reaching
 * `pages.ts` throws on import. The gate therefore lives in `previewBuild.tsx`
 * with the component, and the words live here where a build script can read
 * them. Same split `logo.tsx` would need if the mark had a host to ask.
 */

/** The word. Lowercase; the stylesheet upper-cases it. */
export const PREVIEW_LABEL = "preview";

/**
 * What the word means when you are standing on it.
 *
 * One sentence, because it is a tooltip. The rest is on the Toolbars page and
 * on the front page, which is where somebody who wants the detail goes.
 */
export const PREVIEW_ON_SURFACE =
	"The browser preview: the same editor, over a project kept in this browser rather than" +
	" in your repository. Install Roswaal to work on files on your own machine.";

/** What it means beside a link that leads there. */
export const PREVIEW_BESIDE_LINK =
	"The browser preview: try Roswaal with nothing to install. Your project is kept in the" +
	" browser, not on your disk.";

/**
 * The mark as markup, for the pages built in Node.
 *
 * Not gated on the host: those pages are always static, and what they are
 * marking is a *link* into the browser build rather than the surface they are
 * on. The gated form is `PreviewChip` in `previewBuild.tsx`.
 */
export function previewChipMarkup(title = PREVIEW_BESIDE_LINK): string {
	return (
		`<span class="version preview-chip" title="${title.replace(/"/g, "&quot;")}">` +
		`${PREVIEW_LABEL}</span>`
	);
}
