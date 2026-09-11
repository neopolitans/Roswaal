/**
 * Find First Descendant is gone, and Find First Child's Recursive replaces it.
 *
 * Roblox has deprecated `FindFirstDescendant`. What matters is that a graph
 * still using it is told what to use instead, and that adding Recursive did not
 * change what an existing Find First Child compiles to.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { GraphNode, Literal } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

/** Pure since 0.31.1, so it is read by whatever wants the child. */
function findChild(literals: Record<string, Literal>): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const where = b.node("value.expression", { literals: { code: { t: "raw", v: "workspace" } } });
	const find = b.node("roblox.findFirstChild", {
		literals: { name: { t: "string", v: "Handle" }, ...literals },
	});
	const print = b.node("debug.print");
	b.link(start, "then", print, "in");
	b.link(where, "result", find, "parent");
	b.link(find, "result", print, "value");
	const result = compile(b.build(), registry);
	expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return body(result.code);
}

describe("Find First Descendant", () => {
	it("is not in the library", () => {
		expect(registry.has("instance.findFirstDescendant")).toBe(false);
	});

	it("tells a graph still using it what to use instead", () => {
		const b = new Builder();
		b.node("instance.findFirstDescendant");
		const errors = compile(b.build(), registry).diagnostics
			.filter((d) => d.severity === "error")
			.map((d) => d.message);
		expect(errors.join("\n")).toContain("Use Find First Child with Recursive set");
		expect(errors.join("\n")).not.toContain("node pack");
	});
});

describe("Find First Child's Recursive", () => {
	it("is not passed when it is left alone", () => {
		expect(findChild({})).toContain(`workspace:FindFirstChild("Handle")`);
	});

	it("searches every descendant when it is set", () => {
		expect(findChild({ recursive: { t: "boolean", v: true } }))
			.toContain(`workspace:FindFirstChild("Handle", true)`);
	});
});

/**
 * It asks a question and changes nothing, which is what every sibling that asks
 * the same one already was. On the execution wire it could not be read into a
 * local without making two: one from the node, one from the Declare Local
 * reading it — which is the line `Occupancy.luau` wanted and could not have.
 */
describe("Find First Child is pure", () => {
	it("has no execution pins", () => {
		const def = registry.get("roblox.findFirstChild")!;
		expect(def.pure).toBe(true);
		expect([...def.inputs, ...def.outputs].filter((pin) => pin.kind === "exec")).toEqual([]);
	});

	/**
	 * In Instances, with the questions it belongs beside. It was in Engine from
	 * when it was impure and sat next to Wait For Child — which is the one of
	 * the pair that belongs there, because it yields.
	 */
	it("is in Instances, and keeps the id a saved graph refers to", () => {
		const def = registry.get("roblox.findFirstChild")!;
		expect(def.category).toBe("Instances");
		expect(def.id).toBe("roblox.findFirstChild");
		expect(registry.get("instance.findFirstChildWhichIsA")!.category).toBe("Instances");
		expect(registry.get("roblox.waitForChild")!.category).toBe("Engine");
	});

	it("is one local when a Declare Local reads it, not two", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const find = b.node("roblox.findFirstChild");
		b.lit(find, "parent", { t: "raw", v: "character" });
		b.lit(find, "name", { t: "string", v: "HumanoidRootPart" });
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "root" });
		b.link(start, "then", declare, "in");
		b.link(find, "result", declare, "value");

		const out = body(compile(b.build(), registry).code);
		expect(out).toContain('local root = character:FindFirstChild("HumanoidRootPart")');
		expect(out.match(/^local /gm)).toHaveLength(1);
	});

	/** Wait For Child stays impure, and the difference is that it yields. */
	it("leaves Wait For Child on the execution wire", () => {
		const wait = registry.get("roblox.waitForChild")!;
		expect(wait.pure).toBeFalsy();
		expect(wait.latent).toBe(true);
	});
});

/**
 * Naming the local, which is the half purity took away.
 *
 * `Config.nodescript` reads one child three times. Three readers is what the
 * multi-consumer rule is for, and binding a local there was never in question
 * -- what was wrong is where the name came from. Binding used to happen on the
 * impure path, which reads `resultName`; purity moved it to the pure path,
 * which never had. So a name typed into the field before the node changed sat
 * in the file being ignored, and the local came back as the pin's name with a
 * number stuck on it: `Child`, then `Child2`.
 */
describe("naming a pure result", () => {
	/** One Find First Child, read `count` times over as many prints. */
	function reads(count: number, opts: Partial<GraphNode> = {}): string {
		const b = new Builder();
		const start = b.node("script.begin");
		const find = b.node("roblox.findFirstChild", opts);
		b.lit(find, "parent", { t: "raw", v: "container" });
		b.lit(find, "name", { t: "string", v: "MovementSpeed" });

		let last = start;
		for (let i = 0; i < count; i += 1) {
			const print = b.node("debug.print");
			b.link(last, "then", print, "in");
			b.link(find, "result", print, "value");
			last = print;
		}

		const result = compile(b.build(), registry);
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		return body(result.code);
	}

	it("binds under the name you typed, not the pin's", () => {
		const out = reads(3, { config: { resultName: "value" } });
		expect(out).toContain(`local value = container:FindFirstChild("MovementSpeed")`);
		expect(out).not.toContain("local Child");
		expect(out.match(/^local /gm)).toHaveLength(1);
	});

	it("falls back to the pin's name when you have not", () => {
		expect(reads(3)).toMatch(/^local Child = /m);
	});

	/**
	 * A name is a request for the local, not a suggestion about what to call one
	 * if a second reader happens to turn up. The field would otherwise do
	 * nothing on the graph most likely to use it, and you would have to
	 * experiment to find that out.
	 */
	it("binds on a name you typed even where one place reads it", () => {
		expect(reads(1, { config: { resultName: "value" } }))
			.toContain(`local value = container:FindFirstChild("MovementSpeed")`);
	});

	it("still splices an unnamed value read once", () => {
		const out = reads(1);
		expect(out).not.toContain("local ");
		expect(out).toContain(`print(container:FindFirstChild("MovementSpeed"))`);
	});

	/** The label named results before the field existed, as it does for Clone. */
	it("honours a label behind the field, and the field in front of it", () => {
		expect(reads(2, { label: "fromLabel" })).toMatch(/^local fromLabel = /m);
		expect(reads(2, { label: "ignored", config: { resultName: "chosen" } }))
			.toMatch(/^local chosen = /m);
	});

	it("shows the chosen name under the header, not instead of it", () => {
		const def = registry.get("roblox.findFirstChild")!;
		expect(def.subtitle?.({ resultName: "value" })).toBe("value");
		expect(def.subtitle?.({})).toBeUndefined();
		expect(def.title).toBe("Find First Child");
	});
});
