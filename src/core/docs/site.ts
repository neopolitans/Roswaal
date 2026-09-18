/**
 * The documentation site: one page model, three renderings.
 *
 * The in-app Docs panel, the static site and the daemon's `/docs` all walk the
 * same tree, so they cannot disagree about what the documentation says.
 *
 * ## Why blocks rather than Markdown
 *
 * Markdown would need a parser, and `src/core` has no runtime dependencies and
 * cannot read files — the in-app panel has to work offline, in the browser,
 * with the project's own node packs folded in. A small typed block model costs
 * one afternoon of authoring ergonomics and buys: no dependency, no parse step,
 * identical output in every renderer, and a compiler error rather than a
 * silently mis-rendered page when a block is malformed.
 *
 * Inline markup is deliberately tiny — `code`, **bold**, *italic*, [links] —
 * because a documentation page that needs more than that is usually a page that
 * should be split.
 */

import type { Registry } from "../nodes/index.js";
import { categories, subcategories, ZUP_CONVERSIONS } from "../nodes/index.js";
import { BLUEPRINT_MAP } from "./blueprints.js";
import { documentRegistry, OMISSION_REASONS, stripHeader, type NodeDoc } from "./nodeReference.js";
import { compile } from "../compiler/index.js";
import { previewOf, type NodePreview } from "./preview.js";
import { categoryLabel, defaultConfig, ENGINE_TYPES, type NodeScript } from "../schema.js";
import { LUNE_MODULES, LUNE_ROBLOX_DATATYPES, LUNE_VERSION } from "../luneApi.js";
import { CODE_ROLES, ROLES } from "../theme.js";
import { BUILTIN_THEMES } from "../themeData.js";
import {
	DEPENDENCIES, INSPIRATIONS, NAME_NOTICE, TARGETS, type Attribution,
} from "./attributions.js";
import { CLI_COMMANDS, CLI_OPTIONS } from "./cli.js";
import { classify, type Runtime } from "../nodes/runtimes.js";
import {
	ACTION_ROW, DESIGNER_BAR, DESIGNER_BAR_BROWSER, DESIGNER_BAR_PHONE, DESIGNER_BAR_TABLET, DESIGNER_TOUCH_BAR,
	DOCS_BAR, DOCS_SITE_BAR, DOCS_SITE_BAR_PHONE, DOCS_SITE_BAR_TOUCH, EDITOR_BAR, EDITOR_BAR_BROWSER, EDITOR_BAR_PHONE,
	EDITOR_BAR_TABLET, FUNCTIONS_PANEL, GRAPH_BAR, GRAPH_BAR_PHONE, GRAPH_BAR_TABLET, legendOf,
	MAP_BAR, MODULES_PANEL,
	VARIABLES_PAGE_PANEL, declarationsPanel, type ToolbarSpec,
} from "./toolbars.js";
import {
	DESIGNER_LAYOUT, DESIGNER_LAYOUT_PHONE, DESIGNER_LAYOUT_TOUCH, EDITOR_LAYOUT, EDITOR_LAYOUT_PHONE,
	EDITOR_LAYOUT_TOUCH, listedRegions,
	type LayoutSpec,
} from "./layouts.js";
import { GUIDE_SCENES } from "./examples.js";
import { RELEASES, type Release, type ReleaseSurface } from "./releases.js";
import { reviewerCounts, reviewerLink, reviewOf, type Review } from "./reviews.js";
import { DEMOS, demoLuau } from "./demos.js";
import { ROBLOX_DEMO_GRAPHS, ROBLOX_DEMO_MAP } from "./robloxDemos.js";
import type { NodeMap } from "../nodemap.js";
import { mapFigure } from "./mapFigure.js";

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * What a release carries, and where it lands.
 *
 * Two axes in one row, which is why there are seven of these. The first four
 * are the **kind** of change and three of them are derived: a release with
 * `added` entries is a Feature whether or not anybody says so. `breaking` is the
 * exception, because whether a change breaks somebody is a judgement about their
 * code rather than a property of ours.
 *
 * The last three are the **surface** it touches, and none of them can be
 * derived: "this changed the documentation" is not a fact about the shape of a
 * release note. A release states them, and an absent one means *not stated*
 * rather than *not affected* — they arrived at 0.39.0 and nothing before it was
 * retagged except the releases of that same sitting, which were still in hand.
 */
export type ReleaseTag =
	| "feature" | "change" | "fix" | "breaking"
	| "docs" | "editor" | "designer";

export const SURFACES: readonly ReleaseSurface[] = ["editor", "designer", "docs"];

export const TAG_LABELS: Record<ReleaseTag, string> = {
	feature: "Feature",
	change: "Change",
	fix: "Bugfix",
	breaking: "Breaking change",
	docs: "Docs",
	editor: "Editor",
	designer: "Designer",
};

export type Block =
	/** `aside` sits at the right of the heading: a date, a version, a status. */
	/** `badge` sits right beside the heading's text: "Latest", on the current release. */
	| { t: "h"; level: 2 | 3 | 4; text: string; aside?: string; badge?: string }
	| { t: "p"; text: string }
	| { t: "ul"; items: string[] }
	| { t: "ol"; items: string[] }
	| { t: "code"; lang: "luau" | "sh" | "json" | "ts"; text: string }
	/**
	 * `head` is optional. A comparison table wants column names; a list of
	 * release entries wants the *shape* of a table — ruled rows, one thing per
	 * row — and a header saying "Note" over a single column of notes is a row of
	 * furniture that tells the reader nothing.
	 */
	| { t: "table"; head?: string[]; rows: string[][] }
	/**
	 * What kind of release this was, at a glance, under its version number.
	 *
	 * Derived rather than written, everywhere it can be: a release with a
	 * `fixed` list is a Bugfix whether or not anyone remembered to say so, and a
	 * tag that can disagree with the entries beneath it is worse than no tag.
	 */
	| { t: "tags"; tags: ReleaseTag[] }
	/**
	 * A pulled-out aside. `warn` for a trap, `good` for a promise being kept.
	 *
	 * `items` carries a list inside the box. Release notes want it: "Worth
	 * knowing before you upgrade" is four separate claims, and run together as
	 * one paragraph they were a wall to be read rather than a list to be
	 * scanned. Optional, because most notes are a single thought and a bullet
	 * with nothing to be distinguished from is furniture.
	 */
	| { t: "note"; kind: "info" | "warn" | "good"; text: string; items?: string[] }
	/** Pin tables on a node page, which want their own rendering. */
	| { t: "pins"; title: string; pins: NodeDoc["inputs"] }
	/**
	 * One or more nodes drawn as they appear on the canvas.
	 *
	 * A list rather than a single node because the useful case is nearly always
	 * a comparison — Custom Code beside Luau Expression, a getter beside a
	 * setter — and two pictures side by side answer "which one do I want" in a
	 * way that two pictures a paragraph apart do not.
	 */
	| { t: "preview"; nodes: NodePreview[]; caption?: string }
	/**
	 * A whole graph — nodes where they were placed, and the wires between
	 * them.
	 *
	 * A `preview` block is a row of separate nodes, which answers "which one
	 * is it" but not "how do they go together". A guide explaining Branch is
	 * explaining the shape: which pin the false arm leaves from, where the
	 * wire lands. Two pictures side by side leave the reader to do the joining
	 * the picture was meant to do for them.
	 *
	 * It carries a real `NodeScript`, so the same graph can be drawn here and
	 * compiled for the code block underneath it — the picture and the Luau
	 * cannot describe different graphs.
	 */
	| {
			t: "graph";
			script: NodeScript;
			caption?: string;
			/**
			 * The Variables panel as this graph would show it, beside the picture.
			 *
			 * A drawn graph shows what the nodes do and not where their names came
			 * from: `fs.readFile` is on the canvas and `fs` is declared in a panel
			 * that is not in the picture. Built by `declarationsPanel` from the
			 * graph itself, so the two halves cannot describe different graphs.
			 */
			panel?: ToolbarSpec;
	  }
	/**
	 * A node map drawn beside what it produces, the two halves linked.
	 *
	 * The same promise the `graph` block makes: it carries a real `NodeMap`, so
	 * the tree in the picture and the project file beside it are the tree and
	 * the file Roswaal would actually write. A map page cannot end up
	 * describing a shape the compiler does not produce.
	 */
	| { t: "nodemap"; map: NodeMap; caption?: string }
	/**
	 * A fold: a summary line that opens onto more blocks. `<details>` in both
	 * renderers, so a page can hold a long history without making every reader
	 * scroll past all of it. `aside` sits at the right of the summary, as a
	 * heading's does. `open` starts it unfolded; a reader can still close it.
	 */
	| {
			t: "details";
			summary: string;
			aside?: string;
			open?: boolean;
			blocks: Block[];
			/**
			 * Part of the history from before Roswaal was public.
			 *
			 * Hidden unless the reader asks, by the toggle below. Marked rather
			 * than left out: the reasoning in those entries is still the reasoning
			 * behind the tool, and somebody who wants it should not have to go to
			 * the repository for it.
			 */
			prerelease?: boolean;
	  }
	| { t: "tabs"; label?: string; tabs: DocTab[] }
	/**
	 * A checkbox on the page, wired to one of the reader's preferences.
	 *
	 * The settings popover is for what a reader sets once and forgets. This is
	 * for a choice that belongs beside the thing it changes: the pre-release
	 * notes are only worth thinking about while looking at the release notes.
	 *
	 * `pref` names the preference, which is where the answer is kept, so it
	 * survives the page and is the same answer in the editor's own Docs window.
	 */
	| { t: "toggle"; pref: "showPreReleaseNotes"; label: string; hint?: string }
	/**
	 * A bar of the tool, drawn as it appears, with every control named
	 * underneath it.
	 *
	 * The chrome is nearly all icons, and an icon is unreadable exactly once —
	 * on the first day, which is the day the documentation is for. Prose cannot
	 * carry it: "the palette icon" only helps somebody who already knows which
	 * one that is, and a table of names loses the thing the reader is actually
	 * matching against, which is the order the buttons sit in.
	 *
	 * So the block draws the real bar and lists the real controls beneath it,
	 * both out of one spec in `toolbars.ts` — the picture and the legend cannot
	 * describe different bars.
	 */
	/**
	 * A whole window as a labelled diagram: where each part of the screen is,
	 * numbered, with a legend. The page before Toolbars, drawn from a spec in
	 * `layouts.ts` into the same figure and legend a toolbar uses.
	 */
	| { t: "layout"; layout: LayoutSpec; caption?: string; hint?: boolean }
	| {
			t: "toolbar";
			bar: ToolbarSpec;
			caption?: string;
			/**
			 * Say that the picture and the list point at each other.
			 *
			 * Set on the first bar of a page and nowhere else: it is an
			 * instruction for something a reader discovers the moment they move
			 * the pointer, and five copies of it down one page is furniture. Both
			 * renderers hide it until the script has claimed the figure, so it is
			 * never a promise the page cannot keep.
			 */
			hint?: boolean;
	  };

export interface DocPage {
	slug: string;
	title: string;
	/** One line, used in the nav and as the search result's subtitle. */
	summary: string;
	blocks: Block[];
	/** Set on a generated node page, so the panel can link back to the palette. */
	nodeId?: string;
	/** True for a page documenting a node from this project's own packs. */
	custom?: boolean;
	/**
	 * Which runtime this node needs, for the tag beside the title.
	 *
	 * Set on a node's page and nowhere else: a guide is about an idea rather
	 * than about something that runs, and tagging *Wires and pins* with a
	 * runtime would be answering a question nobody asked of it.
	 */
	runtime?: Runtime;
	/**
	 * The module the *other* runtime needs to have this.
	 *
	 * A second tag rather than a different one. `Vector3` is Roblox's datatype
	 * and Lune implements it, so "Luau" would be the wrong single answer — it
	 * says the base language has it, and the base language does not.
	 */
	runtimeVia?: string;
	/**
	 * Set on a page that is mostly prose.
	 *
	 * A wide page caps its paragraphs at a reading measure while its tables run
	 * full width, which is right for a reference and wrong for an essay: on a
	 * page with no tables it leaves the text hugging the left of a box whose
	 * rules and notes span the whole thing, and reads as three different right
	 * edges. A narrow page sets the measure once, on the article, so everything
	 * shares an edge.
	 */
	narrow?: boolean;
	/**
	 * Whether a person has read this page, and when. Set by `buildSite` on
	 * every page but a pack's; see `reviews.ts`.
	 */
	review?: Review;
}

/**
 * One switch, several answers to the same question.
 *
 * For a page whose subject has more than one route through it — three ways to
 * define a custom node — where the reader wants *their* route rather than all
 * of them in a row. Everything stays in the page: the static site renders every
 * panel and switches with a radio, so the text is there with no script, and the
 * search index walks into every tab rather than only the open one.
 */
/** A kind of screen a tab is for. Desktop is split by which build it is. */
export type TabDevice = "localhost" | "webapp" | "tablet" | "phone";

export interface DocTab {
	/** Stable, and part of the radio's name in the static build. */
	id: string;
	title: string;
	/**
	 * The screens this tab is for. A page opens on the tab for the reader's
	 * own, and marks it; see `src/app/docsDevice.ts`.
	 */
	device?: TabDevice[];
	blocks: Block[];
}

export interface DocSection {
	title: string;
	slug: string;
	pages: DocPage[];
	/**
	 * The nav heading this section sits under.
	 *
	 * Two levels rather than one because the node reference is the bulk of the
	 * site and a pack's nodes are a different kind of thing from the built-in
	 * library — finding out a node came from your own pack by clicking into a
	 * category is finding out too late.
	 */
	group: string;
}

export const GROUPS = {
	learn: "Learn",
	builtin: "Built-in nodes",
	/**
	 * The Roblox datatypes, lifted out of the built-in list into their own
	 * heading.
	 *
	 * They are built-in nodes like any other, and they get a group of their own
	 * because the useful unit for them is the *type* rather than the category:
	 * somebody looking for a Color3 operation is looking for Color3, not
	 * scrolling a hundred-entry "Engine Types" section hoping to recognise one.
	 * The nav already nests group inside section inside page, so this needed no
	 * new level — only the right thing put on each one.
	 */
	engineTypes: "Engine types",
	/**
	 * Nodes for bringing values across from another tool's coordinates. A
	 * heading of their own, so somebody arriving with data to convert finds
	 * them without guessing which category a conversion would be filed under.
	 */
	conversions: "Conversions",
	project: "Project nodes",
} as const;

export interface DocSite {
	sections: DocSection[];
}

// ---------------------------------------------------------------------------
// Inline markup
// ---------------------------------------------------------------------------

export type Inline =
	| { t: "text"; text: string }
	| { t: "code"; text: string }
	| { t: "strong"; text: string }
	| { t: "em"; text: string }
	| { t: "link"; text: string; href: string };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;

/**
 * A line break, for the code samples written out in this file.
 *
 * As a code unit rather than an escape, the way `PageEditor.tsx` does it: these
 * pages are edited by tools as often as by hand, and an escape sequence is one
 * more thing that has to survive every one of them intact.
 */
const NEWLINE = String.fromCharCode(10);

/**
 * Splits a string into inline runs. Deliberately non-recursive: no bold inside
 * a link, no code inside bold. Every renderer gets the same answer because they
 * all call this rather than each running their own regexes.
 */
export function parseInline(text: string): Inline[] {
	const out: Inline[] = [];
	let last = 0;

	for (const match of text.matchAll(INLINE)) {
		const at = match.index;
		if (at > last) out.push({ t: "text", text: text.slice(last, at) });
		const token = match[0];

		if (token.startsWith("`")) {
			out.push({ t: "code", text: token.slice(1, -1) });
		} else if (token.startsWith("**")) {
			out.push({ t: "strong", text: token.slice(2, -2) });
		} else if (token.startsWith("*")) {
			out.push({ t: "em", text: token.slice(1, -1) });
		} else {
			const split = token.indexOf("](");
			out.push({
				t: "link",
				text: token.slice(1, split),
				href: token.slice(split + 2, -1),
			});
		}
		last = at + token.length;
	}

	if (last < text.length) out.push({ t: "text", text: text.slice(last) });
	return out;
}

/**
 * True when a link points at another page of these docs rather than off-site:
 * a bare slug, like `types` or `node/math.add`. A slug is not a URL in any of
 * the three renderers, so each turns one into its own kind of navigation.
 */
export function isPageLink(href: string): boolean {
	return !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#") && !href.startsWith("/");
}

/** The words in a block, with markup removed. Feeds the search index. */
export function blockText(block: Block): string {
	switch (block.t) {
		case "h":
			return [block.text, block.badge ?? "", block.aside ?? ""].join(" ").trim();
		case "p":
			return parseInline(block.text).map((i) => i.text).join("");
		case "ul":
		case "ol":
			return block.items.map((i) => parseInline(i).map((x) => x.text).join("")).join(" ");
		case "code":
			return block.text;
		case "table":
			return [...(block.head ?? []), ...block.rows.flat()].join(" ");
		case "tags":
			return block.tags.map((tag) => TAG_LABELS[tag]).join(" ");
		case "note":
			return [block.text, ...(block.items ?? [])]
				.map((t) => parseInline(t).map((i) => i.text).join(""))
				.join(" ");
		case "pins":
			return block.pins.map((p) => `${p.name} ${p.type ?? ""}`).join(" ");
		case "preview":
			return [...block.nodes.map((n) => n.title), block.caption ?? ""].join(" ").trim();
		case "graph":
			// The node ids rather than their titles: titles need a registry, and
			// an id is what somebody searching for a node in a guide will type.
			return [...block.script.nodes.map((n) => n.def), block.caption ?? ""]
				.join(" ").trim();
		case "toggle":
			// The label, not the hint. Somebody searching for "pre-release" should
			// land on the page that has the switch for them.
			return block.label;
		case "nodemap":
			// The names in the tree, which is what somebody looks for: they are
			// the services and folders a reader recognises from their own project.
			// The generated JSON is not indexed -- searching the documentation for
			// `$className` should find the page that explains it, not every page
			// that happens to draw a map.
			return [...mapFigure(block.map).rows.map((r) => r.name), block.caption ?? ""]
				.join(" ").trim();
		case "details":
			return [block.summary, block.aside ?? "", ...block.blocks.map(blockText)].join(" ").trim();
		case "tabs":
			return [
				block.label ?? "",
				...block.tabs.flatMap((tab) => [tab.title, ...tab.blocks.map(blockText)]),
			].join(" ").trim();
		case "layout":
			return [
				block.layout.title,
				block.layout.summary,
				...listedRegions(block.layout).flatMap((r) => [r.name, r.where ?? "", r.what ?? ""]),
			].join(" ").trim();
		case "toolbar":
			// The legend, not the drawing. Somebody who cannot find Node Design
			// searches for "Node Design", and the control's name is the only place
			// on the page those two words sit together.
			return [
				block.bar.title,
				block.bar.summary,
				...legendOf(block.bar).flatMap((item) => [
					item.name,
					item.where ?? "",
					parseInline(item.what ?? "").map((i) => i.text).join(""),
				]),
				block.caption ?? "",
			].join(" ").replace(/\s+/g, " ").trim();
	}
}

// ---------------------------------------------------------------------------
// Generated pages
// ---------------------------------------------------------------------------

/**
 * A preview block for named nodes, in the order they are named.
 *
 * A node that is not in this registry is skipped rather than drawn as a gap: a
 * guide is written against the built-in library, and a project that has trimmed
 * it should lose the picture, not the page.
 */
function previews(registry: Registry, ids: string[], caption?: string): Block[] {
	const nodes = ids
		.map((id) => registry.get(id))
		.filter((def): def is NonNullable<typeof def> => def !== undefined)
		// Wrapped, not point-free: `previewOf` takes a config second and `map`
		// would hand it the index.
		.map((def) => previewOf(def));
	return nodes.length > 0 ? [{ t: "preview", nodes, caption }] : [];
}

/**
 * How a node page says which runtime it is for.
 *
 * Every page says it, including the base-Luau ones. Left unsaid, "works in
 * both" is indistinguishable from "nobody has decided" — which is what 237 of
 * them meant until 0.61.0, and the reader had no way to tell.
 */
const RUNTIME_TRAIT: Record<Runtime, string> = {
	luau: "the language itself, so it works in Roblox and in Lune",
	roblox: "needs the Roblox engine — its datatypes, its DataModel or its scheduler",
	lune: "needs Lune, the standalone Luau runtime",
};

function nodePage(doc: NodeDoc): DocPage {
	const blocks: Block[] = [];

	const traits: string[] = [];
	// Which runtime, on every page rather than only where it is restricted.
	// Said nowhere, "base Luau" and "nobody has checked" look identical -- and
	// for 237 nodes they were the same thing until 0.61.0.
	//
	// The tag beside the title names it; this says what it means. Two forms of
	// one fact, which is what a reference page is for: one to scan, one to
	// read.
	/**
	 * A Roblox datatype that works in Lune is not "the language itself".
	 *
	 * `Vector3` compiles in both, so it classifies as Luau and the filter is
	 * right to treat it that way — but the plain Luau sentence would be a claim
	 * this node cannot make. It is Roblox's datatype, and Lune has it because
	 * `@lune/roblox` implements it and you required it.
	 */
	const crossOver =
		doc.category === ENGINE_TYPES && doc.subcategory !== undefined &&
		LUNE_ROBLOX_DATATYPES.includes(doc.subcategory);
	traits.push(crossOver
		? "Roblox's, and Lune's too — a Lune graph needs `@lune/roblox` required for it"
		: RUNTIME_TRAIT[classify(doc)]);
	if (doc.pure) traits.push("pure — no execution pins, wire it anywhere");
	if (doc.latent) traits.push("latent — it yields, and is never inlined");
	if (doc.role === "entry") traits.push("an entry point: nothing wires into it");
	if (doc.role === "terminal") traits.push("terminal — it ends the flow it is in");
	if (doc.variadic) {
		traits.push(`takes ${doc.variadic.min} to ${doc.variadic.max} inputs, set per node`);
	}
	// Anything that hands back a value can name the local it binds. Said on the
	// node's own page rather than only on Variables and locals, because the
	// place somebody wonders what to call a result is the node giving them one
	// -- and the pairing with Declare Local is worth saying before they find
	// two locals where they wanted one.
	if (
		(doc.compiles === "call" || doc.compiles === "expr")
		&& doc.outputs.some((pin) => pin.kind === "data")
	) {
		traits.push(
			"names its result — **Result name** in the Inspector is the local it binds, and a " +
			"Declare Local reading that result makes a second one: see " +
			"[Variables and locals](variables-and-locals)",
		);
	}

	// The summary is already the page's standfirst; repeating it as the first
	// paragraph just makes the reader check whether the two differ.
	// Before anything else: somebody arriving here from a search is usually
	// checking they have the right node, and the shape answers that faster than
	// the first paragraph does.
	blocks.push({ t: "preview", nodes: [doc.preview] });

	if (traits.length > 0) blocks.push({ t: "ul", items: traits });

	if (doc.inputs.length > 0) blocks.push({ t: "pins", title: "Inputs", pins: doc.inputs });
	if (doc.outputs.length > 0) blocks.push({ t: "pins", title: "Outputs", pins: doc.outputs });

	blocks.push({ t: "h", level: 3, text: "What it compiles to" });
	if (doc.example) {
		// The scene first, then its output. Both come from one graph, so the
		// picture cannot show a wiring the Luau underneath does not have.
		if (doc.exampleGraph) {
			blocks.push({
				t: "graph",
				script: doc.exampleGraph,
				caption: "The graph this output was compiled from.",
			});
		}
		blocks.push({ t: "code", lang: "luau", text: doc.example });
		if (doc.exampleNote) blocks.push({ t: "note", kind: "info", text: doc.exampleNote });
	} else if (doc.exampleOmitted) {
		blocks.push({ t: "note", kind: "info", text: OMISSION_REASONS[doc.exampleOmitted] });
	}

	// A code pin is literal-only too, but its type already says so and the node
	// is named for it — warning about Custom Code's Code pin would be noise.
	const pasted = [...doc.inputs].filter((p) => p.literalOnly && !p.code);
	if (pasted.length > 0) {
		blocks.push({
			t: "note",
			kind: "warn",
			text:
				`${pasted.map((p) => `**${p.name || p.id}**`).join(", ")} ` +
				(pasted.length === 1 ? "is" : "are") +
				" typed in directly and pasted into the generated source, so it cannot be wired " +
				"from a value. The editor refuses the connection rather than letting it fail at " +
				"compile time.",
		});
	}

	return {
		slug: `node/${doc.id}`,
		title: doc.title,
		summary: doc.summary ?? `${categoryLabel(doc.category)} node.`,
		blocks,
		nodeId: doc.id,
		custom: doc.custom,
		// Its own runtime, not the averaged one: `Vector3` is Roblox's, and the
		// second tag says the other runtime borrows it and through what.
		runtime: crossOver ? "roblox" : classify(doc),
		...(crossOver ? { runtimeVia: "@lune/roblox" } : {}),
	};
}

function blueprintPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"If you have written Blueprints, most of Roswaal is already familiar and the rest is " +
				"a rename. This page is the rename, plus the parts that genuinely have no counterpart.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"**Where there is no equivalent, this page says so.** Being told up front that " +
				"Construction Scripts do not exist here is worth more than forty minutes spent " +
				"looking for them.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"Unreal, Unreal Engine and Blueprint are trademarks or registered trademarks of " +
				"Epic Games, Inc. in the United States of America and elsewhere. They are used on " +
				"this page to name Epic's product while explaining Roswaal's. Roswaal is not " +
				"affiliated with, sponsored by, or endorsed by Epic Games, Inc., and contains no " +
				"code or content from Unreal Engine.",
		},
	];

	for (const section of BLUEPRINT_MAP) {
		blocks.push({ t: "h", level: 2, text: section.title });
		blocks.push({ t: "p", text: section.blurb });
		blocks.push({
			t: "table",
			head: ["In Unreal", "In Roswaal", "Notes"],
			rows: section.entries.map((e) => [
				e.unreal,
				e.roswaal ?? "— nothing equivalent —",
				e.note ?? "",
			]),
		});
	}

	// Types last: the sections above are about doing things, this one about
	// what the values are.
	blocks.push(
		{ t: "h", level: 2, text: "Types" },
		{
			t: "p",
			text:
				"Most of these are a rename. The rows worth reading slowly are the ones with a " +
				"dash in the middle column: Luau has no Rotator, no Quat, and no typed containers, " +
				"and those absences change how you write things rather than just what you call them.",
		},
		{
			t: "table",
			head: ["In Unreal", "Luau / Roblox", "Roswaal pin", "Notes"],
			rows: [
				["`bool`", "`boolean`", "`boolean`", ""],
				[
					"`int32`, `int64`",
					"`number`",
					"`number`",
					"Luau has **one** number type, a 64-bit float. No integer type, so bitwise work goes through `bit32` and there is no integer overflow to reason about.",
				],
				["`float`, `double`", "`number`", "`number`", "The same type as the row above."],
				[
					"`FString`, `FName`, `FText`",
					"`string`",
					"`string`",
					"One string type. No localisation type — Roblox handles that at the UI layer.",
				],
				[
					"`FVector`",
					"`Vector3`",
					"`Vector3`",
					"**Different conventions.** Unreal is centimetres and Z-up; Roblox is studs and **Y-up**. Vertical is `Y` here. [Vector3 from Z-Up](node/zup.vector3) converts a position across.",
				],
				["`FVector2D`", "`Vector2`", "`Vector2`", ""],
				[
					"`FRotator`",
					"a `CFrame`'s rotation",
					"`CFrame`",
					"Roblox has no Euler rotation type; rotation lives inside a `CFrame`. [CFrame from Z-Up Rotator](node/zup.rotator) converts a rotator across, degrees and axes both.",
				],
				[
					"`FTransform`",
					"`CFrame`",
					"`CFrame`",
					"A CFrame is position and rotation only — **no scale**. [CFrame from Z-Up Transform](node/zup.transform) converts one and hands its scale back, for the part's `Size`.",
				],
				[
					"`FQuat`",
					"a `CFrame`'s rotation",
					"`CFrame`",
					"No quaternion type, but a CFrame can be built from one. [CFrame from Z-Up Rotation](node/zup.rotation) converts a quat across, and **From Axis Angle** covers most of what one was reached for.",
				],
				[
					"`FLinearColor`, `FColor`",
					"`Color3`",
					"`Color3`",
					"Components are 0–1. `Color3.fromRGB` takes 0–255 if that is what you have.",
				],
				[
					"`TArray<T>`",
					"`{ T }`",
					"`table`",
					"Luau has one table type for arrays and maps both, and the Roswaal pin does not carry the element type. **Cast Array** is how you say what is in it.",
				],
				["`TMap<K, V>`", "`{ [K]: V }`", "`table`", "The same type as an array."],
				["`TSet<T>`", "`{ [T]: true }`", "`table`", "A table used as a set, by convention."],
				["`UObject*`, `AActor*`", "`Instance`", "`Instance`", "A class such as `Model` narrows it. **Is A** asks at runtime."],
				[
					"`TSubclassOf<T>`",
					"`string`",
					"`string`",
					"A class name is just text: `Instance.new(\"Part\")`, `:IsA(\"BasePart\")`.",
				],
				[
					"`USTRUCT`",
					"a table, or a Roblox value type",
					"`table`",
					"Luau has no struct declaration. The built-in value types are the exception.",
				],
				[
					"`UENUM`",
					"`Enum.X` for Roblox's own",
					"`string`",
					"No user-defined enums. A string pin with a dropdown is the usual stand-in.",
				],
				[
					"Delegate, Event Dispatcher",
					"`RBXScriptSignal`",
					"`RBXScriptSignal`",
					"**Connect Event** binds one.",
				],
				[
					"`TOptional<T>`",
					"`T?`",
					"—",
					"Optionality is a Luau type annotation rather than a pin type. Cast to `T?` where it matters.",
				],
				[
					"`nullptr`",
					"`nil`",
					"the Nil node",
					"A missing value, not a null pointer — there are no pointer types.",
				],
				[
					"`TSharedPtr`, `UPROPERTY` lifetime",
					"garbage collected",
					"—",
					"An instance survives while something references it **or** it is parented into the DataModel. Destroy severs both.",
				],
			],
		},
	);

	return {
		slug: "coming-from-blueprints",
		title: "Coming from Blueprints",
		summary: "What the thing you already know is called here, and what is genuinely missing.",
		blocks,
	};
}

/**
 * Who made what Roswaal is built on, and what it is named after.
 *
 * A page rather than only `ATTRIBUTIONS.md`, because the people who need to read it
 * are not all reading the repository — and because the naming statement is a
 * thing to say where users are, not to file where auditors are.
 */
function attributionsPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Roswaal is 0BSD — see the end of this page — but it writes for " +
				"languages and platforms that are not ours, it stands on work that is " +
				"not, and it is named after characters that are not ours. All three " +
				"are listed here.",
		},
		{ t: "h", level: 2, text: NAME_NOTICE.title },
	];

	for (const line of NAME_NOTICE.body) blocks.push({ t: "p", text: line });

	/**
	 * Two headings, because they are two different claims. Everything under the
	 * first ships inside Roswaal or is something it could not run without; the
	 * second is work it only learned from. Listing an inspiration under "built
	 * on" would claim a relationship that does not exist.
	 */
	const group = (
		heading: string, lede: string, entries: Attribution[], what = "Project",
	) => {
		if (entries.length === 0) return;
		blocks.push({ t: "h", level: 2, text: heading });
		blocks.push({ t: "p", text: lede });
		blocks.push({
			t: "table",
			head: [what, "By", "Licence"],
			rows: entries.map((a) => [
				a.url ? `[${a.name}](${a.url})` : a.name,
				a.holder ?? "—",
				a.licence ?? "not licensed to us",
			]),
		});
		for (const entry of entries) {
			blocks.push({ t: "h", level: 3, text: entry.name });
			blocks.push({ t: "p", text: entry.note });
			blocks.push({ t: "p", text: `**Where:** ${entry.where}` });
			if (entry.quote) blocks.push({ t: "note", kind: "info", text: `"${entry.quote}"` });
		}
	};

	/**
	 * First, because it is the one a reader needs before the others make sense
	 * -- and because Roblox's class names are all over the editor, which is a
	 * thing to explain rather than leave to be inferred.
	 */
	group(
		"What Roswaal is designed for",
		"The languages and runtimes the generated code is written for. Nothing of " +
			"theirs is bundled here and nothing of theirs is licensed to Roswaal; " +
			"they are named because that is what the output is **for**, and because " +
			"a reader seeing these names throughout the editor is owed the sentence " +
			"saying whose they are.",
		TARGETS,
		"Platform",
	);
	group(
		"What Roswaal is built on",
		"Code and assets that ship inside Roswaal, or that it could not run without.",
		DEPENDENCIES,
	);
	group(
		"What Roswaal is inspired by",
		"Work Roswaal learned from and does **not** use. No code, no assets, no " +
			"dependency — only conventions a reader might recognise, named here so " +
			"the resemblance is explained rather than left to be guessed at.",
		INSPIRATIONS,
	);

	blocks.push({ t: "h", level: 2, text: "Roswaal itself" });
	blocks.push({
		t: "note",
		kind: "good",
		text:
			"Everything in this repository that is Roswaal's own is **0BSD**: use it, " +
			"modify it, ship it, train on it, no attribution required. The list above " +
			"is what that does *not* cover.",
	});

	return {
		slug: "attributions",
		title: "Attributions",
		summary: "What Roswaal is built on, who made it, and what the names are.",
		narrow: true,
		blocks,
	};
}

/**
 * What to tag a release, from what it actually contains.
 *
 * Derived, so a tag cannot claim something the entries below it do not show.
 * `breaking` is the exception and comes from the release, because whether a
 * change breaks somebody is a judgement about their code rather than a fact
 * about ours.
 */
export function releaseTags(release: Release): ReleaseTag[] {
	const tags: ReleaseTag[] = [];
	if (release.breaking) tags.push("breaking");
	if (release.added?.length) tags.push("feature");
	if (release.changed?.length) tags.push("change");
	if (release.fixed?.length) tags.push("fix");
	// The surfaces last, and in one order however they were listed: a tag row
	// that reshuffles between releases is a row you read twice.
	for (const surface of SURFACES) {
		if (release.affects?.includes(surface)) tags.push(surface);
	}
	return tags;
}

/**
 * One release: its version headed at `level`, and its sections a level below.
 * 2 and 3 for the release shown in full; 3 and 4 inside a fold.
 */
function releaseBlocks(
	release: Release, titles: ReadonlyMap<string, string>, level: 2 | 3, latest = false,
): Block[] {
	const sub = level === 2 ? 3 : 4;
	const blocks: Block[] = [{
		t: "h", level, text: release.version, aside: release.date,
		...(latest ? { badge: "Latest" } : {}),
	}];

	const tags = releaseTags(release);
	if (tags.length > 0) blocks.push({ t: "tags", tags });

	blocks.push({ t: "p", text: release.headline });

	if (release.watch) {
		blocks.push({
			t: "note",
			kind: "warn",
			text: "**Worth knowing before you upgrade.**",
			items: release.watch,
		});
	}
	// One entry per row rather than per bullet. A release note is a list of
	// separate claims, and a rule between them reads as separate in a way a
	// dot does not once an entry runs to four lines — which they do.
	for (const [heading, entries] of [
		["Added", release.added],
		["Changed", release.changed],
		["Fixed", release.fixed],
	] as const) {
		if (!entries || entries.length === 0) continue;
		blocks.push({ t: "h", level: sub, text: heading });
		blocks.push({ t: "table", rows: entries.map((entry) => [entry]) });
	}
	// Articles a person read, or checked end to end, in this release.
	for (const [heading, slugs] of [
		["Reviewed Articles", release.reviewed],
		["Verified Articles", release.verified],
	] as const) {
		if (!slugs || slugs.length === 0) continue;
		blocks.push({ t: "h", level: sub, text: heading });
		blocks.push({
			t: "table",
			rows: slugs.map((slug) => [`[${titles.get(slug) ?? slug}](${slug})`]),
		});
	}
	return blocks;
}

function releasesPage(titles: ReadonlyMap<string, string>): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"What changed, and what it changes for you. An entry earns its place by " +
				"altering what a reader would do — a refactor with no visible effect is not here.",
		},
	];

	// Every release folds into its minor version — 0.29.x, 0.28.x — newest
	// first: a reader after a particular version finds it by major and minor,
	// and scrolling past twenty patch releases to get there had become most of
	// the page. The newest minor version starts open, so the current release is
	// read beside its siblings rather than apart from them, marked Latest.
	const minors = new Map<string, Release[]>();
	for (const release of RELEASES) {
		const minor = release.version.split(".").slice(0, 2).join(".") + ".x";
		minors.set(minor, [...(minors.get(minor) ?? []), release]);
	}
	/**
	 * Roswaal became something other people could run at 0.59.2.
	 *
	 * Everything before it was written while nobody else could, and reads that
	 * way: entries about decisions nobody had to live with yet. It is kept,
	 * because the reasoning is still the reasoning behind the tool — and hidden
	 * by default, because somebody looking for what changed last week should
	 * not scroll two years of a private project to find it.
	 */
	const PUBLIC_FROM = [0, 59];
	const isPreRelease = (minor: string): boolean => {
		const [major, second] = minor.split(".").map((part) => Number.parseInt(part, 10));
		if (!Number.isFinite(major) || !Number.isFinite(second)) return false;
		return major < PUBLIC_FROM[0] || (major === PUBLIC_FROM[0] && second < PUBLIC_FROM[1]);
	};

	blocks.push({
		t: "toggle",
		pref: "showPreReleaseNotes",
		label: "Show the notes from before Roswaal was public",
		hint:
			"Everything up to 0.59.1, written while nobody else could run it. Kept because the " +
			"reasoning in it is still the reasoning behind the tool.",
	});

	[...minors].forEach(([minor, releases], index) => {
		blocks.push({
			t: "details",
			summary: minor,
			aside: `${releases.length} ${releases.length === 1 ? "release" : "releases"} · ${releases[0].date}`,
			open: index === 0,
			...(isPreRelease(minor) ? { prerelease: true } : {}),
			blocks: releases.flatMap((release) =>
				releaseBlocks(release, titles, 3, release === RELEASES[0]),
			),
		});
	});

	return {
		slug: "release-notes",
		title: "Release notes",
		summary: "What changed in each version, newest first.",
		narrow: true,
		blocks,
	};
}

// ---------------------------------------------------------------------------
// Hand-written pages
// ---------------------------------------------------------------------------

/**
 * How to work on Roswaal itself. Written from the repository's own scripts
 * and rules — `package.json`, the release-notes test, the review ledger — so
 * every instruction here is one a reader can check against the code.
 */
const CONTRIBUTING: DocPage = {
	slug: "contributing",
	narrow: true,
	title: "Contributing",
	summary: "Building Roswaal, what a change brings with it, and where help is wanted.",
	blocks: [
		{
			t: "p",
			text:
				"Roswaal lives at [github.com/neopolitans/Roswaal](https://github.com/neopolitans/Roswaal). " +
				"It is 0BSD, and so is anything contributed to it.",
		},

		{ t: "h", level: 2, text: "Building it" },
		{
			t: "code",
			lang: "sh",
			text: [
				"npm install",
				"npm run dev          # the daemon and the editor, reloading as you edit",
				"npm test             # the test suite",
				"npm run typecheck",
				"npm run build        # themes, the editor and the command line",
				"npm run build:docs   # these docs, as a static site",
			].join("\n"),
		},

		{ t: "h", level: 2, text: "What a change brings with it" },
		{
			t: "ul",
			items: [
				"**Tests**, in `tests/`, run with `npm test`.",
				"**A release-notes entry** in `src/core/docs/releases.ts`, saying what changed, and the version bumped in `version.json` and `package.json`. A test fails when the notes and the version disagree.",
				"**The reasoning**, where a later reader will find it: a comment on the code it explains, and the pull request. The maintainer's working notes, the architecture map and the wording rules are kept out of the repository until they have been read through for publication.",
				"**Words that name the result.** A label, a heading or a message says what happened, not which rule produced it.",
			],
		},

		{ t: "h", level: 2, text: "Reviewing the docs" },
		{
			t: "p",
			text:
				"Every page starts as **Pending review**. Someone who has read it marks it " +
				"**Reviewed**; someone who has checked it against the editor end to end marks it " +
				"**Verified**. Both are dated entries in `src/core/docs/reviews.ts`, and a reviewed " +
				"page can say what a verified pass still needs.",
		},
		{
			t: "ul",
			items: [
				"`npm run docs:reviews` lists where every page stands, oldest review first.",
				"List the page under **Reviewed Articles** or **Verified Articles** in that release's notes. A test holds the two together.",
				"When a page changes enough to need reading again, take its entry out.",
			],
		},
		{
			t: "note",
			kind: "good",
			text:
				"**Every page carries a Suggest an edit button at its foot**, which opens the page's " +
				"own text to rewrite and sends the result as a prefilled issue. It is the way in for " +
				"somebody who is *reading* the documentation rather than building Roswaal — the " +
				"pages are TypeScript in this repository, so there is nothing on a reader's machine " +
				"for them to edit — and it works from the published site as well as from the editor.",
		},

		{ t: "h", level: 2, text: "Where help is wanted" },
		{
			t: "note",
			kind: "good",
			text:
				"**Lune comes first.** Where possible and feasible, Bugfixes and Features for Lune " +
				"will be prioritized. ROBLOX Studio documentation and developer resources are rich " +
				"enough at this time to sustain development, but fixes and features will still be " +
				"considered.",
		},
		{
			t: "ul",
			items: [
				"**Lune.** The Lune target is experimental, and has not yet been tested by an experienced Lune developer.",
				"**Aliases and .luaurc.** The page at [Aliases and .luaurc](aliases) is written from " +
					"the RFC and from what Roswaal does with it. Someone who has shipped a Lune " +
					"project with a real alias map should check it — particularly a project with " +
					"more than one `.luaurc`, since inheritance and relative paths agree with the " +
					"simple case right up until they do not.",
				"**Networking on Coming from Blueprints.** The rows on replicated functions need checking by someone who has shipped multiplayer.",
				"**Node reference pages.** Every one is still pending review.",
			],
		},

		{ t: "h", level: 2, text: "Reviewers" },
		...reviewerBlocks(),
	],
};

/**
 * Everyone credited with a review, as links to their GitHub accounts. Built
 * from the ledger, so a new reviewer appears here the moment their name is on
 * a review rather than when somebody remembers to add them.
 */
function reviewerBlocks(): Block[] {
	const reviewers = reviewerCounts();
	const how =
		"Credit a review by adding your GitHub account name to its `reviewers` in " +
		"`src/core/docs/reviews.ts`.";
	if (reviewers.length === 0) {
		return [{ t: "p", text: `Nobody is credited yet. ${how}` }];
	}
	return [
		{
			t: "ul",
			items: reviewers.map(
				(r) => `${reviewerLink(r.handle)} — ${r.pages} ${r.pages === 1 ? "page" : "pages"}`,
			),
		},
		{ t: "p", text: how },
	];
}

const GETTING_STARTED: DocPage = {
	slug: "getting-started",
	narrow: true,
	title: "Getting started",
	summary: "From an empty folder to a script running in Studio.",
	blocks: [
		{
			t: "p",
			text:
				"Roswaal is not a Studio plugin. It writes `.luau` files next to your graphs, and " +
				"[Rojo](https://rojo.space) syncs those into Studio like any other source file. That " +
				"means the generated code is a file you can read, diff and commit.",
		},
		{ t: "h", level: 2, text: "Open a project" },
		{
			t: "p",
			text:
				"Three ways in, all the same editor: installed on your computer, in a browser on your " +
				"computer, or in a browser on a tablet or a phone.",
		},
		{
			t: "tabs",
			label: "Where are you working?",
			tabs: [
				{
					id: "start-localhost",
					title: "Desktop (localhost)",
					device: ["localhost"],
					blocks: [
						{
							t: "code",
							lang: "sh",
							text: "cd my-game\nroswaal init      # creates roswaal.json and .roswaal/\nroswaal serve     # opens the editor on 127.0.0.1:4471",
						},
						{
							t: "p",
							text:
								"The editor opens in your browser and writes straight into your project. " +
								"`.roswaal/` holds your graphs and is **source, not cache** — commit it. The " +
								"`src/` directory holds what Roswaal generates from them.",
						},
					],
				},
				{
					id: "start-webapp",
					title: "Desktop (Webapp)",
					device: ["webapp"],
					blocks: [
						{
							t: "p",
							text:
								"Nothing to install: open [the web app](https://neopolitans.github.io/Roswaal/try.html) " +
								"and start from the demo. Your project is kept in that browser, and the " +
								"Roswaal mark is blue to say so.",
						},
						{
							t: "p",
							text:
								"The **Project** button in the projects panel holds the rest. In Chrome or Edge, " +
								"**Open folder…** works on a folder on your own machine instead; **Download** " +
								"takes a project out as a zip, and **Open .zip…** brings one in.",
						},
					],
				},
				{
					id: "start-mobile",
					title: "Mobile (Webapp)",
					device: ["tablet", "phone"],
					blocks: [
						{
							t: "p",
							text:
								"The same web app on an iPad or a phone, laid out for a finger: the panels slide " +
								"out over the graph, and the edits a keyboard makes are buttons under it. " +
								"[The Interface](the-interface) shows where everything goes, and " +
								"[Controls](controls) has the gestures.",
						},
						{
							t: "p",
							text:
								"Your project is kept in the browser. To bring one from a computer, zip its " +
								"folder, send it to the device, and pick it with **Project → Open .zip…** in the " +
								"projects panel. An iPad Mini is the smallest screen it is made for; a phone is best for " +
								"reading graphs.",
						},
					],
				},
			],
		},
		{ t: "h", level: 2, text: "Your first script" },
		{
			t: "ol",
			items: [
				"Right-click the project tree and make a new graph. On a touch screen, press and hold instead of right-clicking.",
				"Every script starts at a red **Script Start** node. Nothing runs without one.",
				"Right-click the canvas, search for `Print`, and wire Script Start's execution pin into it.",
				"Type something into the Value pin.",
				"Press **Compile script**. The generated `.luau` appears in the tree beside it.",
			],
		},
		{
			t: "p",
			text:
				"[The Interface](the-interface) shows what each part of the screen is. Most of the " +
				"chrome is icons, and [Toolbars](toolbars) draws every bar with its buttons named — " +
				"including the three at the right-hand end of the top bar, which are Docs, Node " +
				"Design and Settings.",
		},
		{
			t: "code",
			lang: "luau",
			text: '--!strict\n-- Generated by Roswaal. Do not edit this file directly;\n-- edit Hello.nodescript and recompile instead.\n\nprint("Hello")',
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Generated files carry a hash of themselves. Edit one by hand and Roswaal refuses to " +
				"overwrite it rather than throwing your change away — recompile with force when you " +
				"mean it.",
		},
		{ t: "h", level: 2, text: "Getting it into Studio" },
		{
			t: "p",
			text:
				"A **node map** describes where your files land in the DataModel, and compiles to a " +
				"Rojo project file. Make one, point a folder at `src`, then run `rojo serve` and " +
				"connect from the Studio plugin.",
		},
		{
			t: "p",
			text:
				"That is the whole loop: edit the graph, compile, Rojo syncs. Set **Compile** to " +
				"**Dynamic** and the compile step happens as you work.",
		},
	],
};

const TWO_KINDS_OF_WIRE = (registry: Registry): DocPage => ({
	slug: "wires-and-pins",
	narrow: true,
	title: "Wires and pins",
	summary: "Execution and data, what connects to what, and what a pin can do.",
	blocks: [
		{
			t: "p",
			text:
				"**Execution** wires say what happens in what order. **Data** wires carry values. An " +
				"execution pin is a triangle hung outside the node; a data pin is a circle " +
				"balanced on its edge. Both are hollow until something is wired to them.",
		},
		...previews(
			registry,
			["debug.print", "math.add"],
			"Print is a step, so it has an execution pin either side. Add is **pure** — no " +
				"execution pins, and its value goes wherever a value is wanted.",
		),

		{ t: "h", level: 2, text: "Execution wires" },
		{
			t: "ul",
			items: [
				"An execution output takes one wire. To do two things in turn, use **Sequence**.",
				"An execution input takes one wire too, so two flows cannot join at one node.",
			],
		},
		{
			t: "graph",
			script: GUIDE_SCENES.wireExecution(),
			caption:
				"An execution output takes one wire, so Sequence is how one step leads to two. " +
				"Its outputs run top to bottom.",
		},

		{ t: "h", level: 2, text: "Data wires" },
		{
			t: "ul",
			items: [
				"A data output can feed any number of inputs.",
				"An input takes one wire. Connecting a second replaces the first.",
			],
		},
		{
			t: "p",
			text:
				"Pure nodes have a green left edge, and a variable's Get is a pill with no header. A " +
				"pure value used once is written where it is used; used twice or more, it is bound " +
				"to a local first, so the work happens once. A variable is the exception — it is " +
				"read where it is used, every time, so a Set between two reads is never missed.",
		},

		{ t: "h", level: 2, text: "Colours" },
		{
			t: "p",
			text:
				"A pin's colour is its type: red boolean, green number, magenta string, blue " +
				"instance, gold vector, orange CFrame. Grey is `any`, and any type without a " +
				"colour of its own, such as `Model`.",
		},
		{
			t: "graph",
			script: GUIDE_SCENES.wireColours(),
			caption:
				"Each wire joins two pins of one type, so it is that type's colour: gold `Vector3`, " +
				"orange `CFrame`, green `number`, blue `Instance`, magenta `string`. Greater " +
				"Than's output is red, a `boolean`.",
		},
		{
			t: "p",
			text:
				"A data wire takes the colour of the pin it leaves. Where it lands on a pin of " +
				"another colour, it fades from one to the other. Hover a wire to see its type, or " +
				"both types when it fades.",
		},
		{
			t: "graph",
			script: GUIDE_SCENES.wireFades(),
			caption:
				"Add's number lands on a string pin, and Concatenate's string on Print's Value, " +
				"which takes anything — so each wire fades from one colour to the other.",
		},

		{ t: "h", level: 2, text: "What connects" },
		{
			t: "ul",
			items: [
				"The same type.",
				"`any`, to and from anything.",
				"`number` and `string`, either way — Luau converts between them.",
				"An instance class such as `Model` into an `Instance` pin. The other way round needs a **Cast**.",
				"Never execution to data.",
				"Some inputs are typed in and become part of the code, like Get Property's Property. They take no wire, and the pin menu says so.",
			],
		},
		{ t: "p", text: "[Roswaal types](types) lists every type and what it holds." },

		{ t: "h", level: 2, text: "Working with wires" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag from a pin", "Start a wire. Pins of other types dim"],
				["Drop it on empty space", "The node menu, showing only nodes that can take it. Picking one connects it"],
				["Drop a value on Add, Make Dictionary or a call", "Adds an input for it and connects it"],
				["Drag from a wired input", "Pick the wire up and move it"],
				["`Shift` + click a pin", "Disconnect everything on it"],
				["`Shift` or `Alt` + click a wire", "Disconnect it"],
				[
					"Click a Class Name",
					"The class picker: type to search, `↑` `↓` to move, `Enter` to take it, `Esc` to leave. A name it does not hold is taken on `Enter` anyway",
				],
				["Double-click a wire", "Add a reroute knot"],
				["Right-click a pin", "The pin menu"],
			],
		},
		{
			t: "p",
			text:
				"Wires are drawn one of three ways, set under **Settings → Wires**: **Curved**, the " +
				"default, **Rigid**, or **Angular**. The pictures in these docs follow that setting, " +
				"and your **Node corners** too.",
		},

		{ t: "h", level: 2, text: "Reroute knots" },
		{
			t: "p",
			text:
				"Double-click a wire to put a knot in it, then drag the knot to route the wire where " +
				"you want it. A knot compiles to nothing. It takes the type of whatever is wired " +
				"into it, and changes when that does. `Shift` or `Ctrl` + click a knot to select it.",
		},
		{
			t: "graph",
			script: GUIDE_SCENES.wireKnots(),
			caption:
				"Each wire rises to a knot and runs flat into the pin it feeds — an execution " +
				"wire above, a data wire below. The knots compile to nothing.",
		},

		{ t: "h", level: 2, text: "The pin menu" },
		{
			t: "table",
			head: ["Item", "What it does"],
			rows: [
				[
					"Promote to Variable",
					"On an unwired input. Makes a variable with the pin's type and value, and wires its Get in",
				],
				[
					"Split Struct Pin",
					"One pin per component, on a `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` or `UDim2` input or output. `CFrame` splits three ways: position and rotation, position and axes, or 12 numbers",
				],
				["Recombine Struct Pin", "On a component. Puts the pin back together"],
				["Break Link", "Disconnect the pin, the same as `Shift` + click"],
			],
		},
		{
			t: "graph",
			script: GUIDE_SCENES.pinMenu(),
			caption:
				"**Split Struct Pin** broke the lower CFrame's Position into X, Y and Z; the one " +
				"above is whole. **Promote to Variable** turned Y's value into **Height** and wired " +
				"its Get in.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"Splitting and recombining do not change what the graph compiles to. Where a value " +
				"cannot be carried across — an expression rather than numbers — Roswaal says so " +
				"before it changes anything.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Wires on a pin you split or recombine are removed. If there is more than one, " +
				"Roswaal asks first.",
		},

		{ t: "h", level: 2, text: "Values on unwired inputs" },
		{
			t: "p",
			text:
				"An input with nothing wired in shows its value: a checkbox, a number, text, or a " +
				"dropdown. A value written as Luau, like `Vector3.zero`, is fixed — wire a node in, " +
				"or split the pin, to change it.",
		},
		{
			t: "p",
			text:
				"**A dropdown is a shortcut, never a gate.** A short list of values — the three " +
				"axes, the easing styles — is a `select` with **Other…** at the bottom for anything " +
				"it does not hold. A long one, like the Class Name on **Is A** or **New Instance**, " +
				"opens a **picker**: search at the top, and every Instance class the engine has " +
				"below it, grouped by what each one derives from. Type to narrow, arrows to move, " +
				"Enter to take it — and a name the list does not hold is still taken, because a " +
				"class newer than your build has to be reachable. Each node’s reference page says " +
				"which of its pins offer a list.",
		},
		{
			t: "p",
			text:
				"**default** in a dashed box is an optional argument. Left alone, it is not passed " +
				"at all. Click it to set a value, and **×** to clear it. [Roswaal types](types) " +
				"explains when that matters.",
		},
		...previews(
			registry,
			["tweeninfo.new", "instance.findFirstChildWhichIsA", "cframe.lookAt"],
			"TweenInfo has a number, two dropdowns, and three optional arguments left at " +
				"**default**. Find First Child Which Is A has text, and a Recursive left at " +
				"**default** — so it is not passed at all. Look At's `Vector3.zero` is fixed " +
				"until something is wired in.",
		),

		{ t: "h", level: 2, text: "Adding and removing pins" },
		{
			t: "p",
			text:
				"A node that takes a list has **+** and **−** in its header: the maths and logic " +
				"operators, Make Dictionary, calls, Sequence, Return, Module Exports, and a " +
				"function's parameters.",
		},
		{
			t: "graph",
			script: GUIDE_SCENES.growPins(),
			caption:
				"Add at three operands and Sequence at three outputs. **+** adds one and **−** " +
				"takes the last away; each greys out at the node's limit.",
		},
	],
});

/**
 * A map of the two windows a graph is built in, before the pages about using
 * them.
 *
 * Controls says what each key and gesture does and Toolbars names each button,
 * which both assume the reader knows where the Inspector is. This is where
 * they find out: each window drawn as its regions, numbered, with a line each
 * -- and, in the Mobile tabs, where those regions go on a touch screen and
 * what is only there. The docs themselves are not drawn: a page to read needs
 * no map.
 */
const INTERFACE: DocPage = {
	slug: "the-interface",
	title: "The Interface",
	summary: "What each part of the editor and Node Design is, and where it sits.",
	blocks: [
		{
			t: "p",
			text:
				"Roswaal has three windows: the editor, where you build graphs; **Node Design**, " +
				"where you make the nodes they are built from; and these docs. This page is a map of " +
				"the first two. How each part is used is on [Controls](controls), and every button is " +
				"named on [Toolbars](toolbars).",
		},
		{
			t: "p",
			text:
				"On a tablet or a phone the same parts are there, arranged for a finger; a phone " +
				"folds its bars further still. The **Tablet** and **Phone** tabs show where they go, " +
				"and what is only there.",
		},
		{ t: "h", level: 2, text: "The editor" },
		{
			t: "tabs",
			label: "What are you using?",
			tabs: [
				{
					id: "interface-editor-desktop",
					title: "Desktop",
					device: ["localhost", "webapp"],
					blocks: [
						{ t: "layout", layout: EDITOR_LAYOUT, hint: true },
						{
							t: "note",
							kind: "info",
							text:
								"That is where each panel starts. Drag one by its heading to another edge, " +
								"or out over the graph as a window.",
						},
					],
				},
				{
					id: "interface-editor-tablet",
					title: "Tablet (Webapp)",
					device: ["tablet"],
					blocks: [
						{ t: "layout", layout: EDITOR_LAYOUT_TOUCH },
						{ t: "toolbar", bar: ACTION_ROW },
					],
				},
				{
					id: "interface-editor-phone",
					title: "Phone (Webapp)",
					device: ["phone"],
					blocks: [{ t: "layout", layout: EDITOR_LAYOUT_PHONE }],
				},
			],
		},
		{ t: "h", level: 2, text: "Node Design" },
		{
			t: "p",
			text:
				"Opened from the editor's top bar. It lists the project's node packs; open one and " +
				"pick a node to edit it.",
		},
		{
			t: "tabs",
			label: "What are you using?",
			tabs: [
				{
					id: "interface-designer-desktop",
					title: "Desktop",
					device: ["localhost", "webapp"],
					blocks: [{ t: "layout", layout: DESIGNER_LAYOUT }],
				},
				{
					id: "interface-designer-tablet",
					title: "Tablet (Webapp)",
					device: ["tablet"],
					blocks: [
						{ t: "layout", layout: DESIGNER_LAYOUT_TOUCH },
						{ t: "toolbar", bar: DESIGNER_TOUCH_BAR },
					],
				},
				{
					id: "interface-designer-phone",
					title: "Phone (Webapp)",
					device: ["phone"],
					blocks: [{ t: "layout", layout: DESIGNER_LAYOUT_PHONE }],
				},
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"On a phone or a tablet the editor, Node Design and the docs open in the same tab, " +
				"and the back button returns. On a computer each has a tab of its own.",
		},
	],
};

/**
 * Every control the editor has, in one place.
 *
 * Written from the two files that bind one — `App.tsx`'s key handler and
 * `Canvas.tsx`'s pointer handlers — so the page can be checked against them
 * rather than remembered. It has to exist: the canvas has no menu bar to browse
 * and no tooltip on empty space, so a gesture nobody wrote down is a gesture
 * nobody has.
 */
const CONTROLS: DocPage = {
	slug: "controls",
	title: "Controls",
	summary: "Every key, mouse, trackpad and touch gesture the canvas understands.",
	blocks: [
		{
			t: "p",
			text:
				"This page is the keyboard, the mouse and touch. The buttons are on [Toolbars](toolbars), " +
				"which draws each bar with every control named under it.",
		},
		{ t: "h", level: 2, text: "Keys and gestures" },
		{
			t: "tabs",
			label: "What are you using?",
			tabs: [
				{
					id: "controls-desktop",
					title: "Desktop",
					device: ["localhost", "webapp"],
					blocks: [
						{
							t: "p",
							text:
								"Keys act on the canvas, and do nothing while you are typing in a field. **Ctrl** is " +
								"**⌘** on a Mac. **Escape** closes whatever is open — a menu, a panel, the preview.",
						},
						{
							t: "table",
							head: ["Key", "What it does"],
							rows: [
								["`Ctrl` + `Z`", "Undo"],
								["`Ctrl` + `Shift` + `Z`, `Ctrl` + `Y`", "Redo"],
								["`Ctrl` + `S`", "Compile the open graph"],
								["`Ctrl` + `A`", "Select everything in the graph on screen"],
								[
									"`Ctrl` + `C`, `Ctrl` + `X`, `Ctrl` + `V`",
									"Copy, cut, paste. A function brings its graph and a comment brings what it is drawn around. The paste lands with its top-left corner at the pointer, or offset from the original when the pointer is off the canvas",
								],
								["`Ctrl` + `D`", "Duplicate the selection, at the pointer"],
								["`Ctrl` + `Shift` + `L`", "Realign the graph on screen"],
								["`Delete`, `Backspace`", "Delete the selection. A function takes its graph, and asks first"],
								["`A`", "Align the selection, walking it in the order you picked it"],
								["`C`", "Comment around the selection, or an empty one if nothing is selected"],
								["`P`", "Preview the Luau the selection compiles to. With nothing selected: the function on screen, or the whole script"],
							],
						},
						{
							t: "note",
							kind: "info",
							text:
								"While a compile is running outside Dynamic the canvas is locked, and only the " +
								"controls that read rather than change it work: `Ctrl` + `A`, `Ctrl` + `C` and `P`.",
						},
					],
				},
				{
					id: "controls-mobile",
					title: "Mobile (Webapp)",
					device: ["tablet", "phone"],
					blocks: [
						{
							t: "p",
							text:
								"A long press is a right-click and a double tap is a double-click, everywhere — " +
								"so every gesture in the sections below has a touch version. An Apple Pencil " +
								"works the same way, and draws a marquee as a mouse does.",
						},
						{
							t: "table",
							head: ["Gesture", "What it does"],
							rows: [
								["Drag empty space with one finger", "Pan"],
								["Tap empty space", "Clear the selection"],
								["Two fingers", "Pinch to zoom, drag to pan"],
								["Press and hold empty space, then drag", "Marquee select"],
								["Press and hold empty space, then lift", "Node menu, where you held"],
								["Long press a node or a pin", "Its menu, as a right-click opens"],
								["Press and hold a variable, a file or a tab, then drag", "Drag it, as a mouse does — onto the graph, into a folder"],
								["Press and hold a variable, a file or a tab, then lift", "Its menu, if it has one"],
								["**Undo** and **Redo**, under the graph", "As `Ctrl` + `Z` and `Ctrl` + `Y` do"],
								["**Align**, **Copy**, **Cut**, **Duplicate**, **Delete**, **Paste**, under the graph", "What their shortcuts do, to the selection. Node Design's logic graph has the same bar. Icons or words: **Settings → Editor → Action buttons**"],
								["**Preview** and **Logic**, in Node Design", "Show the node, or its logic, with the whole editor to itself"],
								["Double tap", "Open a graph from the tree, add a reroute knot, rename a comment"],
								["Drag a node, or from a pin", "As with a mouse"],
								["**Project**, **Variables** and **Inspector**, under the graph", "Slide that panel out over the graph, one at a time"],
								["The search button beside **Contents**, in these pages", "Search the docs, as `Ctrl` + `K` does"],
							],
						},
						{
							t: "note",
							kind: "info",
							text:
								"An iPad with a keyboard takes the Desktop shortcuts as well, with **⌘** for " +
								"**Ctrl**.",
						},
					],
				},
			],
		},
		{ t: "h", level: 2, text: "Aligning" },
		{
			t: "p",
			text:
				"`A` lines a selection up, walking it in the order you picked it. The first node — " +
				"the **anchor**, drawn with a heavier ring — never moves.",
		},
		{
			t: "p",
			text:
				"From there it follows the **wires** through the rest of the selection, and each " +
				"node lines up on the neighbour it was reached from. So a chain straightens hop " +
				"by hop — a source, a knot and the node the knot feeds all come out flat, even " +
				"though the far end was never wired to the anchor, and whatever order you picked " +
				"them in. A selected node with no wired path to the anchor takes its top edge.",
		},
		{
			t: "p",
			text:
				"Where two nodes are wired, the **pins** line up rather than the boxes. That is the " +
				"difference that matters at a reroute knot: a knot is a dot with both pins at its " +
				"centre and the node it feeds has its input some way down a header, so levelling " +
				"the boxes would leave every wire through it bent.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"Nothing moves sideways. A node's column says when it happens, so a tidy-up that " +
				"shifted one would be changing what the graph says. Use **Realign** to rebuild the " +
				"columns. Comments stay put too.",
		},
		{ t: "h", level: 2, text: "The canvas" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				[
					"Scroll",
					"Zoom towards the pointer, or pan on a Mac or iPad. **Settings → Editor → Scrolling the graph** changes it",
				],
				["Pinch, or `Ctrl` + scroll", "Zoom, towards the pointer"],
				["Scroll sideways", "Pan"],
				["Middle-drag, or `Alt` + drag", "Pan"],
				["Drag on empty space", "Marquee select"],
				["`Shift` or `Ctrl` + drag on empty space", "Marquee adds to the selection"],
				["Click empty space", "Clear the selection"],
				["Right-click empty space", "Node menu, at the point you clicked"],
			],
		},
		{ t: "h", level: 2, text: "Nodes" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag", "Move it, and everything selected with it"],
				["`Shift` while dragging", "Snap to the grid; the rest keep their offsets"],
				["`Shift` or `Ctrl` + click", "Add to or remove from the selection"],
				["Right-click", "Node menu"],
				["Double-click a Declare Function, or its **ƒ**", "Open the function's graph"],
			],
		},
		{ t: "h", level: 2, text: "Functions and tabs" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["The arrow beside a `.nodescript` in the tree", "List its functions"],
				["Double-click a function in the tree", "Open its graph in a tab"],
				["Click a function in the Variables panel", "Open its graph"],
				["Middle-click a tab", "Close it"],
			],
		},
		{ t: "h", level: 2, text: "Panels" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag a panel by its heading", "Move it to another edge"],
				["Drag a panel onto the graph", "It becomes a window there"],
				["The **⇥** button on a panel", "The same, without the drag"],
				["Drag the divider beside a dock", "Resize it; double-click to collapse"],
				["**Settings → Variables → Window**", "The same choice, remembered as a preference"],
				["Drag the window by its heading", "Move it"],
				["Drag either corner of the window", "Resize it. The top-left moves it as it shrinks, so the far corner stays put"],
				["The **⇤** button on the window", "Put it back in the dock it came from"],
			],
		},
		{ t: "h", level: 2, text: "Node Design" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag a type from the palette onto the node", "Add a pin: the left half an input, the right half an output"],
				["Click a pin, or its label", "Edit its name, type, default and tooltip"],
				["`Ctrl` + `S`", "Save the node"],
				["Right-click the logic canvas", "Add a node to the node's logic"],
				["`A`, `Ctrl` + `Shift` + `L`", "Align and realign in the logic canvas, as on a graph"],
				[
					"`Ctrl` + `C`, `X`, `V`, `D`",
					"Copy, cut, paste and duplicate in the logic canvas, on the same terms as a graph. Node Inputs and Node Outputs are left out of all four: there is one of each and they are already here",
				],
			],
		},
		{ t: "h", level: 2, text: "Pins and wires" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag from a pin", "Start a wire; everything it cannot reach dims"],
				["Drop a wire on empty space", "Node menu, showing only what can take that wire"],
				["Drop a wire from a service", "That service's methods, listed first — see [Services and their methods](services)"],
				["Type a service or class name in the menu", "**ReplicatedStorage** gives Get Service; **Part** gives New Instance, each filled in"],
				["Drag from a wired input", "Pick that wire up and move it somewhere else"],
				["`Shift` + click a pin", "Disconnect everything on it"],
				["Right-click a pin", "Pin menu — split a struct, promote to a variable"],
				["`Shift` or `Alt` + click a wire", "Disconnect it"],
				["Double-click a wire", "Add a reroute knot where you clicked"],
			],
		},
		{ t: "h", level: 2, text: "Advanced shortcuts" },
		{
			t: "p",
			text:
				"Two that are worth knowing and neither of which you need: each is a slower, " +
				"fuller way of asking something the editor already answers quickly.",
		},
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				[
					"`Ctrl` + right-click the canvas",
					"The **node picker**: the same list as the menu, with each node **drawn** as you walk it. For when you remember the shape rather than the name",
				],
				[
					"`Ctrl` + `K`, in the editor",
					"Jump to a documentation page. Pick one and the docs window opens on it",
				],
				["`Ctrl` + `K`, in the docs", "The search palette, over the page"],
			],
		},
		{ t: "h", level: 2, text: "Searching" },
		{
			t: "table",
			head: ["Typed", "What you get"],
			rows: [
				["`and`, `or`, `not`, `==`, `..`, `#`", "The node that writes that Luau, first in the list"],
				["`if`, `else`, `elseif`", "Branch"],
				["`for`, `while`, `break`, `return`", "The loop or the flow node that writes it"],
				["A service or class name", "Get Service or New Instance, filled in"],
				["A method name", "`RunService:IsServer` and the rest of that service's methods"],
			],
		},
		{ t: "h", level: 2, text: "Comments" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["`C`", "A new comment: around the selection, or empty where you are looking"],
				["Right-click the canvas", "**Add comment**, placed where you clicked"],
				["Drag", "Move it, and the nodes that were inside it when you grabbed it"],
				["`Ctrl` + `C`", "Copy it, and the nodes it is drawn around"],
				["Select it", "Its colour, in the Inspector: eight swatches or a hex you type"],
				["Double-click", "Edit the text. Enter adds a line; Esc, Ctrl+Enter or a click away saves"],
				["Drag the bottom-right corner", "Resize"],
				["Drag the top-left corner", "Resize, keeping the bottom-right where it is"],
			],
		},
		{ t: "h", level: 2, text: "Dragging things in" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag a variable from the panel", "Get Variable"],
				["`Ctrl` while dropping it", "Set Variable instead"],
				["Drag a file from the project tree", "Offers what can be done with it"],
				["Double-click a `.nodescript` in the tree", "Open it"],
			],
		},
	],
};

/**
 * Where every button is, and what it does.
 *
 * It exists because of the one complaint icon-only chrome always earns: people
 * could not find Node Design, the documentation or Settings. All three are a
 * glyph at the right-hand end of the editor's top bar, and a glyph says nothing
 * until it is hovered — so the answer is a picture of the bar with the controls
 * named under it, not another paragraph about them.
 *
 * Every bar is drawn from the spec in `toolbars.ts` rather than described here,
 * so the page cannot list a control the tool does not have.
 */
const TOOLBARS_PAGE: DocPage = {
	slug: "toolbars",
	title: "Toolbars",
	summary: "Every bar in the tool, drawn, with what each button does.",
	blocks: [
		{
			t: "p",
			text:
				"Roswaal's chrome is mostly icons. Hovering one gives its name, which works once " +
				"you know roughly where to look — so this page is the map: each bar drawn as it " +
				"appears, with every control named underneath it.",
		},
		{
			t: "note",
			kind: "info",
			text: "If you are looking for one of the three that are hardest to find:",
			items: [
				"**Docs** — the document icon, third from the right on the editor's top bar.",
				"**Node Design** — the palette icon, second from the right.",
				"**Settings** — the gear icon, last on the bar.",
			],
		},
		{
			t: "p",
			text:
				"On a computer all three open in **their own window** rather than over the canvas, " +
				"so nothing appears to happen on the page you were on: look for a new tab. On a " +
				"phone or a tablet they take turns in the one tab, and the back button returns.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**There are two editors.** The one the daemon serves with `roswaal serve`, and " +
				"the **browser preview** on the project site — the same build, running in a tab, " +
				"on a project kept in that browser rather than in your repository.",
			items: [
				"**Every window of the preview is marked.** The editor's mark is blue beside the " +
					"version — yellow on the canary — and Node Design carries a `preview` chip. If you can see either, " +
					"your work is in this browser and not on your disk.",
				"The bars are otherwise the same bars. Where one reaches something different, " +
					"both are drawn below under a switch.",
			],
		},
		{ t: "h", level: 2, text: "The editor's top bar" },
		{
			t: "tabs",
			label: "Where are you working?",
			tabs: [
				{
					id: "editor-daemon",
					title: "Desktop (localhost)",
					device: ["localhost"],
					blocks: [{ t: "toolbar", bar: EDITOR_BAR, hint: true }],
				},
				{
					id: "editor-browser",
					title: "Desktop (Webapp)",
					device: ["webapp"],
					blocks: [{ t: "toolbar", bar: EDITOR_BAR_BROWSER }],
				},
				{
					id: "editor-tablet",
					title: "Tablet (Webapp)",
					device: ["tablet"],
					blocks: [{ t: "toolbar", bar: EDITOR_BAR_TABLET }],
				},
				{
					id: "editor-phone",
					title: "Phone (Webapp)",
					device: ["phone"],
					blocks: [{ t: "toolbar", bar: EDITOR_BAR_PHONE }],
				},
			],
		},
		{
			t: "p",
			text:
				"It is always there, and everything on it acts on the **project** rather than on " +
				"the document you have open. The bar below it, and the tools over the canvas, are " +
				"the ones that change with what you are looking at.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"In the browser preview the **Docs** button opens the published copy of these " +
				"pages, which documents the **built-in library only**. A project's own packs are " +
				"documented in the editor the daemon serves, where the registry is live — so a " +
				"node you wrote yourself has a page there and not here.",
		},
		{ t: "h", level: 2, text: GRAPH_BAR.title },
		{
			t: "tabs",
			label: "Where are you working?",
			tabs: [
				{ id: "graph-desktop", title: "Desktop", device: ["localhost", "webapp"], blocks: [{ t: "toolbar", bar: GRAPH_BAR }] },
				{ id: "graph-tablet", title: "Tablet (Webapp)", device: ["tablet"], blocks: [{ t: "toolbar", bar: GRAPH_BAR_TABLET }] },
				{ id: "graph-phone", title: "Phone (Webapp)", device: ["phone"], blocks: [{ t: "toolbar", bar: GRAPH_BAR_PHONE }] },
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"These are **three separate panels floating over the canvas**, not one strip — the " +
				"graph shows through the gaps between them, and that space is still canvas you can " +
				"click and drag on. Looking for a single toolbar is why they are easy to miss.",
		},
		{
			t: "p",
			text:
				"The graph's name only appears here if you ask for it: **Show document name** in " +
				"[Settings](settings). Without it, unsaved edits are a dot in the same place. " +
				"The keys these buttons duplicate are on [Controls](controls).",
		},
		{ t: "h", level: 3, text: MAP_BAR.title },
		{ t: "toolbar", bar: MAP_BAR },
		{
			t: "p",
			text:
				"A node map is a tree rather than a graph, so it takes a row above the view instead " +
				"of floating tools, and it has none of the graph tools — there is no canvas for " +
				"them to act on. That is the shape, not something missing.",
		},
		{ t: "h", level: 2, text: "Node Design's top bar" },
		{
			t: "tabs",
			label: "Where are you working?",
			tabs: [
				{
					id: "designer-daemon",
					title: "Desktop (localhost)",
					device: ["localhost"],
					blocks: [{ t: "toolbar", bar: DESIGNER_BAR }],
				},
				{
					id: "designer-browser",
					title: "Desktop (Webapp)",
					device: ["webapp"],
					blocks: [{ t: "toolbar", bar: DESIGNER_BAR_BROWSER }],
				},
				{
					id: "designer-tablet",
					title: "Tablet (Webapp)",
					device: ["tablet"],
					blocks: [{ t: "toolbar", bar: DESIGNER_BAR_TABLET }],
				},
				{
					id: "designer-phone",
					title: "Phone (Webapp)",
					device: ["phone"],
					blocks: [{ t: "toolbar", bar: DESIGNER_BAR_PHONE }],
				},
			],
		},
		{
			t: "p",
			text:
				"Node Design is reached from the **palette icon** on the editor's top bar, or at " +
				"`/designer` while the daemon is running. What to do once you are in it is on " +
				"[Creating custom nodes](creating-custom-nodes).",
		},
		{ t: "h", level: 2, text: "The documentation's top bar" },
		{
			t: "tabs",
			label: "Which copy are you reading, and on what?",
			tabs: [
				{
					id: "docs-daemon",
					title: "Desktop (localhost)",
					device: ["localhost"],
					blocks: [{ t: "toolbar", bar: DOCS_BAR }],
				},
				{
					id: "docs-published",
					title: "Desktop (Webapp)",
					device: ["webapp"],
					blocks: [{ t: "toolbar", bar: DOCS_SITE_BAR }],
				},
				{
					id: "docs-tablet",
					title: "Tablet (Webapp)",
					device: ["tablet"],
					blocks: [{ t: "toolbar", bar: DOCS_SITE_BAR_TOUCH }],
				},
				{
					id: "docs-phone",
					title: "Phone (Webapp)",
					device: ["phone"],
					blocks: [{ t: "toolbar", bar: DOCS_SITE_BAR_PHONE }],
				},
			],
		},
		{
			t: "p",
			text:
				"These are two different headers rather than one header pointing at two places. " +
				"The window the daemon serves has an editor and a project behind it, so it offers " +
				"Settings and a way back. The published copy has neither, so it offers the browser " +
				"preview and the source instead.",
		},
		{
			t: "p",
			text:
				"The documentation window is reached from the **document icon** on the editor's top " +
				"bar, or at `/docs`. `Ctrl` + `K` searches it from the editor and from Node Design " +
				"without opening it first.",
		},
		{ t: "h", level: 2, text: "Getting between the three windows" },
		{
			t: "p",
			text:
				"Roswaal is three windows out of one build, and each one can reach the others. " +
				"On a computer none of them replaces the window you are on; on a phone or a tablet " +
				"they take turns in one tab, and the back button returns.",
		},
		{
			t: "table",
			head: ["To get to", "From the editor", "From Node Design", "From Docs"],
			rows: [
				["The editor", "—", "**Open Editor**", "**Open Editor**"],
				["Docs", "The document icon", "**Docs**, or `Ctrl` + `K`", "—"],
				["Node Design", "The palette icon", "—", "Not from here"],
				["Settings", "The gear", "The gear", "**Settings**"],
			],
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Node Design's Settings and the documentation window's have no Project tab. That " +
				"is deliberate: a project's settings belong to the repository and are changed " +
				"from the editor, which is the window that has a project open.",
		},
		{ t: "h", level: 2, text: "Only on a touch screen" },
		{
			t: "p",
			text:
				"Two bars a tablet and a phone have and a computer does not, the same on both. Where " +
				"they sit is on [The Interface](the-interface).",
		},
		{ t: "h", level: 3, text: ACTION_ROW.title },
		{ t: "toolbar", bar: ACTION_ROW },
		{ t: "h", level: 3, text: DESIGNER_TOUCH_BAR.title },
		{ t: "toolbar", bar: DESIGNER_TOUCH_BAR },
	],
};

/**
 * Lune's standard library.
 *
 * Its own page rather than a section of *Modules*, because Modules is about
 * requiring and this is about what you can call once you have. The table of
 * modules is built from the catalogue rather than typed out, so a Lune release
 * that adds a function changes this page by being regenerated.
 */
function luneLibraryPage(registry: Registry): DocPage {
	const counts = LUNE_MODULES.map((module) => ({
		alias: module.alias,
		what: module.what,
		functions: module.functions.length,
		classes: module.classes.length,
	}));
	const total = counts.reduce((sum, one) => sum + one.functions, 0);

	return {
		slug: "lune-library",
		title: "Lune's standard library",
		summary: "Files, networking, processes and the rest — as two nodes that know every signature.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"Lune ships its own library: the filesystem, HTTP, child processes, the terminal, " +
					"a scheduler. Each part is a module you require — `@lune/fs`, `@lune/net` — and " +
					`Roswaal knows all ${total} of their functions.`,
			},

			{ t: "h", level: 2, text: "Two nodes, not sixty-one" },
			{
				t: "p",
				text:
					"One node per function would put sixty-odd entries in the palette and a release " +
					"of Roswaal between you and anything Lune shipped last month. So there are two, " +
					"and they read a catalogue: **Lune Function** for a call that does something, " +
					"**Lune Function (Value)** for one that answers something.",
			},
			...previews(
				registry,
				["lune.call", "lune.value"],
				"Both arrive blank. Pick the call in the Inspector — or search the palette for it " +
				"by name, and the node comes configured.",
			),
			{
				t: "p",
				text:
					"**The palette still knows every function.** Type `readFile` and `fs.readFile` " +
					"is there; picking it places the node already set to that call, with `path` and " +
					"the result pin typed from Lune's own signature.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**Which of the two you get is Lune's decision, not Roswaal's.** Lune tags a " +
					"function `must_use` when the point of the call is the value it returns, which " +
					"is the same line Roswaal draws between a pure node and a step. So `fs.readFile` " +
					"is a value and `fs.writeFile` is a step, and nobody here had a second opinion " +
					"about either.",
			},

			{ t: "h", level: 2, text: "The module has to be declared" },
			{
				t: "p",
				text:
					"A Lune Function node **does not write its own** `require`. Pick `fs.readFile` " +
					"in a script that does not require `@lune/fs` and the node says so, and the " +
					"Inspector offers a button that declares it.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"`@lune/fs` is Lune's own and always available, which is the strongest case " +
					"anybody could make for an exception to that rule. It is still not one. A file " +
					"that quietly gained a require because you dropped a node is a file whose " +
					"dependencies are not what its author can see — see [Modules](modules).",
			},
			{
				t: "p",
				text:
					"So the button is the whole of the difference: **said and offered, never done**. " +
					"Declaring it the moment you picked the call would be the editor expanding what " +
					"your project depends on without being asked.",
			},
			{
				t: "code",
				lang: "luau",
				text: [
					'local fs = require("@lune/fs")',
					"",
					'print(fs.readFile("notes.txt"))',
				].join("\n"),
			},
			{
				t: "p",
				text:
					"The local is the one **you** named in the Variables panel. Call it `disk` and " +
					"the call reads `disk.readFile` — see [Variables and locals](variables-and-locals) " +
					"for why the name is yours.",
			},

			{ t: "h", level: 2, text: "What is in it" },
			{
				t: "table",
				head: ["Module", "What it is for", "Functions"],
				rows: counts.map((one) => [
					`\`@lune/${one.alias}\``,
					one.what,
					String(one.functions),
				]),
			},
			{
				t: "p",
				text:
					"A module also hands back **types with methods of their own** — `regex.new` " +
					"gives you a `Regex`, and its `find` is asked of that value rather than of the " +
					"module. Those are [Call Method](node/call.method), not these two nodes.",
			},

			{ t: "h", level: 2, text: "Arguments and results" },
			{
				t: "ul",
				items: [
					"Arguments arrive **named and typed from Lune's signature**, with Lune's own " +
						"description on each pin.",
					"An **optional** argument starts empty, so leaving it alone leaves it off the " +
						"call. `task.wait()` and `task.wait(0)` are different calls and you can write " +
						"either.",
					"A type Roswaal's pins cannot say — `buffer | string` — becomes an `any` pin " +
						"whose description gives the real one. A pin claiming `string` would refuse a " +
						"buffer the runtime accepts.",
				],
			},

			{ t: "h", level: 2, text: "Which Lune" },
			{
				t: "p",
				text:
					`Every signature here comes from Lune **${LUNE_VERSION}**, read out of the ` +
					"`types.d.luau` files that ship with it rather than from a page describing " +
					"them. Moving to a new Lune is `npm run build:lune`, and the diff is the API " +
					"change — which is the point of generating it rather than writing it down.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"`@lune/fs` and its siblings **cannot be aliased.** Lune reserves those names, " +
					"so no `.luaurc` can redefine them and none needs to — see " +
					"[Aliases and .luaurc](aliases) for the aliases you can define yourself.",
			},
		],
	};
}

/**
 * `.luaurc` alias maps.
 *
 * Its own page rather than a section of *Modules*, because almost none of it is
 * about requiring: it is about a file, where that file sits, and what it
 * inherits from the ones above it. Modules keeps the one row a reader needs
 * while writing a specifier and sends them here for the rest.
 *
 * Everything stated as a rule is quoted from the RFC in `src/core/luaurc.ts`,
 * which carries the date it was checked. The two the page spends most space on
 * are the two that look correct in every project with a single `.luaurc` at the
 * root — which is most projects, right up until it is not.
 */
const ALIASES_PAGE: DocPage = {
	slug: "aliases",
	title: "Aliases and .luaurc",
	summary: "A short name for a path, shared by the project: where it is defined, and what it reaches.",
	narrow: true,
	blocks: [
		{
			t: "p",
			text:
				"`@roact/Component` is a require that does not say where Roact is. The path lives " +
				"in a `.luaurc`, and the alias is the name you use instead — so a package that " +
				"moves is one file changed rather than every graph that reads it.",
		},
		{
			t: "p",
			text:
				"An alias belongs to the **project**, not to a graph. The file is committed, so " +
				"everyone working in the repository resolves `@roact` to the same place, and two " +
				"graphs cannot disagree about it.",
		},
		{
			t: "code",
			lang: "json",
			text: [
				"{",
				'\t"languageMode": "strict",',
				'\t"aliases": {',
				'\t\t"roact": "./Packages/Roact",',
				'\t\t"shared": "./src/Shared"',
				"\t}",
				"}",
			].join("\n"),
		},

		{ t: "h", level: 2, text: "Where the file goes" },
		{
			t: "p",
			text:
				"Anywhere. A `.luaurc` applies to **its own directory and everything under it**, " +
				"so a project can have one at the root and another beside a corner of itself that " +
				"needs something different.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**A nearer file adds to the one above it; it does not replace it.** The RFC is " +
				"explicit: *\"Missing aliases in .luaurc are inherited from the alias maps of " +
				"any parent directories, and fields can be overridden.\"* So a file that names one " +
				"alias changes that one, and every other name still arrives from above.",
		},
		{
			t: "table",
			head: ["A require in", "Sees"],
			rows: [
				["`src/ui/Panel`", "`src/ui/.luaurc`, then `src/.luaurc`, then the root's"],
				["`src/Main`", "`src/.luaurc`, then the root's"],
				["Anywhere with no file above it", "No aliases at all"],
			],
		},

		{ t: "h", level: 2, text: "Where a relative path lands" },
		{
			t: "p",
			text:
				"Against **the** `.luaurc` **that defined it** — not against the file doing the " +
				"requiring. *\"If an alias is bound to a relative path, the path will be evaluated " +
				"relative to the .luaurc file in which the alias was defined.\"*",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"This is the rule worth reading twice, because the wrong version of it is right " +
				"by accident. A graph that sits beside the `.luaurc` resolves the same either " +
				"way, and most graphs do — so a project can run for months before the first " +
				"graph in a subdirectory finds out.",
		},

		{ t: "h", level: 2, text: "Naming one" },
		{
			t: "ul",
			items: [
				"**Case does not matter.** `@Roact` and `@roact` are one alias. Defining both in " +
					"one file is defining one alias twice, and Roswaal says so rather than letting " +
					"you write a file whose behaviour nobody can predict.",
				"Letters, digits, `.`, `-` and `_`. A name **cannot contain** `/` **or** `\\` — the " +
					"separator is what ends the alias and starts the path after it.",
				"`@` on its own is reserved.",
			],
		},

		{ t: "h", level: 2, text: "An alias that points at another" },
		{
			t: "p",
			text:
				"Allowed, and followed: *\"This search continues iteratively if a chain of aliases " +
				"must be resolved.\"* So `\"ui\": \"@roact/Component\"` is `Packages/Roact/Component` " +
				"if `@roact` is `./Packages/Roact`, and each link resolves against the file that " +
				"defined **that** link rather than the first one.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"A ring is an error. Roswaal reports it as the ring it walked — `a → b → c → a` — " +
				"rather than as \"cycle detected\", because the names are the part you can act on.",
		},

		{ t: "h", level: 2, text: "Editing one" },
		{
			t: "p",
			text:
				"A `.luaurc` is a file in the **project tree**, under Graph content beside your " +
				"graphs — Roswaal reads it rather than writing it, which is the line that section " +
				"is drawn on. Double-click it to open the alias editor: what this file defines, " +
				"where each one lands once the chain is followed, and underneath, what it " +
				"inherits from above.",
		},
		{
			t: "ul",
			items: [
				"Inherited aliases are shown but not editable. They belong to another file, and " +
					"the way to change one is to open the file that defines it.",
				"Every write **splices the** `aliases` **object** and leaves the rest of the file " +
					"exactly as it was: `languageMode`, lint settings, fields Roswaal has never " +
					"heard of.",
				"A file with **comments inside its** `aliases` is refused rather than rewritten, " +
					"and says why. An edit reorders the entries, and a note about why a package is " +
					"vendored cannot survive that.",
			],
		},

		{ t: "h", level: 2, text: "What Roswaal checks" },
		{
			t: "table",
			head: ["Specifier", "Verdict"],
			rows: [
				["An alias a `.luaurc` defines", "Fine"],
				["A name nothing defines, in a project that has a `.luaurc`", "**Error** — a typo"],
				["A name nothing defines, in a project with no `.luaurc` at all", "**Warning**"],
				["Any alias, in a graph compiling for Roblox", "**Warning** — see below"],
			],
		},
		{
			t: "p",
			text:
				"The second and third rows are the same specifier and different answers, and the " +
				"difference is deliberate. A project that uses alias maps and does not name this " +
				"one has a misspelling. A project with no `.luaurc` anywhere may be generating one " +
				"at build time, or keeping it outside the folder Roswaal opened — refusing to " +
				"compile that would be refusing a project that builds.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"**Roblox does not resolve aliases yet.** Its own announcement answers \"custom " +
				"aliased paths?\" with *\"Not yet, but we're working on it!\"*, and an update of 8 " +
				"January 2026 says custom aliases are being worked on — both checked 16 September " +
				"2026. So a `.luaurc` in a Roblox project is a file Rojo will sync and the engine " +
				"will ignore, and Roswaal warns rather than refusing: it is code written against " +
				"something that is coming, not code that is wrong. `@self/` and `@game/` do work, " +
				"and so do `./` and `../` — see [Modules](modules).",
		},
	],
};

/**
 * Requiring, in both runtimes.
 *
 * The one subject where Roblox and Lune genuinely differ, and where a reader
 * hitting that difference previously had nowhere to look. It is also where the
 * rule the whole Lune sequence is built on has to be stated: a generated file
 * does not grow imports nobody chose.
 */
const MODULES_PAGE: DocPage = {
	slug: "modules",
	title: "Modules",
	summary: "What a script requires, where you declare it, and what each runtime resolves.",
	blocks: [
		{
			t: "p",
			text:
				"A module is code in another file that this one uses. Roswaal writes the `require` " +
				"for you — but only ever for a module you have **declared**, and each declaration " +
				"writes exactly one, at the top of the generated file.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"**Nothing is required that the graph does not say.** Nothing is inferred and nothing " +
				"is added behind you. If the generated file imports something, it is because the " +
				"panel or the canvas says so — which is what makes the file safe to read and to " +
				"commit.",
		},
		{ t: "h", level: 2, text: "Declaring one" },
		{
			t: "p",
			text:
				"Modules live in the **Variables panel**, under their own heading. It is the same " +
				"question the variables answer — what does this script have to hand — and a " +
				"dependency belongs somewhere you can see it rather than somewhere you go looking.",
		},
		{ t: "toolbar", bar: MODULES_PANEL, hint: true },
		{
			t: "table",
			head: ["Field", "What it is"],
			rows: [
				["**Name**", "The local it binds to, and what the pill shows. Yours to choose — see below"],
				["**Module**", "What goes inside `require(...)`, verbatim"],
				["**Members**", "Names pulled off it into locals of their own, comma separated"],
			],
		},
		{
			t: "p",
			text:
				"Drag a module onto the canvas for a **Get Module** pill — one output, no header, " +
				"exactly as a variable gives you a Get. Four of them still write one `require`, " +
				"because the declaration is on the script rather than on any of the pills.",
		},
		{
			t: "p",
			text:
				"**Require at Top** declares one on the canvas instead, for when you would rather " +
				"see it there. It takes the same specifier and hands back the same module.",
		},
		{ t: "h", level: 2, text: "What goes in the box" },
		{
			t: "p",
			text:
				"A specifier must start with a prefix. That is not a house style: an unprefixed " +
				"path is **an error in Luau itself**, since the require rules were amended — " +
				"`require(\"Foo\")` used to resolve and now does not.",
		},
		{
			t: "table",
			head: ["Form", "Roblox", "Lune", "What it reaches"],
			rows: [
				["`./name`", "Yes", "Yes", "A sibling of this file"],
				["`../name`", "Yes", "Yes", "Up one, then down"],
				["`@self/name`", "Yes", "—", "A child of this script"],
				["`@game/Service/name`", "Yes", "—", "Down from the DataModel root"],
				["`@lune/fs`", "—", "Yes", "Lune's standard library"],
				["`@alias/name`", "Not yet", "Yes", "An alias from a [`.luaurc`](aliases)"],
			],
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Roswaal checks the specifier against the runtime the graph compiles for, so " +
				"`@lune/fs` in a Roblox graph is an error rather than a surprise at runtime. The " +
				"`.luaurc` row is a **warning** instead: Roblox says alias maps are coming, so that " +
				"is code which does not resolve today rather than code that is wrong. Where those " +
				"aliases come from is [Aliases and .luaurc](aliases).",
		},
		{ t: "h", level: 2, text: "Naming it yourself" },
		{
			t: "p",
			text:
				"The name is a choice, not a derivation. Two modules can genuinely want to be " +
				"called `util` — `./combat/util` and `./inventory/util` — and only you can say " +
				"which becomes `combatUtil`.",
		},
		{
			t: "p",
			text:
				"So a name you type is used **exactly**. It is never quietly turned into `util2`: " +
				"two declarations wanting one name is an error naming both, because a file can bind " +
				"it once and the fix is a rename that is yours to pick.",
		},
		{ t: "h", level: 2, text: "Members, and the Roblox datatypes in Lune" },
		{
			t: "p",
			text:
				"**Members** bind names from inside the module to locals of their own. It is Lune's " +
				"own idiom, and it is what makes the Roblox datatypes work there.",
		},
		{
			t: "code",
			lang: "luau",
			text: [
				'local roblox = require("@lune/roblox")',
				"local Vector3 = roblox.Vector3",
				"local CFrame = roblox.CFrame",
			].join(NEWLINE),
		},
		{
			t: "p",
			text:
				"With `Vector3` bound, `Vector3.new(1, 2, 3)` means what it means in Roblox — so a " +
				"graph moved between runtimes needs the declaration, not different nodes. " +
				"Shadowing a name Luau provides is allowed here because it is the point; Roswaal " +
				"warns, so that naming a module `table` is a decision rather than an accident.",
		},
		{ t: "h", level: 2, text: "Where the requires end up" },
		{
			t: "p",
			text:
				"At the top, below the `GetService` calls — where a hand-written Roblox file puts " +
				"them, and in the order you declared them.",
		},
		{
			t: "code",
			lang: "luau",
			text: [
				'local Players = game:GetService("Players")',
				"",
				'local Combat = require("@game/ReplicatedStorage/Combat")',
				'local config = require("./config")',
			].join(NEWLINE),
		},
		{
			t: "note",
			kind: "info",
			text:
				"Deleting a module leaves the pills that read it in place, reporting an error. The " +
				"same as deleting a variable, and for the same reason: an error you can see and " +
				"undo beats nodes disappearing because a declaration went away.",
		},
	],
};

const VARIABLES: DocPage = {
	slug: "variables-and-locals",
	narrow: true,
	title: "Variables and locals",
	summary: "Two different things, deliberately named apart — and what the code editor can see of each.",
	blocks: [
		{
			t: "p",
			text:
				"Roswaal has two ways to hold a value, and they are named apart because they behave " +
				"differently. The short version: a **variable** is yours to name and reach from " +
				"anywhere; a **local** exists for the length of a block and is reached by wire.",
		},
		{ t: "toolbar", bar: VARIABLES_PAGE_PANEL, hint: true },

		{ t: "h", level: 2, text: "Variables" },
		{
			t: "p",
			text:
				"Declared once in the **Variables panel** — a name, a type and a starting value — " +
				"and read or written by Get and Set nodes anywhere in the graph. A variable " +
				"compiles to a **file-level local**, so the main flow and " +
				"every function in the graph see the same one.",
		},
		{
			t: "ul",
			items: [
				"Drag one from the panel onto the canvas for a **Get**; hold **Ctrl** while you drop " +
					"for a **Set**.",
				"Right-click any unwired input pin and choose **Promote to Variable**. The new " +
					"variable takes the pin's type and whatever value was already typed into it, and " +
					"a Get is wired in where the literal was — so promoting never loses the value you " +
					"had.",
				"Renaming a variable in the panel renames every Get and Set of it at once. They " +
					"carry its id, not its name.",
				"The panel also lists this graph's **Locals**, **Functions** and **Types**. Click a " +
					"function to open its graph, or drag it out for a **Get Function**. Clicking a " +
					"local or a type goes to the graph its node is in.",
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"**A variable read is never hoisted.** Unlike a pure expression it has to happen at " +
				"its use site — otherwise a Set sitting between two Gets would be invisible to the " +
				"second one, and the graph would compile to something that does not match what it " +
				"draws.",
		},

		{
			t: "p",
			text:
				"**Binding**, in a variable's row, makes it a `const` — declared once at the top " +
				"of the file with the starting value you gave it, and never assigned again. A " +
				"**Set Variable** wired to one is refused, and so is **Initialize Variable**, " +
				"because a constant is given its value where it is declared. The row says `const` " +
				"beside the name, and so does a local's.",
		},

		{ t: "h", level: 2, text: "Locals" },
		{
			t: "p",
			text:
				"**Declare Local** binds a value mid-flow. It exists only inside the block that " +
				"declared it — which is the whole difference: a variable is reachable from anywhere, " +
				"a local only from inside its block. Wire its output onward, or drag it from the " +
				"**Locals** list in the Variables panel as a **Get Local**. Give it a type in the " +
				"Inspector and it is written after the name: `local restores: { [Model]: Restore } = {}`.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Reading a local from a **sibling block** is reported as an error rather than " +
				"emitted as code that will not compile. The local genuinely is not in scope there, " +
				"and finding that out from Roswaal beats finding it out from Studio.",
		},
		{
			t: "p",
			text:
				"**Binding**, in the Inspector, makes it a `const` instead. A constant is the same " +
				"binding with one guarantee — the name cannot be reassigned after it is set — and " +
				"Roswaal refuses a **Set Local** wired to one rather than leaving it to the " +
				"runtime, naming the local that made the promise.",
		},
		{
			t: "code",
			lang: "luau",
			text:
				"const tuning = Config.Tuning\n"
				+ "tuning.turnRate = 60 -- fine: the table is not frozen\n"
				+ "tuning = {}          -- error: the name is",
		},
		{
			t: "note",
			kind: "info",
			text:
				"It is the **binding** that is fixed, not the value — `table.freeze` is the tool " +
				"for the other half, and the two work together. `const` is a recent addition to " +
				"Luau, so a graph that uses it needs a runtime that has it; an older one will " +
				"refuse the file at parse time.",
		},

		{ t: "h", level: 2, text: "Parameters" },
		{
			t: "p",
			text:
				"A function's parameters are output pins on its entry node, in its " +
				"[graph](functions), and wiring one to whatever reads it works. In a function of any size those wires cross the whole " +
				"body — so **Get Parameter** reads one by name instead, the way Get Local reads a " +
				"local rather than wiring the Declare Local's output everywhere. Pick the function " +
				"and the parameter in the Inspector. The pins are still there; this is the other way.",
		},
		{
			t: "p",
			text:
				"It works inside an **event handler** as well as a function: Connect binds its " +
				"handler's parameters in the same way, so a Get Parameter in the handler's body " +
				"reads them just as it would a function's.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"A parameter exists only **where the function runs**, so a Get Parameter outside " +
				"the body it belongs to is an error naming both. That is the same rule a local " +
				"follows, for the same reason — and it is the compiler's own scope rule rather " +
				"than a separate check, so the editor and the generated file cannot disagree " +
				"about it.",
		},
		{
			t: "p",
			text:
				"Renaming a parameter carries every node reading it along. **Reordering** them " +
				"leaves those nodes alone, because a Get Parameter holds the parameter's name and " +
				"not its position. **Removing** one leaves the node saying which parameter is " +
				"gone, rather than quietly reading whichever moved into its place.",
		},

		{ t: "h", level: 2, text: "Naming a result" },
		{
			t: "p",
			text:
				"A node that hands back a value has a **Result name** in the Inspector: the local " +
				"its result lands in. A Find First Child named `value` emits " +
				"`local value = parent:FindFirstChild(name)`. The name shows under the node's " +
				"header rather than replacing it, so the node goes on saying what it does.",
		},
		{
			t: "p",
			text:
				"Leave it blank and the name comes from the output pin. A **pure** node read in " +
				"one place is spliced into that place instead, binding nothing at all — naming " +
				"its result is how you ask for the local anyway.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**A result name and a Declare Local make two locals, and that is deliberate.** " +
				"Naming the result asks for a local; wiring that result into a Declare Local asks " +
				"for a second, so you get `local child = parent:FindFirstChild(name)` followed by " +
				"`local named = child`. Roswaal does not quietly collapse them, because which of " +
				"the two names you meant to keep is not a question it can answer for you. Use one " +
				"or the other: the **Result name** to name the value where it comes from, or a " +
				"**Declare Local** to name it where you want the name to appear.",
		},

		{ t: "h", level: 2, text: "What the code editor can see" },
		{
			t: "p",
			text:
				"Open a **Custom Code** or **Luau Expression** pin and the completion list is not " +
				"just Luau's globals. It is what the *generated file* will actually have in scope at " +
				"that point, worked out from the graph:",
		},
		{
			t: "table",
			head: ["Offered", "Because the emitter makes it"],
			rows: [
				["Your variables", "a file-level local, visible everywhere"],
				["Your functions", "a named local, visible after it is declared"],
				["Get Service and Require Module results", "hoisted to the top of the file"],
				[
					"Locals declared by **earlier Custom Code**",
					"real `local` statements in the same block, still alive when this one runs",
				],
			],
		},
		{
			t: "p",
			text:
				"That last row is the interesting one, and it follows the block structure rather " +
				"than the drawing order. A local from an earlier **Sequence** output *is* offered, " +
				"because those outputs run into the same block. One declared inside a loop body, a " +
				"connect handler, or the other arm of a Branch is *not* — it has died at its `end` " +
				"before this node runs. An outer local is still visible from inside a handler, " +
				"which is the direction that does work.",
		},
		{
			t: "graph",
			script: GUIDE_SCENES.localScope(),
			caption:
				"Sibling arms. The `local total` on the True side has gone out of scope by the time " +
				"the False side runs, so completion offers it in neither.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"The scanner errs towards offering **slightly too much** rather than too little: a " +
				"name declared inside an `if` within one Custom Code block is still offered after " +
				"it, in the same block. Suggesting a name that turns out to be out of scope costs " +
				"you a compile error; hiding one that is in scope costs you the feature.",
		},
		{
			t: "p",
			text:
				"Custom Code has no output pin, so it cannot hand a value onward by wire. To get " +
				"one out, write to a variable — or put **Declare Local** before it and assign to " +
				"that local in the code, which the completion list will offer by name. See " +
				"[Hand-written Luau](hand-written-luau) for what each of the two code nodes emits.",
		},
	],
};

/**
 * A guide scene's generated Luau, without its header. Compiled rather than
 * written out by hand, so the code under a picture is the code the picture makes.
 */
function compiledBody(script: NodeScript, registry: Registry): string {
	return stripHeader(compile(script, registry).code);
}

const ESCAPE_HATCHES = (registry: Registry): DocPage => ({
	slug: "hand-written-luau",
	narrow: true,
	title: "Hand-written Luau",
	summary: "The two nodes that take code, what they emit, and why there are only two.",
	blocks: [
		{
			t: "p",
			text:
				"Not everything is worth wiring. A regular expression, a table literal, a bit of " +
				"maths you already have — these are shorter as code, and Roswaal has two nodes that " +
				"take it.",
		},

		{ t: "h", level: 2, text: "Which one, and why" },
		{
			t: "p",
			text:
				"The difference is **where the code lands in the generated file**, not how long it " +
				"is. It is the one thing about these two nodes that is worth getting straight, " +
				"because everything else follows from it.",
		},
		{
			t: "table",
			head: ["", "Custom Code", "Luau Expression"],
			rows: [
				["Lands where", "a **statement** goes", "a **value** goes"],
				["Execution pins", "Yes — it is a step in the flow", "None. It is pure"],
				["Hands a value back", "No output pin", "Its output, wired anywhere"],
				["Length", "As many statements as you like", "One expression, however many lines that takes"],
				["Reach for it when", "you are *doing* something", "you are *computing* something"],
			],
		},
		...previews(
			registry,
			["code.custom", "value.expression"],
			"The shape says which is which before you read the title: Custom Code has execution " +
				"pins and no output, Luau Expression has an output and no execution pins.",
		),
		{ t: "h", level: 3, text: "Custom Code" },
		{
			t: "graph",
			script: GUIDE_SCENES.customCode(),
			caption:
				"A step in the flow. Its statements run in order, and whatever is wired after it " +
				"runs next.",
		},
		{ t: "code", lang: "luau", text: compiledBody(GUIDE_SCENES.customCode(), registry) },
		{ t: "h", level: 3, text: "Luau Expression" },
		{
			t: "graph",
			script: GUIDE_SCENES.luauExpression(),
			caption: "A value. Its text is written where the value is used — here, inside the Print.",
		},
		{ t: "code", lang: "luau", text: compiledBody(GUIDE_SCENES.luauExpression(), registry) },
		{
			t: "note",
			kind: "warn",
			text:
				"**Typing a statement into a Luau Expression is the mistake this distinction " +
				"exists to prevent.** `local x = 1` in one emits `print(local x = 1)` — the text " +
				"is raw, so nothing rewrites it into something valid. Roswaal now warns when an " +
				"expression starts with a statement keyword, but the general case is yours to get " +
				"right: if it would not fit inside brackets, it belongs in Custom Code.",
		},
		{
			t: "p",
			text:
				"Custom Code has no output pin, so it cannot hand a value onward. To get one out, " +
				"write to a script variable, or use **Declare Local** before it and assign in the " +
				"code — the completion list will offer that local by name.",
		},
		{
			t: "p",
			text:
				"Both pins are typed `luau` rather than `string`, and clicking one opens a real " +
				"editor: Luau highlighting, a structural check that marks a broken line as you type, " +
				"and completion over Luau's globals **and the names this graph puts in scope**.",
		},

		{ t: "h", level: 2, text: "What is in scope" },
		{
			t: "p",
			text:
				"Completion offers the locals a Custom Code block can actually see: the script's " +
				"variables, any local declared upstream in the same block, and a function's " +
				"parameters when the block is inside one. A local declared in a sibling branch is " +
				"not offered, because it does not exist there.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"The scope check reads the graph, not your code. If you declare a local **inside** a " +
				"Custom Code block, later blocks can see it — Roswaal knows, because it scans for " +
				"`local` — but a local declared inside an `if` within one snippet is still offered " +
				"after that `if` has closed. That is a known limit of scanning rather than parsing.",
		},

		{ t: "h", level: 2, text: "There are exactly two" },
		{
			t: "note",
			kind: "good",
			text:
				"Those two node titles are a **complete list** of where hand-written Luau can enter " +
				"a graph. Every other pin that defaults to something like `Vector3.zero` displays " +
				"that constant and will not accept typed code.",
		},
		{
			t: "p",
			text:
				"That guarantee is the point, and it is why a code pin has its own type. Plenty of " +
				"ordinary pins default to a raw Luau constant because their type has no literal " +
				"form — a `Vector3` input cannot sensibly default to `nil`. If every one of those " +
				"opened a code editor, a graph shared with you could hide arbitrary code inside a " +
				"node whose title says *Look At*, and reviewing it would mean opening every pin " +
				"rather than scanning for two node names.",
		},
		{
			t: "p",
			text:
				"To change a constant on an ordinary pin, wire a node into it or split it into its " +
				"components. Both got considerably easier than they were.",
		},

		{ t: "h", level: 2, text: "When to reach for something else" },
		{
			t: "ul",
			items: [
				"**A missing node.** Write it as a node pack instead — declarative, documented automatically, and reusable across graphs. Custom Code is a one-off.",
				"**A whole system.** Put it in a ModuleScript and use *Require Module* and *Call Function*. Roswaal is happy to call into Luau it did not write.",
				"**Something you cannot express.** Say so — a gap in the node library is worth filing, and this month several were closed that way.",
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"Code inside these nodes is **not** checked by the compiler beyond bracket balance. " +
				"It reaches the generated file exactly as typed, so a mistake surfaces in Studio " +
				"rather than in the editor.",
		},
	],
});

/**
 * The map drawn on the Roblox page.
 *
 * Small on purpose. It is here to be read in one look and matched against the
 * file beside it, not to be a realistic project — a tree deep enough to be
 * realistic is one where the reader loses which row they were following.
 *
 * `Shared` carries a class *and* a path, which is the case worth seeing: the
 * row says Folder, and the project file does not, because a path pointing at
 * a directory already tells Rojo that much.
 */
const ROBLOX_MAP: NodeMap = {
	schemaVersion: 1,
	kind: "map",
	id: "docs-map-roblox",
	name: "Tycoon",
	output: "default.project.json",
	root: {
		id: "dm",
		name: "DataModel",
		className: "DataModel",
		children: [
			{
				id: "rs",
				name: "ReplicatedStorage",
				children: [
					{ id: "shared", name: "Shared", className: "Folder", path: "src/Shared", children: [] },
				],
			},
			{
				id: "sss",
				name: "ServerScriptService",
				children: [
					{ id: "server", name: "Server", className: "Folder", path: "src/Server", children: [] },
				],
			},
		],
	},
};

/** The same figure for a Lune project: a tree, and the disk it describes. */
const LUNE_MAP: NodeMap = {
	schemaVersion: 1,
	kind: "map",
	id: "docs-map-lune",
	name: "tool",
	target: "lune",
	output: "",
	root: {
		id: "root",
		name: "tool",
		children: [
			{ id: "main", name: "main", file: true, children: [] },
			{
				id: "lib",
				name: "lib",
				children: [
					{ id: "json", name: "json", file: true, children: [] },
					{ id: "text", name: "text", file: true, children: [] },
				],
			},
		],
	},
};

/**
 * Compiling for Lune, and the map that describes a filesystem.
 *
 * Its own page rather than a branch inside the Roblox one. The two answer the
 * same question — where does this file end up — and answer it so differently
 * that one page would spend its length saying "unless you are on the other
 * one". A Lune developer should be able to read a page that is about Lune,
 * and that means this page carries the whole of compiling rather than sending
 * them to the Roblox page for the half that happens to be shared.
 */
const BUILDING_LUNE: DocPage = {
	slug: "compiling-for-lune",
	narrow: true,
	title: "Compiling and nodemaps for Lune",
	summary: "A graph becomes a file, and the file is where it is. No DataModel, no project file.",
	blocks: [
		{
			t: "p",
			text:
				"This page is about graphs whose **Target** is Lune. The bar along the top of the " +
				"canvas says which, and a new graph takes the project's. For Roblox, the answer is " +
				"a different one and it is on [Compiling and nodemaps for Roblox](building-and-rojo).",
		},
		{
			t: "p",
			text:
				"A graph is a `.nodescript` under `.roswaal/scripts`. Compiling it writes a `.luau` " +
				"file to the same place under the output directory, in the same shape: " +
				"`.roswaal/scripts/lib/json.nodescript` writes `src/lib/json.luau`. Both " +
				"directories are project [settings](settings).",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**There is no DataModel, so there is nothing to sync.** A Roblox project needs " +
				"Rojo to carry a file into a place, and a node map to say where it lands. Lune " +
				"runs the file where it is — `lune run main` — so the layout on disk is the whole " +
				"answer and there is no second copy of it to keep in step.",
		},

		{ t: "h", level: 2, text: "Nodemap basics" },
		{
			t: "p",
			text:
				"Here is the whole of it. A `.nodemap` is edited in Roswaal rather than by hand, and " +
				"this is that editor with *Describes* set to **A filesystem** — the tree on the left, " +
				"the Inspector on the right, and the layout it describes underneath. Every part is " +
				"named beside it; the rest of this page explains them in order.",
		},
		{
			t: "nodemap",
			map: LUNE_MAP,
			caption:
				"The same panel, describing a filesystem. **Select a row** to fill the Inspector. " +
				"A name carries no extension — `main` in the map, `main.luau` on disk, and the " +
				"require that reaches it beside.",
		},
		{ t: "h", level: 2, text: "What a graph compiles to" },
		{
			t: "p",
			text:
				"Always a `.luau` file named after the graph. A Roblox graph picks between Script, " +
				"LocalScript and ModuleScript, and the choice decides the file's ending because " +
				"Rojo reads it — `Greeter.server.luau`. Lune has no such distinction: a file is a " +
				"file, and whether it is a program or a module is decided by whether something " +
				"requires it.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"**Lune support is experimental.** It has not yet been tested by an experienced " +
				"Lune developer, so treat what it writes as a starting point.",
		},

		{ t: "h", level: 2, text: "Compiling" },
		{
			t: "table",
			head: ["", "What it compiles"],
			rows: [
				["**Compile script**, or `Ctrl` + `S`", "The open graph"],
				["**Compile project**", "Every graph, then every node map"],
				[
					"**Compile: Dynamic**",
					"Each graph as you edit it, and any that change on disk — after a `git pull`, say",
				],
				["`roswaal compile`", "Everything, or the one graph or map you give it"],
				["`roswaal watch`", "The same, without the editor"],
			],
		},
		{
			t: "p",
			text:
				"A graph with errors writes nothing; warnings do not stop it. With `format` on and " +
				"[StyLua](https://github.com/JohnnyMorganz/StyLua) on your PATH, the file is " +
				"formatted as it is written. Then `lune run main` — Roswaal does not run it for you.",
		},
		{
			t: "p",
			text:
				"A generated file starts with a header naming its graph and a hash of what was " +
				"written. Roswaal will not overwrite a file whose hash no longer matches — one " +
				"edited by hand — or a file it did not write. Rename a graph or move it and its " +
				"next compile removes the file it used to write; `roswaal prune` lists the ones " +
				"left behind by a graph that is gone.",
		},

		{ t: "h", level: 2, text: "What a nodemap is for here" },
		{
			t: "p",
			text:
				"A map still has a job, and it is the one Rojo was doing incidentally: **saying " +
				"the layout out loud, and checking it holds together**. Set a map's *Describes* to " +
				"**A filesystem** and it becomes directories and files rather than services and " +
				"instances. A new map is already the right kind — it follows the project's target.",
		},
		{
			t: "p",
			text:
				"What the right-hand column is *not* is a file Roswaal writes. A filesystem map " +
				"compiles to nothing: the disk is already the answer, and compiling the map is " +
				"checking that the answer is one Luau can load.",
		},
		{
			t: "table",
			head: ["", "A DataModel map", "A filesystem map"],
			rows: [
				["Root is", "The DataModel", "The project directory"],
				["Children are", "Services, folders, instances", "Directories and files"],
				["Compiles to", "`default.project.json`, for Rojo", "Nothing — it is a check"],
				["A node has", "A class and a path on disk", "A name, and whether it is a file"],
			],
		},

		{ t: "h", level: 2, text: "What it checks" },
		{
			t: "p",
			text:
				"These are **require-time errors in Luau**, not house style. The language refuses " +
				"an ambiguous path rather than picking one, so a layout with both of these is one " +
				"the runtime will not load — and a map catches it while you can still move " +
				"something, with both things named.",
		},
		{
			t: "ul",
			items: [
				"**A file beside a directory of the same name.** `require(\"./foo\")` cannot mean " +
					"both `foo.luau` and `foo/init.luau`.",
				"**Two files differing only by extension.** `foo.luau` and `foo.lua` both answer " +
					"to `./foo`.",
				"**A name a require cannot reach** — letters, digits, `.`, `-` and `_`, and no " +
					"directory separators.",
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"**A file's name carries no extension.** The `.luau` follows from the node being a " +
				"file, and the figure above shows it — `main` in the map, `main.luau` on disk. " +
				"Typing one is a warning rather than an error: it is the file you meant, and " +
				"saying so is how you avoid wondering why the disk has `main.luau.luau`.",
		},

		{ t: "h", level: 2, text: "Requires, and what the file depends on" },
		{
			t: "p",
			text:
				"Everything a Lune program reaches for arrives through a `require` you wrote. " +
				"The standard library is [Lune's standard library](lune-library); a short name " +
				"for a path is [Aliases and .luaurc](aliases); and the rule behind both is on " +
				"[Modules](modules) — a generated file does not grow imports nobody chose.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"**Roblox's datatypes are available, and are not free.** `Vector3` and `CFrame` " +
				"work in a Lune graph because `@lune/roblox` implements them — so the node is " +
				"offered, and it will not compile until that module is required with the datatype " +
				"as a member. The Inspector has the button. `TweenInfo` is a Roblox datatype Lune " +
				"does not implement, so its nodes stay out of a Lune graph entirely.",
		},
	],
};

const BUILDING: DocPage = {
	// The slug stays. It is in published links and in the editor's own jump
	// list, and a title is not a URL -- renaming the page should not move it.
	slug: "building-and-rojo",
	narrow: true,
	title: "Compiling and nodemaps for Roblox",
	summary: "How a graph becomes a file, and a file becomes an instance in Studio.",
	blocks: [
		{
			t: "p",
			text:
				"This page is about graphs whose **Target** is Roblox. The bar along the top of " +
				"the canvas says which, and a new graph takes the project's. For Lune, the answer " +
				"is a different one and it is on " +
				"[Compiling and nodemaps for Lune](compiling-for-lune).",
		},
		{
			t: "p",
			text:
				"A graph is a `.nodescript` under `.roswaal/scripts`. Compiling it writes a `.luau` " +
				"file to the same place under `src`, and [Rojo](https://rojo.space) syncs that into " +
				"Studio. Roswaal never talks to Studio itself.",
		},
		{
			t: "p",
			text:
				"Folders carry across: `.roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript` " +
				"writes `src/ReplicatedStorage/Shared/Greeter.luau`. Both directories are project " +
				"[settings](settings).",
		},

		{ t: "h", level: 2, text: "Nodemap basics" },
		{
			t: "p",
			text:
				"Here is the whole of it. A `.nodemap` is edited in Roswaal rather than as JSON by " +
				"hand, and this is that editor — the tree on the left, the Inspector on the right, " +
				"and the project file it writes underneath. Every part is named beside it; the rest " +
				"of this page explains them in order.",
		},
		{
			t: "nodemap",
			map: ROBLOX_MAP,
			caption:
				"The real panel. **Select a row** and the Inspector fills with that instance's " +
				"fields, while the project file scrolls to the lines the row writes. A row lights " +
				"its own lines and not its children's — they are rows too. The fields are filled " +
				"rather than editable: this is the editor demonstrating itself, not a scratch " +
				"project.",
		},
		{ t: "h", level: 2, text: "What a graph compiles to" },
		{
			t: "p",
			text:
				"The file is named after the graph, and its ending comes from the script kind, " +
				"chosen in the tools along the top of the canvas. The ending is how Rojo knows " +
				"which class of instance to make.",
		},
		{
			t: "table",
			head: ["Kind", "File", "In Studio"],
			rows: [
				["Script", "`Greeter.server.luau`", "A `Script`, running on the server"],
				["LocalScript", "`Greeter.client.luau`", "A `LocalScript`, running on a player's machine"],
				["ModuleScript", "`Greeter.luau`", "A `ModuleScript`, run by whatever requires it"],
			],
		},

		{ t: "h", level: 2, text: "Compiling" },
		{
			t: "table",
			head: ["", "What it compiles"],
			rows: [
				["**Compile script**, or `Ctrl` + `S`", "The open graph"],
				["**Compile project**", "Every graph, then every node map"],
				["**Compile: Dynamic**", "Each graph as you edit it, and any that change on disk — after a `git pull`, say"],
				["`roswaal compile`", "Everything, or the one graph or map you give it"],
				["`roswaal watch`", "The same, without the editor"],
			],
		},
		{
			t: "p",
			text:
				"A graph with errors writes nothing; warnings do not stop it. With `format` on and " +
				"[StyLua](https://github.com/JohnnyMorganz/StyLua) on your PATH, the file is " +
				"formatted as it is written.",
		},

		{ t: "h", level: 2, text: "Generated files" },
		{
			t: "p",
			text:
				"A generated file starts with a header naming its graph and a hash of what was " +
				"written. Roswaal will not overwrite a file whose hash no longer matches — one " +
				"edited by hand — or a file it did not write.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"To overwrite one anyway, click **overwrite** beside it in the compile results, or " +
				"run `roswaal compile --force`. Either way the hand edit is lost.",
		},

		{ t: "h", level: 2, text: "Moving and deleting graphs" },
		{
			t: "p",
			text:
				"Rename a graph, move it or change its kind, and its next compile removes the file " +
				"it used to write.",
		},
		{
			t: "p",
			text:
				"A generated file whose graph is gone is **stale**, and Rojo goes on syncing it. The " +
				"compile results list stale files with a **remove** link. From the command line, " +
				"`roswaal prune` lists them and `roswaal prune --yes` removes them.",
		},

		{ t: "h", level: 2, text: "Building a node map" },
		{
			t: "p",
			text:
				"A `.nodemap` says where your files land in the DataModel, and compiles to a Rojo " +
				"project file — `default.project.json` unless you change it. You edit the tree in " +
				"Roswaal rather than the JSON by hand.",
		},
		{
			t: "p",
			text:
				"Two things in that file are worth naming, because both are Roswaal leaving " +
				"something out on purpose. A service carries no `$className`, because Rojo already " +
				"knows what `ReplicatedStorage` is and saying it again is something Rojo rejects. " +
				"And `Shared` is a Folder in the tree with no `$className` in the file, because a " +
				"path pointing at a directory already implies one.",
		},
		{
			t: "p",
			text:
				"Make a map with **New map** in the toolbar, or by right-clicking a folder in the " +
				"project tree. It starts with `src` in ServerScriptService. Select an instance to " +
				"edit it:",
		},
		{
			t: "table",
			head: ["Field", "What it does"],
			rows: [
				["Name", "The instance's name in the DataModel"],
				[
					"Class",
					"Blank for a service, because Rojo already knows what ServerScriptService is. Otherwise Folder, Model, Configuration, ScreenGui, Part or Tool",
				],
				["Path", "The folder or file on disk that fills the instance. Marked when Roswaal cannot find it"],
				["Ignore unknown", "Rojo leaves alone anything in Studio that it did not put there"],
				[
					"Ignore paths",
					"Files under the path that Rojo should skip. Start one with `/` to write it from the project root",
				],
			],
		},
		{
			t: "p",
			text:
				"**Add folder** and **Add service** build the tree. Under **Project file**, " +
				"**Output** is where the file is written and **Project-wide ignores** go to Rojo as " +
				"written. The JSON it will write is shown underneath, with anything wrong — an " +
				"instance with no name, or two with the same one.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"A map is written only when you ask: **Write project file**, **Compile project**, " +
				"or `roswaal compile`. Dynamic compiling leaves maps alone. A project file Roswaal did not " +
				"write is not overwritten; `roswaal compile --force` takes it over.",
		},

		{ t: "h", level: 2, text: "Requiring a module" },
		{
			t: "p",
			text:
				"A map is also how Roswaal knows where a file ends up. Drag a graph or a `.luau` " +
				"from the project tree onto the canvas, and it offers **Require Module** with the " +
				"path filled in — `src/ReplicatedStorage/Shared/Greeter.luau` becomes " +
				"`ReplicatedStorage.Shared.Greeter` — or **Instance** for a reference to it. If no " +
				"map covers the file, it says so.",
		},
	],
};

/**
 * Settings and themes.
 *
 * Half of this page is generated, for the reason the node reference is: the
 * lists it carries are the real ones. The `roswaal.json` defaults come from
 * `defaultConfig()`, the theme roles from `ROLES`, and the table of shipped
 * schemes from the schemes themselves — so a default that changes, a role that
 * is added, or a palette that is dropped from a fork cannot leave this page
 * quietly describing the version before.
 */
function settingsPage(): DocPage {
	const defaults = defaultConfig();

	return {
		slug: "settings",
		narrow: true,
		title: "Settings and themes",
		summary: "What is a project setting, what is yours, and how a colour scheme is written.",
		blocks: [
			{
				t: "p",
				text:
					"There are two kinds of setting and they behave differently, which is worth " +
					"getting straight before changing either. **Project settings** are " +
					"`roswaal.json`: committed, shared by everyone working on the repository, and " +
					"they change what the compiler does. **Preferences** are yours — stored in " +
					"your browser, never written to the project, and invisible to everybody else.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"Both are edited from **Settings** in the toolbar, and preferences from the " +
					"Docs window's **Settings** too. The panel labels each " +
					"section with where it is stored, because the one mistake worth designing " +
					"against here is a personal colour scheme turning up in somebody's pull " +
					"request.",
			},

			{ t: "h", level: 2, text: "Project settings" },
			{
				t: "p",
				text:
					"Written to `roswaal.json` in the project root. `roswaal init` writes the " +
					"defaults out; every one of them is optional in a hand-written file.",
			},
			{
				t: "table",
				head: ["Key", "Default", "What it does"],
				rows: [
					[
						"`target`",
						`\`${defaults.target}\``,
						"Which flavour of Luau new graphs compile for. `lune` is **experimental**, and not yet tested by an experienced Lune developer; it drops the Roblox globals and nodes.",
					],
					[
						"`sourceDir`",
						`\`${defaults.sourceDir}\``,
						"Where `.nodescript` and `.nodemap` files are read from.",
					],
					[
						"`outDir`",
						`\`${defaults.outDir}\``,
						"Where generated `.luau` is written. This is the directory Rojo syncs.",
					],
					[
						"`compileMode`",
						`\`${defaults.compileMode}\``,
						"`hot` recompiles a graph every time it is written, which is every edit; `manual` waits to be asked. The editor shows these as **Dynamic** and **Manual** — the stored name is `hot` for the sake of every `roswaal.json` already written.",
					],
					[
						"`nodePaths`",
						`\`${JSON.stringify(defaults.nodePaths)}\``,
						"Directories scanned for `.nodedef.json` node packs.",
					],
					[
						"`format`",
						`\`${defaults.format}\``,
						"Run stylua over generated files when it is on PATH. When it is not, the file is written unformatted rather than not written.",
					],
					[
						"`comments`",
						"`true`",
						"Write each comment's header into the generated Luau, above the code of the nodes it is drawn around. A header of one line is written `-- like this`, one of several as a `--[[ ]]` block. Off keeps them in the editor, which is what other visual scripting tools do — see [Coming from Blueprints](coming-from-blueprints) if that is the habit you have.",
					],
					[
						"`indentStyle`",
						`\`${defaults.indentStyle}\``,
						"What one level of indentation is in the generated Luau: `tab`, or `space`. Handed to stylua as well when `format` is on, so this decides rather than whatever `stylua.toml` says.",
					],
					[
						"`indentWidth`",
						`\`${defaults.indentWidth}\``,
						"How many spaces one level is, when `indentStyle` is `space`. Ignored otherwise, except that stylua is told it so a tab still counts the right amount against its column limit.",
					],
					[
						"`rojoProject`",
						`\`${defaults.rojoProject ?? ""}\``,
						"Left for Rojo. Where a file lands in the DataModel comes from your node maps, and nothing is written to this file.",
					],
					["`schemaVersion`", "set for you", "Which schema the file was written against. `migrate.ts` reads it."],
				],
			},

			{ t: "h", level: 2, text: "Preferences" },
			{
				t: "p",
				text:
					"Stored in this browser under one key, and nowhere else. They do not follow " +
					"you to another machine, which is the right thing to give up: the " +
					"alternative is a per-developer file in a shared checkout.",
			},
			{
				t: "table",
				head: ["Preference", "What it does"],
				rows: [
					[
						"Theme",
						"The colour scheme, or **Follow the system** — which is the absence of a theme rather than a scheme of its own, so the app keeps changing with your OS.",
					],
					[
						"Realign",
						"Whether Realign straightens the execution spine or tidies into plain columns. A habit of reading rather than a property of the graph, which is why two people sharing a repository do not have to agree about it.",
					],
					[
						"Wires",
						"**Curved** is a bezier out of each pin, and the default. **Rigid** turns at right angles only. **Angular** leaves the pin level, takes one straight run to the other end, and arrives level — a diagonal rather than a cut corner. Where the input is *behind* the output there is no straight line to take, so angular borrows rigid's lane out and back, with its corners cut.",
					],
					[
						"Node corners",
						"Rounded or square. Capsule getters and reroute knots keep their shapes either way — a pill and a circle are what say *this is a value* and *this is a bend in the wire*, and neither has a title to say it instead.",
					],
					[
						"Long names",
						"**Truncate** cuts a header too long for its node short, with the whole of it in the tooltip — what nodes have always done. **Widen** draws the node wide enough for its header instead. It is the one of these looks that moves *pins*, so the wire router and the pictures on these pages are computed from the same width: a node and its own picture are never two different sizes.",
					],
					[
						"New logic nodes",
						"Whether a new **And**, **Or**, **Not** or comparison pill starts out bracketing its expression. Only the starting point: whether a node brackets is stored **on the node**, so it travels with the graph and reads the same on everybody's machine. Precedence is handled either way — this is about how the line reads, never about what it means. The casts are pills too and are not offered it: `(value :: T)` brackets itself already.",
					],
					[
						"Name in the graph tools",
						"**Show** puts the graph's name at the start of the tools over the canvas — `ƒ hide (Occupancy)` in a function's graph. Hidden by default, since the tab and the watermark say it already; unsaved edits are marked with a dot either way.",
					],
					[
						"Shorten function tabs",
						"What a function's tab says. **None** keeps `ƒ hide (Occupancy)`; **Function name** and **Script name** keep one of the two. The tooltip has both.",
					],
					[
						"Write a graph",
						"How long after your last edit a graph is written. A delay, not a switch — there is no unsaved copy of a graph, so switching it off would give you a document that quietly stops matching itself rather than a buffer.",
					],
					["On opening Roswaal", "Reopen the last project, or start at the picker."],
					[
						"Docs font",
						"The face the docs are read in: **System**, **Serif**, **Wide** or **Monospace**. Code keeps its own.",
					],
					[
						"Preview size",
						"How large node and graph pictures are drawn in the docs, from 50% to 300%. A graph bigger than its frame can be dragged around.",
					],
				],
			},

			{
				t: "note",
				kind: "info",
				text:
					"**Wires and node corners change how a graph looks, never what it means** " +
					"or what it compiles to — which is exactly the kind of thing worth a " +
					"setting rather than a patch.",
			},

			{ t: "h", level: 2, text: "Themes" },
			{
				t: "p",
				text:
					"One JSON file per scheme, in `themes/` at the repository root. Roswaal and " +
					"[Beako](https://github.com/neopolitans/Beako) use the same format, so a theme " +
					"written for one reads in the other.",
			},
			{
				t: "table",
				head: ["Scheme", "Credit", "Licence"],
				rows: [...BUILTIN_THEMES]
					.sort((a, b) => a.order - b.order)
					.map((t) => [
						t.name,
						t.credit ?? "—",
						t.licence ? `${t.licence.spdx}, in full under Settings → Licences` : "0BSD, with the repository",
					]),
			},
			{
				t: "h",
				level: 3,
				text: "Adding one",
			},
			{
				t: "p",
				text:
					"Copy the closest scheme, rename it after the slug of its new name, and edit. " +
					"Every field is required — there is deliberately no inheritance, because a " +
					"half-defined palette silently borrowing another one's colours is far harder " +
					"to debug than a missing-key error.",
			},
			{
				t: "code",
				lang: "json",
				text: JSON.stringify(
					{
						name: "My Theme",
						order: 7,
						dark: true,
						credit: "You",
						colors: { app: "#16181d", panel: "#1b1e24", "…": "…" },
						code: { keyword: "#c98fd0", string: "#8fce9b", "…": "…" },
					},
					null,
					2,
				),
			},
			{
				t: "p",
				text:
					"`npm run build:themes` compiles `themes/` into the bundle and refuses to " +
					"build a scheme that would not work. What it checks is worth knowing before " +
					"you hit it:",
			},
			{
				t: "ul",
				items: [
					"Every role is present, and every colour is a full `#rrggbb`. No short form, no names, no alpha.",
					"`dark` agrees with the actual brightness of `app`. It is not a description — every overlay is derived from it — so a scheme claiming `true` on a light ground would paint white onto white and make every hover state invisible.",
					"A node is distinguishable from the canvas it sits on.",
					"Body text clears 4.5:1 against both `app` and `panel`, and the quieter text roles clear their own lower bars.",
					"Syntax colours are visible on the surface code is shown on. `comment` is held to a lower bar than the rest on purpose — every serious syntax theme mutes its comments, and that is the author's decision rather than a mistake to correct for them.",
				],
			},

			{ t: "h", level: 3, text: "What a theme sets" },
			{
				t: "table",
				head: ["Role", "What it colours"],
				rows: [
					...ROLES.map((r) => [`\`${r.role}\``, r.what]),
					...CODE_ROLES.map((r) => [`\`code.${r.role}\``, r.what]),
				],
			},

			{ t: "h", level: 3, text: "What it does not" },
			{
				t: "p",
				text:
					"**Node category colours and pin type colours are fixed.** Red is a boolean, " +
					"green is a number, gold is a vector — that mapping is most of what makes a " +
					"Roswaal graph readable at a glance, and a scheme " +
					"that moved it would be trading the one thing the colours are for against a " +
					"matter of taste. They live in `palette.ts` and stay there.",
			},
			{
				t: "p",
				text:
					"**Hover, the grid, the watermark and the node shadow are not authored " +
					"either.** They are overlays — a translucent white or black over whatever is " +
					"underneath — and an overlay is the one kind of token an author gets wrong " +
					"without seeing it, because the mistake is invisible on the surface they " +
					"happened to be looking at. They are computed from `dark` instead, so a " +
					"palette cannot ship a hover state that does not show.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A data wire takes the colour of the pin it leaves, not a theme's. There was " +
					"a `wireData` role for exactly one afternoon; the test that checks every role " +
					"is actually read by something found that nothing had read it since data " +
					"wires started following their pin.",
			},
		],
	};
}

const TYPES_GUIDE: DocPage = {
	slug: "types",
	title: "Roswaal types",
	summary: "What a pin's type means, and where it differs from Luau's.",
	blocks: [
		{
			t: "p",
			text:
				"A pin's type does two jobs: it decides its colour, and it decides what will " +
				"connect to what. It is **not** a Luau type annotation — it is a promise about " +
				"the value, kept deliberately coarser than Luau's own type system so that wiring " +
				"stays a yes-or-no question rather than a typechecking session.",
		},
		{ t: "h", level: 2, text: "The types" },
		{
			t: "table",
			head: ["Type", "Holds", "Notes"],
			rows: [
				["`boolean`", "true or false", ""],
				["`number`", "A Luau number", "No integer/float split; Luau has one number type."],
				["`string`", "Text", "Quoted for you when it is emitted."],
				[
					"`table`",
					"Any Luau table",
					"One type for arrays, maps and sets, because Lua has one.",
				],
				["`function`", "A function value", "Get Function produces one."],
				["`Instance`", "Any Roblox instance", "A class such as `Model` narrows it. **Is A** asks at runtime."],
				[
					"`Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim`, `UDim2`",
					"Roblox value types",
					"All splittable — see below. Every operation on them is under **Engine types**.",
				],
				[
					"`BrickColor`",
					"A colour from Roblox's fixed palette",
					"**Not a** `Color3`, and not interchangeable with one. Read `.Color` to get the Color3 behind the name.",
				],
				[
					"`TweenInfo`, `Tween`",
					"How a tween moves, and a running one",
					"A TweenInfo is a description and can drive any number of tweens; a Tween is the thing that plays.",
				],
				["`RBXScriptSignal`", "A Roblox event", "Wires into Connect Event."],
				["`RBXScriptConnection`", "A live connection", "What Connect Event hands back."],
				[
					"`luau`",
					"Hand-written Luau",
					"Only on Custom Code and Luau Expression. See below.",
				],
				[
					"`any`",
					"Anything",
					"Connects both ways. What a node returns when it cannot say more.",
				],
				[
					"`wildcard`",
					"Anything, so far",
					"Meant to adopt the type it is wired to. It does not yet — see Known gaps.",
				],
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"A node pack can introduce its own type simply by naming one. Types are strings, " +
				"not a closed list, so a pack declaring `Quaternion` gets a distinct pin that only " +
				"connects to other `Quaternion` pins — without patching Roswaal.",
		},
		{ t: "h", level: 2, text: "What connects to what" },
		{
			t: "ul",
			items: [
				"The same type always connects.",
				"`any` connects to anything, in both directions.",
				"`number` and `string` connect either way, because Luau coerces them. The wire is drawn as a gradient between the two colours to say so.",
				"Execution and data never connect.",
				"Everything else is refused during the drag, rather than at compile time.",
			],
		},
		{ t: "h", level: 2, text: "luau is a type, not a string" },
		{
			t: "p",
			text:
				"**Custom Code** and **Luau Expression** have a pin typed `luau`. It holds code you " +
				"write, and clicking it opens a proper editor with highlighting and completion.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"Those two pins are a **complete list** of where hand-written Luau can enter a " +
				"graph. Everywhere else, a pin holding something like `Vector3.zero` is a constant " +
				"Roswaal wrote and shows read-only. That is what makes reviewing a shared graph a " +
				"matter of scanning for two node titles rather than opening every pin.",
		},
		{
			t: "p",
			text:
				"It is a pin type rather than a badge on a string because it *is* a different kind " +
				"of pin, and a type says that more plainly than a warning does.",
		},
		{ t: "h", level: 2, text: "Pins that are typed in, not wired" },
		{
			t: "p",
			text:
				"Some inputs become part of the generated source rather than a value it reads: a " +
				"property name in `Get Property`, the type in `Cast`. They are marked **literal** " +
				"in the reference, and the editor refuses a wire to one during the drag rather " +
				"than letting the compile fail later.",
		},
		{
			t: "code",
			lang: "luau",
			text: [
				'-- Get Property, with Property typed in as "Name"',
				"print(instance.Name)",
				"",
				"-- The name is part of the code, not a value it reads.",
			].join("\n"),
		},
		{ t: "h", level: 2, text: "Optional arguments" },
		{
			t: "p",
			text:
				"Some inputs read **default** in a dashed box rather than showing a value. " +
				"Those are optional: left alone, the argument is *not passed at all*, and the " +
				"call uses whatever it would have used anyway. Click one to set a value; the " +
				"**×** beside a value you set puts it back.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"This is not the same as a pin with a default. A default is a **value**, and " +
				"leaving that pin alone emits it. An optional pin left alone emits nothing — " +
				"which matters because plenty of Roblox constructors reject an explicit `nil` " +
				"where they accept a missing argument, so the two are different calls and only " +
				"one of them works.",
		},
		{
			t: "code",
			lang: "luau",
			text: [
				"-- nothing set",
				"TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)",
				"",
				"-- repeat count set to 2",
				"TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 2)",
				"",
				"-- only the delay set: the gap before it has to be held open",
				"TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, nil, nil, 0.5)",
			].join("\n"),
		},
		{
			t: "p",
			text:
				"Only *trailing* unset arguments disappear. One with a set argument after it is " +
				"passed as `nil`, because dropping it would shift everything left and the delay " +
				"would arrive as the repeat count.",
		},
		{ t: "h", level: 2, text: "Splittable types" },
		{
			t: "p",
			text:
				"`Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` and `UDim2` come apart into their " +
				"components — right-click a pin and pick **Split Struct Pin**. `CFrame` offers " +
				"three decompositions; the rest have one. Splitting and recombining never change " +
				"what the graph compiles to.",
		},
		{ t: "h", level: 2, text: "Where Luau's types come in" },
		{
			t: "p",
			text:
				"This page is about the types a **pin** has: what may be wired to what, and the " +
				"colour it is drawn in. Luau's own type system is richer, and everything that " +
				"crosses between the two — casts, declared types, and the annotations Roswaal " +
				"writes into the generated file — is on [Casting and annotations](casting).",
		},
	],
};

/**
 * Luau's types, where a graph meets them.
 *
 * Split out of *Roswaal types* in 0.31.0. It was three paragraphs at the foot
 * of that page, written when casting was the only place the two type systems
 * touched — and by 0.30.0 it was not: a type can be declared in three shapes, a
 * local and a variable can carry one, a required module's types can be named,
 * and a type that is more than a name is written into the file as itself. That
 * is a page, not a footnote.
 */
/** Functions, and the graph each one opens in. */
function functionsPage(registry: Registry): DocPage {
	return {
		slug: "functions",
		title: "Functions",
		summary:
			"The two ways to declare one, the graph each opens in, how to call it, and what can " +
			"reach inside.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"Every function in a nodescript has a **graph of its own**. Its body is built there, " +
					"it opens in a tab, and the nodescript's own graph stays about the script's flow.",
			},
			{
				t: "p",
				text:
					"Functions are the language's, not the engine's, so everything on this page works " +
					"the same whether the graph compiles for Roblox or for [Lune](modules).",
			},

			{ t: "h", level: 2, text: "Two ways to declare one" },
			{
				t: "table",
				head: ["Node", "Written", "Drawn in"],
				rows: [
					["**Function**", "At the top of the file, so anything can call it", "Its own graph only, as the entry node"],
					["**Declare Function**", "Where the node sits in the flow, or onto a table with **On Table**", "The flow, and its own graph as the entry node"],
				],
			},
			...previews(
				registry,
				["function.entry", "function.declareHere"],
				"As the reference draws them, with every pin. On the canvas Declare Function shows " +
				"half of these in each of its two graphs.",
			),
			{
				t: "p",
				text:
					"Reach for **Declare Function** when the function has to come after something — " +
					"`function TankConfig.read(tank: Model)` needs `TankConfig` to exist first — and " +
					"for **Function** when it is simply something the script has.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"**On Table** has to resolve to a name — a variable or a local. Luau has no " +
					"syntax for attaching a function to an expression, so anything else is refused " +
					"rather than half-written. Left unwired it is a plain `local function` at that " +
					"point in the flow.",
			},

			{ t: "h", level: 2, text: "The signature" },
			{
				t: "p",
				text:
					"Name, parameters and return values are all edited in the Inspector, on either " +
					"declaration node. The signature is written under the node's header — " +
					"`read(tank: Model): Config` — so a graph full of functions can be read without " +
					"opening any of them.",
			},
			{
				t: "table",
				head: ["Field", "What it does"],
				rows: [
					["**Name**", "What the function is called, and what a Get Function offers"],
					["**Parameters**", "Name and optional Luau type each. They become data outputs on the entry node, in this order"],
					["**Return values**", "Name and optional Luau type each. They become input pins on every **Return** in this function"],
				],
			},
			{
				t: "p",
				text:
					"A type here is **free text**, the same as a local's or a variable's: `BasePart?`, " +
					"`{ [Model]: Restore }` and a union are all types no dropdown could offer. Left " +
					"blank there is no annotation at all rather than `any`.",
			},
			{
				t: "p",
				text:
					"Renaming a parameter carries every node reading it along. **Reordering** them " +
					"leaves those nodes alone, because a Get Parameter holds the parameter's name and " +
					"not its position. **Removing** one leaves the node saying which parameter is " +
					"gone.",
			},

			{ t: "h", level: 2, text: "A function's graph" },
			{
				t: "p",
				text:
					"It opens in a tab marked **ƒ** and named for the function and its script: " +
					"`hide (Occupancy)`. **Shorten function tabs** in [settings](settings) keeps one of " +
					"the two names. The entry node carries **Body** and the parameters, and the " +
					"function's **Return** nodes go in this graph too.",
			},
			{
				t: "ul",
				items: [
					"In the project tree, the arrow beside a `.nodescript` lists its functions. Double-click one to open it.",
					"Click a function in the **Variables panel**.",
					"Double-click a **Declare Function** in the flow, or click the **ƒ** on its header.",
					"Adding a **Function** opens its graph straight away.",
				],
			},
			{
				t: "p",
				text:
					"`P` **with nothing selected previews the function you are in**, rather than the " +
					"whole script. The nodescript's own graph still previews all of it.",
			},

			{ t: "h", level: 2, text: "Declare Function, in two graphs" },
			{
				t: "table",
				head: ["Graph", "Its pins there"],
				rows: [
					["The flow it is declared in", "In, Then, On Table, and Function — the function as a value"],
					["Its own graph", "Body, and one output per parameter"],
				],
			},
			{
				t: "p",
				text:
					"It is one node with a place in each. Moving it in one graph does not move it in " +
					"the other, and renaming it or changing its parameters shows in both.",
			},

			{ t: "h", level: 2, text: "Returning" },
			{
				t: "p",
				text:
					"**Return** ends the enclosing function, and it lives in that function's graph. " +
					"Give the function return values in the Inspector and each one becomes a pin on " +
					"every Return in it — named, typed, and with a default you can type in rather " +
					"than having to wire a node up for a constant.",
			},
			...previews(
				registry,
				["function.return"],
				"A Return with no values configured is the bare `return`. Each value you add to the " +
				"signature adds a pin here.",
			),
			{
				t: "note",
				kind: "info",
				text:
					"A function with no Return at all is fine — it runs to the end of its body and " +
					"returns nothing, the same as the Luau it compiles to.",
			},

			{ t: "h", level: 2, text: "Calling one" },
			{
				t: "p",
				text:
					"A function is reached as a **value** first, and then called. **Get Function** is " +
					"that value for a function declared in this graph; the **Function** output on " +
					"either declaration node is the same thing, which is what lets one be handed to " +
					"**Connect** or returned from a module without a wrapper node.",
			},
			{
				t: "table",
				head: ["Node", "When"],
				rows: [
					["**Call Function**", "The call does something. It sits in the execution chain and binds its result to a local"],
					["**Call For Value**", "The call asks something. No execution wire, so it goes where a value goes — inside a table, an argument, an expression"],
					["**Call Method**", "The call is colon-style, on an object: `part:Destroy()`. See [Services and their methods](services) for the service case"],
				],
			},
			...previews(
				registry,
				["function.get", "call.function", "call.value"],
				"Both call nodes take the function on a wire, and the argument count is set in the " +
				"Inspector rather than fixed by the node.",
			),
			{
				t: "code",
				lang: "luau",
				text:
					"-- Call Function: the result is bound, and the order is on the wire\n"
					+ "local config = TankConfig.read(tank)\n"
					+ "\n"
					+ "-- Call For Value: spliced into whatever reads it\n"
					+ "return { movementSpeed = readNumber(hullSettings, \"MovementSpeed\") }",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A **Get Function** above a **Declare Function** reports that the function does " +
					"not exist yet. The function is named where it is declared, so reaching it " +
					"earlier in the flow is an error rather than a name that has not been reached. " +
					"A hoisted **Function** has no such order to get wrong.",
			},

			{ t: "h", level: 2, text: "Reading a parameter" },
			{
				t: "p",
				text:
					"The parameter pins on the entry node work and are not going away, but in a " +
					"function of any size the wires off them cross the whole body. **Get Parameter** " +
					"reads one by name instead — the same trade [Get Local](variables-and-locals) " +
					"makes. Pick the function and the parameter in the Inspector.",
			},
			...previews(registry, ["function.getParam"]),
			{
				t: "ul",
				items: [
					"It works inside an **event handler** as well as a function: Connect binds its " +
						"handler's parameters in the same way.",
					"Typing a parameter's name into the node search offers **Get ‹parameter›** " +
						"directly, with From and Parameter already filled in.",
					"A parameter is offered only **inside the body it belongs to** — a function's in " +
						"its own graph, a handler's where its node is drawn.",
				],
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A Get Parameter outside the body it belongs to is an error naming both. That is " +
					"the compiler's own scope rule rather than a separate check, so the editor and " +
					"the generated file cannot disagree about it.",
			},

			{ t: "h", level: 2, text: "Finding one" },
			{
				t: "p",
				text:
					"The **Variables panel** lists every function this script declares, under its own " +
					"heading. Click one to open its graph; drag it onto the canvas for a **Get " +
					"Function**.",
			},
			{ t: "toolbar", bar: FUNCTIONS_PANEL, hint: true },
			{
				t: "p",
				text:
					"Both node searches know them too. **This graph**, in the node menu's filter row, " +
					"sets the built-in library aside and leaves what this graph declares: its " +
					"variables, locals, functions and — in a function's own graph — that function's " +
					"parameters. `Ctrl` + `right-click` opens the same list as the **node picker**, " +
					"with each entry drawn as you walk it.",
			},

			{ t: "h", level: 2, text: "What reaches inside" },
			{
				t: "p",
				text:
					"**A wire cannot run between two graphs.** A value reaches a function through a " +
					"parameter — wired from the entry node, or read with [Get Parameter](variables-and-locals) — " +
					"through a local declared before it, or through a script variable. Anything you add " +
					"in a function's tab goes in that function's graph.",
			},
			{
				t: "p",
				text:
					"Which locals count as *before it* is the one place the two declarations differ. " +
					"A **Declare Function** is written where it sits, so it closes over the file's " +
					"locals and the Variables panel lists them inside it. A hoisted **Function** is " +
					"written above them, so it cannot see them and they are not offered.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A wire between two graphs can only come from a hand-edited file or a bad merge, " +
					"and it is an error on the node it runs into.",
			},

			{ t: "h", level: 2, text: "Editing a function as a whole" },
			{
				t: "ul",
				items: [
					"**Select all**, marquee select, **Realign** and align act on the graph on screen, and only that.",
					"**Deleting** a function deletes its graph, and asks first when there are nodes in it. Its tab closes.",
					"**Copying** a function copies its graph, so the paste is a working function. Only its declaration lands at the pointer; the nodes inside keep their places.",
				],
			},
		],
	};
}

/**
 * Services and the methods on them.
 *
 * Written because the honest answer to "how do I call `RunService:IsServer()`"
 * used to be "you cannot, unless somebody wrote a node for it", and the shape of
 * the answer now — a catalogue, two nodes and a picker — is not one a reader
 * would guess from the palette.
 */
function servicesPage(registry: Registry): DocPage {
	return {
		slug: "services",
		title: "Services and their methods",
		summary: "Get Service, the two Service Function nodes, and the catalogue they read.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"A Roblox script reaches the engine through **services**: `Players`, `RunService`, " +
					"`TweenService`. **Get Service** hands you one, and every node that asks for the " +
					"same service shares a single `local` at the top of the file — which is how a " +
					"hand-written module does it.",
			},
			{
				t: "p",
				text:
					"Calling a *method* on one is the other half. **Service Function** does something " +
					"— `Debris:AddItem`, `TweenService:Create` — and sits in the execution chain. " +
					"**Service Function (Value)** asks something — `RunService:IsServer`, " +
					"`Players:GetPlayers` — and has no execution pins, so it wires straight into the " +
					"Branch or the loop that wanted the answer.",
			},
			...previews(
				registry,
				["roblox.getService", "roblox.serviceValue", "roblox.serviceCall"],
				"Both Service Function nodes arrive blank. Pick the call in the Inspector, or " +
				"search the palette for the method by name and the node comes configured.",
			),
			{
				t: "graph",
				script: GUIDE_SCENES.serviceCall(),
				caption:
					"RunService:IsServer() as a value: no execution wire, and no Get Service node " +
					"either — the service is hoisted for it.",
			},
			{
				t: "code",
				lang: "luau",
				text: [
					'local RunService = game:GetService("RunService")',
					"",
					"if RunService:IsServer() then",
					'\tprint("On the server")',
					"else",
					'\tprint("On the client")',
					"end",
				].join("\n"),
			},

			{ t: "h", level: 2, text: "Asking a service what it can do" },
			{
				t: "p",
				text:
					"**Drag a wire off a service and drop it on empty canvas.** The menu opens on " +
					"that service's own methods, under its name — `GetPlayers`, `GetPlayerByUserId`, " +
					"`BanAsync` — and picking one places the node with the wire already landed on it. " +
					"Everything else the graph could do with an Instance is still underneath, where " +
					"it always is.",
			},
			{
				t: "p",
				text:
					"That wire lands on the node's first pin, which is the service the call is made " +
					"*on*. Left unwired it is nothing at all: the service is reached and hoisted the " +
					"way Get Service reaches it, and the node draws as the call. Wired, the value on " +
					"it is what the method runs against — which is what makes the gesture honest " +
					"rather than a shortcut that throws your wire away.",
			},

			{ t: "h", level: 2, text: "Picking the call" },
			{
				t: "p",
				text:
					"**Call** in the Inspector opens the picker — every method of every service, " +
					"grouped by service, searchable, with the signature under the highlighted row. " +
					"The palette knows them too: type `IsServer` into the node menu and the entry is " +
					"there, and picking it places the node already set to that call.",
			},
			{
				t: "p",
				text:
					"The service itself is in there by name as well: typing `ReplicatedStorage` " +
					"offers **Get Service** with the name filled in, and any other class name — " +
					"`Part`, `ProximityPrompt` — offers **New Instance** the same way.",
			},
			{
				t: "p",
				text:
					"Arguments arrive from the method's own signature: named, typed, and marked " +
					"optional where the engine documents a default. An optional argument nothing " +
					"set is **not passed at all** rather than passed as nil, which is the difference " +
					"between a call the engine accepts and one it rejects.",
			},
			{
				t: "ul",
				items: [
					"An **enum** argument is typed as its member name — `E`, `Begin` — and written " +
					"out in full as `Enum.KeyCode.E`. Wire one instead and the wire wins.",
					"A method that **returns nothing** has no Result pin, because a pin that can " +
					"only be nil is one somebody will try to use.",
					"A method that **yields** says so in the Inspector. Those are never offered as " +
					"the value node: a call that stops the thread belongs in the chain.",
				],
			},

			{ t: "h", level: 2, text: "Where the list comes from" },
			{
				t: "p",
				text:
					"The catalogue is built from Roblox's own documentation repository and shipped " +
					"with Roswaal, so nothing here talks to the network. It holds what a game script " +
					"may call: methods behind a security context are not offered, and neither are " +
					"deprecated ones. Methods a service inherits are included down to `Instance`, " +
					"which is where they stop — `Find First Child` and `Destroy` have nodes of their " +
					"own.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"It is a **snapshot, not a gate**. The picker commits whatever you type, so a " +
					"method the engine shipped after this build still compiles — set the argument " +
					"count in the Inspector and wire them up.",
			},
			{
				t: "table",
				head: ["When", "Node"],
				rows: [
					["A method on a service, in the chain", "**Service Function**"],
					["A method on a service, as a value", "**Service Function (Value)**"],
					["A method on anything else — a part, a Humanoid, a module's table", "**Call Method**"],
					["The service itself, to wire somewhere", "**Get Service**"],
				],
			},
			{
				t: "p",
				text:
					"**Call Method** is the general one and is not going anywhere: it takes the object " +
					"as a wire, so it reaches anything a graph can hold. Service Function is worth " +
					"the second node because the signature is known — the arguments are named and " +
					"typed rather than a row of `any` you count yourself.",
			},
		],
	};
}

function castingPage(registry: Registry): DocPage {
	return {
		slug: "casting",
		title: "Casting and annotations",
		summary: "Where a pin's type ends and Luau's begins: casts, declared types, and what gets written.",
		narrow: true,
		blocks: castingBlocks(registry),
	};
}

/**
 * Its blocks, which need the registry: the pictures are drawn from the live
 * definitions, so a node that changes shape changes here too.
 */
function castingBlocks(registry: Registry): Block[] {
	return [
		{
			t: "p",
			text:
				"There are two type systems here and they are not the same size. A **pin type** is " +
				"Roswaal's: one name, used to decide what may be wired to what and what colour to " +
				"draw it. A **Luau type** is whatever Luau can say — unions, optionals, table " +
				"types, functions, generics. Everything on this page is one of the places the " +
				"second one reaches the file.",
		},

		{ t: "h", level: 2, text: "Casting" },
		{
			t: "p",
			text:
				"**Cast** takes any Luau type expression verbatim, so an intersection, a union or a " +
				"table type all work — its Type pin is typed in rather than wired, because the text " +
				"becomes part of the generated code.",
		},
		{
			t: "p",
			text:
				"All three are drawn as **pills**, the shape the comparisons and **and** / **or** " +
				"use: the value and the type down the left, the symbol in the middle, the result on " +
				"the right. A cast *is* an operator, and the shape is the point — a claim made " +
				"without a check is worth spotting at a glance rather than after reading a header.",
		},
		{
			t: "p",
			text:
				"**Shows**, in the Inspector, swaps the `::` for the node's name where that reads " +
				"better — `::` is Luau's own and is the one symbol here nobody arrives already " +
				"knowing. It is stored on the node, because it sets the pill's width; **New cast " +
				"nodes** in Settings decides what a cast you drop today starts as.",
		},
		{
			t: "p",
			text:
				"The Type pin is a **list you pick from**: Luau's own types, then Roblox's " +
				"datatypes, then every Instance class, grouped as the class picker groups them. " +
				"Still only a suggestion — whatever you type is committed, which is how an " +
				"intersection like `Model & { Humanoid: Humanoid }` is written.",
		},
		...previews(
			registry,
			["cast.as", "cast.array", "cast.any"],
			"The three of them. The type is picked from the list or typed, and either way it " +
			"becomes text in the generated file rather than a value at runtime.",
		),
		{
			t: "code",
			lang: "luau",
			text: "local humanoid = (character :: Model & { Humanoid: Humanoid }).Humanoid",
		},
		{
			t: "table",
			head: ["Node", "Writes", "For"],
			rows: [
				["**Cast**", "`(value :: T)`", "Saying what a value is, when you know and the typechecker does not."],
				["**Cast Array**", "`(value :: { T })`", "A collection you know more about than its type says — Get Descendants is `{ Instance }`."],
				[
					"**Cast Through Any**",
					"`((value :: any) :: T)`",
					"Two types Luau will not convert between directly. The `any` in the middle is the claim being made twice.",
				],
			],
		},
		{
			t: "note",
			kind: "warn",
			text:
				"`::` is a **claim, not a check** — there is no runtime test and being wrong is " +
				"silent. Ask with **Is A** first, which is a real test and narrows the type for " +
				"the branch it guards.",
		},
		...previews(
			registry,
			["instance.isA"],
			"Is A asks the question a cast assumes the answer to. Branch on it, and cast inside " +
			"the arm where it is true.",
		),

		{ t: "h", level: 2, text: "Where the cast is written" },
		{
			t: "p",
			text:
				"A cast is the one value node whose *line* can be the point. **Cast** in the " +
				"Inspector chooses which of three:",
		},
		{
			t: "table",
			head: ["Cast", "Writes", "For"],
			rows: [
				[
					"**Automatic**",
					"A line once two things read it",
					"The default, and the rule every pure node follows. One reader gets it spliced; two get `local part = value :: BasePart` and then read `part`.",
				],
				[
					"**Explicit**",
					"Always a line",
					"Several statements below read it and you would rather see the claim written once, above them, than repeated at each use.",
				],
				[
					"**Implicit**",
					"Never a line",
					"The assertion is spliced where it is used — and dropped entirely where Luau has already narrowed the value itself.",
				],
			],
		},
		{
			t: "h",
			level: 3,
			text: "An implicit cast inside an Is A branch disappears",
		},
		{
			t: "p",
			text:
				"Luau narrows a value for the length of the arm that tested it. Inside " +
				"`if part:IsA(\"BasePart\") then`, `part` **is** a BasePart as far as the " +
				"typechecker is concerned, and a cast there tells it nothing it does not know. An " +
				"implicit Cast in that arm therefore writes nothing at all and hands the value " +
				"through, which is what the hand-written Luau does too.",
		},
		{
			t: "code",
			lang: "luau",
			text: [
				"for _, part in character:GetDescendants() do",
				'\tif part:IsA("BasePart") then',
				"\t\t-- an implicit Cast to BasePart here writes nothing",
				"\t\tpart.Transparency = 1",
				'\telseif part:IsA("Decal") or part:IsA("Texture") then',
				"\t\t-- and here, a cast to `Decal | Texture` writes nothing either",
				"\t\tpart.Transparency = 1",
				"\tend",
				"end",
			].join("\n"),
		},
		{
			t: "p",
			text:
				"Two classes tested with **Or** narrow the value to *either* of them, so the claim " +
				"that matches is the union — `Decal | Texture` — and that is the one that " +
				"disappears. A cast to only one half stays, because the Or did not prove it. **And** " +
				"narrows everything both sides tested, since both hold.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"The match has to be **exact**: the classes the branch proved and the classes the " +
				"cast claims are the same set, or the cast is written. Roswaal has no table of " +
				"which Roblox class derives from which, so it will not quietly drop a cast to " +
				"`BasePart` because the branch proved `Part` — nor, more importantly, the other " +
				"way round.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"The narrowing belongs to the **True arm**, and to nothing else. The False arm of " +
				"the same Branch proved nothing, a later statement after the `end` proved nothing, " +
				"and an implicit cast in either of those places is written out in full.",
		},

		{ t: "h", level: 2, text: "Declaring a type" },
		{
			t: "p",
			text:
				"**Declare Type at Top** writes above everything else; **Declare Type** writes where " +
				"the node sits, which is what a type built from `typeof` needs, because Luau reads a " +
				"file in order. Both take three shapes:",
		},
		...previews(
			registry,
			["type.declareTop", "type.declareHere"],
			"The hoisted one has no pins at all — it declares rather than runs. The in-flow one " +
			"sits in the execution chain, and shows a Value pin only for the typeof shape.",
		),
		{
			t: "table",
			head: ["Shape", "Writes", "When"],
			rows: [
				["**Table of Fields**", "`{ walkSpeed: number, weld: WeldConstraint? }`", "A record. The fields are rows in the Inspector, so a brace cannot go missing."],
				["**Custom Luau**", "Whatever you type", "A union, a function type, a generic — everything the row editor cannot say."],
				[
					"**Type of a Value**",
					"`typeof(Tuning)`",
					"The type of something the file already has. Declare Type only, since a hoisted type is written above every value there is.",
				],
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"A declared type is **exported** unless you untick it, which is what lets another " +
				"graph name it after requiring the module. `export type` is only legal at the top " +
				"level, so an exported one inside a branch, a loop or a function is refused rather " +
				"than written where Luau will not take it.",
		},

		{ t: "h", level: 2, text: "What Roswaal writes for you" },
		{
			t: "p",
			text:
				"Annotations follow the graph's **typechecking mode**, in the tools along the top of the canvas. " +
				"*Default* writes no mode line and no annotations; *Nonstrict* and *Strict* write " +
				"both. So a type you set is a type that appears — in the two modes that asked for " +
				"types at all.",
		},
		...previews(
			registry,
			["local.declare", "local.get"],
			"Declare Local carries the type, and shows it under its title once set. Get Local " +
			"reads the value by name, with its pin taking the type's own colour.",
		),
		{
			t: "table",
			head: ["Set on", "Comes out as"],
			rows: [
				["A variable, in the Variables panel", "`local health: number = 100`"],
				["A variable set to **const**", "`const health: number = 100`"],
				["A **Declare Local**, in the Inspector", "`local restores: { [Model]: Restore } = {}`"],
				["A function's parameters and returns", "`local function read(tank: Model): Config`"],
				["A node that produces a value", "`local part: BasePart = ...`"],
			],
		},
		{
			t: "p",
			text:
				"**A type that is more than a name is written as itself.** `{ [Model]: Restore }`, " +
				"`Model?` and `(number) -> string` used to come out as `any` with nothing said about " +
				"it; they are written as typed now, and a mistake in one is Luau's to report with a " +
				"line number. Text that is plainly not a type — two words, an unclosed brace — still " +
				"becomes `any`, because writing it would break the file rather than the line.",
		},

		{ t: "h", level: 2, text: "Choosing one" },
		{
			t: "p",
			text:
				"Everywhere a type is chosen — a variable, a parameter, a local, a field of a " +
				"declared type — the control is the **picker**: the same window the Class Name " +
				"pins and the casts open. Search at the top, everything under it, grouped by " +
				"where each type comes from.",
		},
		{
			t: "p",
			text:
				"The headings are ordered by how close to hand they are: **this graph's own** " +
				"declared types first, then the types **a required module exports**, written as " +
				"you would write them (`Config.Tuning`), then Luau's own, then Roblox's values — " +
				"and after those the instance classes, grouped the way the engine groups them.",
		},
		{
			t: "p",
			text:
				"**Whatever you type is taken**, listed or not, which is how a type the list " +
				"could never hold is set: `{ [Model]: Restore }`, `Model?`, `(number) -> string`. " +
				"Clearing it means `any`.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Typing it in is not the only way out.** Where a type is a whole declaration rather " +
				"than a name, declare it once and pick it by name afterwards: **Custom Luau** on a " +
				"Declare Type node for a union or a function type, or **Type of a Value** for " +
				"`typeof(Tuning)`. It then appears under *This graph* in every picker in the " +
				"graph, which beats typing the same type expression into three of them.",
		},
		{
			t: "p",
			text:
				"The Variables panel lists those same types under **Types**. Drag one onto the " +
				"canvas for a **Declare Local** of that type, or hold Ctrl for a **Cast** to it — " +
				"the same Get-or-Set convention a variable follows.",
		},

		{ t: "h", level: 2, text: "What a pin type still decides" },
		{
			t: "p",
			text:
				"A wire is allowed when the two pins agree, when either is `any` or `wildcard`, " +
				"between `number` and `string` because Luau converts those itself, and from an " +
				"**instance class to an** `Instance` **pin** — a `Model` goes anywhere an `Instance` is " +
				"wanted. The editor and the compiler ask the same question, so a wire the canvas " +
				"accepts is never one the compile complains about.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"The other direction is refused. An `Instance` into a `Model` pin is a claim about " +
				"what the value *is* rather than a fact about its type — which is exactly what " +
				"**Cast** is for, and why it is a node you can see in the graph rather than a rule " +
				"that quietly lets it through.",
		},
	];
}

/**
 * Making a node of your own, by whichever of the three routes suits you.
 *
 * The routes are the thing this page exists for. They were documented in three
 * places that did not know about each other — a paragraph in the README, an
 * example pack written by `roswaal init`, and the library's own source — so
 * which of them applied to you was the hard part, and it was nobody's job to
 * say. The switch at the top is that answer, made explicit.
 */
const CUSTOM_NODES: DocPage = {
	slug: "creating-custom-nodes",
	title: "Creating custom nodes",
	summary: "Node Design, pack files and TypeScript: the ways to define a node of your own, and what they share.",
	narrow: true,
	blocks: [
		{
			t: "p",
			text:
				"A node is **data**: an id, some pins, and a template saying what it compiles to. " +
				"Nodes of your own live in *packs* under `.roswaal/nodes`, which the daemon loads " +
				"when it opens the project — so a pack is committed with the repository and " +
				"everybody working in it has the same palette.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"**A pack is never executed.** A Luau pack is *parsed*, and only literal values are " +
				"allowed, so loading somebody else's pack cannot run their code. That is why the " +
				"template language exists rather than a callback.",
		},
		{
			t: "tabs",
			label: "Definition support",
			tabs: [
				{
					id: "visual",
					title: "Node Design - Visual",
					blocks: [
						{
							t: "p",
							text:
								"**Build the node by handling it.** Open **Node Design** from the toolbar — the " +
								"palette icon, second from the right, drawn on [Toolbars](toolbars) — or " +
								"`/designer` on the daemon. It opens on the packs: the project's first, then the " +
								"built-in library, one card per category, to look at.",
						},
						{
							t: "ul",
							items: [
								"**New pack** makes an empty one. **Import from a project…** copies a pack from another Roswaal project.",
								"On a pack's card: **Duplicate**, **Copy to another project**, **Copy JSON**, **Show in file manager** and **Delete**, which says which graphs use the pack's nodes first.",
								"A Luau pack opens read-only. **Save as JSON pack** makes an editable copy.",
								"A card says what its nodes run on, and marks it when the project compiles for something else.",
							],
						},
						{ t: "h", level: 3, text: "Building a node" },
						{
							t: "ul",
							items: [
								"**New node** starts with an empty header and one execution pin each side.",
								"**Drag a type** from the palette onto the node: the left half adds an input, the right half an output. **Execution** adds that side's execution pin.",
								"**Click a pin**, or its label, for its name, type, default and tooltip. Its name is what the logic reads: a pin named Force is `$in.force`.",
								"**Type the title** on the header. **Details** holds the id, category, what it runs on, and the summary its documentation reads.",
								"**Pure is decided by the pins**: no execution pins makes a value, an execution input makes a step. A pure node with no inputs and one output can be drawn as a **pill**.",
								"**Save** (`Ctrl` + `S`) is off while anything is in the problems list, so a node that saves is a node the project loads.",
							],
						},
						{ t: "h", level: 3, text: "Logic built from nodes" },
						{
							t: "p",
							text:
								"The Logic panel's **Nodes** tab builds the logic on a canvas of its own, between " +
								"**Node Inputs** — the node's inputs — and **Node Outputs** — its outputs. " +
								"Right-click for nodes. It compiles to Luau as you build it, shown beside the graph, " +
								"and that Luau is what the node is saved as.",
						},
						{
							t: "ul",
							items: [
								"**It can use** the built-in nodes, the rest of its pack, and the nodes of the packs listed under **Requires**.",
								"**It cannot use** what belongs to a whole script: Script Start, functions, Return, script variables, Module Exports and Declare Type at Top.",
								"**An input read twice** is read once into a local, so a wired call does not run twice.",
								"**What it uses narrows where it runs.** A node built from Get Service runs on Roblox only, whatever it declares.",
							],
						},
						{
							t: "note",
							kind: "good",
							text:
								"**The pack stays data.** The logic is compiled when you save, not when a project " +
								"opens, and the loader only ever reads the Luau. A node built from another pack's " +
								"nodes has their Luau written into its own, so the other pack is needed to edit " +
								"the node again, not to use it.",
						},
					],
				},
				{
					id: "luau-logic",
					title: "Node Design - Luau",
					blocks: [
						{
							t: "p",
							text:
								"**Write the logic as a template**, in the Logic panel's **Luau** tab. The node's " +
								"pins decide what kind of template it is, and every placeholder is filled in where " +
								"the node is placed. Each example below is the template, then the Luau it becomes.",
						},
						{ t: "h", level: 3, text: "A step" },
						{
							t: "p",
							text:
								"An execution input and output. The template is statements, run where the node " +
								"sits. `$in.force` is whatever is wired into Force, or the value typed into it.",
						},
						{ t: "code", lang: "luau", text: "$in.character.HumanoidRootPart:ApplyImpulse($in.force)" },
						{ t: "code", lang: "luau", text: "character.HumanoidRootPart:ApplyImpulse(Vector3.new(0, 50, 0))" },
						{ t: "h", level: 3, text: "A step that sets an output" },
						{
							t: "p",
							text:
								"Give the node a data output and **assign** it. Roswaal declares the local before " +
								"the template runs, so the template sets it rather than declaring it.",
						},
						{ t: "code", lang: "luau", text: "$out.hit = workspace:Raycast($in.origin, $in.direction)" },
						{ t: "code", lang: "luau", text: "local hit\nhit = workspace:Raycast(origin, direction)" },
						{ t: "h", level: 3, text: "A call with a result" },
						{
							t: "p",
							text:
								"Click an output and tick **The call's result**. The template is then one " +
								"expression, and its value lands in that pin.",
						},
						{ t: "code", lang: "luau", text: '$in.character:FindFirstChildOfClass("Tool")' },
						{ t: "code", lang: "luau", text: 'local tool = character:FindFirstChildOfClass("Tool")' },
						{ t: "h", level: 3, text: "A pure node" },
						{
							t: "p",
							text:
								"No execution pins: a value. The template is **one expression per output**, " +
								"written into whatever reads it.",
						},
						{ t: "code", lang: "luau", text: "$in.humanoid.Health > 0" },
						{ t: "code", lang: "luau", text: "if humanoid.Health > 0 then" },
						{
							t: "note",
							kind: "warn",
							text:
								"**A placeholder is filled in every time it appears.** A template that reads " +
								"`$in.character` twice evaluates a wired call twice. Read it once into a local: " +
								"`local character = $in.character`. Logic built from nodes does this for you.",
						},
					],
				},
				{
					id: "luau",
					title: "Pack file",
					blocks: [
						{
							t: "p",
							text:
								"**A `.nodedef.luau` or `.nodedef.json` file, written by hand.** Luau is the " +
								"friendlier of the two: it is the language you already write, and it can carry " +
								"comments — which is the reason to choose it, and why Node Design opens one " +
								"read-only. `roswaal init` writes a commented example to start from.",
						},
						{
							t: "code",
							lang: "luau",
							text:
								"return {\n" +
								"\tnodes = {\n" +
								"\t\t{\n" +
								'\t\t\tid = "combat.knockback",\n' +
								'\t\t\ttitle = "Apply Knockback",\n' +
								'\t\t\tcategory = "Combat",\n' +
								"\t\t\tinputs = {\n" +
								'\t\t\t\t{ id = "in", kind = "exec" },\n' +
								'\t\t\t\t{ id = "character", name = "Character", kind = "data", type = "Instance" },\n' +
								'\t\t\t\t{ id = "force", name = "Force", kind = "data", type = "Vector3" },\n' +
								"\t\t\t},\n" +
								'\t\t\toutputs = { { id = "then", kind = "exec" } },\n' +
								"\t\t\tcompilesTo = {\n" +
								'\t\t\t\tkind = "statement",\n' +
								'\t\t\t\ttemplate = "$in.character.HumanoidRootPart:ApplyImpulse($in.force)",\n' +
								"\t\t\t},\n" +
								"\t\t},\n" +
								"\t},\n" +
								"}",
						},
						{
							t: "p",
							text:
								"A pin default may be written plainly — `default = 5`, `default = \"Part\"` — " +
								"rather than as a tagged `{ t = \"number\", v = 5 }`. The tagged form is still " +
								"there, and is the only way to write a `raw` default, which is emitted verbatim " +
								"rather than quoted.",
						},
						{
							t: "p",
							text:
								"Two more keys, both optional. **`requires`**, beside `nodes`, lists the packs " +
								"whose nodes this pack's logic is built from. **`logic`**, on a node saved from " +
								"Node Design, is the graph its logic was built from — the loader ignores it and " +
								"reads `compilesTo`. **`display = \"compact\"`** draws a pure node with no inputs " +
								"and one output as a pill.",
						},
						{
							t: "note",
							kind: "warn",
							text:
								"A function call anywhere in a pack is a **parse error with a line number**, not " +
								"something that runs. `.nodedef.json` is the same shape with no comments.",
						},
					],
				},
				{
					id: "typescript",
					title: "TypeScript",
					blocks: [
						{
							t: "p",
							text:
								"**A node in Roswaal's own library**, in `src/core/nodes/library.ts`. This is how " +
								"every built-in node is written, and it is the route for a node that belongs to " +
								"*Roswaal* rather than to one game — a missing Roblox call, an operator the " +
								"library should have had.",
						},
						{
							t: "code",
							lang: "ts",
							text:
								'pure("math.lerp", "Lerp", "Math",\n' +
								'\t"($in.a + ($in.b - $in.a) * $in.t)",\n' +
								'\t[num("a", "A"), num("b", "B"), num("t", "Alpha")], "number"),',
						},
						{
							t: "p",
							text:
								"`pure`, `call`, `stmt` and `variadic` at the top of that file are shorthands over " +
								"the same three templates a pack writes by hand. There is deliberately **nothing " +
								"a built-in can express that a pack cannot**, which is what keeps the template " +
								"language honest — so a node written here could equally be shipped as a pack.",
						},
						{
							t: "p",
							text:
								"**Which is the question to answer first.** A node written in TypeScript is part " +
								"of Roswaal and arrives when somebody upgrades it; a node in a pack is part of " +
								"your project and arrives with a `git pull`. The designer asks which pack a node " +
								"goes in for the same reason: where a node lives decides who gets it.",
						},
						{
							t: "note",
							kind: "info",
							text:
								"Adding one to the library means building Roswaal and running its tests — see " +
								"[Contributing](contributing). A node that opens a block is the one kind a pack " +
								"cannot write, and it needs emitter work as well.",
						},
					],
				},
			],
		},
		{ t: "h", level: 2, text: "What every route shares" },
		{
			t: "p",
			text:
				"Whichever way a node is defined, it is the same three fields underneath — and the " +
				"compile kind is the decision that matters most, because it settles whether the node " +
				"sits in the execution chain at all.",
		},
		{
			t: "table",
			head: ["Kind", "Shape", "Emits"],
			rows: [
				["`expr`", "Pure, no execution pins", "One expression per output pin, spliced into whatever reads it"],
				["`call`", "Impure, produces one value", "`local x = <template>`"],
				["`statement`", "Impure, any outputs", "The template, as statements"],
			],
		},
		{
			t: "note",
			kind: "warn",
			text:
				"`builtin` **is reserved** for the flow nodes that open blocks — branches, loops, " +
				"function bodies. A pack declaring one is rejected when it loads, and that refusal is " +
				"the boundary that lets a project depend on somebody else's pack.",
		},
		{ t: "h", level: 2, text: "Placeholders" },
		{
			t: "table",
			head: ["Placeholder", "Meaning"],
			rows: [
				["`$in.<pin>`", "The input's expression — the wired source, or the value typed into it — parenthesised where precedence needs it"],
				["`$out.<pin>`", "The local this output was bound to"],
				["`$in.<pin>!ident`", "An unconnected literal, sanitised to a Luau identifier. The pin cannot be wired"],
				["`$in.<pin>!raw`", "An unconnected literal, inserted verbatim"],
				["`$args(<sep>)`", "A variadic node's inputs, folded with that separator"],
				["`$opt(<sep>)`", "The optional trailing arguments, dropping the ones nobody set"],
			],
		},
		{
			t: "p",
			text:
				"A pin gets **splitting for free**: a pack's `Vector3` input breaks into components " +
				"exactly as a built-in's does, without the pack knowing splitting exists. Every node " +
				"in a project's packs also gets its own reference page in these docs, built from the " +
				"live registry — including the Luau it compiles to.",
		},
	],
};

/**
 * The command line, rendered from the same list `roswaal help` prints.
 *
 * There was no page for it at all: the commands were described in the README
 * and in the help output, and the two had already drifted — `--yes` existed in
 * one and not the other. One list, two renderings.
 */
const CLI_PAGE: DocPage = {
	slug: "command-line",
	title: "Command line",
	summary: "Every roswaal command, what it does, and which of them keep running.",
	narrow: true,
	blocks: [
		{
			t: "p",
			text:
				"`roswaal` is shaped after `rojo`'s command line on purpose: it sits beside Rojo in " +
				"the same workflow, and a tool that invents its own conventions makes you learn " +
				"twice. Run it in the project directory, or point it at one with `--root`.",
		},
		{
			t: "code",
			lang: "sh",
			text: "cd path/to/your/roblox/project\nroswaal init      # once per project\nroswaal serve     # editor on http://127.0.0.1:4471, docs at /docs",
		},
		{ t: "h", level: 2, text: "Commands" },
		{
			t: "table",
			head: ["Command", "What it does"],
			rows: CLI_COMMANDS.map((command) => [
				`\`roswaal ${command.name}\``,
				[command.blurb, command.detail].filter(Boolean).join(" "),
			]),
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Three of them block**: `serve`, `watch` and `restart` keep running until you stop " +
				"them with Ctrl+C. Everything else does its work and exits, which is what makes " +
				"`check` and `compile` usable from a script.",
		},
		{ t: "h", level: 2, text: "Options" },
		{
			t: "table",
			head: ["Option", "What it does"],
			rows: CLI_OPTIONS.map((option) => [`\`${option.flag}\``, option.blurb]),
		},
		{ t: "h", level: 2, text: "Two things worth knowing" },
		{
			t: "note",
			kind: "warn",
			text:
				"**Restart the daemon after rebuilding Roswaal.** `serve` loads the CLI bundle once, " +
				"so a rebuild does not reach a daemon that is already up: the browser picks up the " +
				"new editor on reload while the server keeps running the old code.",
		},
		{
			t: "p",
			text:
				"`stop` **and** `restart` **reach the daemon over HTTP** rather than through a PID file, " +
				"so there is no stale pid to reason about when one dies unexpectedly. `stop` reports " +
				"success only once the health probe has gone quiet — not when the request was sent.",
		},
	],
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * The demos page: four small Lune programmes, drawn and compiled.
 *
 * Generated from `DEMOS` rather than written out, for the reason the node
 * reference is: the Luau under each picture is what the emitter produces from
 * the graph above it, so the two cannot end up describing different programs
 * and a demo that stopped compiling fails the build.
 */
function luneDemosPage(registry: Registry): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Four programmes somebody writes first, each one a graph and the file it " +
				"compiles to. They are small on purpose: the point is the shape, and the " +
				"shortest version of a shape is the one you can take away.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Every require here was placed by hand.** Roswaal does not add one, and a " +
				"call whose module is not declared is an error rather than a guess — the rule " +
				"is on [Modules](modules), and [Lune's standard library](lune-library) is what " +
				"these are calling into.",
		},
	];

	for (const demo of DEMOS) {
		blocks.push({ t: "h", level: 2, text: demo.title });
		blocks.push({ t: "p", text: demo.what });
		const script = demo.script();
		blocks.push({
			t: "graph",
			script,
			// What it declares, beside it. A drawn graph shows `fs.readFile`
			// and not where `fs` came from, and where it came from is the whole
			// rule the Lune library rests on.
			panel: declarationsPanel(script),
			caption: "The graph this was compiled from, and what it declares.",
		});
		blocks.push({ t: "code", lang: "luau", text: demoLuau(demo, registry) });
		if (demo.note) blocks.push({ t: "note", kind: "info", text: demo.note });
		if (demo.warns) blocks.push({ t: "note", kind: "warn", text: demo.warns });
	}

	blocks.push({ t: "h", level: 2, text: "Running one" });
	blocks.push({
		t: "p",
		text:
			"Compile the graph, then run the file — `lune run count-characters`. Roswaal " +
			"writes the `.luau` and stops there; what runs it is Lune. Where the file lands, " +
			"and what checks that the layout holds together, is on " +
			"[Compiling and nodemaps for Lune](compiling-for-lune).",
	});
	blocks.push({
		t: "note",
		kind: "warn",
		text:
			"**These are starting points, not finished programmes.** None of them checks " +
			"whether the file was there, whether the request came back, or whether the JSON " +
			"had the field — which a real version would, and which would double the size of " +
			"every picture on this page.",
	});

	return {
		slug: "lune-demos",
		// Not `narrow`. A prose measure is right for a page of sentences and
		// wrong for one that is mostly pictures of seven-column graphs: capped
		// at 78ch every one of them was drawn at half size to fit.
		title: "Lune demos",
		summary:
			"Four small programmes: read a file, fetch JSON, walk a directory, take an argument.",
		// No `runtime` tag: that is a node page's, and this is a guide. The
		// badge answers "what does this node need", and nobody asked that of a
		// page whose title already says Lune.
		blocks,
	};
}

/**
 * The Roblox demo page: the project that ships, read rather than described.
 *
 * Its graphs and its node map come from `examples/demo` itself, which is the
 * project the introduction panel offers to take a copy of — so what somebody
 * reads here and what they get when they take it are the same thing.
 *
 * Two graphs and a map rather than four programmes, because that is what the
 * demo is. The Lune page had to invent its examples; this one only has to show
 * the one that was already there, and showing a real project is worth more
 * than four tidier ones would be.
 */
function robloxDemosPage(registry: Registry): DocPage {
	const greeter = ROBLOX_DEMO_GRAPHS.greeter;
	const main = ROBLOX_DEMO_GRAPHS.main;

	const luau = (script: NodeScript): string => stripHeader(compile(script, registry).code);

	const blocks: Block[] = [
		{
			t: "p",
			text:
				"One project, two graphs and a node map. It is `examples/demo` — the project " +
				"the Roswaal panel offers to take a copy of, and the one `roswaal init` leaves " +
				"you standing in — so what is drawn here is what you would open.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Take a copy rather than opening it where it sits.** The mark in the corner " +
				"offers it under *Demos*, and copies it somewhere of your own first: the demo " +
				"beside Roswaal is the one everybody else who installed it will open.",
		},

		{ t: "h", level: 2, text: "A module, and a function in it" },
		{
			t: "p",
			text:
				"`Greeter` is a ModuleScript. It declares a function, returns a string from it, " +
				"and hands the function out through **Module Exports** — which is the node that " +
				"decides what `require` gives back.",
		},
		{
			t: "graph",
			script: greeter,
			panel: declarationsPanel(greeter),
			caption: "The graph this was compiled from, and what it declares.",
		},
		{ t: "code", lang: "luau", text: luau(greeter) },
		{
			t: "note",
			kind: "info",
			text:
				"A graph with a **Function** in it draws that function on its own canvas — the " +
				"picture above is the outer graph. [Functions](functions) is the page about " +
				"what that means and how a parameter reaches the body.",
		},

		{ t: "h", level: 2, text: "A script that runs when the place does" },
		{
			t: "p",
			text:
				"`Main` is a Script, so it runs on the server. It gets a service, requires the " +
				"module beside it, calls the function out of it, and connects to an event — " +
				"which between them is most of what any Roblox script does.",
		},
		{
			t: "graph",
			script: main,
			panel: declarationsPanel(main),
			caption: "The graph this was compiled from, and what it declares.",
		},
		{ t: "code", lang: "luau", text: luau(main) },
		{
			t: "note",
			kind: "info",
			text:
				"**Nothing in that file arrived on its own.** The `require` is a node somebody " +
				"placed, the service is a **Get Service**, and the event is a **Connect**. The " +
				"rule is on [Modules](modules), and [Services and their methods](services) is " +
				"the page about the first two.",
		},

		{ t: "h", level: 2, text: "Where it lands in the DataModel" },
		{
			t: "p",
			text:
				"The map says where the generated files go, and compiles to the " +
				"`default.project.json` that Rojo reads. This is the demo's own, in the editor " +
				"that edits it:",
		},
		{
			t: "nodemap",
			map: ROBLOX_DEMO_MAP,
			caption:
				"The demo's map. **Select a row** and the Inspector fills with that instance's " +
				"fields, while the project file scrolls to the lines the row writes.",
		},
		{
			t: "p",
			text:
				"[Compiling and nodemaps for Roblox](building-and-rojo) is the page about that " +
				"panel — what each field does, and what happens when you compile.",
		},

		{ t: "h", level: 2, text: "Running it" },
		{
			t: "p",
			text:
				"Compile the project, then point Rojo at it and connect from Studio. Roswaal " +
				"writes the `.luau` files and the project file; everything after that is Rojo's, " +
				"and Roswaal never talks to Studio itself.",
		},
		{
			t: "code",
			lang: "sh",
			text: "roswaal compile   # writes src/ and default.project.json\nrojo serve        # then connect from Studio",
		},
		{
			t: "note",
			kind: "info",
			text:
				"The demo also ships two **node packs** of its own, under `.roswaal/nodes`. They " +
				"are not used by either graph above — they are there to be opened in Node " +
				"Design, which is what [Creating custom nodes](creating-custom-nodes) is about.",
		},
	];

	return {
		slug: "roblox-demos",
		title: "The Roblox demo",
		summary: "The project that ships: a module, a server script, and the map that places them.",
		blocks,
	};
}

export function buildSite(registry: Registry, builtinIds: ReadonlySet<string>): DocSite {
	const nodes = documentRegistry(registry, builtinIds);

	// One section per palette category, in the order the palette lists them, so
	// somebody hunting for a node looks in the place they already look.
	const order = categories(registry);
	const byCategory = new Map<string, DocPage[]>();
	const bySubcategory = new Map<string, DocPage[]>();
	for (const doc of nodes) {
		const page = nodePage(doc);
		const list = byCategory.get(doc.category) ?? [];
		list.push(page);
		byCategory.set(doc.category, list);

		if (doc.category === ENGINE_TYPES && doc.subcategory) {
			const sub = bySubcategory.get(doc.subcategory) ?? [];
			sub.push(page);
			bySubcategory.set(doc.subcategory, sub);
		}
	}

	// Built-in and pack nodes are grouped apart rather than interleaved by
	// category, so a pack's node is recognisable before you click it.
	const reference = (group: string, custom: boolean): DocSection[] =>
		order
			// Engine types get their own group, one section per datatype, built
			// below. Leaving them here as well would list every one of them twice.
			.filter((c) => custom || (c !== ENGINE_TYPES && c !== ZUP_CONVERSIONS))
			.map((c) => ({ c, pages: (byCategory.get(c) ?? []).filter((p) => !!p.custom === custom) }))
			.filter((x) => x.pages.length > 0)
			.map((x) => ({
				// Named for the reader, slugged by the key: a label may be changed
				// back and a published URL may not.
				title: categoryLabel(x.c),
				slug: `${custom ? "pack" : "nodes"}/${slugify(x.c)}`,
				pages: x.pages,
				group,
			}));

	/**
	 * One section per datatype.
	 *
	 * Built from the registry rather than a list, so a pack that adds nodes to
	 * an existing datatype lands in that datatype's section — and a pack that
	 * introduces one of its own gets a section without anything here changing.
	 */
	const engineTypeSections = (): DocSection[] =>
		subcategories(registry, ENGINE_TYPES)
			.map((sub) => ({ sub, pages: bySubcategory.get(sub) ?? [] }))
			.filter((x) => x.pages.length > 0)
			.map((x) => ({
				title: x.sub,
				slug: `nodes/engine-types/${slugify(x.sub)}`,
				pages: x.pages,
				group: GROUPS.engineTypes,
			}));

	/** The Z-up conversions, under their own heading rather than among the rest. */
	const conversionSections = (): DocSection[] => {
		const pages = (byCategory.get(ZUP_CONVERSIONS) ?? []).filter((p) => !p.custom);
		if (pages.length === 0) return [];
		return [{
			title: ZUP_CONVERSIONS,
			slug: `nodes/${slugify(ZUP_CONVERSIONS)}`,
			pages,
			group: GROUPS.conversions,
		}];
	};

	const start = [GETTING_STARTED, INTERFACE, CONTROLS, TOOLBARS_PAGE, blueprintPage()];
	/**
	 * The guides, in four shelves rather than one list of sixteen.
	 *
	 * One section had grown past the point where a reader scans it: sixteen
	 * titles is a list you read line by line looking for a word, and three of
	 * them began "Compiling and nodemaps". Splitting by the question somebody
	 * arrives with -- how do graphs work, how does this reach Roblox, how does
	 * it reach Lune, what is the tool itself -- puts the Lune pages together
	 * for somebody who only has Lune, and keeps the Roblox ones out of their
	 * way without hiding them.
	 *
	 * Ordered within each shelf the way they were within the one list: casting
	 * beside the types page it was split out of, functions after the locals
	 * whose Get Parameter they lean on.
	 */
	const writingGraphs = [
		TWO_KINDS_OF_WIRE(registry), TYPES_GUIDE, castingPage(registry),
		VARIABLES, functionsPage(registry), MODULES_PAGE, ESCAPE_HATCHES(registry),
	];
	const forRoblox = [servicesPage(registry), BUILDING, robloxDemosPage(registry)];
	const forLune = [
		luneLibraryPage(registry), ALIASES_PAGE, BUILDING_LUNE, luneDemosPage(registry),
	];
	const theTool = [settingsPage(), CUSTOM_NODES, CLI_PAGE];
	const guides = [...writingGraphs, ...forRoblox, ...forLune, ...theTool];
	const attributions = attributionsPage();
	// Every page's title by slug, so the release notes can name the articles
	// they list without holding a second copy of each title.
	const titles = new Map<string, string>([
		...[...start, ...guides, attributions, CONTRIBUTING].map((p) => [p.slug, p.title] as const),
		...nodes.map((doc) => [`node/${doc.id}`, doc.title] as const),
	]);

	return {
		sections: withReviews([
			{ title: "Getting started", slug: "start", group: GROUPS.learn, pages: start },
			{ title: "Writing graphs", slug: "guides", group: GROUPS.learn, pages: writingGraphs },
			{ title: "For Roblox", slug: "guides-roblox", group: GROUPS.learn, pages: forRoblox },
			{ title: "For Lune", slug: "guides-lune", group: GROUPS.learn, pages: forLune },
			{ title: "The tool", slug: "guides-tool", group: GROUPS.learn, pages: theTool },
			{
				title: "Release notes",
				slug: "releases",
				group: GROUPS.learn,
				pages: [releasesPage(titles)],
			},
			{ title: "Attributions", slug: "attributions", group: GROUPS.learn, pages: [attributions] },
			{ title: "Contributing", slug: "contributing", group: GROUPS.learn, pages: [CONTRIBUTING] },
			...reference(GROUPS.builtin, false),
			...engineTypeSections(),
			...conversionSections(),
			...reference(GROUPS.project, true),
		]),
	};
}

/**
 * Every page but a pack's and the release notes, carrying its review. The
 * release notes are a record of what changed, written as each release is made,
 * not an article a person reads through and vouches for.
 *
 * Copies rather than writes, because the hand-written pages are module
 * constants shared by every build of the site.
 */
function withReviews(sections: DocSection[]): DocSection[] {
	return sections.map((section) => ({
		...section,
		pages: section.pages.map((page) =>
			page.custom || page.slug === "release-notes"
				? page
				: { ...page, review: reviewOf(page.slug) },
		),
	}));
}

function slugify(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function allPages(site: DocSite): DocPage[] {
	return site.sections.flatMap((s) => s.pages);
}

export function findPage(site: DocSite, slug: string): DocPage | undefined {
	return allPages(site).find((p) => p.slug === slug);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchEntry {
	slug: string;
	title: string;
	summary: string;
	section: string;
	/** Everything on the page, lowercased, for substring matching. */
	body: string;
	nodeId?: string;
}

export function buildSearchIndex(site: DocSite): SearchEntry[] {
	const out: SearchEntry[] = [];
	for (const section of site.sections) {
		for (const page of section.pages) {
			out.push({
				slug: page.slug,
				title: page.title,
				summary: page.summary,
				section: section.title,
				body: page.blocks.map(blockText).join(" ").toLowerCase(),
				nodeId: page.nodeId,
			});
		}
	}
	return out;
}

/**
 * Ranked matches for a query.
 *
 * The same shape of scoring as the node palette, and for the same reason: a
 * title you half-remember should beat a page that merely mentions the word.
 * Searching the docs for "branch" must find the Branch node, not the six guide
 * paragraphs that use the word in passing.
 */
export function searchDocs(index: SearchEntry[], query: string, limit = 20): SearchEntry[] {
	return rankDocs(index, query, limit).map((hit) => hit.entry);
}

/** A hit and what it scored, for a caller that wants to say *why* it matched. */
export interface DocsHit {
	entry: SearchEntry;
	score: number;
	/**
	 * The query is in this page's name — its title, or the id of the node it
	 * documents — rather than somewhere in its prose.
	 *
	 * The palette splits on it: a page called what you typed is a different kind
	 * of answer from a page that mentions it once, and a list that runs the two
	 * together makes you read all of it to find that out.
	 */
	named: boolean;
}

/** The lowest score a match on the name can produce. See `scoreEntry`. */
const NAME_MATCH = 40;

export function rankDocs(index: SearchEntry[], query: string, limit = 20): DocsHit[] {
	const q = query.trim().toLowerCase();
	if (q === "") return [];

	return index
		.map((entry) => ({ entry, score: scoreEntry(entry, q), named: false }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
		.slice(0, limit)
		.map((hit) => ({ ...hit, named: hit.score >= NAME_MATCH }));
}

function scoreEntry(entry: SearchEntry, q: string): number {
	const title = entry.title.toLowerCase();
	if (title === q) return 120;
	if (title.startsWith(q)) return 100;
	if (title.includes(q)) return 60;
	if (entry.nodeId?.toLowerCase().includes(q)) return 40;
	if (entry.summary.toLowerCase().includes(q)) return 25;
	if (entry.body.includes(q)) return 10;
	return 0;
}
