/** `cx`: class names joined, falsy ones dropped, no stray spaces. */

import { describe, expect, it } from "vitest";

import { cx } from "../src/app/cx.js";

describe("cx", () => {
	it("joins what is truthy with single spaces", () => {
		expect(cx("node", true && "node--selected", false && "node--pure")).toBe("node node--selected");
		expect(cx("a", undefined, null, 0, "", "b")).toBe("a b");
	});

	it("is empty with nothing to join", () => {
		expect(cx()).toBe("");
		expect(cx(false, undefined)).toBe("");
	});
});
