/**
 * Get Member: the field a type declares, rather than the key a table happens
 * to have.
 *
 * Two halves worth holding. **What a type says it holds** — rows on a Declare
 * Type, or the same thing written out as Luau, and nothing at all for a type
 * that is not a table of fixed fields. And **what the compiler does with it**:
 * the same access Get Field writes, refused when the type is one this file
 * declares and the member is not on it.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { fieldsOfTableType, declaredTypeFields } from "../src/core/typeFields.js";
import { membersOfType, typeInto } from "../src/core/members.js";
import { Builder, body } from "./helpers.js";
import { operatorSymbol } from "../src/core/operatorLayout.js";
import { resolveNodePins } from "../src/core/nodes/index.js";
import { migrateScript } from "../src/core/migrate.js";

const registry = createRegistry();
const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

describe("reading a table type's fields", () => {
	it("takes them from the rows of a Table of Fields", () => {
		const b = new Builder();
		b.node("type.declareTop", {
			config: {
				name: "Input",
				fields: [{ name: "throttle", type: "number" }, { name: "aim", type: "Vector3" }],
			},
		});
		expect(declaredTypeFields(b.build()).get("Input")).toEqual([
			{ name: "throttle", type: "number" },
			{ name: "aim", type: "Vector3" },
		]);
	});

	/** The same type, written out instead of entered as rows. */
	it("parses Custom Luau written as a table", () => {
		expect(fieldsOfTableType("{ throttle: number, aim: Vector3 }")).toEqual([
			{ name: "throttle", type: "number" },
			{ name: "aim", type: "Vector3" },
		]);
	});

	it("takes a trailing separator, semicolons and lines", () => {
		expect(fieldsOfTableType("{\n\tsteer: number;\n\thits: { Player },\n}")).toEqual([
			{ name: "steer", type: "number" },
			{ name: "hits", type: "{ Player }" },
		]);
	});

	/** A comma inside a field's own type is not a separator. */
	it("does not split inside a nested type", () => {
		expect(fieldsOfTableType("{ at: { [string]: number }, to: Vector3 }")).toEqual([
			{ name: "at", type: "{ [string]: number }" },
			{ name: "to", type: "Vector3" },
		]);
	});

	it("offers nothing for what is not a table of fixed fields", () => {
		for (const text of [
			'"idle" | "driving"',
			"{ [string]: number }",
			"(number) -> string",
			"{ a: number } & { b: number }",
			"{ number }",
			"",
		]) {
			expect(fieldsOfTableType(text), text).toEqual([]);
		}
	});
});

/** A graph whose local is typed `Input`, read by a Get Member. */
function reading(member: string, extra: { shape?: string; definition?: string } = {}) {
	const b = new Builder();
	const start = b.node("script.begin");
	b.node("type.declareTop", {
		config: {
			name: "Input",
			fields: [{ name: "throttle", type: "number" }, { name: "aim", type: "Vector3" }],
			...extra,
		},
	});
	const declare = b.node("local.declare", { config: { type: "Input" } });
	b.lit(declare, "name", { t: "string", v: "input" });
	const get = b.node("local.get", { config: { local: declare, name: "input", type: "Input" } });
	const read = b.node("value.member", { config: { member, type: "number" } });
	b.link(get, "value", read, "object");
	const print = b.node("debug.print");
	b.link(start, "then", declare, "in");
	b.link(declare, "then", print, "in");
	b.link(read, "result", print, "value");
	return b.build();
}

describe("what Get Member offers", () => {
	it("is the fields of the type wired into it", () => {
		const script = reading("throttle");
		const read = script.nodes.find((n) => n.def === "value.member")!;
		expect(typeInto({ script, registry }, read.id, "object")).toBe("Input");
		expect(membersOfType({ script, registry }, "Input")).toEqual([
			{ name: "throttle", type: "number" },
			{ name: "aim", type: "Vector3" },
		]);
	});

	/** `Input?` holds what `Input` holds: the option is about having a value. */
	it("looks through an optional type", () => {
		expect(membersOfType({ script: reading("aim"), registry }, "Input?")).toHaveLength(2);
	});

	it("offers nothing for a type it cannot know", () => {
		const script = reading("aim");
		expect(membersOfType({ script, registry }, "any")).toEqual([]);
		expect(membersOfType({ script, registry }, undefined)).toEqual([]);
	});

	/** What a required module exports, which only the daemon can read. */
	it("takes an external type's fields as given", () => {
		const script = reading("aim");
		const external = new Map([["Config.Tuning", [{ name: "turnRate", type: "number" }]]]);
		expect(membersOfType({ script, registry, external }, "Config.Tuning"))
			.toEqual([{ name: "turnRate", type: "number" }]);
	});
});

describe("what Get Member writes", () => {
	it("is the same access Get Field writes", () => {
		expect(code(reading("throttle"))).toContain("print(input.throttle)");
	});

	it("refuses a member the declared type does not have", () => {
		expect(errors(reading("brake")).join(" "))
			.toContain('"Input" has no member "brake". It holds throttle, aim.');
	});

	it("refuses a type that is not a table of fixed fields", () => {
		const script = reading("throttle", { shape: "written", definition: '"idle" | "driving"' });
		expect(errors(script).join(" ")).toContain("not a table of fixed fields");
	});

	it("wants a member at all", () => {
		expect(errors(reading("")).join(" ")).toContain("needs a member to read");
	});

	it("refuses a name Luau would not take", () => {
		expect(errors(reading("2fast")).join(" ")).toContain("not a name Luau will take for a member");
	});

	/** Nothing wired in is nothing to check against, and still compiles. */
	it("says nothing about a member on an unknown type", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const read = b.node("value.member", { config: { member: "Position" } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(read, "result", print, "value");
		expect(errors(b.build()).join(" ")).not.toContain("has no member");
	});
});

/**
 * The pill's face, and the graphs written before it had one.
 *
 * 0.76.0 typed the member into a pin, which made the node two rows wide. One
 * line reads as the access it writes — and a graph from that version has to
 * arrive at the same place rather than compiling to `input.`.
 */
describe("the shape of it", () => {
	it("writes the access on its face", () => {
		const def = registry.get("value.member")!;
		expect(operatorSymbol(def, { member: "throttle" })).toBe(".throttle");
		expect(operatorSymbol(def, {})).toBe(".…");
	});

	it("has one input and one output", () => {
		const pins = resolveNodePins(registry.get("value.member")!, { member: "aim", type: "Vector3" });
		expect(pins.inputs.map((p) => p.id)).toEqual(["object"]);
		expect(pins.outputs.map((p) => [p.id, p.type])).toEqual([["result", "Vector3"]]);
	});

	it("moves a 0.76.0 member off its pin", () => {
		const raw = {
			...new Builder().build(),
			nodes: [{
				id: "n1", def: "value.member", x: 0, y: 0,
				literals: { member: { t: "string" as const, v: "throttle" } },
			}],
		};
		const { script, notes } = migrateScript(raw, registry);
		const node = script.nodes[0];
		expect((node.config as { member?: string }).member).toBe("throttle");
		expect(node.literals?.member).toBeUndefined();
		expect(notes.join(" ")).toContain("Get Member");
	});
});
