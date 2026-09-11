/**
 * Calling a function where a value is wanted.
 *
 * `Config.luau` ends on a line the graph could not write:
 *
 * ```lua
 * return { movementSpeed = readNumber(hullSettings, "MovementSpeed") }
 * ```
 *
 * Call Function sits on the execution wire, so its result binds to a local and
 * the table refers to that — `local result = readNumber(...)` and then
 * `{ movementSpeed = result }`. Correct Luau, and not the line: there is
 * nowhere inside a table literal to put an execution wire.
 *
 * Call For Value is pure, so it splices into whatever reads it. The line it
 * draws is the one the Instances section already draws — side effects, not
 * syntax. A call that changes something stays on the wire where its order can
 * be seen.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/**
 * `readNumber(container, name)`, and a `read(tank)` that returns a table built
 * from one call to it — the shape of the module being converted.
 */
function readerAndCaller(callDef: string) {
	const b = new Builder();

	const reader = b.node("function.entry", {
		config: {
			name: "readNumber",
			params: [{ name: "container", type: "Instance" }, { name: "name", type: "string" }],
			returns: [{ name: "n", type: "number" }],
		},
	});
	const readerReturn = b.node("function.return", { config: { returns: [{ name: "n", type: "number" }] } });
	b.lit(readerReturn, "r0", { t: "number", v: 0 });
	b.link(reader, "then", readerReturn, "in");

	const read = b.node("function.entry", {
		config: {
			name: "read",
			params: [{ name: "tank", type: "Model" }],
			returns: [{ name: "cfg", type: "Config" }],
		},
	});
	const ref = b.node("function.get", { config: { function: reader, name: "readNumber" } });
	const call = b.node(callDef, { config: { args: 2 } });
	const dict = b.node("table.dictionary", { config: { args: 1, split: { "in:p0": "keyValue" } } });
	const ret = b.node("function.return", { config: { returns: [{ name: "cfg", type: "Config" }] } });

	b.link(ref, "fn", call, "fn");
	b.link(read, "p0", call, "a0");
	b.lit(call, "a1", { t: "string", v: "MovementSpeed" });
	b.lit(dict, "p0.key", { t: "string", v: "movementSpeed" });
	b.link(call, "result", dict, "p0.value");
	b.link(dict, "result", ret, "r0");

	// The impure one needs threading onto the wire; the pure one must not be.
	if (callDef === "call.function") {
		b.link(read, "then", call, "in");
		b.link(call, "then", ret, "in");
	} else {
		b.link(read, "then", ret, "in");
	}

	return b.build();
}

describe("Call For Value", () => {
	/** The line, as the module writes it. */
	it("puts the call inside the table, with no local in between", () => {
		const out = code(readerAndCaller("call.value"));
		expect(out).toContain('return { movementSpeed = readNumber(tank, "MovementSpeed") }');
	});

	it("compiles without complaint", () => {
		expect(errors(readerAndCaller("call.value"))).toEqual([]);
	});

	/**
	 * What it is being contrasted with. Call Function is not wrong here — it is
	 * a different line, and this says which.
	 */
	it("is the difference between it and Call Function", () => {
		const wired = code(readerAndCaller("call.function"));
		expect(wired).toMatch(/local \w+ = readNumber\(tank, "MovementSpeed"\)/);
		expect(wired).not.toContain('{ movementSpeed = readNumber(');
	});

	/** Pure means no execution pins at all, which is what lets it sit anywhere. */
	it("has no execution pins", () => {
		const def = registry.get("call.value")!;
		expect(def.pure).toBe(true);
		expect([...def.inputs, ...def.outputs].some((p) => p.kind === "exec")).toBe(false);
	});

	it("takes as many arguments as it is given", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "noArgs", params: [], returns: [{ name: "n", type: "number" }] } });
		const fnRet = b.node("function.return", { config: { returns: [{ name: "n", type: "number" }] } });
		b.lit(fnRet, "r0", { t: "number", v: 1 });
		b.link(fn, "then", fnRet, "in");

		const begin = b.node("script.begin");
		const ref = b.node("function.get", { config: { function: fn, name: "noArgs" } });
		const call = b.node("call.value", { config: { args: 0 } });
		const print = b.node("debug.print");
		b.link(ref, "fn", call, "fn");
		b.link(begin, "then", print, "in");
		b.link(call, "result", print, "value");

		expect(code(b.build())).toContain("print(noArgs())");
	});

	/**
	 * Used twice it is bound to a local first, like every other pure value —
	 * the work happens once however many wires leave the pin.
	 */
	it("is bound to a local when two things read it", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { name: "roll", params: [], returns: [{ name: "n", type: "number" }] } });
		const fnRet = b.node("function.return", { config: { returns: [{ name: "n", type: "number" }] } });
		b.lit(fnRet, "r0", { t: "number", v: 1 });
		b.link(fn, "then", fnRet, "in");

		const begin = b.node("script.begin");
		const ref = b.node("function.get", { config: { function: fn, name: "roll" } });
		const call = b.node("call.value", { config: { args: 0 } });
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(ref, "fn", call, "fn");
		b.link(begin, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(call, "result", first, "value");
		b.link(call, "result", second, "value");

		const out = code(b.build());
		// Once as a local, and never again — `local function roll()` is the
		// declaration and does not count, which is what the first version of
		// this test counted and why it looked broken.
		const bound = out.match(/^local (\w+) = roll\(\)$/m);
		expect(bound, out).not.toBeNull();
		const calls = out.split("\n").filter(
			(line) => line.includes("roll()") && !line.startsWith("local function"),
		);
		expect(calls, out).toHaveLength(1);
		expect(out).toContain(`print(${bound![1]})`);
	});
});

/**
 * The other half of that line: the signature above it.
 *
 * `function TankConfig.read(tank: Model): Config` needs two type names the
 * emitter used to write as `any`. These are here rather than in
 * `subtypes.test.ts` because it is the same line of the same file.
 */
describe("the signature the same module needs", () => {
	it("keeps Model and Config", () => {
		const out = code(readerAndCaller("call.value"));
		expect(out).toContain("(tank: Model): Config");
	});
});
