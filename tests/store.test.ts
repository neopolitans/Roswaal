/**
 * The editor store's refusal to be edited while the graph is being compiled.
 *
 * This is the enforcement point and deliberately not the only visible one: the
 * canvas has a cover over it and the two side panels grey themselves out. But
 * those are eighteen controls across four files, and the useful guarantee is
 * the one that does not depend on remembering all of them — so it is asserted
 * here, where every edit in the editor funnels through.
 *
 * Why it matters: an edit made during a project compile lands in the written
 * file or does not, depending on which file the walk had reached. The file then
 * disagrees with the graph and nothing says so.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { store } from "../src/app/store.js";
import { Builder } from "./helpers.js";

function open() {
	const b = new Builder();
	b.node("script.begin");
	store.open("scripts/Test.nodescript", b.build());
	store.setLocked(false);
}

/** An edit with an obvious fingerprint, so "did it apply" is not a judgement. */
function rename(name: string) {
	store.edit((s) => ({ ...s, name }));
}

describe("the store while a compile is running", () => {
	beforeEach(open);

	it("refuses an edit", () => {
		store.setLocked(true);
		rename("changed");
		expect(store.getSnapshot().script?.name).toBe("Test");
	});

	it("takes edits again once the compile is done", () => {
		store.setLocked(true);
		rename("during");
		store.setLocked(false);
		rename("after");
		expect(store.getSnapshot().script?.name).toBe("after");
	});

	/**
	 * Undo and redo write to the script directly rather than through `apply`,
	 * so they need their own guard. Ctrl+Z during a compile is the likeliest
	 * way to hit this: it is the reflex when a click appears to do nothing.
	 */
	it("refuses undo and redo", () => {
		rename("first");
		rename("second");
		store.setLocked(true);

		store.undo();
		expect(store.getSnapshot().script?.name).toBe("second");

		store.setLocked(false);
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("first");

		store.setLocked(true);
		store.redo();
		expect(store.getSnapshot().script?.name).toBe("first");
	});

	/**
	 * A refused edit must not eat the undo history either. If `apply` had
	 * pushed the snapshot before bailing, one blocked keystroke would leave an
	 * undo entry that undoes nothing.
	 */
	it("does not leave an undo entry behind for an edit it refused", () => {
		rename("first");
		store.setLocked(true);
		rename("blocked");
		store.setLocked(false);

		store.undo();
		expect(store.getSnapshot().script?.name).toBe("Test");
		expect(store.canUndo()).toBe(false);
	});

	/** Reading is still allowed: the canvas cover lets select and copy through. */
	it("still allows selection", () => {
		store.setLocked(true);
		store.select(["n1"]);
		expect([...store.getSnapshot().selection]).toEqual(["n1"]);
	});

	/** The viewport is not the document, and panning is not an edit. */
	it("still allows the view to move", () => {
		store.setLocked(true);
		store.setView({ x: 5, y: 6, zoom: 2 });
		expect(store.getView()).toEqual({ x: 5, y: 6, zoom: 2 });
	});
});
