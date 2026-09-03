import { describe, expect, it } from "vitest";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { migrateScript } from "../src/core/migrate.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function errors(result: { diagnostics: { severity: string; message: string }[] }): string[] {
	return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
}

describe("emitter", () => {
	it("emits a straight-line script", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		b.lit(print, "value", { t: "string", v: "hello" });
		b.link(start, "then", print, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(`print("hello")`);
	});

	it("inlines a pure value with one consumer", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const print = b.node("debug.print");
		b.lit(add, "a0", { t: "number", v: 2 }).lit(add, "a1", { t: "number", v: 3 });
		b.link(start, "then", print, "in");
		b.link(add, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(`print(2 + 3)`);
	});

	it("binds a pure value once when two wires leave the pin", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const p1 = b.node("debug.print");
		const p2 = b.node("debug.print");
		b.lit(add, "a0", { t: "number", v: 2 }).lit(add, "a1", { t: "number", v: 3 });
		b.link(start, "then", p1, "in");
		b.link(p1, "then", p2, "in");
		b.link(add, "result", p1, "value");
		b.link(add, "result", p2, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		// The sum is computed once and reused, rather than duplicated.
		expect(body(out.code)).toBe(["local Add = 2 + 3", "print(Add)", "print(Add)"].join("\n"));
	});

	it("parenthesises spliced expressions so precedence survives", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const mul = b.node("math.mul");
		const print = b.node("debug.print");
		b.lit(add, "a0", { t: "number", v: 1 }).lit(add, "a1", { t: "number", v: 2 });
		b.lit(mul, "a1", { t: "number", v: 10 });
		b.link(add, "result", mul, "a0");
		b.link(mul, "result", print, "value");
		b.link(start, "then", print, "in");

		const out = compile(b.build(), registry);
		expect(body(out.code)).toBe(`print((1 + 2) * 10)`);
	});

	it("emits branches", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const yes = b.node("debug.print");
		const no = b.node("debug.print");
		b.lit(yes, "value", { t: "string", v: "yes" });
		b.lit(no, "value", { t: "string", v: "no" });
		b.lit(branch, "condition", { t: "boolean", v: true });
		b.link(start, "then", branch, "in");
		b.link(branch, "true", yes, "in");
		b.link(branch, "false", no, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["if true then", `\tprint("yes")`, "else", `\tprint("no")`, "end"].join("\n"),
		);
	});

	it("scopes a loop index to the loop body", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const loop = b.node("flow.forRange");
		const print = b.node("debug.print");
		const done = b.node("debug.print");
		b.lit(done, "value", { t: "string", v: "done" });
		b.link(start, "then", loop, "in");
		b.link(loop, "body", print, "in");
		b.link(loop, "index", print, "value");
		b.link(loop, "completed", done, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["for i = 1, 10 do", "\tprint(i)", "end", `print("done")`].join("\n"),
		);
	});

	it("reports a loop index read from outside the loop", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const loop = b.node("flow.forRange");
		const after = b.node("debug.print");
		b.link(start, "then", loop, "in");
		b.link(loop, "completed", after, "in");
		b.link(loop, "index", after, "value");

		const out = compile(b.build(), registry);
		expect(errors(out).join(" ")).toContain("not in scope");
	});

	it("rejects break outside a loop", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const brk = b.node("flow.break");
		b.link(start, "then", brk, "in");

		const out = compile(b.build(), registry);
		expect(errors(out).join(" ")).toContain("only valid inside a loop");
	});

	it("rejects an execution cycle instead of emitting forever", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(c, "then", a, "in");

		const out = compile(b.build(), registry);
		expect(errors(out).join(" ")).toContain("loop back");
	});

	it("builds a module return table from exported functions", () => {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [{ name: "message", type: "string" }] },
		});
		const ret = b.node("function.return", { config: { returns: [{ name: "message", type: "string" }] } });
		const concat = b.node("string.concat");
		const exports = b.node("module.exports", { config: { exports: [{ name: "greet" }] } });
		b.lit(concat, "a0", { t: "string", v: "hi " });
		b.link(fn, "then", ret, "in");
		b.link(fn, "p0", concat, "a1");
		b.link(concat, "result", ret, "r0");
		b.link(fn, "self", exports, "e0");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				"local function greet(who: string): string",
				`\treturn "hi " .. who`,
				"end",
				"",
				"return {",
				"\tgreet = greet,",
				"}",
			].join("\n"),
		);
	});

	it("returns a single export directly rather than wrapping it", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "run" } });
		const exports = b.node("module.exports");
		b.link(fn, "self", exports, "e0");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(body(out.code)).toContain("return run");
	});

	it("wraps connect bodies in a handler", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const service = b.node("roblox.getService");
		const prop = b.node("roblox.getProperty");
		const connect = b.node("event.connect", {
			config: { params: [{ name: "player", type: "Instance" }] },
		});
		const print = b.node("debug.print");
		b.lit(service, "service", { t: "string", v: "Players" });
		b.lit(prop, "property", { t: "string", v: "PlayerAdded" });
		b.link(start, "then", connect, "in");
		b.link(service, "service", prop, "instance");
		b.link(prop, "result", connect, "signal");
		b.link(connect, "body", print, "in");
		b.link(connect, "p0", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		// The service is hoisted to the top, below the flags, the way a
		// hand-written Roblox file has it.
		expect(body(out.code)).toBe(
			[
				`local Players = game:GetService("Players")`,
				"",
				"Players.PlayerAdded:Connect(function(player: Instance)",
				"\tprint(player)",
				"end)",
			].join("\n"),
		);
	});

	it("names output files the way Rojo expects", () => {
		const b = new Builder("Greeter");
		expect(compile(b.build({ scriptClass: "ModuleScript" }), registry).fileName).toBe("Greeter.luau");
		expect(compile(b.build({ scriptClass: "LocalScript" }), registry).fileName).toBe("Greeter.client.luau");
		expect(compile(b.build({ scriptClass: "Script" }), registry).fileName).toBe("Greeter.server.luau");
		expect(compile(b.build({ scriptClass: "Script", runContext: "Client" }), registry).fileName)
			.toBe("Greeter.client.luau");
	});

	it("is deterministic and ignores node positions", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");

		const first = compile(b.build(), registry);
		const moved = b.build();
		moved.nodes = moved.nodes.map((n) => ({ ...n, x: n.x + 500, y: n.y - 320 }));
		const second = compile(moved, registry);

		expect(second.code).toBe(first.code);
		expect(second.sourceHash).toBe(first.sourceHash);
	});
});

describe("variadic operators", () => {
	it("defaults to two operands", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const print = b.node("debug.print");
		b.lit(add, "a0", { t: "number", v: 1 }).lit(add, "a1", { t: "number", v: 2 });
		b.link(start, "then", print, "in");
		b.link(add, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toBe("print(1 + 2)");
	});

	it("folds as many operands as the node is configured for", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add", { config: { args: 4 } });
		const print = b.node("debug.print");
		for (let i = 0; i < 4; i++) b.lit(add, `a${i}`, { t: "number", v: i + 1 });
		b.link(start, "then", print, "in");
		b.link(add, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toBe("print(1 + 2 + 3 + 4)");
	});

	it("parenthesises each operand so precedence survives the fold", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const inner = b.node("math.add");
		const outer = b.node("math.mul", { config: { args: 3 } });
		const print = b.node("debug.print");
		b.lit(inner, "a0", { t: "number", v: 1 }).lit(inner, "a1", { t: "number", v: 2 });
		b.lit(outer, "a1", { t: "number", v: 10 }).lit(outer, "a2", { t: "number", v: 3 });
		b.link(inner, "result", outer, "a0");
		b.link(outer, "result", print, "value");
		b.link(start, "then", print, "in");

		expect(body(compile(b.build(), registry).code)).toBe("print((1 + 2) * 10 * 3)");
	});

	it("folds a call-shaped operator into its argument list", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const min = b.node("math.min", { config: { args: 3 } });
		const print = b.node("debug.print");
		for (let i = 0; i < 3; i++) b.lit(min, `a${i}`, { t: "number", v: i + 5 });
		b.link(start, "then", print, "in");
		b.link(min, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toBe("print(math.min(5, 6, 7))");
	});

	it("migrates the old a/b pins onto the numbered run", () => {
		const b = new Builder();
		const add = b.node("math.add", { id: "sum" });
		const print = b.node("debug.print", { id: "p" });
		b.link(add, "result", print, "value");
		const raw = b.build();
		raw.links.push({
			id: "old",
			from: { node: "src", pin: "result" },
			to: { node: "sum", pin: "a" },
		});
		raw.nodes.push({ id: "src", def: "value.number", x: 0, y: 0 });

		raw.nodes.find((n) => n.id === "sum")!.literals = { b: { t: "number", v: 7 } };

		const { script } = migrateScript(raw);
		expect(script.links.find((l) => l.id === "old")?.to.pin).toBe("a0");
		// The value typed into the old pin moves with it, rather than reverting
		// to the default while the wire quietly still works.
		expect(script.nodes.find((n) => n.id === "sum")?.literals).toEqual({
			a1: { t: "number", v: 7 },
		});
	});
});

describe("block termination", () => {
	/**
	 * Luau requires return to be the last statement in a block, so a Sequence
	 * output that returns cannot be followed by another. Emitting it anyway
	 * produced a file that would not parse.
	 */
	it("refuses a Sequence output after one that returns", () => {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: { name: "pick", params: [], returns: [{ name: "v", type: "number" }] },
		});
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const ret = b.node("function.return", { config: { returns: [{ name: "v", type: "number" }] } });
		const print = b.node("debug.print");
		b.lit(ret, "r0", { t: "number", v: 1 });
		b.link(fn, "then", seq, "in");
		b.link(seq, "s0", ret, "in");
		b.link(seq, "s1", print, "in");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(errors(out).join(" ")).toContain("could never run");
		// And the unreachable statement is not emitted after the return.
		expect(body(out.code)).not.toContain("print");
	});

	it("allows a Sequence whose last output returns", () => {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: { name: "pick", params: [], returns: [{ name: "v", type: "number" }] },
		});
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const print = b.node("debug.print");
		const ret = b.node("function.return", { config: { returns: [{ name: "v", type: "number" }] } });
		b.lit(ret, "r0", { t: "number", v: 1 });
		b.link(fn, "then", seq, "in");
		b.link(seq, "s0", print, "in");
		b.link(seq, "s1", ret, "in");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("\treturn 1");
	});

	/** A return inside a branch closes only that arm's block. */
	it("keeps emitting after a Branch whose arm returns", () => {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: { name: "pick", params: [], returns: [{ name: "v", type: "number" }] },
		});
		const branch = b.node("flow.branch");
		const early = b.node("function.return", { config: { returns: [{ name: "v", type: "number" }] } });
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const after = b.node("debug.print");
		b.lit(early, "r0", { t: "number", v: 0 });
		b.link(fn, "then", seq, "in");
		b.link(seq, "s0", branch, "in");
		b.link(branch, "true", early, "in");
		b.link(seq, "s1", after, "in");

		const out = compile(b.build({ scriptClass: "ModuleScript" }), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("print");
	});

	it("stops a chain dead after Script End", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const stop = b.node("script.end");
		const never = b.node("debug.print");
		b.link(start, "then", stop, "in");
		// Wiring past a terminal node is possible; emitting past it is not.
		b.link(stop, "in", never, "in");

		expect(body(compile(b.build(), registry).code)).not.toContain("print");
	});

	it("keeps emitting after a loop whose body breaks", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const loop = b.node("flow.forRange");
		const brk = b.node("flow.break");
		const after = b.node("debug.print");
		b.link(start, "then", loop, "in");
		b.link(loop, "body", brk, "in");
		b.link(loop, "completed", after, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["for i = 1, 10 do", "\tbreak", "end", `print("Hello")`].join("\n"),
		);
	});
});

describe("reroute knots", () => {
	/** A knot is a bend in a wire, so it must leave the output untouched. */
	it("passes a data wire through and emits nothing", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const knot = b.node("flow.reroute", { config: { type: "number" } });
		const print = b.node("debug.print");
		b.lit(add, "a0", { t: "number", v: 2 }).lit(add, "a1", { t: "number", v: 3 });
		b.link(start, "then", print, "in");
		b.link(add, "result", knot, "in");
		b.link(knot, "out", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		// Identical to wiring the two directly: no local, no parentheses added.
		expect(body(out.code)).toBe("print(2 + 3)");
	});

	it("passes an execution wire through and emits nothing", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const knot = b.node("flow.rerouteExec");
		const print = b.node("debug.print");
		b.link(start, "then", knot, "in");
		b.link(knot, "then", print, "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(`print("Hello")`);
	});

	it("stays invisible through a chain of knots", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const value = b.node("value.number");
		const first = b.node("flow.reroute", { config: { type: "number" } });
		const second = b.node("flow.reroute", { config: { type: "number" } });
		const print = b.node("debug.print");
		b.lit(value, "value", { t: "number", v: 42 });
		b.link(start, "then", print, "in");
		b.link(value, "result", first, "in");
		b.link(first, "out", second, "in");
		b.link(second, "out", print, "value");

		expect(body(compile(b.build(), registry).code)).toBe("print(42)");
	});

	/**
	 * A knot must not become a hoisting point: two consumers of one value should
	 * still bind that value once, not once per branch of the knot.
	 */
	it("does not change how a shared value is bound", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const knot = b.node("flow.reroute", { config: { type: "number" } });
		const p1 = b.node("debug.print");
		const p2 = b.node("debug.print");
		b.lit(add, "a0", { t: "number", v: 1 }).lit(add, "a1", { t: "number", v: 1 });
		b.link(start, "then", p1, "in");
		b.link(p1, "then", p2, "in");
		b.link(add, "result", knot, "in");
		b.link(knot, "out", p1, "value");
		b.link(knot, "out", p2, "value");

		const code = body(compile(b.build(), registry).code);
		expect(code.match(/1 \+ 1/g)).toHaveLength(1);
	});
});
