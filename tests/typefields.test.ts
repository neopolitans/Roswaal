/**
 * The fields of a table type written out in Luau, read with the parser.
 *
 * It was a bracket-counting splitter that took the `>` of a function type's
 * `->` for a closing bracket, so the field after a function-typed one ran into
 * it and was never offered to Get Member.
 */

import { describe, expect, it } from "vitest";

import { fieldsOfTableType } from "../src/core/typeFields.js";

describe("fieldsOfTableType", () => {
	it("splits the field after a function-typed one", () => {
		expect(fieldsOfTableType("{ onHit: (Part) -> (), damage: number }")).toEqual([
			{ name: "onHit", type: "(Part) -> ()" },
			{ name: "damage", type: "number" },
		]);
	});

	it("keeps a nested table's commas inside its field", () => {
		expect(fieldsOfTableType("{ hits: { [string]: number }, at: Vector3 }")).toEqual([
			{ name: "hits", type: "{ [string]: number }" },
			{ name: "at", type: "Vector3" },
		]);
	});

	it("takes ; as a separator, a trailing one, and read/write modifiers", () => {
		expect(fieldsOfTableType("{ read id: number; name: string, }").map((f) => f.name)).toEqual(["id", "name"]);
	});

	it("gives nothing for what has no fixed field list", () => {
		expect(fieldsOfTableType("{ [string]: number }")).toEqual([]);
		expect(fieldsOfTableType("{ Player }")).toEqual([]);
		expect(fieldsOfTableType("{ a: number } & { b: number }")).toEqual([]);
		expect(fieldsOfTableType("{ a: number,")).toEqual([]);
	});
});
