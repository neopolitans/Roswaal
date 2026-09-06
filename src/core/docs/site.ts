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

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type Block =
	| { t: "h"; level: 2 | 3; text: string }
	| { t: "p"; text: string }
	| { t: "ul"; items: string[] }
	| { t: "ol"; items: string[] }
	| { t: "code"; lang: "luau" | "sh" | "json"; text: string }
	| { t: "table"; head: string[]; rows: string[][] }
	/** A pulled-out aside. `warn` for a trap, `good` for a promise being kept. */
	| { t: "note"; kind: "info" | "warn" | "good"; text: string }
	/** Pin tables on a node page, which want their own rendering. */
	| { t: "pins"; title: string; pins: NodeDoc["inputs"] };

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
}

export interface DocSection {
	title: string;
	slug: string;
	pages: DocPage[];
}

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
		case "p":
			return parseInline(block.text).map((i) => i.text).join("");
		case "ul":
		case "ol":
			return block.items.map((i) => parseInline(i).map((x) => x.text).join("")).join(" ");
		case "code":
			return block.text;
		case "table":
			return [...block.head, ...block.rows.flat()].join(" ");
		case "note":
			return parseInline(block.text).map((i) => i.text).join("");
		case "pins":
			return block.pins.map((p) => `${p.name} ${p.type ?? ""}`).join(" ");
	}
}

// ---------------------------------------------------------------------------
// Generated pages
// ---------------------------------------------------------------------------

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
	if (traits.length > 0) blocks.push({ t: "ul", items: traits });

	if (doc.inputs.length > 0) blocks.push({ t: "pins", title: "Inputs", pins: doc.inputs });
	if (doc.outputs.length > 0) blocks.push({ t: "pins", title: "Outputs", pins: doc.outputs });

	blocks.push({ t: "h", level: 3, text: "What it compiles to" });
	if (doc.example) {
		blocks.push({ t: "code", lang: "luau", text: doc.example });
		if (doc.exampleNote) blocks.push({ t: "note", kind: "info", text: doc.exampleNote });
	} else if (doc.exampleOmitted) {
		blocks.push({ t: "note", kind: "info", text: OMISSION_REASONS[doc.exampleOmitted] });
	}

	const splittable = [...doc.inputs, ...doc.outputs].filter((p) => p.splitModes.length > 0);
	if (splittable.length > 0) {
		blocks.push({ t: "h", level: 3, text: "Pins you can split" });
		blocks.push({
			t: "table",
			head: ["Pin", "Type", "Decompositions"],
			rows: splittable.map((p) => [p.name || p.id, p.type ?? "", p.splitModes.join(", ")]),
		});
	}

	const pasted = [...doc.inputs].filter((p) => p.literalOnly);
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

// ---------------------------------------------------------------------------
// Hand-written pages
// ---------------------------------------------------------------------------

const GETTING_STARTED: DocPage = {
	slug: "getting-started",
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

const TWO_KINDS_OF_WIRE: DocPage = {
	slug: "wires-and-pins",
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
};

const VARIABLES: DocPage = {
	slug: "variables-and-locals",
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

const ESCAPE_HATCHES: DocPage = {
	slug: "hand-written-luau",
	title: "Hand-written Luau",
	summary: "The two nodes that take code, and why there are only two.",
	blocks: [
		{
			t: "p",
			text:
				"**Custom Code** emits its text verbatim as statements. **Luau Expression** does the " +
				"same for a single expression. Click the code preview on either for a real editor: " +
				"Luau highlighting, completion over both Luau's globals and the names this graph puts " +
				"in scope, and a structural check that marks a broken line as you type.",
		},
		{ t: "h", level: 2, text: "There are exactly two" },
		{
			t: "note",
			kind: "good",
			text:
				"Those two node titles are a **complete list** of where hand-written Luau can enter a " +
				"graph. Every other pin that defaults to something like `Vector3.zero` displays that " +
				"constant and will not accept typed code.",
		},
		{
			t: "p",
			text:
				"That guarantee is the point. Plenty of ordinary pins default to a raw Luau constant " +
				"because their type has no literal form — a `Vector3` input cannot sensibly default to " +
				"`nil`. If every one of those opened a code editor, a graph shared with you could hide " +
				"arbitrary code inside a node whose title says *Look At*, and reviewing it would mean " +
				"opening every pin rather than scanning for two node names.",
		},
		{
			t: "p",
			text:
				"To change a constant on an ordinary pin, wire a node into it or split it into its " +
				"components.",
		},
	],
};

const BUILDING: DocPage = {
	slug: "building-and-rojo",
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

	const reference: DocSection[] = order
		.filter((c) => byCategory.has(c))
		.map((c) => ({ title: c, slug: `nodes/${slugify(c)}`, pages: byCategory.get(c)! }));

	return {
		sections: [
			{
				title: "Getting started",
				slug: "start",
				pages: [GETTING_STARTED, blueprintPage()],
			},
			{
				title: "Guides",
				slug: "guides",
				pages: [TWO_KINDS_OF_WIRE, VARIABLES, BUILDING, ESCAPE_HATCHES],
			},
			...reference,
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
