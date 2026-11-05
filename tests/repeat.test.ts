/**
 * Repeat Until: `repeat … until x`, the body first and then the test (0.206.0).
 *
 * While Loop's mirror. What sets it apart is Luau's own rule that `until`
 * sees the body's locals, so the condition is worked out after the body, in
 * its scope, and a local declared in the body can be wired into Until.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { keywordNodes } from "../src/core/keywords.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message);

describe("Repeat Until", () => {
	it("writes the body, then until, then what follows on Completed", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const loop = b.node("flow.repeat");
		b.lit(loop, "condition", { t: "boolean", v: false });
		const inside = b.node("debug.print");
		b.lit(inside, "value", { t: "string", v: "Looking" });
		const after = b.node("debug.print");
		b.lit(after, "value", { t: "string", v: "Done" });
		b.link(begin, "then", loop, "in");
		b.link(loop, "body", inside, "in");
		b.link(loop, "completed", after, "in");
		expect(code(b.build())).toBe('repeat\n\tprint("Looking")\nuntil false\nprint("Done")');
	});

	/** Luau's `until` sees the body's locals; While's condition could not. */
	it("reads a local the body declares", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const loop = b.node("flow.repeat");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "found" });
		b.lit(declare, "value", { t: "boolean", v: true });
		const read = b.node("local.get", { config: { local: declare, name: "found" } });
		b.link(begin, "then", loop, "in");
		b.link(loop, "body", declare, "in");
		b.link(read, "value", loop, "condition");
		const script = b.build();
		expect(errors(script)).toEqual([]);
		expect(code(script)).toBe("repeat\n\tlocal found = true\nuntil found");
	});

	it("is a loop Break can leave", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const loop = b.node("flow.repeat");
		const stop = b.node("flow.break");
		b.link(begin, "then", loop, "in");
		b.link(loop, "body", stop, "in");
		const script = b.build();
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain("repeat\n\tbreak\nuntil true");
	});

	it("is what repeat and until find, and while finds While Loop", () => {
		expect(keywordNodes("repeat")).toEqual(["flow.repeat"]);
		expect(keywordNodes("until")).toEqual(["flow.repeat"]);
		expect(keywordNodes("while")).toEqual(["flow.while"]);
	});
});

describe("repeat, imported", () => {
	function imported(src: string): NodeScript {
		const { name, scriptClass } = graphNameOf("Test.server.luau");
		const result = importLuau(src, {
			name,
			scriptClass,
			target: "roblox",
			idPrefix: "t",
			mode: "nodes",
		});
		if (!result.ok) throw new Error(result.error);
		return result.script;
	}
	const out = (script: NodeScript) =>
		compile(script, registry).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");

	it("becomes Repeat Until, and compiles back to the file", () => {
		const src =
			'local tries = 0\nrepeat\n\ttries += 1\n\tprint("Try")\nuntil tries >= 3\nprint(tries)\n';
		const script = imported(src);
		expect(script.nodes.filter((n) => n.def === "flow.repeat")).toHaveLength(1);
		expect(out(script)).toBe(src);
	});

	it("wires a local the body declares into Until", () => {
		const src = "repeat\n\tlocal roll = math.random(1, 6)\n\tprint(roll)\nuntil roll == 6\n";
		const script = imported(src);
		expect(script.nodes.filter((n) => n.def === "flow.repeat")).toHaveLength(1);
		expect(errors(script)).toEqual([]);
		expect(out(script)).toBe(src);
	});
});
