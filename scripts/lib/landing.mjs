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
 * No script of its own. The graph scales by its `viewBox`, the code is
 * highlighted at build time, and a page that is entirely markup cannot break
 * the way `docs.js` broke.
 */

import { buildSite } from "../../src/core/docs/site.ts";
import { escapeHtml } from "../../src/core/docs/html.ts";
import { BUILTIN_NODES, createRegistry } from "../../src/core/nodes/index.ts";
import { growthState } from "../../src/core/nodes/growth.ts";
import { graphSvg } from "../../src/core/docs/preview.ts";
import { SOURCE_REPOSITORY } from "../../src/core/docs/links.ts";
import { highlightLuau } from "../../src/app/highlight.ts";
import { nodeColor, pinColor } from "../../src/app/palette.ts";
import { BUILTIN_NODES as ALL_NODES } from "../../src/core/nodes/index.ts";
import { wirePath } from "../../src/app/geometry.ts";
import { NODE } from "../../src/app/layers.ts";
import { faviconHref, logoMarkup } from "../../src/app/logo.tsx";
import { ICONS } from "../../src/app/icons.tsx";
import {
	CANARY_BANNER, markChipMarkup, MARK_BESIDE_LINK, MARK_LABEL, PREVIEW_BESIDE_LINK,
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
.landing { max-width: min(96vw, 1460px); margin: 0 auto; padding: 7vh 24px 4rem; }

/* A wash of the accent behind the hero, so the first screen is not four greys.
   Fixed and behind everything, and it fades out well before the content does. */
.landing-glow {
  position: fixed; inset: 0 0 auto 0; height: 60vh; pointer-events: none; z-index: -1;
  background:
    radial-gradient(60rem 26rem at 22% -8%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
    radial-gradient(44rem 22rem at 78% -14%, color-mix(in srgb, var(--category-values, #4c7fd4) 14%, transparent), transparent 70%);
}
/* Centred, because it is a masthead rather than the start of a paragraph.
   Everything below the demonstration goes back to being read left to right. */
.landing-top { text-align: center; margin-bottom: 64px; }
.landing-top .landing-targets { margin-left: auto; margin-right: auto; }
.landing-head {
  display: flex; align-items: center; justify-content: center;
  gap: 16px; margin-bottom: 26px;
}
.landing-top .landing-lede,
.landing-top .landing-sub,
.landing-top .landing-note { margin-left: auto; margin-right: auto; }
.landing-doors { justify-content: center; }
/* The mark draws with currentColor, so this is the whole of colouring it. */
.landing-head .logo-mark { color: var(--accent); }
.landing-head h1 { font-size: 34px; margin: 0; letter-spacing: -0.015em; }
.landing-head .tag {
  font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;
  border: 1px solid var(--border); border-radius: 4px; padding: 2px 9px; color: var(--accent);
  align-self: center;
}
.landing-lede { font-size: 30px; line-height: 1.25; max-width: 44rem; margin: 0 0 14px; letter-spacing: -0.015em; }
/* The one claim on the page that is a promise rather than a description. */
/* Its own line: it is a second sentence and the only promise on the page,
   and wrapped mid-phrase it read as an afterthought. */
.landing-lede em { display: block; font-style: normal; color: var(--accent); }
.landing-sub { color: var(--fg-faint); max-width: 40rem; margin: 0 0 30px; font-size: 16px; }
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
.landing-targets .flag,
.landing-doors .flag {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px;
  margin-left: 4px; color: var(--warning, var(--fg-faint));
}
/* On the accent-filled first door, the flag has to read against the accent
   rather than against the page. Its own border, not the page's. */
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

/* The demonstration, stacked rather than in two columns.
   
   A graph is wide and short -- this one is about eight to one -- so putting it
   beside the code halves its width and it renders at a third of its natural
   size, which is a picture of a graph rather than a graph. Full width it is
   near enough life size, and the order it reads in is the order it happens in:
   the flow, then what the flow compiles to. */
.landing-show { display: grid; gap: 18px; grid-template-columns: 1fr; margin-bottom: 14px; }
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
.landing-graph {
  padding: 18px; overflow-x: auto;
  background: var(--bg-canvas);
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
}
.landing-graph svg { min-width: 30rem; }
.landing-graph svg {
  display: block; width: 100%; height: auto;
  /* A tall graph would otherwise push everything else off the screen. Nothing
     is cropped -- the viewBox scales -- it simply stops growing. */
  max-height: 46vh;
}
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
}
.landing-foot a { color: var(--fg-muted, #8fa6dd); }
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

export function landingPage(version, { canary = channelIsCanary() } = {}) {
	const IS_CANARY = canary;
	const { svg, luau } = example();

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${IS_CANARY ? `<meta name="robots" content="noindex" />
` : ""}<title>Roswaal${IS_CANARY ? " canary" : ""} - Visual Scripting for Luau</title>
<meta name="description" content="Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk and compile to plain Luau that Rojo syncs. Try it in your browser, with nothing installed." />
<link rel="icon" href="${faviconHref()}" />
<link rel="stylesheet" href="docs/theme.css?v=${encodeURIComponent(version)}" />
<style>${STYLE}</style>
</head>
<body class="roswaal-landing">
<div class="landing-glow" aria-hidden="true"></div>
<main class="landing">
  <div class="landing-top">
    ${IS_CANARY ? `<p class="landing-canary">
      <span class="flag canary">${escapeHtml(MARK_LABEL.canary)}</span>
      ${escapeHtml(CANARY_BANNER.app)}
      <a href="https://neopolitans.github.io/Roswaal/">${escapeHtml(CANARY_BANNER.wayOut)}</a>
    </p>` : ""}
    <div class="landing-head">
      ${logoMarkup(38)}
      <h1>Roswaal</h1>
      <span class="tag">${escapeHtml(version)}</span>
    </div>

    <p class="landing-lede">
      Visual scripting for Luau, reimagined.
      <em>Completely free, forever.</em>
    </p>
    <p class="landing-sub">
      Graphs live on disk as <code>.nodescript</code> files and compile to plain
      <code>.luau</code> that Rojo syncs like any other source file. No plugin, no
      runtime, nothing of Roswaal's left in your game — and it is 0BSD, so the
      code and the graphs are yours to keep, sell, or walk away with.
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
      Nothing to install. Open the demo project, or open a folder from your own
      computer and work in it — Chrome and Edge can hand one over.
    </p>
    <p class="landing-note">
      That one is a <strong>${IS_CANARY ? "canary" : "preview"}</strong>: the same
      editor over a project kept in your browser${IS_CANARY ? ", built from the unreleased line" : ""}.
      The tool itself runs beside your repository and writes
      <code>.luau</code> files Rojo syncs into Studio.
    </p>
    <p class="landing-targets">
      Compiles for <strong>Roblox</strong> and <strong>Lune</strong>
      <span class="flag">experimental</span> — Roswaal is built and checked
      against Roblox.
    </p>
  </div>

  <div class="landing-show">
    <section class="landing-pane">
      <h2>The graph you see</h2>
      <div class="landing-graph">${svg}</div>
    </section>
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
          The browser version opens a real folder and writes into it, so you can
          find out whether this fits your game before installing anything.
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
      <div class="icon">${icon("folder")}</div>
      <div>
        <h3>Wally packages</h3>
        <p>
          Read <code>wally.toml</code>, resolve <code>Packages/</code>, and
          offer what a package exports as nodes you can place.
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
      <div class="icon">${icon("function")}</div>
      <div>
        <h3>A real Luau parser</h3>
        <p>
          What the importer needs, and two things that already want it: an exact
          check instead of counting brackets, and true block scoping so a local
          declared inside an <code>if</code> stops being offered after it.
        </p>
      </div>
    </div>

    <div class="landing-card planned">
      <div class="icon">${icon("map")}</div>
      <div>
        <h3>Read a Rojo project as a node map</h3>
        <p>
          The inverse of the translation Roswaal already does, so an existing
          <code>default.project.json</code> can come in rather than be rebuilt.
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
    <span>Roswaal ${escapeHtml(version)} — the first public release.</span>
    <a href="https://github.com/neopolitans/roswaal-feedback/issues/new">Report something</a>
    <a href="docs/release-notes.html">Release notes</a>
    <a href="docs/attributions.html">Attributions and licence</a>
  </div>
</main>
</body>
</html>
`;
}
