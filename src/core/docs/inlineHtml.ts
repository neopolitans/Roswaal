/**
 * Inline markup as HTML: the one place it is turned into tags.
 *
 * The published site writes it into every page (`html.ts`), and the Docs
 * window writes the release notes with it as well (`releaseHtml.ts`), so a
 * link to another page has to come out right for both. Each passes where a
 * page lives -- a file beside this one, or a page in the window -- and every
 * page link carries its slug, for a window to follow without loading a file.
 */

import { isPageLink, parseInline } from "./markup.js";

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Where a page's file goes, relative to the site root. A slug may carry a
 * place on the page after `#`, as a link to one requirement does.
 */
export function pagePath(slug: string): string {
	const [bare, hash] = slug.split("#");
	return `${bare}.html${hash ? `#${hash}` : ""}`;
}

/** Inline markup as HTML. `pageHref` says where a page of these docs is. */
export function inlineHtml(text: string, pageHref: (slug: string) => string): string {
	return parseInline(text)
		.map((run) => {
			const body = escapeHtml(run.text);
			switch (run.t) {
				case "text":
					return body;
				case "code":
					return `<code>${body}</code>`;
				case "strong": {
					const kw = keywordStrength(run.text);
					return kw ? `<span class="kw kw-${kw}">${body}</span>` : `<strong>${body}</strong>`;
				}
				case "em":
					return `<em>${body}</em>`;
				case "link":
					// Another page of these docs is a file beside this one; written
					// as its bare slug, it resolved to an address that did not exist.
					return isPageLink(run.href)
						? `<a href="${escapeHtml(pageHref(run.href))}" data-doc-slug="${escapeHtml(run.href)}">${body}</a>`
						: `<a href="${escapeHtml(run.href)}" rel="noreferrer noopener">${body}</a>`;
			}
		})
		.join("");
}

/**
 * The key words of RFC 2119, by how hard they bind: a requirement, a
 * recommendation, or a permission. Written in bold capitals in the source, and
 * drawn as a pin coloured by strength, so a reader finds the rules on a page
 * by eye. Anything else in bold stays bold.
 */
export function keywordStrength(text: string): "must" | "should" | "may" | null {
	if (/^(MUST|MUST NOT|REQUIRED|SHALL|SHALL NOT)$/.test(text)) return "must";
	if (/^(SHOULD|SHOULD NOT|RECOMMENDED|NOT RECOMMENDED)$/.test(text)) return "should";
	if (/^(MAY|OPTIONAL)$/.test(text)) return "may";
	return null;
}
