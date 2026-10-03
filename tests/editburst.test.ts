/**
 * Typing a name in the Inspector is one undo step, not one per letter.
 *
 * `EditBurst` against the real store, so what is checked is the undo history a
 * user would walk back through.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { EditBurst, type BurstStore } from "../src/app/editBurst.js";
import { store } from "../src/app/store.js";
import { Builder } from "./helpers.js";

const A = "scripts/A.nodescript";
const B = "scripts/B.nodescript";

function graph(name: string) {
	const b = new Builder(name);
	b.node("script.begin");
	return b.build();
}

const target: BurstStore = {
	begin: () => store.begin(),
	end: () => store.end(),
	edit: (fn) => store.edit(fn),
	activePath: () => store.getSnapshot().path,
};

function type(burst: EditBurst, word: string) {
	for (let i = 1; i <= word.length; i++) {
		const name = word.slice(0, i);
		burst.edit((s) => ({ ...s, name }));
	}
}

beforeEach(() => {
	store.closeAll();
	store.setLocked(false);
});

describe("an edit burst", () => {
	it("makes a word typed one letter at a time one undo step", () => {
		store.open(A, graph("A"));
		const burst = new EditBurst(target);
		type(burst, "spawn");
		burst.end();
		expect(store.getSnapshot().script?.name).toBe("spawn");
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("A");
	});

	it("starts a new step after it ends", () => {
		store.open(A, graph("A"));
		const burst = new EditBurst(target);
		type(burst, "ab");
		burst.end();
		type(burst, "abc");
		burst.end();
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("ab");
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("A");
	});

	it("ending twice, or without typing, does nothing", () => {
		store.open(A, graph("A"));
		const burst = new EditBurst(target);
		burst.end();
		type(burst, "x");
		burst.end();
		burst.end();
		expect(burst.open).toBe(false);
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("A");
	});

	it("does not end a transaction on a graph it did not begin on", () => {
		store.open(A, graph("A"));
		store.open(B, graph("B"));
		store.activate(A);
		const burst = new EditBurst(target);
		type(burst, "ab");
		store.activate(B);
		burst.end();
		// B was never in a transaction, so an edit there is its own step.
		store.edit((s) => ({ ...s, name: "B1" }));
		store.edit((s) => ({ ...s, name: "B2" }));
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("B1");
	});
});
