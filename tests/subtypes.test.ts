/**
 * Naming a type the emitter has not heard of.
 *
 * `luauType` used to check a pin's type against a list of fifteen names and
 * write `any` for anything else. So a function parameter typed `Model` came out
 * `any`, and so did one typed `Config` — a type the same file had just
 * declared. Nothing said so: the graph read `Model`, the file read `any`, and
 * the two disagreed quietly for as long as you did not look.
 *
 * Found converting `Config.luau`, whose one exported function is
 * `function TankConfig.read(tank: Model): Config` — a line that needs both.
 *
 * The other half is assignability. A `Model` is an `Instance`, so it goes
 * wherever an `Instance` is wanted. `Instance` into a `Model` pin is a claim
 * about what the value *is*, not a fact about its type, and `Cast` is the node
 * that makes that claim out loud.
 */

import { describe, expect, it } from "vitest";

import { acceptsWire } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { INSTANCE_CLASSES, isInstanceClass } from "../src/core/roblox.js";
import type { NodeScript, PinDef } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

const code = (script: NodeScript) => compile(script, registry).code;

const pin = (type: string): PinDef => ({ id: "p", name: "", kind: "data", type });

/** A one-parameter, one-return function, so the signature is the whole test. */
function signature(paramType: string, returnType: string): string {
	const b = new Builder();
	const fn = b.node("function.entry", {
		config: {
			name: "read",
			params: [{ name: "tank", type: paramType }],
			returns: [{ name: "cfg", type: returnType }],
		},
	});
	const ret = b.node("function.return", { config: { returns: [{ name: "cfg", type: returnType }] } });
	b.lit(ret, "r0", { t: "raw", v: "nil" });
	b.link(fn, "then", ret, "in");
	return code(b.build());
}

describe("a type the emitter has not heard of", () => {
	/** The exact line the conversion needed. */
	it("writes an Instance class as itself", () => {
		expect(signature("Model", "any")).toContain("(tank: Model)");
	});

	/** A type the graph declared for itself is just as unknown, and just as real. */
	it("writes a type this file declares as itself", () => {
		expect(signature("any", "Config")).toContain("): Config");
	});

	it("still writes the types it always knew", () => {
		expect(signature("Instance", "number")).toContain("(tank: Instance): number");
	});

	it("still spells out table and function", () => {
		expect(signature("table", "function")).toContain("(tank: { [any]: any }): (...any) -> ...any");
	});

	/**
	 * `wildcard` is "adopts what it is wired to" and `luau` is "hand-written
	 * source". Neither is a type Luau has heard of, and writing one into a
	 * signature would be a syntax error in a file nobody edited.
	 */
	it("writes any for the types that describe the editor", () => {
		for (const t of ["any", "wildcard", "luau", "code"]) {
			expect(signature(t, "any"), t).toContain("(tank: any): any");
		}
	});

	/** A pin type that is not a name cannot go in a type position. */
	it("writes any for something that is not a type name", () => {
		expect(signature("{ Instance }", "any")).toContain("(tank: any)");
		expect(signature("2 bad", "any")).toContain("(tank: any)");
	});

	/** A module's type: `Tank.Config`. */
	it("writes a dotted type as itself", () => {
		expect(signature("Tank.Config", "any")).toContain("(tank: Tank.Config)");
	});
});

describe("an Instance class fits an Instance pin", () => {
	it("knows the classes it lists", () => {
		expect(isInstanceClass("Model")).toBe(true);
		expect(isInstanceClass("NumberValue")).toBe(true);
		expect(INSTANCE_CLASSES.length).toBeGreaterThan(20);
	});

	/** Not everything capitalised is an Instance — a declared type is not. */
	it("does not take a type alias for a class", () => {
		expect(isInstanceClass("Config")).toBe(false);
		expect(isInstanceClass("Vector3")).toBe(false);
		expect(isInstanceClass(undefined)).toBe(false);
	});

	it("lets a Model wire into an Instance pin", () => {
		expect(acceptsWire(pin("Model"), pin("Instance"))).toBe(true);
	});

	/** Downcasting is a claim, and Cast is where you make it. */
	it("does not let an Instance wire into a Model pin", () => {
		expect(acceptsWire(pin("Instance"), pin("Model"))).toBe(false);
	});

	it("does not let two unrelated classes join", () => {
		expect(acceptsWire(pin("Model"), pin("Humanoid"))).toBe(false);
	});

	/** A type alias is not an Instance, so it does not get the free pass. */
	it("does not let a type alias into an Instance pin", () => {
		expect(acceptsWire(pin("Config"), pin("Instance"))).toBe(false);
	});

	it("still lets any through in both directions", () => {
		expect(acceptsWire(pin("Model"), pin("any"))).toBe(true);
		expect(acceptsWire(pin("any"), pin("Model"))).toBe(true);
	});
});
