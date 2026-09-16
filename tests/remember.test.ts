/**
 * Reading the folders the browser remembers.
 *
 * A browser is never told where a picked folder is. `showDirectoryPicker` hands
 * back a handle and the API deliberately exposes only `handle.name` — the leaf
 * — so there is no path to write down and a folder-backed project cannot be a
 * row on a list of paths. What is kept is the handle itself, which comes back
 * as the same handle and can be re-permissioned with a click.
 *
 * The store held one. Working across two real projects meant the older handle
 * was overwritten and that folder became unreachable — you had to find it in
 * the picker again, which is the thing remembering it was for.
 *
 * `foldersFrom` is the part of that worth testing and the part that carries the
 * risk: two stored shapes have to be understood at once, because somebody who
 * had a folder under the old single-key shape must not lose it to a change
 * about keeping more than one. The IndexedDB glue around it is thin, and a
 * hand-rolled stub of that API would mostly test the stub.
 */

import { describe, expect, it } from "vitest";

import { foldersFrom } from "../src/web/remember.js";

/** A stand-in for a directory handle: the two members this module reads. */
function handleFor(name: string): FileSystemDirectoryHandle {
	return {
		kind: "directory" as const,
		name,
		queryPermission: async () => "granted" as PermissionState,
		requestPermission: async () => "granted" as PermissionState,
		isSameEntry: async () => false,
	} as unknown as FileSystemDirectoryHandle;
}

const record = (id: string, name: string, at: number) => ({
	id, name, handle: handleFor(name), at,
});

describe("what the store's contents mean", () => {
	it("reads the shape written by the version that kept many", () => {
		const found = foldersFrom(
			["f1", "f2"],
			[record("f1", "tank", 1000), record("f2", "tycoon", 2000)],
		);
		expect(found.map((one) => one.name)).toEqual(["tycoon", "tank"]);
	});

	/**
	 * The upgrade. A bare handle under the fixed key is what the single-folder
	 * version wrote, and it has to keep working — losing somebody's folder to
	 * this change would be worse than never having made it.
	 */
	it("reads a bare handle from the version that kept one", () => {
		const found = foldersFrom(["last"], [handleFor("from-before")]);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ id: "last", name: "from-before" });
	});

	it("reads both shapes side by side, which is what an upgrade looks like", () => {
		const found = foldersFrom(
			["last", "f2"],
			[handleFor("from-before"), record("f2", "since", 5000)],
		);
		expect(found.map((one) => one.name)).toEqual(["since", "from-before"]);
	});

	it("offers the newest first, which is the one to carry on in", () => {
		const found = foldersFrom(
			["a", "b", "c"],
			[record("a", "old", 1), record("b", "newest", 9), record("c", "middle", 5)],
		);
		expect(found.map((one) => one.name)).toEqual(["newest", "middle", "old"]);
	});

	/**
	 * A stored value from a shape this version does not know. Leaving it out is
	 * the safe reading: the alternative is a card that cannot be opened.
	 */
	it("leaves out anything that is not a handle", () => {
		expect(foldersFrom(["x"], [{ id: "x", name: "nope", at: 1 }])).toEqual([]);
		expect(foldersFrom(["x"], ["a string"])).toEqual([]);
		expect(foldersFrom(["x"], [null])).toEqual([]);
	});

	it("falls back to the key and the handle's own name when a record is partial", () => {
		const found = foldersFrom(["k"], [{ handle: handleFor("named") }]);
		expect(found[0]).toMatchObject({ id: "k", name: "named", at: 0 });
	});

	it("has nothing to say about an empty store", () => {
		expect(foldersFrom([], [])).toEqual([]);
	});
});
