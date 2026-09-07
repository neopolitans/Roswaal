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
import { categories } from "../nodes/index.js";
import { BLUEPRINT_MAP } from "./blueprints.js";
import { documentRegistry, OMISSION_REASONS, type NodeDoc } from "./nodeReference.js";
import { previewOf, type NodePreview } from "./preview.js";
import type { NodeScript } from "../schema.js";
import { DEPENDENCIES, INSPIRATIONS, NAME_NOTICE, type Attribution } from "./attributions.js";
import { RELEASES, type Release } from "./releases.js";

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
	/** A pulled-out aside. `warn` for a trap, `good` for a promise being kept. */
	| { t: "note"; kind: "info" | "warn" | "good"; text: string }
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
			return parseInline(block.text).map((i) => i.text).join("");
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
				text: "**Worth knowing before you upgrade.** " + release.watch.join(" "),
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
	summary: "Execution versus data, pure nodes, and why a wire will not connect.",
	blocks: [
		{
			t: "p",
			text:
				"White **execution** wires say what happens in what order. Coloured **data** wires say " +
				"what a value is. A node either sits in the execution line or it does not.",
		},
		{
			t: "p",
			text:
				"Nodes with a green left edge are **pure**: no execution pins, wire them anywhere. A " +
				"pure value used once is spliced into its use site; used twice it is bound to a local " +
				"first, so the work happens once however many wires leave the pin.",
		},
		...previews(
			registry,
			["debug.print", "math.add"],
			"Print sits in the execution line, so it has a white pin either side. Add is pure — " +
				"no execution pins at all, and its value goes wherever a value is wanted.",
		),
		{ t: "h", level: 2, text: "Reading the colours" },
		{
			t: "p",
			text:
				"Pin colour is the type, kept close to Unreal's where the types line up: red boolean, " +
				"green number, magenta string, blue instance, gold vector. A wire that fades between " +
				"two colours is a coercion — an `any` landing on a typed pin. Hover it to see which.",
		},
		{ t: "h", level: 2, text: "When it will not connect" },
		{
			t: "ul",
			items: [
				"Dragging from a pin dims everything it cannot reach.",
				"Execution and data wires never join.",
				"An input takes one wire; connecting a second replaces the first.",
				"Drag *from* a wired input to pick that wire up and move it.",
				"Some inputs are typed in and pasted into the generated source — a property name, a field. Those take no wire at all, and the pin menu says so.",
			],
		},
		{ t: "h", level: 2, text: "Splitting a value" },
		{
			t: "p",
			text:
				"Right-click a `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` or `UDim2` pin and pick " +
				"**Split Struct Pin**, exactly as in Unreal. The pin becomes one pin per component, " +
				"named after its parent.",
		},
		{
			t: "note",
			kind: "good",
			text:
				"Splitting and recombining are **value-preserving**: what the graph compiles to does " +
				"not change either way. Where a value cannot be taken apart — an expression rather " +
				"than a constant — Roswaal says so before it changes anything, instead of guessing.",
		},
	],
});

const VARIABLES: DocPage = {
	slug: "variables-and-locals",
	narrow: true,
	title: "Variables and locals",
	summary: "Two different things, deliberately named apart.",
	blocks: [
		{
			t: "p",
			text:
				"A **variable** is declared once in the Variables panel and read or written by Get and " +
				"Set nodes anywhere in the graph, exactly as in Blueprints. It compiles to a " +
				"file-level local, so functions and the main flow both see it. Drag one onto the " +
				"canvas for a Get, hold Ctrl for a Set.",
		},
		{
			t: "p",
			text:
				"A **local** (`Declare Local`) binds a value mid-flow and only exists inside the block " +
				"that declared it. You reach it by wiring its output, not by name.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"Reading a local from a sibling block is reported as an error rather than emitted as " +
				"code that will not compile. The local genuinely is not in scope there.",
		},
		{
			t: "p",
			text:
				"A variable read is never hoisted. Unlike a pure expression it has to happen at its " +
				"use site, or a Set sitting between two Gets would be invisible to the second one.",
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
	summary: "How graphs become files, and files become instances.",
	blocks: [
		{
			t: "p",
			text:
				"Graphs live in `.roswaal/scripts` and compile to `.luau` under the out directory. " +
				"Folders under the scripts directory mirror folders under the out directory, and Rojo " +
				"turns those into Folder instances.",
		},
		{ t: "h", level: 2, text: "Node maps" },
		{
			t: "p",
			text:
				"A `.nodemap` describes an instance hierarchy and compiles to a Rojo project file, so " +
				"the tree is authored in Roswaal rather than hand-edited into `default.project.json` " +
				"and kept in step by memory.",
		},
		{
			t: "p",
			text:
				"The map is also what makes `Require Module` work: the disk path says " +
				"`src/ReplicatedStorage/Shared/Greeter.luau` and the require needs " +
				"`ReplicatedStorage.Shared.Greeter`. Only the map knows how one becomes the other.",
		},
		{ t: "h", level: 2, text: "Stale output" },
		{
			t: "p",
			text:
				"Move a graph and its old generated file stays behind. Rojo cannot tell it is stale " +
				"and syncs both, so the same module turns up twice. `roswaal prune` removes them, and " +
				"the editor offers to when it notices.",
		},
	],
};

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
					"All splittable — see below.",
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
	for (const doc of nodes) {
		const list = byCategory.get(doc.category) ?? [];
		list.push(nodePage(doc));
		byCategory.set(doc.category, list);
	}

	// Built-in and pack nodes are grouped apart rather than interleaved by
	// category, so a pack's node is recognisable before you click it.
	const reference = (group: string, custom: boolean): DocSection[] =>
		order
			.map((c) => ({ c, pages: (byCategory.get(c) ?? []).filter((p) => !!p.custom === custom) }))
			.filter((x) => x.pages.length > 0)
			.map((x) => ({
				title: x.c,
				slug: `${custom ? "pack" : "nodes"}/${slugify(x.c)}`,
				pages: x.pages,
				group,
			}));

	return {
		sections: [
			{
				title: "Getting started",
				slug: "start",
				group: GROUPS.learn,
				pages: [GETTING_STARTED, blueprintPage()],
			},
			{
				title: "Guides",
				slug: "guides",
				group: GROUPS.learn,
				pages: [
					TWO_KINDS_OF_WIRE(registry), TYPES_GUIDE, VARIABLES, BUILDING,
					ESCAPE_HATCHES(registry),
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
			...reference(GROUPS.project, true),
		],
	};
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
