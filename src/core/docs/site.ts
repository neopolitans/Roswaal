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
import { defaultConfig, ENGINE_TYPES, type NodeScript } from "../schema.js";
import { CODE_ROLES, ROLES } from "../theme.js";
import { BUILTIN_THEMES } from "../themeData.js";
import { DEPENDENCIES, INSPIRATIONS, NAME_NOTICE, type Attribution } from "./attributions.js";
import { CLI_COMMANDS, CLI_OPTIONS } from "./cli.js";
import { GUIDE_SCENES } from "./examples.js";
import { RELEASES, type Release } from "./releases.js";
import { reviewerCounts, reviewerLink, reviewOf, type Review } from "./reviews.js";

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
	| { t: "graph"; script: NodeScript; caption?: string }
	/**
	 * A fold: a summary line that opens onto more blocks. `<details>` in both
	 * renderers, so a page can hold a long history without making every reader
	 * scroll past all of it. `aside` sits at the right of the summary, as a
	 * heading's does. `open` starts it unfolded; a reader can still close it.
	 */
	| { t: "details"; summary: string; aside?: string; open?: boolean; blocks: Block[] }
	| { t: "tabs"; label?: string; tabs: DocTab[] };

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
		case "details":
			return [block.summary, block.aside ?? "", ...block.blocks.map(blockText)].join(" ").trim();
		case "tabs":
			return [
				block.label ?? "",
				...block.tabs.flatMap((tab) => [tab.title, ...tab.blocks.map(blockText)]),
			].join(" ").trim();
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
	 * second is work it only learned from. Listing an inspiration under "built
	 * on" would claim a relationship that does not exist.
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
	[...minors].forEach(([minor, releases], index) => {
		blocks.push({
			t: "details",
			summary: minor,
			aside: `${releases.length} ${releases.length === 1 ? "release" : "releases"} · ${releases[0].date}`,
			open: index === 0,
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
				["`C`", "A new comment: around the selection, or empty where you are looking"],
				["Right-click the canvas", "**Add comment**, placed where you clicked"],
				["Drag", "Move it, and the nodes that were inside it when you grabbed it"],
				["Double-click", "Edit the text. Enter adds a line; Esc, Ctrl+Enter or a click away saves"],
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
				"chosen in the tools along the top of the canvas. A Lune graph always writes `.luau`.",
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
		{
			t: "p",
			text:
				"The same bar shows what the graph compiles for — **Roblox**, or **Lune** — and " +
				"changes it. A new graph takes the project's **Target** setting. A Roblox-only node in " +
				"a Lune graph is an error on that node, and nothing is written.",
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
						"**Curved** is a bezier out of each pin, and the default. **Rigid** is right angles only. **Angular** is the same route with each corner cut to a 45-degree slope. The two rigid styles are one router drawn two ways, so switching between them restyles a wire rather than moving it.",
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
						"Whether a new **And**, **Or**, **Not** or comparison pill starts out bracketing its expression. Only the starting point: whether a node brackets is stored **on the node**, so it travels with the graph and reads the same on everybody's machine. Precedence is handled either way — this is about how the line reads, never about what it means.",
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
		summary: "The two ways to declare one, the graph each opens in, and what can reach inside.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"Every function in a nodescript has a **graph of its own**. Its body is built there, " +
					"it opens in a tab, and the nodescript's own graph stays about the script's flow.",
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
					"**Copying** a function copies its graph, so the paste is a working function.",
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"**A graph made before 0.33.0 is split when it is opened.** Each function's nodes " +
					"move into its graph, and the Luau it compiles to does not change.",
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
		...previews(
			registry,
			["cast.as", "cast.array", "cast.any"],
			"The three of them. Each takes its type as typed-in text, because that text becomes " +
			"part of the generated file rather than a value at runtime.",
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
				"Everywhere a type is chosen — a variable, a parameter, a local — the list is " +
				"ordered by how close to hand each group is: **this graph's own** declared types " +
				"first, then the types **a required module exports**, written as you would write " +
				"them (`Config.Tuning`), then the primitives, Roblox's values, and the instance " +
				"classes. **Other…** takes any Luau type at all.",
		},
		{
			t: "p",
			text:
				"You meet it in the **Inspector**, on the right, and it is two controls rather " +
				"than one. While the type is a name the list holds, it is a **dropdown** grouped " +
				"in that order. Choose **Other…** and it becomes a **text field** taking any Luau " +
				"type at all, with the instance classes the list left out offered as suggestions " +
				"behind it.",
		},
		{
			t: "p",
			text:
				"A type the list cannot show — `{ [Model]: Restore }`, `Model?`, " +
				"`(number) -> string` — opens that field **by itself**. That is the control saying " +
				"this type is not one of the everyday ones, rather than a dropdown quietly unable " +
				"to display its own value. Clearing the field means `any`.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Other… is not the only way out.** Where a type is a whole declaration rather " +
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
				"**instance class to an `Instance` pin** — a `Model` goes anywhere an `Instance` is " +
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
								"**Build the node by handling it.** Open **Node Design** from the toolbar, or " +
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
				"**`builtin` is reserved** for the flow nodes that open blocks — branches, loops, " +
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
				"**`stop` and `restart` reach the daemon over HTTP** rather than through a PID file, " +
				"so there is no stale pid to reason about when one dies unexpectedly. `stop` reports " +
				"success only once the health probe has gone quiet — not when the request was sent.",
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
			.filter((c) => custom || (c !== ENGINE_TYPES && c !== ZUP_CONVERSIONS))
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

	const start = [GETTING_STARTED, CONTROLS, blueprintPage()];
	const guides = [
		TWO_KINDS_OF_WIRE(registry), TYPES_GUIDE, VARIABLES, BUILDING,
		ESCAPE_HATCHES(registry), settingsPage(), CUSTOM_NODES, CLI_PAGE,
	];
	// Beside the types page it was split out of, rather than at the end.
	guides.splice(guides.indexOf(TYPES_GUIDE) + 1, 0, castingPage(registry));
	// After locals, whose Get Parameter it leans on.
	guides.splice(guides.indexOf(VARIABLES) + 1, 0, functionsPage(registry));
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
			{ title: "Guides", slug: "guides", group: GROUPS.learn, pages: guides },
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
