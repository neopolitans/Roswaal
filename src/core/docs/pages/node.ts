/**
 * A node's page in the reference, generated from its definition.
 */

import { categoryLabel } from "../../categories.js";
import { LUNE_ROBLOX_DATATYPES } from "../../luneApi.js";
import { classify, type Runtime } from "../../nodes/runtimes.js";
import { ENGINE_TYPES } from "../../schema.js";
import { type NodeDoc, OMISSION_REASONS } from "../nodeReference.js";
import type { Block, DocPage } from "../site.js";

/**
 * How a node page says which runtime it is for.
 *
 * Every page says it, including the base-Luau ones. Left unsaid, "works in
 * both" is indistinguishable from "nobody has decided", and the reader has no
 * way to tell which it is.
 */
const RUNTIME_TRAIT: Record<Runtime, string> = {
	luau: "the language itself, so it works in Roblox and in Lune",
	roblox: "needs the Roblox engine — its datatypes, its DataModel or its scheduler",
	lune: "needs Lune, the standalone Luau runtime",
};

export function nodePage(doc: NodeDoc): DocPage {
	const blocks: Block[] = [];

	const traits: string[] = [];
	// Which runtime, on every page rather than only where it is restricted.
	// Said nowhere, "base Luau" and "nobody has checked" look identical.
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
		doc.category === ENGINE_TYPES &&
		doc.subcategory !== undefined &&
		LUNE_ROBLOX_DATATYPES.includes(doc.subcategory);
	traits.push(
		crossOver
			? "Roblox's, and Lune's too — a Lune graph needs `@lune/roblox` required for it"
			: RUNTIME_TRAIT[classify(doc)],
	);
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
		(doc.compiles === "call" || doc.compiles === "expr") &&
		doc.outputs.some((pin) => pin.kind === "data")
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
	// is named for it — warning about Code Block's Code pin would be noise.
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
