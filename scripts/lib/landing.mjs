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
 * Almost no script of its own. The graphs scale by their `viewBox`, the code
 * is highlighted at build time, and the examples are switched by radio buttons
 * and CSS, so the page is whole as markup and cannot break the way `docs.js`
 * broke. `landing.js` makes the graphs pan and zoom and the bars around them
 * draggable; without it they stay as drawn.
 */

import { wirePath } from "../../src/app/geometry.ts";
import { highlightLuau } from "../../src/app/highlight.ts";
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
import { buildSite } from "../../src/core/docs/site.ts";
import { growthState } from "../../src/core/nodes/growth.ts";
import {
	BUILTIN_NODES as ALL_NODES,
	BUILTIN_NODES,
	createRegistry,
} from "../../src/core/nodes/index.ts";
import { emptyScript } from "../../src/core/schema.ts";

/**
 * The canary's word on its front page. The windows say it with their yellow
 * mark alone; this page is where someone arrives without having chosen it.
 */
const CANARY_STRIP =
	"This is the canary — an unreleased build of Roswaal, and not the one to start from.";

/**
 * Which examples to show, each a docs page with a graph and the Luau compiled
 * from it.
 *
 * `event.connect` first, because its output is the first line of Roblox code
 * anybody writes -- `Players.PlayerAdded:Connect(...)` -- so a reader can judge
 * the generated Luau against something they already have an opinion about,
 * rather than against a toy. Then a loop, which runs anywhere, and a Lune
 * script, so somebody who came for Lune sees Lune.
 */
const EXAMPLES = [
	{
		slug: "node/event.connect",
		label: "A player joins",
		runtime: "roblox",
		doc: "docs/node/event.connect.html",
	},
	{
		slug: "node/flow.forEach",
		label: "A loop",
		runtime: "luau",
		doc: "docs/node/flow.forEach.html",
	},
	{ slug: "lune-demos", label: "Read a file", runtime: "lune", doc: "docs/lune-demos.html" },
];

/** What each example's Luau runs on, as its chip says it. */
const RUNS_ON = { roblox: "Roblox", luau: "Any Luau", lune: "Lune" };

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

/** Luau to HTML, with the token classes the editor's own stylesheet colours. */
function highlight(code) {
	return highlightLuau(code)
		.map((tokens) =>
			tokens
				.map((t) =>
					t.cls === "" ? escapeHtml(t.text) : `<span class="${t.cls}">${escapeHtml(t.text)}</span>`,
				)
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
		growth: (pin) => growthState(registry.get(pin.id), pin.config),
	});
}

/** Each example's graph and the Luau compiled from it: the first of each on its page. */
function examples() {
	const registry = createRegistry();
	const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));
	const pages = site.sections.flatMap((section) => section.pages);

	return EXAMPLES.map((one) => {
		const page = pages.find((candidate) => candidate.slug === one.slug);
		if (!page) throw new Error(`The landing page's example is gone: ${one.slug}`);

		const graph = page.blocks.find((block) => block.t === "graph");
		const code = page.blocks.find((block) => block.t === "code");
		if (!graph || !code) {
			throw new Error(`${one.slug} no longer has both a graph and its output.`);
		}

		const svg = graphSvg(graph.script, registry, {
			geometry: NODE,
			nodeColor,
			pinColor,
			wirePath,
			growth: (pin) => growthState(registry.get(pin.id), pin.config),
		});
		return { ...one, svg, luau: highlight(code.text) };
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
/* The top padding clears the chrome hanging over it. */
.banner-inner {
  display: grid; align-items: center; text-align: left;
  grid-template-columns: auto minmax(0, auto) minmax(0, 1fr); gap: 0 32px;
  max-width: min(96vw, 1460px); margin: 0 auto; padding: 92px 68px 48px;
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
/* The doors, in the banner where the name is: the first is the build itself. */
.landing-doors { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 0; padding: 0; list-style: none; }
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
.landing-targets { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 13px; color: var(--fg-muted, var(--fg-faint)); }
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
  .banner-inner { grid-template-columns: auto minmax(0, 1fr); padding: 84px 40px 36px; }
  .banner-graph { grid-column: 1 / -1; margin-top: 22px; }
}
@media (max-width: 640px) {
  .banner-inner { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 72px 20px 28px; }
  .banner-mark .logo-mark { height: 56px; width: auto; }
  .banner-name h1 { font-size: 44px; }
  .banner-sub { font-size: 19px; }
  .banner-graph { display: none; }
  .landing-doors li { flex: 1 1 auto; display: flex; }
  .landing-doors a { flex: 1; justify-content: center; }
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

/* The examples, picked with radio buttons the page draws as a switch: so the
   choice works with no script at all, and arrow keys move it. */
.landing-pick { position: absolute; opacity: 0; pointer-events: none; }
.landing-tabs label {
  padding: 3px 12px; border-radius: var(--radius-xs, 4px); color: var(--fg-muted, var(--fg-faint));
  font-size: 14px; cursor: pointer; user-select: none;
}
.landing-tabs label:hover { background: var(--bg-hover); color: var(--fg); }
.landing-examples > .landing-show { display: none; }

/* The demonstration: the graph and its Luau side by side on a wide screen,
   split 60/40 by default and resizable by dragging the bar between them
   (landing.js). Without the script the split is simply fixed. Below 62rem
   there is no room for two columns and the two stack, flow then output. */
.landing-show { gap: 12px; grid-template-columns: 1fr; margin-bottom: 10px; }
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
/* Each half is a card with the editor's card header. */
.landing-pane {
  display: flex; flex-direction: column; min-width: 0;
  border: 1px solid var(--border); border-radius: 10px; background: var(--landing-card);
  box-shadow: var(--shadow-raised); overflow: hidden;
}
/* The editor's size, not the page's: it is a piece of the editor. */
.landing-pane .card-head { cursor: default; font-size: var(--text-md, 13px); line-height: 1.4; padding-right: 10px; }
.landing-pane .card-head h3 { margin: 0; font-size: inherit; font-weight: inherit; }
.landing-pane .card-head a { margin-left: auto; font-size: 12px; color: var(--accent); white-space: nowrap; }
/* The docs' graph viewer, the editor's own pan-and-zoom code (landing.js):
   drag to pan, scroll to zoom, double-click to fit. It refits as its frame
   changes size until the reader takes over, so dragging the frame's bottom
   edge to make it taller or shorter needs nothing else. */
.landing-graph { margin: 0; }
.docs-preview.graph.landing-graph .graph-viewport {
  height: 320px; min-height: 200px; max-height: 80vh; border: 0; border-radius: 0;
}
/* A phone's frame is short: the graph is wide, and a tall frame was mostly
   empty grid. Pinch or scroll to read it. */
@media (max-width: 640px) {
  .docs-preview.graph.landing-graph .graph-viewport { height: 220px; }
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
.landing-code { flex: 1; margin: 0; padding: 14px; overflow-x: auto; font-size: 13px; line-height: 1.55; tab-size: 2; background: var(--bg-input); }
.landing-caption { color: var(--fg-faint); font-size: 13px; margin: 0; }

/* The cards are drawn as Roswaal's own nodes: a header in the colour
   nodeColor() gives the canvas, with the execution pins every step has, over a
   solid body. So the page is coloured by the tool rather than by a decision
   made here. */
.landing-points { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; }
.landing-points.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1200px) { .landing-points.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 900px) { .landing-points, .landing-points.four { grid-template-columns: minmax(0, 1fr); } }
.landing-card {
  display: flex; flex-direction: column; min-width: 0;
  border: 1px solid var(--border); border-radius: 8px; background: var(--landing-card);
  box-shadow: var(--shadow-raised); overflow: hidden;
  transition: border-color 0.12s, background 0.12s;
}
.landing-card:hover { border-color: color-mix(in srgb, var(--edge, var(--accent)) 70%, var(--border)); background: var(--landing-card-hover); }
.landing-card h3 {
  position: relative; display: flex; align-items: center; gap: 9px; margin: 0;
  padding: 7px 26px; background: var(--edge, var(--accent)); color: #fff;
  font-size: 14px; font-weight: 600; line-height: 1.3;
}
.landing-card h3 svg { width: 15px; height: 15px; flex: none; fill: currentColor; opacity: 0.92; }
.landing-card h3::before, .landing-card h3::after {
  content: ""; position: absolute; top: 50%; width: 0; height: 0; transform: translateY(-50%);
  border-top: 5px solid transparent; border-bottom: 5px solid transparent;
  border-left: 8px solid rgb(255 255 255 / 85%);
}
.landing-card h3::before { left: 9px; }
.landing-card h3::after { right: 9px; }
/* Which version it arrived in, in the header's own ink. */
.landing-card .since {
  margin-left: auto; padding: 0 6px; border-radius: 3px; background: rgb(0 0 0 / 24%);
  font: 600 11px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; font-variant-numeric: tabular-nums;
}
.landing-card p { margin: 0; padding: 12px 14px 14px; color: var(--fg-muted, var(--fg-faint)); font-size: 14px; line-height: 1.55; }
.landing-card p a { color: var(--accent); }
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

/* What is planned, told apart from what is there: a node not placed yet --
   dashed, uncoloured, its pins unlit. A plan that looks like a feature is a
   promise nobody made, and the disclaimer sits above the cards rather than in
   small print underneath. */
.landing-note-plan { color: var(--fg-faint); font-size: 13px; margin: 0 0 18px; max-width: 46rem; }
.landing-card.planned {
  background: color-mix(in srgb, var(--accent) 3%, var(--bg-canvas));
  border-style: dashed; border-color: var(--border-strong, var(--border)); box-shadow: none;
}
.landing-card.planned h3 { background: none; color: var(--fg); border-bottom: 1px dashed var(--border-strong, var(--border)); }
.landing-card.planned h3::before, .landing-card.planned h3::after { border-left-color: var(--fg-faint); opacity: 0.6; }

/* What it reads and writes besides its own files, each to its docs page. */
.landing-works { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.landing-works a {
  display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--landing-card);
  color: var(--fg); text-decoration: none; font-size: 14px;
}
.landing-works a:hover { border-color: var(--accent); }
.landing-works code { font-size: 12px; color: var(--fg-muted, var(--fg-faint)); }

/* The latest releases, from the notes themselves: eight on a computer's width,
   four a row, and six on a tablet or a phone. */
.landing-lately { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
@media (max-width: 1199px) {
  .landing-lately { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
  .landing-lately .lately-more { display: none; }
}
.landing-lately a {
  display: flex; align-items: baseline; gap: 12px; height: 100%; box-sizing: border-box; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: var(--radius-md, 8px); background: var(--landing-card);
  color: var(--fg); text-decoration: none;
}
.landing-lately a:hover { border-color: var(--accent); background: var(--landing-card-hover); }
.lately-version { flex: none; font: 600 13px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--accent); font-variant-numeric: tabular-nums; }
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
`;

/**
 * The landing page's own script: the handles around each example.
 * `build-pages` writes it into `landing.js` after the docs' graph viewer.
 *
 * The bar between a graph and its Luau sets the split, and the grip under the
 * graph sets its height. Each drags, steps with the arrow keys, resets on a
 * double-click, and is remembered in this browser -- one split and one height
 * for every example, so switching between them does not move the frame. Only
 * an enhancement: the 60/40 split and the graph's height are CSS, and the
 * examples switch without it.
 */
export const LANDING_SCRIPT = `(() => {
  const remember = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const recall = (key) => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };

  // One handle: a separator that sets a value by dragging along one axis.
  // \`apply\` sets it everywhere the value belongs, not only beside this grip.
  const handle = (grip, { key, axis, min, max, step, initial, read, apply }) => {
    const set = (value) => {
      const clamped = Math.round(Math.min(max(), Math.max(min, value)));
      apply(clamped);
      return clamped;
    };
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

  const shows = [...document.querySelectorAll(".landing-show")];
  const splitTo = (value) => {
    for (const show of shows) {
      show.style.setProperty("--split", value + "%");
      show.querySelector(".landing-split")?.setAttribute("aria-valuenow", String(value));
    }
  };
  const viewports = shows.map((show) => show.querySelector(".landing-graph .graph-viewport")).filter(Boolean);
  const heightTo = (value) => {
    for (const viewport of viewports) viewport.style.height = value + "px";
    for (const grip of document.querySelectorAll(".landing-graph-grip")) grip.setAttribute("aria-valuenow", String(value));
  };
  const keptSplit = recall("roswaal.landingSplit");
  if (keptSplit) splitTo(Math.min(75, Math.max(25, keptSplit)));
  const keptHeight = recall("roswaal.landingGraphHeight");
  if (keptHeight) heightTo(Math.min(Math.round(window.innerHeight * 0.8), Math.max(200, keptHeight)));

  for (const show of shows) {
    const bar = show.querySelector(".landing-split");
    if (bar) {
      const percent = () => Number(bar.getAttribute("aria-valuenow")) || 60;
      percent.fromDrag = (from, delta) => from + (delta / show.getBoundingClientRect().width) * 100;
      handle(bar, { key: "roswaal.landingSplit", axis: "x", min: 25, max: () => 75, step: 5, initial: 60, read: percent, apply: splitTo });
    }
    const viewport = show.querySelector(".landing-graph .graph-viewport");
    const grip = show.querySelector(".landing-graph-grip");
    if (viewport && grip) {
      const height = () => viewport.getBoundingClientRect().height;
      height.fromDrag = (from, delta) => from + delta;
      handle(grip, {
        key: "roswaal.landingGraphHeight", axis: "y", min: 200, max: () => Math.round(window.innerHeight * 0.8),
        step: 40, initial: 320, read: height, apply: heightTo,
      });
    }
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
				`<li${i >= 6 ? ' class="lately-more"' : ""}><a href="docs/release-notes.html#v${escapeHtml(release.version)}">` +
				`<span class="lately-version">${escapeHtml(release.version)}</span>` +
				`<span class="lately-line">${escapeHtml(release.headline)}</span></a></li>`,
		)
		.join("\n      ");
}

/** A feature card, drawn as a node. `since` is the version it arrived in. */
function card(node, glyph, title, body, since) {
	return `<div class="landing-card" style="--edge: ${colourOf(node)}">
        <h3>${icon(glyph)}${title}${since ? `<span class="since" title="Since ${since}">${since}</span>` : ""}</h3>
        <p>${body}</p>
      </div>`;
}

/** A plan, drawn as a node not placed yet. */
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
	const shown = examples();
	const tagline = taglineFor(version);
	const mark = IS_CANARY ? "canary" : "preview";
	const flag = escapeHtml(IS_CANARY ? MARK_LABEL.canary : PREVIEW_LABEL);
	const doorTitle = escapeHtml(IS_CANARY ? MARK_BESIDE_LINK.canary : PREVIEW_BESIDE_LINK);
	// The switch's rules, one per example: radio buttons ahead of the frames,
	// so the page needs no script to choose between them.
	const pickRules = shown
		.map(
			(_, i) =>
				`#landing-ex-${i}:checked ~ .landing-examples > [data-example="${i}"] { display: grid; }\n` +
				`#landing-ex-${i}:checked ~ .landing-sec-head label[for="landing-ex-${i}"] { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }\n` +
				`#landing-ex-${i}:focus-visible ~ .landing-sec-head label[for="landing-ex-${i}"] { outline: 2px solid var(--accent); outline-offset: 1px; }`,
		)
		.join("\n");

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
}<title>Roswaal${IS_CANARY ? " canary" : ""} - Visual Scripting for Luau</title>
<meta name="description" content="Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk and compile to plain Luau that Rojo syncs. Try it in your browser, with nothing installed." />
<link rel="icon" href="${faviconHref()}" />
<link rel="stylesheet" href="docs/theme.css?v=${encodeURIComponent(version)}" />
<script src="docs/theme.js?v=${encodeURIComponent(version)}"></script>
<style>${STYLE}
${pickRules}</style>
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
      <ul class="landing-doors">
        <li><a class="door first" href="try.html" title="${doorTitle}">Try it in your browser <span class="flag ${mark}">${flag}</span></a></li>
        <li><a href="docs/getting-started.html">Getting started</a></li>
      </ul>
      <ul class="landing-targets">
        <li>Roblox <span class="flag stable">stable</span></li>
        <li>Lune <span class="flag">experimental</span></li>
        <li>Free and 0BSD</li>
        <li>Computer, tablet or phone</li>
      </ul>
    </div>
    <div class="banner-graph" aria-hidden="true">${heroGraph()}</div>
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
<div class="landing-glow" aria-hidden="true"></div>
<main class="landing">
  <section class="landing-pitch">
    <p class="landing-lede">And it's completely free, forever.</p>
    <div>
      <p class="landing-sub">
        Graphs live as <code>.nodescript</code> files and compile to <code>.luau</code>
        that Rojo syncs like any other source file. No plugin or runtime, nothing of
        Roswaal stays in your game. And it's
        <span class="nowrap"><a class="licence-chip" href="${SOURCE_REPOSITORY}/blob/main/LICENSE" rel="noreferrer noopener">0BSD</a>,</span>
        so Roswaal and anything you make with it are yours to keep, sell, modify or walk away with.
      </p>
      <p class="landing-note">
        Install it and it runs <strong>locally</strong>, on your repository. Or open the
        <strong>${IS_CANARY ? "canary" : "preview"}</strong> on a computer, tablet or phone,
        with nothing to install and your project kept in your browser.
      </p>
    </div>
  </section>

  <section class="landing-sec landing-see">
    ${shown.map((_, i) => `<input class="landing-pick" type="radio" name="landing-example" id="landing-ex-${i}"${i === 0 ? " checked" : ""} />`).join("\n    ")}
    <div class="landing-sec-head">
      <h2 class="landing-h2">See what it writes</h2>
      <span class="spacer"></span>
      <span class="segmented landing-tabs">${shown.map((one, i) => `<label for="landing-ex-${i}">${escapeHtml(one.label)}</label>`).join("")}</span>
    </div>
    <div class="landing-examples">
${shown
	.map(
		(one, i) => `      <div class="landing-show" style="--split: 60%" data-example="${i}">
        <section class="landing-pane">
          <div class="card-head"><h3 class="card-title">The graph</h3><span class="card-slot"><span class="card-sub">${escapeHtml(one.label)}</span></span><a href="${one.doc}">On its docs page</a></div>
          <figure class="docs-preview graph landing-graph"><div class="graph-viewport">${one.svg}</div></figure>
          <div class="landing-graph-grip" role="separator" aria-orientation="horizontal" aria-label="Resize the graph"
            aria-valuemin="200" aria-valuenow="320" tabindex="0"></div>
        </section>
        <div class="landing-split" role="separator" aria-orientation="vertical" aria-label="Resize the graph and the Luau"
          aria-valuemin="25" aria-valuemax="75" aria-valuenow="60" tabindex="0"></div>
        <section class="landing-pane">
          <div class="card-head"><h3 class="card-title">The Luau it writes</h3><span class="card-slot"><span class="runtime-chip runtime-chip-${one.runtime}">${RUNS_ON[one.runtime]}</span></span></div>
          <pre class="landing-code"><code>${one.luau}</code></pre>
        </section>
      </div>`,
	)
	.join("\n")}
    </div>
    <p class="landing-caption">
      Both halves come from the same graph, by the same compiler the editor runs, so
      the picture cannot show a wiring the code does not have.
    </p>
  </section>

  <section class="landing-sec">
    <div class="landing-sec-head"><h2 class="landing-h2">Why it holds up</h2></div>
    <div class="landing-points">
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
      ${card(
				"roblox.getEvent",
				"search",
				"Search literally, or visually",
				"<kbd>Right-click</kbd> the canvas to search nodes by name. <kbd>Ctrl</kbd> + <kbd>Right-click</kbd> opens a picker that draws each node as you walk the list, since 0.50.0.",
				"0.1.0",
			)}
      ${card(
				"event.connect",
				"instance",
				"Events, already typed",
				"<strong>On Event</strong> lists the events a part's class has, and the handler's parameters arrive typed. Connect Event fills them in too.",
				"0.119.0",
			)}
      ${card(
				"code.custom",
				"function",
				"Custom Code, and Luau Expression",
				"Write Luau where writing Luau is simpler, and wrap code you already have instead of rebuilding it as nodes. The text is emitted verbatim.",
				"0.1.0",
			)}
      ${card(
				"value.expression",
				"palette",
				"Custom nodes, made your way",
				"In Node Design, wire a node's logic from nodes and watch the Luau appear, or write the template by hand. Or write a pack yourself, in JSON or Luau.",
				"0.31.0",
			)}
      ${card(
				"roblox.getService",
				"map",
				"Places and Rojo projects",
				"Open a <code>.rbxl</code> as a project with its scripts, and export back into the place. Since 0.106.0, a <code>default.project.json</code> becomes a node map that makes the folders Rojo syncs.",
				"0.98.0",
			)}
      ${card(
				"string.concat",
				"layout",
				"Preview anything, any time",
				"<kbd>P</kbd> shows what the graph in front of you compiles to: a whole script, one function, or only the nodes you have selected, read from the real output.",
				"0.17.0",
			)}
      ${card(
				"table.insert",
				"graph",
				"Panels that float and dock",
				"Every window floats its controls over the work. Cards dock to an edge, share it, take tabs and fold away on a computer or an iPad, and become sheets on a phone.",
				"0.121.0",
			)}
      ${card(
				"debug.print",
				"help",
				"Documented, node by node",
				`A page for every node with its graph and its Luau, <kbd>Ctrl</kbd> + <kbd>K</kbd> to it from anywhere, and a <kbd>✎</kbd> on each page to suggest an edit. Plus <a href="docs/coming-from-blueprints.html">Coming from Blueprints</a>.`,
				"0.4.0",
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
				"newFile",
				"Import Luau you already have",
				"Statements become the flow, expressions become nodes, and anything that will not lower cleanly arrives as a Custom Code node holding the original text, so an import is useful before it is perfect.",
			)}
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
