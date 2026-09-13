/**
 * Several graphs open at once.
 *
 * The store held exactly one document until panelisation needed tabs, and about
 * ninety call sites across `src/app` reach for it as "the document I am looking
 * at". Documents were added underneath that surface rather than through it, so
 * most of what is worth testing is **isolation**: that two open graphs cannot
 * reach into each other's history, selection or viewport.
 *
 * The failure this guards against is not a crash. It is undoing in one tab and
 * watching another change — which looks like a graph corrupting itself, and
 * which the compiler would happily write to disk.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { store } from "../src/app/store.js";
import { Builder } from "./helpers.js";

function graph(name: string) {
	const b = new Builder(name);
	b.node("script.begin");
	return b.build();
}

const A = "scripts/A.nodescript";
const B = "scripts/B.nodescript";

beforeEach(() => {
	store.closeAll();
	store.setLocked(false);
});

describe("opening and switching", () => {
	it("keeps both, and the newest is in front", () => {
		store.open(A, graph("A"));
		store.open(B, graph("B"));

		expect(store.getTabs().map((t) => t.name)).toEqual(["A", "B"]);
		expect(store.getSnapshot().path).toBe(B);
	});

	it("switches which one the ordinary API acts on", () => {
		store.open(A, graph("A"));
		store.open(B, graph("B"));

		store.activate(A);
		expect(store.getSnapshot().script?.name).toBe("A");
		store.edit((s) => ({ ...s, name: "A edited" }));
		expect(store.getSnapshot().script?.name).toBe("A edited");

		store.activate(B);
		expect(store.getSnapshot().script?.name, "B was not touched").toBe("B");
	});

	/**
	 * Dynamic compiling calls `open` for a file that changed on disk. Keeping the old
	 * content because the tab happened to exist would leave the editor showing
	 * something the file no longer says.
	 */
	it("replaces content when the same path is opened again", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "edited" }));
		store.open(A, graph("A from disk"));

		expect(store.getSnapshot().script?.name).toBe("A from disk");
		expect(store.canUndo(), "history built on a version that is gone").toBe(false);
		expect(store.getTabs(), "and it is still one tab").toHaveLength(1);
	});

	it("knows what it has open", () => {
		store.open(A, graph("A"));
		expect(store.isOpen(A)).toBe(true);
		expect(store.isOpen(B)).toBe(false);
	});
});

describe("what belongs to one document alone", () => {
	beforeEach(() => {
		store.open(A, graph("A"));
		store.open(B, graph("B"));
	});

	/** The one that would look like a graph corrupting itself. */
	it("undoes in the document you are looking at, and only that one", () => {
		store.activate(A);
		store.edit((s) => ({ ...s, name: "A edited" }));
		store.activate(B);
		store.edit((s) => ({ ...s, name: "B edited" }));

		store.undo();
		expect(store.getSnapshot().script?.name).toBe("B");

		store.activate(A);
		expect(store.getSnapshot().script?.name, "A kept its edit").toBe("A edited");
		expect(store.canUndo(), "and still has its own history").toBe(true);
	});

	it("keeps selections apart", () => {
		store.activate(A);
		store.select(["n1"]);
		store.activate(B);
		expect(store.getSnapshot().selection.size).toBe(0);

		store.activate(A);
		expect([...store.getSnapshot().selection]).toEqual(["n1"]);
	});

	/**
	 * Switching tabs to find the view scrolled to another graph's corner is the
	 * kind of small wrongness that makes tabs feel unreliable.
	 */
	it("keeps each viewport where it was left", () => {
		store.activate(A);
		store.setView({ x: -500, y: -250, zoom: 2 });
		store.activate(B);
		expect(store.getView(), "B is still at home").toEqual({ x: 80, y: 80, zoom: 1 });

		store.activate(A);
		expect(store.getView()).toEqual({ x: -500, y: -250, zoom: 2 });
	});

	it("tracks dirtiness per document", () => {
		store.activate(A);
		store.edit((s) => ({ ...s, name: "A edited" }));

		const tabs = Object.fromEntries(store.getTabs().map((t) => [t.name, t.dirty]));
		expect(tabs["A edited"]).toBe(true);
		expect(tabs.B).toBe(false);
	});

	/** A compile locks the project, so a graph in a background tab is locked too. */
	it("locks every document at once", () => {
		store.setLocked(true);
		store.activate(A);
		store.edit((s) => ({ ...s, name: "nope" }));
		expect(store.getSnapshot().script?.name).toBe("A");

		store.activate(B);
		expect(store.getSnapshot().locked).toBe(true);
	});
});

describe("closing", () => {
	beforeEach(() => {
		store.open(A, graph("A"));
		store.open(B, graph("B"));
	});

	/**
	 * The tab to the right, falling back to the left. What every editor does,
	 * and what stops closing the last tab in a row leaving you somewhere
	 * unrelated.
	 */
	it("moves to the neighbour", () => {
		store.activate(A);
		store.closeDocument(A);
		expect(store.getSnapshot().script?.name).toBe("B");

		store.open("scripts/C.nodescript", graph("C"));
		store.activate(B);
		store.closeDocument(B);
		expect(store.getSnapshot().script?.name).toBe("C");
	});

	it("leaves the active document alone when a background tab closes", () => {
		store.activate(B);
		store.closeDocument(A);
		expect(store.getSnapshot().script?.name).toBe("B");
		expect(store.getTabs()).toHaveLength(1);
	});

	it("ends with nothing open, rather than something stale", () => {
		store.closeAll();
		expect(store.getTabs()).toEqual([]);
		expect(store.getSnapshot().script).toBeNull();
		expect(store.getSnapshot().path).toBeNull();
	});

	it("ignores a path it does not have", () => {
		store.closeDocument("scripts/never.nodescript");
		expect(store.getTabs()).toHaveLength(2);
	});
});

describe("renaming the file under a document", () => {
	/**
	 * The graph was not touched, so its history, selection and viewport are
	 * still about it. Closing and reopening would be simpler and would throw
	 * all three away for an operation that changed nothing.
	 */
	it("keeps the tab, its history and its viewport", () => {
		store.open(A, graph("A"));
		store.edit((s) => ({ ...s, name: "A edited" }));
		store.setView({ x: -100, y: -100, zoom: 1.5 });

		store.rename(A, B, { ...store.getSnapshot().script!, name: "B" });

		expect(store.getSnapshot().path).toBe(B);
		expect(store.isOpen(A)).toBe(false);
		expect(store.getTabs()).toHaveLength(1);
		expect(store.canUndo(), "history survived").toBe(true);
		expect(store.getView(), "and so did the viewport").toEqual({ x: -100, y: -100, zoom: 1.5 });
	});
});

/**
 * A function's graph is a tab of its own, and part of its file. The tab owns
 * where you are — selection, viewport — and the file owns what it says:
 * history, dirtiness, and the script itself.
 */
describe("function graphs", () => {
	function withFunction() {
		const b = new Builder("A");
		b.node("script.begin");
		b.node("function.entry", { id: "fn", config: { name: "hide", params: [], returns: [] } });
		return b.build();
	}

	beforeEach(() => {
		store.open(A, withFunction());
		store.openFunction(A, "fn");
	});

	it("opens beside its file, named for the function and the script", () => {
		const tabs = store.getTabs();
		expect(tabs.map((t) => t.key)).toEqual([A, `${A}#fn`]);
		expect(tabs[1]).toMatchObject({ name: "hide", scriptName: "A", graph: "fn", active: true });
		expect(store.getSnapshot().graph).toBe("fn");
	});

	it("goes next to its file's other tabs, not at the end", () => {
		store.open(B, graph("B"));
		store.activate(A);
		store.closeDocument(`${A}#fn`);
		store.openFunction(A, "fn");
		expect(store.getTabs().map((t) => t.key)).toEqual([A, `${A}#fn`, B]);
	});

	it("shares one history with its file", () => {
		store.edit((s) => ({ ...s, name: "edited in the function" }));
		store.activate(A);
		expect(store.getSnapshot().script?.name).toBe("edited in the function");
		store.undo();
		expect(store.getSnapshot().script?.name).toBe("A");
	});

	it("keeps its own selection and viewport", () => {
		store.select(["fn"]);
		store.setView({ x: -300, y: 0, zoom: 1 });
		store.activate(A);
		expect(store.getSnapshot().selection.size).toBe(0);
		expect(store.getView()).toEqual({ x: 80, y: 80, zoom: 1 });
		store.activate(`${A}#fn`);
		expect([...store.getSnapshot().selection]).toEqual(["fn"]);
	});

	/** Every way of making a node goes through `apply`, so this covers them all. */
	it("puts what is added in its tab into its graph", () => {
		store.edit((s) => ({ ...s, nodes: [...s.nodes, { id: "new", def: "debug.print", x: 0, y: 0 }] }));
		expect(store.getSnapshot().script?.nodes.find((n) => n.id === "new")?.graph).toBe("fn");
		store.activate(A);
		store.edit((s) => ({ ...s, nodes: [...s.nodes, { id: "outer", def: "debug.print", x: 0, y: 0 }] }));
		expect(store.getSnapshot().script?.nodes.find((n) => n.id === "outer")?.graph).toBeUndefined();
	});

	it("closes when its function is deleted, and leaves you in the file", () => {
		store.edit((s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== "fn") }));
		expect(store.getTabs().map((t) => t.key)).toEqual([A]);
		expect(store.getSnapshot()).toMatchObject({ path: A, graph: null });
	});

	it("comes back as the file's own tab when an undo takes its function away", () => {
		store.closeDocument(A);
		store.edit((s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== "fn") }));
		expect(store.getTabs().map((t) => t.key)).toEqual([A]);
	});

	it("keeps the file open while any of its tabs is", () => {
		store.closeDocument(A);
		expect(store.isOpen(A)).toBe(true);
		store.closeDocument(`${A}#fn`);
		expect(store.isOpen(A)).toBe(false);
	});

	it("follows its file when the file is renamed", () => {
		store.rename(A, B);
		expect(store.getTabs().map((t) => t.key)).toEqual([B, `${B}#fn`]);
		expect(store.getSnapshot()).toMatchObject({ path: B, graph: "fn" });
	});

	it("goes to the graph a node is in when something outside the canvas points at it", () => {
		store.activate(A);
		store.reveal("fn");
		expect(store.getSnapshot()).toMatchObject({ graph: "fn" });
		expect([...store.getSnapshot().selection]).toEqual(["fn"]);
		store.reveal("n1");
		expect(store.getSnapshot()).toMatchObject({ graph: null });
	});

	it("will not open a function the file does not have", () => {
		expect(store.openFunction(A, "missing")).toBe(false);
		expect(store.openFunction(B, "fn")).toBe(false);
	});
});

/**
 * `useSyncExternalStore` compares snapshots by identity and re-renders whenever
 * it gets a new object. Returning a fresh one from every read would re-render
 * the whole editor on any unrelated event — and in the worst case loop.
 */
describe("snapshot identity", () => {
	it("hands back the same object until something changes", () => {
		store.open(A, graph("A"));
		expect(store.getSnapshot()).toBe(store.getSnapshot());
		expect(store.getTabs()).toBe(store.getTabs());

		const before = store.getSnapshot();
		store.edit((s) => ({ ...s, name: "changed" }));
		expect(store.getSnapshot()).not.toBe(before);
	});

	it("does not churn the viewport for an unrelated edit", () => {
		store.open(A, graph("A"));
		const view = store.getView();
		store.select(["n1"]);
		expect(store.getView()).toBe(view);
	});
});
