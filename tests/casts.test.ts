/**
 * How a Cast reaches the value it asserts about, and when it stops needing to.
 *
 * The interesting half is the last describe: Luau narrows a value for the
 * duration of an `if x:IsA(...)` arm, and a cast inside that arm is a claim the
 * typechecker has already been given. An implicit cast there writes nothing,
 * which is what the hand-written module this mirrors does.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();

const errors = (out: { diagnostics: { severity: string; message: string }[] }) =>
	out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/** A loop over a table, whose Value output is something to cast. */
function loopOver(b: Builder): { start: string; loop: string } {
	const start = b.node("script.begin");
	const table = b.node("table.new");
	const loop = b.node("flow.forEach", { config: { valueName: "part" } });
	b.link(start, "then", table, "in");
	b.link(table, "then", loop, "in");
	b.link(table, "result", loop, "table");
	return { start, loop };
}

describe("a Cast's mode", () => {
	it("binds a local once the value is read twice, by default", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const cast = b.node("cast.as");
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.lit(cast, "value", { t: "raw", v: "thing" });
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(cast, "result", first, "value");
		b.link(cast, "result", second, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("local Cast = (thing :: BasePart)");
	});

	it("writes the line even for one reader when it is explicit", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const cast = b.node("cast.as", { config: { cast: "explicit", resultName: "part" } });
		const print = b.node("debug.print");
		b.lit(cast, "value", { t: "raw", v: "thing" });
		b.link(start, "then", print, "in");
		b.link(cast, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(["local part = (thing :: BasePart)", "print(part)"].join("\n"));
	});

	it("writes no line at all when it is implicit, however many read it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.lit(cast, "value", { t: "raw", v: "thing" });
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(cast, "result", first, "value");
		b.link(cast, "result", second, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe([
			"print((thing :: BasePart))",
			"print((thing :: BasePart))",
		].join("\n"));
	});
});

describe("an implicit Cast inside an Is A branch", () => {
	it("disappears, because Luau has already narrowed the value", () => {
		const b = new Builder();
		const { loop } = loopOver(b);
		const isA = b.node("instance.isA");
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		const print = b.node("debug.print");
		b.link(loop, "value", isA, "instance");
		b.link(isA, "result", branch, "condition");
		b.link(loop, "body", branch, "in");
		b.link(branch, "true", print, "in");
		b.link(loop, "value", cast, "value");
		b.link(cast, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain(`if part:IsA("BasePart") then`);
		expect(body(out.code)).toContain("print(part)");
		expect(body(out.code)).not.toContain("::");
	});

	/** The narrowing is the arm's, not the Branch's. */
	it("stays in the False arm, which proved nothing", () => {
		const b = new Builder();
		const { loop } = loopOver(b);
		const isA = b.node("instance.isA");
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		const print = b.node("debug.print");
		b.link(loop, "value", isA, "instance");
		b.link(isA, "result", branch, "condition");
		b.link(loop, "body", branch, "in");
		b.link(branch, "false", print, "in");
		b.link(loop, "value", cast, "value");
		b.link(cast, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toContain("print((part :: BasePart))");
	});

	it("stays when the claim is narrower than what was proved", () => {
		const b = new Builder();
		const { loop } = loopOver(b);
		const isA = b.node("instance.isA");
		b.lit(isA, "className", { t: "string", v: "Instance" });
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		const print = b.node("debug.print");
		b.link(loop, "value", isA, "instance");
		b.link(isA, "result", branch, "condition");
		b.link(loop, "body", branch, "in");
		b.link(branch, "true", print, "in");
		b.link(loop, "value", cast, "value");
		b.link(cast, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toContain("print((part :: BasePart))");
	});

	/**
	 * The Occupancy case. Two classes tested with `or` narrow the value to
	 * neither of them on its own — it is one or the other — so a cast to the
	 * union is the claim that matches, and it is the claim that disappears.
	 */
	it("disappears for a union when both sides of an Or tested the same value", () => {
		const b = new Builder();
		const { loop } = loopOver(b);
		const decal = b.node("instance.isA");
		const texture = b.node("instance.isA");
		b.lit(decal, "className", { t: "string", v: "Decal" });
		b.lit(texture, "className", { t: "string", v: "Texture" });
		const either = b.node("logic.or");
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		b.lit(cast, "type", { t: "string", v: "Decal | Texture" });
		const print = b.node("debug.print");

		b.link(loop, "value", decal, "instance");
		b.link(loop, "value", texture, "instance");
		b.link(decal, "result", either, "a0");
		b.link(texture, "result", either, "a1");
		b.link(either, "result", branch, "condition");
		b.link(loop, "body", branch, "in");
		b.link(branch, "true", print, "in");
		b.link(loop, "value", cast, "value");
		b.link(cast, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain(`if part:IsA("Decal") or part:IsA("Texture") then`);
		expect(body(out.code)).toContain("print(part)");
	});

	it("keeps a cast to one half of a union, which the Or did not prove", () => {
		const b = new Builder();
		const { loop } = loopOver(b);
		const decal = b.node("instance.isA");
		const texture = b.node("instance.isA");
		b.lit(decal, "className", { t: "string", v: "Decal" });
		b.lit(texture, "className", { t: "string", v: "Texture" });
		const either = b.node("logic.or");
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		b.lit(cast, "type", { t: "string", v: "Decal" });
		const print = b.node("debug.print");

		b.link(loop, "value", decal, "instance");
		b.link(loop, "value", texture, "instance");
		b.link(decal, "result", either, "a0");
		b.link(texture, "result", either, "a1");
		b.link(either, "result", branch, "condition");
		b.link(loop, "body", branch, "in");
		b.link(branch, "true", print, "in");
		b.link(loop, "value", cast, "value");
		b.link(cast, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toContain("print((part :: Decal))");
	});

	it("narrows both values an And tested", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const local = b.node("local.declare");
		b.lit(local, "name", { t: "string", v: "thing" });
		b.lit(local, "value", { t: "raw", v: "workspace.Model" });
		const isA = b.node("instance.isA");
		const other = b.node("logic.and");
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		const print = b.node("debug.print");
		const get = b.node("local.get", { config: { local, name: "thing" } });

		b.link(start, "then", local, "in");
		b.link(local, "then", branch, "in");
		b.link(get, "value", isA, "instance");
		b.link(isA, "result", other, "a0");
		b.link(other, "result", branch, "condition");
		b.link(branch, "true", print, "in");
		b.link(get, "value", cast, "value");
		b.link(cast, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("print(thing)");
	});
});

/**
 * `castsByHierarchy`, off unless a project turns it on: a branch that proved
 * a class derived from the one cast to has already said what the cast says.
 */
describe("an implicit cast proved by a subclass", () => {
	/** Is A `proved` on the loop's value, then an implicit Cast to `claimed`. */
	function proved(provedClass: string, claimed: string, castsByHierarchy?: boolean): string {
		const b = new Builder();
		const { loop } = loopOver(b);
		const isA = b.node("instance.isA");
		b.lit(isA, "className", { t: "string", v: provedClass });
		const branch = b.node("flow.branch");
		const cast = b.node("cast.as", { config: { cast: "implicit" } });
		b.lit(cast, "type", { t: "string", v: claimed });
		const print = b.node("debug.print");
		b.link(loop, "value", isA, "instance");
		b.link(isA, "result", branch, "condition");
		b.link(loop, "body", branch, "in");
		b.link(branch, "true", print, "in");
		b.link(loop, "value", cast, "value");
		b.link(cast, "result", print, "value");
		return body(compile(b.build(), registry, { castsByHierarchy }).code);
	}

	it("is written by default", () => {
		expect(proved("Part", "BasePart")).toContain("print((part :: BasePart))");
	});

	it("is left out when the project asks for it", () => {
		expect(proved("Part", "BasePart", true)).toContain("print(part)");
	});

	it("is still written when the branch proved something wider", () => {
		expect(proved("BasePart", "Part", true)).toContain("print((part :: Part))");
	});

	it("is still written for a class the branch did not prove at all", () => {
		expect(proved("Model", "BasePart", true)).toContain("print((part :: BasePart))");
	});
});
