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
import { allPages, isPageLink, parseInline, TAG_LABELS } from "./site.js";
import { graphSvg, previewSvg, type PreviewOptions } from "./preview.js";
import { FEEDBACK_REPOSITORY, SOURCE_REPOSITORY } from "./links.js";
import {
	controlKey, legendOf, TOOLBAR_HINT, toolbarHtml, type ToolbarArt,
} from "./toolbars.js";
import { layoutHtml, listedRegions } from "./layouts.js";
import { RUNTIME_LABEL, RUNTIME_SUMMARY } from "../nodes/runtimes.js";
import { REVIEW_DETAILS, REVIEW_LABELS, reviewLine, type Review } from "./reviews.js";
import { mapFigure, mapFigureHtml } from "./mapFigure.js";

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
	/**
	 * The icon paths and the mark, for drawing a toolbar. Passed in for the
	 * same reason as the rest — the artwork is in `src/app`.
	 *
	 * Without it the legend still renders and still names every control, which
	 * is the honest degradation: the page's job is telling somebody which
	 * button opens Node Design, and the words do that without the picture.
	 */
	toolbars?: Omit<ToolbarArt, "version">;
	/**
	 * The `preview` mark, beside the header's link into the browser build.
	 *
	 * Markup rather than a flag, and passed in for the same reason as the rest:
	 * the word and its caveat live in `src/app/previewBuild.tsx`, which is where
	 * the rule is written down. Absent, the link is still a link — this site is
	 * readable with nothing passed in at all — but the build passes it, and
	 * `tests/previewbuild.test.ts` holds it there.
	 */
	previewChip?: string;
	/**
	 * The canary's warning, rendered above the header on every page.
	 *
	 * Markup, and passed in for the same reason as the chip. Absent on a stable
	 * build, which is the ordinary case — this site has had no banner for its
	 * whole life and should not grow one by default.
	 */
	canaryBanner?: string;
	/**
	 * Keep this build out of search indexes.
	 *
	 * The canary carries a copy of every page on the real site, under the same
	 * titles. Indexed, it competes with the documentation it is a draft of.
	 *
	 * A meta tag rather than a `robots.txt`, and that is not a preference:
	 * GitHub Pages cannot set an `X-Robots-Tag` header, a project site cannot
	 * host a `robots.txt` at all — crawlers read one only from the host root —
	 * and a `Disallow` would be actively worse, because a page nobody may crawl
	 * is a page whose `noindex` is never read.
	 */
	noindex?: boolean;
	/** Shown in the header, next to the name. */
	version: string;
	/**
	 * What the shared assets are stamped with, when not the version: a hash of
	 * their contents, from the build. See `stamp`.
	 */
	assetStamp?: string;
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

/** `up` climbs from the page being written to the site root, for page links. */
function inline(text: string, up = ""): string {
	return parseInline(text)
		.map((run) => {
			const body = escapeHtml(run.text);
			switch (run.t) {
				case "text": return body;
				case "code": return `<code>${body}</code>`;
				case "strong": return `<strong>${body}</strong>`;
				case "em": return `<em>${body}</em>`;
				case "link":
					// Another page of these docs is a file beside this one; written
					// as its bare slug, it resolved to an address that did not exist.
					return isPageLink(run.href)
						? `<a href="${escapeHtml(up + pagePath(run.href))}">${body}</a>`
						: `<a href="${escapeHtml(run.href)}" rel="noreferrer noopener">${body}</a>`;
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

function renderBlock(block: Block, options: RenderOptions, up = ""): string {
	switch (block.t) {
		case "h": {
			const aside = block.aside ? `<span class="aside">${escapeHtml(block.aside)}</span>` : "";
			const badge = block.badge ? `<span class="badge latest">${escapeHtml(block.badge)}</span>` : "";
			return block.level === 2
				? `<h2 id="${headingId(block.text)}">${inline(block.text, up)}${badge}${aside}</h2>`
				: `<h${block.level}>${inline(block.text, up)}${badge}${aside}</h${block.level}>`;
		}
		case "p":
			return `<p>${inline(block.text, up)}</p>`;
		case "ul":
			return `<ul>${block.items.map((i) => `<li>${inline(i, up)}</li>`).join("")}</ul>`;
		case "ol":
			return `<ol>${block.items.map((i) => `<li>${inline(i, up)}</li>`).join("")}</ol>`;
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
				.map((row) => `<tr>${row.map((c) => `<td>${inline(c, up)}</td>`).join("")}</tr>`)
				.join("");
			const bare = block.head ? "" : " bare";
			return `<div class="docs-table${bare}"><table>${head}<tbody>${rows}</tbody></table></div>`;
		}
		case "tags":
			// `tag-` prefixed, because a bare modifier class is a collision waiting
			// to happen in a stylesheet this size -- and it happened: `.docs` is
			// the documentation *panel*, so a Docs tag came out as a full-width
			// bordered box on its own line.
			return `<p class="docs-tags">${block.tags
				.map((tag) => `<span class="docs-tag tag-${tag}">${escapeHtml(TAG_LABELS[tag])}</span>`)
				.join("")}</p>`;
		case "note": {
			const items = block.items
				? `<ul>${block.items.map((i) => `<li>${inline(i, up)}</li>`).join("")}</ul>`
				: "";
			return `<div class="docs-note ${block.kind}">${inline(block.text, up)}${items}</div>`;
		}
		case "pins":
			return renderPins(block, options);
		case "graph": {
			// No geometry passed in means no picture, rather than one at invented
			// sizes — the same bargain the node previews make.
			if (!options.preview || !options.registry) return "";
			const svg = graphSvg(block.script, options.registry, options.preview);
			if (svg === "") return "";
			const caption = block.caption ? `<figcaption>${inline(block.caption, up)}</figcaption>` : "";
			// What the graph declares, to the left of it. Absent on a graph
			// that declares nothing, which is most of them.
			const panel = block.panel && options.toolbars
				? `<div class="graph-declares">` +
					`${toolbarHtml(block.panel, { ...options.toolbars, version: options.version })}</div>`
				: "";
			// The viewport clips; the script that makes it pan and zoom is an
			// enhancement, and without it this is still a readable picture.
			return `<figure class="docs-preview graph${panel ? " with-panel" : ""}">` +
				`${panel}<div class="graph-viewport">${svg}</div>${caption}</figure>`;
		}
		case "toggle": {
			// `data-pref` is what the script reads; the checkbox is checked by that
			// script rather than here, because the answer lives in the reader's own
			// storage and this markup is the same for everybody.
			return `<label class="docs-toggle"><input type="checkbox"` +
				` data-pref="${escapeHtml(block.pref)}">` +
				`<span class="docs-toggle-label">${inline(block.label, up)}</span>` +
				`${block.hint ? `<span class="docs-toggle-hint">${inline(block.hint, up)}</span>` : ""}` +
				`</label>`;
		}
		case "nodemap": {
			const caption = block.caption ? `<figcaption>${inline(block.caption, up)}</figcaption>` : "";
			// One string, built in core, for the reason the toolbars are: the
			// panel is chrome, and two hand-written copies of chrome drift.
			return `<figure class="docs-map">` +
				`<div class="docs-map-body">${mapFigureHtml(mapFigure(block.map))}</div>` +
				`${caption}</figure>`;
		}
		case "preview": {
			if (!options.preview) return "";
			const svgs = block.nodes
				.map((node) => `<div class="node-preview-frame">${previewSvg(node, options.preview!)}</div>`)
				.join("");
			const caption = block.caption
				? `<figcaption>${inline(block.caption, up)}</figcaption>`
				: "";
			return `<figure class="docs-preview"><div class="row">${svgs}</div>${caption}</figure>`;
		}
		case "layout": {
			// A toolbar's figure, holding a window rather than a bar: the same
			// legend markup and `data-control` pairing, so the one linking script
			// lights both. Numbered, because the picture numbers its regions.
			const art = options.toolbars;
			const picture = art ? layoutHtml(block.layout, art) : "";
			const legend = listedRegions(block.layout)
				.map(
					(region, i) =>
						`<li data-control="${escapeHtml(controlKey(region.name))}">` +
						`<span class="docs-bar-name"><span class="docs-layout-num">${i + 1}</span>${escapeHtml(region.name)}` +
						`${region.where ? `<span class="docs-bar-where">${escapeHtml(region.where)}</span>` : ""}` +
						`</span>${region.what ? `<span class="docs-bar-what">${inline(region.what, up)}</span>` : ""}</li>`,
				)
				.join("");
			const caption = block.caption ? `<figcaption>${inline(block.caption, up)}</figcaption>` : "";
			const hint = block.hint ? `<p class="docs-bar-hint">${escapeHtml(TOOLBAR_HINT)}</p>` : "";
			return (
				`<figure class="docs-bar docs-layout"><div class="docs-bar-picture">${picture}</div>` +
				`<p class="docs-bar-summary">${inline(block.layout.summary, up)}</p>${hint}` +
				`<ol class="docs-bar-legend docs-layout-legend">${legend}</ol>${caption}</figure>`
			);
		}
		case "toolbar": {
			// The picture comes from core so it is byte-identical to the panel's;
			// the legend is rendered here because its prose carries page links,
			// and a page link is resolved differently in each renderer.
			const art = options.toolbars;
			const picture = art ? toolbarHtml(block.bar, { ...art, version: options.version }) : "";
			const legend = legendOf(block.bar)
				.map(
					(item) =>
						`<li data-control="${escapeHtml(controlKey(item.name))}">` +
						`<span class="docs-bar-name">${escapeHtml(item.name)}` +
						`${item.where ? `<span class="docs-bar-where">${escapeHtml(item.where)}</span>` : ""}` +
						`</span>${item.what ? `<span class="docs-bar-what">${inline(item.what, up)}</span>` : ""}</li>`,
				)
				.join("");
			const caption = block.caption ? `<figcaption>${inline(block.caption, up)}</figcaption>` : "";
			const hint = block.hint ? `<p class="docs-bar-hint">${escapeHtml(TOOLBAR_HINT)}</p>` : "";
			return (
				`<figure class="docs-bar"><div class="docs-bar-picture">${picture}</div>` +
				`<p class="docs-bar-summary">${inline(block.bar.summary, up)}</p>${hint}` +
				`<ul class="docs-bar-legend">${legend}</ul>${caption}</figure>`
			);
		}
		case "tabs": {
			// Radios and labels, so the switch works with no script at all — the
			// promise the whole static site makes. Every panel is in the page, so
			// the text is readable and findable whichever one is showing.
			const name = `tabs-${block.tabs.map((t) => t.id).join("-")}`;
			const inputs = block.tabs
				.map(
					(tab, i) =>
						`<input type="radio" name="${escapeHtml(name)}" id="${escapeHtml(`${name}-${tab.id}`)}"` +
						(tab.device ? ` data-device="${escapeHtml(tab.device.join(" "))}"` : "") +
						`${i === 0 ? " checked" : ""}>`,
				)
				.join("");
			const labels = block.tabs
				.map(
					(tab) =>
						`<label for="${escapeHtml(`${name}-${tab.id}`)}">${escapeHtml(tab.title)}</label>`,
				)
				.join("");
			const panels = block.tabs
				.map(
					(tab) =>
						`<section class="docs-tab-panel">` +
						tab.blocks.map((b) => renderBlock(b, options, up)).join("\n") +
						`</section>`,
				)
				.join("");
			const label = block.label ? `<div class="docs-tabs-label">${inline(block.label, up)}</div>` : "";
			return (
				`<div class="docs-tabs">${label}${inputs}` +
				`<div class="docs-tab-bar" role="tablist">${labels}</div>` +
				`<div class="docs-tab-panels">${panels}</div></div>`
			);
		}
		case "details": {
			// A plain `<details>`: it opens and closes with no script at all.
			const aside = block.aside ? `<span class="aside">${escapeHtml(block.aside)}</span>` : "";
			const inner = block.blocks.map((b) => renderBlock(b, options, up)).join("\n");
			return (
				`<details class="docs-details"${block.open ? " open" : ""}` +
				`${block.prerelease ? " data-prerelease" : ""}>` +
				`<summary>${inline(block.summary, up)}${aside}</summary>\n` +
				`${inner}\n</details>`
			);
		}
	}
}

/** Past this many, a pin's values are counted rather than listed. */
const NAMEABLE_OPTIONS = 8;

function renderPins(block: Block & { t: "pins" }, options: RenderOptions): string {
	const rows = block.pins
		.map((pin) => {
			const badges = [
				pin.required ? `<span class="badge warn">must be wired</span>` : "",
				pin.literalOnly && !pin.code ? `<span class="badge">literal</span>` : "",
				pin.code ? `<span class="badge">code editor</span>` : "",
				pin.splitModes.length > 0 ? `<span class="badge">splittable</span>` : "",
				pin.options && pin.options.length > 0 ? `<span class="badge">from a list</span>` : "",
			].join("");

			/**
			 * What a pin with a list of values offers.
			 *
			 * Named when there are few enough to read — three axes is a sentence —
			 * and counted when there are not. Six hundred and twenty-five Instance
			 * classes printed into a reference page is a page nobody can use, and
			 * the number is the useful fact anyway: it says "all of them".
			 *
			 * Either way it says the list is not a gate, because that is the thing
			 * a reader would otherwise have to find out by trying.
			 */
			const choices = !pin.options || pin.options.length === 0
				? ""
				: pin.options.length <= NAMEABLE_OPTIONS
					? ` One of ${escapeHtml(pin.options.join(", "))} — or anything else, typed in.`
					: ` Offers ${pin.options.length} values to pick from, and takes anything else typed in.`;

			const detail =
				pin.description || pin.splitModes.length > 0 || choices
					? `<div class="detail">${escapeHtml(pin.description ?? "")}` +
						(pin.splitModes.length > 0
							? ` Splits into ${escapeHtml(pin.splitModes.join(", or "))}.`
							: "") +
						choices +
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

	return `<nav class="docs-nav"><input class="search" id="q" placeholder="Search the docs (Ctrl+K)" autocomplete="off">
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

/**
 * Where a suggested edit goes from the published site.
 *
 * The editor's version opens the page for editing and hands back its blocks;
 * this one cannot — there is no bundle here and no daemon behind it — so it
 * does the half that still works: an issue with the page already named.
 */
function proposeHref(page: DocPage): string {
	const body = `Page: ${page.title} (\`${page.slug}\`)\n\nWhat should it say instead?\n`;
	return (
		`${FEEDBACK_REPOSITORY}/issues/new` +
		`?title=${encodeURIComponent(`Docs: ${page.title}`)}&body=${encodeURIComponent(body)}`
	);
}

/**
 * One of the editor's glyphs, for the site's own chrome.
 *
 * Off `toolbars`, which is already here so a drawn bar can be drawn — the same
 * paths, so the gear in this header and the gear in the picture of this header
 * are one shape. Nothing when the art was not passed: a button with no glyph
 * would be a button nobody can see, and the page reads without it.
 */
function chromeIcon(name: string, options: RenderOptions): string {
	const art = options.toolbars;
	const path = art?.paths[name];
	if (art === undefined || path === undefined) return "";
	return (
		`<svg class="icon" viewBox="${escapeHtml(art.viewBox)}" width="16" height="16"` +
		` aria-hidden="true"><path d="${escapeHtml(path)}" fill="currentColor"/></svg>`
	);
}

/**
 * A version stamp on the site's two shared assets.
 *
 * `docs.js` and `theme.css` keep the same names across every release, which is
 * ordinarily fine and is not fine on a static host whose cache headers cannot
 * be set. GitHub Pages serves them with `max-age=600`, so for ten minutes after
 * a deploy a returning reader gets the previous script against the current
 * markup — which is how a fix for a broken viewer looked exactly like the
 * breakage it fixed.
 *
 * A query string is enough: it changes the URL, so new bytes are a cache
 * miss. The build stamps with a hash of the assets rather than the version,
 * because a version is deployed more than once: the canary shipped three
 * builds as 0.71.0, and Safari paired the third one's pages with the first
 * one's stylesheet -- a label the old sheet did not hide took the nav's
 * column and pushed the whole grid one track to the right. The editor's own
 * bundles solve this with a content hash in the filename and need nothing here.
 */
function stamp(options: RenderOptions): string {
	const key = options.assetStamp ?? options.version;
	return key ? `?v=${encodeURIComponent(key)}` : "";
}

/** Pending, Reviewed or Verified, with what that means on hover. */
function reviewBadge(review: Review): string {
	return (
		`<span class="badge review ${review.status}" title="${escapeHtml(REVIEW_DETAILS[review.status])}">` +
		`${escapeHtml(REVIEW_LABELS[review.status])}</span>`
	);
}

/**
 * The runtime a node needs, as a tag beside its title.
 *
 * The same word and the same colour the editor's node menu uses, so the badge
 * on a row there and the badge on the page here are recognisably one thing.
 * Nothing on a guide, which is about an idea rather than about something that
 * runs.
 */
function runtimeBadge(page: DocPage): string {
	if (!page.runtime) return "";
	const own =
		`<span class="badge runtime ${escapeHtml(page.runtime)}"` +
		` title="${escapeHtml(RUNTIME_SUMMARY[page.runtime])}">` +
		`${escapeHtml(RUNTIME_LABEL[page.runtime])}</span>`;

	// Two tags rather than one averaged one. A node that is Roblox's and that
	// Lune implements is not "Luau": that would say the base language has it.
	//
	// The second tag is the **require string**, not the runtime's name. The
	// specifier is what has to be declared for this node to work, and it is the
	// text that goes in the field to declare it — "Lune" in front of it would
	// be the part carrying no information.
	if (page.runtimeVia === undefined) return own;
	return own +
		`<span class="badge runtime lune"` +
		` title="Lune has this through ${escapeHtml(page.runtimeVia)}, which the graph must require">` +
		`${escapeHtml(page.runtimeVia)}</span>`;
}

export function renderPage(site: DocSite, page: DocPage, options: RenderOptions): string {
	const up = upTo(page.slug);
	const body = page.blocks.map((b) => renderBlock(b, options, up)).join("\n");

	return `<!doctype html>
<html lang="en" data-slug="${escapeHtml(page.slug)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${options.noindex ? `<meta name="robots" content="noindex">
` : ""}<title>${escapeHtml(page.title)} · Roswaal docs</title>
<meta name="description" content="${escapeHtml(page.summary)}">
${options.logo ? `<link rel="icon" type="image/svg+xml" href="${escapeHtml(options.logo.icon)}">\n` : ""}<link rel="stylesheet" href="${up}theme.css${stamp(options)}">
<script src="${up}theme.js${stamp(options)}"></script>
</head>
<body class="docs-static">
<div class="docs-page">
${options.canaryBanner ?? ""}<input type="checkbox" id="docs-nav-open" class="docs-nav-check" aria-label="Show the contents">
<header class="docs-page-head">
<a class="logo as-chip" href="${up}../try.html#picker" title="Your projects">${options.logo?.mark ?? "Roswaal "}Docs<span class="version">${escapeHtml(options.version)}</span></a>
<label for="docs-nav-open" class="tb docs-nav-toggle">Contents</label>
<button type="button" class="tb icon-only docs-search-toggle" id="docs-search" title="Search the docs" aria-label="Search the docs" hidden>${chromeIcon("search", options)}</button>
<span class="grow"></span>
<a class="tb" href="${up}../try.html">Try it in your browser${options.previewChip ?? ""}</a>
<a class="tb" href="${SOURCE_REPOSITORY}" rel="noreferrer noopener">Source</a>
<button type="button" class="tb icon-only" id="prefs" title="Settings" aria-label="Settings">${chromeIcon("settings", options)}</button>
</header>
<div class="docs-body">
<label for="docs-nav-open" class="docs-nav-scrim" aria-hidden="true" hidden></label>
${renderNav(site, page)}
<article class="docs-content">
<div class="docs-article${page.narrow ? " narrow" : ""}">
<header class="docs-title">
<h1>${escapeHtml(page.title)}${runtimeBadge(page)}${page.custom ? `<span class="badge">from a node pack</span>` : ""}<a class="tb icon-only docs-edit" href="${escapeHtml(proposeHref(page))}" rel="noreferrer noopener" title="Suggest an edit — opens an issue for this page" aria-label="Suggest an edit">✎</a></h1>
<p class="summary">${escapeHtml(page.summary)}</p>
${page.review ? `<p class="docs-status">${reviewBadge(page.review)}</p>\n` : ""}</header>
${body}
${page.review ? `<p class="docs-reviewed">${inline(reviewLine(page.review), up)}</p>\n` : ""}${page.review?.verify ? `<p class="docs-verify"><strong>To verify:</strong> ${inline(page.review.verify, up)}</p>\n` : ""}<div class="docs-tail" aria-hidden="true"></div>
</div>
</article>
${renderOutline(page)}
</div>
</div>
<script src="${up}docs.js${stamp(options)}" defer></script>
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
