/**
 * The page GitHub Pages sends for an address with nothing behind it.
 *
 * Its own module, beside the landing page's, so a test can hold it to its
 * rules without running the whole site build -- `build-pages.mjs` assembles a
 * tree and calls `main()` at import.
 */

import { faviconHref } from "../../src/app/logo.tsx";

/**
 * Sent for any path with nothing behind it, so GitHub's own 404 never shows.
 *
 * ## Why it is nearly self-contained, and no longer entirely
 *
 * It answers for *any* address, at any depth, including one whose neighbouring
 * files do not exist — so it cannot rely on a relative path and it must read
 * correctly with nothing else loaded. That is why the colours were literals.
 *
 * They are now the same tokens the rest of the site uses **with those literals
 * as fallbacks**, so a reader on Nord gets Nord and a reader whose stylesheet
 * 404'd gets exactly the page this always was. Both assets are reached from
 * `base`, which is the site root rather than this page's neighbours — the one
 * path that is right from every address this file answers for.
 */
export function notFoundPage(base, version) {
	const stamp = `?v=${encodeURIComponent(version)}`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Not here — Roswaal</title>
<link rel="icon" href="${faviconHref()}" />
<link rel="stylesheet" href="${base}docs/theme.css${stamp}" />
<script src="${base}docs/theme.js${stamp}"></script>
<style>
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: var(--bg-app, #14161c); color: var(--fg, #d6dae4);
    padding: 24px; text-align: center;
    font: 15px/1.6 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: var(--fg-muted, #9aa2b4); margin: 0 0 20px; }
  a { color: var(--accent, #8fa6dd); }
</style>
</head>
<body>
<main>
  <h1>There is nothing at this address.</h1>
  <p>It may have moved, or never existed.</p>
  <p><a href="${base}">Back to Roswaal</a> &middot; <a href="${base}docs/">the documentation</a></p>
</main>
</body>
</html>
`;
}
