/**
 * The flow's declarations in the order the file makes them, and the globals
 * an older file sets at its top level, read from the compiled Luau.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { emptyScript, type GraphNode, type NodeScript } from "../src/core/schema.js";
import { scriptOrder } from "../src/core/scriptOrder.js";
import { declarationDetail } from "../src/core/variablesOutline.js";

const registry = createRegistry(BUILTIN_NODES);

describe("reading the order from Luau", () => {
	it("lists locals, functions, types and requires as the file declares them", () => {
		const code = [
			"type Score = number",
			'local Signal = require("@game/ReplicatedStorage/Signal")',
			"local count = 0",
			"local function bump() end",
			"function reset() end",
			"total = 0",
		].join("\n");
		const map = [1, 2, 3, 4, 5, 6].map((line) => ({ line, node: `n${line}` }));
		const { flow, globals } = scriptOrder(code, map);
		expect(flow.map((d) => [d.kind, d.name, d.node])).toEqual([
			["type", "Score", "n1"],
			["require", "Signal", "n2"],
			["local", "count", "n3"],
			["function", "bump", "n4"],
			["function", "reset", "n5"],
		]);
		expect(globals.map((g) => [g.name, g.how, g.line])).toEqual([
			["reset", "function", 5],
			["total", "assignment", 6],
		]);
	});

	it("leaves out lines no node wrote, and a local set again", () => {
		const code = "local hoisted = 1\nlocal mine = 2\nmine = 3";
		const { flow, globals } = scriptOrder(code, [
			{ line: 2, node: "a" },
			{ line: 3, node: "a" },
		]);
		expect(flow.map((d) => d.name)).toEqual(["mine"]);
		expect(globals).toEqual([]);
	});
});

describe("an older file's Code Block", () => {
	it("is read through the compile, each declaration tied to the block", () => {
		const block: GraphNode = {
			id: "old",
			def: "code.custom",
			x: 0,
			y: 0,
			literals: {
				code: { t: "raw", v: "local ROUND = 60\nfunction startRound() end\nplayersAlive = 0" },
			},
		};
		const begin: GraphNode = { id: "b", def: "script.begin", x: 0, y: 0 };
		const script: NodeScript = {
			...emptyScript("Legacy", "legacy"),
			target: "roblox",
			nodes: [begin, block],
			links: [{ id: "l", from: { node: "b", pin: "then" }, to: { node: "old", pin: "in" } }],
		};
		const result = compile(script, registry);
		const { flow, globals } = scriptOrder(result.code, result.sourceMap);
		expect(flow.map((d) => [d.kind, d.name, d.node])).toEqual([
			["local", "ROUND", "old"],
			["function", "startRound", "old"],
		]);
		expect(globals.map((g) => g.name)).toEqual(["startRound", "playersAlive"]);
	});
});

describe("what each row says it is", () => {
	const node = (id: string, def: string, config: Record<string, unknown>): GraphNode =>
		({ id, def, x: 0, y: 0, config }) as unknown as GraphNode;
	const script: NodeScript = {
		...emptyScript("T", "t"),
		nodes: [
			node("f", "function.declareHere", {
				name: "getCharacter",
				params: [{ name: "p", type: "Player" }],
				returns: [{ type: "Model?" }],
			}),
			node("t", "type.declareHere", {
				name: "State",
				shape: "fields",
				fields: [
					{ name: "round", type: "number" },
					{ name: "alive", type: "boolean" },
				],
			}),
			node("l", "local.declare", { name: "speed", type: "number" }),
			node("c", "code.custom", {}),
		],
	};

	it("gives a function its signature, a type its fields, a local its type, and a Code Block its kind", () => {
		expect(declarationDetail(script, registry, "f", "function")).toBe("(Player) → Model?");
		expect(declarationDetail(script, registry, "t", "type")).toBe("{ round, alive }");
		expect(declarationDetail(script, registry, "l", "local")).toBe("number");
		expect(declarationDetail(script, registry, "c", "local")).toBe("local");
		expect(declarationDetail(script, registry, "x", "require")).toBe("require");
	});
});

describe("a local's type, read from the Luau", () => {
	it("takes the annotation, or a literal's kind and value", () => {
		const code = [
			"local speed: number = 16",
			"local count = 3",
			"local on = true",
			'local name = "x"',
			"local f = g()",
		].join("\n");
		const map = [1, 2, 3, 4, 5].map((line) => ({ line, node: `n${line}` }));
		expect(scriptOrder(code, map).flow.map((d) => d.detail)).toEqual([
			"number",
			"number 3",
			"boolean true",
			"string",
			undefined,
		]);
	});
});
