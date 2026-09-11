/**
 * A dictionary's row is a pair, and splitting it gives the key and value back.
 *
 * A row used to be two pins — `k<i>` for the key, `a<i>" for the value, with the
 * value pin *also* accepting a whole Key Value Pair. That was two shapes for one
 * idea, and it showed: a pair wired in from elsewhere sat on a pin labelled
 * Value while the row's own Key went quietly unused.
 *
 * Now a row is one `p<i>` pin. Split, it is the Key and Value you type into;
 * whole, it takes a pair. The two states are exclusive, which is the point —
 * there is only ever one place a row's key comes from.
 */

import { describe, expect, it } from "vitest";

import { addNode, growNode } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { migrateScript } from "../src/core/migrate.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { growthRule } from "../src/core/nodes/growth.js";
import { PAIR } from "../src/core/schema.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const dictionary = registry.get("table.dictionary")!;

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

const pinIds = (config: Record<string, unknown>) =>
	resolveNodePins(dictionary, config).inputs.map((p) => p.id);

describe("a dictionary's rows", () => {
	it("are one pair pin each", () => {
		const rows = dictionary.derivePins!({ args: 3 }).inputs;
		expect(rows.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
		expect(rows.every((p) => p.type === PAIR)).toBe(true);
	});

	it("split into a Key and a Value", () => {
		expect(pinIds({ args: 1, split: { "in:p0": "keyValue" } })).toEqual(["p0.key", "p0.value"]);
	});

	/**
	 * The one row case leaves its pin unnamed, so the parts read "Key" and
	 * "Value" rather than repeating a number the node does not need.
	 */
	it("name their parts after the row, and not at all when there is one", () => {
		const one = resolveNodePins(dictionary, { args: 1, split: { "in:p0": "keyValue" } }).inputs;
		expect(one.map((p) => p.name)).toEqual(["Key", "Value"]);

		const two = resolveNodePins(dictionary, { args: 2, split: { "in:p1": "keyValue" } }).inputs;
		expect(two.find((p) => p.id === "p1.key")!.name).toBe("Pair 2 Key");
	});

	it("are called pairs by the buttons that add them, not operands", () => {
		const rule = growthRule(dictionary)!;
		expect(rule.label).toBe("pairs");
		expect(rule.prefix).toBe("p");
	});
});

describe("what a dictionary compiles to", () => {
	/** Two rows split and typed into. */
	function typed(): NodeScript {
		const b = new Builder();
		const start = b.node("script.begin");
		const dict = b.node("table.dictionary", {
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" } },
		});
		b.lit(dict, "p0.key", { t: "string", v: "turnRate" });
		b.lit(dict, "p0.value", { t: "number", v: 45 });
		b.lit(dict, "p1.key", { t: "string", v: "brakingTime" });
		b.lit(dict, "p1.value", { t: "number", v: 1.2 });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(dict, "result", print, "value");
		return b.build();
	}

	it("reads a split row from its parts", () => {
		expect(errors(typed())).toEqual([]);
		expect(code(typed())).toContain("print({ turnRate = 45, brakingTime = 1.2 })");
	});

	it("leaves out a row whose key is empty", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const dict = b.node("table.dictionary", {
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" } },
		});
		b.lit(dict, "p0.key", { t: "string", v: "speed" });
		b.lit(dict, "p0.value", { t: "number", v: 16 });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(dict, "result", print, "value");
		expect(code(b.build())).toContain("print({ speed = 16 })");
	});

	/** A whole row with nothing wired into it is a row you have not filled in. */
	it("leaves out a whole row with nothing on it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const dict = b.node("table.dictionary", { config: { args: 1 } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(dict, "result", print, "value");
		expect(errors(b.build())).toEqual([]);
		expect(code(b.build())).toContain("print({})");
	});

	/**
	 * A pair is syntax rather than a value, so there is nothing to rebuild a
	 * split one into. Reaching the rebuild means something other than a
	 * dictionary was handed one, and it says so instead of emitting a line that
	 * looks fine and means nothing.
	 */
	it("refuses a split pair anywhere a value is wanted", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const pair = b.node("table.pair", { config: { split: { "in:result": "keyValue" } } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(pair, "result", print, "value");
		expect(errors(b.build()).join(" ")).toMatch(/only goes into Make Dictionary/);
	});
});

describe("placing and growing one", () => {
	const place = () => addNode({ ...new Builder().build(), nodes: [] }, dictionary, 0, 0);

	/** A pair pin has no literal, so an unsplit row is one you cannot type into. */
	it("arrives with its first row split", () => {
		const { script, id } = place();
		const node = script.nodes.find((n) => n.id === id)!;
		expect(node.config).toEqual({ split: { "in:p0": "keyValue" } });
		expect(pinIds(node.config!)).toEqual(["p0.key", "p0.value"]);
	});

	it("splits each row it grows", () => {
		const placed = place();
		const grown = growNode(placed.script, registry, placed.id, 1);
		const node = grown.script.nodes.find((n) => n.id === placed.id)!;
		expect(pinIds(node.config!)).toEqual(["p0.key", "p0.value", "p1.key", "p1.value"]);
		// A wire dropped on the node lands on the new row's Value, because a
		// split row has no pin under its own id.
		expect(grown.pin).toBe("p1.value");
	});

	/**
	 * Except for a pair being dropped on it. That wire wants the whole row, so
	 * the row stays whole and takes it — which is how the drop gesture keeps
	 * working without the canvas having to know what a pair is.
	 */
	it("leaves a row whole for a pair dropped on it", () => {
		const placed = place();
		const grown = growNode(placed.script, registry, placed.id, 1, { type: PAIR });
		const node = grown.script.nodes.find((n) => n.id === placed.id)!;
		expect(pinIds(node.config!)).toEqual(["p0.key", "p0.value", "p1"]);
		expect(grown.pin).toBe("p1");
	});
});

describe("a dictionary from an earlier build", () => {
	/** Two rows typed in, and a third fed by a Key Value Pair. */
	function old(): NodeScript {
		const b = new Builder();
		const dict = b.node("table.dictionary", { id: "dict", config: { args: 3 } });
		b.lit(dict, "k0", { t: "string", v: "turnRate" });
		b.lit(dict, "a0", { t: "number", v: 45 });
		b.lit(dict, "k1", { t: "string", v: "brakingTime" });
		b.lit(dict, "a1", { t: "number", v: 1.2 });
		const pair = b.node("table.pair", { id: "pair" });
		b.lit(pair, "key", { t: "string", v: "walkSpeed" }).lit(pair, "value", { t: "number", v: 16 });
		b.link(pair, "result", dict, "a2");
		return b.build();
	}

	const migrated = () => migrateScript(old());

	it("moves what was typed in onto the split parts", () => {
		const node = migrated().script.nodes.find((n) => n.id === "dict")!;
		expect(node.literals).toEqual({
			"p0.key": { t: "string", v: "turnRate" },
			"p0.value": { t: "number", v: 45 },
			"p1.key": { t: "string", v: "brakingTime" },
			"p1.value": { t: "number", v: 1.2 },
		});
	});

	it("splits the rows that were typed into", () => {
		const node = migrated().script.nodes.find((n) => n.id === "dict")!;
		const split = (node.config as { split: Record<string, string> }).split;
		expect(split["in:p0"]).toBe("keyValue");
		expect(split["in:p1"]).toBe("keyValue");
	});

	/**
	 * The old value pin accepted a whole pair, which is what the row now is. So
	 * that row stays whole and the wire moves onto the row rather than onto a
	 * Value that would be holding an entry instead of a value.
	 */
	it("leaves the row a pair fed whole, with the wire on the row", () => {
		const script = migrated().script;
		const node = script.nodes.find((n) => n.id === "dict")!;
		expect((node.config as { split: Record<string, string> }).split["in:p2"]).toBeUndefined();
		expect(script.links.find((l) => l.from.node === "pair")!.to.pin).toBe("p2");
	});

	it("says what it did, and does not do it twice", () => {
		expect(migrated().notes.join(" ")).toMatch(/Make Dictionary/);
		expect(migrateScript(migrated().script).notes).toEqual([]);
	});

	it("compiles to what it always did", () => {
		expect(errors(migrated().script)).toEqual([]);
	});
});
