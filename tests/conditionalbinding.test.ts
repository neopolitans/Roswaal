/**
 * Bind on a Branch and a While Loop: Luau's conditional bindings (RFC #238,
 * `if local x = … then`, `while local x = … do`), in Studio's If Local/Const
 * Bindings beta. Written as that syntax when the project asks for it, and as
 * plain Luau otherwise; read back either way. The bound value
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

/** A project that writes the beta's syntax: `conditionalBindings` in roswaal.json. */
const BETA = { conditionalBindings: true };

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

		const out = compile(b.build(), registry, BETA);
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

		const out = compile(b.build(), registry, BETA);
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

		const out = compile(b.build(), registry, BETA);
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

		expect(errors(compile(b.build(), registry, BETA))).toEqual([
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

		const out = compile(b.build(), registry, BETA);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(lines("while local item = queue[head] do", "\tprint(item)", "end"));
	});
});

describe("a call bound straight into its condition", () => {
	/** A Call Function or Call Method on the chain, its result wired to `to`'s condition. */
	function callInto(
		kind: "call.function" | "call.method",
		to: "flow.branch" | "flow.while",
		config: Record<string, unknown> = {},
		bind = true,
	) {
		const b = new Builder();
		const start = b.node("script.begin");
		const call = b.node(kind, { config: { args: 1, ...config } });
		if (kind === "call.method") {
			b.lit(call, "object", { t: "raw", v: "queue" });
			b.lit(call, "method", { t: "string", v: "Pop" });
			b.lit(call, "a0", { t: "raw", v: "1" });
		} else {
			b.lit(call, "fn", { t: "raw", v: "getAdmin" });
			b.lit(call, "a0", { t: "raw", v: "id" });
		}
		const node = b.node(to, { config: bind ? { bind: true, bindName: "admin" } : {} });
		b.link(start, "then", call, "in");
		b.link(call, "then", node, "in");
		b.link(call, "result", node, "condition");
		return { b, call, node };
	}

	it("writes the call into if local", () => {
		const { b, node } = callInto("call.function", "flow.branch");
		b.link(node, "true", printOf(b, node, "value"), "in");
		const out = compile(b.build(), registry, BETA);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			lines("if local admin = getAdmin(id) then", "\tprint(admin)", "end"),
		);
	});

	it("writes a method call into while local, made on every pass, with no warning", () => {
		const { b, node } = callInto("call.method", "flow.while");
		b.link(node, "body", printOf(b, node, "value"), "in");
		const out = compile(b.build(), registry, BETA);
		expect(out.diagnostics).toEqual([]);
		expect(body(out.code)).toBe(
			lines("while local admin = queue:Pop(1) do", "\tprint(admin)", "end"),
		);
	});

	it("keeps the local when the result is named", () => {
		const { b, node } = callInto("call.function", "flow.branch", { resultName: "found" });
		b.link(node, "true", says(b, "yes"), "in");
		const out = compile(b.build(), registry, BETA);
		expect(body(out.code)).toBe(
			lines("local found = getAdmin(id)", "if local admin = found then", '\tprint("yes")', "end"),
		);
	});

	it("keeps the local when something else reads the result too", () => {
		const { b, call, node } = callInto("call.function", "flow.branch");
		b.link(node, "true", printOf(b, call, "result"), "in");
		const out = compile(b.build(), registry, BETA);
		expect(body(out.code)).toBe(
			lines(
				"local result = getAdmin(id)",
				"if local admin = result then",
				"\tprint(result)",
				"end",
			),
		);
	});

	it("keeps the local when a statement comes between", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const call = b.node("call.function", { config: { args: 1 } });
		b.lit(call, "fn", { t: "raw", v: "getAdmin" });
		b.lit(call, "a0", { t: "raw", v: "id" });
		const between = says(b, "looking");
		const branch = b.node("flow.branch", { config: { bind: true, bindName: "admin" } });
		b.link(start, "then", call, "in");
		b.link(call, "then", between, "in");
		b.link(between, "then", branch, "in");
		b.link(call, "result", branch, "condition");
		b.link(branch, "true", says(b, "yes"), "in");
		const out = compile(b.build(), registry, BETA);
		expect(body(out.code)).toBe(
			lines(
				"local result = getAdmin(id)",
				'print("looking")',
				"if local admin = result then",
				'\tprint("yes")',
				"end",
			),
		);
	});

	it("leaves an unbound Branch as it was", () => {
		const { b, node } = callInto("call.function", "flow.branch", {}, false);
		b.link(node, "true", says(b, "yes"), "in");
		const out = compile(b.build(), registry, BETA);
		expect(body(out.code)).toBe(
			lines("local result = getAdmin(id)", "if result then", '\tprint("yes")', "end"),
		);
	});
});

describe("as plain Luau, which is the default", () => {
	it("keeps a Branch's value in a local, then tests it", () => {
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
			lines(
				"local admin = admins[id]",
				"if admin then",
				"\tprint(admin)",
				"else",
				'\tprint("none")',
				"end",
			),
		);
	});

	it("nests a bound Branch on a False pin, as there is no elseif for the local", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("flow.branch", { config: { bind: true, bindName: "admin" } });
		const second = b.node("flow.branch", { config: { bind: true, bindName: "guest" } });
		b.link(start, "then", first, "in");
		b.link(lookup(b), "result", first, "condition");
		b.link(lookup(b, "guests"), "result", second, "condition");
		b.link(first, "true", printOf(b, first, "value"), "in");
		b.link(first, "false", second, "in");
		b.link(second, "true", printOf(b, second, "value"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			lines(
				"local admin = admins[id]",
				"if admin then",
				"\tprint(admin)",
				"else",
				"\tlocal guest = guests[id]",
				"\tif guest then",
				"\t\tprint(guest)",
				"\tend",
				"end",
			),
		);
	});

	it("writes a While Loop's binding inside the loop, with a call made on every pass", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const call = b.node("call.method", { config: { args: 0 } });
		b.lit(call, "object", { t: "raw", v: "queue" });
		b.lit(call, "method", { t: "string", v: "Pop" });
		const loop = b.node("flow.while", { config: { bind: true, bindName: "item" } });
		b.link(start, "then", call, "in");
		b.link(call, "then", loop, "in");
		b.link(call, "result", loop, "condition");
		b.link(loop, "body", printOf(b, loop, "value"), "in");

		const out = compile(b.build(), registry);
		expect(out.diagnostics).toEqual([]);
		expect(body(out.code)).toBe(
			lines(
				"while true do",
				"\tlocal item = queue:Pop()",
				"\tif not item then break end",
				"\tprint(item)",
				"end",
			),
		);
	});

	it("writes an imported if local back as plain Luau", () => {
		const result = importLuau(
			lines("if local admin = getAdmin(id) then", "\tprint(admin)", "end"),
			{
				name: "T",
				scriptClass: "Script",
				target: "roblox",
				idPrefix: "t",
			},
		);
		if (!result.ok) throw new Error(result.error);
		const out = compile(result.script, registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			lines("local admin = getAdmin(id)", "if admin then", "\tprint(admin)", "end"),
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
		const out = compile(result.script, registry, BETA);
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
