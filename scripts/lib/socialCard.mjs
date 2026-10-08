/**
 * The picture a link to the site unfurls with: Discord's embed, the DevForum's
 * onebox, a search result's thumbnail.
 *
 * The landing page's banner, recomposed for a fixed 1200 by 630 -- the size
 * Discord draws large -- out of the same stylesheet and the same graph, so it
 * cannot drift from the page it stands for. A forum draws it as a thumbnail
 * instead, a fifth of the width, so the mark and the name are big enough to
 * read at that size and the graph is what the larger picture adds.
 *
 * No version: the picture is made by hand (`npm run build:social`) and kept in
 * the repository, because a preview image is fetched once and cached for weeks
 * by every service that shows it, and a number in it would be wrong by the
 * next release.
 */

import { logoMarkup } from "../../src/app/logo.tsx";

import { heroGraph } from "./landing.mjs";

export const CARD = { width: 1200, height: 630 };

/**
 * The card's page. `themeHref` is the site's stylesheet, relative to where the
 * page is written, for the grid, the palette and the graph's own classes.
 */
export function socialCardHtml({ canary = false, themeHref = "docs/theme.css" } = {}) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="${themeHref}" />
<style>
html, body { margin: 0; width: ${CARD.width}px; height: ${CARD.height}px; overflow: hidden; }
body { background: var(--bg-canvas); color: var(--fg); font-family: "Segoe UI", system-ui, -apple-system, sans-serif; }
.card {
  position: relative; box-sizing: border-box; width: 100%; height: 100%;
  background-color: var(--bg-canvas);
  border-bottom: 12px solid ${canary ? "var(--warning)" : "var(--accent)"};
  --grid-step: 30px; --grid-x: 0px; --grid-y: 0px; --grid-dot-size: 1.6px;
}
/* The banner's fade from the left, under the name, over the grid. */
.card::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(to right, var(--bg-canvas) 30%, transparent 80%);
}
.graph {
  position: absolute; right: 36px; bottom: 70px; width: 640px;
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 30%);
  mask-image: linear-gradient(to right, transparent 0, #000 30%);
}
.graph svg { display: block; width: 100%; height: auto; }
.words { position: absolute; left: 76px; top: 72px; right: 76px; }
.mark .logo-mark { display: block; color: ${canary ? "var(--warning)" : "var(--fg)"}; }
.name { display: flex; align-items: center; gap: 22px; margin: 34px 0 0; }
.name h1 { margin: 0; font-size: 104px; line-height: 1; letter-spacing: -0.025em; font-weight: 700; }
.chip {
  font-size: 22px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--warning); border: 2px solid var(--warning); border-radius: 8px; padding: 4px 12px;
}
.sub { margin: 18px 0 0; font-size: 42px; line-height: 1.15; color: var(--fg-muted, var(--fg)); max-width: 640px; }
.flow { position: absolute; left: 76px; bottom: 58px; margin: 0; font: 26px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--accent); }
</style>
</head>
<body>
<div class="card grid-surface">
  <div class="graph" aria-hidden="true">${heroGraph()}</div>
  <div class="words">
    <div class="mark">${logoMarkup(120)}</div>
    <div class="name"><h1>Roswaal</h1>${canary ? `<span class="chip">Canary</span>` : ""}</div>
    <p class="sub">Visual scripting for Luau, reimagined.</p>
  </div>
  <p class="flow">.nodescript → .luau → Rojo → Studio</p>
</div>
</body>
</html>
`;
}
