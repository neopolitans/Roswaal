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

function findChild(literals: Record<string, Literal>): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const where = b.node("value.expression", { literals: { code: { t: "raw", v: "workspace" } } });
	const find = b.node("roblox.findFirstChild", {
		literals: { name: { t: "string", v: "Handle" }, ...literals },
	});
	b.link(start, "then", find, "in");
	b.link(where, "result", find, "parent");
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
