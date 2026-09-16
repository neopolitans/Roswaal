/**
 * Builds the static documentation site into `dist-docs/`.
 *
 * The same page model the editor's Docs window renders, written out as files so
 * the documentation can be published without a daemon — served from anywhere,
 * or opened straight off disk.
 *
 * Two things it deliberately does not do. It does not read a project, so the
 * site documents the **built-in library only**; a project's own packs are
 * documented in the editor, where the registry is live. And it needs no
 * JavaScript to read a page: highlighting is baked in here, and the scripts it
 * does carry only add to a page that already reads without them -- the search
 * box, and the viewer that lets a drawn graph be panned and zoomed.
 */

import { mkdir, writeFile, readFile, rm } from "node:fs/promises";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.ts";
import { growthState } from "../src/core/nodes/growth.ts";
import { buildSearchIndex, buildSite } from "../src/core/docs/site.ts";
import { escapeHtml, renderSite } from "../src/core/docs/html.ts";
import { highlightLuau } from "../src/app/highlight.ts";
import { nodeColor, pinColor } from "../src/app/palette.ts";
import { faviconHref, logoMarkup } from "../src/app/logo.tsx";
import { ICONS, VIEW_BOX } from "../src/app/icons.tsx";
import { CANARY_BANNER, markChipMarkup, MARK_LABEL, previewChipMarkup } from "../src/app/previewMark.ts";

import { wirePath } from "../src/app/geometry.ts";
import { NODE } from "../src/app/layers.ts";
import { buildGraphViewer } from "./lib/graphViewer.mjs";
import { buildThemePaint } from "./lib/themePaint.mjs";
import { buildToolbarLinker } from "./lib/toolbarLinker.mjs";
import { buildMapPanel } from "./lib/mapPanel.mjs";
import { VERSION } from "../src/cli/version.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = join(root, "dist-docs");

/** Luau to HTML, with the same token classes the editor's stylesheet colours. */
function highlight(code) {
	return highlightLuau(code)
		.map((tokens) =>
			tokens
				.map((t) =>
					t.cls === ""
						? escapeHtml(t.text)
						: `<span class="${t.cls}">${escapeHtml(t.text)}</span>`,
				)
				.join(""),
		)
		.join("\n");
}

/**
 * The whole client-side script: filter the nav by the prebuilt index, and copy
 * a code block. Small enough to inline as a file rather than bundle, and the
 * page is readable without it.
 */
const CLIENT = `
(function () {
  var box = document.getElementById("q");
  var results = document.getElementById("results");
  var tree = document.getElementById("tree");
  var up = (document.documentElement.dataset.slug || "").split("/").length - 1;
  var prefix = new Array(up + 1).join("../");

  function score(e, q) {
    var t = e.title.toLowerCase();
    if (t === q) return 120;
    if (t.indexOf(q) === 0) return 100;
    if (t.indexOf(q) >= 0) return 60;
    if (e.id && e.id.toLowerCase().indexOf(q) >= 0) return 40;
    if (e.summary.toLowerCase().indexOf(q) >= 0) return 25;
    if (e.body.indexOf(q) >= 0) return 10;
    return 0;
  }

  // Shared with the palette, which is the same search in a different shape.
  // One index and one ranking, so the two cannot disagree about which page is
  // the best answer -- and one fetch, because it is the same file.
  var shared = { score: score, index: null, ready: null };
  window.__roswaalSearch = shared;

  shared.ready = fetch(prefix + "search.json")
    .then(function (r) { return r.json(); })
    .then(function (index) {
    shared.index = index;
    box.addEventListener("input", function () {
      var q = box.value.trim().toLowerCase();
      if (!q) { results.hidden = true; tree.hidden = false; return; }
      var hits = index
        .map(function (e) { return { e: e, s: score(e, q) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 25);
      results.innerHTML = hits.length
        ? hits.map(function (x) {
            return '<a class="docs-hit" href="' + prefix + x.e.slug + '.html">' +
              '<span class="title">' + x.e.title + '</span>' +
              '<span class="where">' + x.e.section + "</span></a>";
          }).join("")
        : '<div class="empty">Nothing matches.</div>';
      results.hidden = false;
      tree.hidden = true;
    });
  });

  document.addEventListener("click", function (e) {
    var button = e.target.closest("[data-copy]");
    if (!button) return;
    var text = button.closest(".docs-code").querySelector("pre").innerText;
    navigator.clipboard.writeText(text).then(
      function () { button.textContent = "Copied"; },
      function () {
        // Refused, so select it instead and say what to press. Same fallback
        // the in-app panel uses, for the same reason.
        var range = document.createRange();
        range.selectNodeContents(button.closest(".docs-code").querySelector("pre"));
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        button.textContent = "Press Ctrl+C";
      },
    );
    setTimeout(function () { button.textContent = "Copy"; }, 1800);
  });
})();
`;

async function main() {
	await rm(out, { recursive: true, force: true });

	const registry = createRegistry();
	const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));
	const site = buildSite(registry, builtinIds);

	// The defaults for everything a reader can change in the editor: this site
	// has no preferences to read, so it draws what a fresh install draws.
	const preview = {
		geometry: NODE, nodeColor, pinColor, wirePath,
		growth: (p) => growthState(registry.get(p.id), p.config),
	};
	const logo = { mark: logoMarkup(18), icon: faviconHref() };
	// Which line this site was built from. Read off the environment rather than
	// through `pages.ts`, which reads a Vite define that does not exist here.
	const isCanary = process.env.ROSWAAL_CHANNEL === "canary";
	const canaryBanner = isCanary
		? `<div class="canary-banner" role="status">` +
			`<span class="canary-banner-mark">${escapeHtml(MARK_LABEL.canary)}</span>` +
			`<span class="canary-banner-text">${escapeHtml(CANARY_BANNER.docs)}</span>` +
			`<a class="canary-banner-out" href="https://neopolitans.github.io/Roswaal/"` +
			` rel="noreferrer noopener">${escapeHtml(CANARY_BANNER.wayOut)}</a></div>
`
		: undefined;
	// The glyphs and the mark a drawn toolbar needs. Core cannot import either,
	// so the build hands them over the same way it hands over the palette.
	const toolbars = { viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), pinColor };
	const files = renderSite(site, {
		highlight, pinColor, preview, logo, registry, toolbars,
		previewChip: isCanary ? markChipMarkup("canary") : previewChipMarkup(),
		canaryBanner, noindex: isCanary, version: VERSION,
	});

	for (const file of files) {
		const target = join(out, file.path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, file.contents, "utf8");
	}

	// The index is trimmed: the full body text of 160 pages is most of the
	// payload, and a substring match does not need the markup or the case.
	const index = buildSearchIndex(site).map((e) => ({
		slug: e.slug,
		title: e.title,
		summary: e.summary,
		section: e.section,
		id: e.nodeId,
		body: e.body,
	}));
	await writeFile(join(out, "search.json"), JSON.stringify(index), "utf8");
	await writeFile(
		join(out, "docs.js"),
		CLIENT
			+ (await readFile(join(root, "scripts/lib/docsChrome.js"), "utf8"))
			+ (await buildGraphViewer())
			+ (await buildToolbarLinker())
			+ (await buildMapPanel()),
		"utf8",
	);

	// The editor's own stylesheet, so the site and the in-app window are styled
	// by one file rather than by two that have to be kept in step.
	await writeFile(
		join(out, "theme.css"),
		await readFile(join(root, "src/app/theme.css"), "utf8"),
		"utf8",
	);

	// And the scheme the reader picked, which the stylesheet alone cannot know.
	// Loaded blocking from the head, so the page never paints twice.
	await writeFile(join(out, "theme.js"), await buildThemePaint(), "utf8");

	console.log(`docs site: ${files.length} pages -> dist-docs/`);
}

await main();
