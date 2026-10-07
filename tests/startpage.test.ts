/**
 * What the start page says about a project before it is opened: what is at a
 * path, and how long ago a recent one was opened.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sinceOpened } from "../src/app/recents.js";
import { inspectFolder } from "../src/server/app.js";

describe("inspecting a path", () => {
	it("says what a project compiles for and how many graphs it has", async () => {
		const demo = await inspectFolder(path.resolve("examples/demo"));
		expect(demo).toMatchObject({
			exists: true,
			directory: true,
			initialised: true,
			target: "roblox",
		});
		expect(demo.graphs).toBeGreaterThan(0);

		const lune = await inspectFolder(path.resolve("examples/lune-demo"));
		expect(lune.target).toBe("lune");
	});

	it("leaves them out for a folder that is not a project", async () => {
		const folder = await inspectFolder(path.resolve("tests"));
		expect(folder).toEqual({
			root: path.resolve("tests"),
			exists: true,
			directory: true,
			initialised: false,
			empty: false,
		});
	});

	/** Empty is where the start page offers Create, since 0.148.0. */
	it("says when a folder is empty, for a new project to go in", async () => {
		const empty = await fs.mkdtemp(path.join(os.tmpdir(), "roswaal-empty-"));
		try {
			expect(await inspectFolder(empty)).toMatchObject({
				directory: true,
				initialised: false,
				empty: true,
			});
		} finally {
			await fs.rm(empty, { recursive: true, force: true });
		}
	});

	it("tells a missing path from a file", async () => {
		expect((await inspectFolder(path.resolve("nowhere-at-all"))).exists).toBe(false);
		const file = await inspectFolder(path.resolve("package.json"));
		expect(file).toMatchObject({ exists: true, directory: false });
	});
});

describe("how long ago", () => {
	const now = Date.UTC(2026, 9, 4, 12);
	const ago = (minutes: number) => sinceOpened(now - minutes * 60_000, now);

	it("reads as a card says it", () => {
		expect(ago(0)).toBe("just now");
		expect(ago(25)).toBe("25 minutes ago");
		expect(ago(60)).toBe("an hour ago");
		expect(ago(5 * 60)).toBe("5 hours ago");
		expect(ago(26 * 60)).toBe("yesterday");
		expect(ago(3 * 24 * 60)).toBe("3 days ago");
		expect(ago(8 * 24 * 60)).toBe("last week");
		expect(ago(40 * 24 * 60)).toBe("last month");
		expect(ago(400 * 24 * 60)).toBe("over a year ago");
	});

	it("never says a time in the future", () => {
		expect(sinceOpened(now + 60_000, now)).toBe("just now");
	});
});
