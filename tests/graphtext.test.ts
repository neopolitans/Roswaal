/**
 * Text in a graph file never becomes code the graph does not show.
 *
 * A `.nodescript` is JSON, and anybody can write one: by hand, in a zip, in a
 * repository, or by importing a `.luau`. Whatever text it holds reaches the
 * generated file through one of four doors -- a string, a comment, a name, or
 * a node that is code and shows itself as code -- and the first three must
 * hold whatever is put through them.
 *
 * So every text field of real graphs is given text that would run if it got
 * out -- a line break, a closing bracket, a call -- and the output is read
 * back with Roswaal's own lexer. The payload's call must never be a call.
 *
 * Text is not the only way in. A literal saved as a number can hold text, and
 * a node can be given a config key it did not have, so both are swept too.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { codeFaceOf } from "../src/core/codeFace.js";
import { bracketLevel, commentLines, oneLine } from "../src/core/comments.js";
import { compile } from "../src/core/compiler/index.js";
import { CURATED, GUIDE_SCENES } from "../src/core/docs/examples.js";
import { importLuau } from "../src/core/import/fromLuau.js";
import { tokenize } from "../src/core/luau/lexer.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { Literal, NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();
const MARK = "ESCAPED";

/** Text that would run if it got out of where it was put. */
const PAYLOADS = [
	(v: string) => `${v}\n${MARK}()\n`,
	(v: string) => `${v}\r${MARK}()`,
	(v: string) => `${v}]]${MARK}()--[[`,
	(v: string) => `${v}]=]${MARK}()--[=[`,
	(v: string) => `${v}"..${MARK}().."`,
	(v: string) => `${v}(${MARK}())`,
];

/** Nodes whose text is Luau by design, and drawn as Luau on the node. */
const CODE_NODES = new Set(["code.custom", "value.expression"]);

function graph(file: string): NodeScript {
	return JSON.parse(readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n"));
}

/** A graph from Luau, as Import as graph makes one. */
function imported(): NodeScript {
	const source = [
		"--- The player's score",
		'local Players = game:GetService("Players")',
		"local score: number = 0",
		"local function greet(name: string): string",
		'\treturn "hi " .. name',
		"end",
		"Players.PlayerAdded:Connect(function(player)",
		'\tif player.Name == "x" then print(greet(player.Name)) end',
		"end)",
	].join("\n");
	const result = importLuau(source, {
		name: "Imported",
		scriptClass: "Script",
		target: "roblox",
		idPrefix: "imp",
	});
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

/**
 * A module's functions called by name, results cast where they are made, under
 * doc-block comments: one over the nodes and one over the services, as an
 * import keeps them.
 */
function moduleCalls(): NodeScript {
	const b = new Builder("Main");
	const begin = b.node("script.begin");
	const rig = b.node("module.requirePath");
	b.lit(rig, "root", { t: "string", v: "ReplicatedStorage" });
	b.lit(rig, "path", { t: "string", v: "Tank.Rig" });
	const returns = [{ name: "r", type: "any" }];
	const field = b.node("function.call", {
		config: {
			module: rig,
			moduleName: "Rig",
			name: "resolve",
			params: [],
			returns,
			resultCast: "Model",
		},
	});
	const method = b.node("function.call", {
		config: { module: rig, moduleName: "Rig", name: "mount", method: true, params: [], returns },
	});
	const find = b.node("roblox.findFirstChild", { config: { resultCast: "BasePart" } });
	b.link(field, "result", find, "parent");
	b.lit(find, "name", { t: "string", v: "Hull" });
	const print = b.node("debug.print");
	b.link(find, "result", print, "value");
	b.link(begin, "then", field, "in");
	b.link(field, "then", method, "in");
	b.link(method, "then", print, "in");
	const script = b.build();
	script.comments = [
		{ id: "c1", x: -100, y: -100, w: 4000, h: 4000, text: "Mounts the rig.", style: "docBlock" },
		{
			id: "c2",
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			text: "Where it lives.",
			style: "docBlock",
			services: true,
		},
	];
	return script;
}

/** Declare Type's field list, and a fields-shaped one made before there was a list. */
function declaredTypes(): NodeScript {
	const b = new Builder("Types");
	b.node("script.begin");
	b.node("type.declareTop", {
		config: { name: "Speed", shape: "fields", fields: [{ name: "speed", type: "number" }] },
	});
	b.node("type.declareTop", {
		config: { name: "Old", shape: "fields", fields: [], definition: "{ old: boolean }" },
	});
	return b.build();
}

/**
 * One of each way a graph names something in the output: variables and their
 * descriptions, services and paths, a required module, a Lune call, and what
 * the importer writes.
 */
const CORPUS: [string, () => NodeScript][] = [
	[
		"the demo's Main",
		() => graph("examples/demo/.roswaal/scripts/ServerScriptService/Source/Main.nodescript"),
	],
	["a Lune demo", () => graph("examples/lune-demo/.roswaal/scripts/walk-a-directory.nodescript")],
	["Require Module", CURATED["module.requirePath"]],
	["a Service Function", GUIDE_SCENES.serviceCall],
	["an imported .luau", imported],
	["a module's functions", moduleCalls],
	["Declare Type", declaredTypes],
];

/** The payload ran: its marker is a name, and it is called. */
function escaped(code: string): boolean {
	const tokens = tokenize(code).filter((t) => t.kind !== "whitespace" && t.kind !== "comment");
	return tokens.some((t, i) => t.kind === "name" && t.text === MARK && tokens[i + 1]?.text === "(");
}

/** Every string in a graph, by its path, other than a code node's own config and a raw literal. */
function* textFields(
	value: unknown,
	path: (string | number)[] = [],
): Generator<(string | number)[]> {
	if (typeof value === "string") {
		yield path;
		return;
	}
	if (Array.isArray(value)) {
		for (const [i, item] of value.entries()) yield* textFields(item, [...path, i]);
		return;
	}
	if (value && typeof value === "object") {
		const fields = value as Record<string, unknown>;
		if (fields.t === "raw") return;
		const code = typeof fields.def === "string" && CODE_NODES.has(fields.def);
		for (const [key, item] of Object.entries(fields)) {
			if (code && key === "config") continue;
			yield* textFields(item, [...path, key]);
		}
	}
}

function withText(script: NodeScript, path: (string | number)[], text: string): NodeScript {
	const copy = structuredClone(script) as unknown as Record<string | number, unknown>;
	let at = copy;
	for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
	at[path[path.length - 1]] = text;
	return copy as unknown as NodeScript;
}

function textAt(script: NodeScript, path: (string | number)[]): string {
	return path.reduce<unknown>(
		(at, key) => (at as Record<string | number, unknown>)[key],
		script,
	) as string;
}

describe.each(CORPUS)("text in %s", (_name, make) => {
	it("never becomes code, whatever field it is put in", () => {
		const script = make();
		expect(escaped(compile(script, registry, { comments: true }).code)).toBe(false);
		const out: string[] = [];
		for (const path of textFields(script)) {
			for (const payload of PAYLOADS) {
				const changed = withText(script, path, payload(textAt(script, path)));
				let result: ReturnType<typeof compile>;
				try {
					result = compile(changed, registry, { comments: true });
				} catch {
					continue;
				}
				// A graph that does not compile writes nothing.
				if (result.ok && escaped(result.code))
					out.push(`${path.join(".")} ← ${JSON.stringify(payload(""))}`);
			}
		}
		expect(out).toEqual([]);
	});
});

/** Each literal and starting value in a graph, by a function that replaces it. */
function* literalSlots(script: NodeScript): Generator<(copy: NodeScript, to: Literal) => void> {
	for (const [i, node] of script.nodes.entries()) {
		for (const pin of Object.keys(node.literals ?? {})) {
			yield (copy, to) => {
				const literals = copy.nodes[i].literals;
				if (literals) literals[pin] = to;
			};
		}
	}
	for (const i of script.variables.keys()) {
		yield (copy, to) => {
			copy.variables[i].default = to;
		};
	}
}

describe.each(CORPUS)("what else %s holds", (_name, make) => {
	it("never becomes code when a literal holds text but says it is not text", () => {
		const script = make();
		const out: string[] = [];
		for (const replace of literalSlots(script)) {
			for (const t of ["number", "boolean", "nil", "made-up"]) {
				for (const payload of PAYLOADS) {
					const changed = structuredClone(script);
					replace(changed, { t, v: payload("0") } as unknown as Literal);
					const result = compile(changed, registry, { comments: true });
					if (result.ok && escaped(result.code)) out.push(`${t} ← ${JSON.stringify(payload("0"))}`);
				}
			}
		}
		expect(out).toEqual([]);
	});

	it("never becomes code through a cast added to any node", () => {
		const script = make();
		const out: string[] = [];
		for (const [i, node] of script.nodes.entries()) {
			for (const payload of PAYLOADS) {
				const changed = structuredClone(script);
				changed.nodes[i].config = { ...changed.nodes[i].config, resultCast: payload("BasePart") };
				const result = compile(changed, registry, { comments: true });
				if (result.ok && escaped(result.code))
					out.push(`${node.def} ← ${JSON.stringify(payload(""))}`);
			}
		}
		expect(out).toEqual([]);
	});
});

describe("the doors themselves", () => {
	it("keeps a line break in a variable's description inside the comment", () => {
		const script = graph(
			"examples/demo/.roswaal/scripts/ServerScriptService/Source/Main.nodescript",
		);
		script.variables[0].description = `Players so far\n${MARK}()`;
		const code = compile(script, registry, {}).code;
		expect(escaped(code)).toBe(false);
		expect(code).toContain("Players so far");
	});

	it("finds a bracket level past sixteen when the text holds every one below it", () => {
		const closers = Array.from({ length: 17 }, (_, level) => `]${"=".repeat(level)}]`).join(" ");
		expect(bracketLevel(closers)).toBe(17);
		const lines = commentLines(`${closers}\nsecond line`);
		expect(lines[0]).toBe(`--[${"=".repeat(17)}[`);
	});

	it("writes a doc block at a level its own text does not close", () => {
		expect(commentLines("Spawns the player.", "docBlock")[0]).toBe("--[=[");
		const lines = commentLines(`Spawns the player.\n]=] ${MARK}() --[=[`, "docBlock");
		expect(lines[0]).toBe("--[==[");
		expect(lines[lines.length - 1]).toBe("]==]");
	});

	it("keeps a doc comment imported from a .luau a comment", () => {
		const source = [
			"--[==[",
			"\tGreets whoever joins.",
			`\t]=] ${MARK}() --[=[`,
			"]==]",
			'print("hello")',
		].join("\n");
		expect(escaped(source)).toBe(false);
		const result = importLuau(source, {
			name: "Greeter",
			scriptClass: "Script",
			target: "roblox",
			idPrefix: "imp",
		});
		if (!result.ok) throw new Error(result.error);
		const out = compile(result.script, registry, { comments: true });
		expect(out.ok).toBe(true);
		expect(escaped(out.code)).toBe(false);
		expect(out.code).toContain("Greets whoever joins.");
	});

	it("refuses a number literal holding text, naming its node", () => {
		const b = new Builder("Main");
		const begin = b.node("script.begin");
		const print = b.node("debug.print");
		b.lit(print, "value", { t: "number", v: `0) ${MARK}() print(0` } as unknown as Literal);
		b.link(begin, "then", print, "in");
		const result = compile(b.build(), registry, {});
		expect(result.ok).toBe(false);
		expect(escaped(result.code)).toBe(false);
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({ severity: "error", node: print, pin: "value" }),
		);
	});

	it("refuses a starting value that is not the kind it is saved as", () => {
		const b = new Builder("Main");
		b.node("script.begin");
		b.variable("score", "number", { t: "number", v: `0\n${MARK}()` } as unknown as Literal);
		const result = compile(b.build(), registry, {});
		expect(result.ok).toBe(false);
		expect(escaped(result.code)).toBe(false);
	});

	it("writes into a Code Block only the code its face shows", () => {
		const b = new Builder("Main");
		const begin = b.node("script.begin");
		const block = b.node("code.custom");
		b.lit(block, "code", { t: "number", v: `${MARK}()` } as unknown as Literal);
		b.link(begin, "then", block, "in");
		const script = b.build();
		const result = compile(script, registry, {});
		expect(result.ok).toBe(false);
		expect(escaped(result.code)).toBe(false);

		const node = script.nodes.find((n) => n.id === block);
		const def = registry.get("code.custom");
		if (!node || !def) throw new Error("the Code Block is missing");
		const pins = resolveNodePins(def, node.config, node.literals);
		expect(codeFaceOf(def, node, pins.inputs, pins.outputs)?.lines).toEqual([]);

		// A real number is no more code than text saved as one.
		b.lit(block, "code", { t: "number", v: 1 });
		expect(compile(b.build(), registry, {}).ok).toBe(false);
	});

	it("refuses a cast that is not a type", () => {
		const b = new Builder("Main");
		const begin = b.node("script.begin");
		const find = b.node("roblox.findFirstChild", {
			config: { resultCast: `BasePart, ${MARK}()` },
		});
		b.lit(find, "parent", { t: "raw", v: "workspace" });
		b.lit(find, "name", { t: "string", v: "Hull" });
		const print = b.node("debug.print");
		b.link(begin, "then", print, "in");
		b.link(find, "result", print, "value");
		const result = compile(b.build(), registry, {});
		expect(result.ok).toBe(false);
		expect(escaped(result.code)).toBe(false);
		expect(result.diagnostics.some((d) => d.node === find)).toBe(true);
	});

	it("checks a Declare Type's field types, and a field list with no fields, as types", () => {
		for (const config of [
			{
				name: "T",
				shape: "fields",
				fields: [{ name: "a", type: `number }\n${MARK}()\ntype Z = { b: number` }],
			},
			{ name: "T", shape: "fields", fields: [], definition: `number\n${MARK}()` },
		]) {
			const b = new Builder("Types");
			b.node("script.begin");
			const declare = b.node("type.declareTop", { config });
			const result = compile(b.build(), registry, {});
			expect(result.ok).toBe(false);
			expect(escaped(result.code)).toBe(false);
			expect(result.diagnostics.some((d) => d.node === declare)).toBe(true);
		}
	});

	it("refuses a module function's name that is not a name", () => {
		for (const method of [false, true]) {
			const script = moduleCalls();
			const call = script.nodes.filter((n) => n.def === "function.call")[method ? 1 : 0];
			call.config = { ...call.config, name: `resolve() ${MARK}() local _ = (nil)` };
			const result = compile(script, registry, {});
			expect(result.ok).toBe(false);
			expect(escaped(result.code)).toBe(false);
			expect(result.diagnostics.some((d) => d.node === call.id)).toBe(true);
		}
		// A field name is wider than a declared one: `type` is an ordinary field,
		// after `.` and after `:` alike.
		for (const method of [false, true]) {
			const script = moduleCalls();
			const call = script.nodes.filter((n) => n.def === "function.call")[method ? 1 : 0];
			call.config = { ...call.config, name: "type" };
			expect(compile(script, registry, {}).code).toContain(method ? "Rig:type()" : "Rig.type()");
		}
	});

	it("keeps header text on its line", () => {
		expect(oneLine(`Main\r\n${MARK}()\rmore`)).toBe(`Main ${MARK}() more`);
	});

	it("still writes a path from script, game or workspace as a path", () => {
		const script = CURATED["module.requirePath"]();
		const node = script.nodes.find((n) => n.literals?.root);
		if (!node?.literals) throw new Error("the example has no root");
		node.literals.root = { t: "string", v: "script.Parent" };
		expect(compile(script, registry, {}).code).toContain("require(script.Parent.");
	});

	it("treats any other root as a service by name, quoted", () => {
		const script = CURATED["module.requirePath"]();
		const node = script.nodes.find((n) => n.literals?.root);
		if (!node?.literals) throw new Error("the example has no root");
		node.literals.root = { t: "string", v: "MadeUpService" };
		expect(compile(script, registry, {}).code).toContain('game:GetService("MadeUpService")');
	});
});
