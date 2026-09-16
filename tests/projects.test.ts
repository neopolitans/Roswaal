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
		store.markSaved();
		expect(store.unsaved()).toEqual([]);
	});

	it("reports both when both are waiting", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));
		store.open(B, graph("B"));
		store.edit((s) => ({ ...s, name: "B edited" }));

		expect(store.unsaved().map((p) => p.path).sort()).toEqual([A, B]);
	});
});
