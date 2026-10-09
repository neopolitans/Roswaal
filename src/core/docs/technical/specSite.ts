/**
 * The technical specification as a site of its own: spec.roswaal.app.
 *
 * The same pages the Docs panel shows (`technicalSections`), drawn by the same
 * block renderer (`renderBlocksHtml`), with chrome and addresses of their own:
 * a chapter per folder, `/visual-grammar/`, a sidebar of chapters rather than
 * the docs' five hundred pages, a search over the specification alone, and a
 * stylesheet a fraction of the editor's. Nothing here knows about the editor,
 * so a reader who wants the specification downloads the specification.
 *
 * Pure, and in core, so a test can render it without a browser or a build;
 * `scripts/build-spec.mjs` writes it to disk.
 */

import {
	escapeHtml,
	headingId,
	type RenderedFile,
	type RenderOptions,
	renderBlocksHtml,
} from "../html.js";
import { blockText, stripMarkup } from "../markup.js";
import type { Block, DocPage, DocSection } from "../site.js";
import { DRAFT_DETAIL, SPEC_DETAILS, specStatusLabel } from "./spec.js";

export interface SpecSiteOptions {
	/** The specification's sections, as `technicalSections` builds them. */
	sections: DocSection[];
	/** How blocks are drawn: highlighting, node pictures, the registry. */
	render: RenderOptions;
	/** Where the rest of the documentation lives, for links out of the spec. */
	docsBase: string;
	/** The published address of this tree's root, for canonical links. */
	canonicalBase: string;
	/** The draft this tree is, and the frozen drafts there are to switch to. */
	draft: string;
	drafts: readonly string[];
	/** Whether this tree is the latest draft, served at the root, or a frozen copy. */
	latest: boolean;
	/** The Roswaal release it was built from. */
	version: string;
	/** Where "Try Roswaal" goes: the editor in the browser. */
	tryHref: string;
	/** Keep it out of search indexes: the canary's preview. */
	noindex?: boolean;
}

/** A page's folder within the tree: `` for the front page, `visual-grammar/` for a chapter. */
export function specPath(slug: string): string {
	if (slug === "technical") return "";
	return `${slug.replace(/^technical\//, "")}/`;
}

/** `../` enough times to climb from a page's folder to the tree's root. */
function upFrom(path: string): string {
	return "../".repeat(path.split("/").filter(Boolean).length);
}

/** One entry of the search index: a page and its sections, as plain text. */
export interface SpecSearchEntry {
	path: string;
	title: string;
	part: string;
	summary: string;
	headings: { id: string; text: string }[];
	text: string;
}

export function renderSpecSite(options: SpecSiteOptions): RenderedFile[] {
	const pages = options.sections.flatMap((section) =>
		section.pages.map((page) => ({ page, part: section.title })),
	);
	const files: RenderedFile[] = pages.map(({ page }, i) => ({
		path: `${specPath(page.slug)}index.html`,
		contents: renderSpecPage(page, i, pages, options),
	}));

	const index: SpecSearchEntry[] = pages.map(({ page, part }) => ({
		path: specPath(page.slug),
		title: page.title,
		part,
		summary: stripMarkup(page.summary),
		headings: page.blocks
			.filter((b): b is Block & { t: "h" } => b.t === "h" && b.level === 2)
			.map((h) => ({ id: headingId(h.text), text: stripMarkup(h.text) })),
		text: page.blocks.map(blockText).join(" ").replace(/\s+/g, " ").slice(0, 40000),
	}));
	files.push({ path: "search.json", contents: JSON.stringify(index) });
	return files;
}

function renderSpecPage(
	page: DocPage,
	at: number,
	pages: { page: DocPage; part: string }[],
	options: SpecSiteOptions,
): string {
	const path = specPath(page.slug);
	const up = upFrom(path);
	const part = pages[at].part;

	// A link from this page: within the tree, relative, so a frozen copy at
	// `/0.1/` links to its own pages; out of it, to the published docs.
	const link = (slug: string): string => {
		const [bare, hash] = slug.split("#");
		if (bare === "technical" || bare.startsWith("technical/")) {
			return `${up}${specPath(bare)}${hash ? `#${hash}` : ""}` || "./";
		}
		return `${options.docsBase}${bare}.html${hash ? `#${hash}` : ""}`;
	};

	const body = renderBlocksHtml(page.blocks, options.render, link);
	const reqs = page.blocks.filter((b): b is Block & { t: "req" } => b.t === "req");
	const met = reqs.filter((r) => r.roswaal === "meets").length;
	const tally =
		reqs.length > 0
			? `<a class="spec-tally" href="${link("technical/requirements")}">${reqs.length} requirement${reqs.length === 1 ? "" : "s"} · Roswaal meets ${met}</a>`
			: "";
	const status = page.spec
		? `<p class="spec-status">` +
			`<span class="badge ${page.spec.status}" title="${escapeHtml(SPEC_DETAILS[page.spec.status])}">${escapeHtml(specStatusLabel(page.spec))}</span>` +
			`<span class="badge draft" title="${escapeHtml(DRAFT_DETAIL)}">Draft ${escapeHtml(page.spec.draft)}</span>` +
			tally +
			"</p>"
		: "";
	const prev = pages[at - 1]?.page;
	const next = pages[at + 1]?.page;
	const neighbour = (to: DocPage | undefined, which: "prev" | "next") =>
		to
			? `<a class="spec-neighbour ${which}" href="${link(to.slug)}">` +
				`<span class="which">${which === "prev" ? "Back" : "Next"}</span>` +
				`<span class="title">${escapeHtml(to.title)}</span></a>`
			: "<span></span>";
	const canonical = `${options.canonicalBase}${path}`;
	const title =
		page.slug === "technical" ? page.title : `${page.title} · Roswaal technical specification`;

	return `<!doctype html>
<html lang="en" data-root="${up || "./"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${options.noindex ? `<meta name="robots" content="noindex">\n` : ""}<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(stripMarkup(page.blurb ?? page.summary))}">
<link rel="canonical" href="${escapeHtml(canonical)}">
${options.render.logo ? `<link rel="icon" type="image/svg+xml" href="${escapeHtml(options.render.logo.icon)}">\n` : ""}<link rel="stylesheet" href="${up}spec.css">
<script src="${up}spec.js" defer></script>
</head>
<body>
<a class="spec-skip" href="#main">Skip to the text</a>
<header class="spec-bar">
<a class="spec-home" href="${up || "./"}">${options.render.logo?.mark ?? ""}<span class="name">Roswaal</span><span class="what">Technical specification</span></a>
${draftSwitcher(options, up)}
<div class="spec-search" role="search"><input id="spec-search" type="search" placeholder="Search the specification" aria-label="Search the specification" autocomplete="off"><div id="spec-results" class="spec-results" hidden></div></div>
<a class="spec-try" href="${escapeHtml(options.tryHref)}">Try Roswaal</a>
</header>
<div class="spec-body">
<nav class="spec-nav" aria-label="Chapters">
<details class="spec-nav-fold" open><summary>Chapters</summary>
${navHtml(pages, page, link)}
</details>
</nav>
<main id="main" class="spec-main">
<article class="spec-article">
<p class="spec-part">${escapeHtml(part)}</p>
<h1>${escapeHtml(page.title)}</h1>
<p class="spec-summary">${escapeHtml(stripMarkup(page.summary))}</p>
${status}
${body}
<nav class="spec-neighbours" aria-label="Chapters either side">${neighbour(prev, "prev")}${neighbour(next, "next")}</nav>
</article>
</main>
</div>
<footer class="spec-foot">
<p>Draft ${escapeHtml(options.draft)}${options.latest ? ", the latest" : ", frozen as published"}. Built from Roswaal ${escapeHtml(options.version)}, whose source the tables are generated from. <a href="https://github.com/neopolitans/Roswaal/issues/new?title=${encodeURIComponent(`Specification: ${page.title}`)}">Suggest a change</a>.</p>
</footer>
</body>
</html>
`;
}

/** The chapters, by part; the chapter being read opens to its sections. */
function navHtml(
	pages: { page: DocPage; part: string }[],
	current: DocPage,
	link: (slug: string) => string,
): string {
	const parts: string[] = [];
	let open = "";
	let items: string[] = [];
	const flush = () => {
		if (open)
			parts.push(`<p class="spec-nav-part">${escapeHtml(open)}</p><ol>${items.join("")}</ol>`);
		items = [];
	};
	for (const { page, part } of pages) {
		if (part !== open) {
			flush();
			open = part;
		}
		const on = page.slug === current.slug;
		const sections = on
			? page.blocks
					.filter((b): b is Block & { t: "h" } => b.t === "h" && b.level === 2)
					.map(
						(h) =>
							`<li><a href="#${headingId(h.text)}">${escapeHtml(stripMarkup(h.text))}</a></li>`,
					)
					.join("")
			: "";
		items.push(
			`<li${on ? ` class="on"` : ""}><a href="${link(page.slug)}"${on ? ` aria-current="page"` : ""}>${escapeHtml(page.title)}</a>` +
				(sections ? `<ol class="spec-nav-sections">${sections}</ol>` : "") +
				"</li>",
		);
	}
	flush();
	return parts.join("\n");
}

/** Latest, and each frozen draft, as links to the same tree's root. */
function draftSwitcher(options: SpecSiteOptions, up: string): string {
	// From a frozen copy, the latest is one folder further up.
	const toRoot = options.latest ? up : `${up}../`;
	const links = [
		`<li><a href="${toRoot || "./"}"${options.latest ? ` aria-current="true"` : ""}>Latest</a></li>`,
		...options.drafts.map(
			(draft) =>
				`<li><a href="${toRoot}${escapeHtml(draft)}/"${!options.latest && draft === options.draft ? ` aria-current="true"` : ""}>Draft ${escapeHtml(draft)}</a></li>`,
		),
	].join("");
	return (
		`<details class="spec-drafts"><summary>Draft ${escapeHtml(options.draft)}` +
		`${options.latest ? "" : " · frozen"}</summary><ul>${links}</ul></details>`
	);
}
