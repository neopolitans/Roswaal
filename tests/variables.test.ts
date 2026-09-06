import { describe, expect, it } from "vitest";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry, nodeTitle } from "../src/core/nodes/index.js";
import { migrateScript } from "../src/core/migrate.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function errors(result: { diagnostics: { severity: string; message: string }[] }): string[] {
	return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
}

describe("script variables", () => {
	it("declares variables as typed locals before anything else", () => {
		const b = new Builder();
		b.variable("health", "number", { t: "number", v: 100 });
		b.variable("playerName", "string", { t: "string", v: "nobody" });
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				"local health: number = 100",
				`local playerName: string = "nobody"`,
				"",
				`print("Hello")`,
			].join("\n"),
		);
	});

	it("reads and writes a variable by name", () => {
		const b = new Builder();
		const id = b.variable("score", "number", { t: "number", v: 0 });
		const start = b.node("script.begin");
		const set = b.node("variable.set", { config: { variable: id, name: "score", type: "number" } });
		const get = b.node("variable.get", { config: { variable: id, name: "score", type: "number" } });
		const print = b.node("debug.print");

		b.lit(set, "value", { t: "number", v: 10 });
		b.link(start, "then", set, "in");
		b.link(set, "then", print, "in");
		b.link(get, "value", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["local score: number = 0", "", "score = 10", "print(score)"].join("\n"),
		);
	});

	/**
	 * The interesting case: a variable read is not a pure expression that can be
	 * computed once. If two Gets straddle a Set, hoisting the read would make the
	 * second one report the old value.
	 */
	it("never hoists a variable read across a write", () => {
		const b = new Builder();
		const id = b.variable("count", "number", { t: "number", v: 1 });
		const start = b.node("script.begin");
		const before = b.node("debug.print");
		const set = b.node("variable.set", { config: { variable: id, name: "count", type: "number" } });
		const after = b.node("debug.print");
		const get = b.node("variable.get", { config: { variable: id, name: "count", type: "number" } });

		b.lit(set, "value", { t: "number", v: 2 });
		b.link(start, "then", before, "in");
		b.link(before, "then", set, "in");
		b.link(set, "then", after, "in");
		// One Get feeding both prints, one either side of the write.
		b.link(get, "value", before, "value");
		b.link(get, "value", after, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				"local count: number = 1",
				"",
				"print(count)",
				"count = 2",
				"print(count)",
			].join("\n"),
		);
	});

	it("passes the written value through a Set", () => {
		const b = new Builder();
		const id = b.variable("total", "number", { t: "number", v: 0 });
		const start = b.node("script.begin");
		const set = b.node("variable.set", { config: { variable: id, name: "total", type: "number" } });
		const print = b.node("debug.print");
		b.lit(set, "value", { t: "number", v: 7 });
		b.link(start, "then", set, "in");
		b.link(set, "then", print, "in");
		b.link(set, "value", print, "value");

		const out = compile(b.build(), registry);
		expect(body(out.code)).toContain("print(total)");
	});

	it("emits a variable comment above its local", () => {
		const b = new Builder();
		b.script.variables.push({
			id: "v1",
			name: "cooldown",
			type: "number",
			default: { t: "number", v: 3 },
			description: "Seconds between shots.",
		});
		const out = compile(b.build(), registry);
		expect(body(out.code)).toContain("-- Seconds between shots.");
	});

	it("reports a reference to a deleted variable", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		const get = b.node("variable.get", { config: { variable: "gone", name: "gone", type: "number" } });
		b.link(start, "then", print, "in");
		b.link(get, "value", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out).join(" ")).toContain("deleted");
	});

	it("keeps variables out of a name collision with a function", () => {
		const b = new Builder();
		b.variable("update", "number", { t: "number", v: 0 });
		b.node("function.entry", { config: { name: "update", params: [], returns: [] } });

		const out = compile(b.build(), registry);
		expect(body(out.code)).toContain("local update: number = 0");
		expect(body(out.code)).toContain("local function update2()");
	});
});

describe("function references", () => {
	it("resolves Get Function without an execution wire", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "tick", params: [], returns: [] } });
		const get = b.node("function.get", { config: { function: fn, name: "tick" } });
		const exports = b.node("module.exports", { config: { exports: [{ name: "tick" }] } });
		b.link(get, "fn", exports, "e0");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("tick = tick,");
	});

	it("reports a reference to a function that is gone", () => {
		const b = new Builder();
		const get = b.node("function.get", { config: { function: "missing", name: "gone" } });
		const exports = b.node("module.exports");
		b.link(get, "fn", exports, "e0");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(errors(out).join(" ")).toContain("no longer in the graph");
	});
});

/**
 * What a node is called on the canvas.
 *
 * A node can be named twice — a function has a name in the generated Luau and
 * a label on its header — and the rule for which one shows is easy to get
 * subtly wrong in one renderer and not another. It lives in one function, and
 * this is that function's contract.
 */
describe("node titles", () => {
	const named = (id: string, config: Record<string, unknown>, label?: string) => ({
		id: "n", def: id, x: 0, y: 0, config, label,
	});

	it("uses a function's own name before the definition's title", () => {
		const def = registry.get("function.entry")!;
		expect(nodeTitle(def, named("function.entry", { name: "greet" }))).toBe("greet");
	});

	it("falls back to the title when the function has no name yet", () => {
		const def = registry.get("function.entry")!;
		expect(nodeTitle(def, named("function.entry", {}))).toBe("Function");
		expect(nodeTitle(def, named("function.entry", { name: "" }))).toBe("Function");
	});

	it("lets a typed label win over the name", () => {
		const def = registry.get("function.entry")!;
		expect(nodeTitle(def, named("function.entry", { name: "greet" }, "Say hello")))
			.toBe("Say hello");
	});

	it("names a capsule getter after what it holds", () => {
		expect(nodeTitle(registry.get("variable.get")!, named("variable.get", { name: "Health" })))
			.toBe("Health");
		expect(nodeTitle(registry.get("function.get")!, named("function.get", { name: "tick" })))
			.toBe("tick");
	});

	it("leaves a node that is only *about* a name alone", () => {
		// Set Variable would lose its verb: "Accumulator" does not say it assigns.
		// The variable's name is on its subtitle, which is where it belongs.
		expect(nodeTitle(registry.get("variable.set")!, named("variable.set", { name: "Health" })))
			.toBe("Set Variable");
	});

	it("calls a node by its name in a diagnostic about it", () => {
		// The unreachable-node warning goes through the same rule, so it can
		// never call a node something other than what the canvas calls it.
		const b = new Builder();
		b.node("debug.print", { label: "Log the score" });

		const out = compile(b.build(), registry);
		const about = out.diagnostics.map((d) => d.message).join(" ");
		expect(about).toContain('"Log the score" is not connected to anything that runs.');
	});
});

describe("migration", () => {
	it("renames nodes from earlier builds and reports what it did", () => {
		const b = new Builder();
		b.node("var.declare");
		b.node("var.set");

		const { script, notes } = migrateScript(b.build());
		expect(script.nodes.map((n) => n.def)).toEqual(["local.declare", "local.set"]);
		expect(notes).toHaveLength(2);
	});

	it("fills in variables for a graph written before they existed", () => {
		const b = new Builder();
		const raw = b.build();
		delete (raw as { variables?: unknown }).variables;

		expect(migrateScript(raw).script.variables).toEqual([]);
	});
});
