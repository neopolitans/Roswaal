/**
 * `writeFileAtomically` when a save does not finish (F11), and on a filesystem
 * whose own writes are already whole.
 *
 * A project once held 28 empty `Rig.nodescript.<random>.tmp` files: each a
 * temporary that was made and never written, and never removed, because only a
 * failed rename cleaned up after itself. The filesystem here is the web build's
 * memory volume behind a stand-in that fails the way a cut-off browser save
 * does: the file is made, empty, and then the write goes no further.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	writes: [] as string[],
	failTemporary: false,
	whole: false,
}));

vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume } = await import("../src/web/volume.js");
	const volume = new Volume();
	const fs = new Proxy(volume, {
		get(target, key) {
			if (key === "writesWhole") return state.whole;
			if (key === "writeFile") {
				return async (file: string, data: string | Uint8Array, encoding?: "utf8") => {
					state.writes.push(file);
					if (state.failTemporary && file.endsWith(".tmp")) {
						await volume.writeFile(file, "", "utf8");
						throw new Error("The stream was closed before the write finished.");
					}
					return typeof data === "string"
						? volume.writeFile(file, data, encoding ?? "utf8")
						: volume.writeFile(file, data);
				};
			}
			const value = Reflect.get(target, key);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return { fs, path, formatLuau: (_cwd: string, code: string) => ({ code }) };
});

const { fs } = await import("../src/server/host.js");
const { writeFileAtomically } = await import("../src/server/files.js");

const FILE = "/p/Rig.nodescript";

beforeEach(async () => {
	state.writes.length = 0;
	state.failTemporary = false;
	state.whole = false;
	await fs.rm("/p", { recursive: true, force: true });
	await fs.mkdir("/p", { recursive: true });
	await fs.writeFile(FILE, "the saved graph", "utf8");
	state.writes.length = 0;
});

const left = async () => (await fs.readdir("/p")).sort();

describe("a save through a temporary file", () => {
	it("writes the temporary, then puts it in the file's place", async () => {
		await writeFileAtomically(FILE, "the new graph");
		expect(await fs.readFile(FILE, "utf8")).toBe("the new graph");
		expect(state.writes).toHaveLength(1);
		expect(state.writes[0]).toMatch(/^\/p\/Rig\.nodescript\.[a-z0-9]+\.tmp$/);
		expect(await left()).toEqual(["Rig.nodescript"]);
	});

	it("removes the temporary when writing it fails, and leaves the file as it was", async () => {
		state.failTemporary = true;
		await expect(writeFileAtomically(FILE, "the new graph")).rejects.toThrow(/closed before/);
		expect(await fs.readFile(FILE, "utf8")).toBe("the saved graph");
		expect(await left()).toEqual(["Rig.nodescript"]);
	});
});

describe("a save on a filesystem whose writes are already whole", () => {
	it("writes straight to the file, with no temporary", async () => {
		state.whole = true;
		await writeFileAtomically(FILE, "the new graph");
		expect(await fs.readFile(FILE, "utf8")).toBe("the new graph");
		expect(state.writes).toEqual([FILE]);
		expect(await left()).toEqual(["Rig.nodescript"]);
	});
});

describe("which filesystems say their writes are whole", () => {
	it("the browser's folder and the memory volume do; the web host answers for whichever is behind it", async () => {
		const { Volume } = await import("../src/web/volume.js");
		const { DirectoryFs } = await import("../src/web/directoryFs.js");
		const web = await import("../src/web/host.js");
		expect(new Volume().writesWhole).toBe(true);
		expect(new DirectoryFs({} as FileSystemDirectoryHandle, "/demo").writesWhole).toBe(true);
		expect(web.fs.writesWhole).toBe(true);
		web.useFilesystem({ ...new Volume(), writesWhole: undefined } as never);
		expect(web.fs.writesWhole).toBe(false);
		web.useFilesystem(web.volume);
	});
});
