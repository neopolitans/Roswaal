/**
 * The project layer, running on a folder from the developer's own disk.
 *
 * `tests/volume.test.ts` makes the case that `project.ts` needs *a* filesystem
 * rather than *the* filesystem. This is the other half of that claim, and the
 * half with consequences: the volume is Roswaal's own scratch space, and this
 * is somebody's repository, with Rojo watching it.
 *
 * So the test is the same test. The demo is mounted into a fake
 * `FileSystemDirectoryHandle` — the API the browser hands over, reduced to what
 * `DirectoryFs` calls — and then the real `openProject`, `buildTree`,
 * `compileAll` and hand-edit guard run over it, with nothing mocked but the
 * disk. If the two implementations disagree, opening a real project does
 * something different from opening the playground's, and that difference is
 * discovered by somebody whose files it happened to.
 *
 * A fake rather than the browser's own, because the interesting failures are
 * the shapes `project.ts` reads — a missing file rejecting, a directory
 * refusing to be removed without `recursive` — and those do not need Chrome.
 */

import { readFile, readdir } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// A directory handle, as much of one as `DirectoryFs` ever asks for
// ---------------------------------------------------------------------------

class FakeFile {
	readonly kind = "file" as const;
	constructor(public name: string, public data = new Uint8Array()) {}

	async getFile() {
		const data = this.data;
		return {
			async text() {
				return new TextDecoder().decode(data);
			},
			async arrayBuffer() {
				return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
			},
		};
	}

	async createWritable() {
		const file = this;
		return {
			async write(chunk: string | ArrayBuffer) {
				file.data = typeof chunk === "string"
					? new TextEncoder().encode(chunk)
					: new Uint8Array(chunk);
			},
			async close() {},
		};
	}
}

class FakeDirectory {
	readonly kind = "directory" as const;
	readonly files = new Map<string, FakeFile>();
	readonly dirs = new Map<string, FakeDirectory>();

	constructor(public name: string) {}

	async getDirectoryHandle(name: string, options?: { create?: boolean }) {
		const found = this.dirs.get(name);
		if (found) return found;
		if (!options?.create) throw notFound(name);
		if (this.files.has(name)) throw notFound(name);
		const made = new FakeDirectory(name);
		this.dirs.set(name, made);
		return made;
	}

	async getFileHandle(name: string, options?: { create?: boolean }) {
		const found = this.files.get(name);
		if (found) return found;
		if (!options?.create) throw notFound(name);
		if (this.dirs.has(name)) throw notFound(name);
		const made = new FakeFile(name);
		this.files.set(name, made);
		return made;
	}

	async removeEntry(name: string, options?: { recursive?: boolean }) {
		if (this.files.delete(name)) return;
		const dir = this.dirs.get(name);
		if (!dir) throw notFound(name);
		if (!options?.recursive && (dir.files.size > 0 || dir.dirs.size > 0)) {
			throw new DOMException(`${name} is not empty`, "InvalidModificationError");
		}
		this.dirs.delete(name);
	}

	async *values(): AsyncGenerator<FakeFile | FakeDirectory> {
		for (const dir of this.dirs.values()) yield dir;
		for (const file of this.files.values()) yield file;
	}
}

function notFound(name: string): DOMException {
	return new DOMException(`${name} was not found`, "NotFoundError");
}

/** Writes a file into the fake tree, making the directories it needs. */
function place(root: FakeDirectory, path: string, text: string): void {
	const parts = path.split("/").filter(Boolean);
	let at = root;
	for (const part of parts.slice(0, -1)) {
		if (!at.dirs.has(part)) at.dirs.set(part, new FakeDirectory(part));
		at = at.dirs.get(part)!;
	}
	const name = parts[parts.length - 1];
	at.files.set(name, new FakeFile(name, new TextEncoder().encode(text)));
}

const ROOT = new FakeDirectory("demo");

// ---------------------------------------------------------------------------

vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { DirectoryFs } = await import("../src/web/directoryFs.js");
	const fs = new DirectoryFs(ROOT as unknown as FileSystemDirectoryHandle, "/demo");
	return { fs, path, formatLuau: (_cwd: string, code: string) => code };
});

const { buildTree, compileAll, openProject, readScript, writeScript } =
	await import("../src/server/project.js");

const DEMO = nodePath.resolve(
	nodePath.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo",
);

beforeAll(async () => {
	const walk = async (at: string): Promise<void> => {
		for (const entry of await readdir(at, { withFileTypes: true })) {
			const abs = nodePath.join(at, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
				continue;
			}
			place(ROOT, nodePath.relative(DEMO, abs).split(nodePath.sep).join("/"),
				await readFile(abs, "utf8"));
		}
	};
	await walk(DEMO);
});

describe("a project opened from a folder on disk", () => {
	it("is a project, with its node packs", async () => {
		const project = await openProject("/demo");
		expect(project.root).toBe("/demo");
		expect(project.config.outDir).toBe("src");
		expect(project.packs.length).toBeGreaterThan(0);
		expect(project.packErrors).toEqual([]);
	});

	it("walks the tree the same way", async () => {
		const project = await openProject("/demo");
		const paths: string[] = [];
		const visit = (entries: Awaited<ReturnType<typeof buildTree>>) => {
			for (const entry of entries) {
				paths.push(entry.path);
				if (entry.children) visit(entry.children);
			}
		};
		visit(await buildTree(project));

		expect(paths).toContain(".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript");
		expect(paths).toContain("src/ReplicatedStorage/Shared/Greeter.luau");
	});

	it("compiles into the folder", async () => {
		const project = await openProject("/demo");
		const results = await compileAll(project, { write: true });

		expect(results.length).toBeGreaterThan(0);
		for (const result of results) {
			expect([result.scriptPath, result.written]).toEqual([result.scriptPath, true]);
		}

		// Straight out of the fake tree: the bytes really landed where Rojo looks.
		const written = ROOT.dirs.get("src")?.dirs.get("ReplicatedStorage")
			?.dirs.get("Shared")?.files.get("Greeter.luau");
		expect(await written?.getFile().then((f) => f.text())).toContain("roswaal-output:");
	});

	/** The rule with the sharpest consequence, over somebody's real files. */
	it("still owns what it wrote, so a second compile is not refused", async () => {
		const project = await openProject("/demo");
		await compileAll(project, { write: true });
		for (const result of await compileAll(project, { write: true })) {
			expect([result.scriptPath, result.skipped]).toEqual([result.scriptPath, undefined]);
		}
	});

	it("refuses a file somebody edited by hand", async () => {
		const project = await openProject("/demo");
		const [first] = await compileAll(project, { write: true });

		const target = ROOT.dirs.get("src")?.dirs.get("ReplicatedStorage")
			?.dirs.get("Shared")?.files.get("Greeter.luau")!;
		const edited = await target.getFile().then((f) => f.text()) + "\n-- a hand edit\n";
		target.data = new TextEncoder().encode(edited);

		const again = await compileAll(project, { write: true });
		const refused = again.find((r) => r.outputPath === first.outputPath);
		expect(refused?.written).toBe(false);
		expect(refused?.skipped).toMatch(/edited by hand/);
	});

	it("round-trips a graph through the folder", async () => {
		const project = await openProject("/demo");
		const relPath = ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript";

		const script = await readScript(project, relPath);
		const before = script.nodes.length;
		script.nodes.push({ id: "disk-test", def: "script.begin", x: 10, y: 10 });
		await writeScript(project, relPath, script);

		const reread = await readScript(project, relPath);
		expect(reread.nodes.length).toBe(before + 1);

		reread.nodes = reread.nodes.filter((node) => node.id !== "disk-test");
		await writeScript(project, relPath, reread);
	});
});

describe("what the folder answers when something is not there", () => {
	/**
	 * The rejections, again, and for the same reason: most of `project.ts` reads
	 * the filesystem as `.catch(() => null)`, so an implementation that resolves
	 * where the other rejects does not fail — it reports an empty project.
	 */
	it("rejects a read of a file that is not there", async () => {
		const { fs } = await import("../src/server/host.js");
		await expect(fs.readFile("/demo/nope.luau", "utf8")).rejects.toThrow(/ENOENT/);
	});

	it("rejects removing something absent unless forced", async () => {
		const { fs } = await import("../src/server/host.js");
		await expect(fs.rm("/demo/nope.luau")).rejects.toThrow(/ENOENT/);
		await expect(fs.rm("/demo/nope.luau", { force: true })).resolves.toBeUndefined();
	});

	it("refuses to remove a directory without being told to recurse", async () => {
		const { fs } = await import("../src/server/host.js");
		await expect(fs.rm("/demo/src")).rejects.toThrow(/EISDIR/);
	});

	/** `safeJoin` guards the path, and this guards the mount underneath it. */
	it("refuses a path outside the folder that was handed over", async () => {
		const { fs } = await import("../src/server/host.js");
		await expect(fs.readFile("/elsewhere/secrets.txt", "utf8")).rejects.toThrow(/ENOENT/);
		await expect(fs.stat("/demo/../elsewhere")).rejects.toThrow(/ENOENT/);
	});
});
