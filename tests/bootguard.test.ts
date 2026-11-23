/**
 * The page's watch over its own start: what it says when the editor fails to
 * appear. The screen itself is checked in a browser; these are its words.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeError, failureFrom, isStaleMessage, SLOW_START_MS } from "../src/app/bootGuard.js";

const about = { page: "https://roswaal.app/try.html", browser: "Test", version: "1.1.0-canary.31" };

describe("a start that failed", () => {
	it("is nothing to say where nothing went wrong", () => {
		expect(failureFrom([], false, about)).toBeNull();
	});

	it("names the error, and the page, version and browser, in what is copied", () => {
		const failure = failureFrom(["TypeError: x is undefined"], false, about);
		expect(failure?.kind).toBe("error");
		expect(failure?.title).toBe("Roswaal stopped while starting");
		expect(failure?.detail).toContain("TypeError: x is undefined");
		expect(failure?.detail).toContain("Page: https://roswaal.app/try.html");
		expect(failure?.detail).toContain("Roswaal: 1.1.0-canary.31");
		expect(failure?.detail).toContain("Browser: Test");
	});

	it("says the site was updated where a module did not load", () => {
		for (const message of [
			"Could not load https://roswaal.app/assets/main-abc.js",
			"TypeError: Failed to fetch dynamically imported module: https://roswaal.app/assets/x.js",
			"TypeError: Importing a module script failed.",
		])
			expect(isStaleMessage(message), message).toBe(true);
		expect(isStaleMessage("TypeError: x is undefined")).toBe(false);
		expect(failureFrom(["Could not load /assets/main-abc.js"], false, about)?.kind).toBe("stale");
	});

	it("says the start is stuck where nothing failed but the editor never appeared", () => {
		const failure = failureFrom([], true, about);
		expect(failure?.kind).toBe("slow");
		expect(failure?.text).toMatch(/folder from an earlier visit/);
		expect(failure?.detail).toContain("No error was reported: the editor never appeared.");
		// An error seen meanwhile is the better thing to report.
		expect(failureFrom(["Error: boom"], true, about)?.kind).toBe("error");
		expect(SLOW_START_MS).toBe(10000);
	});

	it("gives an error's stack, and anything else as text", () => {
		const error = new Error("boom");
		expect(describeError(error)).toMatch(/^Error: boom\n/);
		// Said once, though the stack begins with it too.
		expect(describeError(error).match(/Error: boom/g)).toHaveLength(1);
		expect(describeError("plain", "main.js:4")).toBe("plain (main.js:4)");
	});
});

describe("where the guard runs", () => {
	it("is put in every app page's head, before theme.js", () => {
		const shell = readFileSync(new URL("../scripts/theme-shell.mjs", import.meta.url), "utf8");
		expect(shell).toContain('fileName: "boot-guard.js"');
		expect(shell).toMatch(/guardSrc\}"><\/script>\\n\$\{indent\}\\t<script src="\$\{src\}"/);
	});
});
