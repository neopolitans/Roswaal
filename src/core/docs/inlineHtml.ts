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

/** Where a page's file goes, relative to the site root. */
export function pagePath(slug: string): string {
	return `${slug}.html`;
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
				case "strong":
					return `<strong>${body}</strong>`;
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
