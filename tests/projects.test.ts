/**
 * Switching from one project to another without restarting the daemon.
 *
 * The daemon could always do this — `POST /api/project/open` and a 409 guard
 * behind it — and the editor had no way to ask once the first-run shell was
 * behind you. 0.18.2 is the way to ask, so what is worth testing is the two
 * pure parts of it: how a root is named in the menu, and what the store says is
 * still unwritten.
 *
 * The second is the one with teeth. Changing project closes every document, and
 * autosave is debounced — so anything the store still calls dirty is an edit
 * that only exists in the tab. Missing one loses work silently, which is the
 * worst way to lose it.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { projectName, projectTail } from "../src/app/recents.js";
import { store } from "../src/app/store.js";
import { Builder } from "./helpers.js";

describe("naming a project in the menu", () => {
	it("calls it what the folder is called", () => {
		expect(projectName("V:/Infinite Studios/roswaal-node-scripter/examples/demo")).toBe("demo");
		expect(projectName("C:\\Users\\someone\\tank")).toBe("tank");
	});

	it("is not fooled by a trailing separator", () => {
		expect(projectName("C:\\Users\\someone\\tank\\")).toBe("tank");
		expect(projectName("/home/someone/tank/")).toBe("tank");
	});

	it("falls back to the whole thing when there is nothing to take", () => {
		expect(projectName("/")).toBe("/");
	});
});

/**
 * The tail rather than the head, because the head is what every project in one
 * repository has in common and the end is the only part that differs.
 */
describe("shortening a path", () => {
	it("keeps the end", () => {
		expect(projectTail("V:/Infinite Studios/roswaal-node-scripter/examples/demo", 2))
			.toBe("…/examples/demo");
	});

	it("keeps the separator the path was written with", () => {
		expect(projectTail("C:\\Users\\someone\\projects\\tank", 2)).toBe("…\\projects\\tank");
	});

	it("leaves a path that is already short alone, with no ellipsis to explain", () => {
		expect(projectTail("C:\\tank", 2)).toBe("C:\\tank");
		expect(projectTail("/home/tank", 2)).toBe("/home/tank");
	});
});

const A = "scripts/A.nodescript";
const B = "scripts/B.nodescript";

function graph(name: string) {
	const b = new Builder(name);
	b.node("script.begin");
	return b.build();
}

describe("what has not reached disk yet", () => {
	beforeEach(() => {
		store.closeAll();
		store.setLocked(false);
	});

	it("is nothing, when nothing has been touched", () => {
		store.open(A, graph("A"));
		expect(store.unsaved()).toEqual([]);
	});

	it("names the graph and hands back what to write", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));

		const pending = store.unsaved();
		expect(pending).toHaveLength(1);
		expect(pending[0].path).toBe(A);
		expect(pending[0].script.name).toBe("A edited");
	});

	/**
	 * The case the feature exists for. Autosave follows the document you are
	 * looking at, so editing one graph and switching tabs inside the debounce
	 * window leaves the first one dirty with nothing scheduled to write it —
	 * and changing project closes them both.
	 */
	it("includes a tab you edited and moved away from", () => {
		store.open(A, graph("A"));
		store.open(B, graph("B"));

		store.activate(A);
		store.edit((s) => ({ ...s, name: "A edited" }));
		store.activate(B);

		expect(store.unsaved().map((p) => p.path)).toEqual([A]);
	});

	it("forgets one once it has been written", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));
		const [{ script }] = store.unsaved();
		store.markSaved(A, script);
		expect(store.unsaved()).toEqual([]);
	});

	/** An edit made while the write was in flight has not been written. */
	it("keeps one that changed after the write began", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));
		const [{ script: writing }] = store.unsaved();
		store.edit((s) => ({ ...s, name: "A edited again" }));
		store.markSaved(A, writing);
		expect(store.unsaved().map((p) => p.script.name)).toEqual(["A edited again"]);
	});

	/** A write finishing while another tab is in front used to mark that tab clean. */
	it("marks the graph that was written, not the one on screen", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));
		const [{ script: writing }] = store.unsaved();
		store.open(B, graph("B"));
		store.edit((s) => ({ ...s, name: "B edited" }));
		store.markSaved(A, writing);
		expect(store.unsaved().map((p) => p.path)).toEqual([B]);
	});

	it("reports both when both are waiting", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));
		store.open(B, graph("B"));
		store.edit((s) => ({ ...s, name: "B edited" }));

		expect(store.unsaved().map((p) => p.path).sort()).toEqual([A, B]);
	});
});

describe("closing what a delete took", () => {
	beforeEach(() => {
		store.closeAll();
		store.setLocked(false);
	});

	it("closes every file under a folder, and nothing beside it", () => {
		store.open("src/gone/A.nodescript", graph("A"));
		store.open("src/gone/deeper/B.nodescript", graph("B"));
		store.open("src/gone-not/C.nodescript", graph("C"));
		store.closePath("src/gone");
		expect(store.openPaths()).toEqual(["src/gone-not/C.nodescript"]);
		expect(store.getSnapshot().path).toBe("src/gone-not/C.nodescript");
	});
});

describe("undo in the middle of a drag", () => {
	beforeEach(() => {
		store.closeAll();
		store.setLocked(false);
	});

	/** It used to restore under the drag, and the drag then landed on top and lost a step. */
	it("waits for the drag to finish", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "first" }));
		store.begin();
		store.apply((s) => ({ ...s, name: "dragging" }));
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("dragging");
		store.end();
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("first");
	});
});
