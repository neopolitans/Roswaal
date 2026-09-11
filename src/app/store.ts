/**
 * Editor state: several documents, one of them active.
 *
 * A deliberately small store. The whole graph is replaced on every edit and
 * undo is a stack of snapshots — at the scale a single script reaches that is
 * both fast enough and impossible to get subtly wrong, which matters more here
 * than avoiding the copies.
 *
 * ## Why the old API still works untouched
 *
 * This held exactly one document until panelisation needed several, and around
 * ninety call sites across `src/app` reach for it — almost all as
 * `store.edit(...)`, `store.select(...)`, `useEditor()`. Every one of them means
 * *the document I am looking at*.
 *
 * So documents are added **underneath** the existing surface: the old methods
 * all act on the **active** document, and none of those call sites moved. Only
 * something that must address a *named* document — the tab strip, and
 * eventually a second canvas — needs the new API.
 *
 * The viewport works the same way. `getView()` and `setView()` still take no
 * path and still mean "the one on screen", which is why `Canvas.tsx` did not
 * change at all. When two graphs can be visible at once the canvas will take a
 * path and these will grow one; until then, adding it would be a parameter with
 * exactly one possible value.
 *
 * ## What is per document and what is not
 *
 * Undo, selection, dirtiness and the viewport are per document — all four were
 * already per document in meaning, and only accidentally global in storage.
 *
 * `locked` is not. A compile locks the *project*: a graph you are not looking
 * at is still being written to disk, and an edit to it would land in the file
 * or not depending on where the walk had got to.
 */

import { useSyncExternalStore } from "react";
import type { NodeScript } from "../core/schema.js";
import type { View } from "./geometry.js";

const HISTORY_LIMIT = 100;

/** Where a graph opens before anybody pans it. */
const HOME: View = { x: 80, y: 80, zoom: 1 };

export interface EditorState {
	/** Project-relative path of the open graph, or null when nothing is open. */
	path: string | null;
	script: NodeScript | null;
	/** Node and comment ids. They share a namespace because selection does. */
	selection: ReadonlySet<string>;
	dirty: boolean;
	/**
	 * The graph refuses edits, because it is being compiled.
	 *
	 * Enforced here rather than at each of the places you can edit from. The
	 * canvas has a cover over it, but the inspector and the variables panel have
	 * twelve more edit paths between them and neither is under that cover — and
	 * an edit from any of them lands in the written file or does not, depending
	 * on where the compiler had got to.
	 *
	 * Whoever sets it decides the policy: `App` locks only outside hot reload.
	 * This is the enforcement, and the disabled panels are the courtesy, so
	 * anything either of us forgets to disable still cannot get through.
	 */
	locked: boolean;
}

/** One open graph, and everything that belongs to it alone. */
interface Doc {
	path: string;
	script: NodeScript;
	selection: ReadonlySet<string>;
	dirty: boolean;
	past: NodeScript[];
	future: NodeScript[];
	/** Snapshot taken at the start of a multi-step interaction, e.g. a drag. */
	pending: NodeScript | null;
	/**
	 * Where this document's canvas is looking.
	 *
	 * Per document because it is part of *where you were* in that graph, and
	 * switching tabs to find the view scrolled to somebody else's corner is the
	 * kind of small wrongness that makes tabs feel unreliable.
	 */
	view: View;
}

/** What the tab strip needs, without handing it the undo stacks. */
export interface OpenDocument {
	path: string;
	name: string;
	dirty: boolean;
	active: boolean;
}

type Listener = () => void;

const NOTHING_OPEN: EditorState = {
	path: null,
	script: null,
	selection: new Set(),
	dirty: false,
	locked: false,
};

class Store {
	private docs = new Map<string, Doc>();
	/** Tab order. Separate from the map because insertion order is not order. */
	private order: string[] = [];
	private activePath: string | null = null;
	private locked = false;

	/**
	 * The derived view of the active document, cached.
	 *
	 * `useSyncExternalStore` compares snapshots by identity and will loop
	 * forever if handed a fresh object every time it asks. So this is rebuilt
	 * only when something actually changed.
	 */
	private snapshot: EditorState = NOTHING_OPEN;
	private tabs: OpenDocument[] = [];

	private listeners = new Set<Listener>();
	private viewListeners = new Set<Listener>();

	// -- subscription ------------------------------------------------------

	subscribe = (listener: Listener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): EditorState => this.snapshot;

	subscribeTabs = (listener: Listener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getTabs = (): OpenDocument[] => this.tabs;

	/** Rebuilds the derived state and tells everyone. */
	private changed(): void {
		const doc = this.active();
		this.snapshot = doc
			? {
					path: doc.path,
					script: doc.script,
					selection: doc.selection,
					dirty: doc.dirty,
					locked: this.locked,
				}
			: this.locked === NOTHING_OPEN.locked
				? NOTHING_OPEN
				: { ...NOTHING_OPEN, locked: this.locked };

		this.tabs = this.order.map((path) => {
			const open = this.docs.get(path)!;
			return {
				path,
				name: open.script.name,
				dirty: open.dirty,
				active: path === this.activePath,
			};
		});

		for (const listener of this.listeners) listener();
	}

	private active(): Doc | null {
		return this.activePath === null ? null : (this.docs.get(this.activePath) ?? null);
	}

	/** Replaces fields on the active document. No active document, no change. */
	private patch(fields: Partial<Doc>): void {
		const doc = this.active();
		if (!doc) return;
		this.docs.set(doc.path, { ...doc, ...fields });
		this.changed();
	}

	// -- documents ---------------------------------------------------------

	/**
	 * Opens a graph with the content given, and makes it active.
	 *
	 * Replaces whatever was there, history and all, **including for a path that
	 * is already open**. That is not an oversight: hot reload calls this when a
	 * file changed on disk, and quietly keeping the old content because the tab
	 * existed would leave the editor showing something the file no longer says.
	 * An undo stack built on a version that is gone is not worth keeping.
	 *
	 * "The tab is already open, just go to it" is a different question, and one
	 * only the caller can answer — see `isOpen` and `activate`. The project tree
	 * asks it; hot reload must not.
	 */
	open(path: string, script: NodeScript): void {
		const at = this.order.indexOf(path);
		if (at === -1) this.order.push(path);
		this.docs.set(path, {
			path,
			script,
			selection: new Set(),
			dirty: false,
			past: [],
			future: [],
			pending: null,
			view: { ...HOME },
		});
		this.activePath = path;
		this.changed();
	}

	/** Brings an already-open document to the front. */
	activate(path: string): void {
		if (!this.docs.has(path) || this.activePath === path) return;
		this.activePath = path;
		this.changed();
	}

	/** Closes the active document, if there is one. */
	close(): void {
		if (this.activePath !== null) this.closeDocument(this.activePath);
	}

	/**
	 * Closes one document by path.
	 *
	 * The next tab to the right becomes active, falling back to the left —
	 * which is what every editor does, and what stops closing the last tab in a
	 * row leaving you somewhere unrelated.
	 */
	closeDocument(path: string): void {
		const index = this.order.indexOf(path);
		if (index === -1) return;

		this.docs.delete(path);
		this.order.splice(index, 1);

		if (this.activePath === path) {
			this.activePath = this.order[index] ?? this.order[index - 1] ?? null;
		}
		this.changed();
	}

	/** Closes everything. For a project switching underneath the editor. */
	closeAll(): void {
		this.docs.clear();
		this.order = [];
		this.activePath = null;
		this.changed();
	}

	/** Is this graph open in a tab? */
	isOpen(path: string): boolean {
		return this.docs.has(path);
	}

	/** Every open graph's path, in tab order. */
	openPaths(): string[] {
		return [...this.order];
	}

	/**
	 * Every open graph with edits that have not reached disk.
	 *
	 * Autosave is debounced and runs against the document you are *looking at*,
	 * so switching tabs inside that window leaves the one you left dirty until
	 * you come back to it. Nothing noticed while the only way out of a project
	 * was to close the tab — but closing every document at once, which is what
	 * changing project does, would take those edits with it.
	 *
	 * Returned as paths and scripts rather than acted on here: the store does
	 * not know how to write a file, and giving it an opinion about that is how a
	 * state container turns into an application.
	 */
	unsaved(): { path: string; script: NodeScript }[] {
		const out: { path: string; script: NodeScript }[] = [];
		for (const [path, doc] of this.docs) {
			if (doc.dirty && doc.script) out.push({ path, script: doc.script });
		}
		return out;
	}

	/**
	 * A document whose file was renamed keeps its tab, its history and its view.
	 *
	 * Closing and reopening would be simpler and would throw all three away for
	 * an operation that changed nothing about the graph.
	 */
	rename(from: string, to: string, script?: NodeScript): void {
		const doc = this.docs.get(from);
		if (!doc) return;
		this.docs.delete(from);
		this.docs.set(to, { ...doc, path: to, script: script ?? doc.script });
		this.order = this.order.map((p) => (p === from ? to : p));
		if (this.activePath === from) this.activePath = to;
		this.changed();
	}

	markSaved(): void {
		this.patch({ dirty: false });
	}

	// -- editing -----------------------------------------------------------

	/**
	 * Starts a multi-step interaction. Everything applied until end() collapses
	 * into a single undo entry, so dragging ten nodes is one undo, not ten.
	 */
	begin(): void {
		const doc = this.active();
		if (!doc || doc.pending) return;
		this.patch({ pending: doc.script });
	}

	end(): void {
		const doc = this.active();
		if (!doc) return;
		const before = doc.pending;
		if (!before || before === doc.script) {
			if (before) this.patch({ pending: null });
			return;
		}
		this.docs.set(doc.path, {
			...doc,
			pending: null,
			past: trim([...doc.past, before]),
			future: [],
		});
		this.changed();
	}

	/** Refuses every edit until it is unset. See `EditorState.locked`. */
	setLocked(locked: boolean): void {
		if (this.locked === locked) return;
		this.locked = locked;
		this.changed();
	}

	/** Applies a change. Outside a transaction this is its own undo entry. */
	apply(fn: (script: NodeScript) => NodeScript): void {
		const doc = this.active();
		if (!doc || this.locked) return;
		const next = fn(doc.script);
		if (next === doc.script) return;

		this.docs.set(doc.path, {
			...doc,
			script: next,
			dirty: true,
			past: doc.pending ? doc.past : trim([...doc.past, doc.script]),
			future: doc.pending ? doc.future : [],
		});
		this.changed();
	}

	/** A single atomic edit: begin, apply, end. */
	edit(fn: (script: NodeScript) => NodeScript): void {
		this.apply(fn);
	}

	undo(): void {
		const doc = this.active();
		if (!doc || this.locked) return;
		const previous = doc.past[doc.past.length - 1];
		if (!previous) return;
		this.docs.set(doc.path, {
			...doc,
			past: doc.past.slice(0, -1),
			future: [...doc.future, doc.script],
			script: previous,
			dirty: true,
			selection: prune(doc.selection, previous),
		});
		this.changed();
	}

	redo(): void {
		const doc = this.active();
		if (!doc || this.locked) return;
		const next = doc.future[doc.future.length - 1];
		if (!next) return;
		this.docs.set(doc.path, {
			...doc,
			future: doc.future.slice(0, -1),
			past: [...doc.past, doc.script],
			script: next,
			dirty: true,
			selection: prune(doc.selection, next),
		});
		this.changed();
	}

	canUndo(): boolean {
		return (this.active()?.past.length ?? 0) > 0;
	}

	canRedo(): boolean {
		return (this.active()?.future.length ?? 0) > 0;
	}

	// -- selection ---------------------------------------------------------

	select(ids: Iterable<string>, mode: "replace" | "add" | "toggle" = "replace"): void {
		const doc = this.active();
		if (!doc) return;
		const next = mode === "replace" ? new Set<string>() : new Set(doc.selection);
		for (const id of ids) {
			if (mode === "toggle" && next.has(id)) next.delete(id);
			else next.add(id);
		}
		this.patch({ selection: next });
	}

	clearSelection(): void {
		const doc = this.active();
		if (!doc || doc.selection.size === 0) return;
		this.patch({ selection: new Set() });
	}

	// -- view --------------------------------------------------------------

	subscribeView = (listener: Listener): (() => void) => {
		this.viewListeners.add(listener);
		return () => this.viewListeners.delete(listener);
	};

	/**
	 * The active document's viewport.
	 *
	 * Returns the same object until it changes, so a canvas subscribed to it
	 * does not re-render because some other document panned.
	 */
	getView = (): View => this.active()?.view ?? HOME;

	setView(view: View): void {
		const doc = this.active();
		if (!doc) return;
		this.docs.set(doc.path, { ...doc, view });
		for (const listener of this.viewListeners) listener();
	}
}

/** Keeps an undo stack from growing without limit. */
function trim(stack: NodeScript[]): NodeScript[] {
	return stack.length > HISTORY_LIMIT ? stack.slice(stack.length - HISTORY_LIMIT) : stack;
}

/** Drops ids that no longer exist, so undo cannot leave a phantom selection. */
function prune(selection: ReadonlySet<string>, script: NodeScript): Set<string> {
	const live = new Set<string>([
		...script.nodes.map((n) => n.id),
		...script.comments.map((c) => c.id),
	]);
	return new Set([...selection].filter((id) => live.has(id)));
}

export const store = new Store();

export function useEditor(): EditorState {
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Every open graph, in tab order. */
export function useDocuments(): OpenDocument[] {
	return useSyncExternalStore(store.subscribeTabs, store.getTabs, store.getTabs);
}

/**
 * The viewport, subscribed to separately.
 *
 * Only the canvas should call this. Anything else that does is signing itself
 * up to re-render on every frame of a pan.
 */
export function useView(): View {
	return useSyncExternalStore(store.subscribeView, store.getView, store.getView);
}

export function newId(): string {
	return globalThis.crypto.randomUUID();
}
