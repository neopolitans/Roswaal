/**
 * The page model as HTML, for the static site.
 *
 * The third renderer of the same tree. It exists so the documentation can be
 * published without a daemon — read from a folder, served from anywhere, opened
 * from disk — and it produces markup the editor's own stylesheet already knows
 * how to style, so the site and the in-app window look the same by construction
 * rather than by two people keeping two designs in step.
 *
 * **No JavaScript is required to read a page.** Highlighting is baked in at
 * build time; the only script on the site is the search box, and the nav works
 * without it.
 *
 * `src/core` has no Node APIs, so this returns strings and the build script
 * writes the files. The highlighter is passed in rather than imported for the
 * same reason: it lives in `src/app` and depends on CodeMirror.
 */

import type { Block, DocPage, DocSection, DocSite } from "./site.js";
import type { Registry } from "../nodes/index.js";
import { allPages, parseInline, TAG_LABELS } from "./site.js";
import { graphSvg, previewSvg, type PreviewOptions } from "./preview.js";

export interface RenderOptions {
	/** Turns Luau into HTML. Returns escaped text when absent. */
	highlight?: (code: string) => string;
	/**
	 * The colour a pin is drawn in on the canvas.
	 *
	 * Passed in rather than imported: the palette lives in `src/app`, and this
	 * file is in core. Without it the swatches render as invisible empty spans,
	 * which is how the first build shipped them.
	 */
	pinColor?: (type: string | undefined, kind: "exec" | "data") => string;
	/**
	 * Canvas geometry and colours for node previews, passed in for the same
	 * reason. Without it the previews are left out rather than drawn wrong — a
	 * page with no picture is honest, a picture at invented sizes is not.
	 */
	preview?: PreviewOptions;
	/**
	 * The mark, in the header and in the tab, passed in for the same reason —
	 * the artwork lives in `src/app/logo.tsx`. Absent, the header falls back to
	 * the name in text, which is the honest degradation: a header that says
	 * what this is beats a gap where a picture should be.
	 */
	logo?: LogoOptions;
	/**
	 * The node registry, needed to draw a graph: a graph stores node ids and
	 * the definitions behind them are what say how each one looks.
	 */
	registry?: Registry;
	/** Shown in the header, next to the name. */
	version: string;
}

export interface LogoOptions {
	/** SVG markup, inlined into the header. Inherits the header's colour. */
	mark: string;
	/** A `data:` URI for `<link rel="icon">`, which cannot inherit anything. */
	icon: string;
}

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

/** `../` enough times to climb out of a nested page's folder. */
function upTo(slug: string): string {
	return "../".repeat(slug.split("/").length - 1);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function inline(text: string): string {
	return parseInline(text)
		.map((run) => {
			const body = escapeHtml(run.text);
			switch (run.t) {
				case "text": return body;
				case "code": return `<code>${body}</code>`;
				case "strong": return `<strong>${body}</strong>`;
				case "em": return `<em>${body}</em>`;
				case "link":
					return `<a href="${escapeHtml(run.href)}" rel="noreferrer noopener">${body}</a>`;
			}
		})
		.join("");
}

function swatchStyle(
	pin: { type?: string; kind: "exec" | "data" }, options: RenderOptions,
): string {
	const colour = options.pinColor?.(pin.type, pin.kind);
	return colour ? ` style="background:${escapeHtml(colour)}"` : "";
}

/** Shared with the in-app outline, so an anchor means the same in both. */
export function headingId(text: string): string {
	return `h-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function renderBlock(block: Block, options: RenderOptions): string {
	switch (block.t) {
		case "h":
			return block.level === 2
				? `<h2 id="${headingId(block.text)}">${inline(block.text)}` +
					(block.aside ? `<span class="aside">${escapeHtml(block.aside)}</span>` : "") +
					`</h2>`
				: `<h3>${inline(block.text)}</h3>`;
		case "p":
			return `<p>${inline(block.text)}</p>`;
		case "ul":
			return `<ul>${block.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
		case "ol":
			return `<ol>${block.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
		case "code": {
			const body =
				block.lang === "luau" && options.highlight
					? options.highlight(block.text)
					: escapeHtml(block.text);
			// The copy button needs a script; without one the code is still
			// selectable, so the button is only rendered by the search-enabled
			// build. Here the language label stands alone.
			return (
				`<div class="docs-code"><div class="docs-code-head">` +
				`<span class="lang">${escapeHtml(block.lang)}</span>` +
				`<button class="copy" data-copy>Copy</button>` +
				`</div><pre>${body}</pre></div>`
			);
		}
		case "table": {
			// No `head` means no `<thead>` at all, rather than an empty one: a
			// blank header row still draws a rule and still takes the space.
			const head = block.head
				? `<thead><tr>${block.head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`
				: "";
			const rows = block.rows
				.map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
				.join("");
			const bare = block.head ? "" : " bare";
			return `<div class="docs-table${bare}"><table>${head}<tbody>${rows}</tbody></table></div>`;
		}
		case "tags":
			return `<p class="docs-tags">${block.tags
				.map((tag) => `<span class="docs-tag ${tag}">${escapeHtml(TAG_LABELS[tag])}</span>`)
				.join("")}</p>`;
		case "note":
			return `<div class="docs-note ${block.kind}">${inline(block.text)}</div>`;
		case "pins":
			return renderPins(block, options);
		case "graph": {
			// No geometry passed in means no picture, rather than one at invented
			// sizes — the same bargain the node previews make.
			if (!options.preview || !options.registry) return "";
			const svg = graphSvg(block.script, options.registry, options.preview);
			if (svg === "") return "";
			const caption = block.caption ? `<figcaption>${inline(block.caption)}</figcaption>` : "";
			return `<figure class="docs-preview graph"><div class="row">${svg}</div>${caption}</figure>`;
		}
		case "preview": {
			if (!options.preview) return "";
			const svgs = block.nodes
				.map((node) => `<div class="node-preview-frame">${previewSvg(node, options.preview!)}</div>`)
				.join("");
			const caption = block.caption
				? `<figcaption>${inline(block.caption)}</figcaption>`
				: "";
			return `<figure class="docs-preview"><div class="row">${svgs}</div>${caption}</figure>`;
		}
	}
}

function renderPins(block: Block & { t: "pins" }, options: RenderOptions): string {
	const rows = block.pins
		.map((pin) => {
			const badges = [
				pin.required ? `<span class="badge warn">must be wired</span>` : "",
				pin.literalOnly && !pin.code ? `<span class="badge">literal</span>` : "",
				pin.code ? `<span class="badge">code editor</span>` : "",
				pin.splitModes.length > 0 ? `<span class="badge">splittable</span>` : "",
			].join("");

			const detail =
				pin.description || pin.splitModes.length > 0
					? `<div class="detail">${escapeHtml(pin.description ?? "")}` +
						(pin.splitModes.length > 0
							? ` Splits into ${escapeHtml(pin.splitModes.join(", or "))}.`
							: "") +
						`</div>`
					: "";

			return (
				`<li><div class="sig">` +
				`<span class="docs-swatch ${pin.kind}"${swatchStyle(pin, options)}></span>` +
				`<span class="name">${escapeHtml(pin.name || pin.id)}</span>` +
				`<span class="sep">:</span>` +
				`<span class="type">${escapeHtml(pin.kind === "exec" ? "execution" : pin.type ?? "any")}</span>` +
				(pin.default !== undefined ? `<span class="def">= <code>${escapeHtml(pin.default)}</code></span>` : "") +
				badges +
				`</div>${detail}</li>`
			);
		})
		.join("");

	return `<h3>${escapeHtml(block.title)}</h3><ul class="docs-pins">${rows}</ul>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function renderNav(site: DocSite, current: DocPage): string {
	const up = upTo(current.slug);
	const groups = new Map<string, DocSection[]>();
	for (const section of site.sections) {
		const list = groups.get(section.group) ?? [];
		list.push(section);
		groups.set(section.group, list);
	}

	const html = [...groups]
		.map(([group, sections]) => {
			const inner = sections
				.map((section) => {
					// A section holding one page is that page: a link, not a drawer.
					if (section.pages.length === 1) {
						const only = section.pages[0];
						return (
							`<a class="docs-section-head solo${only.slug === current.slug ? " on" : ""}" ` +
							`href="${up}${pagePath(only.slug)}">${escapeHtml(section.title)}</a>`
						);
					}

					// Open the section the reader is in; everything else is collapsed,
					// because a flat list of every node is not a table of contents.
					const isHere = section.pages.some((p) => p.slug === current.slug);
					const links = section.pages
						.map(
							(p) =>
								`<a class="docs-link${p.slug === current.slug ? " on" : ""}" ` +
								`href="${up}${pagePath(p.slug)}">${escapeHtml(p.title)}</a>`,
						)
						.join("");
					return (
						`<details class="docs-section"${isHere ? " open" : ""}>` +
						`<summary class="docs-section-head">${escapeHtml(section.title)}` +
						`<span class="count">${section.pages.length}</span></summary>` +
						`<div class="docs-pages">${links}</div></details>`
					);
				})
				.join("");
			return `<div class="docs-group"><div class="docs-group-head">${escapeHtml(group)}</div>${inner}</div>`;
		})
		.join("");

	return `<nav class="docs-nav"><input class="search" id="q" placeholder="Search the docs" autocomplete="off">
<div class="docs-results" id="results" hidden></div><div id="tree">${html}</div></nav>`;
}

function renderOutline(page: DocPage): string {
	const headings = page.blocks.filter((b): b is Block & { t: "h" } => b.t === "h" && b.level === 2);
	if (headings.length < 2) return `<aside class="docs-toc"></aside>`;

	const links = headings
		.map((h) => `<a class="docs-toc-link" href="#${headingId(h.text)}">${escapeHtml(h.text)}</a>`)
		.join("");
	return `<aside class="docs-toc"><div class="docs-toc-head">On this page</div>${links}</aside>`;
}

export function renderPage(site: DocSite, page: DocPage, options: RenderOptions): string {
	const up = upTo(page.slug);
	const body = page.blocks.map((b) => renderBlock(b, options)).join("\n");

	return `<!doctype html>
<html lang="en" data-slug="${escapeHtml(page.slug)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · Roswaal docs</title>
<meta name="description" content="${escapeHtml(page.summary)}">
${options.logo ? `<link rel="icon" type="image/svg+xml" href="${escapeHtml(options.logo.icon)}">\n` : ""}<link rel="stylesheet" href="${up}theme.css">
</head>
<body class="docs-static">
<div class="docs-page">
<header class="docs-page-head">
<a class="logo" href="${up}index.html">${options.logo?.mark ?? "Roswaal "}Docs<span class="version">${escapeHtml(options.version)}</span></a>
</header>
<div class="docs-body">
${renderNav(site, page)}
<article class="docs-content">
<div class="docs-article${page.narrow ? " narrow" : ""}">
<header class="docs-title">
<h1>${escapeHtml(page.title)}${page.custom ? `<span class="badge">from a node pack</span>` : ""}</h1>
<p class="summary">${escapeHtml(page.summary)}</p>
</header>
${body}
</div>
</article>
${renderOutline(page)}
</div>
</div>
<script src="${up}docs.js" defer></script>
</body>
</html>
`;
}

export interface RenderedFile {
	path: string;
	contents: string;
}

/** Every page, plus the search index the box on each page reads. */
export function renderSite(site: DocSite, options: RenderOptions): RenderedFile[] {
	const files: RenderedFile[] = allPages(site).map((page) => ({
		path: pagePath(page.slug),
		contents: renderPage(site, page, options),
	}));

	// A copy of the first page as index.html, so opening the folder works.
	const home = allPages(site)[0];
	files.push({ path: "index.html", contents: renderPage(site, home, options) });

	return files;
}
