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
import type { Literal } from "../src/core/schema.js";
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
