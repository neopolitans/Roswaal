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
import { categories, subcategories } from "../nodes/index.js";
import { BLUEPRINT_MAP } from "./blueprints.js";
import { documentRegistry, OMISSION_REASONS, type NodeDoc } from "./nodeReference.js";
import { previewOf, type NodePreview } from "./preview.js";
import { defaultConfig, ENGINE_TYPES, type NodeScript } from "../schema.js";
import { CODE_ROLES, ROLES } from "../theme.js";
import { BUILTIN_THEMES } from "../themeData.js";
import { DEPENDENCIES, INSPIRATIONS, NAME_NOTICE, type Attribution } from "./attributions.js";
import { GUIDE_SCENES } from "./examples.js";
import { RELEASES, type Release } from "./releases.js";
import { reviewOf, type Review } from "./reviews.js";

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * The kinds of change a release can carry.
 *
 * `breaking` is the one that cannot be derived from the entries — whether a
 * change breaks somebody is a judgement about their code, not a property of
 * ours — so it is the one a release states for itself.
 */
export type ReleaseTag = "feature" | "change" | "fix" | "breaking";

export const TAG_LABELS: Record<ReleaseTag, string> = {
	feature: "Feature",
	change: "Change",
	fix: "Bugfix",
	breaking: "Breaking change",
};

export type Block =
	/** `aside` sits at the right of the heading: a date, a version, a status. */
	| { t: "h"; level: 2 | 3; text: string; aside?: string }
	| { t: "p"; text: string }
	| { t: "ul"; items: string[] }
	| { t: "ol"; items: string[] }
	| { t: "code"; lang: "luau" | "sh" | "json"; text: string }
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
	| { t: "graph"; script: NodeScript; caption?: string };

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

/** The words in a block, with markup removed. Feeds the search index. */
export function blockText(block: Block): string {
	switch (block.t) {
		case "h":
			return [block.text, block.aside ?? ""].join(" ").trim();
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
		.map(previewOf);
	return nodes.length > 0 ? [{ t: "preview", nodes, caption }] : [];
}

function nodePage(doc: NodeDoc): DocPage {
	const blocks: Block[] = [];

	const traits: string[] = [];
	if (doc.pure) traits.push("pure — no execution pins, wire it anywhere");
	if (doc.latent) traits.push("latent — it yields, and is never inlined");
	if (doc.role === "entry") traits.push("an entry point: nothing wires into it");
	if (doc.role === "terminal") traits.push("terminal — it ends the flow it is in");
	if (doc.targets) traits.push(`only for ${doc.targets.join(" and ")}`);
	if (doc.variadic) {
		traits.push(`takes ${doc.variadic.min} to ${doc.variadic.max} inputs, set per node`);
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
		summary: doc.summary ?? `${doc.category} node.`,
		blocks,
		nodeId: doc.id,
		custom: doc.custom,
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
				"Unreal Engine, Unreal and Blueprint are trademarks of Epic Games, Inc. They are " +
				"used on this page to name Epic's product while explaining Roswaal's, which is the " +
				"only thing they are used for here. Roswaal is not affiliated with or endorsed by " +
				"Epic Games and contains no Unreal Engine code.",
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
 * A page rather than only `NOTICE.md`, because the people who need to read it
 * are not all reading the repository — and because the naming statement is a
 * thing to say where users are, not to file where auditors are.
 */
function attributionsPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Roswaal is 0BSD — see the end of this page — but it stands on work " +
				"that is not, and it is named after characters that are not ours. " +
				"Both are listed here.",
		},
		{ t: "h", level: 2, text: NAME_NOTICE.title },
	];

	for (const line of NAME_NOTICE.body) blocks.push({ t: "p", text: line });

	/**
	 * Two headings, because they are two different claims. Everything under the
	 * first ships inside Roswaal or is something it could not run without; the
	 * second is work it only learned from. Putting Unreal Engine under "built on"
	 * said Roswaal was built on Epic's engine, which it is not.
	 */
	const group = (heading: string, lede: string, entries: Attribution[]) => {
		if (entries.length === 0) return;
		blocks.push({ t: "h", level: 2, text: heading });
		blocks.push({ t: "p", text: lede });
		blocks.push({
			t: "table",
			head: ["Project", "By", "Licence"],
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
	return tags;
}

function releasesPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"What changed, and what it changes for you. An entry earns its place by " +
				"altering what a reader would do — a refactor with no visible effect is not here.",
		},
	];

	for (const release of RELEASES) {
		blocks.push({ t: "h", level: 2, text: release.version, aside: release.date });

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
			blocks.push({ t: "h", level: 3, text: heading });
			blocks.push({ t: "table", rows: entries.map((entry) => [entry]) });
		}
	}

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
			t: "code",
			lang: "sh",
			text: "cd my-game\nroswaal init      # creates roswaal.json and .roswaal/\nroswaal serve     # opens the editor on 127.0.0.1:4471",
		},
		{
			t: "p",
			text:
				"`.roswaal/` holds your graphs and is **source, not cache** — commit it. The `src/` " +
				"directory holds what Roswaal generates from them.",
		},
		{ t: "h", level: 2, text: "Your first script" },
		{
			t: "ol",
			items: [
				"Right-click the project tree and make a new graph.",
				"Every script starts at a red **Script Start** node. Nothing runs without one.",
				"Right-click the canvas, search for `Print`, and wire Script Start's execution pin into it.",
				"Type something into the Value pin.",
				"Press **Compile script**. The generated `.luau` appears in the tree beside it.",
			],
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
				"That is the whole loop: edit the graph, compile, Rojo syncs. Turn on **Hot reload** " +
				"and the compile step happens as you work.",
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
				"execution pin is an arrow and a data pin is a circle, and both are hollow until " +
				"something is wired to them.",
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
				"An execution input takes one wire too. Unlike Unreal, two flows cannot join at one node.",
			],
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
				"A pin's colour is its type, close to Unreal's: red boolean, green number, magenta " +
				"string, blue instance, gold vector, orange CFrame. Grey is `any`, and any type " +
				"without a colour of its own, such as `Model`.",
		},
		{
			t: "p",
			text:
				"A data wire takes the colour of the pin it leaves. Where it lands on a pin of " +
				"another colour, it fades from one to the other. Hover a wire to see its type, or " +
				"both types when it fades.",
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
				["Double-click a wire", "Add a reroute knot"],
				["Right-click a pin", "The pin menu"],
			],
		},
		{
			t: "p",
			text: "Wires are curved by default. **Settings → Wires** makes them rigid or angular.",
		},

		{ t: "h", level: 2, text: "Reroute knots" },
		{
			t: "p",
			text:
				"Double-click a wire to put a knot in it, then drag the knot to route the wire where " +
				"you want it. A knot compiles to nothing. It takes the type of whatever is wired " +
				"into it, and changes when that does. `Shift` or `Ctrl` + click a knot to select it.",
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
				"**default** in a dashed box is an optional argument. Left alone, it is not passed " +
				"at all. Click it to set a value, and **×** to clear it. [Roswaal types](types) " +
				"explains when that matters.",
		},

		{ t: "h", level: 2, text: "Adding and removing pins" },
		{
			t: "p",
			text:
				"A node that takes a list has **+** and **−** in its header: the maths and logic " +
				"operators, Make Dictionary, calls, Sequence, Return, Module Exports, and a " +
				"function's parameters.",
		},
	],
});

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
	summary: "Every key and mouse gesture the canvas understands.",
	blocks: [
		{
			t: "p",
			text:
				"Keys act on the canvas, and do nothing while you are typing in a field. **Ctrl** is " +
				"**⌘** on a Mac. **Escape** closes whatever is open — a menu, a panel, the preview.",
		},
		{ t: "h", level: 2, text: "Keyboard" },
		{
			t: "table",
			head: ["Key", "What it does"],
			rows: [
				["`Ctrl` + `Z`", "Undo"],
				["`Ctrl` + `Shift` + `Z`, `Ctrl` + `Y`", "Redo"],
				["`Ctrl` + `S`", "Compile the open graph"],
				["`Ctrl` + `A`", "Select everything"],
				["`Ctrl` + `C`, `Ctrl` + `X`, `Ctrl` + `V`", "Copy, cut, paste"],
				["`Ctrl` + `D`", "Duplicate the selection in place"],
				["`Ctrl` + `Shift` + `L`", "Realign the whole graph"],
				["`Delete`, `Backspace`", "Delete the selection"],
				["`A`", "Align the selection, walking it in the order you picked it"],
				["`C`", "Comment around the selection"],
				["`P`", "Preview the Luau the selection compiles to"],
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"While a compile is running outside hot reload the canvas is locked, and only the " +
				"controls that read rather than change it work: `Ctrl` + `A`, `Ctrl` + `C` and `P`.",
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
				["Wheel", "Zoom, towards the pointer"],
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
			],
		},
		{ t: "h", level: 2, text: "Pins and wires" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag from a pin", "Start a wire; everything it cannot reach dims"],
				["Drop a wire on empty space", "Node menu, showing only what can take that wire"],
				["Drag from a wired input", "Pick that wire up and move it somewhere else"],
				["`Shift` + click a pin", "Disconnect everything on it"],
				["Right-click a pin", "Pin menu — split a struct, promote to a variable"],
				["`Shift` or `Alt` + click a wire", "Disconnect it"],
				["Double-click a wire", "Add a reroute knot where you clicked"],
			],
		},
		{ t: "h", level: 2, text: "Comments" },
		{
			t: "table",
			head: ["Gesture", "What it does"],
			rows: [
				["Drag", "Move it, and the nodes that were inside it when you grabbed it"],
				["Double-click", "Edit the text"],
				["Drag the bottom-right corner", "Resize"],
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

		{ t: "h", level: 2, text: "Variables" },
		{
			t: "p",
			text:
				"Declared once in the **Variables panel** — a name, a type and a starting value — " +
				"and read or written by Get and Set nodes anywhere in the graph, exactly as in " +
				"Blueprints. A variable compiles to a **file-level local**, so the main flow and " +
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

		{ t: "h", level: 2, text: "Locals" },
		{
			t: "p",
			text:
				"**Declare Local** binds a value mid-flow. It exists only inside the block that " +
				"declared it, and you reach it by wiring its output rather than by name — which is " +
				"the whole difference: a variable is addressed by name from anywhere, a local is " +
				"handed onward by a wire.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Reading a local from a **sibling block** is reported as an error rather than " +
				"emitted as code that will not compile. The local genuinely is not in scope there, " +
				"and finding that out from Roswaal beats finding it out from Studio.",
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
		{
			t: "code",
			lang: "luau",
			text: [
				"-- Custom Code, three statements, wired into the flow.",
				"-- Whatever runs next follows them.",
				"local hits = 0",
				"hits += 1",
				"print(hits)",
				"",
				"-- Luau Expression, wired into Print's Value pin.",
				"-- The text is substituted inside the call.",
				"print(os.clock() * 2)",
			].join("\n"),
		},
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

const BUILDING: DocPage = {
	slug: "building-and-rojo",
	narrow: true,
	title: "Building, and node maps",
	summary: "How a graph becomes a file, and a file becomes an instance in Studio.",
	blocks: [
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

		{ t: "h", level: 2, text: "What a graph compiles to" },
		{
			t: "p",
			text:
				"The file is named after the graph, and its ending comes from the script kind, " +
				"chosen in the bar above the canvas. A Lune project always writes `.luau`.",
		},
		{
			t: "table",
			head: ["Kind", "File"],
			rows: [
				["Script", "`Greeter.server.luau`"],
				["LocalScript", "`Greeter.client.luau`"],
				["ModuleScript", "`Greeter.luau`"],
			],
		},

		{ t: "h", level: 2, text: "Compiling" },
		{
			t: "table",
			head: ["", "What it compiles"],
			rows: [
				["**Compile script**, or `Ctrl` + `S`", "The open graph"],
				["**Compile project**", "Every graph, then every node map"],
				["**Hot reload**", "Each graph as you edit it, and any that change on disk — after a `git pull`, say"],
				["`roswaal compile`", "Everything, or the one graph or map you give it"],
				["`roswaal watch`", "Hot reload, without the editor"],
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

		{ t: "h", level: 2, text: "Node maps" },
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
				"Make one with **New map** in the toolbar, or by right-clicking a folder in the " +
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
				"or `roswaal compile`. Hot reload leaves maps alone. A project file Roswaal did not " +
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
					"Both are edited from **Settings** in the toolbar. The panel labels each " +
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
						"Which flavour of Luau to emit. `lune` drops the Roblox globals and the DataModel nodes.",
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
						"`hot` recompiles a graph every time it is written, which is every edit. `manual` waits to be asked.",
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
						"`rojoProject`",
						`\`${defaults.rojoProject ?? ""}\``,
						"The Rojo project file, used to resolve where a file lands in the DataModel. Nothing is written to it.",
					],
					["`schemaVersion`", "set for you", "Which schema the file was written against. `migrate.ts` reads it."],
				],
			},

			{ t: "h", level: 2, text: "Preferences" },
			{
				t: "p",
				text:
					"Stored in this browser under one key, and nowhere else. They do not follow " +
					"you to another machine, which is the right thing to give up: there are four " +
					"of them, and the alternative is a per-developer file in a shared checkout.",
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
						"**Curved** is a bezier out of each pin, and the default. **Rigid** is right angles only. **Angular** is the same route with each corner cut to a 45-degree slope. The two rigid styles are one router drawn two ways, so switching between them restyles a wire rather than moving it.",
					],
					[
						"Node corners",
						"Rounded or square. Capsule getters and reroute knots keep their shapes either way — a pill and a circle are what say *this is a value* and *this is a bend in the wire*, and neither has a title to say it instead.",
					],
					[
						"Write a graph",
						"How long after your last edit a graph is written. A delay, not a switch — there is no unsaved copy of a graph, so switching it off would give you a document that quietly stops matching itself rather than a buffer.",
					],
					["On opening Roswaal", "Reopen the last project, or start at the picker."],
				],
			},

			{
				t: "note",
				kind: "info",
				text:
					"**Wires and node corners are here because people have already forked " +
					"Unreal's Blueprint UI to get them.** Neither changes what a graph means " +
					"or what it compiles to — they are how it looks while you read it, which " +
					"is exactly the kind of thing worth having a setting for rather than a " +
					"patch.",
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
					"Roswaal graph readable to somebody arriving from Blueprints, and a scheme " +
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
					"One type for arrays, maps and sets, because Lua has one. Not an Unreal array.",
				],
				["`function`", "A function value", "Get Function produces one."],
				["`Instance`", "Any Roblox instance", "Not narrowed by class — use Is A to ask."],
				[
					"`Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim`, `UDim2`",
					"Roblox value types",
					"All splittable — see below. Every operation on them is under **Engine types**.",
				],
				[
					"`BrickColor`",
					"A colour from Roblox's fixed palette",
					"**Not a `Color3`**, and not interchangeable with one. Read `.Color` to get the Color3 behind the name.",
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
		{ t: "h", level: 2, text: "If you know Unreal's types" },
		{
			t: "p",
			text:
				"Most of these are a rename. The rows worth reading slowly are the ones with a " +
				"dash in the middle column: Luau has no Rotator, no Quat, and no typed containers, " +
				"and those absences change how you write things rather than just what you call them.",
		},
		{
			t: "table",
			head: ["Unreal", "Luau / Roblox", "Roswaal pin", "Worth knowing"],
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
					"**Different conventions.** Unreal is centimetres and Z-up; Roblox is studs and **Y-up**. Vertical is `Y` here.",
				],
				["`FVector2D`", "`Vector2`", "`Vector2`", ""],
				[
					"`FRotator`",
					"— nothing equivalent —",
					"—",
					"Roblox has no Euler rotation type. Rotation lives inside a `CFrame`; build one with **CFrame Angles** and read it back with `ToEulerAnglesXYZ`.",
				],
				[
					"`FTransform`",
					"`CFrame`",
					"`CFrame`",
					"A CFrame is position and rotation only — **no scale**. Scale is the part's `Size`, separately.",
				],
				[
					"`FQuat`",
					"— nothing equivalent —",
					"—",
					"No quaternion type. A CFrame carries the rotation matrix, and **From Axis Angle** covers most of what a quat was reached for.",
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
				["`UObject*`, `AActor*`", "`Instance`", "`Instance`", "Not narrowed by class — **Is A** asks."],
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
		{ t: "h", level: 2, text: "Casting" },
		{
			t: "p",
			text:
				"A pin's type is Roswaal's; Luau has its own, richer one. **Cast** bridges them: " +
				"its Type pin takes any Luau type expression verbatim, so intersections, unions, " +
				"table types and optionals all work.",
		},
		{
			t: "code",
			lang: "luau",
			text: "local humanoid = (character :: Model & { Humanoid: Humanoid }).Humanoid",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"`::` is a claim, not a check — there is no runtime test and being wrong is silent. " +
				"Ask with **Is A** first. And Luau refuses a cast between unrelated types, which is " +
				"what **Cast Through Any** is for.",
		},
	],
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

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
			.filter((c) => custom || c !== ENGINE_TYPES)
			.map((c) => ({ c, pages: (byCategory.get(c) ?? []).filter((p) => !!p.custom === custom) }))
			.filter((x) => x.pages.length > 0)
			.map((x) => ({
				title: x.c,
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

	return {
		sections: withReviews([
			{
				title: "Getting started",
				slug: "start",
				group: GROUPS.learn,
				pages: [GETTING_STARTED, CONTROLS, blueprintPage()],
			},
			{
				title: "Guides",
				slug: "guides",
				group: GROUPS.learn,
				pages: [
					TWO_KINDS_OF_WIRE(registry), TYPES_GUIDE, VARIABLES, BUILDING,
					ESCAPE_HATCHES(registry), settingsPage(),
				],
			},
			{
				title: "Release notes",
				slug: "releases",
				group: GROUPS.learn,
				pages: [releasesPage()],
			},
			{
				title: "Attributions",
				slug: "attributions",
				group: GROUPS.learn,
				pages: [attributionsPage()],
			},
			...reference(GROUPS.builtin, false),
			...engineTypeSections(),
			...reference(GROUPS.project, true),
		]),
	};
}

/**
 * Every page but a pack's, carrying its review.
 *
 * Copies rather than writes, because the hand-written pages are module
 * constants shared by every build of the site.
 */
function withReviews(sections: DocSection[]): DocSection[] {
	return sections.map((section) => ({
		...section,
		pages: section.pages.map((page) =>
			page.custom ? page : { ...page, review: reviewOf(page.slug) },
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
	const q = query.trim().toLowerCase();
	if (q === "") return [];

	return index
		.map((entry) => ({ entry, score: scoreEntry(entry, q) }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
		.slice(0, limit)
		.map((x) => x.entry);
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
