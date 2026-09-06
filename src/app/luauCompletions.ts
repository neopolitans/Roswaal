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
import type { NodeScript } from "../core/schema.js";
import { continuesEnclosingBlock, resolveNodePins, type Registry } from "../core/nodes/index.js";
import { toIdentifier } from "../core/compiler/luau.js";
import { collectLocalNames } from "../core/luauLocals.js";
import { lastSegment } from "../core/roblox.js";

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

const GLOBALS = [
	"game", "workspace", "script", "shared", "Enum", "Instance", "Vector3",
	"Vector2", "CFrame", "Color3", "UDim2", "BrickColor", "Random", "TweenInfo",
	"task", "math", "string", "table", "os", "coroutine", "utf8", "buffer",
	"debug", "print", "warn", "error", "assert", "pcall", "xpcall", "select",
	"type", "typeof", "tostring", "tonumber", "pairs", "ipairs", "next",
	"setmetatable", "getmetatable", "require",
];

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

/**
 * Builds the completion source. Member completion after a dot is offered only
 * for libraries whose members are actually known — guessing at an instance's
 * properties would be worse than staying quiet.
 */
export function luauCompletionSource(getScope: () => Completion[]) {
	return (context: CompletionContext): CompletionResult | null => {
		const member = context.matchBefore(/([A-Za-z_][A-Za-z0-9_]*)\.\w*$/);
		if (member) {
			const owner = /^([A-Za-z_][A-Za-z0-9_]*)\./.exec(member.text)?.[1] ?? "";
			const members = LIBRARY_MEMBERS[owner];
			if (!members) return null;
			return {
				from: member.from + owner.length + 1,
				options: members.map((label) => ({ label, type: "method", detail: owner })),
				validFor: /^\w*$/,
			};
		}

		const word = context.matchBefore(/[A-Za-z_]\w*$/);
		if (!word && !context.explicit) return null;

		return {
			from: word ? word.from : context.pos,
			options: [...getScope(), ...GLOBAL_COMPLETIONS, ...KEYWORD_COMPLETIONS],
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

	const collectFrom = (id: string) => {
		const node = script.nodes.find((n) => n.id === id);
		if (!node || !RAW_STATEMENT_NODES.has(node.def)) return;
		const literal = node.literals?.code;
		if (!literal || (literal.t !== "raw" && literal.t !== "string")) return;

		for (const name of collectLocalNames(literal.v)) {
			if (seen.has(name)) continue;
			seen.add(name);
			out.push({
				label: name,
				type: "variable",
				detail: `local from ${node.label || "an earlier Custom Code block"}`,
			});
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

	// Backwards from the node being edited.
	let current: string | null = nodeId;
	const guard = new Set<string>();

	while (current && !guard.has(current)) {
		guard.add(current);
		const incoming: { node: string; pin: string }[] = execInputs.get(current) ?? [];
		const previous: { node: string; pin: string } | undefined = incoming[0];
		if (!previous) break;

		const node = script.nodes.find((n) => n.id === previous.node);

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
	const pins = resolveNodePins(def, node.config);
	const list = side === "in" ? pins.inputs : pins.outputs;
	return list.find((p) => p.id === pinId)?.kind === "exec";
}
