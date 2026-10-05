/**
 * A read of a file that was written between its snapshot and its bytes.
 *
 * `getFile()` is a snapshot, and Chrome refuses to read one whose file has
 * since changed: "the state had changed since it was read from disk". With
 * Dynamic compiling an edit saves the graph and rewrites its Luau, so a read
 * landing in between was reported as "Could not save" every few edits. The
 * folder reader now takes a fresh snapshot and reads again.
 */

import { describe, expect, it } from "vitest";

import { DirectoryFs } from "../src/web/directoryFs.js";

/** A file whose first `stale` snapshots refuse to be read. */
class StaleFile {
	readonly kind = "file" as const;
	reads = 0;
	constructor(
		public name: string,
		public text: string,
		private stale: number,
	) {}

	async getFile() {
		const goneStale = this.stale > 0;
		if (goneStale) this.stale -= 1;
		const text = this.text;
		const file = this;
		return {
			async text() {
				file.reads += 1;
				if (goneStale) {
					throw new DOMException(
						"An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.",
						"InvalidStateError",
					);
				}
				return text;
			},
			async arrayBuffer() {
				return new TextEncoder().encode(text).buffer;
			},
		};
	}
}

/** A root holding one file. */
function rootWith(file: StaleFile) {
	return {
		kind: "directory" as const,
		name: "project",
		async getFileHandle(name: string) {
			if (name === file.name) return file;
			throw new DOMException(`${name} was not found`, "NotFoundError");
		},
		async getDirectoryHandle(name: string) {
			throw new DOMException(`${name} was not found`, "NotFoundError");
		},
		async *values() {
			yield file;
		},
	} as unknown as FileSystemDirectoryHandle;
}

describe("reading a file that changed under its snapshot", () => {
	it("reads it again rather than failing", async () => {
		const file = new StaleFile("Rig.luau", "return Rig", 2);
		const fs = new DirectoryFs(rootWith(file), "/project");
		expect(await fs.readFile("/project/Rig.luau", "utf8")).toBe("return Rig");
		expect(file.reads).toBe(3);
	});

	it("gives up and reports it when the file never settles", async () => {
		const file = new StaleFile("Rig.luau", "return Rig", 10);
		const fs = new DirectoryFs(rootWith(file), "/project");
		await expect(fs.readFile("/project/Rig.luau", "utf8")).rejects.toThrow(/changed since/);
	});
});
