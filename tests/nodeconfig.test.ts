/**
 * The typed config accessors: a field is read once, checked, and a field of
 * the wrong kind reads as absent rather than as what it was cast to.
 */

import { describe, expect, it } from "vitest";

import {
	configEntries, configFlag, configText, functionNameOf, paramsOf,
} from "../src/app/nodeConfig.js";

describe("node config accessors", () => {
	it("reads a string field, and nothing else", () => {
		expect(configText({ config: { name: "spawn" } }, "name")).toBe("spawn");
		expect(configText({ config: { name: 3 } }, "name")).toBeUndefined();
		expect(configText({ config: {} }, "name")).toBeUndefined();
		expect(configText({}, "name")).toBeUndefined();
		expect(configText(undefined, "name")).toBeUndefined();
	});

	it("reads a flag only when it is exactly true", () => {
		expect(configFlag({ config: { parens: true } }, "parens")).toBe(true);
		expect(configFlag({ config: { parens: "yes" } }, "parens")).toBe(false);
		expect(configFlag(undefined, "parens")).toBe(false);
	});

	it("keeps the named entries of a list, as they are", () => {
		const keep = { name: "speed", type: "number", extra: 1 };
		const node = { config: { params: [keep, { type: "string" }, "x", null, { name: "hp" }] } };
		expect(paramsOf(node)).toEqual([keep, { name: "hp" }]);
		expect(paramsOf(node)[0]).toBe(keep);
		expect(configEntries({ config: { params: "nope" } }, "params")).toEqual([]);
	});

	it("names a function for display", () => {
		expect(functionNameOf({ config: { name: " hide " } })).toBe("hide");
		expect(functionNameOf({ config: { name: "  " } })).toBe("function");
		expect(functionNameOf(undefined)).toBe("function");
	});
});
