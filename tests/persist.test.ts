/**
 * Keeping the playground's project across a reload.
 *
 * The decisions worth pinning down are not "does it write a file" — they are
 * what happens at the edges, and every one of them loses somebody's work if it
 * is wrong: a burst of edits that writes once, a tab closing between a change
 * and the write settling, a reset racing the write it was meant to cancel, and
 * a browser that simply refuses to store anything.
 *
 * The store is an interface for exactly this reason. The origin private
 * filesystem does not exist in Node, and the parts of this that can be wrong
 * are not the eleven lines that talk to it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opfsStore, persistence, type RestoredVolume, type SnapshotStore } from "../src/web/persist.js";
import type { VolumeSnapshot } from "../src/web/volume.js";

/** A store in a variable, which is all the real one is with extra steps. */
function fakeStore() {
	let held: string | null = null;
	const store: SnapshotStore & {
		writes: number;
		refuse: string | null;
		held: () => string | null;
	} = {
		writes: 0,
		refuse: null,
		held: () => held,
		async read() {
			return held;
		},
		async write(text) {
			if (store.refuse) throw new Error(store.refuse);
			store.writes++;
			held = text;
		},
		async clear() {
			held = null;
		},
	};
	return store;
}

const FILES: VolumeSnapshot = { "/demo/roswaal.json": "{}" };

/**
 * What the worker hands the store: the files, and the directories among them.
 *
 * `dirs` carries the ones no file implies. A directory somebody made and had
 * not put anything in yet is invisible to a snapshot keyed by path, and used
 * to come back as nothing at all.
 */
const PROJECT: RestoredVolume = { files: FILES, dirs: ["/demo", "/demo/empty"] };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Lets the debounce fire and the write that follows it finish. */
async function settle() {
	await vi.advanceTimersByTimeAsync(500);
}

describe("restoring what was left behind", () => {
	it("has nothing to restore on a first visit", async () => {
		const store = fakeStore();
		expect(await persistence(store, "0.0.0").restore()).toBeNull();
	});

	it("gives back what it wrote", async () => {
		const store = fakeStore();
		const first = persistence(store, "0.0.0");
		first.touch(() => PROJECT);
		await settle();

		expect(await persistence(store, "0.0.0").restore()).toEqual(PROJECT);
	});

	/**
	 * A document this version does not understand is not half-mounted. Starting
	 * from the demo is a clean answer; a project missing the files a newer
	 * format put somewhere else is not.
	 */
	it("starts from the demo rather than mounting a format it cannot read", async () => {
		const store = fakeStore();
		await store.write(JSON.stringify({ format: 99, files: PROJECT }));
		expect(await persistence(store, "0.0.0").restore()).toBeNull();
	});

	it("survives a document that is not JSON at all", async () => {
		const store = fakeStore();
		await store.write("{ this is not json");
		const keeping = persistence(store, "0.0.0");

		expect(await keeping.restore()).toBeNull();
		expect(keeping.failure).not.toBeNull();
	});
});

describe("when the writing happens", () => {
	it("collapses a burst of changes into one write", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");

		for (let i = 0; i < 20; i++) keeping.touch(() => PROJECT);
		await settle();

		expect(store.writes).toBe(1);
	});

	/**
	 * The change made just before a tab is hidden is the one most likely to be
	 * noticed missing, and it is the one still settling.
	 */
	it("finishes a settling write when asked to flush", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");

		keeping.touch(() => PROJECT);
		expect(store.writes).toBe(0);

		await keeping.flush();
		expect(store.writes).toBe(1);
		expect(await persistence(store, "0.0.0").restore()).toEqual(PROJECT);
	});

	it("writes what the volume held when the write happened, not when it was asked", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");

		let held: RestoredVolume = { files: { "/demo/a.nodescript": "first" }, dirs: ["/demo"] };
		keeping.touch(() => held);
		held = { files: { "/demo/a.nodescript": "second" }, dirs: ["/demo"] };
		await settle();

		expect(await persistence(store, "0.0.0").restore())
			.toEqual({ files: { "/demo/a.nodescript": "second" }, dirs: ["/demo"] });
	});
});

describe("starting again", () => {
	it("forgets the stored project", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");
		keeping.touch(() => PROJECT);
		await settle();

		await keeping.forget();
		expect(store.held()).toBeNull();
	});

	/**
	 * The race this is guarding: a change lands, the write is still settling,
	 * and somebody resets. Without stopping first, the settled write puts the
	 * project back a moment after it was thrown away — and the next reload
	 * restores the thing that was supposed to be gone.
	 */
	it("cannot be undone by a write that was still settling", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");

		keeping.touch(() => PROJECT);
		await keeping.forget();
		await settle();

		expect(store.held()).toBeNull();
		expect(await persistence(store, "0.0.0").restore()).toBeNull();
	});

	it("stays forgotten when more changes arrive afterwards", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");

		await keeping.forget();
		keeping.touch(() => PROJECT);
		await settle();

		expect(store.held()).toBeNull();
	});
});

describe("when the browser refuses to store anything", () => {
	/**
	 * Private windows, blocked site data, a full quota. The editor keeps
	 * working — the volume is in memory and does not need this — and says so
	 * rather than pretending the work is safe.
	 */
	it("reports the refusal and keeps it", async () => {
		const store = fakeStore();
		store.refuse = "The quota is full.";
		const keeping = persistence(store, "0.0.0");

		keeping.touch(() => PROJECT);
		await settle();

		expect(keeping.failure).toBe("The quota is full.");
	});

	/** A quota that is full will be full again in four hundred milliseconds. */
	it("stops trying rather than writing a whole project on a loop", async () => {
		const store = fakeStore();
		store.refuse = "The quota is full.";
		const keeping = persistence(store, "0.0.0");

		keeping.touch(() => PROJECT);
		await settle();
		store.refuse = null;

		for (let i = 0; i < 5; i++) keeping.touch(() => PROJECT);
		await settle();

		expect(store.writes).toBe(0);
	});
});

/**
 * A directory somebody made and had not put anything in yet.
 *
 * The snapshot is keyed by path, so an empty directory cannot appear in it:
 * there is no file whose path implies it. It came back as nothing at all, and
 * the project that remembered where it was said "Not a directory" — which is a
 * folder quietly disappearing between one visit and the next, and the worst
 * kind of bug a playground can have.
 */
describe("a folder with nothing in it", () => {
	it("survives a reload", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");
		keeping.touch(() => ({
			files: { "/demo/roswaal.json": "{}" },
			dirs: ["/demo", "/demo/scratch"],
		}));
		await settle();

		const back = await persistence(store, "0.0.0").restore();
		expect(back?.dirs).toContain("/demo/scratch");
	});

	it("is kept even when the project has no files at all", async () => {
		const store = fakeStore();
		const keeping = persistence(store, "0.0.0");
		keeping.touch(() => ({ files: {}, dirs: ["/lune_test"] }));
		await settle();

		expect((await persistence(store, "0.0.0").restore())?.dirs).toEqual(["/lune_test"]);
	});

	/**
	 * A document written before directories were kept restores exactly as it
	 * did: the files, and whatever they imply. Anything else would be this
	 * change deciding that older stored projects are unreadable.
	 */
	it("reads a document from before this without complaining", async () => {
		const store = fakeStore();
		await store.write(JSON.stringify({
			format: 1,
			version: "0.0.0",
			files: { "/demo/roswaal.json": "{}" },
		}));

		const back = await persistence(store, "0.0.0").restore();
		expect(back?.files).toEqual({ "/demo/roswaal.json": "{}" });
		expect(back?.dirs).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// A stored place
// ---------------------------------------------------------------------------

const PLACE = new Uint8Array([60, 114, 111, 98, 108, 111, 120, 33]);

/** A store that keeps binaries too, counting how often they are written. */
function binaryStore(binaries: Record<string, Uint8Array>) {
	const store = Object.assign(fakeStore(), {
		binaryWrites: 0,
		async readBinaries() {
			return { ...binaries };
		},
		async writeBinaries(files: Record<string, Uint8Array>) {
			store.binaryWrites++;
			binaries = { ...files };
		},
	});
	return store;
}

describe("a stored place", () => {
	/**
	 * The first settled edit of a session rewrote every binary, megabytes of
	 * them, because nothing said the ones just restored were already stored --
	 * and closing the tab then is what lost the place.
	 */
	it("is not written again by the first edit after a reload", async () => {
		const store = binaryStore({ "/demo/place.rbxl": PLACE });
		await store.write(JSON.stringify({ format: 1, version: "0.0.0", files: FILES }));
		const keeping = persistence(store, "0.0.0");
		const back = await keeping.restore();
		expect(back?.files["/demo/place.rbxl"]).toEqual(PLACE);
		keeping.restoredAt(7);

		keeping.touch(() => ({ files: back!.files, dirs: [], binaryStamp: 7 }));
		await settle();
		expect(store.binaryWrites).toBe(0);

		keeping.touch(() => ({ files: back!.files, dirs: [], binaryStamp: 8 }));
		await settle();
		expect(store.binaryWrites).toBe(1);
	});

	it("is written on the first edit when the restore could not read it", async () => {
		const store = Object.assign(binaryStore({}), {
			async readBinaries(): Promise<Record<string, Uint8Array>> {
				throw new Error("refused");
			},
		});
		await store.write(JSON.stringify({ format: 1, version: "0.0.0", files: FILES }));
		const keeping = persistence(store, "0.0.0");
		await keeping.restore();
		keeping.restoredAt(3);

		keeping.touch(() => ({ files: { ...FILES, "/demo/place.rbxl": PLACE }, dirs: [], binaryStamp: 3 }));
		await settle();
		expect(store.binaryWrites).toBe(1);
	});
});

describe("binaries in the origin private filesystem", () => {
	it("are read back as they were written", async () => {
		const root = new FakeDir("root");
		const store = opfsStore("project.json", async () => root as unknown as FileSystemDirectoryHandle);
		await store.writeBinaries!({ "/demo/place.rbxl": PLACE });
		expect(await store.readBinaries!()).toEqual({ "/demo/place.rbxl": PLACE });
		await store.writeBinaries!({});
		expect(await store.readBinaries!()).toEqual({});
		expect([...root.dirs.keys()]).toEqual([]);
	});

	/** A tab closed part-way through writing a new place keeps the old one. */
	it("keep the stored set until a new one is completely written", async () => {
		const root = new FakeDir("root");
		const store = opfsStore("project.json", async () => root as unknown as FileSystemDirectoryHandle);
		await store.writeBinaries!({ "/demo/place.rbxl": PLACE });

		FakeDir.failWritesAfter = 1;
		await expect(store.writeBinaries!({
			"/demo/a.rbxl": new Uint8Array([1]), "/demo/b.rbxl": new Uint8Array([2]),
		})).rejects.toThrow(/closed/);
		FakeDir.failWritesAfter = Number.POSITIVE_INFINITY;

		expect(await store.readBinaries!()).toEqual({ "/demo/place.rbxl": PLACE });
	});

	it("reads a store written before the pointer, and clears every set", async () => {
		const root = new FakeDir("root");
		const legacy = await root.getDirectoryHandle("binaries", { create: true });
		const file = await legacy.getFileHandle(encodeURIComponent("/demo/place.rbxl"), { create: true });
		await (await file.createWritable()).write(PLACE);
		const store = opfsStore("project.json", async () => root as unknown as FileSystemDirectoryHandle);
		expect(await store.readBinaries!()).toEqual({ "/demo/place.rbxl": PLACE });

		await store.clear();
		expect([...root.dirs.keys(), ...root.files.keys()]).toEqual([]);
	});
});

/** As much of an OPFS directory as `opfsStore` asks for. */
class FakeDir {
	/** How many file writes succeed before the next one fails, as a closing tab would. */
	static failWritesAfter = Number.POSITIVE_INFINITY;
	readonly kind = "directory" as const;
	readonly files = new Map<string, FakeEntry>();
	readonly dirs = new Map<string, FakeDir>();

	constructor(readonly name: string) {}

	async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
		const found = this.dirs.get(name);
		if (found) return found;
		if (!options?.create) throw new DOMException(name, "NotFoundError");
		const made = new FakeDir(name);
		this.dirs.set(name, made);
		return made;
	}

	async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeEntry> {
		const found = this.files.get(name);
		if (found) return found;
		if (!options?.create) throw new DOMException(name, "NotFoundError");
		const made = new FakeEntry(name);
		this.files.set(name, made);
		return made;
	}

	async removeEntry(name: string): Promise<void> {
		if (!this.files.delete(name) && !this.dirs.delete(name)) throw new DOMException(name, "NotFoundError");
	}

	async *values(): AsyncGenerator<FakeDir | FakeEntry> {
		yield* this.dirs.values();
		yield* this.files.values();
	}
}

class FakeEntry {
	readonly kind = "file" as const;
	data = new Uint8Array();

	constructor(readonly name: string) {}

	async getFile() {
		const data = this.data;
		return {
			text: async () => new TextDecoder().decode(data),
			arrayBuffer: async () => data.slice().buffer,
		};
	}

	async createWritable() {
		if (FakeDir.failWritesAfter <= 0) throw new Error("The tab closed.");
		FakeDir.failWritesAfter--;
		return {
			write: async (chunk: string | Uint8Array) => {
				this.data = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
			},
			close: async () => undefined,
		};
	}
}
