/**
 * Index and Key, and an entry that travels as one wire.
 *
 * One node used to set `t[1]` and `t.name` alike, with a pin called Key under a
 * title that said Index. Converting `Occupancy.luau` wanted
 * `restores[character]` — neither a number nor a name — from a node whose pin
 * said it took one of the two.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { canConnect, landingPins } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { pinsCompatible } from "../src/core/compiler/validate.js";
import { migrateScript } from "../src/core/migrate.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { Literal, NodeScript, PinDef } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/** A table, then one assignment into it, keyed by a literal or by a wire. */
function assign(def: string, key: Literal | "wired"): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const table = b.node("table.new");
	const set = b.node(def);
	b.link(start, "then", table, "in").link(table, "then", set, "in").link(table, "result", set, "table");
	if (key === "wired") {
		const character = b.node("value.expression", { literals: { code: { t: "raw", v: "character" } } });
		b.link(character, "result", set, "key");
	} else {
		b.lit(set, "key", key);
	}
	b.lit(set, "value", { t: "number", v: 1 });
	return code(b.build());
}

describe("Index and Key", () => {
	it("types Index as a number and Key as anything", () => {
		const pin = (def: string) => registry.get(def)!.inputs.find((p) => p.id === "key")!;
		expect(pin("table.set")).toMatchObject({ name: "Index", type: "number" });
		expect(pin("table.get")).toMatchObject({ name: "Index", type: "number" });
		expect(pin("table.setKey")).toMatchObject({ name: "Key", type: "any" });
		expect(pin("table.getKey")).toMatchObject({ name: "Key", type: "any" });
	});

	it("writes a numeric index in brackets", () => {
		expect(assign("table.set", { t: "number", v: 3 })).toMatch(/\[3\] = 1$/m);
	});

	it("writes a named key as a field", () => {
		expect(assign("table.setKey", { t: "string", v: "walkSpeed" })).toMatch(/\.walkSpeed = 1$/m);
	});

	it("takes any key that is wired in", () => {
		expect(assign("table.setKey", "wired")).toMatch(/\[character\] = 1$/m);
	});

	it("reads a named key as a field", () => {
		const b = new Builder();
		const t = b.variable("tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const read = b.node("variable.get", { config: { variable: t, name: "tuning", type: "table" } });
		const get = b.node("table.getKey");
		b.lit(get, "key", { t: "string", v: "turnRate" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(read, "value", get, "table").link(get, "result", print, "value");
		expect(code(b.build())).toContain("print(tuning.turnRate)");
	});
});

describe("an Index keyed by a name, from an earlier build", () => {
	function old(def: string, key: Literal | "string node" | "expression"): NodeScript {
		const b = new Builder();
		const node = b.node(def, { id: "subject" });
		if (key === "string node" || key === "expression") {
			const source = b.node(key === "string node" ? "value.string" : "value.expression");
			b.link(source, "result", node, "key");
		} else {
			b.lit(node, "key", key);
		}
		return b.build();
	}
	const defOf = (script: NodeScript) =>
		migrateScript(script).script.nodes.find((n) => n.id === "subject")!.def;

	it("becomes a Key when the name was typed in", () => {
		const migrated = migrateScript(old("table.set", { t: "string", v: "VALUE_NAME" }));
		expect(migrated.script.nodes.find((n) => n.id === "subject")!.def).toBe("table.setKey");
		expect(migrated.notes.join(" ")).toMatch(/Set Key or Get Key/);
		expect(defOf(old("table.get", { t: "string", v: "turnRate" }))).toBe("table.getKey");
	});

	it("becomes a Key when a String node was wired in", () => {
		expect(defOf(old("table.set", "string node"))).toBe("table.setKey");
	});

	it("stays an Index for a number, or a key it cannot tell about", () => {
		expect(defOf(old("table.set", { t: "number", v: 0 }))).toBe("table.set");
		expect(defOf(old("table.set", "expression"))).toBe("table.set");
	});

	it("keeps what was typed into the key, and migrates once", () => {
		const once = migrateScript(old("table.set", { t: "string", v: "VALUE_NAME" })).script;
		expect(once.nodes.find((n) => n.id === "subject")!.literals?.key).toEqual({ t: "string", v: "VALUE_NAME" });
		expect(migrateScript(once).notes).toEqual([]);
	});

	it("turns Occupancy's VALUE_NAME assignment into a Set Key", () => {
		const file = path.join(
			ROOT, "examples/m103/graph/.roswaal/scripts/ReplicatedStorage/Tank/Occupancy.nodescript",
		);
		const script = migrateScript(JSON.parse(readFileSync(file, "utf8")) as NodeScript).script;
		expect(script.nodes.find((n) => n.id === "00dc4866-e7c2-4e06-a476-a2c4f39633ad")!.def)
			.toBe("table.setKey");
		expect(code(script)).toContain('Occupancy.VALUE_NAME = "Occupant"');
	});
});

describe("Key Value Pair", () => {
	/**
	 * A dictionary with one row split and typed into, and one left whole to
	 * take a pair — the two states a row has, side by side in one node.
	 */
	function dictionary() {
		const b = new Builder();
		const start = b.node("script.begin");
		const pair = b.node("table.pair");
		b.lit(pair, "key", { t: "string", v: "walkSpeed" }).lit(pair, "value", { t: "number", v: 16 });
		const dict = b.node("table.dictionary", {
			config: { args: 2, split: { "in:p0": "keyValue" } },
		});
		b.lit(dict, "p0.key", { t: "string", v: "jumpHeight" });
		b.lit(dict, "p0.value", { t: "number", v: 7.2 });
		const print = b.node("debug.print");
		b.link(pair, "result", dict, "p1");
		b.link(start, "then", print, "in").link(dict, "result", print, "value");
		return b.build();
	}

	it("becomes an entry of the dictionary it is wired into", () => {
		expect(errors(dictionary())).toEqual([]);
		expect(code(dictionary())).toContain("print({ jumpHeight = 7.2, walkSpeed = 16 })");
	});

	/** A whole row has no key of its own, which is why the pair brings one. */
	it("is the whole row, so there is no row key to disagree with", () => {
		const dict = registry.get("table.dictionary")!;
		const whole = resolveNodePins(dict, { args: 2, split: { "in:p0": "keyValue" } });
		expect(whole.inputs.map((p) => p.id)).toEqual(["p0.key", "p0.value", "p1"]);
	});

	it("is an error anywhere else", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const pair = b.node("table.pair");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(pair, "result", print, "value");
		expect(errors(b.build()).join(" ")).toMatch(/only goes into Make Dictionary/);
	});

	it("fits a dictionary's rows and nothing else, not even any", () => {
		const pair: PinDef = { id: "result", name: "", kind: "data", type: "pair" };
		const dict = registry.get("table.dictionary")!;
		const rows = dict.derivePins!({ args: 2 }).inputs;

		expect(pinsCompatible(pair, { type: "any" })).toBe(false);
		expect(pinsCompatible(pair, rows.find((p) => p.id === "p0")!)).toBe(true);
		// A plain value goes on a split row's Value, never on the row itself.
		expect(pinsCompatible({ type: "string" }, rows.find((p) => p.id === "p0")!)).toBe(false);
		const split = resolveNodePins(dict, { args: 1, split: { "in:p0": "keyValue" } }).inputs;
		expect(pinsCompatible({ type: "string" }, split.find((p) => p.id === "p0.value")!)).toBe(true);
		expect(landingPins(dict, rows, pair, "in").map((p) => p.id)).toEqual(["p0", "p1"]);

		const print = registry.get("debug.print")!;
		expect(landingPins(print, print.inputs, pair, "in")).toEqual([]);
	});

	it("is offered when a wire is dragged back out of a dictionary's row", () => {
		const def = registry.get("table.pair")!;
		const into = registry.get("table.dictionary")!.derivePins!({ args: 1 }).inputs.find((p) => p.id === "p0")!;
		expect(landingPins(def, def.outputs, into, "out").map((p) => p.id)).toEqual(["result"]);
	});

	it("refuses the drop onto a pin that is not a dictionary's", () => {
		const b = new Builder();
		const pair = b.node("table.pair");
		const print = b.node("debug.print");
		expect(canConnect(b.build(), registry, { node: pair, pin: "result" }, { node: print, pin: "value" }).ok)
			.toBe(false);
	});
});
