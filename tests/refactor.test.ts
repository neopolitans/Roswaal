/**
 * The Refactor panel's changes (0.183.0): A Get per reader, Share Gets and
 * Split into rows change how a graph is wired, never the Luau it compiles to.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { viewOf } from "../src/core/functionGraph.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { getterPerReader, shareGets, splitIntoRows } from "../src/core/refactor.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();
const M103 = path.join(__dirname, "../examples/m103/graph/.roswaal/scripts");
const graphFile = (file: string) =>
	JSON.parse(readFileSync(path.join(M103, file), "utf8")) as NodeScript;

/** The compiled Luau below its source hash, which any edit to the graph changes. */
const luau = (s: NodeScript) => compile(s, registry).code.replace(/^-- roswaal-source: .*$/m, "");
const graphsOf = (s: NodeScript) => [
	null,
	...s.nodes.filter((n) => n.def === "function.declareHere").map((n) => n.id),
];
const readsShared = (s: NodeScript, graph: string | null) => {
	const view = viewOf(s, graph);
	return view.nodes.filter(
		(n) =>
			n.def.endsWith(".get") &&
			new Set(view.links.filter((l) => l.from.node === n.id).map((l) => l.to.node)).size > 1,
	).length;
};

describe("A Get per reader", () => {
	it("gives every reader its own Get, and compiles to the same Luau", () => {
		const script = graphFile("ReplicatedStorage/Tank/Occupancy.nodescript");
		let out = script;
		for (const graph of graphsOf(script)) out = getterPerReader(out, graph);
		expect(out.nodes.length).toBeGreaterThan(script.nodes.length);
		for (const graph of graphsOf(out)) expect(readsShared(out, graph)).toBe(0);
		expect(luau(out)).toBe(luau(script));
	});

	it("touches only a selection when given one", () => {
		const script = graphFile("ReplicatedStorage/Tank/Occupancy.nodescript");
		const out = getterPerReader(script, null, new Set());
		expect(out.nodes).toHaveLength(script.nodes.length);
	});
});

describe("Share Gets", () => {
	it("makes Gets of the same thing one, and compiles to the same Luau", () => {
		const script = graphFile("ReplicatedStorage/Tank/Occupancy.nodescript");
		let spread = script;
		for (const graph of graphsOf(script)) spread = getterPerReader(spread, graph);
		let shared = spread;
		for (const graph of graphsOf(spread)) shared = shareGets(shared, graph);
		expect(shared.nodes.length).toBeLessThan(spread.nodes.length);
		expect(luau(shared)).toBe(luau(script));
	});
});

describe("Split into rows", () => {
	it("puts a Sequence after the start of a long chain, and compiles to the same Luau", () => {
		const src =
			Array.from({ length: 24 }, (_, i) => `local v${i} = math.floor(${i}.5)`).join("\n") +
			"\nprint(v0)\n";
		const { name, scriptClass } = graphNameOf("Long.server.luau");
		const result = importLuau(src, {
			name,
			scriptClass,
			target: "roblox",
			idPrefix: "t",
			mode: "verbatim",
		});
		if (!result.ok) throw new Error(result.error);
		const script = result.script;
		expect(script.nodes.some((n) => n.def === "flow.sequence")).toBe(false);
		const out = splitIntoRows(script, registry, null);
		const sequence = out.nodes.find((n) => n.def === "flow.sequence");
		expect(Number(sequence?.config?.count)).toBeGreaterThan(1);
		expect(luau(out)).toBe(luau(script));
	});

	it("leaves a chain that fits on one row as it was", () => {
		const script = graphFile("ServerScriptService/Source/Main.nodescript");
		const before = script.nodes.length;
		const out = splitIntoRows(script, registry, null);
		expect(out.nodes.length).toBeLessThanOrEqual(before);
		expect(luau(out)).toBe(luau(script));
	});
});
