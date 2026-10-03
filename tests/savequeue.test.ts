/**
 * Autosave's rules, without React in the way.
 *
 * Each case is a way an edit used to be lost: the timer belonged to the
 * screen, so anything that changed the screen inside the pause took the write
 * with it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaveQueue } from "../src/app/saveQueue.js";

describe("autosave", () => {
	let written: string[];
	let failures: Error[];
	let queue: SaveQueue;

	beforeEach(() => {
		vi.useFakeTimers();
		written = [];
		failures = [];
		queue = new SaveQueue(() => 600, (error) => failures.push(error));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const writer = (label: string) => async () => {
		written.push(label);
	};

	it("writes a file once the pause is over", async () => {
		queue.put("a", writer("a1"));
		await vi.advanceTimersByTimeAsync(599);
		expect(written).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);
		expect(written).toEqual(["a1"]);
	});

	it("writes only the newest edit to a file", async () => {
		queue.put("a", writer("a1"));
		await vi.advanceTimersByTimeAsync(300);
		queue.put("a", writer("a2"));
		await vi.advanceTimersByTimeAsync(600);
		expect(written).toEqual(["a2"]);
	});

	/** Switching tabs used to cancel the first file's write. */
	it("keeps each file's write when another file is edited", async () => {
		queue.put("a", writer("a1"));
		queue.put("b", writer("b1"));
		await vi.advanceTimersByTimeAsync(600);
		expect(written.sort()).toEqual(["a1", "b1"]);
	});

	it("forgets a deleted file's write, and only under that folder", async () => {
		queue.put("src/gone/a", writer("a1"));
		queue.put("src/gone", writer("folder"));
		queue.put("src/gone-but-not-under", writer("kept"));
		queue.drop("src/gone");
		await vi.advanceTimersByTimeAsync(600);
		expect(written).toEqual(["kept"]);
	});

	it("writes what is under a folder at once, before it moves", async () => {
		queue.put("src/a/one", writer("one"));
		queue.put("src/b/two", writer("two"));
		await queue.flushUnder("src/a");
		expect(written).toEqual(["one"]);
		// And not a second time when the old timer would have fired.
		await vi.advanceTimersByTimeAsync(600);
		expect(written).toEqual(["one", "two"]);
	});

	/** A slow write must not land after a newer one and put the old graph back. */
	it("writes one file one write at a time, in order", async () => {
		const order: string[] = [];
		let release!: () => void;
		queue.put("a", () => new Promise<void>((resolve) => {
			release = () => {
				order.push("slow");
				resolve();
			};
		}));
		await vi.advanceTimersByTimeAsync(600);
		queue.put("a", async () => {
			order.push("fast");
		});
		await vi.advanceTimersByTimeAsync(600);
		expect(order).toEqual([]);
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(order).toEqual(["slow", "fast"]);
	});

	it("reports a failed write nobody was waiting for", async () => {
		queue.put("a", async () => {
			throw new Error("disk full");
		});
		await vi.advanceTimersByTimeAsync(600);
		expect(failures.map((error) => error.message)).toEqual(["disk full"]);
	});

	it("rejects flushAll when a write fails, after trying the rest", async () => {
		queue.put("a", async () => {
			throw new Error("disk full");
		});
		queue.put("b", writer("b1"));
		await expect(queue.flushAll()).rejects.toThrow("disk full");
		expect(written).toEqual(["b1"]);
		expect(failures).toEqual([]);
	});

	it("says whether anything is still to be written", async () => {
		expect(queue.busy()).toBe(false);
		queue.put("a", writer("a1"));
		expect(queue.busy()).toBe(true);
		await vi.advanceTimersByTimeAsync(600);
		expect(queue.busy()).toBe(false);
	});
});
