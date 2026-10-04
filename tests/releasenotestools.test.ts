/**
 * The release notes' "new since your last visit" compares versions, and it
 * has to compare them as versions: 0.10.0 is after 0.9.3, though it sorts
 * before it as text.
 */

import { describe, expect, it } from "vitest";

import { newerVersion } from "../src/app/releaseNotes.js";

describe("comparing versions", () => {
	it("reads each part as a number", () => {
		expect(newerVersion("0.10.0", "0.9.3")).toBe(true);
		expect(newerVersion("0.126.0", "0.125.0")).toBe(true);
		expect(newerVersion("0.125.1", "0.125.0")).toBe(true);
	});

	it("is not newer than itself, or than a later one", () => {
		expect(newerVersion("0.125.0", "0.125.0")).toBe(false);
		expect(newerVersion("0.99.0", "0.100.0")).toBe(false);
	});
});
