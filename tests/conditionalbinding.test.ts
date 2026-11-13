/**
 * Bind on a Branch and a While Loop: Luau's conditional bindings (RFC #238,
 * `if local x = … then`, `while local x = … do`), in Studio's If Local/Const
 * Bindings beta. Written as that syntax, read back as it, and the bound value
 * is a pin on the True side, or in the body, and nowhere else.
 */

import { describe, expect, it } from "vitest";

import { retypeBoundValues } from "../src/core/boundValues.js";
import { compile } from "../src/core/compiler/index.js";
import { importLuau } from "../src/core/import/fromLuau.js";
import { checkLuau } from "../src/core/luau/check.js";
import { localsAt } from "../src/core/luau/scope.js";
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

const lines = (...rows: string[]) => rows.join("\n");

describe("a Branch with Bind on", () => {
	it("writes if local, and hands the value to the True side", () => {
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
			lines("if local admin = admins[id] then", "\tprint(admin)", "else", '\tprint("none")', "end"),
		);
	});

	it("writes if const when asked", () => {
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
		expect(body(out.code)).toBe(lines("if const admin = admins[id] then", "\tprint(admin)", "end"));
	});

	it("on another Branch's False pin, is an elseif local", () => {
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
		b.link(second, "false", says(b, "nobody"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			lines(
				"if local admin = admins[id] then",
				"\tprint(admin)",
				"elseif local guest = guests[id] then",
				"\tprint(guest)",
				"else",
				'\tprint("nobody")',
				"end",
			),
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
	it("writes while local, and hands each pass's value to the body", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const loop = b.node("flow.while", { config: { bind: true, bindName: "item" } });
		b.link(start, "then", loop, "in");
		b.link(lookup(b, "queue", "head"), "result", loop, "condition");
		b.link(loop, "body", printOf(b, loop, "value"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(lines("while local item = queue[head] do", "\tprint(item)", "end"));
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

describe("reading conditional bindings", () => {
	it.each([
		"if local admin = admins[id] then print(admin) end",
		"if const admin = admins[id] then print(admin) end",
		"if local a = x then elseif local b = y then else end",
		"if local x: number? = f() then end",
		'local name = if local p = getPlayer() then p.Name else "none"',
		"while local item = queue[1] do table.remove(queue, 1) end",
		"while const line = reader:nextLine() do print(line) end",
		// `const` is still a name where it binds nothing.
		"local const = 1 if const then print(const) end",
	])("reads %j", (src) => {
		expect(checkLuau(src, "block")).toEqual([]);
	});

	it("binds one name to one value, as the beta allows", () => {
		expect(checkLuau("if local a, b = f() then end", "block").length).toBeGreaterThan(0);
	});

	it("puts the name in scope in its own clause, and nowhere else", () => {
		const src = "if local user = users[id] then\n\tprint(user)\nelse\n\tprint(1)\nend\nprint(2)";
		const names = (at: string) => localsAt(src, src.indexOf(at)).map((n) => n.name);
		expect(names("print(user)")).toContain("user");
		expect(names("print(1)")).not.toContain("user");
		expect(names("print(2)")).not.toContain("user");
	});
});

describe("importing conditional bindings", () => {
	function roundTrip(src: string): string {
		const result = importLuau(src, {
			name: "T",
			scriptClass: "Script",
			target: "roblox",
			idPrefix: "t",
		});
		if (!result.ok) throw new Error(result.error);
		const out = compile(result.script, registry);
		expect(errors(out)).toEqual([]);
		return body(out.code);
	}

	it("reads if local as a bound Branch, and writes it back", () => {
		const src = lines(
			"if local admin = admins[id] then",
			"\tprint(admin)",
			"elseif local guest = guests[id] then",
			"\tprint(guest)",
			"end",
		);
		expect(roundTrip(src)).toBe(src);
	});

	it("reads while local as a bound While Loop, and writes it back", () => {
		const src = lines("while local item = queue[1] do", "\tprint(item)", "end");
		expect(roundTrip(src)).toBe(src);
	});
});
