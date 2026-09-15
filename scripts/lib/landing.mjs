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
import { highlightLuau } from "../../src/app/highlight.ts";
import { nodeColor, pinColor } from "../../src/app/palette.ts";
import { BUILTIN_NODES as ALL_NODES } from "../../src/core/nodes/index.ts";
import { wirePath } from "../../src/app/geometry.ts";
import { NODE } from "../../src/app/layers.ts";
import { faviconHref, logoMarkup } from "../../src/app/logo.tsx";

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
.landing-head { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
/* The mark draws with currentColor, so this is the whole of colouring it. */
.landing-head .logo-mark { color: var(--accent); }
.landing-head h1 { font-size: 24px; margin: 0; letter-spacing: -0.01em; }
.landing-head .tag {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; color: var(--accent);
}
.landing-lede { font-size: 21px; line-height: 1.45; max-width: 36rem; margin: 0 0 10px; }
.landing-sub { color: var(--fg-faint); max-width: 38rem; margin: 0 0 30px; }
.landing-doors { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 12px; padding: 0; list-style: none; }
.landing-doors a {
  display: inline-block; padding: 10px 18px; border-radius: 7px; text-decoration: none;
  border: 1px solid var(--border); background: var(--bg-panel); color: var(--fg);
}
.landing-doors a:hover { border-color: var(--accent); }
.landing-doors a.first { background: var(--accent); border-color: var(--accent); color: #fff; }
.landing-note { font-size: 13px; color: var(--fg-faint); margin: 0 0 56px; }

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
.landing-card h3 { font-size: 14px; margin: 0 0 6px; }
.landing-card p { color: var(--fg-faint); margin: 0; font-size: 14px; }
.landing-card code { font-size: 12px; }
.landing-h2 {
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--fg-faint); margin: 0 0 16px;
}

.landing-foot {
  border-top: 1px solid var(--border); padding-top: 20px;
  display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13px; color: var(--fg-faint);
}
.landing-foot a { color: var(--fg-muted, #8fa6dd); }
`;

export function landingPage(version) {
	const { svg, luau } = example();

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Roswaal — visual scripting for Roblox Luau</title>
<meta name="description" content="Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk and compile to plain Luau that Rojo syncs. Try it in your browser, with nothing installed." />
<link rel="icon" href="${faviconHref()}" />
<link rel="stylesheet" href="docs/theme.css?v=${encodeURIComponent(version)}" />
<style>${STYLE}</style>
</head>
<body class="roswaal-landing">
<div class="landing-glow" aria-hidden="true"></div>
<main class="landing">
  <div class="landing-head">
    ${logoMarkup(24)}
    <h1>Roswaal</h1>
    <span class="tag">preview</span>
  </div>

  <p class="landing-lede">
    Visual scripting for Roblox Luau that compiles to Luau you would have been
    happy to write.
  </p>
  <p class="landing-sub">
    Graphs live on disk as <code>.nodescript</code> files and compile to plain
    <code>.luau</code> that Rojo syncs like any other source file. No plugin, no
    runtime, nothing of Roswaal's left in your game.
  </p>

  <ul class="landing-doors">
    <li><a class="door first" href="try.html">Try it in your browser</a></li>
    <li><a href="docs/">Read the documentation</a></li>
  </ul>
  <p class="landing-note">
    Nothing to install. Open the demo project, or open a folder from your own
    computer and work in it — Chrome and Edge can hand one over.
  </p>

  <div class="landing-show">
    <section class="landing-pane">
      <h2>A graph</h2>
      <div class="landing-graph">${svg}</div>
    </section>
    <section class="landing-pane">
      <h2>What Roswaal writes from it</h2>
      <pre class="landing-code"><code>${luau}</code></pre>
    </section>
  </div>
  <p class="landing-caption">
    Both halves are built from the same graph, by the same compiler the editor
    runs — so the picture cannot show a wiring the code does not have.
  </p>

  <div class="landing-points">
    <div class="landing-card" style="--edge: ${colourOf("script.begin")}">
      <h3>Your graphs are source</h3>
      <p>
        A <code>.nodescript</code> is a file in your repository. Commit it,
        branch it, review it, and read the diff.
      </p>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("math.add")}">
      <h3>The output is ordinary Luau</h3>
      <p>
        Typed, commented and formatted with your own stylua. Roswaal refuses to
        overwrite a generated file you have edited by hand.
      </p>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("roblox.getService")}">
      <h3>Try it on your own project</h3>
      <p>
        The browser version opens a real folder and writes into it, so you can
        find out whether this fits your game before installing anything.
      </p>
    </div>
  </div>

  <h2 class="landing-h2">When a node is not the answer</h2>
  <div class="landing-points">
    <div class="landing-card" style="--edge: ${colourOf("code.custom")}">
      <h3>Custom Code, and Luau Expression</h3>
      <p>
        Two escape hatches, on purpose. Write Luau where writing Luau is
        simpler, and wrap code you already have instead of rebuilding it as
        nodes. The text is emitted verbatim.
      </p>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("value.expression")}">
      <h3>Nodes of your own</h3>
      <p>
        A node pack is a file — JSON, or Luau with comments — that defines nodes
        the way the built-in library defines its own. Design them in the editor,
        commit them, and share them between projects.
      </p>
    </div>
    <div class="landing-card" style="--edge: ${colourOf("debug.print")}">
      <h3>Documented, node by node</h3>
      <p>
        A reference page for every node in the library, with the graph and the
        Luau it compiles to on each one, plus a guide for anyone
        <a href="docs/coming-from-blueprints.html">Coming from Blueprints</a>.
      </p>
    </div>
  </div>

  <div class="landing-foot">
    <span>Roswaal ${escapeHtml(version)} — a preview, ahead of the first release.</span>
    <a href="https://github.com/neopolitans/roswaal-feedback/issues/new">Report something</a>
    <a href="docs/release-notes.html">Release notes</a>
    <a href="docs/attributions.html">Attributions and licence</a>
  </div>
</main>
</body>
</html>
`;
}
