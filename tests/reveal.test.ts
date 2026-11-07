/**
 * Showing something in the file manager shows it, and never runs it.
 *
 * On macOS, `open` on a folder whose name ends in `.app` -- or any other
 * bundle -- launches it rather than showing it, and a repository cloned with
 * git carries no quarantine flag for Gatekeeper to stop it. `open -R` only
 * selects it in Finder, for a folder as for a file.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawned: { command: string; args: string[] }[] = [];

vi.mock("node:child_process", () => ({
	spawn: (command: string, args: string[]) => {
		spawned.push({ command, args });
		return { unref: () => undefined, on: () => undefined };
	},
}));

const { revealInFileManager } = await import("../src/server/reveal.js");

let base = "";
const platform = process.platform;

beforeEach(async () => {
	spawned.length = 0;
	base = await mkdtemp(path.join(os.tmpdir(), "roswaal-reveal-"));
});

afterEach(async () => {
	Object.defineProperty(process, "platform", { value: platform });
	await rm(base, { recursive: true, force: true });
});

describe("on macOS", () => {
	beforeEach(() => {
		Object.defineProperty(process, "platform", { value: "darwin" });
	});

	it("selects a folder named like an app rather than opening it", async () => {
		const bundle = path.join(base, "Looks Harmless.app");
		await mkdir(bundle);
		await revealInFileManager(bundle);
		expect(spawned).toEqual([{ command: "/usr/bin/open", args: ["-R", bundle] }]);
	});

	it("selects an ordinary folder the same way", async () => {
		const folder = path.join(base, "src");
		await mkdir(folder);
		await revealInFileManager(folder);
		expect(spawned).toEqual([{ command: "/usr/bin/open", args: ["-R", folder] }]);
	});
});

describe("on Windows", () => {
	beforeEach(() => {
		Object.defineProperty(process, "platform", { value: "win32" });
	});

	it("starts Explorer by its full path, never by a name the working folder could answer", async () => {
		const file = path.join(base, "Main.server.luau");
		await writeFile(file, "");
		await revealInFileManager(file);
		expect(spawned).toHaveLength(1);
		expect(path.win32.isAbsolute(spawned[0].command)).toBe(true);
		expect(spawned[0].command.toLowerCase()).toMatch(/\\explorer\.exe$/);
		expect(spawned[0].args).toEqual(["/select,", file]);
	});
});
