/**
 * Bind on a Branch and a While Loop: Luau's conditional bindings (RFC #238,
 * `if local x = … then`, `while local x = … do`), written the way the RFC says
 * they mean, because Luau cannot run that syntax yet: the condition in a local
 * of its own, then the test. The bound value is a pin on the True side, or in
 * the body, and nowhere else.
 */

import { describe, expect, it } from "vitest";

import { retypeBoundValues } from "../src/core/boundValues.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const errors = (out: { diagnostics: { severity: string; message: string }[] }) =>
	out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/** `admins[id]`, a value that may be nil. */
function lookup(b: Builder, table = "admins", key = "id"): string {
	const node = b.node("table.getKey");
	b.lit(node, "table", { t: "raw", v: table });
	b.lit(node, "key", { t: "raw", v: key });
	return node;
}

/** A print of a wired value. */
function printOf(b: Builder, from: string, pin: string): string {
	const node = b.node("debug.print");
	b.link(from, pin, node, "value");
	return node;
}

/** A print whose text is its own name. */
function says(b: Builder, text: string): string {
	const node = b.node("debug.print");
	b.lit(node, "value", { t: "string", v: text });
	return node;
}

describe("a Branch with Bind on", () => {
	it("keeps the condition in a local, tests it, and hands it to the True side", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch", { config: { bind: true, bindName: "admin" } });
		b.link(start, "then", branch, "in");
		b.link(lookup(b), "result", branch, "condition");
		b.link(branch, "true", printOf(b, branch, "value"), "in");
		b.link(branch, "false", says(b, "none"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				"local admin = admins[id]",
				"if admin then",
				"\tprint(admin)",
				"else",
				'\tprint("none")',
				"end",
			].join("\n"),
		);
	});

	it("writes const when asked", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch", {
			config: { bind: true, bindName: "admin", bindConst: true },
		});
		b.link(start, "then", branch, "in");
		b.link(lookup(b), "result", branch, "condition");
		b.link(branch, "true", printOf(b, branch, "value"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["const admin = admins[id]", "if admin then", "\tprint(admin)", "end"].join("\n"),
		);
	});

	it("is never an elseif: on a False pin, it opens an else with its local first", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("flow.branch", { config: { bind: true, bindName: "admin" } });
		const second = b.node("flow.branch", { config: { bind: true, bindName: "guest" } });
		b.link(start, "then", first, "in");
		b.link(lookup(b, "admins"), "result", first, "condition");
		b.link(first, "true", printOf(b, first, "value"), "in");
		b.link(first, "false", second, "in");
		b.link(lookup(b, "guests"), "result", second, "condition");
		b.link(second, "true", printOf(b, second, "value"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				"local admin = admins[id]",
				"if admin then",
				"\tprint(admin)",
				"else",
				"\tlocal guest = guests[id]",
				"\tif guest then",
				"\t\tprint(guest)",
				"\tend",
				"end",
			].join("\n"),
		);
	});

	it("says where its value exists when the False side reads it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch", { config: { bind: true, bindName: "admin" } });
		b.link(start, "then", branch, "in");
		b.link(lookup(b), "result", branch, "condition");
		b.link(branch, "false", printOf(b, branch, "value"), "in");

		expect(errors(compile(b.build(), registry))).toEqual([
			'"admin" only exists on the True side of its Branch, where it is not nil or false.',
		]);
	});

	it("leaves a Branch without Bind as it was", () => {
		const def = registry.get("flow.branch")!;
		expect(resolveNodePins(def, {}).outputs.map((p) => p.id)).toEqual(["true", "false"]);
		expect(resolveNodePins(def, { bind: true }).outputs.map((p) => p.id)).toEqual([
			"true",
			"value",
			"false",
		]);
	});
});

describe("a While Loop with Bind on", () => {
	it("keeps each pass's condition in a local, stops on nil, and hands it to the body", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const loop = b.node("flow.while", { config: { bind: true, bindName: "item" } });
		b.link(start, "then", loop, "in");
		b.link(lookup(b, "queue", "head"), "result", loop, "condition");
		b.link(loop, "body", printOf(b, loop, "value"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				"while true do",
				"\tlocal item = queue[head]",
				"\tif not item then break end",
				"\tprint(item)",
				"end",
			].join("\n"),
		);
	});
});

describe("the bound value's type", () => {
	it("is what the condition is wired to, and nothing when it is wired to nothing", () => {
		const b = new Builder();
		const branch = b.node("flow.branch", { config: { bind: true } });
		const length = b.node("table.length");
		b.link(length, "result", branch, "condition");
		const typed = retypeBoundValues(b.build(), registry);
		const node = typed.nodes.find((n) => n.id === branch)!;
		expect(node.config?.boundType).toBe("number");
		const def = registry.get("flow.branch")!;
		expect(resolveNodePins(def, node.config).outputs.find((p) => p.id === "value")?.type).toBe(
			"number",
		);

		const unwired = retypeBoundValues({ ...typed, links: [] }, registry);
		expect(unwired.nodes.find((n) => n.id === branch)?.config?.boundType).toBeUndefined();
		// Nothing to change is the same script back.
		expect(retypeBoundValues(unwired, registry)).toBe(unwired);
	});
});
