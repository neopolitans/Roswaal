/**
 * Declaring things: `Initialize Variable`, and naming a `Declare Local`.
 *
 * Both came out of building the M103's tuning table as a graph, which is the
 * first thing anyone has built in Roswaal that a hand-written file would open
 * with. The hand-written version starts `local TUNING = { ... }`; the graph
 * could not say that at all.
 *
 * `Set Variable` gave `local Tuning: table = {}` at the top and `Tuning = {...}`
 * further down — correct, and not what anybody would write. `Initialize
 * Variable` moves the declaration to the point the value is built.
 *
 * **The constraint is the interesting part.** The declaration lands where the
 * node sits, so the node has to sit somewhere the rest of the script can see —
 * the main flow. Inside a branch, a loop or a function the `local` would go out
 * of scope and Luau would read every later mention as a nil global, silently.
 * Most of what follows is that rule refusing to be broken.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

const code = (script: NodeScript) => body(compile(script, registry).code);

describe("Initialize Variable", () => {
	/** The shape the tuning table wanted, and could not have. */
	it("is the variable's declaration, so there is no empty one above it", () => {
		const b = new Builder();
		const id = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const init = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		const value = b.node("value.expression");
		b.lit(value, "code", { t: "raw", v: "{ turnRate = 45 }" });
		b.link(start, "then", init, "in");
		b.link(value, "result", init, "value");

		const out = code(b.build());
		expect(out).toMatch(/^local Tuning[^=]*= \{ turnRate = 45 \}$/m);
		// The half that was the complaint: no `local Tuning = {}` first.
		expect(out.match(/local Tuning/g)).toHaveLength(1);
	});

	it("leaves other variables declared at the top as they were", () => {
		const b = new Builder();
		const tuning = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		b.variable("speed", "number", { t: "number", v: 44 });
		const start = b.node("script.begin");
		const init = b.node("variable.init", { config: { variable: tuning, name: "Tuning", type: "table" } });
		b.link(start, "then", init, "in");

		expect(code(b.build())).toContain("local speed: number = 44");
	});
});

/**
 * The rule, from four directions. A declaration that escapes into a block is
 * the failure this node exists to make impossible, and it fails quietly — the
 * generated Luau compiles, and the variable is nil everywhere else.
 */
describe("where it refuses to go", () => {
	function insideBranch(): NodeScript {
		const b = new Builder();
		const id = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const init = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		b.link(start, "then", branch, "in");
		b.link(branch, "true", init, "in");
		return b.build();
	}

	it("will not declare inside a branch", () => {
		expect(errors(insideBranch()).join(" ")).toContain("has to sit");
	});

	it("says what to use instead", () => {
		expect(errors(insideBranch()).join(" ")).toContain("Set Variable");
	});

	it("will not initialise the same variable twice", () => {
		const b = new Builder();
		const id = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const first = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		const second = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");

		expect(errors(b.build()).join(" ")).toContain("initialised more than once");
	});

	it("complains when it points at nothing", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const init = b.node("variable.init");
		b.link(start, "then", init, "in");
		expect(errors(b.build()).join(" ")).toContain("no variable chosen");
	});
});

describe("Declare Local", () => {
	function named(name: string) {
		const b = new Builder();
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: name });
		b.lit(declare, "value", { t: "number", v: 7 });
		b.link(start, "then", declare, "in");
		return b.build();
	}

	it("uses the name it was given", () => {
		expect(code(named("tuning"))).toContain("local tuning = 7");
	});

	/** Blank is the documented way to not care, so it must not be an error. */
	it("picks one when the name is left blank", () => {
		const out = compile(named(""), registry);
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toMatch(/^local \w+ = 7$/m);
	});

	/**
	 * An identifier is decided when the file is written, so a wire — which
	 * carries a value at runtime — has nothing to offer. Refused out loud,
	 * because a wired Name that silently did nothing is one you would only
	 * discover by testing the generated file.
	 */
	it("refuses a Name that arrives down a wire", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		const text = b.node("value.string");
		b.link(start, "then", declare, "in");
		b.link(text, "result", declare, "name");

		expect(errors(b.build()).join(" ")).toContain("typed in rather than wired");
	});

	it("keeps two locals with the same name apart", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("local.declare");
		const second = b.node("local.declare");
		for (const n of [first, second]) b.lit(n, "name", { t: "string", v: "count" });
		b.lit(first, "value", { t: "number", v: 1 });
		b.lit(second, "value", { t: "number", v: 2 });
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");

		const out = code(b.build());
		expect(out).toContain("local count = 1");
		expect(out).not.toContain("local count = 2");
	});
});

/**
 * The tuning table is ten entries. Eight was the cap every variadic node
 * shared, and there is no way to say "a table with ten keys" by adding more
 * nodes — it has to be one node or it is not that table.
 */
describe("how big a dictionary can be", () => {
	it("takes more pairs than the old limit of eight", () => {
		const b = new Builder();
		const dict = b.node("table.dictionary", { config: { args: 10 } });
		for (let i = 0; i < 10; i++) {
			b.lit(dict, `k${i}`, { t: "string", v: `key${i}` });
			b.lit(dict, `a${i}`, { t: "number", v: i });
		}
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "tuning" });
		b.link(start, "then", declare, "in");
		b.link(dict, "result", declare, "value");

		const out = code(b.build());
		expect(out).toContain('["key0"] = 0');
		expect(out).toContain('["key9"] = 9');
	});
});
