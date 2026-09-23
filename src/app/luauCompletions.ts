/**
 * Autocomplete for the Custom Code editor.
 *
 * Two sources, and the second is the one that matters: Luau's own globals and
 * libraries, and the names *this graph* will have put in scope by the time the
 * code runs — its variables, its functions, the services it hoists, the modules
 * it requires. Those are invisible from inside the box otherwise, and guessing
 * at them is how a Custom Code node ends up referring to something that is not
 * there.
 */

import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import type { NodeScript, Target } from "../core/schema.js";
import {
	continuesEnclosingBlock, resolveNodePins, type Registry, type Signature,
} from "../core/nodes/index.js";
import { localNameOf } from "../core/nodes/variables.js";
import { toIdentifier } from "../core/compiler/luau.js";
import { localsAt, topLevelLocals, type LocalKind } from "../core/luau/scope.js";
import { ROBLOX_SERVICES, lastSegment } from "../core/roblox.js";
import { propertiesOf } from "../core/robloxProperties.js";
import { classOfGlobal, dotKeys, heldBy, methodsOf } from "../core/luau/infer.js";
import { DATATYPE_STATICS } from "../core/robloxStatics.js";
import {
	CLASSES as ROBLOX_CLASSES, DATATYPES as ENGINE_DATATYPES, LIBRARIES, LUAU_GLOBALS, ROBLOX_GLOBALS,
} from "../core/robloxData.js";
import { surfacesIn } from "./edits.js";

/** Members of the standard libraries, for completion after a dot. */
const LIBRARY_MEMBERS: Record<string, string[]> = {
	math: [
		"abs", "acos", "asin", "atan", "atan2", "ceil", "clamp", "cos", "cosh",
		"deg", "exp", "floor", "fmod", "frexp", "huge", "ldexp", "log", "log10",
		"max", "min", "modf", "noise", "pi", "pow", "rad", "random", "randomseed",
		"round", "sign", "sin", "sinh", "sqrt", "tan", "tanh",
	],
	string: [
		"byte", "char", "find", "format", "gmatch", "gsub", "len", "lower",
		"match", "pack", "packsize", "rep", "reverse", "split", "sub", "unpack",
		"upper",
	],
	table: [
		"clear", "clone", "concat", "create", "find", "freeze", "insert",
		"isfrozen", "move", "pack", "remove", "sort", "unpack",
	],
	task: ["cancel", "defer", "delay", "desynchronize", "spawn", "synchronize", "wait"],
	os: ["clock", "date", "difftime", "time"],
	coroutine: ["close", "create", "isyieldable", "resume", "running", "status", "wrap", "yield"],
	utf8: ["char", "charpattern", "codepoint", "codes", "len", "nfdnormalize", "offset"],
	debug: ["info", "profilebegin", "profileend", "traceback"],
	game: ["GetService", "GetChildren", "FindFirstChild", "WaitForChild", "Workspace", "Players"],
	script: ["Parent", "Name", "GetChildren", "FindFirstChild", "WaitForChild"],
	workspace: ["CurrentCamera", "GetChildren", "FindFirstChild", "WaitForChild", "Raycast"],
};

const KEYWORDS = [
	"and", "break", "continue", "do", "else", "elseif", "end", "export", "false",
	"for", "function", "if", "in", "local", "nil", "not", "or", "repeat",
	"return", "then", "true", "type", "until", "while",
];

/**
 * What is in scope before this graph has put anything there.
 *
 * The engine's own lists, plus the datatypes — `Vector3`, `TweenInfo` — which
 * are globals in the sense that matters here: names you can type into Custom
 * Code and have work. `Enum` is among the datatypes, so it needs no mention of
 * its own.
 *
 * Hand-maintaining this was fine while it was thirty-nine names and wrong in
 * the way a hand-maintained list is: `buffer` and `vector` were libraries it
 * knew, `bit32` was one it did not.
 */
const GLOBALS = [...new Set([
	...LUAU_GLOBALS, ...ROBLOX_GLOBALS, ...LIBRARIES, ...ENGINE_DATATYPES,
])].sort((a, b) => a.localeCompare(b));

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

	for (const variable of script.variables ?? []) {
		add(variable.name, "variable", `${variable.type} · script variable`);
	}

	for (const node of script.nodes) {
		const config = (node.config ?? {}) as Record<string, unknown>;
		switch (node.def) {
			case "function.entry":
			case "function.declareHere":
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
				const derived = path && (path.t === "string" || path.t === "raw")
					? lastSegment(path.v)
					: "";
				if (explicit || derived) add(explicit || derived, "namespace", "required module");
				break;
			}
		}
	}

	return out;
}

const KEYWORD_COMPLETIONS: Completion[] = KEYWORDS.map((label) => ({
	label, type: "keyword",
}));

const GLOBAL_COMPLETIONS: Completion[] = GLOBALS.map((label) => ({
	label, type: LIBRARY_MEMBERS[label] ? "namespace" : "variable", detail: "Luau",
}));

/** How a name in scope in the code itself is described in the list. */
const LOCAL_DETAIL: Record<LocalKind, string> = {
	local: "local here",
	function: "local function here",
	parameter: "parameter",
	"loop variable": "loop variable",
};

/** Calls whose first argument, as a string, is a class name — or a service's. */
const CLASS_STRING =
	/(Instance\.new|:IsA|:FindFirstChildOfClass|:FindFirstChildWhichIsA|:FindFirstAncestorOfClass|:FindFirstAncestorWhichIsA|:GetService)\s*\(\s*["']([A-Za-z0-9_]*)$/;

/**
 * A type position: after `::`, or after a name and a colon with a space on
 * either side — `local x: Part`, `local x : Part`, `(hit: BasePart)`. A method
 * call, `part:Clone()`, has no space around its colon.
 */
const TYPE_POSITION = /(?:::\s*|\w\s*:\s+|\w\s+:\s*)([A-Za-z_]\w*)?$/;

const LUAU_TYPE_NAMES = [
	"any", "boolean", "buffer", "never", "nil", "number", "string", "thread", "unknown", "vector",
];

/**
 * Builds the completion source. Members — after a dot or in brackets — are
 * offered only where they are actually known: a library's, a datatype's
 * constructors and constants, or those of a local whose declaration says what
 * it holds. Guessing at what a value holds would be worse than staying quiet.
 */
export function luauCompletionSource(
	getScope: () => Completion[], getTarget: () => Target = () => "roblox",
) {
	return (context: CompletionContext): CompletionResult | null => {
		// Roblox's classes and datatypes are there only when the graph compiles
		// for Roblox; a Lune graph reaches its datatypes through @lune/roblox.
		const roblox = getTarget() !== "lune";

		// A class name inside the string it is given as: `Instance.new("Pa`.
		const quoted = roblox ? context.matchBefore(CLASS_STRING) : null;
		if (quoted) {
			const [, call, typed] = CLASS_STRING.exec(quoted.text)!;
			const names = call === ":GetService" ? ROBLOX_SERVICES : ROBLOX_CLASSES;
			return {
				from: quoted.to - typed.length,
				options: names.map((label) => ({ label, type: "class" })),
				validFor: /^\w*$/,
			};
		}

		// A key in brackets: `tbl["A` offers the keys inside the string,
		// `tbl[` offers them quoted. Brackets reach every string key, not only
		// the ones a dot can, and a class's properties the same way.
		const bracket = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(["']?)([^"'\]]*)$/);
		if (bracket) {
			const [, owner, quote, typed] = /([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(["']?)([^"'\]]*)$/.exec(bracket.text)!;
			const local = localsAt(context.state.doc.toString(), bracket.from).find((n) => n.name === owner);
			if (local) {
				const held = heldBy(local.typeText, local.value);
				const keys = held.className && roblox
					? propertiesOf(held.className).map((p) => p.name)
					: held.keys ?? [];
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

		const member = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\.\w*$/);
		if (member) {
			const owner = /^([A-Za-z_][A-Za-z0-9_]*)\./.exec(member.text)?.[1] ?? "";
			const from = member.from + owner.length + 1;

			// A local of the code's own, whose declaration says what it holds:
			// `local part: Part` or `= Instance.new("Part")` offers a Part's
			// properties, `local scores = { Anne = 500 }` offers `Anne`. A local
			// hides a library or datatype of the same name, as it does in Luau.
			const local = localsAt(context.state.doc.toString(), member.from)
				.find((n) => n.name === owner);
			if (local) {
				const held = heldBy(local.typeText, local.value);
				const options = held.className && roblox
					? propertiesOf(held.className).map((p) => ({
						label: p.name, type: "property", detail: p.enum ?? p.type ?? "",
					}))
					: dotKeys(held).map((key) => ({ label: key, type: "property", detail: "key" }));
				return options.length > 0 ? { from, options, validFor: /^\w*$/ } : null;
			}
			const members = LIBRARY_MEMBERS[owner] ?? [];
			// A datatype's own name reaches its constructors and constants:
			// `Instance.new`, `Vector3.zero`. `Instance` is a class as well, and
			// its members are reached from an instance, not from the name.
			const statics = roblox ? DATATYPE_STATICS[owner] ?? [] : [];
			if (members.length === 0 && statics.length === 0) return null;
			return {
				from,
				options: [
					...statics.map((item) => ({
						label: item.name,
						type: item.kind === "constant" ? "constant" : "function",
						detail: item.detail,
						info: item.summary,
					})),
					...members.map((label) => ({ label, type: "method", detail: owner })),
				],
				validFor: /^\w*$/,
			};
		}

		// A method after a colon: `existing:Is` offers Instance's methods, and
		// every class's own above whatever the owner holds. The owner is a local
		// the code says holds a class, or a service reached by its name.
		const colon = roblox ? context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*):(\w*)$/) : null;
		if (colon) {
			const [, owner, written] = /([A-Za-z_][A-Za-z0-9_]*):(\w*)$/.exec(colon.text)!;
			const local = localsAt(context.state.doc.toString(), colon.from).find((n) => n.name === owner);
			const className = local ? heldBy(local.typeText, local.value).className : classOfGlobal(owner);
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
					...(roblox ? [...ROBLOX_CLASSES, ...ENGINE_DATATYPES] : [])
						.map((label) => ({ label, type: "class" })),
				],
				validFor: /^\w*$/,
			};
		}

		const word = context.matchBefore(/[A-Za-z_]\w*$/);
		if (!word && !context.explicit) return null;

		// What this code itself has in scope at the cursor — its own locals,
		// the parameters and loop variables around it — ahead of the graph's.
		const here = localsAt(context.state.doc.toString(), word ? word.from : context.pos)
			.map((n) => ({ label: n.name, type: "variable", detail: LOCAL_DETAIL[n.kind] }));

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
 * Locals declared by Custom Code blocks that run before this one.
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
	script: NodeScript | null, registry: Registry, nodeId: string | null,
): Completion[] {
	if (!script || !nodeId) return [];

	const execInputs = new Map<string, { node: string; pin: string }[]>();
	for (const link of script.links) {
		if (!isExecPin(script, registry, link.from.node, link.from.pin, "out")) continue;
		const list = execInputs.get(link.to.node);
		const entry = { node: link.from.node, pin: link.from.pin };
		if (list) list.push(entry);
		else execInputs.set(link.to.node, [entry]);
	}

	const out: Completion[] = [];
	const seen = new Set<string>();
	const visited = new Set<string>();

	const add = (name: string, detail: string) => {
		if (name === "" || seen.has(name)) return;
		seen.add(name);
		out.push({ label: name, type: "variable", detail });
	};

	const collectFrom = (id: string) => {
		const node = script.nodes.find((n) => n.id === id);
		if (!node) return;
		// A Declare Local makes a local exactly as one typed into Custom Code
		// does. Leaving it out is what made `restores` unreachable from a
		// function declared after it.
		if (node.def === "local.declare") {
			add(toIdentifier(localNameOf(node), "local"), "local from Declare Local");
			return;
		}
		if (!RAW_STATEMENT_NODES.has(node.def)) return;
		const literal = node.literals?.code;
		if (!literal || (literal.t !== "raw" && literal.t !== "string")) return;

		// Only what the block leaves in scope: its top-level locals. One declared
		// inside its `if` or loop is gone by the time the next block runs.
		for (const name of topLevelLocals(literal.v)) {
			add(name, `local from ${node.label || "an earlier Custom Code block"}`);
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
	if (self && registry.get(self.def)?.pure) {
		current = [...surfacesIn(script, registry, nodeId)][0] ?? null;
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
			params.forEach((param, i) => {
				add(toIdentifier(param.name || `arg${i + 1}`, `arg${i + 1}`), "parameter");
			});
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

function isExecPin(
	script: NodeScript, registry: Registry, nodeId: string, pinId: string, side: "in" | "out",
): boolean {
	const node = script.nodes.find((n) => n.id === nodeId);
	const def = node && registry.get(node.def);
	if (!node || !def) return false;
	const pins = resolveNodePins(def, node.config, node.literals);
	const list = side === "in" ? pins.inputs : pins.outputs;
	return list.find((p) => p.id === pinId)?.kind === "exec";
}
