/**
 * Editor state: several documents, open in tabs, one tab in front.
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
 * all act on the **active** tab's document, and none of those call sites moved.
 * Only something that must address a *named* tab — the tab strip, the tree —
 * needs the new API.
 *
 * ## Tabs and documents are not the same thing
 *
 * Since 0.33.0 a function opens in a graph of its own, in a tab of its own, and
 * that graph is part of its nodescript's file. So a **document** is a file —
 * its script, its undo history, whether it is dirty — and a **tab** is one graph
 * of it, with its own selection and viewport. A file with two function tabs open
 * has one history across all three: undo is about the file, and a delete in the
 * outer graph can take a function's whole graph with it.
 *
 * A file's main tab is keyed by its path, exactly as before, so `activate(path)`
 * still means what it did. A function's tab is `path#functionId`. A document is
 * kept while any of its tabs is open.
 *
 * ## What is per tab and what is not
 *
 * Selection and the viewport are per tab: both are *where you are* in a graph.
 * `locked` is per project. A compile locks the project: a graph you are not
 * looking at is still being written to disk, and an edit to it would land in the
 * file or not depending on where the walk had got to.
 */

import { useSyncExternalStore } from "react";
import {
	functionOutline, graphExists, graphOf, positionIn, type FunctionInfo, type GraphId,
} from "../core/functionGraph.js";
import type { NodeScript } from "../core/schema.js";
import type { View } from "./geometry.js";
import { retypeReroutes } from "../core/reroutes.js";
import type { Registry } from "../core/nodes/index.js";

const HISTORY_LIMIT = 100;

/** Where a graph opens before anybody pans it. */
const HOME: View = { x: 80, y: 80, zoom: 1 };

export interface EditorState {
	/** Project-relative path of the open graph, or null when nothing is open. */
	path: string | null;
	/** The whole script: every graph in the file. */
	script: NodeScript | null;
	/** Which graph of it the tab shows: a function's id, or null for the file's own. */
	graph: GraphId;
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
	 * Whoever sets it decides the policy: `App` locks only outside Dynamic.
	 * This is the enforcement, and the disabled panels are the courtesy, so
	 * anything either of us forgets to disable still cannot get through.
	 */
	locked: boolean;
}

/** One open file, and everything that belongs to the file rather than a tab. */
interface Doc {
	path: string;
	script: NodeScript;
	dirty: boolean;
	past: NodeScript[];
	future: NodeScript[];
	/** Snapshot taken at the start of a multi-step interaction, e.g. a drag. */
	pending: NodeScript | null;
}

/** One graph on screen. */
interface Tab {
	key: string;
	path: string;
	graph: GraphId;
	selection: ReadonlySet<string>;
	/**
	 * Where this tab's canvas is looking.
	 *
	 * Per tab because it is part of *where you were* in that graph, and
	 * switching tabs to find the view scrolled to somebody else's corner is the
	 * kind of small wrongness that makes tabs feel unreliable.
	 */
	view: View;
}

/** What the tab strip needs, without handing it the undo stacks. */
export interface OpenDocument {
	key: string;
	path: string;
	/** The function's name on a function tab; otherwise the script's. */
	name: string;
	scriptName: string;
	graph: GraphId;
	dirty: boolean;
	active: boolean;
}

type Listener = () => void;

const NOTHING_OPEN: EditorState = {
	path: null,
	script: null,
	graph: null,
	selection: new Set(),
	dirty: false,
	locked: false,
};

/** A tab's key: the path for a file's own graph, `path#id` for a function's. */
export function tabKey(path: string, graph: GraphId): string {
	return graph === null ? path : `${path}#${graph}`;
}

class Store {
	private docs = new Map<string, Doc>();
	private tabList: Tab[] = [];
	private activeKey: string | null = null;
	private locked = false;

	/**
	 * The derived view of the active tab, cached.
	 *
	 * `useSyncExternalStore` compares snapshots by identity and will loop
	 * forever if handed a fresh object every time it asks. So this is rebuilt
	 * only when something actually changed.
	 */
	/**
	 * The node definitions this page edits against, for the rules that need to
	 * resolve a node's pins -- see `apply`.
	 *
	 * One, not one per document, because the editor and Node Design are separate
	 * routes and never share a page: `/designer` renders `DesignerPage` and
	 * nothing else. Each sets its own on the way in.
	 */
	private registry: Registry | null = null;

	private snapshot: EditorState = NOTHING_OPEN;
	private tabs: OpenDocument[] = [];
	/** Each open file's functions, rebuilt only when a name or the set changes. */
	private outline = new Map<string, FunctionInfo[]>();
	private outlineKeys = new Map<string, string>();

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

	getOutline = (): ReadonlyMap<string, FunctionInfo[]> => this.outline;

	/** Rebuilds the derived state and tells everyone. */
	private changed(): void {
		const tab = this.activeTab();
		const doc = tab ? this.docs.get(tab.path) : undefined;
		this.snapshot = tab && doc
			? {
					path: doc.path,
					script: doc.script,
					graph: tab.graph,
					selection: tab.selection,
					dirty: doc.dirty,
					locked: this.locked,
				}
			: this.locked === NOTHING_OPEN.locked
				? NOTHING_OPEN
				: { ...NOTHING_OPEN, locked: this.locked };

		this.tabs = this.tabList.map((t) => {
			const open = this.docs.get(t.path)!;
			const fn = t.graph === null ? undefined : open.script.nodes.find((n) => n.id === t.graph);
			const fnName = (fn?.config as { name?: string } | undefined)?.name?.trim();
			return {
				key: t.key,
				path: t.path,
				name: t.graph === null ? open.script.name : fnName || "function",
				scriptName: open.script.name,
				graph: t.graph,
				dirty: open.dirty,
				active: t.key === this.activeKey,
			};
		});

		let outlineChanged = this.outline.size !== this.docs.size;
		const outline = new Map<string, FunctionInfo[]>();
		for (const [path, doc] of this.docs) {
			const list = functionOutline(doc.script);
			const key = list.map((f) => `${f.id}:${f.name}:${f.depth}`).join("|");
			if (this.outlineKeys.get(path) !== key) outlineChanged = true;
			this.outlineKeys.set(path, key);
			outline.set(path, list);
		}
		if (outlineChanged) {
			for (const path of [...this.outlineKeys.keys()]) if (!this.docs.has(path)) this.outlineKeys.delete(path);
			this.outline = outline;
		}

		for (const listener of this.listeners) listener();
	}

	private activeTab(): Tab | null {
		return this.activeKey === null ? null : (this.tabList.find((t) => t.key === this.activeKey) ?? null);
	}

	private active(): Doc | null {
		const tab = this.activeTab();
		return tab ? (this.docs.get(tab.path) ?? null) : null;
	}

	private setDoc(doc: Doc): void {
		this.docs.set(doc.path, doc);
	}

	private patchTab(fields: Partial<Tab>): void {
		const tab = this.activeTab();
		if (!tab) return;
		this.tabList = this.tabList.map((t) => (t === tab ? { ...t, ...fields } : t));
	}

	private newTab(path: string, graph: GraphId): Tab {
		return { key: tabKey(path, graph), path, graph, selection: new Set(), view: { ...HOME } };
	}

	/**
	 * Closes the tabs of functions that are gone, after an edit or an undo took
	 * one away. A tab in front moves to its file's own graph rather than to a
	 * neighbour: the file is what you were working in.
	 */
	private reconcile(path: string): void {
		const doc = this.docs.get(path);
		if (!doc) return;
		const dead = this.tabList.filter((t) => t.path === path && !graphExists(doc.script, t.graph));
		if (dead.length === 0) return;
		const activeDied = dead.some((t) => t.key === this.activeKey);
		const at = this.tabList.findIndex((t) => t === dead[0]);
		this.tabList = this.tabList.filter((t) => !dead.includes(t));
		if (activeDied) {
			if (!this.tabList.some((t) => t.key === path)) {
				this.tabList.splice(Math.min(at, this.tabList.length), 0, this.newTab(path, null));
			}
			this.activeKey = path;
		}
	}

	// -- documents ---------------------------------------------------------

	/**
	 * Opens a graph with the content given, and makes it active.
	 *
	 * Replaces whatever was there, history and all, **including for a path that
	 * is already open**. That is not an oversight: dynamic compiling calls this when a
	 * file changed on disk, and quietly keeping the old content because the tab
	 * existed would leave the editor showing something the file no longer says.
	 * An undo stack built on a version that is gone is not worth keeping.
	 *
	 * A function tab of the same file already in front stays in front.
	 *
	 * "The tab is already open, just go to it" is a different question, and one
	 * only the caller can answer — see `isOpen` and `activate`. The project tree
	 * asks it; a dynamic compile must not.
	 */
	open(path: string, script: NodeScript): void {
		this.setDoc({ path, script, dirty: false, past: [], future: [], pending: null });
		if (!this.tabList.some((t) => t.key === path)) this.tabList.push(this.newTab(path, null));
		if (this.activeTab()?.path !== path) this.activeKey = path;
		this.reconcile(path);
		this.changed();
	}

	/**
	 * Opens a function's graph in a tab of its own, beside the file's other tabs.
	 * The file has to be open already. False when it is not, or the function is
	 * not there.
	 */
	openFunction(path: string, functionId: string): boolean {
		const doc = this.docs.get(path);
		if (!doc || !graphExists(doc.script, functionId)) return false;
		const key = tabKey(path, functionId);
		if (!this.tabList.some((t) => t.key === key)) {
			let at = -1;
			this.tabList.forEach((t, i) => {
				if (t.path === path) at = i;
			});
			// Opens looking at the entry node, which in a graph split out of an
			// older file sits wherever the body always did.
			const tab = this.newTab(path, functionId);
			const entry = doc.script.nodes.find((n) => n.id === functionId)!;
			const at0 = positionIn(entry, functionId);
			tab.view = { x: HOME.x - at0.x + 40, y: HOME.y - at0.y + 120, zoom: 1 };
			this.tabList.splice(at + 1, 0, tab);
		}
		this.activeKey = key;
		this.changed();
		return true;
	}

	/**
	 * Moves a tab, by key, to sit before another one.
	 *
	 * `before` is a key rather than an index because the index the pointer is
	 * over is an index into the row *as drawn*, and the row is about to change
	 * underneath it — dragging a tab three places right and asking for "index 3"
	 * lands it at 2, because it left a hole behind. Naming the neighbour is
	 * unambiguous whichever direction the drag went. `null` means the end.
	 *
	 * Note what this does **not** do: it does not activate the tab it moved.
	 * Reordering a row is tidying, and tidying that also navigates is tidying
	 * you have to undo.
	 */
	reorder(key: string, before: string | null): void {
		const from = this.tabList.findIndex((t) => t.key === key);
		if (from === -1 || key === before) return;

		const [tab] = this.tabList.splice(from, 1);
		const at = before === null ? this.tabList.length : this.tabList.findIndex((t) => t.key === before);
		if (at === -1) this.tabList.push(tab);
		else this.tabList.splice(at, 0, tab);
		this.changed();
	}

	/** Brings an open tab to the front, by its key. */
	activate(key: string): void {
		if (!this.tabList.some((t) => t.key === key) || this.activeKey === key) return;
		this.activeKey = key;
		this.changed();
	}

	/** Closes the active tab, if there is one. */
	close(): void {
		if (this.activeKey !== null) this.closeDocument(this.activeKey);
	}

	/**
	 * Closes one tab by key.
	 *
	 * The next tab to the right becomes active, falling back to the left —
	 * which is what every editor does, and what stops closing the last tab in a
	 * row leaving you somewhere unrelated. The file closes with its last tab.
	 */
	closeDocument(key: string): void {
		const index = this.tabList.findIndex((t) => t.key === key);
		if (index === -1) return;
		const [tab] = this.tabList.splice(index, 1);

		if (!this.tabList.some((t) => t.path === tab.path)) this.docs.delete(tab.path);
		if (this.activeKey === key) {
			this.activeKey = (this.tabList[index] ?? this.tabList[index - 1])?.key ?? null;
		}
		this.changed();
	}

	/** Closes everything. For a project switching underneath the editor. */
	closeAll(): void {
		this.docs.clear();
		this.tabList = [];
		this.activeKey = null;
		this.changed();
	}

	/**
	 * Is this file's **document** loaded — in any tab, of any of its graphs?
	 *
	 * Not the same question as "is its own graph in a tab", and the difference
	 * is load-bearing: a file with only a function's tab open is loaded, holds
	 * undo history and may hold edits that have not reached disk, so reading it
	 * again would throw all of that away. Ask this before `open`; ask
	 * `showGraph` when what you want is the tab.
	 */
	isOpen(path: string): boolean {
		return this.docs.has(path);
	}

	/**
	 * Brings a file's own graph to the front, putting its tab back if it has
	 * been closed while a function's tab kept the file open.
	 *
	 * False means the document is not loaded and the caller should read it.
	 *
	 * ## Why this exists
	 *
	 * Opening a graph used to be `isOpen(path)` then `activate(path)`. Those are
	 * two different questions and the pair only worked while they happened to
	 * have the same answer. Close a nodescript's own tab but leave one of its
	 * function tabs open, and the file is still loaded — so `isOpen` says yes,
	 * `activate` finds no tab with that key and returns, and double-clicking the
	 * graph in the tree did nothing at all until the function tab was closed.
	 *
	 * Falling through to `open` instead would have been worse than the dead
	 * click: it re-reads the file and replaces the document the function tab is
	 * still editing, taking its undo history and any unsaved edits with it.
	 */
	showGraph(path: string): boolean {
		if (!this.docs.has(path)) return false;
		if (!this.tabList.some((t) => t.key === path)) {
			// In front of the file's function tabs, which is where a file's own
			// graph sits everywhere else it is drawn.
			const at = this.tabList.findIndex((t) => t.path === path);
			this.tabList.splice(at === -1 ? this.tabList.length : at, 0, this.newTab(path, null));
		}
		this.activeKey = path;
		this.changed();
		return true;
	}

	/** Every open file's path, in the order their first tabs appear. */
	openPaths(): string[] {
		return [...new Set(this.tabList.map((t) => t.path))];
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
	 * A document whose file was renamed keeps its tabs, its history and its views.
	 *
	 * Closing and reopening would be simpler and would throw all three away for
	 * an operation that changed nothing about the graph.
	 */
	rename(from: string, to: string, script?: NodeScript): void {
		const doc = this.docs.get(from);
		if (!doc) return;
		this.docs.delete(from);
		this.setDoc({ ...doc, path: to, script: script ?? doc.script });
		const activeGraph = this.activeTab()?.path === from ? this.activeTab()!.graph : undefined;
		this.tabList = this.tabList.map((t) =>
			t.path === from ? { ...t, path: to, key: tabKey(to, t.graph) } : t,
		);
		if (activeGraph !== undefined) this.activeKey = tabKey(to, activeGraph);
		this.reconcile(to);
		this.changed();
	}

	markSaved(): void {
		const doc = this.active();
		if (!doc) return;
		this.setDoc({ ...doc, dirty: false });
		this.changed();
	}

	// -- editing -----------------------------------------------------------

	/**
	 * Starts a multi-step interaction. Everything applied until end() collapses
	 * into a single undo entry, so dragging ten nodes is one undo, not ten.
	 */
	begin(): void {
		const doc = this.active();
		if (!doc || doc.pending) return;
		this.setDoc({ ...doc, pending: doc.script });
		this.changed();
	}

	end(): void {
		const doc = this.active();
		if (!doc) return;
		const before = doc.pending;
		if (!before || before === doc.script) {
			if (before) {
				this.setDoc({ ...doc, pending: null });
				this.changed();
			}
			return;
		}
		this.setDoc({ ...doc, pending: null, past: trim([...doc.past, before]), future: [] });
		this.changed();
	}

	/** The definitions to resolve pins against. Set once per page. */
	setRegistry(registry: Registry): void {
		this.registry = registry;
	}

	/**
	 * Those definitions, for a component that needs to read the graph rather
	 * than only draw what it is handed -- Get Member, which asks what type is
	 * wired into it and so has to resolve the pins of the node feeding it.
	 */
	getRegistry(): Registry | null {
		return this.registry;
	}

	/** Refuses every edit until it is unset. See `EditorState.locked`. */
	setLocked(locked: boolean): void {
		if (this.locked === locked) return;
		this.locked = locked;
		this.changed();
	}

	/**
	 * Applies a change. Outside a transaction this is its own undo entry.
	 *
	 * Anything the change **added** without saying which graph it is in goes in
	 * the graph on screen. That is the one rule every way of making a node needs
	 * — the menu, a paste, a dropped wire, a knot, a promoted pin — and having it
	 * here means none of them has to know graphs exist.
	 */
	apply(fn: (script: NodeScript) => NodeScript): void {
		const doc = this.active();
		if (!doc || this.locked) return;
		let next = fn(doc.script);
		if (next === doc.script) return;
		const graph = this.activeTab()!.graph;
		if (graph !== null) next = adopt(doc.script, next, graph);
		/**
		 * A knot has the type of what it is carrying, so it has to be asked again
		 * whenever anything could have changed the answer.
		 *
		 * Here rather than in the edits that change a type, and that is the point.
		 * `retypeReroutes` used to be called by the four edits that add or remove
		 * a **link**, on the theory that a knot's type only changes when its
		 * source changes. It also changes when the source stays put and says
		 * something different -- a local given a type, a loop value given one, a
		 * function's parameter retyped -- and none of the twenty-odd places that
		 * can do that called it. So a knot went on being the type it was when the
		 * wire was drawn, refusing connections the graph should accept.
		 *
		 * There is no list of type-changing edits to keep in step because this is
		 * not a list. Every edit arrives here.
		 *
		 * Free when there are no knots, which is the common case: `retypeReroutes`
		 * returns the script it was handed untouched. Undo and redo do not come
		 * through here, which is right -- they restore what was there rather than
		 * work it out again.
		 */
		if (this.registry) next = retypeReroutes(next, this.registry);

		this.setDoc({
			...doc,
			script: next,
			dirty: true,
			past: doc.pending ? doc.past : trim([...doc.past, doc.script]),
			future: doc.pending ? doc.future : [],
		});
		this.reconcile(doc.path);
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
		this.setDoc({
			...doc,
			past: doc.past.slice(0, -1),
			future: [...doc.future, doc.script],
			script: previous,
			dirty: true,
		});
		this.pruneSelections(doc.path, previous);
		this.reconcile(doc.path);
		this.changed();
	}

	redo(): void {
		const doc = this.active();
		if (!doc || this.locked) return;
		const next = doc.future[doc.future.length - 1];
		if (!next) return;
		this.setDoc({
			...doc,
			future: doc.future.slice(0, -1),
			past: [...doc.past, doc.script],
			script: next,
			dirty: true,
		});
		this.pruneSelections(doc.path, next);
		this.reconcile(doc.path);
		this.changed();
	}

	canUndo(): boolean {
		return (this.active()?.past.length ?? 0) > 0;
	}

	canRedo(): boolean {
		return (this.active()?.future.length ?? 0) > 0;
	}

	/** Undo cannot leave a phantom selection in any tab of the file. */
	private pruneSelections(path: string, script: NodeScript): void {
		this.tabList = this.tabList.map((t) =>
			t.path === path ? { ...t, selection: prune(t.selection, script) } : t,
		);
	}

	// -- selection ---------------------------------------------------------

	select(ids: Iterable<string>, mode: "replace" | "add" | "toggle" = "replace"): void {
		const tab = this.activeTab();
		if (!tab) return;
		const next = mode === "replace" ? new Set<string>() : new Set(tab.selection);
		for (const id of ids) {
			if (mode === "toggle" && next.has(id)) next.delete(id);
			else next.add(id);
		}
		this.patchTab({ selection: next });
		this.changed();
	}

	clearSelection(): void {
		const tab = this.activeTab();
		if (!tab || tab.selection.size === 0) return;
		this.patchTab({ selection: new Set() });
		this.changed();
	}

	/**
	 * Selects a node or comment in the graph it is drawn in, going to that
	 * graph's tab first. For anything that points at a node from outside the
	 * canvas: a diagnostic, a row in a list.
	 */
	reveal(id: string): void {
		const doc = this.active();
		if (!doc) return;
		const node = doc.script.nodes.find((n) => n.id === id);
		const comment = node ? undefined : doc.script.comments.find((c) => c.id === id);
		if (!node && !comment) return;
		let graph = node?.def === "function.entry" ? node.id : graphOf((node ?? comment)!);
		if (!graphExists(doc.script, graph)) graph = null;

		if (graph === null) {
			if (!this.tabList.some((t) => t.key === doc.path)) this.tabList.push(this.newTab(doc.path, null));
			this.activeKey = doc.path;
		} else {
			this.openFunction(doc.path, graph);
		}
		this.select([id]);
	}

	// -- view --------------------------------------------------------------

	subscribeView = (listener: Listener): (() => void) => {
		this.viewListeners.add(listener);
		return () => this.viewListeners.delete(listener);
	};

	/**
	 * The active tab's viewport.
	 *
	 * Returns the same object until it changes, so a canvas subscribed to it
	 * does not re-render because some other tab panned.
	 */
	getView = (): View => this.activeTab()?.view ?? HOME;

	setView(view: View): void {
		if (!this.activeTab()) return;
		this.patchTab({ view });
		for (const listener of this.viewListeners) listener();
	}
}

/** Puts what an edit added, with no graph of its own, into `graph`. */
function adopt(before: NodeScript, after: NodeScript, graph: string): NodeScript {
	const grew = after.nodes.length > before.nodes.length || after.comments.length > before.comments.length;
	if (!grew && after.nodes === before.nodes && after.comments === before.comments) return after;
	const had = new Set<string>([...before.nodes.map((n) => n.id), ...before.comments.map((c) => c.id)]);
	let changed = false;
	const nodes = after.nodes.map((n) => {
		// A hoisted function is in no flow, so it is in no graph but its own.
		if (had.has(n.id) || n.graph !== undefined || n.def === "function.entry") return n;
		changed = true;
		return { ...n, graph };
	});
	const comments = after.comments.map((c) => {
		if (had.has(c.id) || c.graph !== undefined) return c;
		changed = true;
		return { ...c, graph };
	});
	return changed ? { ...after, nodes, comments } : after;
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

/** Every open tab, in order. */
export function useDocuments(): OpenDocument[] {
	return useSyncExternalStore(store.subscribeTabs, store.getTabs, store.getTabs);
}

/** Each open file's functions, for the project tree. */
export function useOutline(): ReadonlyMap<string, FunctionInfo[]> {
	return useSyncExternalStore(store.subscribe, store.getOutline, store.getOutline);
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
