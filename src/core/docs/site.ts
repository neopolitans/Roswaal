/**
 * The documentation site: one page model, three renderings.
 *
 * The in-app Docs panel, the static site and the daemon's `/docs` all walk the
 * same tree, so they cannot disagree about what the documentation says.
 *
 * This file holds the model — the block union, the page and the site — and
 * `buildSite`, which assembles it. The rest lives beside it:
 *
 * - `pages/` — one module per hand-written page, and the node reference's.
 * - `markup.ts` — inline markup, and every string a block holds.
 * - `search.ts` — the search ranking; `searchIndex.ts` — the index it ranks.
 * - `releaseTags.ts` — the tags under a release's version.
 *
 * What other modules import from here is re-exported below, so they need not
 * know which of those it came from.
 *
 * ## Why blocks rather than Markdown
 *
 * Markdown would need a parser, and `src/core` has no runtime dependencies and
 * cannot read files — the in-app panel has to work offline, in the browser,
 * with the project's own node packs folded in. A small typed block model costs
 * one afternoon of authoring ergonomics and buys: no dependency, no parse step,
 * identical output in every renderer, and a compiler error rather than a
 * silently mis-rendered page when a block is malformed.
 */

import { categoryLabel } from "../categories.js";
import type { NodeMap } from "../nodemap.js";
import { categories, type Registry, subcategories, ZUP_CONVERSIONS } from "../nodes/index.js";
import type { Runtime } from "../nodes/runtimes.js";
import { ENGINE_TYPES, type NodeScript } from "../schema.js";
import type { LayoutSpec } from "./layouts.js";
import { documentRegistry, type NodeDoc } from "./nodeReference.js";
import { aliasesPage } from "./pages/aliases.js";
import { attributionsPage } from "./pages/attributions.js";
import { buildingAndRojoPage } from "./pages/buildingAndRojo.js";
import { castingPage } from "./pages/casting.js";
import { comingFromBlueprintsPage } from "./pages/comingFromBlueprints.js";
import { commandLinePage } from "./pages/commandLine.js";
import { compilingForLunePage } from "./pages/compilingForLune.js";
import { contributingPage } from "./pages/contributing.js";
import { controlsPage } from "./pages/controls.js";
import { creatingCustomNodesPage } from "./pages/creatingCustomNodes.js";
import { functionsPage } from "./pages/functions.js";
import { gettingStartedPage } from "./pages/gettingStarted.js";
import { handWrittenLuauPage } from "./pages/handWrittenLuau.js";
import { luneDemosPage } from "./pages/luneDemos.js";
import { luneLibraryPage } from "./pages/luneLibrary.js";
import { membersAndFieldsPage } from "./pages/membersAndFields.js";
import { modulesPage } from "./pages/modules.js";
import { nodePage } from "./pages/node.js";
import { placesAndRojoPage } from "./pages/placesAndRojo.js";
import { projectPanelPage } from "./pages/projectPanel.js";
import { readingLuauPage } from "./pages/readingLuau.js";
import { releaseNotesPages } from "./pages/releaseNotes.js";
import { robloxDemosPage } from "./pages/robloxDemos.js";
import { servicesPage } from "./pages/services.js";
import { settingsPage } from "./pages/settings.js";
import { theInterfacePage } from "./pages/theInterface.js";
import { toolbarsPage } from "./pages/toolbars.js";
import { typesPage } from "./pages/types.js";
import { variablesAndLocalsPage } from "./pages/variablesAndLocals.js";
import { wallyPackagesPage } from "./pages/wallyPackages.js";
import { wiresAndPinsPage } from "./pages/wiresAndPins.js";
import type { NodePreview } from "./preview.js";
import { type Review, reviewOf } from "./reviews.js";
import { technicalSections } from "./technical/index.js";
import type { SpecStatus } from "./technical/spec.js";
import type { ToolbarSpec } from "./toolbars.js";

export {
	type BlockString,
	blockStrings,
	blockText,
	type Inline,
	isPageLink,
	parseInline,
	type StringSlot,
	stripMarkup,
} from "./markup.js";
export { ROJO_SAMPLE } from "./pages/placesAndRojo.js";
export { releaseTags, SURFACES, TAG_LABELS } from "./releaseTags.js";
export { type DocsHit, rankDocs, type SearchEntry, searchDocs } from "./search.js";
export { buildSearchIndex } from "./searchIndex.js";

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** One line of a minor version's notes, and the release it shipped in. */
export interface Shipped {
	version: string;
	/** Inline markup. */
	text: string;
}

/**
 * A minor version's releases as one page: 0.144.0 to 0.144.4 together.
 *
 * Most releases are a few lines, so a page each would be a page of almost
 * nothing; a minor version is what somebody upgrading actually moves across.
 * Every line still says exactly which release it shipped in -- the releases'
 * own summaries, and each entry under Added, Changed and Fixed -- so nothing a
 * single release said is lost by being read beside its neighbours.
 */
export interface MinorView {
	/** `0.144`. */
	minor: string;
	/** Its page: `release-notes/0.144`. */
	slug: string;
	/** What the minor version brought: its `.0`'s headline, or its oldest's. */
	headline: string;
	/** Holds the newest release there is. */
	latest?: boolean;
	/** Any of its releases fixed a security weakness. */
	security?: boolean;
	/** Every tag its releases carry, in the order one release's are. */
	tags: ReleaseTag[];
	/** Its oldest and newest release's dates. */
	from: string;
	to: string;
	/** Its releases, newest first: each one's version, date, tags and summary. */
	releases: {
		version: string;
		date: string;
		headline: string;
		tags: ReleaseTag[];
		latest?: boolean;
	}[];
	/** What to know before upgrading, from any of its releases. */
	watch: Shipped[];
	/** Added, Changed, Fixed: each release's entries, newest release first. */
	sections: { kind: "added" | "changed" | "fixed"; heading: string; entries: Shipped[] }[];
	/** Reviewed and Verified Articles, as page links in inline markup. */
	articles: { heading: string; links: Shipped[] }[];
}

/** A minor version as one line: the release notes front page lists the recent few. */
export interface MinorRow {
	minor: string;
	slug: string;
	headline: string;
	/** Its newest release, which the line leads with. */
	newest: string;
	date: string;
	security?: boolean;
}

/** Every minor version for the versions dropdown, in groups of ten. */
export interface VersionChoice {
	/** `0.140–0.144`, or the notes from before Roswaal was public. */
	label: string;
	items: { minor: string; slug: string; newest: string; security?: boolean }[];
}

/** A release's anchor: `v0.125.0`. On its minor version's page it marks that release's lines. */
export function releaseAnchor(version: string): string {
	return `v${version}`;
}

/** The page a release's notes are on: `release-notes/0.144` for 0.144.3. */
export function releasePageSlug(version: string): string {
	return `release-notes/${version.split(".").slice(0, 2).join(".")}`;
}

/**
 * What a release carries, and where it lands.
 *
 * Two axes in one row. `security` and `breaking` are judgements a release
 * states; `feature`, `change` and `fix` follow from which entries it has. The
 * last three are the **surface** it touches, and none of them can be derived:
 * "this changed the documentation" is not a fact about the shape of a release
 * note. A release states them, and an absent one means *not stated* rather
 * than *not affected*: the oldest releases state none.
 */
export type ReleaseTag =
	| "security"
	| "feature"
	| "change"
	| "fix"
	| "breaking"
	| "docs"
	| "editor"
	| "designer";

/**
 * What a note is, which its heading says in a word: Info, Tip, Warning, or
 * Danger for what loses work or breaks a build. See `notes.ts`.
 */
export type NoteKind = "info" | "good" | "warn" | "danger";

export type Block =
	/** `aside` sits at the right of the heading: a date, a version, a status. */
	/** `badge` sits right beside the heading's text: "Latest", on the current release. */
	| { t: "h"; level: 2 | 3 | 4; text: string; aside?: string; badge?: string }
	| { t: "p"; text: string }
	| { t: "ul"; items: string[] }
	| { t: "ol"; items: string[] }
	| { t: "code"; lang: "luau" | "sh" | "powershell" | "json" | "ts"; text: string }
	/**
	 * `head` is optional. A comparison table wants column names; a list of
	 * release entries wants the *shape* of a table — ruled rows, one thing per
	 * row — and a header saying "Note" over a single column of notes is a row of
	 * furniture that tells the reader nothing.
	 */
	| {
			t: "table";
			head?: string[];
			rows: string[][];
			/** A column of type names, each drawn as the type field draws one. */
			types?: number;
	  }
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
	| { t: "note"; kind: NoteKind; text: string; items?: string[] }
	/** Pin tables on a node page, which want their own rendering. */
	| { t: "pins"; title: string; pins: NodeDoc["inputs"] }
	/**
	 * One or more nodes drawn as they appear on the canvas.
	 *
	 * A list rather than a single node because the useful case is nearly always
	 * a comparison — Code Block beside Luau Expression, a getter beside a
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
			/** Drawn as laid out in the editor, not levelled: see `graphSvg`. */
			asAuthored?: boolean;
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
	 * Several graphs in one frame, a tab each, as the editor shows two open
	 * documents.
	 *
	 * For an example that is not one graph. A module and the graph that requires
	 * it are two files and one idea, and showing them one above the other asks
	 * the reader to hold the first while scrolling the second — where the editor
	 * itself would put them behind tabs and let you flick between them. The
	 * titles are the file names, because that is what the tabs say in the editor.
	 */
	| {
			t: "graphs";
			label?: string;
			/** Drawn as laid out in the editor, not levelled: see `graphSvg`. */
			asAuthored?: boolean;
			/** The Variables panel, beside whichever graph is showing: see `graph`. */
			panel?: ToolbarSpec;
			graphs: {
				/** Stable, and part of the radio's name in the static build. */
				id: string;
				title: string;
				script: NodeScript;
				caption?: string;
			}[];
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
			/** A line under the summary, shown while it is closed too: a minor version's headline. */
			sub?: string;
			/** An anchor, for a link to open and scroll to. */
			id?: string;
			open?: boolean;
			blocks: Block[];
	  }
	| { t: "tabs"; label?: string; tabs: DocTab[] }
	/**
	 * Every licence Roswaal keeps by hand, each opening to its exact text, and
	 * where the build's own `THIRD-PARTY-NOTICES.txt` is. Read from
	 * `src/core/licenceData.ts`, so the page cannot drift from the files.
	 */
	| { t: "licences" }
	/**
	 * The attributions browser: every entry, in a grid of holders against usage
	 * types and in a searchable list by holder. Drawn from
	 * `src/core/docs/attributions.ts` by `attributionsHtml`.
	 */
	| { t: "attributions" }
	/**
	 * A minor version's releases as one card: its releases' summaries, then
	 * Added, Changed and Fixed, every line badged with the release it shipped
	 * in. `link` makes the version a link to its own page, on the front page.
	 */
	| { t: "releaseMinor"; minor: MinorView; link?: boolean }
	/** Minor versions as one line each, for the front page's recent few. */
	| { t: "releaseRows"; rows: MinorRow[] }
	/**
	 * The versions dropdown: every minor version, by tens, the notes from before
	 * Roswaal was public last. `current` is the page it is on, if any; `latest`
	 * the newest release there is, which the "new since your last visit" dots
	 * are measured against.
	 */
	| { t: "releaseVersions"; current?: string; latest: string; groups: VersionChoice[] }
	/** The minor versions either side of this one. */
	| {
			t: "releasePager";
			newer?: { slug: string; label: string };
			older?: { slug: string; label: string };
	  }
	/**
	 * A whole window as a labelled diagram: where each part of the screen is,
	 * numbered, with a legend. The page before Toolbars, drawn from a spec in
	 * `layouts.ts` into the same figure and legend a toolbar uses.
	 */
	| { t: "layout"; layout: LayoutSpec; caption?: string; hint?: boolean }
	/**
	 * Steps done on screen, shown one at a time: a drawing of the screen at
	 * each step with the control to press ringed, over the list of steps.
	 * Numbered from 1, as the counter over them is. See `src/app/docsWalk.ts`.
	 */
	| { t: "walkthrough"; steps: WalkStep[] }
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
	/**
	 * Built, linked and searchable, and left out of the contents: the release
	 * notes of every minor version but the recent few, which the versions
	 * dropdown reaches instead.
	 */
	unlisted?: boolean;
	/**
	 * The newest release a release notes page holds, so the contents can mark
	 * a page with something this browser has not seen.
	 */
	releaseNewest?: string;
	/** One line, used in the nav and as the search result's subtitle. */
	summary: string;
	/**
	 * What a link's preview says, where the summary is too thin to stand on
	 * its own there: a node with no summary of its own is "Debug node.", which
	 * is enough beside its picture and not in a chat. See `siteMeta.ts`.
	 */
	blurb?: string;
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
	/**
	 * A page of the technical specification: whether it binds an
	 * implementation (normative) or explains (informative), and which draft of
	 * the specification it belongs to. See `technical/spec.ts`.
	 */
	spec?: SpecStatus;
}

/** One step of a walkthrough. */
export interface WalkStep {
	/** What to do. Inline markup. */
	text: string;
	/** The screen at this step: bars drawn top to bottom, as they sit. */
	picture?: ToolbarSpec[];
	/** Or the whole window at this step, drawn as `layouts.ts` draws one, unnumbered. */
	window?: LayoutSpec;
	/**
	 * Or the node map panel, as the map stands at this step, with `select`'s
	 * row in the Inspector. `point` then names a part of the panel by its
	 * `mapParts` key -- `tree`, `actions`, `name`, `path`, `preview`.
	 */
	map?: { map: NodeMap; select?: string };
	/** The control to press, by its name in one of the bars. */
	point?: string;
}

/** A kind of screen a tab is for. Desktop is split by which build it is. */
export type TabDevice = "localhost" | "webapp" | "tablet" | "phone";

/**
 * One switch, several answers to the same question.
 *
 * For a page whose subject has more than one route through it — three ways to
 * define a custom node — where the reader wants *their* route rather than all
 * of them in a row. Everything stays in the page: the static site renders every
 * panel and switches with a radio, so the text is there with no script, and the
 * search index walks into every tab rather than only the open one.
 */
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
	/**
	 * The technical specification: Roswaal's design written as a standard
	 * another implementation can follow. A heading of its own, after the guides
	 * and before the node reference, because it is read by a different person
	 * for a different reason: someone building an editor, not using one.
	 */
	technical: "Technical specification",
} as const;

export interface DocSite {
	sections: DocSection[];
}

/** What a page is built from: the registry its pictures are drawn with. */
export interface PageContext {
	registry: Registry;
}

/**
 * A hand-written page. A page that needs nothing from the context takes no
 * argument, and is still one of these.
 */
export type PageBuilder = (ctx: PageContext) => DocPage;

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildSite(registry: Registry, builtinIds: ReadonlySet<string>): DocSite {
	const nodes = documentRegistry(registry, builtinIds);
	const ctx: PageContext = { registry };
	const shelf = (pages: PageBuilder[]): DocPage[] => pages.map((page) => page(ctx));

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
		return [
			{
				title: ZUP_CONVERSIONS,
				slug: `nodes/${slugify(ZUP_CONVERSIONS)}`,
				pages,
				group: GROUPS.conversions,
			},
		];
	};

	const start = shelf([
		gettingStartedPage,
		theInterfacePage,
		controlsPage,
		toolbarsPage,
		projectPanelPage,
		comingFromBlueprintsPage,
	]);
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
	const writingGraphs = shelf([
		wiresAndPinsPage,
		typesPage,
		castingPage,
		variablesAndLocalsPage,
		membersAndFieldsPage,
		functionsPage,
		modulesPage,
		handWrittenLuauPage,
	]);
	const forRoblox = shelf([
		servicesPage,
		buildingAndRojoPage,
		placesAndRojoPage,
		wallyPackagesPage,
		readingLuauPage,
		robloxDemosPage,
	]);
	const forLune = shelf([luneLibraryPage, aliasesPage, compilingForLunePage, luneDemosPage]);
	const theTool = shelf([settingsPage, creatingCustomNodesPage, commandLinePage]);
	const guides = [...writingGraphs, ...forRoblox, ...forLune, ...theTool];
	const attributions = attributionsPage();
	const contributing = contributingPage();
	// Every page's title by slug, so the release notes can name the articles
	// they list without holding a second copy of each title.
	const titles = new Map<string, string>([
		...[...start, ...guides, attributions, contributing].map((p) => [p.slug, p.title] as const),
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
				pages: releaseNotesPages(titles),
			},
			{ title: "Attributions", slug: "attributions", group: GROUPS.learn, pages: [attributions] },
			{ title: "Contributing", slug: "contributing", group: GROUPS.learn, pages: [contributing] },
			...technicalSections(GROUPS.technical, ctx),
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
 * Copies rather than writes: a page is never changed after its builder has
 * returned it.
 */
function withReviews(sections: DocSection[]): DocSection[] {
	return sections.map((section) => ({
		...section,
		pages: section.pages.map((page) =>
			page.custom || page.slug === "release-notes" || page.slug.startsWith("release-notes/")
				? page
				: { ...page, review: reviewOf(page.slug) },
		),
	}));
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * The pages a section's entry in the contents lists: all but the unlisted,
 * and an unlisted one too while it is the page being read, so the reader can
 * see where they are.
 */
export function listedPages(section: DocSection, current?: string): DocPage[] {
	return section.pages.filter((p) => !p.unlisted || p.slug === current);
}

export function allPages(site: DocSite): DocPage[] {
	return site.sections.flatMap((s) => s.pages);
}

export function findPage(site: DocSite, slug: string): DocPage | undefined {
	return allPages(site).find((p) => p.slug === slug);
}

/** One end of the walk through the site: where it goes, and what is there. */
export interface Neighbour {
	slug: string;
	title: string;
}

/**
 * The pages either side of this one, in the order the contents list them.
 *
 * So the foot of a page can offer the next one by name. Site-wide rather than
 * within a section, because the contents read as one list top to bottom and
 * "next" at the end of a section is the next section's first page — which is
 * what somebody reading straight through wants, and what the sidebar shows
 * them anyway.
 */
export function neighbours(
	site: DocSite,
	slug: string,
): { previous?: Neighbour; next?: Neighbour } {
	// A minor version's release notes have their own newer and older; the
	// walk through the docs steps over them, and over anything unlisted.
	const pages = allPages(site).filter(
		(page) => !page.unlisted && !page.slug.startsWith("release-notes/"),
	);
	const at = pages.findIndex((page) => page.slug === slug);
	if (at < 0) return {};
	const name = (page: DocPage | undefined): Neighbour | undefined =>
		page ? { slug: page.slug, title: page.title } : undefined;
	return { previous: name(pages[at - 1]), next: name(pages[at + 1]) };
}
