/**
 * A value read twice, and whether it gets a local.
 *
 * The rule is "bind it once so an expensive or side-effecting expression is not
 * worked out twice", and it was applied to everything. `restore.weld` is not
 * expensive, and the hand-written module this mirrors writes the path again at
 * each use — so a plain access path is repeated and everything else is bound.
 *
 * There is a correctness argument as well as a readability one, and it is the
 * stronger of the two: the local is a snapshot. A Set Index between the two
 * reads never reaches it, so the graph would say "read this field here" and the
 * file would not.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { isAccessPath } from "../src/core/compiler/luau.js";

const registry = createRegistry();

const errors = (out: { diagnostics: { severity: string; message: string }[] }) =>
	out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

describe("what counts as an access path", () => {
	const paths = [
		"restore",
		"restore.weld",
		"Occupancy.VALUE_NAME",
		"Vector3.zero",
		"Enum.HumanoidDisplayDistanceType.None",
		"t[1]",
		't["name"]',
		"t[i]",
		"a.b.c[2].d",
	];
	for (const path of paths) {
		it(`${path} is one`, () => expect(isAccessPath(path)).toBe(true));
	}

	const notPaths = [
		"",
		"f()",
		"tank:FindFirstChild(name)",
		"tank:FindFirstChild(name).Name",
		"t[f()]",
		"a + b",
		"not a",
		"(a or b)",
		"value :: BasePart",
		"{ x = 1 }",
	];
	for (const expr of notPaths) {
		it(`${expr || "an empty string"} is not`, () => expect(isAccessPath(expr)).toBe(false));
	}
});

describe("a pure value read twice", () => {
	/**
	 * The shape from Occupancy.show: `restore` is the local, and `restore.weld`
	 * is written at both use sites rather than hoisted beside it.
	 */
	it("writes the path again rather than hoisting it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const local = b.node("local.declare");
		b.lit(local, "name", { t: "string", v: "restore" });
		b.lit(local, "value", { t: "raw", v: "restores[character]" });
		const get = b.node("table.getKey");
		b.lit(get, "key", { t: "string", v: "weld" });
		const branch = b.node("flow.branch");
		const print = b.node("debug.print");

		b.link(start, "then", local, "in");
		b.link(local, "then", branch, "in");
		b.link(local, "ref", get, "table");
		b.link(get, "result", branch, "condition");
		b.link(branch, "true", print, "in");
		b.link(get, "result", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe([
			"local restore = restores[character]",
			"if restore.weld then",
			"\tprint(restore.weld)",
			"end",
		].join("\n"));
	});

	/** A call is the case the rule was written for, and it still binds. */
	it("still binds a call, which must not run twice", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const random = b.node("math.random");
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(random, "result", first, "value");
		b.link(random, "result", second, "value");

		const out = body(compile(b.build(), registry).code);
		expect(out).toContain("local Random = math.random(1, 100)");
		expect(out.match(/math\.random/g)).toHaveLength(1);
	});

	it("still binds an expression, which is work rather than a name", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		b.lit(add, "a0", { t: "number", v: 2 });
		b.lit(add, "a1", { t: "number", v: 3 });
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(add, "result", first, "value");
		b.link(add, "result", second, "value");

		expect(body(compile(b.build(), registry).code)).toContain("local Add = 2 + 3");
	});

	/** A path off a call is not a path: the call would run twice. */
	it("still binds a path reached through a call", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		// Pure, so it is spliced into the Get Key rather than given a line of
		// its own -- which is exactly what makes the path below not a path.
		const find = b.node("roblox.findFirstChild");
		b.lit(find, "parent", { t: "raw", v: "workspace" });
		b.lit(find, "name", { t: "string", v: "Model" });
		const get = b.node("table.getKey");
		b.lit(get, "key", { t: "string", v: "Name" });
		const first = b.node("debug.print");
		const second = b.node("debug.print");

		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(find, "result", get, "table");
		b.link(get, "result", first, "value");
		b.link(get, "result", second, "value");

		const out = body(compile(b.build(), registry).code);
		expect(out.match(/FindFirstChild/g)).toHaveLength(1);
	});

	/** Naming the result is a request for the local, and still wins. */
	it("binds a path anyway when the result has been named", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const local = b.node("local.declare");
		b.lit(local, "name", { t: "string", v: "restore" });
		b.lit(local, "value", { t: "raw", v: "nil" });
		const get = b.node("table.getKey", { config: { resultName: "weld" } });
		b.lit(get, "key", { t: "string", v: "weld" });
		const print = b.node("debug.print");

		b.link(start, "then", local, "in");
		b.link(local, "then", print, "in");
		b.link(local, "ref", get, "table");
		b.link(get, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toContain("local weld = restore.weld");
	});
});
