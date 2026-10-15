/**
 * A StyLua that runs and refuses is reported, once per thing it said; one that
 * is not there is not.
 *
 * Until 0.187.0 a refusal was dropped where it happened, so a StyLua that
 * refused every file -- a toolchain manager's shim that no project names --
 * left every file unformatted without a word.
 */

import { readdir, readFile } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { unformattedGroups, unformattedMessage, unformattedWhat } from "../src/core/unformatted.js";
import type { Volume } from "../src/web/volume.js";

/** What the next StyLua run gives back. Nothing runs: `spawnSync` is replaced. */
let next: { error?: Error; status: number | null; stdout: string; stderr: string };

vi.mock("node:child_process", () => ({
	spawnSync: () => next,
}));

/** The project layer on a volume, with a formatter that refuses everything. */
const REFUSED = "Failed to find tool 'stylua' in any project manifest file.";
vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume: MemoryVolume } = await import("../src/web/volume.js");
	const volume = new MemoryVolume();
	return {
		volume,
		fs: volume,
		path,
		formatLuau: (_cwd: string, code: string) => ({ code, unformatted: REFUSED }),
	};
});

async function freshFormatter() {
	vi.resetModules();
	return (await import("../src/server/format.js")).formatLuau;
}

describe("what StyLua said", () => {
	beforeEach(() => {
		next = { status: 0, stdout: "", stderr: "" };
	});

	it("is its first line, without colours or the word error", async () => {
		const { refusal } = await import("../src/server/format.js");
		expect(
			refusal("\u001b[31mERROR\u001b[0m Failed to find tool 'stylua'.\nAdd the tool…\n", 1),
		).toBe("Failed to find tool 'stylua'.");
		expect(refusal("error: could not format from stdin\n", 2)).toBe("could not format from stdin");
	});

	it("is its exit code when it said nothing", async () => {
		const { refusal } = await import("../src/server/format.js");
		expect(refusal("", 3)).toBe("Exited with code 3.");
		expect(refusal(undefined, null)).toBe("Exited with code unknown.");
	});

	it("comes back with the code, unchanged, when it refused", async () => {
		const formatLuau = await freshFormatter();
		next = { status: 1, stdout: "", stderr: "ERROR Failed to find tool 'stylua'.\n" };
		expect(formatLuau("/project", "local   x=1")).toEqual({
			code: "local   x=1",
			unformatted: "Failed to find tool 'stylua'.",
		});
	});

	it("is nothing when it formatted the code", async () => {
		const formatLuau = await freshFormatter();
		next = { status: 0, stdout: "local x = 1\n", stderr: "" };
		expect(formatLuau("/project", "local   x=1")).toEqual({ code: "local x = 1\n" });
	});

	it("is nothing when there is no StyLua to run", async () => {
		const formatLuau = await freshFormatter();
		next = { error: new Error("ENOENT"), status: null, stdout: "", stderr: "" };
		expect(formatLuau("/project", "local   x=1")).toEqual({ code: "local   x=1" });
	});
});

describe("files StyLua refused", () => {
	const outcome = (outputPath: string, unformatted?: string, written = true) => ({
		outputPath,
		written,
		...(unformatted ? { unformatted } : {}),
	});

	it("are grouped by what it said, in order", () => {
		const groups = unformattedGroups([
			outcome("src/A.luau", "no manifest"),
			outcome("src/B.luau"),
			outcome("src/Tank/C.luau", "could not parse"),
			outcome("src/D.luau", "no manifest"),
		]);
		expect(groups).toEqual([
			{ reason: "no manifest", files: ["src/A.luau", "src/D.luau"] },
			{ reason: "could not parse", files: ["src/Tank/C.luau"] },
		]);
	});

	it("leave out a file that was not written", () => {
		expect(unformattedGroups([outcome("src/A.luau", "no manifest", false)])).toEqual([]);
	});

	it("are named by file when there is one, and counted when there are more", () => {
		const one = { reason: "could not parse", files: ["src/Tank/Rig.luau"] };
		const six = {
			reason: "no manifest",
			files: Array.from({ length: 6 }, (_, i) => `src/${i}.luau`),
		};
		expect(unformattedWhat(one)).toBe("Rig.luau");
		expect(unformattedMessage(one)).toBe("StyLua did not format Rig.luau: could not parse");
		expect(unformattedMessage(six)).toBe("StyLua did not format 6 files: no manifest");
	});
});

describe("a compile StyLua refused", () => {
	it("still writes every file, and says why each is unformatted", async () => {
		vi.resetModules();
		const { volume } = (await import("../src/server/host.js")) as unknown as { volume: Volume };
		const { compileAll, openProject } = await import("../src/server/project.js");

		const demo = nodePath.resolve(
			nodePath.dirname(fileURLToPath(import.meta.url)),
			"..",
			"examples",
			"demo",
		);
		const files: Record<string, string> = {};
		const walk = async (at: string): Promise<void> => {
			for (const entry of await readdir(at, { withFileTypes: true })) {
				const abs = nodePath.join(at, entry.name);
				if (entry.isDirectory()) await walk(abs);
				else
					files[`/demo/${nodePath.relative(demo, abs).split(nodePath.sep).join("/")}`] =
						await readFile(abs, "utf8");
			}
		};
		await walk(demo);
		volume.mount(files);

		const results = await compileAll(await openProject("/demo"), { write: true });
		const written = results.filter((r) => r.written);
		expect(written.length).toBeGreaterThan(0);
		expect(written.every((r) => r.unformatted === REFUSED)).toBe(true);
		expect(unformattedGroups(results)).toEqual([
			{ reason: REFUSED, files: written.map((r) => r.outputPath) },
		]);
	});
});
