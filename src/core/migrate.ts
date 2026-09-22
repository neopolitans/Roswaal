/**
 * Forward migration for graphs written by earlier builds.
 *
 * Runs on every read. Cheap, idempotent, and the only place that knows about
 * historical shapes, so the rest of the codebase can assume the current one.
 */

import { assignMembership } from "./functionGraph.js";
import { RENAMED_NODES, type Registry } from "./nodes/index.js";
import { parseSplitKey, partPinId, splitKey, splitPinId, splitsOf } from "./structs.js";
import {
	emptyScript, SCHEMA_VERSION, TYPECHECK_MODES,
	type Link, type NodeScript, type TypecheckMode,
} from "./schema.js";

/**
 * Applies a pin rename, following it into the components of a split pin.
 *
 * A split pin exposes `position.x`, `position.y`, `position.z`. Renaming
 * `position` has to carry all three with it; handling only the exact id would
 * leave three wires pointing at a pin that no longer exists.
 */
function renamePin(
	renames: Record<string, string> | undefined, pinId: string,
): string | undefined {
	if (!renames) return undefined;
	const direct = renames[pinId];
	if (direct) return direct;

	const ref = splitPinId(pinId);
	const parent = ref ? renames[ref.parent] : undefined;
	return ref && parent ? partPinId(parent, ref.part) : undefined;
}

export interface MigrationResult {
	script: NodeScript;
	/** Human-readable notes, shown once when the file is opened. */
	notes: string[];
}

/** Pins that changed id, keyed by node type. */
/** Make Dictionary's cap, and so how many rows a rename has to cover. */
const DICTIONARY_ROWS = 24;

const RENAMED_PINS: Record<string, Record<string, string>> = {
	"roblox.getService": { result: "service" },
	// A dictionary's rows are one Key Value Pair pin each now, split into Key
	// and Value. The wires and the typed-in values move onto the split parts;
	// the split itself is written further down, because renaming a pin cannot
	// create one and the parts do not exist until it does.
	"table.dictionary": Object.fromEntries(
		Array.from({ length: DICTIONARY_ROWS }, (_, i) => [
			[`k${i}`, `p${i}.key`],
			[`a${i}`, `p${i}.value`],
		]).flat(),
	),
	// The operator nodes became variadic, so their two fixed pins became the
	// first two of a numbered run.
	...Object.fromEntries(
		[
			"math.add", "math.sub", "math.mul", "math.div",
			"math.min", "math.max", "logic.and", "logic.or", "string.concat",
		].map((id) => [id, { a: "a0", b: "a1" }]),
	),
};

/** The Index nodes, and the Key node each becomes when its key is a name. */
const KEYED: Record<string, string> = {
	"table.set": "table.setKey",
	"table.get": "table.getKey",
};

/**
 * Nodes that used to sit in the execution chain and are now pure, and what to
 * call each one when saying so. Their exec pins are gone, so the wires either
 * side are spliced together rather than dropped — otherwise a graph would
 * silently lose the rest of its flow.
 */
const BECAME_PURE: Record<string, string> = {
	"roblox.getService": "Get Service",
	"roblox.findFirstChild": "Find First Child",
};

/**
 * Which typechecking mode a graph on disk asks for.
 *
 * Until 0.18.1 this was a `strict` checkbox, and the two states map exactly onto
 * two of the three modes — ticked wrote `--!strict`, unticked wrote no mode line
 * at all. So the conversion loses nothing and is done silently; there is no
 * decision for the author to be told about.
 *
 * A file with neither key is taken as `strict`, which is what a graph made in
 * the editor gets. A file naming a mode this build has never heard of falls back
 * to `default` instead — something written by a later build should emit *less*,
 * not have checking the author did not ask for silently turned on.
 */
function typecheckOf(raw: NodeScript): TypecheckMode {
	if (TYPECHECK_MODES.includes(raw.typecheck)) return raw.typecheck;
	const legacy = (raw as { strict?: boolean }).strict;
	if (typeof legacy === "boolean") return legacy ? "strict" : "default";
	return raw.typecheck === undefined ? "strict" : "default";
}

export function migrateScript(raw: NodeScript, registry?: Registry): MigrationResult {
	const notes: string[] = [];

	// Defaults for fields added after this file was written.
	const script: NodeScript = {
		...emptyScript(raw.name, raw.id),
		...raw,
		variables: raw.variables ?? [],
		// Added at 0.63.0. A graph written before it has no modules, which is
		// not the same as having an empty list nobody wrote -- but it reads the
		// same, and defaulting here means nothing downstream has to ask.
		modules: raw.modules ?? [],
		comments: raw.comments ?? [],
		links: raw.links ?? [],
		nodes: raw.nodes ?? [],
		typecheck: typecheckOf(raw),
	};
	// The spread above copies whatever the file had, and a graph written before
	// 0.18.1 had a `strict` key that nothing reads now. Left in place it would be
	// written back out on every save, so old files would never stop carrying it.
	delete (script as { strict?: boolean }).strict;

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

	// -- a member that was a pin -------------------------------------------
	//
	// Get Member shipped in 0.76.0 with its member typed into a pin, which made
	// it two rows wide with "Object" and a field beside it. It is one line now
	// -- `.throttle` -- and the member is carried by the node, so a graph from
	// that one version has it in the wrong place and would compile to `x.`.
	let members = 0;
	script.nodes = script.nodes.map((node) => {
		if (node.def !== "value.member") return node;
		const literal = node.literals?.member;
		if (!literal || literal.t !== "string") return node;
		const literals = { ...node.literals };
		delete literals.member;
		members++;
		const config = (node.config ?? {}) as { member?: unknown };
		return {
			...node,
			literals,
			config: { ...config, member: config.member ?? literal.v },
		};
	});
	if (members > 0) notes.push(`Moved the member onto ${members} × Get Member.`);

	// -- an index that was a name ------------------------------------------
	//
	// Until 0.30.0 one node set `t[1]` and `t.name` alike, and its pin was
	// called Key while its title said Index. Index takes a number now, so a
	// graph keyed by a name — typed in, or wired from a String — is a Key. A
	// key wired from anything else could be either and is left alone; a string
	// still fits a number pin, so it compiles to what it always did.
	let keyed = 0;
	script.nodes = script.nodes.map((node) => {
		const next = KEYED[node.def];
		if (!next) return node;
		const wire = script.links.find((l) => l.to.node === node.id && l.to.pin === "key");
		const named = wire
			? script.nodes.find((n) => n.id === wire.from.node)?.def === "value.string"
			: node.literals?.key?.t === "string";
		if (!named) return node;
		keyed++;
		return { ...node, def: next };
	});
	if (keyed > 0) {
		notes.push(
			`${keyed} Index node${keyed === 1 ? " was" : "s were"} keyed by a name, so ` +
			`${keyed === 1 ? "it is" : "they are"} now Set Key or Get Key.`,
		);
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
		if (!renames) return node;
		let changed = false;
		let next = node;

		if (node.literals) {
			const literals: typeof node.literals = {};
			for (const [pinId, value] of Object.entries(node.literals)) {
				const replacement = renamePin(renames, pinId);
				if (replacement) changed = true;
				literals[replacement ?? pinId] = value;
			}
			if (changed) next = { ...next, literals };
		}

		// The record of which pins are split is keyed by pin id as well, so a
		// rename has to move it too — otherwise the pin comes back whole and the
		// wires to its components are left pointing at nothing.
		const splits = splitsOf(node.config);
		const keys = Object.entries(splits);
		if (keys.length > 0) {
			const moved: Record<string, string> = {};
			let splitChanged = false;
			for (const [k, mode] of keys) {
				const parsed = parseSplitKey(k);
				const replacement = parsed ? renames[parsed.pin] : undefined;
				if (parsed && replacement) {
					moved[splitKey(parsed.side, replacement)] = mode;
					splitChanged = true;
				} else {
					moved[k] = mode;
				}
			}
			if (splitChanged) {
				changed = true;
				next = { ...next, config: { ...next.config, split: moved } };
			}
		}

		if (!changed) return node;
		literalFixes++;
		return next;
	});
	if (literalFixes > 0) {
		notes.push(`Moved typed-in values on ${literalFixes} node${literalFixes === 1 ? "" : "s"} to renamed pins.`);
	}

	let pinFixes = 0;
	script.links = script.links.map((link) => {
		const fromDef = byId.get(link.from.node)?.def;
		const toDef = byId.get(link.to.node)?.def;
		const fromPin = fromDef ? renamePin(RENAMED_PINS[fromDef], link.from.pin) : undefined;
		const toPin = toDef ? renamePin(RENAMED_PINS[toDef], link.to.pin) : undefined;
		if (!fromPin && !toPin) return link;
		pinFixes++;
		return {
			...link,
			from: fromPin ? { ...link.from, pin: fromPin } : link.from,
			to: toPin ? { ...link.to, pin: toPin } : link.to,
		};
	});
	if (pinFixes > 0) notes.push(`Repointed ${pinFixes} wire${pinFixes === 1 ? "" : "s"} to renamed pins.`);

	// -- a dictionary's rows became pair pins ------------------------------
	//
	// The renames above moved each row's key and value onto the parts of a split
	// pin. The split itself has to be written here, because renaming a pin
	// cannot create one and the parts do not exist until it does.
	//
	// A row that was fed by a Key Value Pair wants the opposite. Its old value
	// pin accepted a whole pair, which is exactly what the row now *is* — so it
	// stays unsplit and the wire moves back onto the row itself, rather than
	// onto a Value that would be holding an entry instead of a value.
	let dictionaries = 0;
	script.nodes = script.nodes.map((node) => {
		if (node.def !== "table.dictionary") return node;

		const rows = Math.max(1, Number((node.config as { args?: unknown } | undefined)?.args ?? 1));
		const whole = new Set<string>();
		for (const link of script.links) {
			if (link.to.node !== node.id) continue;
			const ref = splitPinId(link.to.pin);
			if (ref?.part === "value" && byId.get(link.from.node)?.def === "table.pair") {
				whole.add(ref.parent);
			}
			// A wire already sitting on the row itself means this graph has been
			// through here before and that row is meant to be whole. Without it
			// a second pass finds an unsplit row, no longer sees the evidence it
			// left — the wire has moved off `.value` — and splits it back.
			if (!ref && /^p\d+$/.test(link.to.pin)) whole.add(link.to.pin);
		}

		const splits = { ...splitsOf(node.config) };
		let changed = false;
		for (let i = 0; i < rows; i++) {
			const key = splitKey("in", `p${i}`);
			if (whole.has(`p${i}`) || splits[key] !== undefined) continue;
			splits[key] = "keyValue";
			changed = true;
		}

		if (!changed) return node;
		dictionaries++;
		return { ...node, config: { ...node.config, split: splits } };
	});

	script.links = script.links.map((link) => {
		const ref = splitPinId(link.to.pin);
		if (!ref || ref.part !== "value") return link;
		if (byId.get(link.to.node)?.def !== "table.dictionary") return link;
		if (byId.get(link.from.node)?.def !== "table.pair") return link;
		return { ...link, to: { ...link.to, pin: ref.parent } };
	});

	if (dictionaries > 0) {
		notes.push(
			`${dictionaries} Make Dictionary node${dictionaries === 1 ? " now takes" : "s now take"} ` +
			"one Key Value Pair per row, split into Key and Value.",
		);
	}

	// -- nodes that became pure --------------------------------------------
	const splicedByDef = new Map<string, number>();
	for (const node of script.nodes) {
		if (!(node.def in BECAME_PURE)) continue;

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
		splicedByDef.set(node.def, (splicedByDef.get(node.def) ?? 0) + 1);
	}
	for (const [def, count] of splicedByDef) {
		notes.push(
			`${count} ${BECAME_PURE[def]} node${count === 1 ? " is" : "s are"} now pure; ` +
				"the execution wires around them were joined up.",
		);
	}

	if (script.schemaVersion < SCHEMA_VERSION) {
		notes.push(`Updated from schema ${script.schemaVersion} to ${SCHEMA_VERSION}.`);
		script.schemaVersion = SCHEMA_VERSION;
	}

	// -- functions opened into their own graphs -----------------------------
	//
	// Needs the registry to walk execution wires, so only a caller that has one
	// does it. The daemon does, and is the only reader of a file on disk.
	if (registry) {
		const graphs = assignMembership(script, registry);
		if (graphs.moved > 0) {
			notes.push(
				`${graphs.moved} function${graphs.moved === 1 ? " now opens in its" : "s now open in their"} own graph.`,
			);
		}
		if (graphs.crossings > 0) {
			notes.push(
				`${graphs.crossings} wire${graphs.crossings === 1 ? " crosses" : "s cross"} between graphs, and ` +
				`${graphs.crossings === 1 ? "is" : "are"} marked as an error.`,
			);
		}
		return { script: graphs.script, notes };
	}

	return { script, notes };
}
