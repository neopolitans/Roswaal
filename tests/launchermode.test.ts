/**
 * `bin/roswaal` is stored executable.
 *
 * Git keeps a file's executable bit, and a commit made on Windows leaves it
 * off unless told otherwise. The launcher was committed that way on its first
 * day, so a clone on macOS or Linux could not run it: `bin/roswaal` answered
 * "Permission denied", and a `bin` folder put on PATH found nothing, as the
 * system skips a file it may not run. Asked of git rather than of the disk,
 * because the disk on Windows has no such bit to read.
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The mode git stores for a file, or null outside a git checkout. */
function storedMode(file: string): string | null {
	try {
		return (
			execFileSync("git", ["ls-files", "--stage", "--", file], { cwd: ROOT, encoding: "utf8" })
				.trim()
				.split(/\s+/)[0] || null
		);
	} catch {
		return null;
	}
}

describe("the macOS and Linux launcher, as git stores it", () => {
	it("may be run, so a clone can start Roswaal with it", (ctx) => {
		const mode = storedMode("bin/roswaal");
		if (mode === null) ctx.skip();
		expect(mode).toBe("100755");
	});
});
