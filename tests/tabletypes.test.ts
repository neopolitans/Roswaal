/**
 * A type the script declares as a table goes wherever a table does (1.0.1):
 * `type RoundState = { round: number }` into a Table pin was warned about, as
 * though only `{ … }` written out were a table.
 */

import { describe, expect, it } from "vitest";
import { canConnect } from "../src/app/edits.js";
import { typesCompatible, validate } from "../src/core/compiler/validate.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { declaredTableTypes } from "../src/core/typeFields.js";
import { Builder } from "./helpers.js";

function graph(definition: string) {
	const b = new Builder();
	b.node("type.declareTop", { config: { name: "RoundState", definition } });
	b.variable("state", "RoundState", { t: "nil" });
	const get = b.node("variable.get", {
		config: { variable: "v_state", name: "state", type: "RoundState" },
	});
	const index = b.node("table.get");
	b.link(get, "value", index, "table");
	return { script: b.build(), get, index };
}

describe("declared table types", () => {
	it("lists the types declared as tables", () => {
		const b = new Builder();
		b.node("type.declareTop", { config: { name: "RoundState", definition: "{ round: number }" } });
		b.node("type.declareTop", { config: { name: "Scores", definition: "{ [string]: number }" } });
		b.node("type.declareTop", { config: { name: "Names", definition: "{ string }" } });
		b.node("type.declareTop", { config: { name: "Count", definition: "number" } });
		expect([...declaredTableTypes(b.build())].sort()).toEqual(["Names", "RoundState", "Scores"]);
	});

	it("goes into a Table pin, and a plain type still does not", () => {
		const tables = new Set(["RoundState"]);
		expect(typesCompatible("RoundState", "table", tables)).toBe(true);
		expect(typesCompatible("RoundState", "table")).toBe(false);
		expect(typesCompatible("Count", "table", tables)).toBe(false);
	});

	it("is not warned about in Script analysis", () => {
		const registry = createRegistry();
		const { script } = graph("{ round: number, alive: number }");
		expect(validate(script, registry).filter((d) => /expects/.test(d.message))).toEqual([]);
	});

	it("is a wire the canvas makes", () => {
		const registry = createRegistry();
		const { script, get, index } = graph("{ round: number }");
		const check = canConnect(
			script,
			registry,
			{ node: get, pin: "value" },
			{ node: index, pin: "table" },
		);
		expect(check).toEqual({ ok: true });
	});

	it("still warns when the type is not a table", () => {
		const registry = createRegistry();
		const { script } = graph("number");
		expect(validate(script, registry).some((d) => /expects a table/.test(d.message))).toBe(true);
	});
});
