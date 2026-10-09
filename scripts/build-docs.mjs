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

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wirePath } from "../src/app/geometry.ts";
import { highlightLuau } from "../src/app/highlight.ts";
import { EVEN_ODD, ICONS, STROKED, VIEW_BOX } from "../src/app/icons.tsx";
import { NODE } from "../src/app/layers.ts";
import { faviconHref, logoMarkup } from "../src/app/logo.tsx";
import { nodeColor, pinColor } from "../src/app/palette.ts";
import { BACKUP_BANNER, markChipMarkup, previewChipMarkup } from "../src/app/previewMark.ts";
import { VERSION } from "../src/cli/version.ts";
import { escapeHtml, renderSite } from "../src/core/docs/html.ts";
import { STABLE_SITE } from "../src/core/docs/links.ts";
import { buildSearchIndex, buildSite } from "../src/core/docs/site.ts";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.ts";
import { buildDocsClient } from "./lib/docsClient.mjs";
import { buildDocsToggle } from "./lib/docsToggle.mjs";
import { buildGraphViewer } from "./lib/graphViewer.mjs";
import { buildMapPanel } from "./lib/mapPanel.mjs";
import { buildThemePaint } from "./lib/themePaint.mjs";
import { buildToolbarLinker } from "./lib/toolbarLinker.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = join(root, "dist-docs");

/** Luau to HTML, with the same token classes the editor's stylesheet colours. */
function highlight(code) {
	return highlightLuau(code)
		.map((tokens) =>
			tokens
				.map((t) =>
					t.cls === "" ? escapeHtml(t.text) : `<span class="${t.cls}">${escapeHtml(t.text)}</span>`,
				)
				.join(""),
		)
		.join("\n");
}

async function main() {
	await rm(out, { recursive: true, force: true });

	const registry = createRegistry();
	const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));
	const site = buildSite(registry, builtinIds);

	// The defaults for everything a reader can change in the editor: this site
	// has no preferences to read, so it draws what a fresh install draws.
	const preview = {
		geometry: NODE,
		nodeColor,
		pinColor,
		wirePath,
	};
	// Which line this site was built from. Read off the environment rather than
	// through `pages.ts`, which reads a Vite define that does not exist here.
	const isCanary = process.env.ROSWAAL_CHANNEL === "canary";
	// The mark in the site's colour, as every window of the web app wears it:
	// the published site is the web app's, so blue, and yellow on the canary.
	// At the app's own size (`MarkedLogo`), so the mark and the mode strip sit
	// on the same pixels here as in the editor, and a crossfade between them
	// moves nothing.
	const logo = {
		mark: logoMarkup(17).replace(
			'class="logo-mark"',
			`class="logo-mark mark-${isCanary ? "canary" : "preview"}"`,
		),
		icon: faviconHref(),
	};
	// The copy at the old address says where the site went, in the accent colour.
	const isBackup = process.env.ROSWAAL_BACKUP === "1";
	const canaryBanner = isBackup
		? `<div class="canary-banner canary-banner-backup" role="status">` +
			`<span class="canary-banner-mark">${escapeHtml(BACKUP_BANNER.mark)}</span>` +
			`<span class="canary-banner-text">${escapeHtml(BACKUP_BANNER.docs)}</span>` +
			`<a class="canary-banner-out" href="${STABLE_SITE}">${escapeHtml(BACKUP_BANNER.wayOut)}</a></div>
`
		: undefined;
	// The glyphs and the mark a drawn toolbar needs. Core cannot import either,
	// so the build hands them over the same way it hands over the palette.
	const toolbars = {
		viewBox: VIEW_BOX,
		paths: ICONS,
		mark: logoMarkup(15),
		pinColor,
		strokes: STROKED,
		evenOdd: EVEN_ODD,
	};

	// The three shared assets, made before any page so every page can name
	// exactly the bytes it was built against. See `assetStamp` in html.ts.
	const docsJs =
		(await buildDocsClient()) +
		(await buildGraphViewer()) +
		(await buildToolbarLinker()) +
		(await buildMapPanel()) +
		(await buildDocsToggle());
	// The editor's own stylesheet, so the site and the in-app window are styled
	// by one file rather than by two that have to be kept in step.
	const themeCss = await readFile(join(root, "src/app/theme.css"), "utf8");
	// And the scheme the reader picked, which the stylesheet alone cannot know.
	// Loaded blocking from the head, so the page never paints twice.
	const themeJs = await buildThemePaint();
	const assetStamp = createHash("sha256")
		.update(docsJs)
		.update("\0")
		.update(themeCss)
		.update("\0")
		.update(themeJs)
		.digest("hex")
		.slice(0, 12);

	const files = renderSite(site, {
		highlight,
		pinColor,
		preview,
		logo,
		registry,
		toolbars,
		previewChip: isCanary ? markChipMarkup("canary") : previewChipMarkup(),
		canaryBanner,
		noindex: isCanary || isBackup,
		site: { canary: isCanary, backup: isBackup },
		version: VERSION,
		assetStamp,
	});

	for (const file of files) {
		const target = join(out, file.path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, file.contents, "utf8");
	}

	// The index as the editor builds it, so the site ranks with the same
	// fields: `rankDocs` reads `nodeId`, and the summaries are already plain.
	const index = buildSearchIndex(site);
	await writeFile(join(out, "search.json"), JSON.stringify(index), "utf8");
	await writeFile(join(out, "docs.js"), docsJs, "utf8");
	await writeFile(join(out, "theme.css"), themeCss, "utf8");
	await writeFile(join(out, "theme.js"), themeJs, "utf8");

	console.log(`docs site: ${files.length} pages -> dist-docs/`);
}

await main();
