/**
 * Where the documentation sends somebody who wants to say something.
 *
 * **Not the source repository.** Roswaal's is private while the first release
 * is in testing, and a "report a problem" link on every page of a public site
 * that answers 404 to everyone who follows it is worse than no link at all —
 * it reads as a project that has gone quiet rather than one that has not opened
 * yet. `roswaal-feedback` is public and exists for exactly this.
 *
 * One constant, because two footers carry it: the published site's, rendered in
 * `html.ts`, and the editor's own docs window, in `PageEditor.tsx`. They build
 * different issue bodies — the editor's knows the version and can attach the
 * blocks it is proposing, and the static site has neither — so what is shared
 * is the destination and not the link.
 *
 * When the source opens, this is the one line that changes.
 */
export const FEEDBACK_REPOSITORY = "https://github.com/neopolitans/roswaal-feedback";
