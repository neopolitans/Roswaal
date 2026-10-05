/**
 * An open graph following its file on disk, without taking its own echoes.
 *
 * In Dynamic mode every save is followed by the daemon's news that the file
 * changed. When saves came quickly, the news of one could arrive after the
 * next had been made, and was read as somebody else's edit: a clean graph
 * took the older file, so a recombined pin came apart on its own and a wire
 * being dragged lost the pin it was going to land on.
 */

import { describe, expect, it } from "vitest";

import { SaveQueue } from "../src/app/saveQueue.js";
import { diskVerdict } from "../src/app/useAutosave.js";

const open = (text: string, dirty = false, busy = false) => ({ text, dirty, busy });

describe("what a file on disk means to the open graph", () => {
	it("is this tab's own when it matches any recent write, not only the last", () => {
		expect(diskVerdict("A", ["A", "B", "C"], open("C"))).toBe("ours");
	});

	it("is this tab's own when it is what is open", () => {
		expect(diskVerdict("C", [], open("C", true))).toBe("ours");
	});

	it("waits while a wire is in the air", () => {
		expect(diskVerdict("X", ["A"], open("A", false, true))).toBe("later");
	});

	it("is taken by a clean graph when it is somebody else's", () => {
		expect(diskVerdict("X", ["A"], open("A"))).toBe("reload");
	});

	it("is asked about when the graph has edits of its own", () => {
		expect(diskVerdict("X", ["A"], open("B", true))).toBe("ask");
	});
});

describe("a write that is still on its way", () => {
	it("is known to the queue by path", async () => {
		let release: () => void = () => undefined;
		const queue = new SaveQueue(
			() => 0,
			() => undefined,
		);
		queue.put("Rig.nodescript", () => new Promise<void>((resolve) => (release = resolve)));
		expect(queue.has("Rig.nodescript")).toBe(true);
		expect(queue.has("Config.nodescript")).toBe(false);
		const flushing = queue.flush("Rig.nodescript");
		expect(queue.has("Rig.nodescript")).toBe(true);
		// The write starts a tick later, which is when it hands over its resolver.
		await new Promise((resolve) => setTimeout(resolve, 0));
		release();
		await flushing;
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(queue.has("Rig.nodescript")).toBe(false);
	});
});
