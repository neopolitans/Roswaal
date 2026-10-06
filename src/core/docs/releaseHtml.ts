/**
 * The release notes' blocks as HTML, for both renderers.
 *
 * The published site writes these into its pages, and the Docs window sets the
 * same markup into its own, so the two cannot drift apart; what they do --
 * the versions dropdown, the dots on what is new, a link to one release -- is
 * `src/app/releaseNotes.ts`, wired by each. `pageHref` says where a page lives
 * for the renderer asking: a file beside this one, or a page in the window.
 * Every link to a page also carries its slug, for the window to follow.
 */

import { escapeHtml, inlineHtml } from "./inlineHtml.js";
import { stripMarkup } from "./markup.js";
import { noteHeadHtml } from "./notes.js";
import { TAG_LABELS } from "./releaseTags.js";
import {
	type Block,
	type MinorRow,
	type MinorView,
	type ReleaseTag,
	releaseAnchor,
	type Shipped,
	type VersionChoice,
} from "./site.js";

type PageHref = (slug: string) => string;

/** A block the release notes draw, by the type it is. */
export type ReleaseBlock = Extract<
	Block,
	{ t: "releaseMinor" | "releaseRows" | "releaseVersions" | "releasePager" }
>;

export function isReleaseBlock(block: Block): block is ReleaseBlock {
	return (
		block.t === "releaseMinor" ||
		block.t === "releaseRows" ||
		block.t === "releaseVersions" ||
		block.t === "releasePager"
	);
}

export function releaseBlockHtml(block: ReleaseBlock, pageHref: PageHref): string {
	switch (block.t) {
		case "releaseMinor":
			return minorHtml(block.minor, pageHref, block.link === true);
		case "releaseRows":
			return rowsHtml(block.rows, pageHref);
		case "releaseVersions":
			return versionsHtml(block.groups, block.latest, pageHref, block.current);
		case "releasePager":
			return pagerHtml(block.newer, block.older, pageHref);
	}
}

const pageLink = (slug: string, pageHref: PageHref, body: string, cls: string, attrs = "") =>
	`<a class="${cls}" href="${escapeHtml(pageHref(slug))}" data-doc-slug="${escapeHtml(slug)}"${attrs}>${body}</a>`;

/** The badge a line carries: the release it shipped in. */
const shipped = (version: string) => `<span class="docs-ver">${escapeHtml(version)}</span>`;

/** The dot on what this browser has not seen, which `releaseNotes.ts` turns on. */
const NEW = `<span class="docs-release-new" title="New since your last visit">New</span>`;

const SECURITY_TITLE =
	"Fixes a security weakness. The notes say what changed; the details stay private until everyone has had the fix.";

function tagsHtml(tags: readonly ReleaseTag[]): string {
	return tags
		.map((tag) => `<span class="docs-tag tag-${tag}">${escapeHtml(TAG_LABELS[tag])}</span>`)
		.join("");
}

function linesHtml(lines: readonly Shipped[], pageHref: PageHref): string {
	return lines
		.map(
			(line) =>
				`<li data-version="${escapeHtml(line.version)}">${shipped(line.version)}` +
				`<span class="docs-ver-text">${inlineHtml(line.text, pageHref)}</span></li>`,
		)
		.join("");
}

function minorHtml(m: MinorView, pageHref: PageHref, link: boolean): string {
	const name = `${escapeHtml(m.minor)}.x`;
	const title = link
		? pageLink(m.slug, pageHref, name, "docs-release-version")
		: `<span class="docs-release-version">${name}</span>`;
	const dates = m.from === m.to ? m.from : `${m.from} – ${m.to}`;
	const releases = m.releases
		.map(
			(r) =>
				`<li id="${releaseAnchor(r.version)}" data-version="${escapeHtml(r.version)}">` +
				shipped(r.version) +
				`<span class="docs-ver-text">${inlineHtml(r.headline, pageHref)}</span>` +
				(r.tags.includes("security")
					? `<span class="docs-tag tag-security" title="${escapeHtml(SECURITY_TITLE)}">${TAG_LABELS.security}</span>`
					: "") +
				NEW +
				`<span class="aside">${escapeHtml(r.date)}</span></li>`,
		)
		.join("");
	const watch =
		m.watch.length > 0
			? `<div class="docs-note note-warn">${noteHeadHtml("warn")}<div class="docs-note-body">` +
				`<strong>Worth knowing before you upgrade.</strong>` +
				`<ul class="docs-release-entries">${linesHtml(m.watch, pageHref)}</ul></div></div>`
			: "";
	const sections = [
		...m.sections.map((s) => ({ kind: s.kind as string, heading: s.heading, lines: s.entries })),
		...m.articles.map((a) => ({ kind: "articles", heading: a.heading, lines: a.links })),
	]
		.map(
			(s) =>
				`<div class="docs-release-section" data-kind="${s.kind}"><h4>${escapeHtml(s.heading)}</h4>` +
				`<ul class="docs-release-entries">${linesHtml(s.lines, pageHref)}</ul></div>`,
		)
		.join("");
	return (
		`<section class="docs-release docs-minor${m.latest ? " is-latest" : ""}" data-minor="${escapeHtml(m.minor)}">` +
		`<header class="docs-release-head">${title}` +
		`${m.latest ? `<span class="badge latest">Latest</span>` : ""}` +
		`${m.security ? `<span class="badge security" title="${escapeHtml(SECURITY_TITLE)}">Security fixes</span>` : ""}` +
		`<span class="aside">${escapeHtml(dates)}</span></header>` +
		`${m.tags.length ? `<p class="docs-tags">${tagsHtml(m.tags)}</p>` : ""}` +
		`<p class="docs-release-headline">${inlineHtml(m.headline, pageHref)}</p>` +
		`<div class="docs-release-section" data-kind="releases"><h4>${m.releases.length === 1 ? "Release" : "Releases"}</h4>` +
		`<ol class="docs-minor-releases">${releases}</ol></div>` +
		watch +
		sections +
		`</section>`
	);
}

function rowsHtml(rows: readonly MinorRow[], pageHref: PageHref): string {
	if (rows.length === 0) return "";
	return (
		`<div class="docs-minor-rows">` +
		rows
			.map((row) =>
				pageLink(
					row.slug,
					pageHref,
					`<span class="docs-ver">${escapeHtml(row.minor)}.x</span>` +
						// Plain: the whole row is a link, and a link cannot hold another.
						`<span class="docs-ver-text">${escapeHtml(stripMarkup(row.headline))}</span>` +
						(row.security
							? `<span class="docs-tag tag-security" title="${escapeHtml(SECURITY_TITLE)}">${TAG_LABELS.security}</span>`
							: "") +
						NEW +
						`<span class="aside">${escapeHtml(row.date)}</span>`,
					"docs-minor-row",
					` data-version="${escapeHtml(row.newest)}"`,
				),
			)
			.join("") +
		`</div>`
	);
}

function versionsHtml(
	groups: readonly VersionChoice[],
	latest: string,
	pageHref: PageHref,
	current?: string,
): string {
	const options = groups
		.map(
			(group) =>
				`<optgroup label="${escapeHtml(group.label)}">` +
				group.items
					.map(
						(item) =>
							`<option value="${escapeHtml(item.slug)}" data-href="${escapeHtml(pageHref(item.slug))}" ` +
							`data-version="${escapeHtml(item.newest)}"${item.minor === current ? " selected" : ""}>` +
							`${escapeHtml(item.minor)}.x${item.security ? " · security fixes" : ""}</option>`,
					)
					.join("") +
				`</optgroup>`,
		)
		.join("");
	const prompt = current ? "" : `<option value="" selected disabled>Choose a version…</option>`;
	return (
		`<div class="docs-versions" data-latest="${escapeHtml(latest)}">` +
		`<label>Version <select data-release-versions aria-label="Release notes for a version">` +
		`${prompt}${options}</select></label></div>`
	);
}

function pagerHtml(
	newer: { slug: string; label: string } | undefined,
	older: { slug: string; label: string } | undefined,
	pageHref: PageHref,
): string {
	return (
		`<nav class="docs-release-pager" aria-label="Other versions">` +
		(older
			? pageLink(older.slug, pageHref, `← ${escapeHtml(older.label)}`, "older")
			: "<span></span>") +
		pageLink("release-notes", pageHref, "Every version", "all") +
		(newer
			? pageLink(newer.slug, pageHref, `${escapeHtml(newer.label)} →`, "newer")
			: "<span></span>") +
		`</nav>`
	);
}
