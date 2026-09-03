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
