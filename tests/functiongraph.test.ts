/**
 * Function graphs: which graph a node is drawn in, and what that must not change.
 *
 * Membership is stored now, as `GraphNode.graph`, and what compiles is still
 * decided by the wires. So most of what is worth testing is the agreement
 * between the two — a view that drew a node in one graph while the emitter
 * compiled it in another would read as a bug in the compiler — and the edits
 * that act on a function as a whole.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { copySelection, deleteSelection, pasteClipping, placeNodes } from "../src/app/edits.js";
import { body } from "./helpers.js";
import { compile, serialiseScript } from "../src/core/compiler/index.js";
import {
	crossingLinks, ENTRY_HOME, functionOutline, graphMembers, hasMembership, mergeLayout, viewOf,
} from "../src/core/functionGraph.js";
import { migrateScript } from "../src/core/migrate.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();

/** A Declare Function in the flow, one statement in its body and one after it. */
function declared() {
	const b = new Builder();
	const begin = b.node("script.begin");
	const fn = b.node("function.declareHere", {
		config: { name: "hide", params: [{ name: "tank", type: "Model" }], returns: [] },
	});
	const inside = b.node("debug.print");
	const after = b.node("debug.print", { id: "after" });
	b.node("script.end", { id: "unused" });
	b.link(begin, "then", fn, "in");
	b.link(fn, "body", inside, "in");
	b.link(fn, "p0", inside, "value");
	b.link(fn, "then", after, "in");
	const script = b.build();
	script.nodes = script.nodes.map((n) => (n.id === inside ? { ...n, graph: fn } : n));
	return { script, begin, fn, inside, after };
}

const pinIds = (script: NodeScript, id: string) => {
	const node = script.nodes.find((n) => n.id === id)!;
	const pins = resolveNodePins(registry.get(node.def)!, node.config);
	return { inputs: pins.inputs.map((p) => p.id), outputs: pins.outputs.map((p) => p.id) };
};

describe("a Declare Function, drawn in two graphs", () => {
	it("has the flow's pins in the flow", () => {
		const { script, fn } = declared();
		expect(pinIds(viewOf(script, null), fn)).toEqual({ inputs: ["in", "owner"], outputs: ["then", "self"] });
	});

	it("has its body and parameters as the entry of its own graph", () => {
		const { script, fn } = declared();
		expect(pinIds(viewOf(script, fn), fn)).toEqual({ inputs: [], outputs: ["body", "p0"] });
	});

	it("puts each node and each wire in exactly one graph", () => {
		const { script, fn, inside, after, begin } = declared();
		const outer = viewOf(script, null);
		const own = viewOf(script, fn);
		expect(outer.nodes.map((n) => n.id).sort()).toEqual([after, begin, fn, "unused"].sort());
		expect(own.nodes.map((n) => n.id).sort()).toEqual([fn, inside].sort());
		expect(outer.links.length + own.links.length).toBe(script.links.length);
	});

	it("sits at its second position in its own graph, and is moved there", () => {
		const { script, fn } = declared();
		const own = viewOf(script, fn);
		expect(own.nodes.find((n) => n.id === fn)).toMatchObject(ENTRY_HOME);

		const start = new Map([[fn, { ...ENTRY_HOME }]]);
		const moved = placeNodes(script, start, 40, 20, fn).nodes.find((n) => n.id === fn)!;
		expect(moved.inner).toEqual({ x: ENTRY_HOME.x + 40, y: ENTRY_HOME.y + 20 });
		expect({ x: moved.x, y: moved.y }, "its place in the flow did not move").toEqual(
			{ x: script.nodes.find((n) => n.id === fn)!.x, y: script.nodes.find((n) => n.id === fn)!.y },
		);
	});

	it("takes a layout made against one graph back without touching the other", () => {
		const { script, fn } = declared();
		const view = viewOf(script, fn);
		const laid = { ...view, nodes: view.nodes.map((n) => ({ ...n, x: n.x + 100 })) };
		const merged = mergeLayout(script, fn, laid);
		expect(merged.nodes.find((n) => n.id === fn)!.inner?.x).toBe(ENTRY_HOME.x + 100);
		expect(merged.nodes.find((n) => n.id === "after")).toBe(script.nodes.find((n) => n.id === "after"));
	});
});

describe("a hoisted Function", () => {
	it("is drawn only in its own graph", () => {
		const b = new Builder();
		b.node("script.begin");
		const fn = b.node("function.entry", { config: { name: "greet", params: [], returns: [] } });
		const script = b.build();
		expect(viewOf(script, null).nodes.some((n) => n.id === fn)).toBe(false);
		expect(viewOf(script, fn).nodes.some((n) => n.id === fn)).toBe(true);
	});
});

describe("what compiles", () => {
	/** The whole point of keeping membership out of the emitter. */
	it("does not depend on which graph a node is drawn in", () => {
		const { script } = declared();
		const flat: NodeScript = {
			...script,
			nodes: script.nodes.map(({ graph: _g, inner: _i, ...n }) => n),
		};
		expect(body(compile(script, registry).code)).toBe(body(compile(flat, registry).code));
	});

	it("reports a wire between two graphs", () => {
		const { script, after, inside } = declared();
		const broken = {
			...script,
			links: [...script.links, { id: "x", from: { node: inside, pin: "then" }, to: { node: after, pin: "in" } }],
		};
		expect(crossingLinks(broken).map((l) => l.id)).toEqual(["x"]);
		const messages = compile(broken, registry).diagnostics.map((d) => d.message);
		expect(messages.some((m) => m.includes("runs between two graphs"))).toBe(true);
	});

	it("reports nothing for a script with no membership, as every graph before 0.33.0", () => {
		const { script } = declared();
		const flat = { ...script, nodes: script.nodes.map(({ graph: _g, ...n }) => n) };
		expect(hasMembership(flat)).toBe(false);
		expect(crossingLinks(flat)).toEqual([]);
	});

	it("writes where a node is drawn to the file", () => {
		const { script, fn } = declared();
		const withEntry = placeNodes(script, new Map([[fn, { ...ENTRY_HOME }]]), 0, 10, fn);
		const written = JSON.parse(serialiseScript(withEntry)) as NodeScript;
		expect(written.nodes.find((n) => n.id === fn)?.inner).toEqual({ x: ENTRY_HOME.x, y: ENTRY_HOME.y + 10 });
		expect(written.nodes.filter((n) => n.graph === fn)).toHaveLength(1);
	});
});

describe("a function as a whole", () => {
	it("is deleted with its graph", () => {
		const { script, fn, inside } = declared();
		const after = deleteSelection(script, new Set([fn]), registry);
		expect(after.nodes.some((n) => n.id === inside)).toBe(false);
		expect(after.nodes.some((n) => n.id === "after")).toBe(true);
	});

	it("is copied with its graph, and the copy's graph is its own", () => {
		const { script, fn } = declared();
		const { script: pasted, ids } = pasteClipping(script, copySelection(script, new Set([fn]), registry));
		const copy = pasted.nodes.find((n) => ids.includes(n.id) && n.def === "function.declareHere")!;
		const members = graphMembers(pasted, copy.id);
		expect(members.size).toBe(1);
		expect(copy.graph, "the copy lands in the graph on screen").toBeUndefined();
	});

	it("lists nested functions under the one they are declared in", () => {
		const b = new Builder();
		const outer = b.node("function.entry", { id: "outer", config: { name: "outer" } });
		b.node("function.declareHere", { id: "inner", graph: outer, config: { name: "inner" } });
		b.node("function.declareHere", { id: "loose", config: { name: "loose" } });
		expect(functionOutline(b.build())).toEqual([
			{ id: "outer", name: "outer", depth: 0 },
			{ id: "inner", name: "inner", depth: 1 },
			{ id: "loose", name: "loose", depth: 0 },
		]);
	});
});

/**
 * The two converted M103 graphs, which are what a real file looks like when it
 * is opened for the first time after 0.33.0.
 */
describe("a graph written before function graphs", () => {
	const files = [
		"examples/m103/graph/.roswaal/scripts/ReplicatedStorage/Tank/Config.nodescript",
		"examples/m103/graph/.roswaal/scripts/ReplicatedStorage/Tank/Occupancy.nodescript",
	];

	/**
	 * The fixture as it was before 0.33.0: no membership anywhere.
	 *
	 * **Comments as well as nodes.** `hasMembership` asks whether a node *or a
	 * comment* names a graph, and `assignMembership` treats a yes as "already
	 * migrated" and does nothing. Stripping only the nodes left eight of
	 * Occupancy's ten comments still carrying `graph`, so the migration these
	 * tests exist to exercise never ran on it -- every node stayed at the root,
	 * a Declare Function's `body` pin reported its own graph as it always does,
	 * and the wire between them read as a crossing. The test failed for two
	 * releases against a script that was never legacy in the first place.
	 */
	const legacyOf = (file: string): NodeScript => {
		const raw = JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as NodeScript;
		return {
			...raw,
			nodes: raw.nodes.map(({ graph: _g, inner: _i, ...n }) => n),
			comments: raw.comments.map(({ graph: _g, ...c }) => c),
		};
	};

	for (const file of files) {
		it(`${path.basename(file)} has no membership left to strip`, () => {
			// The guard on the helper above: if this ever finds membership, the
			// three tests below are quietly checking nothing.
			const legacy = legacyOf(file);
			expect(legacy.nodes.some((n) => n.graph !== undefined)).toBe(false);
			expect(legacy.comments.some((c) => c.graph !== undefined)).toBe(false);
		});

		it(`${path.basename(file)} splits into function graphs with no wire between two`, () => {
			const legacy = legacyOf(file);
			const { script, notes } = migrateScript(legacy, registry);
			expect(hasMembership(script)).toBe(true);
			expect(crossingLinks(script)).toEqual([]);
			expect(notes.some((n) => n.includes("own graph"))).toBe(true);
			for (const fn of script.nodes.filter((n) => n.def === "function.declareHere")) {
				expect(graphMembers(script, fn.id).size, `${fn.id} has a graph`).toBeGreaterThan(0);
				expect(fn.inner, "and an entry position in it").toBeDefined();
			}
			expect(script.nodes.find((n) => n.def === "script.begin")?.graph).toBeUndefined();
		});

		it(`${path.basename(file)} compiles to the same Luau afterwards`, () => {
			const legacy = legacyOf(file);
			const before = migrateScript(legacy).script;
			const after = migrateScript(legacy, registry).script;
			expect(body(compile(after, registry).code)).toBe(body(compile(before, registry).code));
		});

		it(`${path.basename(file)} is left alone the second time`, () => {
			const legacy = legacyOf(file);
			const once = migrateScript(legacy, registry).script;
			expect(migrateScript(once, registry).script.nodes).toEqual(once.nodes);
		});
	}

	it("is not split without a registry to walk the wires with", () => {
		const { script } = declared();
		const flat = { ...script, nodes: script.nodes.map(({ graph: _g, ...n }) => n) };
		expect(hasMembership(migrateScript(flat).script)).toBe(false);
	});
});
