/**
 * The page in front of the website.
 *
 * It has one job, and it is not to describe Roswaal. Somebody arriving here is
 * deciding whether a visual scripting tool is worth an afternoon of their time,
 * and the fastest honest answer to that is the thing itself: a graph, and the
 * Luau it compiles to, side by side, where they can see whether the output is
 * code they would have been happy to write.
 *
 * **Both halves come out of the documentation's own model**, which builds each
 * one from a real `NodeScript` and compiles it. So the picture cannot show a
 * wiring the code underneath does not have — the same guarantee the docs make,
 * for the same reason, and it costs nothing here because the machinery already
 * exists.
 *
 * Almost no script of its own. The graph scales by its `viewBox` and the code
 * is highlighted at build time, so the page is whole as markup and cannot break
 * the way `docs.js` broke. `landing.js` makes the graph pan and zoom and the
 * bar between the two halves draggable; without it both stay as drawn.
 */

import { buildSite } from "../../src/core/docs/site.ts";
import { escapeHtml } from "../../src/core/docs/html.ts";
import { BUILTIN_NODES, createRegistry } from "../../src/core/nodes/index.ts";
import { growthState } from "../../src/core/nodes/growth.ts";
import { graphSvg } from "../../src/core/docs/preview.ts";
import { emptyScript } from "../../src/core/schema.ts";
import { SOURCE_REPOSITORY, STABLE_SITE } from "../../src/core/docs/links.ts";
import { taglineFor } from "../../src/core/docs/releases.ts";
import { highlightLuau } from "../../src/app/highlight.ts";
import { nodeColor, pinColor } from "../../src/app/palette.ts";
import { BUILTIN_NODES as ALL_NODES } from "../../src/core/nodes/index.ts";
import { wirePath } from "../../src/app/geometry.ts";
import { NODE } from "../../src/app/layers.ts";
import { faviconHref, logoMarkup } from "../../src/app/logo.tsx";
import { ICONS } from "../../src/app/icons.tsx";
import {
	BACKUP_BANNER, CANARY_BANNER, markChipMarkup, MARK_BESIDE_LINK, MARK_LABEL, PREVIEW_BESIDE_LINK,
	PREVIEW_LABEL,
} from "../../src/app/previewMark.ts";

/**
 * Which example to show.
 *
 * `event.connect` because its output is the first line of Roblox code anybody
 * writes — `Players.PlayerAdded:Connect(...)` — so a reader can judge the
 * generated Luau against something they already have an opinion about, rather
 * than against a toy.
 */
const EXAMPLE = "node/event.connect";



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
	const stroke = name === "function"
		? ' fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round"'
		: ' fill="currentColor"';
	return `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${path}"${stroke}/></svg>`;
}

/** Luau to HTML, with the token classes the editor's own stylesheet colours. */
function highlight(code) {
	return highlightLuau(code)
		.map((tokens) =>
			tokens
				.map((t) => (t.cls === ""
					? escapeHtml(t.text)
					: `<span class="${t.cls}">${escapeHtml(t.text)}</span>`))
				.join(""),
		)
		.join(String.fromCharCode(10));
}

/**
 * The banner's graph: a part's Touched event, handled, printing what touched it.
 *
 * A real graph drawn by the docs' renderer, so it is the editor's node style
 * whatever that becomes, and it follows the theme. Get Event fades into the
 * banner's left edge, which is what says the graph carries on past it.
 */
function heroGraph() {
	const registry = createRegistry();
	const script = {
		...emptyScript("Touched", "landing-hero"),
		nodes: [
			{ id: "event", def: "roblox.getEvent", x: 0, y: 40, literals: { event: { t: "string", v: "Touched" } } },
			{ id: "connect", def: "event.connect", x: 260, y: 0, config: { params: [{ name: "hit", type: "BasePart" }] } },
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
		growth: (pin) => growthState(registry.get(pin.id), pin.config),
	});
}

/** The example page's graph and the Luau compiled from it. */
function example() {
	const registry = createRegistry();
	const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));
	const page = site.sections
		.flatMap((section) => section.pages)
		.find((candidate) => candidate.slug === EXAMPLE);

	if (!page) throw new Error(`The landing page's example is gone: ${EXAMPLE}`);

	const graph = page.blocks.find((block) => block.t === "graph");
	const code = page.blocks.find((block) => block.t === "code");
	if (!graph || !code) {
		throw new Error(`${EXAMPLE} no longer has both a graph and its output.`);
	}

	const svg = graphSvg(graph.script, registry, {
		geometry: NODE,
		nodeColor,
		pinColor,
		wirePath,
		growth: (pin) => growthState(registry.get(pin.id), pin.config),
	});

	return { svg, luau: highlight(code.text) };
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
}
/* Wide, because the thing being shown is wide.
   
   A graph is a horizontal object -- this one is nearly eight times wider than
   it is tall -- and at 68rem it rendered at three quarters of life size for no
   reason other than a number chosen for paragraphs. The prose keeps a reading
   measure of its own; only the demonstration takes the room. */
.landing { max-width: min(96vw, 1460px); margin: 0 auto; padding: 48px 24px 4rem; }

/* The banner runs the width of the window, a strip of canvas with the mark,
   the name and a graph on it; its contents keep the page's column. The graph
   is drawn by the docs' renderer, so it is the editor's node style and follows
   the theme, and its first node fades into the left. The line under it is the
   page's divider: everything below starts there, the glow included. */
.landing-banner {
  position: relative; overflow: hidden;
  background-color: var(--bg-canvas);
  background-image:
    linear-gradient(to right, var(--bg-canvas) 20%, transparent 75%),
    radial-gradient(circle, color-mix(in srgb, var(--fg) 9%, transparent) 1.2px, transparent 1.4px);
  background-size: 100% 100%, 22px 22px;
  border-bottom: 5px solid var(--accent);
}
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
.banner-inner {
  display: grid; align-items: center; text-align: left;
  grid-template-columns: auto minmax(0, auto) minmax(0, 1fr); gap: 0 32px;
  max-width: min(96vw, 1460px); margin: 0 auto; padding: 48px 68px;
}
/* The mark draws with currentColor, so this is the whole of colouring it. */
.banner-mark .logo-mark { display: block; color: var(--fg); }
.landing-banner.canary .banner-mark .logo-mark { color: var(--warning); }
/* The version sits on the name's baseline and stands as tall as its
   lowercase letters, so it reads as part of the wordmark rather than a label
   floating beside it. The offset is the h1's descent at line-height 1. */
.banner-name { display: flex; align-items: flex-end; gap: 16px; }
.banner-name h1 { font-size: 64px; line-height: 1; margin: 0; letter-spacing: -0.02em; font-weight: 700; }
.banner-name .tag {
  box-sizing: border-box; height: 0.5em; margin-bottom: 0.21em;
  display: inline-flex; align-items: center;
  font-size: 64px; /* sizes the box in the name's em; the text is set below */
  border: 1px solid var(--border); border-radius: 5px; padding: 0 0.16em; color: var(--accent);
}
.banner-name .tag-text { font-size: 15px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .banner-name .tag { font-size: 44px; } .banner-name .tag-text { font-size: 12px; } }
.banner-sub { font-size: 24px; margin: 10px 0 12px; color: var(--fg-muted, var(--fg)); }
.banner-flow { margin: 0; font: 15px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--accent); }
.banner-graph svg {
  display: block; width: 100%; height: auto; max-height: 190px; margin-left: auto;
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 34%);
  mask-image: linear-gradient(to right, transparent 0, #000 34%);
}
/* Narrower, the graph goes under the name rather than squeezing it. */
@media (max-width: 1100px) {
  .banner-inner { grid-template-columns: auto minmax(0, 1fr); padding: 36px 40px; }
  .banner-graph { grid-column: 1 / -1; margin-top: 22px; }
}
@media (max-width: 640px) {
  .banner-inner { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 28px 20px; }
  .banner-mark .logo-mark { height: 56px; width: auto; }
  .banner-name h1 { font-size: 44px; }
  .banner-sub { font-size: 19px; }
}
/* Above the banner when there is one: where this copy of the site is, which
   is the first thing anybody here needs to know. */
.landing-notices { max-width: min(96vw, 1460px); margin: 0 auto; padding: 14px 24px 0; }
.landing-notices .landing-canary { margin-bottom: 14px; }

/* A wash of the accent under the divider, so the page is not four greys. It
   starts at the line and fades out well before the content does. */
.landing-below { position: relative; isolation: isolate; }
.landing-glow {
  position: absolute; inset: 0 0 auto 0; height: 60vh; pointer-events: none; z-index: -1;
  background:
    radial-gradient(60rem 26rem at 22% -8%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
    radial-gradient(44rem 22rem at 78% -14%, color-mix(in srgb, var(--category-values, #4c7fd4) 14%, transparent), transparent 70%);
}
/* Centred, because it is a masthead rather than the start of a paragraph.
   Everything below the demonstration goes back to being read left to right. */
.landing-top { text-align: center; margin-bottom: 64px; }
.landing-top .landing-targets { margin-left: auto; margin-right: auto; }
.landing-top .landing-lede,
.landing-top .landing-sub,
.landing-top .landing-note { margin-left: auto; margin-right: auto; }
.landing-doors { justify-content: center; }
.landing-lede { font-size: 30px; line-height: 1.25; max-width: 44rem; margin: 0 0 14px; letter-spacing: -0.015em; }
/* The one claim on the page that is a promise rather than a description. */
/* Its own line: it is a second sentence and the only promise on the page,
   and wrapped mid-phrase it read as an afterthought. */
.landing-lede em { display: block; font-style: normal; color: var(--accent); }
.landing-sub { color: var(--fg-faint); max-width: 40rem; margin: 0 0 30px; font-size: 16px; text-wrap: pretty; }
/* The licence, as a chip that opens it: the claim and its proof in one place. */
.landing-sub .licence-chip {
  display: inline-block; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; line-height: 1.4;
  padding: 0 7px; border: 1px solid var(--border); border-radius: 4px;
  color: var(--accent); text-decoration: none; vertical-align: 1px;
}
.landing-sub .licence-chip:hover { border-color: var(--accent); }
/* A chip and the comma after it: an inline-block is a place to break the line. */
.landing-sub .nowrap { white-space: nowrap; }
.landing-doors { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 12px; padding: 0; list-style: none; }
.landing-doors a {
  display: inline-block; padding: 10px 18px; border-radius: 7px; text-decoration: none;
  border: 1px solid var(--border); background: var(--bg-panel); color: var(--fg);
}
.landing-doors a:hover { border-color: var(--accent); }
.landing-doors a.first { background: var(--accent); border-color: var(--accent); color: #fff; }
/* The repository, named rather than badged. GitHub's own mark would be a third
   party's brand on the front page; the word is a plain nominative reference,
   which is how this project names Unreal and Unity too. */
.landing-doors a.with-icon { display: inline-flex; align-items: center; gap: 8px; }
.landing-doors a.with-icon svg { width: 15px; height: 15px; fill: currentColor; opacity: 0.8; }
.landing-note { font-size: 13px; color: var(--fg-faint); margin: 0 0 10px; }
/* Which runtimes, and which of them to be careful with. Its own line rather
   than a clause in the paragraph above, because "experimental" is the kind of
   qualifier that gets skimmed past when it is buried in prose. */
.landing-targets { font-size: 13px; color: var(--fg-faint); margin: 0; }
.landing-targets strong { color: var(--fg); font-weight: 600; }
.landing-targets + .landing-targets { margin-top: 6px; }
.landing-targets .flag,
.landing-doors .flag {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px;
  margin-left: 4px; color: var(--warning, var(--fg-faint));
}
/* On the accent-filled first door, the flag has to read against the accent
   rather than against the page. Its own border, not the page's. */
.landing-targets .flag.stable { color: var(--ok, var(--fg-faint)); }
.landing-doors a.first .flag { color: #fff; border-color: rgb(255 255 255 / 55%); }
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

/* The demonstration: the graph and its Luau side by side on a wide screen,
   split 60/40 by default and resizable by dragging the bar between them
   (landing.js). Without the script the split is simply fixed. Below 62rem
   there is no room for two columns and the two stack, flow then output. */
.landing-show { display: grid; gap: 18px; grid-template-columns: 1fr; margin-bottom: 14px; }
.landing-split { display: none; }
@media (min-width: 62rem) {
  .landing-show {
    grid-template-columns: minmax(0, var(--split, 60%)) 14px minmax(0, 1fr);
    gap: 0; align-items: stretch;
  }
  .landing-split {
    display: block; cursor: col-resize; position: relative; touch-action: none;
  }
  .landing-split::after {
    content: ""; position: absolute; top: 50%; left: 50%; width: 4px; height: 44px;
    transform: translate(-50%, -50%); border-radius: 2px;
    background: var(--border); transition: background 0.12s;
  }
  .landing-split:hover::after, .landing-split:focus-visible::after, .landing-split.dragging::after {
    background: var(--accent);
  }
  .landing-split:focus-visible { outline: none; }
}
.landing-pane {
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg-panel);
  overflow: hidden;
}
.landing-pane h2 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-faint);
  margin: 0; padding: 10px 14px; border-bottom: 1px solid var(--border);
}
/* The graph scales by its own viewBox, which is why this page needs no script.
   
   On a narrow screen it stops shrinking and scrolls instead. A graph eight
   times wider than it is tall, fitted to a phone, is a grey smear that proves
   nothing -- and the point of putting it here is that somebody can read the
   node names. Scrolling is the honest trade. */
/* On the canvas, with the canvas's own grid at rest — the same background the
   docs give a drawn graph, so the frame reads as a piece of the editor rather
   than as a picture pasted onto a panel. */
/* The docs' graph viewer, the editor's own pan-and-zoom code (landing.js):
   drag to pan, scroll to zoom, double-click to fit. It refits as its frame
   changes size until the reader takes over, so dragging the frame's bottom
   edge to make it taller or shorter needs nothing else. */
.landing-graph { margin: 0; }
.docs-preview.graph.landing-graph .graph-viewport {
  height: 320px; min-height: 200px; max-height: 80vh; border: 0; border-radius: 0;
}
/* The grip under the graph sets its height. A native resize corner cannot
   work here: the viewer takes every press inside the frame as a pan. */
.landing-graph-grip {
  height: 12px; cursor: row-resize; position: relative; touch-action: none;
  border-top: 1px solid var(--border);
}
.landing-graph-grip::after {
  content: ""; position: absolute; left: 50%; top: 50%; width: 44px; height: 4px;
  transform: translate(-50%, -50%); border-radius: 2px; background: var(--border);
  transition: background 0.12s;
}
.landing-graph-grip:hover::after, .landing-graph-grip:focus-visible::after, .landing-graph-grip.dragging::after {
  background: var(--accent);
}
.landing-graph-grip:focus-visible { outline: none; }
/* Roswaal writes tabs. Eight columns is the browser default and makes a
   two-level function body look like an accident. */
.landing-code { margin: 0; padding: 14px; overflow-x: auto; font-size: 13px; line-height: 1.55; tab-size: 2; }
.landing-caption { color: var(--fg-faint); font-size: 13px; margin: 0 0 56px; }

/* The cards carry the colours the nodes carry -- the same palette nodeColor()
   gives the canvas, so the page is coloured by the tool rather than by a
   decision made here. */
.landing-points { display: grid; gap: 16px; grid-template-columns: 1fr; margin: 0 0 56px; }
@media (min-width: 52rem) { .landing-points { grid-template-columns: repeat(3, 1fr); } }
.landing-card {
  border: 1px solid var(--border); border-left: 3px solid var(--edge, var(--accent));
  border-radius: 8px; background: var(--bg-panel); padding: 16px 18px;
}
.landing-card { display: flex; gap: 14px; align-items: flex-start; }
.landing-card .icon {
  flex: none; width: 30px; height: 30px; border-radius: 7px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--edge, var(--accent)) 18%, transparent);
  color: var(--edge, var(--accent));
}
.landing-card .icon svg { width: 17px; height: 17px; }
.landing-card h3 { font-size: 14px; margin: 0 0 6px; }
.landing-card p { color: var(--fg-faint); margin: 0; font-size: 14px; }
.landing-card code { font-size: 12px; }
/* A key, not a phrase. Borrowed from the shape the docs give one, so a reader
   who has seen the shortcuts written down once recognises them here. */
.landing-card kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; line-height: 1;
  padding: 2px 5px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--bg-input, var(--bg-app));
  color: var(--fg); white-space: nowrap;
}
.landing-h2 {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--fg-faint); margin: 0 0 16px;
}

/* What is planned, told apart from what is there.
   
   The cards are the same shape so the section reads as part of the page, and
   deliberately not the same colour: a plan that looks like a feature is a
   promise nobody made. No accent edge, a muted icon, and the disclaimer sits
   above them rather than in small print underneath. */
.landing-note-plan {
  color: var(--fg-faint); font-size: 13px; margin: -8px 0 18px; max-width: 46rem;
}
.landing-card.planned {
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-panel) 55%, transparent);
}
.landing-card.planned .icon {
  background: color-mix(in srgb, var(--fg-faint) 12%, transparent);
  color: var(--fg-faint);
}
.landing-card.planned h3 { color: var(--fg-muted, var(--fg)); font-weight: 600; }

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
`;

/**
 * The landing page's own script: the two handles around the demonstration.
 * `build-pages` writes it into `landing.js` after the docs' graph viewer.
 *
 * The bar between the graph and its Luau sets the split, and the grip under
 * the graph sets its height. Each drags, steps with the arrow keys, resets on
 * a double-click, and is remembered in this browser. Only an enhancement: the
 * 60/40 split and the graph's height are CSS, so without this both stay put.
 */
export const LANDING_SCRIPT = `(() => {
  const remember = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const recall = (key) => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };

  // One handle: a separator that sets a value by dragging along one axis.
  const handle = (grip, { key, axis, min, max, step, initial, read, apply }) => {
    const set = (value) => {
      const clamped = Math.round(Math.min(max(), Math.max(min, value)));
      apply(clamped);
      grip.setAttribute("aria-valuenow", String(clamped));
      return clamped;
    };
    const kept = recall(key);
    if (kept) set(kept);
    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      grip.classList.add("dragging");
      const start = axis === "x" ? event.clientX : event.clientY;
      const from = read();
      const at = (e) => read.fromDrag(from, (axis === "x" ? e.clientX : e.clientY) - start);
      const move = (e) => set(at(e));
      const end = (e) => {
        grip.classList.remove("dragging");
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        remember(key, set(at(e)));
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
    grip.addEventListener("keydown", (event) => {
      const now = read();
      const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const on = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (event.key === back) remember(key, set(now - step));
      else if (event.key === on) remember(key, set(now + step));
      else if (event.key === "Home") remember(key, set(min));
      else if (event.key === "End") remember(key, set(max()));
      else return;
      event.preventDefault();
    });
    grip.addEventListener("dblclick", () => remember(key, set(initial)));
  };

  const show = document.querySelector(".landing-show");
  const bar = show && show.querySelector(".landing-split");
  if (bar) {
    const percent = () => Number(bar.getAttribute("aria-valuenow")) || 60;
    percent.fromDrag = (from, delta) => from + (delta / show.getBoundingClientRect().width) * 100;
    handle(bar, {
      key: "roswaal.landingSplit", axis: "x", min: 25, max: () => 75, step: 5, initial: 60,
      read: percent,
      apply: (value) => show.style.setProperty("--split", value + "%"),
    });
  }

  const viewport = document.querySelector(".landing-graph .graph-viewport");
  const grip = document.querySelector(".landing-graph-grip");
  if (viewport && grip) {
    const height = () => viewport.getBoundingClientRect().height;
    height.fromDrag = (from, delta) => from + delta;
    handle(grip, {
      key: "roswaal.landingGraphHeight", axis: "y", min: 200, max: () => Math.round(window.innerHeight * 0.8),
      step: 40, initial: 320,
      read: height,
      apply: (value) => { viewport.style.height = value + "px"; },
    });
  }
})();
`;

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

export function landingPage(version, { canary = channelIsCanary(), backup = buildIsBackup() } = {}) {
	const IS_CANARY = canary;
	const { svg, luau } = example();

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${IS_CANARY || backup ? `<meta name="robots" content="noindex" />
` : ""}<title>Roswaal${IS_CANARY ? " canary" : ""} - Visual Scripting for Luau</title>
<meta name="description" content="Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk and compile to plain Luau that Rojo syncs. Try it in your browser, with nothing installed." />
<link rel="icon" href="${faviconHref()}" />
<link rel="stylesheet" href="docs/theme.css?v=${encodeURIComponent(version)}" />
<script src="docs/theme.js?v=${encodeURIComponent(version)}"></script>
<style>${STYLE}</style>
<script src="landing.js?v=${encodeURIComponent(version)}" defer></script>
</head>
<body class="roswaal-landing">
${backup ? `<div class="landing-notices">
  <p class="landing-canary landing-backup">
    <span class="flag">${escapeHtml(BACKUP_BANNER.mark)}</span>
    ${escapeHtml(BACKUP_BANNER.app)}
    <a href="${STABLE_SITE}">${escapeHtml(BACKUP_BANNER.wayOut)}</a>
  </p>
</div>` : ""}
<header class="landing-banner${IS_CANARY ? " canary" : ""}">
  <div class="banner-inner">
    <div class="banner-mark">${logoMarkup(96)}</div>
    <div class="banner-copy">
      <div class="banner-name">
        <h1>Roswaal</h1>
        <span class="tag"><span class="tag-text">${escapeHtml(version)}</span></span>
      </div>
      <p class="banner-sub">Visual scripting for Luau, reimagined.</p>
      <p class="banner-flow">.nodescript → .luau → Rojo → Studio</p>
    </div>
    <div class="banner-graph" aria-hidden="true">${heroGraph()}</div>
  </div>
</header>
${IS_CANARY ? `<div class="landing-strip" role="note">
  <div class="strip-inner">
    <span class="strip-flag">${escapeHtml(MARK_LABEL.canary)}</span>
    <span class="strip-text">${escapeHtml(CANARY_BANNER.app)}</span>
    <a class="strip-stable" href="${STABLE_SITE}" title="${escapeHtml(CANARY_BANNER.wayOut)}">
      Roswaal <span class="flag">stable</span>
    </a>
  </div>
</div>` : ""}
<div class="landing-below">
<div class="landing-glow" aria-hidden="true"></div>
<main class="landing">
  <div class="landing-top">
    <p class="landing-lede"><em>And it's completely free, forever.</em></p>
    <p class="landing-sub">
      Graphs live as <code>.nodescript</code> files and compile to <code>.luau</code>
      that Rojo syncs like any other source file. No plugin or runtime, nothing of
      Roswaal stays in your game. And it's
      <span class="nowrap"><a class="licence-chip" href="${SOURCE_REPOSITORY}/blob/main/LICENSE" rel="noreferrer noopener">0BSD</a>,</span>
      so Roswaal and anything you make with it are yours to keep, sell, modify or walk away with.
    </p>

    <ul class="landing-doors">
      <li>
        <a class="door first" href="try.html" title="${escapeHtml(
          IS_CANARY ? MARK_BESIDE_LINK.canary : PREVIEW_BESIDE_LINK,
        )}">
          Try it in your browser <span class="flag ${IS_CANARY ? "canary" : "preview"}">${escapeHtml(
            IS_CANARY ? MARK_LABEL.canary : PREVIEW_LABEL,
          )}</span>
        </a>
      </li>
      <li><a href="docs/">Read the documentation</a></li>
      <li>
        <a class="door with-icon" href="${SOURCE_REPOSITORY}" rel="noreferrer noopener">
          ${icon("external")} Source on GitHub
        </a>
      </li>
    </ul>
    <p class="landing-note">
      Runs <strong>locally</strong> on a computer, or <strong>online</strong> on a
      computer, tablet or phone: the <strong>${IS_CANARY ? "canary" : "preview"}</strong>,
      with nothing to install and your project kept in your browser.
    </p>
    <p class="landing-targets">
      Compiles for <strong>Roblox</strong> <span class="flag stable">stable</span>
      and <strong>Lune</strong>
      <span class="flag">experimental</span>
    </p>
  </div>

  <div class="landing-show" style="--split: 60%">
    <section class="landing-pane">
      <h2>The graph you see</h2>
      <figure class="docs-preview graph landing-graph"><div class="graph-viewport">${svg}</div></figure>
      <div class="landing-graph-grip" role="separator" aria-orientation="horizontal" aria-label="Resize the graph"
        aria-valuemin="200" aria-valuenow="320" tabindex="0"></div>
    </section>
    <div class="landing-split" role="separator" aria-orientation="vertical" aria-label="Resize the graph and the Luau"
      aria-valuemin="25" aria-valuemax="75" aria-valuenow="60" tabindex="0"></div>
    <section class="landing-pane">
      <h2>The Luau it writes</h2>
      <pre class="landing-code"><code>${luau}</code></pre>
    </section>
  </div>
  <p class="landing-caption">
    Both halves are built from the same graph, by the same compiler the editor
    runs — so the picture cannot show a wiring the code does not have.
  </p>

  <div class="landing-points">
    <div class="landing-card" style="--edge: ${colourOf("script.begin")}">
      <div class="icon">${icon("document")}</div>
      <div>
        <h3>You own all of it</h3>
        <p>
          A <code>.nodescript</code> is a file in your repository — commit it,
          branch it, review the diff. Roswaal is 0BSD: no attribution, no
          licence to outgrow, nothing to ask permission for.
        </p>
      </div>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("math.add")}">
      <div class="icon">${icon("terminal")}</div>
      <div>
        <h3>The output is ordinary Luau</h3>
        <p>
          Typed, commented and formatted with your own stylua. Roswaal refuses
          to overwrite a generated file you have edited by hand.
        </p>
      </div>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("roblox.getService")}">
      <div class="icon">${icon("folderOpen")}</div>
      <div>
        <h3>Try it on your own project</h3>
        <p>
          On a computer, the browser version opens a real folder and writes into
          it, so you can find out whether this fits your game before installing
          anything.
        </p>
      </div>
    </div>
  </div>

  <h2 class="landing-h2">Inside the editor</h2>
  <div class="landing-points">
    <div class="landing-card" style="--edge: ${colourOf("roblox.getEvent")}">
      <div class="icon">${icon("search")}</div>
      <div>
        <h3>Search literally, or visually</h3>
        <p>
          <kbd>Right-click</kbd> the canvas to search nodes by name.
          <kbd>Ctrl</kbd> + <kbd>Right-click</kbd> asks the same question the
          other way — a picker that draws each node as you walk the list. One
          for when you know the name, one for when you know the shape.
        </p>
      </div>
    </div>

    <div class="landing-card" style="--edge: ${colourOf("code.custom")}">
      <div class="icon">${icon("function")}</div>
      <div>
        <h3>Custom Code, and Luau Expression</h3>
        <p>
          Two escape hatches, on purpose. Write Luau where writing Luau is
          simpler, and wrap code you already have instead of rebuilding it as
          nodes. The text is emitted verbatim.
        </p>
      </div>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("value.expression")}">
      <div class="icon">${icon("build")}</div>
      <div>
        <h3>Custom nodes, created your way</h3>
        <p>
          Design one in Node Design — wire the logic from nodes and watch the
          Luau appear beside it, or write the template by hand, switching
          whenever you like. Or write the pack yourself, JSON or Luau, in
          whichever editor you already use.
        </p>
      </div>
    </div>

    <div class="landing-card" style="--edge: ${colourOf("table.insert")}">
      <div class="icon">${icon("rename")}</div>
      <div>
        <h3>Suggest an edit from any page</h3>
        <p>
          Found a mistake, or a graph that is wrong? Every documentation page
          has a <kbd>✎</kbd> beside its title that opens an issue with the page
          already named — and in the editor's own docs window you can change
          the page in place and propose exactly what it should say.
        </p>
      </div>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("debug.print")}">
      <div class="icon">${icon("help")}</div>
      <div>
        <h3>Documented, node by node</h3>
        <p>
          A reference page for every node, with the graph and the Luau it
          compiles to on each one, and <kbd>Ctrl</kbd> + <kbd>K</kbd>
          to it from anywhere in the editor. Plus a guide for anyone
          <a href="docs/coming-from-blueprints.html">Coming from Blueprints</a>.
        </p>
      </div>
    </div>

    <div class="landing-card" style="--edge: ${colourOf("string.concat")}">
      <div class="icon">${icon("layout")}</div>
      <div>
        <h3>Preview anything, any time</h3>
        <p>
          <kbd>P</kbd> shows what the graph in front of you compiles to — a
          whole script, one function, or just the nodes you have selected. It
          reads the generated file and picks those lines out of it, so it is the
          real output rather than a guess at it.
        </p>
      </div>
    </div>
  </div>

  <h2 class="landing-h2">What is planned</h2>
  <p class="landing-note-plan">
    Plans rather than promises, in no particular order, and with no dates. Any
    of it may change, arrive in a different shape, or be dropped — and none of
    it is in the version you can try today.
  </p>
  <div class="landing-points">
    <div class="landing-card planned">
      <div class="icon">${icon("instance")}</div>
      <div>
        <h3>Event nodes for instances</h3>
        <p>
          Pick a part's <code>Touched</code> from a list of the events its class
          has, and get the handler's parameters already typed, rather than
          naming the event and declaring them yourself.
        </p>
      </div>
    </div>

    <div class="landing-card planned">
      <div class="icon">${icon("newFile")}</div>
      <div>
        <h3>Import Luau you already have</h3>
        <p>
          Statements become the flow, expressions become nodes, and anything
          that will not lower cleanly arrives as a Custom Code node holding the
          original text — so an import is useful before it is perfect.
        </p>
      </div>
    </div>

    <div class="landing-card planned">
      <div class="icon">${icon("warning")}</div>
      <div>
        <h3>Runtime errors that point at a node</h3>
        <p>
          The compiler already writes down which node produced which line.
          Nothing reads it in the other direction yet — an error at
          <code>Main.server.luau:42</code> could light up the node that wrote
          line 42.
        </p>
      </div>
    </div>

    <div class="landing-card planned">
      <div class="icon">${icon("settings")}</div>
      <div>
        <h3>Overriding a built-in node</h3>
        <p>
          Keep a node's default behaviour and let a project replace its
          internals. Honestly, this one is a versioning problem wearing a
          feature's clothes: what should happen when the built-in changes
          underneath an override?
        </p>
      </div>
    </div>
  </div>

  <div class="landing-foot">
    <span class="landing-version">Roswaal ${escapeHtml(version)}${
      taglineFor(version) ? ` — ${escapeHtml(taglineFor(version))}` : ""
    }</span>
    <a href="https://github.com/neopolitans/roswaal-feedback/issues/new">Report something</a>
    <a href="docs/release-notes.html">Release notes</a>
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
