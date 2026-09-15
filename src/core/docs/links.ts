/**
 * Where the documentation sends somebody who wants to say something.
 *
 * **Not the source repository**, which is a separate destination rather than a
 * fallback. It was private when this file was written, so a "report a problem"
 * link pointing at it would have answered 404 to everyone. It is public now and
 * reports still go to `roswaal-feedback`: the source repository is for reading,
 * and somebody who wants to file something should not have to work out which of
 * two repositories takes it.
 *
 * One constant, because two footers carry it: the published site's, rendered in
 * `html.ts`, and the editor's own docs window, in `PageEditor.tsx`. They build
 * different issue bodies — the editor's knows the version and can attach the
 * blocks it is proposing, and the static site has neither — so what is shared
 * is the destination and not the link.
 *
 */
export const FEEDBACK_REPOSITORY = "https://github.com/neopolitans/roswaal-feedback";

/**
 * Roswaal's own source, public under 0BSD since 0.59.1.
 *
 * Carried by the landing page and by every documentation page's header, which
 * is why it is a constant rather than a string in each -- a repository that is
 * renamed or moved should be one edit, not a search for a URL that is spelled
 * slightly differently in two places.
 */
export const SOURCE_REPOSITORY = "https://github.com/neopolitans/Roswaal";
