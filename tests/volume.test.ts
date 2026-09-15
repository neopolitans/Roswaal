/**
 * The project layer, running on a volume in memory instead of a disk.
 *
 * This is the load-bearing claim behind the hosted editor: that `project.ts`
 * does not need a filesystem, it needs *a* filesystem, and swapping which one
 * changes nothing about what Roswaal considers a project, which files it owns
 * or what it refuses to overwrite. If that claim is wrong, the web build is a
 * second implementation of the rules wearing the first one's name, and the two
 * will disagree the first time either changes.
 *
 * So the test is not that the volume works. It is that the **real** project
 * layer — `openProject`, `buildTree`, `compileAll`, the hand-edit guard —
 * produces a project when pointed at one, with nothing mocked except where the
 * bytes live.
 *
 * `examples/demo` is the fixture, read off disk once and mounted, because a
 * fixture written by hand here would drift from the project the daemon's own
 * tests use and would stop proving anything the day the schema moved.
 */

import { readFile, readdir } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { posixPath } from "../src/web/posixPath.js";
import { Volume } from "../src/web/volume.js";

/**
 * The web host, standing in for the Node one.
 *
 * `project.ts` imports its filesystem from `./host.js` and from nowhere else,
 * which is what makes this a two-line substitution rather than a rewrite — and
 * what makes the substitution testable at all. The web build does the same
 * thing with a Vite alias; this does it with a module mock, so the code under
 * test is the code that ships.
 */
vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume: MemoryVolume } = await import("../src/web/volume.js");
	const volume = new MemoryVolume();
	return { volume, fs: volume, path, formatLuau: (_cwd: string, code: string) => code };
});

const { volume } = await import("../src/server/host.js") as unknown as { volume: Volume };
const { buildTree, compileAll, openProject, readScript, writeScript } =
	await import("../src/server/project.js");
const { splitGenerated } = await import("../src/server/project.js");

const DEMO = nodePath.resolve(
	nodePath.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo",
);

/** Every file under a directory on the real disk, as a snapshot to mount. */
async function snapshotOf(dir: string, mountAt: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const walk = async (at: string): Promise<void> => {
		for (const entry of await readdir(at, { withFileTypes: true })) {
			const abs = nodePath.join(at, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
				continue;
			}
			const rel = nodePath.relative(dir, abs).split(nodePath.sep).join("/");
			out[`${mountAt}/${rel}`] = await readFile(abs, "utf8");
		}
	};
	await walk(dir);
	return out;
}

volume.mount(await snapshotOf(DEMO, "/demo"));

// ---------------------------------------------------------------------------

describe("path arithmetic on the volume", () => {
	/**
	 * Checked against Node's own answers rather than against a reading of the
	 * documentation, because the cases that matter are the ones nobody would
	 * think to write down: a trailing slash, a `..` that runs off the top, the
	 * empty string.
	 */
	const cases = [
		"", ".", "/", "a", "/a", "a/b", "/a/b/", "a//b", "./a", "a/./b", "a/../b",
		"/a/../..", "../a", "/a/b/../c", "a/b/", ".roswaal/scripts",
	];

	it("normalises the way node does", () => {
		for (const target of cases) {
			expect([target, posixPath.normalize(target)])
				.toEqual([target, nodePath.posix.normalize(target)]);
		}
	});

	it("resolves, dirnames and basenames the way node does", () => {
		for (const target of cases) {
			expect([target, posixPath.dirname(target)])
				.toEqual([target, nodePath.posix.dirname(target)]);
			expect([target, posixPath.basename(target)])
				.toEqual([target, nodePath.posix.basename(target)]);
			expect([target, posixPath.isAbsolute(target)])
				.toEqual([target, nodePath.posix.isAbsolute(target)]);
		}
	});

	/**
	 * The suffix cases are picked for the corners, because Node's rule compares
	 * the suffix against the whole path rather than the last segment and the
	 * result is genuinely surprising in two directions. `graphNameFor` reads the
	 * answer, and an empty one means "keep the name the graph already has" — so
	 * a near-miss here renames graphs on the web that it would not rename on a
	 * developer's machine.
	 */
	it("strips a suffix from a basename the way node does", () => {
		const suffixed = [
			"Greeter.nodescript", "x.nodescript", ".nodescript", "a/b/C.nodescript",
			"a/b/.nodescript", "nodescript", ".a.nodescript", "a/b/",
		];
		for (const target of suffixed) {
			expect([target, posixPath.basename(target, ".nodescript")])
				.toEqual([target, nodePath.posix.basename(target, ".nodescript")]);
		}
		for (const target of ["a.b", "b", "a/b", "b/b"]) {
			expect([target, posixPath.basename(target, "b")])
				.toEqual([target, nodePath.posix.basename(target, "b")]);
		}
	});

	it("joins and relativises the way node does", () => {
		const pairs: [string, string][] = [
			[".roswaal/scripts", ".roswaal/scripts/Shared/Greeter.nodescript"],
			["/demo", "/demo/src/Main.luau"],
			["/demo/src", "/demo/.roswaal"],
			["a/b", "a/b"],
		];
		for (const [from, to] of pairs) {
			expect([from, to, posixPath.relative(from, to)])
				.toEqual([from, to, nodePath.posix.relative(from, to)]);
			expect([from, to, posixPath.join(from, to)])
				.toEqual([from, to, nodePath.posix.join(from, to)]);
		}
	});
});

describe("what the volume answers when something is not there", () => {
	/**
	 * The rejections are the interesting half. Most of `project.ts` reads the
	 * filesystem as `.catch(() => null)` and treats the rejection as the
	 * information, so a volume that resolved where Node rejects would not fail
	 * loudly — it would report an empty project and look like it had worked.
	 */
	it("rejects a read of a file that is not there", async () => {
		await expect(volume.readFile("/demo/nope.luau", "utf8")).rejects.toThrow(/ENOENT/);
	});

	it("rejects a write into a directory that does not exist", async () => {
		await expect(volume.writeFile("/demo/nowhere/x.luau", "x", "utf8")).rejects.toThrow(/ENOENT/);
	});

	it("rejects removing something absent unless forced", async () => {
		await expect(volume.rm("/demo/nope.luau")).rejects.toThrow(/ENOENT/);
		await expect(volume.rm("/demo/nope.luau", { force: true })).resolves.toBeUndefined();
	});

	it("refuses to remove a directory without being told to recurse", async () => {
		await expect(volume.rm("/demo/src")).rejects.toThrow(/EISDIR/);
	});

	it("reports a directory as a directory and a file as a file", async () => {
		expect((await volume.stat("/demo/src")).isDirectory()).toBe(true);
		expect((await volume.stat("/demo/roswaal.json")).isFile()).toBe(true);
	});
});

// ---------------------------------------------------------------------------

describe("opening a project held in memory", () => {
	it("finds the project and its node packs", async () => {
		const project = await openProject("/demo");
		expect(project.root).toBe("/demo");
		expect(project.config.outDir).toBe("src");
		// The demo carries two packs, one JSON and one Luau. A zero here would
		// mean the pack loader never ran rather than that it found nothing.
		expect(project.packs.length).toBeGreaterThan(0);
		expect(project.packErrors).toEqual([]);
	});

	it("walks the tree, graphs and generated Luau alike", async () => {
		const project = await openProject("/demo");
		const tree = await buildTree(project);

		const paths: string[] = [];
		const visit = (entries: typeof tree) => {
			for (const entry of entries) {
				paths.push(entry.path);
				if (entry.children) visit(entry.children);
			}
		};
		visit(tree);

		expect(paths).toContain(".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript");
		expect(paths).toContain("src/ReplicatedStorage/Shared/Greeter.luau");
	});

	/**
	 * Generated Luau says which graph produced it, and the tree reads that back
	 * off the file rather than guessing from the name. It is the one part of the
	 * walk that opens every file in outDir, so it is the one most likely to go
	 * quiet on a filesystem that answers differently.
	 */
	it("maps generated files back to the graph that wrote them", async () => {
		const project = await openProject("/demo");
		const tree = await buildTree(project);

		const generated: string[] = [];
		const visit = (entries: typeof tree) => {
			for (const entry of entries) {
				if (entry.generatedFrom) generated.push(entry.path);
				if (entry.children) visit(entry.children);
			}
		};
		visit(tree);

		expect(generated.length).toBeGreaterThan(0);
	});
});

describe("compiling a project held in memory", () => {
	it("writes Luau for every graph, into the volume", async () => {
		const project = await openProject("/demo");
		const results = await compileAll(project, { write: true });

		expect(results.length).toBeGreaterThan(0);
		for (const result of results) {
			expect([result.scriptPath, result.skipped]).toEqual([result.scriptPath, undefined]);
			expect([result.scriptPath, result.written]).toEqual([result.scriptPath, true]);
		}

		const written = volume.snapshot("/demo/src");
		expect(Object.keys(written).length).toBe(results.length);
	});

	/**
	 * The hand-edit guard is the rule with the sharpest consequence — it is what
	 * stands between a recompile and somebody's afternoon — and it works by
	 * reading a hash out of a file it wrote earlier. Both halves have to survive
	 * the round trip through the volume for a second compile to be allowed at
	 * all, so compiling twice tests the write and the read back together.
	 */
	it("still owns what it wrote, so a second compile is not refused", async () => {
		const project = await openProject("/demo");
		await compileAll(project, { write: true });
		const again = await compileAll(project, { write: true });

		for (const result of again) {
			expect([result.scriptPath, result.skipped]).toEqual([result.scriptPath, undefined]);
			expect([result.scriptPath, result.written]).toEqual([result.scriptPath, true]);
		}
	});

	it("refuses a file somebody edited by hand", async () => {
		const project = await openProject("/demo");
		const [first] = await compileAll(project, { write: true });

		const target = `/demo/${first.outputPath}`;
		const edited = (await volume.readFile(target, "utf8")) + "\n-- a change somebody made\n";
		await volume.writeFile(target, edited, "utf8");

		const results = await compileAll(project, { write: true });
		const refused = results.find((r) => r.outputPath === first.outputPath);
		expect(refused?.written).toBe(false);
		expect(refused?.skipped).toMatch(/edited by hand/);

		// Put it back, so the order tests run in cannot matter.
		await volume.writeFile(target, edited.replace("\n-- a change somebody made\n", ""), "utf8");
	});

	it("stamps an output hash that describes the bytes it wrote", async () => {
		const project = await openProject("/demo");
		const [first] = await compileAll(project, { write: true });
		const written = await volume.readFile(`/demo/${first.outputPath}`, "utf8");

		const parts = splitGenerated(written);
		expect(parts).not.toBeNull();
		expect(parts!.declaredHash).toMatch(/^[0-9a-f]+$/);
	});
});

describe("editing a project held in memory", () => {
	it("round-trips a graph through the volume", async () => {
		const project = await openProject("/demo");
		const relPath = ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript";

		const script = await readScript(project, relPath);
		const before = script.nodes.length;

		script.nodes.push({ id: "added-by-test", def: "script.begin", x: 40, y: 40 });
		await writeScript(project, relPath, script);

		const reread = await readScript(project, relPath);
		expect(reread.nodes.length).toBe(before + 1);
		expect(reread.nodes.some((node) => node.id === "added-by-test")).toBe(true);

		// Back to what it was: the fixture is shared with the tests above.
		reread.nodes = reread.nodes.filter((node) => node.id !== "added-by-test");
		await writeScript(project, relPath, reread);
	});
});
