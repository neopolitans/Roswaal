/**
 * The page in front of the website.
 *
 * It has one job, and it is not to describe Roswaal. Somebody arriving here is
 * deciding whether a visual scripting tool is worth an afternoon of their time,
 * and the fastest honest answer to that is the thing itself: a graph, and the
 * Luau it compiles to, side by side, where they can see whether the output is
 * code they would have been happy to write. The tour (`tour.mjs`) is that,
 * working, so it comes straight after the promise.
 *
 * **What it shows comes out of the documentation's own model and the editor's
 * own compiler**, so the picture cannot show a wiring the code underneath does
 * not have — the same guarantee the docs make, for the same reason.
 *
 * Almost no script of its own. The graphs scale by their `viewBox`, the code
 * is highlighted at build time, and the tour's slides switch by radio button,
 * so the page is whole as markup and cannot break the way `docs.js` broke.
 * `landing.js` is the tour's: each demonstration is drawn in a state worth
 * looking at before any script makes it answer.
 */

import { wirePath } from "../../src/app/geometry.ts";
import { ICONS } from "../../src/app/icons.tsx";
import { NODE } from "../../src/app/layers.ts";
import { faviconHref, logoMarkup } from "../../src/app/logo.tsx";
import { nodeColor, pinColor } from "../../src/app/palette.ts";
import {
	BACKUP_BANNER,
	MARK_BESIDE_LINK,
	MARK_LABEL,
	PREVIEW_BESIDE_LINK,
	PREVIEW_LABEL,
} from "../../src/app/previewMark.ts";
import { escapeHtml } from "../../src/core/docs/html.ts";
import { SOURCE_REPOSITORY, STABLE_SITE } from "../../src/core/docs/links.ts";
import { graphSvg } from "../../src/core/docs/preview.ts";
import { RELEASES, taglineFor } from "../../src/core/docs/releases.ts";
import { BUILTIN_NODES as ALL_NODES, createRegistry } from "../../src/core/nodes/index.ts";
import { emptyScript } from "../../src/core/schema.ts";
import { metaTags, SITE_DESCRIPTION, softwareJsonLd } from "../../src/core/siteMeta.ts";
import { releaseHref, SLIDES, sinceBadge, TOUR_STYLE, tourSection } from "./tour.mjs";

/** The front page's line on the canary, which is not the build to start from. */
const CANARY_DESCRIPTION =
	"Roswaal's next build, ahead of its release: node graphs that compile to clean, " +
	"readable Luau for Roblox and Lune. Try it in your browser.";

/**
 * The canary's word on its front page. The windows say it with their yellow
 * mark alone; this page is where someone arrives without having chosen it.
 */
const CANARY_STRIP =
	"This is the canary — an unreleased build of Roswaal, and not the one to start from.";

/**
 * A node's colour, from the function the canvas itself uses.
 *
 * So the accents on this page are the palette a reader will see the moment they
 * open the editor, rather than a second set of brand colours that agree with it
 * by coincidence until one of them changes.
 */
function colourOf(id) {
	const def = ALL_NODES.find((node) => node.id === id);
	if (!def) throw new Error(`The landing page accents on a node that is gone: ${id}`);
	return nodeColor(def);
}

/**
 * One of the editor's own icons, as markup.
 *
 * The same paths the toolbar and the tree draw, so the page is furnished from
 * the tool rather than from a second icon set that happens to look similar.
 * `function` is the only stroked one, which is why it is the only special case.
 */
function icon(name) {
	const path = ICONS[name];
	if (!path) throw new Error(`The landing page asks for an icon that is gone: ${name}`);
	const stroke =
		name === "function"
			? ' fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round"'
			: ' fill="currentColor"';
	return `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${path}"${stroke}/></svg>`;
}

/**
 * The banner's graph: a part's Touched event, handled, printing what touched it.
 *
 * A real graph drawn by the docs' renderer, so it is the editor's node style
 * whatever that becomes, and it follows the theme. Drawn at about the editor's
 * size, straight on the banner's grid, with no frame of its own: the tour's
 * graphs below have frames, and a second one here read as the same thing twice.
 */
export function heroGraph() {
	const registry = createRegistry();
	/** @type {import("../../src/core/schema.ts").NodeScript} */
	const script = {
		...emptyScript("Touched", "landing-hero"),
		nodes: [
			{
				id: "event",
				def: "roblox.getEvent",
				x: 0,
				y: 40,
				literals: { event: { t: "string", v: "Touched" } },
			},
			{
				id: "connect",
				def: "event.connect",
				x: 260,
				y: 0,
				config: { params: [{ name: "hit", type: "BasePart" }] },
			},
			{ id: "print", def: "debug.print", x: 540, y: 30 },
		],
		links: [
			{ id: "l1", from: { node: "event", pin: "result" }, to: { node: "connect", pin: "signal" } },
			{ id: "l2", from: { node: "connect", pin: "body" }, to: { node: "print", pin: "in" } },
			{ id: "l3", from: { node: "connect", pin: "p0" }, to: { node: "print", pin: "value" } },
		],
	};
	return graphSvg(script, registry, {
		geometry: NODE,
		nodeColor,
		pinColor,
		wirePath,
	});
}

const STYLE = `
/* The editor's stylesheet is what makes the graph and the code look like the
   tool rather than like a picture of it. It is written for an application that
   fills the window, so the page takes its colours and gives back its scroll. */
body.roswaal-landing {
  height: auto;
  overflow: auto;
  font-size: 15px;
  line-height: 1.6;
  /* Cards are solid and tinted towards the accent, as the start page's and
     Node Design's are: the canvas grid behind text made it harder to read. */
  --landing-card: color-mix(in srgb, var(--accent) 5%, var(--bg-panel));
  --landing-card-hover: color-mix(in srgb, var(--accent) 9%, var(--bg-panel));
}
/* Wide, because the thing being shown is wide.

   A graph is a horizontal object -- this one is nearly eight times wider than
   it is tall -- and at 68rem it rendered at three quarters of life size for no
   reason other than a number chosen for paragraphs. The prose keeps a reading
   measure of its own; only the demonstration takes the room. */
.landing { max-width: min(96vw, 1460px); margin: 0 auto; padding: 48px 24px 4rem; }

/* The windows' floating chrome, along the top of the page as it is along the
   top of every window, and still there once the doors have scrolled away. It
   takes no room of its own: the bar is sticky and zero high, and its groups
   hang over whatever is under it, the banner first. */
.landing-chrome {
  position: sticky; top: 0; z-index: 40; height: 0; overflow: visible;
  pointer-events: none;
}
.landing-chrome-row {
  display: flex; align-items: center; gap: 8px;
  max-width: min(96vw, 1460px); margin: 0 auto; padding: 10px 24px; box-sizing: border-box;
}
.landing-chrome .tool-group { pointer-events: auto; flex: none; flex-wrap: nowrap; }
.landing-chrome .spacer { flex: 1; }
.landing-chrome .window-mark { text-decoration: none; color: var(--fg); }
.landing-chrome a.tb {
  display: inline-flex; align-items: center; gap: 7px; height: var(--hit); padding: 0 11px;
  box-sizing: border-box; border-radius: var(--radius-sm); color: var(--fg); text-decoration: none;
  white-space: nowrap;
}
.landing-chrome a.tb:hover { background: var(--bg-hover); }
.landing-chrome a.tb svg { width: 15px; height: 15px; fill: currentColor; }
.landing-chrome a.tb.primary, .landing-chrome a.tb.primary:hover { background: var(--accent); color: #fff; font-weight: 500; }
.landing-chrome .canary-mark .logo-mark { color: var(--warning); }
@media (max-width: 640px) {
  .landing-chrome-row { padding: 8px 10px; }
  .landing-chrome .wide-only, .landing-chrome .window-name { display: none; }
}

/* The banner runs the width of the window, a strip of canvas with the name and
   a graph on it; its contents keep the page's column. The graph is drawn by
   the docs' renderer, so it is the editor's node style and follows the theme,
   at about the editor's size and straight on the grid. A plain line under it
   is the page's divider. */
.landing-banner {
  position: relative; overflow: hidden;
  background-color: var(--bg-canvas);
  border-bottom: 1px solid var(--border);
}
/* The grid is the editor's own ("The grid" in theme.css, by the
   grid-surface class); the fade from the left, under the name, lies over it. */
.landing-banner::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to right, var(--bg-canvas) 10%, transparent 60%);
}
.banner-inner { position: relative; }
/* On the canary the divider is a strip: what this build is, and the way out. */
.landing-banner.canary { border-bottom: 0; }
.landing-strip { background: var(--warning); color: #14161a; }
.strip-inner {
  max-width: min(96vw, 1460px); margin: 0 auto; padding: 9px 68px;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px;
  font-size: 14px; font-weight: 500; text-align: center;
}
.strip-flag {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  border: 1px solid rgb(0 0 0 / 45%); border-radius: 3px; padding: 1px 6px;
}
/* The way out: the stable build, named, outlined in the strip's own ink so it
   reads as a button without a second loud colour beside the canary's yellow.
   The blue that says "stable" is kept to the chip. Fixed colours, since the
   strip is yellow in either theme. */
.strip-stable {
  display: inline-flex; align-items: center; gap: 8px; padding: 4px 11px; border-radius: 6px;
  border: 1.5px solid #14161a; color: #14161a; font-weight: 600; text-decoration: none;
  transition: background 0.12s;
}
.strip-stable:hover { background: rgb(0 0 0 / 8%); }
.strip-stable:focus-visible { outline: 2px solid #14161a; outline-offset: 2px; }
.strip-stable .flag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  border-radius: 3px; padding: 1px 5px; background: #14161a; color: #7fb3e6;
}
@media (max-width: 640px) { .strip-inner { padding: 9px 20px; } }
/* The top padding clears the chrome hanging over it. */
.banner-inner {
  display: grid; align-items: center; text-align: left;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 0 40px;
  max-width: min(96vw, 1460px); margin: 0 auto; padding: 92px 68px 56px;
}
/* The mark rests on the name, as the top bar draws it: as tall as the name's
   capitals and on its baseline. It draws with currentColor, so this is the
   whole of colouring it. */
.banner-name .name-mark { align-self: flex-end; margin-bottom: 0.17em; font-size: 64px; }
.banner-name .name-mark .logo-mark { display: block; height: 0.74em; width: auto; color: var(--fg); }
.landing-banner.canary .banner-name .name-mark .logo-mark { color: var(--warning); }
/* The version sits on the name's baseline and stands as tall as its
   lowercase letters, so it reads as part of the wordmark rather than a label
   floating beside it. The offset is the h1's descent at line-height 1. */
.banner-name { display: flex; align-items: flex-end; gap: 14px 16px; }
.banner-name h1 { font-size: 64px; line-height: 1; margin: 0; letter-spacing: -0.02em; font-weight: 700; }
.banner-name .tag {
  box-sizing: border-box; height: 0.5em; margin-bottom: 0.21em;
  display: inline-flex; align-items: center;
  font-size: 64px; /* sizes the box in the name's em; the text is set below */
  border: 1px solid var(--border); border-radius: 5px; padding: 0 0.16em; color: var(--accent);
}
.banner-name .tag-text { font-size: 15px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .banner-name .tag { font-size: 44px; } .banner-name .tag-text { font-size: 12px; } }
.banner-sub { font-size: 24px; margin: 10px 0 0; color: var(--fg-muted, var(--fg)); }
.banner-graph svg { display: block; width: 100%; height: auto; margin-left: auto; }
/* The doors, in the banner where the name is: the first is the build itself.
   Set well clear of the name, which has the room to itself. */
.landing-doors { display: flex; flex-wrap: wrap; gap: 10px; margin: 52px 0 0; padding: 0; list-style: none; }
.landing-doors a {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 7px;
  text-decoration: none; font-weight: 500;
  border: 1px solid var(--border-strong, var(--border)); background: var(--bg-panel); color: var(--fg);
}
.landing-doors a:hover { border-color: var(--accent); }
.landing-doors a.first { background: var(--accent); border-color: var(--accent); color: #fff; }
/* Which runtimes, and which of them to be careful with, as the line under the
   doors: "experimental" is the kind of qualifier that gets skimmed past when
   it is buried in prose. */
.landing-targets { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 16px 0 0; padding: 0; list-style: none; font-size: 13px; color: var(--fg-muted, var(--fg-faint)); }
.landing-targets li { display: inline-flex; align-items: center; gap: 6px; }
.landing-targets .flag,
.landing-doors .flag,
.landing-chrome .flag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  border: 1px solid currentColor; border-radius: 3px; padding: 0 5px;
}
.landing-targets .flag { color: var(--warning, var(--fg-faint)); }
.landing-targets .flag.stable { color: var(--accent); }
/* On an accent fill the flag reads against the accent, in its own border. */
.landing-doors a.first .flag, .landing-chrome a.tb.primary .flag { color: #fff; border-color: rgb(255 255 255 / 55%); }
/* Narrower, the graph goes under the name rather than squeezing it. */
@media (max-width: 1100px) {
  .banner-inner { grid-template-columns: minmax(0, 1fr); padding: 84px 40px 36px; }
  .banner-graph { margin-top: 26px; }
}
@media (max-width: 640px) {
  .banner-inner { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 72px 20px 28px; }
  .banner-name .name-mark { font-size: 44px; }
  .banner-name h1 { font-size: 44px; }
  .landing-doors { margin-top: 32px; }
  .banner-sub { font-size: 19px; }
  .banner-graph { display: none; }
  .landing-doors li { flex: 1 1 auto; display: flex; }
  .landing-doors a { flex: 1; justify-content: center; }
}
/* Above the banner when there is one: where this copy of the site is, which
   is the first thing anybody here needs to know. */
.landing-notices { max-width: min(96vw, 1460px); margin: 0 auto; padding: 14px 24px 0; }
.landing-notices .landing-canary { margin-bottom: 14px; }

/* The promise beside what it means, read left to right. */
.landing-pitch { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 16px 48px; align-items: start; margin: 0 0 56px; }
.landing-lede { margin: 0; font-size: 30px; line-height: 1.2; letter-spacing: -0.015em; text-wrap: balance; color: var(--accent); font-weight: 600; }
.landing-sub, .landing-note { margin: 0 0 10px; color: var(--fg-muted, var(--fg-faint)); font-size: 16px; max-width: 46rem; text-wrap: pretty; }
/* The licence, as a chip that opens it: the claim and its proof in one place. */
.landing-sub .licence-chip {
  display: inline-block; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; line-height: 1.4;
  padding: 0 7px; border: 1px solid var(--border); border-radius: 4px;
  color: var(--accent); text-decoration: none; vertical-align: 1px;
}
.landing-sub .licence-chip:hover { border-color: var(--accent); }
/* A chip and the comma after it: an inline-block is a place to break the line. */
.landing-sub .nowrap { white-space: nowrap; }
@media (max-width: 1100px) { .landing-pitch { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) { .landing-lede { font-size: 24px; } }

/* The canary's warning, above the name. Not dismissible: it is the first thing
   about this site that anybody needs to know, and it leads out. */
.landing-canary {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  flex-wrap: wrap; margin: 0 0 22px; font-size: 13px; line-height: 1.5;
  padding: 8px 14px; border-radius: 6px;
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
}
.landing-canary .flag { color: var(--warning); }
.landing-canary a { color: var(--accent); white-space: nowrap; }
.landing-canary.landing-backup {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.landing-backup .flag { color: var(--accent); }

/* A section: its name in small capitals, and anything it offers to its right. */
.landing-sec { margin: 0 0 56px; }
.landing-sec-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 0 0 16px; }
.landing-h2 {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--fg-faint); margin: 0;
}
.landing-sec-head p { margin: 0; font-size: 14px; color: var(--fg-faint); }
.landing-sec-head .spacer { flex: 1; }
.landing-sec-head a.more { font-size: 14px; color: var(--accent); }

/* The tour's switch: radio buttons the page draws as tabs, so the choice
   works with no script at all, and arrow keys move it. */
.landing-pick { position: absolute; opacity: 0; pointer-events: none; }
.landing-tabs label {
  padding: 3px 12px; border-radius: var(--radius-xs, 4px); color: var(--fg-muted, var(--fg-faint));
  font-size: 14px; cursor: pointer; user-select: none;
}
.landing-tabs label:hover { background: var(--bg-hover); color: var(--fg); }
/* Roswaal writes tabs. Eight columns is the browser default and makes a
   two-level function body look like an accident. */
.landing-code { flex: 1; margin: 0; padding: 14px; overflow-x: auto; font-size: 13px; line-height: 1.55; tab-size: 2; background: var(--bg-input); }

/* The cards are the editor's cards: a header in the card band with the
   title, the colour nodeColor() gives the part's nodes on a tile behind its
   glyph -- as the Inspector's file badge is -- and one footer, the same on
   every card, pinned to its foot: the version it arrived in, and where to go
   next. So a row of cards ends on one line, and the page is coloured by the
   tool rather than by a decision made here. A row fills its width with the
   cards it has. */
.landing-points { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin: 0; }
.landing-points.four { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
/* The editor's cards in two named rows: writing a graph, and what is around it. */
.landing-row { grid-column: 1 / -1; margin: 8px 0 -6px; font-size: 13px; font-weight: 600; color: var(--fg-muted, var(--fg-faint)); }
.landing-row:first-child { margin-top: 0; }
.landing-card {
  display: flex; flex-direction: column; min-width: 0;
  border: 1px solid var(--border); border-radius: 8px; background: var(--landing-card);
  overflow: hidden; transition: border-color 0.12s, background 0.12s;
}
.landing-card:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); background: var(--landing-card-hover); }
.landing-card h3 {
  display: flex; align-items: center; gap: 10px; margin: 0; min-height: 40px; box-sizing: border-box;
  padding: 0 10px; background: var(--card-head); border-bottom: 1px solid var(--border); color: var(--fg);
  font-size: 14px; font-weight: 600; line-height: 1.3;
}
.landing-card h3 svg {
  box-sizing: border-box; width: 24px; height: 24px; padding: 4px; border-radius: 6px; flex: none;
  color: #fff; fill: #fff; background: var(--edge, var(--accent));
}
.landing-card p { margin: 0; padding: 12px 14px 14px; color: var(--fg-muted, var(--fg-faint)); font-size: 14px; line-height: 1.55; }
.landing-card p a { color: var(--accent); }
/* The footer: the version it arrived in, opening the release notes it arrived
   with, and where to go next -- the tour's slide for the part, or its page. */
.landing-card-foot {
  display: flex; align-items: center; gap: 12px; margin-top: auto;
  padding: 9px 14px; border-top: 1px solid var(--border); font-size: 13px;
}
.landing-card-foot .since {
  color: var(--fg-faint); font: 500 12px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-variant-numeric: tabular-nums; text-decoration: none;
}
.landing-card-foot .since:hover { color: var(--fg); text-decoration: underline; }
.landing-card-go { margin-left: auto; color: var(--accent); font-weight: 600; text-decoration: none; white-space: nowrap; }
.landing-card-go::after { content: " \\2192"; }
.landing-card-go[href="#tour"]::after { content: " \\2191"; }
.landing-card-go:hover { text-decoration: underline; }
.landing-card code { font-size: 12px; }
/* A key, not a phrase, and a light one in running text. Borrowed from the
   shape the docs give one, so a reader who has seen the shortcuts written down
   once recognises them here. */
.landing-card kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1;
  padding: 1px 4px; border-radius: 4px;
  border: 1px solid var(--border); background: none;
  color: var(--fg); white-space: nowrap;
}
/* Why it holds up: three plain columns under their tiles, not three more boxes.
   One column under a tablet's width, never two and an orphan. */
.landing-points.plain { gap: 32px; }
.landing-points.plain > .landing-card { background: none; border: 0; }
.landing-points.plain > .landing-card h3 { background: none; border: 0; padding: 0 0 6px; min-height: 0; font-size: 15px; }
.landing-points.plain > .landing-card p { padding: 0; }
@media (max-width: 900px) { .landing-points.plain { grid-template-columns: minmax(0, 1fr); gap: 22px; } }

/* What is planned, told apart from what is there: a card not made yet --
   dashed and uncoloured. A plan that looks like a feature is a promise nobody
   made, and the disclaimer sits above the cards rather than in small print
   underneath. */
.landing-note-plan { color: var(--fg-faint); font-size: 13px; margin: 0 0 18px; max-width: 46rem; }
.landing-card.planned {
  background: color-mix(in srgb, var(--accent) 3%, var(--bg-canvas));
  border-style: dashed; border-color: var(--border-strong, var(--border));
}
.landing-card.planned h3 { background: none; border-bottom-style: dashed; }
.landing-card.planned h3 svg { background: none; fill: var(--fg-faint); color: var(--fg-faint); }

/* What it reads and writes besides its own files, each to its docs page, in
   the editor's button shape. */
.landing-works { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.landing-works a {
  display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--landing-card);
  color: var(--fg); text-decoration: none; font-size: 14px;
}
.landing-works a:hover { border-color: var(--accent); }
.landing-works code { font-size: 12px; color: var(--fg-muted, var(--fg-faint)); }

/* The latest releases, from the notes themselves: one card of rows, eight on a
   computer's width in two columns of four, and six on a tablet or a phone in
   one. Two, not three: eight in threes left a hole in the card. */
.landing-lately {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));
  gap: 0; margin: 0; padding: 0; list-style: none;
  border: 1px solid var(--border); border-radius: 10px; background: var(--landing-card); overflow: hidden;
}
@media (max-width: 1199px) { .landing-lately .lately-more { display: none; } }
.landing-lately a {
  display: flex; align-items: baseline; gap: 12px; height: 100%; box-sizing: border-box; padding: 9px 14px;
  border-bottom: 1px solid var(--border); color: var(--fg); text-decoration: none;
}
.landing-lately a:hover { background: var(--landing-card-hover); }
.lately-version { flex: none; font: 500 13px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--fg-faint); font-variant-numeric: tabular-nums; }
.lately-line { font-size: 14px; color: var(--fg-muted, var(--fg-faint)); }

.landing-foot {
  border-top: 1px solid var(--border); padding-top: 20px;
  display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13px; color: var(--fg-faint);
  align-items: baseline;
}
/* The version and its tagline take the room they need; the links go to the
   other end. A tagline is a sentence and grows with each release, so the two
   cannot share a left edge and stay legible -- and the links are a fixed set
   that reads better as a group anyway. */
.landing-foot .landing-version { margin-right: auto; }
/* On a narrow page the row wraps, and a group pinned right by an auto margin
   lands under the tagline with nothing beside it. Left again once wrapped. */
@media (max-width: 720px) {
  .landing-foot .landing-version { margin-right: 0; }
}
.landing-foot a { color: var(--fg-muted, #8fa6dd); }
/* Whose names this page uses, and that Roswaal is none of theirs. */
.landing-legal {
  max-width: 46rem; margin: 22px auto 0; text-align: center; text-wrap: pretty;
  font-size: 12px; line-height: 1.6; color: var(--fg-faint);
}
@media (max-width: 640px) { .landing-sec { margin-bottom: 44px; } }
@media (prefers-reduced-motion: reduce) { .landing-card { transition: none; } }
${TOUR_STYLE}`;

/**
 * Which line a build came from, read off the environment by default.
 *
 * This file runs under `tsx`, where the Vite defines do not exist — so it asks
 * the same variable the configs ask rather than importing `pages.ts`, which
 * would throw on `__ROSWAAL_STATIC__`.
 *
 * A parameter rather than only a module constant, because both shapes of this
 * page have to be testable in one run: the chip on the door and the sentence
 * under it are two statements about the same thing, written at different times,
 * and the canary is where they first disagreed.
 */
const channelIsCanary = () => process.env.ROSWAAL_CHANNEL === "canary";
/** The copy at the site's old address. See `IS_BACKUP` in `src/app/pages.ts`. */
const buildIsBackup = () => process.env.ROSWAAL_BACKUP === "1";

/**
 * The latest minor releases, newest first, from the notes themselves: a list
 * on the front page that is kept by hand goes stale the first release
 * somebody forgets it. Eight, of which the last two are for wide screens.
 */
function lately() {
	return RELEASES.filter((release) => /^\d+\.\d+\.0$/.test(release.version))
		.slice(0, 8)
		.map(
			(release, i) =>
				// Straight to the version's own page, the release lit on it.
				`<li${i >= 6 ? ' class="lately-more"' : ""}><a href="${escapeHtml(releaseHref(release.version))}">` +
				`<span class="lately-version">${escapeHtml(release.version)}</span>` +
				`<span class="lately-line">${escapeHtml(release.headline)}</span></a></li>`,
		)
		.join("\n      ");
}

/**
 * A card in the editor's shape: its glyph on a tile in the colour of the part's
 * nodes, the title, the body. `since` is the version it arrived in and opens
 * that version's release notes; `go` is where to go next, a tour slide
 * (`{ slide }`) that shows the same part working or a page (`{ href, say }`).
 * With neither, as in the plain columns, there is no footer.
 */
function card(node, glyph, title, body, since, go) {
	if (go?.slide !== undefined && !SLIDES.some((one) => one.key === go.slide)) {
		throw new Error(`A card points at a tour slide that is gone: ${go.slide}`);
	}
	const next = go?.slide
		? `<a class="landing-card-go" href="#tour" data-tour-slide="${go.slide}">Try it in the tour</a>`
		: go
			? `<a class="landing-card-go" href="${go.href}">${escapeHtml(go.say)}</a>`
			: "";
	const foot =
		since || next
			? `\n        <div class="landing-card-foot">${since ? sinceBadge(since, "since").replace(/>([^<]+)<\/a>$/, ">Since $1</a>") : ""}${next}</div>`
			: "";
	return `<div class="landing-card" style="--edge: ${colourOf(node)}">
        <h3>${icon(glyph)}${title}</h3>
        <p>${body}</p>${foot}
      </div>`;
}

/** A plan, drawn as a card not made yet. */
function planned(glyph, title, body) {
	return `<div class="landing-card planned">
        <h3>${icon(glyph)}${title}</h3>
        <p>${body}</p>
      </div>`;
}

export function landingPage(
	version,
	{ canary = channelIsCanary(), backup = buildIsBackup() } = {},
) {
	const IS_CANARY = canary;
	const hero = heroGraph();
	const tour = tourSection({ tryHref: "try.html" });
	const tagline = taglineFor(version);
	const mark = IS_CANARY ? "canary" : "preview";
	const flag = escapeHtml(IS_CANARY ? MARK_LABEL.canary : PREVIEW_LABEL);
	const doorTitle = escapeHtml(IS_CANARY ? MARK_BESIDE_LINK.canary : PREVIEW_BESIDE_LINK);

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${
	IS_CANARY || backup
		? `<meta name="robots" content="noindex" />
`
		: ""
}<title>Roswaal${IS_CANARY ? " canary" : ""} — Visual scripting for Luau</title>
${metaTags(
	{
		title: `Roswaal${IS_CANARY ? " canary" : ""} — Visual scripting for Luau, reimagined`,
		description: IS_CANARY ? CANARY_DESCRIPTION : SITE_DESCRIPTION,
		path: "",
		large: true,
	},
	{ canary: IS_CANARY, backup },
)}
${softwareJsonLd({ canary: IS_CANARY, backup })}
<link rel="icon" href="${faviconHref()}" />
<link rel="stylesheet" href="docs/theme.css?v=${encodeURIComponent(version)}" />
<script src="docs/theme.js?v=${encodeURIComponent(version)}"></script>
<style>${STYLE}
${tour.rules}</style>
<script src="landing.js?v=${encodeURIComponent(version)}" defer></script>
</head>
<body class="roswaal-landing">
${
	backup
		? `<div class="landing-notices">
  <p class="landing-canary landing-backup">
    <span class="flag">${escapeHtml(BACKUP_BANNER.mark)}</span>
    ${escapeHtml(BACKUP_BANNER.app)}
    <a href="${STABLE_SITE}">${escapeHtml(BACKUP_BANNER.wayOut)}</a>
  </p>
</div>`
		: ""
}
<nav class="landing-chrome" aria-label="Roswaal">
  <div class="landing-chrome-row">
    <div class="tool-group mark-group">
      <a class="logo window-mark${IS_CANARY ? " canary-mark" : ""}" href="./">${logoMarkup(17)}<span class="window-name">Roswaal</span><span class="version">${escapeHtml(version)}</span></a>
    </div>
    <span class="spacer"></span>
    <div class="tool-group wide-only">
      <a class="tb" href="docs/">${icon("document")}Docs</a>
      <a class="tb" href="docs/release-notes.html">Release notes</a>
      <a class="tb" href="${SOURCE_REPOSITORY}" rel="noreferrer noopener">${icon("external")}Source</a>
    </div>
    <div class="tool-group">
      <a class="tb primary" href="try.html" title="${doorTitle}">Try it <span class="flag ${mark}">${flag}</span></a>
    </div>
  </div>
</nav>
<header class="landing-banner grid-surface${IS_CANARY ? " canary" : ""}">
  <div class="banner-inner">
    <div class="banner-copy">
      <div class="banner-name">
        <span class="name-mark" aria-hidden="true">${logoMarkup(96)}</span><h1>Roswaal</h1>
        <span class="tag"><span class="tag-text">${escapeHtml(version)}</span></span>
      </div>
      <p class="banner-sub">Visual scripting for Luau, reimagined.</p>
      <ul class="landing-doors">
        <li><a class="door first" href="try.html" title="${doorTitle}">Try it in your browser <span class="flag ${mark}">${flag}</span></a></li>
        <li><a href="docs/getting-started.html">Getting started</a></li>
      </ul>
      <ul class="landing-targets">
        <li>Roblox <span class="flag stable">stable</span></li>
        <li>Lune <span class="flag">experimental</span></li>
        <li>Computer, tablet or phone</li>
      </ul>
    </div>
    <div class="banner-graph" aria-hidden="true">${hero}</div>
  </div>
</header>
${
	IS_CANARY
		? `<div class="landing-strip" role="note">
  <div class="strip-inner">
    <span class="strip-flag">${escapeHtml(MARK_LABEL.canary)}</span>
    <span class="strip-text">${escapeHtml(CANARY_STRIP)}</span>
    <a class="strip-stable" href="${STABLE_SITE}" title="The stable build">
      Roswaal <span class="flag">stable</span>
    </a>
  </div>
</div>`
		: ""
}
<div class="landing-below">
<main class="landing">
  <section class="landing-pitch">
    <p class="landing-lede">And it's completely free, forever.</p>
    <p class="landing-sub">
      Graphs are files in your repository, compiled to the Luau that Rojo syncs, and
      nothing of Roswaal stays in your game. It's
      <span class="nowrap"><a class="licence-chip" href="${SOURCE_REPOSITORY}/blob/main/LICENSE" rel="noreferrer noopener">0BSD</a>:</span>
      yours to keep, sell or change.
    </p>
  </section>

  ${tour.markup}

  <section class="landing-sec">
    <div class="landing-sec-head"><h2 class="landing-h2">Why it holds up</h2></div>
    <div class="landing-points plain">
      ${card(
				"script.begin",
				"document",
				"You own all of it",
				"A <code>.nodescript</code> is a file in your repository: commit it, branch it, review the diff. Roswaal is 0BSD, with no attribution and nothing to ask permission for.",
			)}
      ${card(
				"math.add",
				"terminal",
				"The output is ordinary Luau",
				"Typed and commented, and run through stylua when it is installed, at your project's indent. Roswaal refuses to overwrite a generated file you have edited by hand.",
			)}
      ${card(
				"roblox.getService",
				"folderOpen",
				"Try it on your own project",
				`On a computer, the ${IS_CANARY ? "canary" : "preview"} opens a real folder and writes into it, so you can find out whether this fits your game before installing anything.`,
			)}
    </div>
  </section>

  <section class="landing-sec">
    <div class="landing-sec-head"><h2 class="landing-h2">Inside the editor</h2></div>
    <div class="landing-points four">
      <p class="landing-row">Writing a graph</p>
      ${card(
				"roblox.getEvent",
				"search",
				"Search literally, or visually",
				"<kbd>Right-click</kbd> the canvas to search nodes by name. <kbd>Ctrl</kbd> + <kbd>Right-click</kbd> opens a picker that draws each node as you walk the list.",
				"0.1.0",
				{ slide: "list" },
			)}
      ${card(
				"code.custom",
				"function",
				"Code Block, and Luau Expression",
				"Write Luau where writing Luau is simpler, and wrap code you already have instead of rebuilding it as nodes. The text is emitted verbatim.",
				"0.1.0",
				{ href: "docs/hand-written-luau.html", say: "How it compiles" },
			)}
      ${card(
				"event.connect",
				"instance",
				"Events, already typed",
				"<strong>On Event</strong> lists the events a part's class has, and the handler's parameters arrive typed. Connect Event fills them in too.",
				"0.119.0",
				{ href: "docs/node/event.on.html", say: "On Event's page" },
			)}
      ${card(
				"value.expression",
				"palette",
				"Custom nodes, made your way",
				"In Node Design, wire a node's logic from nodes and watch the Luau appear, or write the template by hand. Or write a pack yourself, in JSON or Luau.",
				"0.34.0",
				{ href: "docs/creating-custom-nodes.html", say: "Make a node" },
			)}
      <p class="landing-row">Around it</p>
      ${card(
				"string.concat",
				"layout",
				"Preview anything, any time",
				"<kbd>P</kbd> shows what the graph in front of you compiles to: a whole script, one function, or only the nodes you have selected, read from the real output.",
				"0.17.0",
				{ slide: "preview" },
			)}
      ${card(
				"roblox.getService",
				"map",
				"Places and Rojo projects",
				"Open a <code>.rbxl</code> as a project with its scripts, and export back into the place. A <code>default.project.json</code> becomes a node map that makes the folders Rojo syncs.",
				"0.98.0",
				{ href: "docs/places-and-rojo.html", say: "Places and Rojo" },
			)}
      ${card(
				"table.insert",
				"graph",
				"Panels that float and dock",
				"Every window floats its controls over the work. Cards dock to an edge, share it, take tabs and fold away on a computer or an iPad, and become sheets on a phone.",
				"0.121.0",
				{ slide: "windows" },
			)}
      ${card(
				"debug.print",
				"help",
				"Documented, node by node",
				`A page for every node with its graph and its Luau, <kbd>Ctrl</kbd> + <kbd>K</kbd> to it from anywhere, and a <kbd>✎</kbd> on each page to suggest an edit. Plus <a href="docs/coming-from-blueprints.html">Coming from Blueprints</a>.`,
				"0.4.0",
				{ href: "docs/node/event.connect.html", say: "A node's page" },
			)}
    </div>
  </section>

  <section class="landing-sec">
    <div class="landing-sec-head"><h2 class="landing-h2">Works with what you have</h2></div>
    <ul class="landing-works">
      <li><a href="docs/building-and-rojo.html">Rojo <code>default.project.json</code></a></li>
      <li><a href="docs/places-and-rojo.html">Place files <code>.rbxl .rbxlx</code></a></li>
      <li><a href="docs/wally-packages.html">Wally packages</a></li>
      <li><a href="docs/compiling-for-lune.html">Lune</a></li>
      <li><a href="docs/hand-written-luau.html">Your own Luau modules</a></li>
      <li><a href="docs/settings.html">stylua, when installed</a></li>
    </ul>
  </section>

  <section class="landing-sec">
    <div class="landing-sec-head">
      <h2 class="landing-h2">Lately</h2>
      <p>From the release notes, newest first.</p>
      <span class="spacer"></span>
      <a class="more" href="docs/release-notes.html">Every release</a>
    </div>
    <ul class="landing-lately">
      ${lately()}
    </ul>
  </section>

  <section class="landing-sec">
    <div class="landing-sec-head"><h2 class="landing-h2">What is planned</h2></div>
    <p class="landing-note-plan">
      Plans rather than promises, in no particular order, and with no dates. Any
      of it may change, arrive in a different shape, or be dropped — and none of
      it is in the version you can try today.
    </p>
    <div class="landing-points">
      ${planned(
				"warning",
				"Runtime errors that point at a node",
				"The compiler already writes down which node produced which line. An error at <code>Main.server.luau:42</code> could light up the node that wrote line 42.",
			)}
      ${planned(
				"settings",
				"Overriding a built-in node",
				"Keep a node's default behaviour and let a project replace its internals. The open question is what should happen when the built-in changes underneath an override.",
			)}
    </div>
  </section>

  <div class="landing-foot">
    <span class="landing-version">Roswaal ${escapeHtml(version)}${tagline ? ` — ${escapeHtml(tagline)}` : ""}</span>
    <a href="https://github.com/neopolitans/roswaal-feedback/issues/new">Report something</a>
    <a href="docs/release-notes.html">Release notes</a>
    <a href="${SOURCE_REPOSITORY}" rel="noreferrer noopener">Source on GitHub</a>
    <a href="docs/attributions.html">Attributions and licence</a>
  </div>
  <p class="landing-legal">
    Roblox, Roblox Studio and the Luau name belong to Roblox Corporation. Rojo is by the
    Rojo Developers, and Lune by Filip Tibell and its contributors. Unreal Engine and
    Blueprint are trademarks of Epic Games, Inc. Roswaal is an independent open-source
    project, not affiliated with, endorsed by or approved by any of them.
  </p>
</main>
</div>
</body>
</html>
`;
}
