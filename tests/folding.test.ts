/**
 * A result read only by something that names it is written straight into it.
 *
 * A Find First Child with a Result name, wired into a Declare Local, made two
 * locals: `local child = parent:FindFirstChild(name)` and then
 * `local named = child`. The Declare Local names the value; the first local
 * only held it on the way.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function code(script: NodeScript): string {
	const result = compile(script, registry);
	expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return body(result.code);
}

function locals(out: string): number {
	return (out.match(/^local /gm) ?? []).length;
}

/** A named Find First Child, read by a Declare Local called `named`. */
function findIntoDeclare(extraReader = false): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const find = b.node("roblox.findFirstChild", { config: { resultName: "child" } });
	b.lit(find, "parent", { t: "raw", v: "parent" });
	b.lit(find, "name", { t: "string", v: "Handle" });
	const declare = b.node("local.declare");
	b.lit(declare, "name", { t: "string", v: "named" });
	b.link(start, "then", declare, "in");
	b.link(find, "result", declare, "value");
	if (extraReader) {
		const print = b.node("debug.print");
		b.link(declare, "then", print, "in");
		b.link(find, "result", print, "value");
	}
	return code(b.build());
}

describe("a pure result read by a Declare Local", () => {
	it("is one local, named by the Declare Local, even with a Result name", () => {
		const out = findIntoDeclare();
		expect(out).toContain('local named = parent:FindFirstChild("Handle")');
		expect(locals(out)).toBe(1);
	});

	it("keeps its own local when something else reads it too", () => {
		const out = findIntoDeclare(true);
		expect(out).toContain('local child = parent:FindFirstChild("Handle")');
		expect(out).toContain("local named = child");
	});
});

describe("a pure result read by a setter or a table field", () => {
	it("goes straight into a Set Variable", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const find = b.node("roblox.findFirstChild", { config: { resultName: "child" } });
		b.lit(find, "parent", { t: "raw", v: "parent" });
		b.lit(find, "name", { t: "string", v: "Handle" });
		const set = b.node("variable.set", { config: { variable: "v1" } });
		b.link(start, "then", set, "in");
		b.link(find, "result", set, "value");
		const out = code(b.build({ variables: [{ id: "v1", name: "Handle", type: "Instance", default: { t: "raw", v: "nil" } }] }));
		expect(out).toContain('Handle = parent:FindFirstChild("Handle")');
		expect(out).not.toContain("local child");
	});

	it("goes straight into a table field", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const find = b.node("roblox.findFirstChild", { config: { resultName: "child" } });
		b.lit(find, "parent", { t: "raw", v: "parent" });
		b.lit(find, "name", { t: "string", v: "Handle" });
		const pair = b.node("table.pair");
		b.lit(pair, "key", { t: "string", v: "handle" });
		const table = b.node("table.dictionary", { config: { args: 1 } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(find, "result", pair, "value");
		b.link(pair, "result", table, "p0");
		b.link(table, "result", print, "value");
		const out = code(b.build());
		expect(out).toContain('handle = parent:FindFirstChild("Handle")');
		expect(out).not.toContain("local child");
	});
});

describe("a step's result", () => {
	/** Clone, then a Declare Local; `adjacent` puts nothing between them. */
	function cloneInto(adjacent: boolean): string {
		const b = new Builder();
		const start = b.node("script.begin");
		const clone = b.node("instance.clone", { config: { resultName: "copy" } });
		b.lit(clone, "instance", { t: "raw", v: "workspace.Model" });
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "tank" });
		b.link(start, "then", clone, "in");
		if (adjacent) {
			b.link(clone, "then", declare, "in");
		} else {
			const between = b.node("debug.print");
			b.lit(between, "value", { t: "string", v: "between" });
			b.link(clone, "then", between, "in");
			b.link(between, "then", declare, "in");
		}
		b.link(clone, "result", declare, "value");
		return code(b.build());
	}

	it("goes into the Declare Local that runs straight after it", () => {
		const out = cloneInto(true);
		expect(out).toMatch(/^local tank(: \w+)? = workspace\.Model:Clone\(\)$/m);
		expect(locals(out)).toBe(1);
	});

	it("keeps its local when anything runs in between, so the call does not move", () => {
		const out = cloneInto(false);
		expect(out).toMatch(/^local copy(: \w+)? = workspace\.Model:Clone\(\)$/m);
		const cloneAt = out.indexOf(":Clone()");
		expect(cloneAt).toBeLessThan(out.indexOf('print("between")'));
	});
});
