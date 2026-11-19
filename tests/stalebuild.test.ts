/**
 * A page open across a deploy asks for parts of the old build the site no
 * longer has. Each browser words the failure its own way; all three are
 * told apart from a real crash.
 */

import { describe, expect, it } from "vitest";

import { isStaleBuild } from "../src/app/staleBuild.js";

describe("a page older than the site", () => {
	it("is known by each browser's words", () => {
		expect(
			isStaleBuild(
				new TypeError(
					"Failed to fetch dynamically imported module: https://canary.roswaal.app/assets/RobloxAccountPage-xzH768Cf.js",
				),
			),
		).toBe(true);
		expect(isStaleBuild(new TypeError("Importing a module script failed."))).toBe(true);
		expect(isStaleBuild(new TypeError("error loading dynamically imported module: x.js"))).toBe(
			true,
		);
	});

	it("is not any other error", () => {
		expect(isStaleBuild(new TypeError("Cannot read properties of undefined"))).toBe(false);
		expect(isStaleBuild(new Error("Failed to fetch"))).toBe(false);
	});
});
