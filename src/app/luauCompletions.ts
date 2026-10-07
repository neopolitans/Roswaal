/**
 * Autocomplete for the Code Block editor.
 *
 * Two sources, and the second is the one that matters: Luau's own globals and
 * libraries, and the names *this graph* will have put in scope by the time the
 * code runs — its variables, its functions, the services it hoists, the modules
 * it requires. Those are invisible from inside the box otherwise, and guessing
 * at them is how a Code Block node ends up referring to something that is not
 * there.
 */

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { toIdentifier } from "../core/compiler/luau.js";
import { isCreatable } from "../core/creatable.js";
import {
	classCallBefore,
	classOfGlobal,
	dotKeys,
	eventsOf,
	type FunctionSignature,
	formatSignature,
	heldBy,
	membersInCode,
	methodsOf,
	type TableMember,
} from "../core/luau/infer.js";
import type { KnownInstance } from "../core/luau/instanceReference.js";
import { childrenOfChain, type InstanceNode, instanceLocalsAt } from "../core/luau/instances.js";
import { CONTEXTUAL_WORDS, RESERVED_WORDS, significant, tokenize } from "../core/luau/lexer.js";
import { type LocalKind, localsAt, topLevelLocals } from "../core/luau/scope.js";
import { namedResultRef } from "../core/namedResults.js";
import { FUNCTION_NODES, isMethod, loopNamesOf, loopTypes, RECEIVER } from "../core/nodes/flow.js";
import {
	continuesEnclosingBlock,
	type Registry,
	resolveNodePins,
	type Signature,
} from "../core/nodes/index.js";
import { localNameOf } from "../core/nodes/variables.js";
import { isService, lastSegment, ROBLOX_SERVICES } from "../core/roblox.js";
import {
	DATATYPES as ENGINE_DATATYPES,
	LIBRARIES,
	LUAU_GLOBALS,
	CLASSES as ROBLOX_CLASSES,
	ROBLOX_GLOBALS,
} from "../core/robloxData.js";
import { ENGINE, signatureText } from "../core/robloxEngine.js";
import { nilableProperty } from "../core/robloxNilable.js";
import { propertiesOf } from "../core/robloxProperties.js";
import { DATATYPE_STATICS } from "../core/robloxStatics.js";
import type { NodeScript, Target } from "../core/schema.js";
import { surfacesIn } from "./edits.js";

/**
 * A standard library's functions and constants, for completion after its
 * dot: `math.clamp`, `bit32.band`, `buffer.readu8`, `vector.zero`. Read from
 * the engine catalogue, so a library Luau gains needs no list kept here.
 */
function libraryMembers(name: string): Completion[] {
	const library = ENGINE.libraries[name];
	if (!library) return [];
	const seen = new Set<string>();
	// `table.insert` and `debug.info` have several signatures: offered once.
	const once = (label: string) => {
		if (seen.has(label)) return false;
		seen.add(label);
		return true;
	};
	return [
		...library.functions
			.filter((f) => !f.deprecated && once(f.name))
			.map((f) => ({
				label: f.name,
				type: "function",
				detail: `${signatureText(f.params)}${f.returns ? ` → ${f.returns}` : ""}`,
				info: f.summary,
			})),
		...library.properties
			.filter((p) => !p.deprecated && once(p.name))
			.map((p) => ({
				label: p.name,
				type: "constant",
				detail: p.type,
				info: p.summary,
			})),
	];
}

/** A class's properties and events, as a dot reaches them: `part.Touched:Connect(…)` reads an event with a dot too. */
function classMembers(className: string): Completion[] {
	return [
		...propertiesOf(className).map((p) => ({
			label: p.name,
			type: "property",
			detail: p.enum ?? `${p.type ?? ""}${nilableProperty(className, p.name) ? "?" : ""}`,
		})),
		...eventsOf(className).map((e) => ({
			label: e.name,
			type: "event",
			detail: `event${signatureText(e.params)}`,
			info: e.summary,
		})),
	];
}

/**
 * What the graph knows a name in scope holds: its type as written, and the
 * fields of that type when the graph declares it as a table.
 *
 * Code typed into a node reads the graph's locals by name — a named result, a
 * Declare Local, a parameter, a loop variable, a script variable — and none of
 * those is declared in the code, so the code alone cannot say what `hull.`
 * should offer. The graph can.
 */
export interface GraphType {
	type: string;
	fields?: string[];
}

export type GraphTypes = ReadonlyMap<string, GraphType>;

/** `BasePart?` → `BasePart`; `(Vector3)` → `Vector3`. */
function bareType(text: string): string {
	return text
		.trim()
		.replace(/^\((.*)\)$/, "$1")
		.replace(/\?$/, "")
		.trim();
}

/** The engine's datatype a type names, when it names one: `Vector3`, `CFrame`. */
function datatypeOf(text: string): string | undefined {
	const bare = bareType(text);
	return ENGINE.datatypes[bare] && bare !== "Enum" ? bare : undefined;
}

/** What a dot reaches on a value of a graph-known type. */
function typedDotMembers(held: GraphType, roblox: boolean): Completion[] {
	const className = roblox ? heldBy(held.type, undefined).className : undefined;
	if (className) return classMembers(className);
	const datatype = roblox ? datatypeOf(held.type) : undefined;
	if (datatype) {
		return ENGINE.datatypes[datatype].properties
			.filter((p) => !p.deprecated)
			.map((p) => ({ label: p.name, type: "property", detail: p.type, info: p.summary }));
	}
	return (held.fields ?? []).map((name) => ({ label: name, type: "property", detail: "field" }));
}

/**
 * The type a member of a value of `type` holds: a class's property or event,
 * or a datatype's property. `Position` on a BasePart is a Vector3; `Touched`
 * is an RBXScriptSignal. Undefined when the type does not say.
 */
function memberTypeOf(type: string, name: string): string | undefined {
	const className = heldBy(type, undefined).className;
	if (className) {
		const property = propertiesOf(className).find((p) => p.name === name);
		if (property?.type) return bareType(property.type);
		return eventsOf(className).some((e) => e.name === name) ? "RBXScriptSignal" : undefined;
	}
	const datatype = datatypeOf(type);
	const property = datatype
		? ENGINE.datatypes[datatype].properties.find((p) => p.name === name)
		: undefined;
	return property?.type ? bareType(property.type) : undefined;
}

/**
 * What a dotted path holds, followed from its first name: `hull.Position` is
 * a Vector3 because `hull` is a BasePart. The first name is a local of the
 * code's, then one of the graph's, then a global instance; each step after it
 * is a member's type or, failing that, a child instance the project knows,
 * so `workspace.Platforms.Lift.Position` reaches a Vector3 through the place.
 * Any step that cannot be followed ends it, and nothing is offered.
 */
function typeOfPath(
	path: readonly string[],
	doc: string,
	pos: number,
	types: GraphTypes,
	instances: { root: InstanceNode; self?: string[] } | null,
): string | undefined {
	const [root, ...rest] = path;
	const local = localsAt(doc, pos).find((n) => n.name === root);
	let type: string | undefined;
	if (local) {
		type =
			heldBy(local.typeText, local.value).className ??
			(local.typeText ? bareType(local.typeText) : undefined);
	} else {
		type =
			types.get(root)?.type ??
			classOfGlobal(root) ??
			(root === "script" ? "LuaSourceContainer" : undefined);
	}
	for (const [i, name] of rest.entries()) {
		if (type === undefined) return undefined;
		type =
			memberTypeOf(type, name) ??
			(instances ? instanceClassOfChain(doc, pos, path.slice(0, i + 2), instances) : undefined);
	}
	return type;
}

/** `a.b.c.` or `a.b.c:`, then the name being typed: a path of at least two names. */
const MEMBER_PATH = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)([.:])(\w*)$/;

/** What a colon reaches on a value of a graph-known type: its methods. */
function typedColonMembers(held: GraphType): Completion[] {
	const className = heldBy(held.type, undefined).className;
	if (className) {
		return methodsOf(className).map((m) => ({
			label: m.name,
			type: "method",
			detail: `${m.detail}${m.returns ? ` → ${m.returns}` : ""}`,
			info: m.summary,
		}));
	}
	const datatype = datatypeOf(held.type);
	if (!datatype) return [];
	const seen = new Set<string>();
	return ENGINE.datatypes[datatype].methods
		.filter((m) => !m.deprecated && !seen.has(m.name) && seen.add(m.name))
		.map((m) => ({
			label: m.name,
			type: "method",
			detail: `${signatureText(m.params)}${m.returns ? ` → ${m.returns}` : ""}`,
			info: m.summary,
		}));
}

/**
 * What is in scope before this graph has put anything there.
 *
 * The engine's own lists, plus the datatypes — `Vector3`, `TweenInfo` — which
 * are globals in the sense that matters here: names you can type into a Code
 * Block and have work. `Enum` is among the datatypes, so it needs no mention of
 * its own.
 *
 * Hand-maintaining this was fine while it was thirty-nine names and wrong in
 * the way a hand-maintained list is: `buffer` and `vector` were libraries it
 * knew, `bit32` was one it did not.
 */
const GLOBALS = [
	...new Set([...LUAU_GLOBALS, ...ROBLOX_GLOBALS, ...LIBRARIES, ...ENGINE_DATATYPES]),
].sort((a, b) => a.localeCompare(b));

/**
 * Names the generated file will have in scope around this node.
 *
 * Mirrors what the emitter does: variables become file-level locals, functions
 * become named locals, and Get Service / Require Module hoist to the top. The
 * names are derived the same way so completion offers what will actually exist.
 */
export function scopeCompletions(script: NodeScript | null): Completion[] {
	if (!script) return [];
	const out: Completion[] = [];
	const seen = new Set<string>();

	const add = (label: string, type: string, detail: string) => {
		const name = toIdentifier(label, "value");
		if (name === "" || seen.has(name)) return;
		seen.add(name);
		out.push({ label: name, type, detail });
	};

	// Declared first in the file, so first here: the services, then the modules.
	for (const service of script.services ?? []) add(service, "class", "declared service");
	for (const module of script.modules ?? []) {
		if (module.specifier.trim() !== "" && module.name.trim() !== "")
			add(module.name, "namespace", "declared module");
	}
	for (const variable of script.variables ?? []) {
		add(variable.name, "variable", `${variable.type} · script variable`);
	}

	for (const node of script.nodes) {
		const config = (node.config ?? {}) as Record<string, unknown>;
		switch (node.def) {
			case "function.entry":
			case "function.declareHere":
				// One declared on a table is `Table.name`, not a name in scope on
				// its own; `graphTableMembers` offers it after the table's dot.
				if (script.links.some((l) => l.to.node === node.id && l.to.pin === "owner")) break;
				add(String(config.name ?? "fn"), "function", "function in this graph");
				break;
			case "roblox.getService": {
				const service = node.literals?.service;
				if (service && (service.t === "string" || service.t === "raw")) {
					add(service.v, "class", "hoisted service");
				}
				break;
			}
			case "module.requirePath": {
				const as = node.literals?.as;
				const path = node.literals?.path;
				const explicit = as && (as.t === "string" || as.t === "raw") ? as.v.trim() : "";
				const derived =
					path && (path.t === "string" || path.t === "raw") ? lastSegment(path.v) : "";
				if (explicit || derived) add(explicit || derived, "namespace", "required module");
				break;
			}
		}
	}

	return out;
}

/**
 * The functions a graph declares on its tables, by table name.
 *
 * A Declare Function whose On Table is wired from a variable becomes
 * `function Occupancy.show(…)` in the file; Code Block in that graph can
 * call it, so `Occupancy.` offers it, with the parameters the node declares.
 */
export function graphTableMembers(script: NodeScript | null): Map<string, TableMember[]> {
	const out = new Map<string, TableMember[]>();
	if (!script) return out;
	for (const node of script.nodes) {
		if (!FUNCTION_NODES.has(node.def)) continue;
		const link = script.links.find((l) => l.to.node === node.id && l.to.pin === "owner");
		const source = link && script.nodes.find((n) => n.id === link.from.node);
		if (!source || source.def !== "variable.get") continue;
		const variableId = (source.config as { variable?: string } | undefined)?.variable;
		const table = script.variables?.find((v) => v.id === variableId)?.name;
		const config = (node.config ?? {}) as {
			name?: string;
			params?: { name: string; type?: string }[];
			returns?: { name: string; type?: string }[];
		};
		if (!table || !config.name) continue;
		const signature: FunctionSignature = {
			params: (config.params ?? []).map((p) =>
				p.type ? { name: p.name, type: p.type } : { name: p.name },
			),
			returns: (config.returns ?? []).map((r) => r.type || "any").join(", "),
		};
		const list = out.get(table) ?? [];
		list.push({
			name: config.name,
			kind: "function",
			detail: formatSignature(signature),
			signature,
		});
		out.set(table, list);
	}
	return out;
}

/** Luau's keywords, the contextual ones -- `continue`, `export type` -- among them. */
const KEYWORD_COMPLETIONS: Completion[] = [...RESERVED_WORDS, ...CONTEXTUAL_WORDS]
	.sort((a, b) => a.localeCompare(b))
	.map((label) => ({ label, type: "keyword" }));

const GLOBAL_COMPLETIONS: Completion[] = GLOBALS.map((label) => ({
	label,
	type: ENGINE.libraries[label] ? "namespace" : "variable",
	detail: "Luau",
}));

/** How a name in scope in the code itself is described in the list. */
const LOCAL_DETAIL: Record<LocalKind, string> = {
	local: "local here",
	function: "local function here",
	parameter: "parameter",
	"loop variable": "loop variable",
};

/**
 * A type position: after `::`, or after a name and a colon with a space on
 * either side — `local x: Part`, `local x : Part`, `(hit: BasePart)`. A method
 * call, `part:Clone()`, has no space around its colon.
 */
const TYPE_POSITION = /(?:::\s*|\w\s*:\s+|\w\s+:\s*)([A-Za-z_]\w*)?$/;

/** `Enum.` or `Enum.Material.`, and what is typed after the last dot. */
const ENUM_PATH = /\bEnum\.(?:([A-Za-z_]\w*)\.)?(\w*)$/;

const LUAU_TYPE_NAMES = [
	"any",
	"boolean",
	"buffer",
	"never",
	"nil",
	"number",
	"string",
	"thread",
	"unknown",
	"vector",
];

/**
 * Builds the completion source. Members — after a dot or in brackets — are
 * offered only where they are actually known: a library's, a datatype's
 * constructors and constants, or those of a local whose declaration says what
 * it holds. Guessing at what a value holds would be worse than staying quiet.
 */
export function luauCompletionSource(
	getScope: () => Completion[],
	getTarget: () => Target = () => "roblox",
	getMembers: () => ReadonlyMap<string, TableMember[]> = () => new Map(),
	getInstances: () => { root: InstanceNode; self?: string[] } | null = () => null,
	getTypes: () => GraphTypes = () => new Map(),
) {
	return (context: CompletionContext): CompletionResult | null => {
		// Roblox's classes and datatypes are there only when the graph compiles
		// for Roblox; a Lune graph reaches its datatypes through @lune/roblox.
		const roblox = getTarget() !== "lune";

		// A class name inside the string it is given as: `Instance.new("Pa`.
		// The call before the quote is read from the lexer's tokens, which
		// know a comment or a string from code; the call is not finished, so
		// there is no tree to read it from yet.
		const quoted = roblox ? context.matchBefore(/["'][A-Za-z0-9_]*$/) : null;
		const named = quoted
			? classCallBefore(
					significant(tokenize(context.state.doc.sliceString(0, quoted.from))).slice(0, -1),
				)
			: undefined;
		if (quoted && named) {
			const names =
				named === "service"
					? ROBLOX_SERVICES
					: named === "creatable"
						? ROBLOX_CLASSES.filter(isCreatable)
						: ROBLOX_CLASSES;
			return {
				from: quoted.from + 1,
				options: names.map((label) => ({ label, type: "class" })),
				validFor: /^\w*$/,
			};
		}

		// A key in brackets: `tbl["A` offers the keys inside the string,
		// `tbl[` offers them quoted. Brackets reach every string key, not only
		// the ones a dot can, and a class's properties the same way.
		const bracket = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(["']?)([^"'\]]*)$/);
		if (bracket) {
			const [, owner, quote, typed] = /([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(["']?)([^"'\]]*)$/.exec(
				bracket.text,
			)!;
			const local = localsAt(context.state.doc.toString(), bracket.from).find(
				(n) => n.name === owner,
			);
			const graphTyped = local ? undefined : getTypes().get(owner);
			if (local || graphTyped) {
				const held = local
					? heldBy(local.typeText, local.value)
					: heldBy(graphTyped?.type, undefined);
				const keys =
					held.className && roblox
						? propertiesOf(held.className).map((p) => p.name)
						: (held.keys ?? graphTyped?.fields ?? []);
				if (keys.length > 0) {
					return {
						from: bracket.to - typed.length,
						options: keys.map((key) => ({
							label: quote ? key : JSON.stringify(key),
							type: "property",
							detail: "key",
						})),
						validFor: quote ? /^[^"'\]]*$/ : /^["']?[^"'\]]*$/,
					};
				}
			}
			// Inside a quote there is nothing else to offer; outside one, `list[i`
			// goes on to the ordinary completion of `i`.
			if (quote) return null;
		}

		// `Enum.` offers the enums, and `Enum.Material.` that enum's items.
		const enumPath = roblox ? context.matchBefore(ENUM_PATH) : null;
		if (enumPath) {
			const [, enumName, written] = ENUM_PATH.exec(enumPath.text)!;
			const options = enumName
				? (ENGINE.enums[enumName]?.items ?? [])
						.filter((i) => !i.deprecated)
						.map((i) => ({ label: i.name, type: "enum", detail: String(i.value), info: i.summary }))
				: Object.entries(ENGINE.enums)
						.filter(([, e]) => !e.deprecated)
						.map(([name, e]) => ({ label: name, type: "enum", info: e.summary }));
			if (options.length > 0)
				return { from: enumPath.to - written.length, options, validFor: /^\w*$/ };
		}

		// An instance the project knows: `ReplicatedStorage.Shared.` offers
		// what is in Shared, in the place and the project's files, with the
		// class's own properties after them; `:WaitForChild("` its children.
		const instances = roblox ? getInstances() : null;
		if (instances) {
			const text = context.state.doc.toString();
			const waiting = context.matchBefore(INSTANCE_WAIT);
			if (waiting) {
				const [, chain, typed] = INSTANCE_WAIT.exec(waiting.text)!;
				const kids = childrenOfChain(
					text,
					waiting.from,
					chain.split("."),
					instances.root,
					instances.self,
				);
				if (kids.length > 0) {
					return {
						from: waiting.to - typed.length,
						options: kids.map((k) => ({ label: k.name, type: "class", detail: k.className })),
						validFor: /^[^"']*$/,
					};
				}
			}
			const dotted = context.matchBefore(INSTANCE_CHAIN);
			if (dotted) {
				const [, chain, typed] = INSTANCE_CHAIN.exec(dotted.text)!;
				const kids = childrenOfChain(
					text,
					dotted.from,
					chain.split("."),
					instances.root,
					instances.self,
				);
				if (kids.length > 0) {
					const className = instanceClassOfChain(text, dotted.from, chain.split("."), instances);
					const properties = className
						? propertiesOf(className).map((p) => ({
								label: p.name,
								type: "property",
								detail: p.enum ?? p.type ?? "",
							}))
						: [];
					return {
						from: dotted.to - typed.length,
						options: [
							...kids
								.filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k.name))
								.map((k) => ({ label: k.name, type: "class", detail: k.className, boost: 1 })),
							...properties,
						],
						validFor: /^\w*$/,
					};
				}
			}
		}

		// A member of a member: `hull.Position.` offers a Vector3's, however
		// long the path, as long as each step's type is known.
		const pathed = roblox ? context.matchBefore(MEMBER_PATH) : null;
		if (pathed) {
			const [, written, separator, typed] = MEMBER_PATH.exec(pathed.text)!;
			const type = typeOfPath(
				written.split("."),
				context.state.doc.toString(),
				pathed.from,
				getTypes(),
				instances,
			);
			if (type !== undefined) {
				const options =
					separator === "." ? typedDotMembers({ type }, roblox) : typedColonMembers({ type });
				if (options.length > 0) {
					return { from: pathed.to - typed.length, options, validFor: /^\w*$/ };
				}
			}
		}

		const member = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\.\w*$/);
		if (member) {
			const owner = /^([A-Za-z_][A-Za-z0-9_]*)\./.exec(member.text)?.[1] ?? "";
			const from = member.from + owner.length + 1;

			// A local of the code's own, whose declaration says what it holds:
			// `local part: Part` or `= Instance.new("Part")` offers a Part's
			// properties, `local scores = { Anne = 500 }` offers `Anne`. A local
			// hides a library or datatype of the same name, as it does in Luau.
			const doc = context.state.doc.toString();
			const local = localsAt(doc, member.from).find((n) => n.name === owner);

			// Functions and fields put on a table: by the code — `function
			// Occupancy.value(…)` — or by the graph, whose Declare Functions are
			// wired onto a table variable. A module's exports are these.
			const onTable = [
				...membersInCode(doc, owner),
				...(local ? [] : (getMembers().get(owner) ?? [])),
			]
				.filter((m, i, all) => all.findIndex((n) => n.name === m.name) === i && m.kind !== "method")
				.map((m) => ({
					label: m.name,
					type: m.kind === "field" ? "property" : "function",
					detail: m.detail,
				}));

			if (local) {
				const held = heldBy(local.typeText, local.value);
				const options =
					held.className && roblox
						? classMembers(held.className)
						: [
								...dotKeys(held).map((key) => ({ label: key, type: "property", detail: "key" })),
								...onTable.filter((m) => !dotKeys(held).includes(m.label)),
							];
				return options.length > 0 ? { from, options, validFor: /^\w*$/ } : null;
			}
			// A name the graph declares and knows the type of: a named result, a
			// typed Declare Local, parameter, loop variable or script variable.
			const graphTyped = getTypes().get(owner);
			if (graphTyped) {
				const typed = typedDotMembers(graphTyped, roblox);
				const options = [
					...typed,
					...onTable.filter((m) => !typed.some((t) => t.label === m.label)),
				];
				if (options.length > 0) return { from, options, validFor: /^\w*$/ };
			}
			if (onTable.length > 0) return { from, options: onTable, validFor: /^\w*$/ };
			// `game.`, `workspace.` and `script.` are instances: their class's
			// properties and events, as a local holding one offers.
			const globalClass = roblox
				? (classOfGlobal(owner) ?? (owner === "script" ? "LuaSourceContainer" : undefined))
				: undefined;
			if (globalClass) return { from, options: classMembers(globalClass), validFor: /^\w*$/ };
			// A datatype's own name reaches its constructors and constants:
			// `Instance.new`, `Vector3.zero`. `Instance` is a class as well, and
			// its members are reached from an instance, not from the name.
			const statics = roblox ? (DATATYPE_STATICS[owner] ?? []) : [];
			const options = [
				...statics.map((item) => ({
					label: item.name,
					type: item.kind === "constant" ? "constant" : "function",
					detail: item.detail,
					info: item.summary,
				})),
				...libraryMembers(owner),
			];
			return options.length > 0 ? { from, options, validFor: /^\w*$/ } : null;
		}

		// A method after a colon: `existing:Is` offers Instance's methods, and
		// every class's own above whatever the owner holds. The owner is a local
		// the code says holds a class, or a service reached by its name.
		const colon = roblox ? context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*):(\w*)$/) : null;
		if (colon) {
			const [, owner, written] = /([A-Za-z_][A-Za-z0-9_]*):(\w*)$/.exec(colon.text)!;
			const local = localsAt(context.state.doc.toString(), colon.from).find(
				(n) => n.name === owner,
			);
			const graphTyped = local ? undefined : getTypes().get(owner);
			if (graphTyped) {
				const options = typedColonMembers(graphTyped);
				if (options.length > 0) {
					return { from: colon.to - written.length, options, validFor: /^\w*$/ };
				}
			}
			const className = local
				? heldBy(local.typeText, local.value).className
				: classOfGlobal(owner);
			const methods = className ? methodsOf(className) : [];
			if (methods.length > 0) {
				return {
					from: colon.to - written.length,
					options: methods.map((m) => ({
						label: m.name,
						type: "method",
						detail: `${m.detail}${m.returns ? ` → ${m.returns}` : ""}`,
						info: m.summary,
					})),
					validFor: /^\w*$/,
				};
			}
		}

		// A type: Luau's own, and Roblox's classes and datatypes.
		const typePosition = context.matchBefore(TYPE_POSITION);
		if (typePosition) {
			const written = /([A-Za-z_]\w*)?$/.exec(typePosition.text)?.[1] ?? "";
			return {
				from: typePosition.to - written.length,
				options: [
					...LUAU_TYPE_NAMES.map((label) => ({ label, type: "type" })),
					...(roblox ? [...ROBLOX_CLASSES, ...ENGINE_DATATYPES] : []).map((label) => ({
						label,
						type: "class",
					})),
				],
				validFor: /^\w*$/,
			};
		}

		const word = context.matchBefore(/[A-Za-z_]\w*$/);
		if (!word && !context.explicit) return null;

		// What this code itself has in scope at the cursor — its own locals,
		// the parameters and loop variables around it — ahead of the graph's.
		const here = localsAt(context.state.doc.toString(), word ? word.from : context.pos).map(
			(n) => ({ label: n.name, type: "variable", detail: LOCAL_DETAIL[n.kind] }),
		);

		return {
			from: word ? word.from : context.pos,
			// A name the code declares hides the graph's of the same name, as it
			// does in the file.
			options: [
				...here,
				...getScope().filter((c) => !here.some((h) => h.label === c.label)),
				...GLOBAL_COMPLETIONS,
				...KEYWORD_COMPLETIONS,
			],
			validFor: /^\w*$/,
		};
	};
}

// ---------------------------------------------------------------------------
// Locals from earlier hand-written blocks
// ---------------------------------------------------------------------------

/** Nodes whose raw text is emitted as statements, and so can declare locals. */
const RAW_STATEMENT_NODES = new Set(["code.custom"]);

/**
 * Locals declared by Code Blocks that run before this one.
 *
 * They are real locals in the generated file and genuinely in scope here, so
 * not offering them was the completion list lying by omission.
 *
 * Scope is worked out by walking execution wires backwards, which lands on
 * exactly the statements that ran before this one in this block or an
 * enclosing one — a sibling branch arm is never an ancestor, so its locals are
 * correctly not offered. Sequence is the exception worth handling: its outputs
 * all run into the *same* block, so an earlier output's locals are in scope in
 * a later one even though it is a sibling rather than an ancestor.
 */
export function precedingLocals(
	script: NodeScript | null,
	registry: Registry,
	nodeId: string | null,
): Completion[] {
	return collectPreceding(script, registry, nodeId).map(({ name, detail, provisional }) =>
		provisional
			? { label: name, type: "variable", detail: `${detail} · in scope once wired`, boost: -1 }
			: { label: name, type: "variable", detail },
	);
}

/**
 * What the graph knows each name in scope at a node holds, for member
 * completion: `hull.` on a named result typed BasePart offers a BasePart's
 * members, as `local hull: BasePart` typed into the code would.
 *
 * Script variables first, then the locals before the node, which hide a
 * variable of the same name as they do in the file. A type the graph declares
 * as a table brings its field names.
 */
export function graphLocalTypes(
	script: NodeScript | null,
	registry: Registry,
	nodeId: string | null,
): Map<string, GraphType> {
	const out = new Map<string, GraphType>();
	if (!script) return out;
	const fieldsOf = new Map<string, string[]>();
	for (const node of script.nodes) {
		if (node.def !== "type.declareTop" && node.def !== "type.declareHere") continue;
		const config = (node.config ?? {}) as { name?: unknown; fields?: unknown };
		if (typeof config.name !== "string" || !Array.isArray(config.fields)) continue;
		fieldsOf.set(
			config.name,
			config.fields.flatMap((f) =>
				typeof f === "object" && f !== null && typeof (f as { name?: unknown }).name === "string"
					? [(f as { name: string }).name]
					: [],
			),
		);
	}
	const typed = (type: string): GraphType => {
		const fields = fieldsOf.get(bareType(type));
		return fields ? { type, fields } : { type };
	};
	for (const variable of script.variables ?? []) {
		if (variable.type && variable.type !== "any") out.set(variable.name, typed(variable.type));
	}
	// Nearest first, so the first a name is met is the one in scope.
	const seen = new Set<string>();
	for (const local of collectPreceding(script, registry, nodeId)) {
		if (seen.has(local.name)) continue;
		seen.add(local.name);
		if (local.type && local.type !== "any") out.set(local.name, typed(local.type));
		else out.delete(local.name);
	}
	return out;
}

/** A name the graph has in scope before a node: what to call it, and what it holds if known. */
interface GraphLocal {
	name: string;
	detail: string;
	type?: string;
	/**
	 * Offered from a node not wired in yet, which has no place in the flow to
	 * be in scope at: a local somewhere in its graph, which it will see only if
	 * it is wired in after it.
	 */
	provisional?: boolean;
	/** The instance it holds, where the code that declared it says. */
	path?: string[];
}

/**
 * The names in scope at a node that hold an instance, for an instance dropped
 * into its code to start from: the top-level locals of the Code Blocks
 * before it, and the services the graph declares or its Get Service nodes hoist -- the
 * same names completion offers there. The code's own locals are the editor's
 * to add, nearest of all.
 */
export function graphInstanceLocals(
	script: NodeScript | null,
	registry: Registry,
	nodeId: string | null,
): KnownInstance[] {
	if (!script) return [];
	const out: KnownInstance[] = collectPreceding(script, registry, nodeId)
		.filter((local) => local.path !== undefined && !local.provisional)
		.map((local) => ({ name: local.name, path: local.path! }));
	const services = new Set((script.services ?? []).filter(isService));
	for (const node of script.nodes) {
		if (node.def !== "roblox.getService") continue;
		const service = node.literals?.service;
		if (service && (service.t === "string" || service.t === "raw") && isService(service.v))
			services.add(service.v);
	}
	for (const service of services)
		out.push({ name: toIdentifier(service, "value"), path: [service] });
	return out;
}

function collectPreceding(
	script: NodeScript | null,
	registry: Registry,
	nodeId: string | null,
): GraphLocal[] {
	if (!script || !nodeId) return [];

	const execInputs = new Map<string, { node: string; pin: string }[]>();
	for (const link of script.links) {
		if (!isExecPin(script, registry, link.from.node, link.from.pin, "out")) continue;
		const list = execInputs.get(link.to.node);
		const entry = { node: link.from.node, pin: link.from.pin };
		if (list) list.push(entry);
		else execInputs.set(link.to.node, [entry]);
	}

	const out: GraphLocal[] = [];
	const seen = new Set<string>();
	const visited = new Set<string>();

	const add = (name: string, detail: string, type?: string, path?: string[]) => {
		if (name === "" || seen.has(name)) return;
		seen.add(name);
		out.push({ name, detail, ...(type ? { type } : {}), ...(path ? { path } : {}) });
	};

	const collectFrom = (id: string) => {
		const node = script.nodes.find((n) => n.id === id);
		if (!node) return;
		// A Declare Local makes a local exactly as one typed into Code Block
		// does. Leaving it out is what made `restores` unreachable from a
		// function declared after it.
		if (node.def === "local.declare") {
			const type = (node.config as { type?: unknown } | undefined)?.type;
			add(
				toIdentifier(localNameOf(node), "local"),
				"local from Declare Local",
				typeof type === "string" ? type : undefined,
			);
			return;
		}
		// So does a step's named result: `local hull = need(...)`. Leaving it
		// out hid most of the locals in a converted module, whose calls name
		// their results rather than feeding a Declare Local.
		const named = namedResultRef(node, registry);
		if (named) {
			add(toIdentifier(named.name, "value"), `named result · ${named.type}`, named.type);
			return;
		}
		if (!RAW_STATEMENT_NODES.has(node.def)) return;
		const literal = node.literals?.code;
		if (!literal || (literal.t !== "raw" && literal.t !== "string")) return;

		// Only what the block leaves in scope: its top-level locals. One declared
		// inside its `if` or loop is gone by the time the next block runs.
		// And which of them hold an instance the block names, for a drop.
		const held = new Map(
			instanceLocalsAt(literal.v, literal.v.length).map((local) => [local.name, local.path]),
		);
		for (const name of topLevelLocals(literal.v)) {
			add(name, `local from ${node.label || "an earlier Code Block"}`, undefined, held.get(name));
		}
	};

	/**
	 * Everything reachable forwards from an execution output *without leaving
	 * this block*. A loop body, a branch arm and a connect handler are all
	 * nested blocks: their locals die at the matching `end`, so following those
	 * outputs would offer names that are not in scope where you are typing.
	 */
	const walkForward = (fromNode: string, fromPin: string) => {
		const queue = script.links
			.filter((l) => l.from.node === fromNode && l.from.pin === fromPin)
			.map((l) => l.to.node);

		while (queue.length) {
			const id = queue.pop()!;
			if (visited.has(id)) continue;
			visited.add(id);
			collectFrom(id);

			const node = script.nodes.find((n) => n.id === id);
			if (!node) continue;

			for (const link of script.links) {
				if (link.from.node !== id) continue;
				if (!isExecPin(script, registry, id, link.from.pin, "out")) continue;
				if (!continuesEnclosingBlock(node.def, link.from.pin)) continue;
				queue.push(link.to.node);
			}
		}
	};

	// Backwards from the node being edited. A Luau Expression has no execution
	// wire of its own: it is spliced into the first statement that reads it, so
	// that statement is where it runs and where its scope is.
	let current: string | null = nodeId;
	const self = script.nodes.find((n) => n.id === nodeId);
	const pure = self !== undefined && registry.get(self.def)?.pure === true;
	if (pure) {
		current = [...surfacesIn(script, registry, nodeId)][0] ?? null;
	}

	// Not wired in yet: no statement reads it, or nothing runs into it. There
	// is no place in the flow to work out scope from, so what its graph makes
	// visible anywhere comes first, and every other local drawn in that graph
	// after it, marked as needing the wire. Writing the expression first and
	// wiring it after is the usual order, and an empty list punished it.
	const placed = pure ? current !== null : (execInputs.get(nodeId)?.length ?? 0) > 0;
	if (self && !placed) {
		const owner = self.graph ? script.nodes.find((n) => n.id === self.graph) : undefined;
		if (owner && FUNCTION_NODES.has(owner.def)) {
			if (owner.def === "function.declareHere" && isMethod(owner.config)) {
				add(RECEIVER, "parameter · the method's table");
			}
			const params = (owner.config as Signature | undefined)?.params ?? [];
			params.forEach((param, i) => {
				add(toIdentifier(param.name || `arg${i + 1}`, `arg${i + 1}`), "parameter", param.type);
			});
		}
		const sure = out.length;
		for (const node of script.nodes) {
			if (node.id === nodeId || node.graph !== self.graph) continue;
			collectFrom(node.id);
			for (const loop of loopVariables(node)) add(loop.name, "loop variable", loop.type);
		}
		return out.map((local, i) => (i < sure ? local : { ...local, provisional: true }));
	}

	const guard = new Set<string>();

	while (current && !guard.has(current)) {
		guard.add(current);
		const incoming: { node: string; pin: string }[] = execInputs.get(current) ?? [];
		const previous: { node: string; pin: string } | undefined = incoming[0];
		if (!previous) break;

		const node = script.nodes.find((n) => n.id === previous.node);

		// Walked out of a block the node opened. When that node takes
		// parameters — a function, a Connect handler — they are locals here:
		// `character` inside `Occupancy.hide(character, hull)`.
		if (node && !continuesEnclosingBlock(node.def, previous.pin)) {
			const params = (node.config as Signature | undefined)?.params ?? [];
			if (node.def === "function.declareHere" && isMethod(node.config)) {
				add(RECEIVER, "parameter · the method's table");
			}
			params.forEach((param, i) => {
				add(toIdentifier(param.name || `arg${i + 1}`, `arg${i + 1}`), "parameter", param.type);
			});
			// A loop's variables, named and typed as the loop writes them.
			if (previous.pin === "body") {
				for (const loop of loopVariables(node)) add(loop.name, "loop variable", loop.type);
			}
		}

		// Reached a Sequence from one of its outputs: everything under the
		// earlier outputs ran first, in this same block.
		if (node?.def === "flow.sequence") {
			const index = Number(/^s(\d+)$/.exec(previous.pin)?.[1] ?? -1);
			for (let i = 0; i < index; i++) walkForward(previous.node, `s${i}`);
		}

		collectFrom(previous.node);
		current = previous.node;
	}

	return out;
}

/** What a loop node's body has in scope, as `emitFlow` names and types it. */
function loopVariables(node: NodeScript["nodes"][number]): { name: string; type?: string }[] {
	if (node.def === "flow.forRange") {
		return [{ name: toIdentifier(node.label || "i", "i"), type: "number" }];
	}
	if (node.def !== "flow.forEach" && node.def !== "flow.forIndex") return [];
	const names = loopNamesOf(node.config);
	const types = loopTypes(node.config ?? {});
	const array = node.def === "flow.forIndex";
	return [
		{
			name: toIdentifier(names.key ?? (array ? "i" : "key"), "key"),
			type: array ? "number" : types.key,
		},
		{ name: toIdentifier(names.value ?? "value", "value"), type: types.value },
	];
}

function isExecPin(
	script: NodeScript,
	registry: Registry,
	nodeId: string,
	pinId: string,
	side: "in" | "out",
): boolean {
	const node = script.nodes.find((n) => n.id === nodeId);
	const def = node && registry.get(node.def);
	if (!node || !def) return false;
	const pins = resolveNodePins(def, node.config, node.literals);
	const list = side === "in" ? pins.inputs : pins.outputs;
	return list.find((p) => p.id === pinId)?.kind === "exec";
}

/** `a.b.c.x`: a chain of names, then what is being typed after the last dot. */
const INSTANCE_CHAIN = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.(\w*)$/;

/** `a.b:WaitForChild("x`: a chain, then the name being typed in the string. */
const INSTANCE_WAIT =
	/([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*):(?:WaitForChild|FindFirstChild)\(\s*["']([^"']*)$/;

/** The class of the instance a chain ends at, for its properties. */
function instanceClassOfChain(
	text: string,
	pos: number,
	chain: string[],
	instances: { root: InstanceNode; self?: string[] },
): string | undefined {
	if (chain.length < 2) {
		// `ReplicatedStorage.`: the service itself, when the local names one.
		return chain[0] === "game" ? "DataModel" : undefined;
	}
	const holder = childrenOfChain(text, pos, chain.slice(0, -1), instances.root, instances.self);
	return holder.find((k) => k.name === chain[chain.length - 1])?.className;
}
