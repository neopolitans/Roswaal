/**
 * Forward migration for graphs written by earlier builds.
 *
 * Runs on every read. Cheap, idempotent, and the only place that knows about
 * historical shapes, so the rest of the codebase can assume the current one.
 */

import { RENAMED_NODES } from "./nodes/index.js";
import { emptyScript, SCHEMA_VERSION, type Link, type NodeScript } from "./schema.js";

export interface MigrationResult {
	script: NodeScript;
	/** Human-readable notes, shown once when the file is opened. */
	notes: string[];
}

/** Pins that changed id, keyed by node type. */
const RENAMED_PINS: Record<string, Record<string, string>> = {
	"roblox.getService": { result: "service" },
	// The operator nodes became variadic, so their two fixed pins became the
	// first two of a numbered run.
	...Object.fromEntries(
		[
			"math.add", "math.sub", "math.mul", "math.div",
			"math.min", "math.max", "logic.and", "logic.or", "string.concat",
		].map((id) => [id, { a: "a0", b: "a1" }]),
	),
};

/**
 * Nodes that used to sit in the execution chain and are now pure. Their exec
 * pins are gone, so the wires either side are spliced together rather than
 * dropped — otherwise a graph would silently lose the rest of its flow.
 */
const BECAME_PURE = new Set(["roblox.getService"]);

export function migrateScript(raw: NodeScript): MigrationResult {
	const notes: string[] = [];

	// Defaults for fields added after this file was written.
	const script: NodeScript = {
		...emptyScript(raw.name, raw.id),
		...raw,
		variables: raw.variables ?? [],
		comments: raw.comments ?? [],
		links: raw.links ?? [],
		nodes: raw.nodes ?? [],
	};

	const renamed = new Map<string, number>();
	script.nodes = script.nodes.map((node) => {
		const replacement = RENAMED_NODES[node.def];
		if (!replacement) return node;
		renamed.set(node.def, (renamed.get(node.def) ?? 0) + 1);
		return { ...node, def: replacement };
	});

	for (const [from, count] of renamed) {
		notes.push(`Renamed ${count} × "${from}" to "${RENAMED_NODES[from]}".`);
	}

	const byId = new Map(script.nodes.map((n) => [n.id, n]));

	// -- pin renames -------------------------------------------------------
	//
	// Literals are keyed by pin id too, so renaming a pin has to move the value
	// typed into it. Missing this leaves the wire connected and the typed-in
	// number silently back at its default, which is worse than an error.
	let literalFixes = 0;
	script.nodes = script.nodes.map((node) => {
		const renames = RENAMED_PINS[node.def];
		if (!renames || !node.literals) return node;

		const literals: typeof node.literals = {};
		let changed = false;
		for (const [pinId, value] of Object.entries(node.literals)) {
			const replacement = renames[pinId];
			if (replacement) changed = true;
			literals[replacement ?? pinId] = value;
		}
		if (!changed) return node;
		literalFixes++;
		return { ...node, literals };
	});
	if (literalFixes > 0) {
		notes.push(`Moved typed-in values on ${literalFixes} node${literalFixes === 1 ? "" : "s"} to renamed pins.`);
	}

	let pinFixes = 0;
	script.links = script.links.map((link) => {
		const fromDef = byId.get(link.from.node)?.def;
		const toDef = byId.get(link.to.node)?.def;
		const fromPin = fromDef ? RENAMED_PINS[fromDef]?.[link.from.pin] : undefined;
		const toPin = toDef ? RENAMED_PINS[toDef]?.[link.to.pin] : undefined;
		if (!fromPin && !toPin) return link;
		pinFixes++;
		return {
			...link,
			from: fromPin ? { ...link.from, pin: fromPin } : link.from,
			to: toPin ? { ...link.to, pin: toPin } : link.to,
		};
	});
	if (pinFixes > 0) notes.push(`Repointed ${pinFixes} wire${pinFixes === 1 ? "" : "s"} to renamed pins.`);

	// -- nodes that became pure --------------------------------------------
	let spliced = 0;
	for (const node of script.nodes) {
		if (!BECAME_PURE.has(node.def)) continue;

		const incoming = script.links.find((l) => l.to.node === node.id && l.to.pin === "in");
		const outgoing = script.links.find((l) => l.from.node === node.id && l.from.pin === "then");
		if (!incoming && !outgoing) continue;

		script.links = script.links.filter((l) => l !== incoming && l !== outgoing);

		// Join what the node used to sit between, so the flow survives it
		// stepping out of the chain.
		if (incoming && outgoing) {
			const joined: Link = {
				id: `${incoming.id}-joined`,
				from: incoming.from,
				to: outgoing.to,
			};
			script.links.push(joined);
		}
		spliced++;
	}
	if (spliced > 0) {
		notes.push(
			`${spliced} Get Service node${spliced === 1 ? " is" : "s are"} now pure; ` +
				"the execution wires around them were joined up.",
		);
	}

	if (script.schemaVersion < SCHEMA_VERSION) {
		notes.push(`Updated from schema ${script.schemaVersion} to ${SCHEMA_VERSION}.`);
		script.schemaVersion = SCHEMA_VERSION;
	}

	return { script, notes };
}
