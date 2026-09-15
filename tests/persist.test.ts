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

import { persistence, type SnapshotStore } from "../src/web/persist.js";
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

const PROJECT: VolumeSnapshot = { "/demo/roswaal.json": "{}" };

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

		let files: VolumeSnapshot = { "/demo/a.nodescript": "first" };
		keeping.touch(() => files);
		files = { "/demo/a.nodescript": "second" };
		await settle();

		expect(await persistence(store, "0.0.0").restore())
			.toEqual({ "/demo/a.nodescript": "second" });
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
