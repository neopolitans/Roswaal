/**
 * The Content-Security-Policy every page Roswaal serves runs under.
 *
 * One policy, written once, for the two ways a page reaches somebody: the
 * daemon sends it as a header with the editor it serves, and the website --
 * the hosted editor, Node Design and the docs, on GitHub Pages, which sends no
 * headers of its own -- carries it as a `<meta>` tag in every page.
 *
 * What it allows is what the pages use and no more:
 *
 * - **Scripts from the site only.** No page has an inline script, an inline
 *   handler or an `eval`, so a script that got into a page some other way has
 *   nowhere to load from. On the website this matters most: the hosted editor
 *   holds write access to folders somebody chose to open.
 * - **Requests to the site only.** The hosted editor talks to its own worker;
 *   the daemon's editor to the daemon. Nothing reaches out, so nothing a
 *   script might gather has anywhere to go.
 * - **Styles inline as well.** CodeMirror writes its own, and the docs'
 *   pictures carry theirs in `style` attributes.
 *
 * Not for `src/core` to apply -- it only says what the policy is.
 */

const DIRECTIVES = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"worker-src 'self' blob:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
];

/**
 * As a response header: the daemon's. A header can also say who may put the
 * page in a frame; `'self'`, because the editor's own windows are its pages.
 */
export const CSP_HEADER = [...DIRECTIVES, "frame-ancestors 'self'"].join("; ");

/**
 * As a `<meta>` tag: the website's. `frame-ancestors` is left out because a
 * browser ignores it there and says so in the console; who may frame the site
 * is a header's to say, and GitHub Pages cannot send one.
 */
export const CSP_META = DIRECTIVES.join("; ");

const META_TAG = `<meta http-equiv="Content-Security-Policy" content="${CSP_META}">`;

/**
 * A page with the policy in its `<head>`, ahead of anything it governs: just
 * after the character set, which has to stay first, or else at the top of
 * the head. A page that already has it is returned as it is.
 */
export function withCspMeta(html: string): string {
	if (html.includes('http-equiv="Content-Security-Policy"')) return html;
	const charset = /<meta\s+charset=[^>]*>/i.exec(html);
	if (charset) {
		const at = charset.index + charset[0].length;
		return `${html.slice(0, at)}\n${META_TAG}${html.slice(at)}`;
	}
	const head = /<head[^>]*>/i.exec(html);
	if (!head) throw new Error("A page with no <head> has nowhere to carry its policy.");
	const at = head.index + head[0].length;
	return `${html.slice(0, at)}\n${META_TAG}${html.slice(at)}`;
}
