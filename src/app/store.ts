/**
 * Editor state.
 *
 * A deliberately small store: the whole graph is replaced on every edit and
 * undo is a stack of snapshots. At the scale a single script reaches that is
 * both fast enough and impossible to get subtly wrong, which matters more here
 * than avoiding the copies.
 */

import { useSyncExternalStore } from "react";
import type { NodeScript } from "../core/schema.js";
import type { View } from "./geometry.js";

const HISTORY_LIMIT = 100;

export interface EditorState {
	/** Project-relative path of the open graph, or null when nothing is open. */
	path: string | null;
	script: NodeScript | null;
	/** Node and comment ids. They share a namespace because selection does. */
	selection: ReadonlySet<string>;
	view: View;
	dirty: boolean;
}

type Listener = () => void;

class Store {
	private state: EditorState = {
		path: null,
		script: null,
		selection: new Set(),
		view: { x: 80, y: 80, zoom: 1 },
		dirty: false,
	};

	private listeners = new Set<Listener>();
	private past: NodeScript[] = [];
	private future: NodeScript[] = [];
	/** Snapshot taken at the start of a multi-step interaction, e.g. a drag. */
	private pending: NodeScript | null = null;

	subscribe = (listener: Listener): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): EditorState => this.state;

	private set(patch: Partial<EditorState>): void {
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener();
	}

	// -- document ----------------------------------------------------------

	open(path: string, script: NodeScript): void {
		this.past = [];
		this.future = [];
		this.pending = null;
		this.set({ path, script, selection: new Set(), dirty: false });
	}

	close(): void {
		this.past = [];
		this.future = [];
		this.set({ path: null, script: null, selection: new Set(), dirty: false });
	}

	markSaved(): void {
		this.set({ dirty: false });
	}

	// -- editing -----------------------------------------------------------

	/**
	 * Starts a multi-step interaction. Everything applied until end() collapses
	 * into a single undo entry, so dragging ten nodes is one undo, not ten.
	 */
	begin(): void {
		if (this.pending || !this.state.script) return;
		this.pending = this.state.script;
	}

	end(): void {
		const before = this.pending;
		this.pending = null;
		if (!before || before === this.state.script) return;
		this.push(before);
	}

	/** Applies a change. Outside a transaction this is its own undo entry. */
	apply(fn: (script: NodeScript) => NodeScript): void {
		const script = this.state.script;
		if (!script) return;
		const next = fn(script);
		if (next === script) return;
		if (!this.pending) this.push(script);
		this.set({ script: next, dirty: true });
	}

	/** A single atomic edit: begin, apply, end. */
	edit(fn: (script: NodeScript) => NodeScript): void {
		this.apply(fn);
	}

	private push(snapshot: NodeScript): void {
		this.past.push(snapshot);
		if (this.past.length > HISTORY_LIMIT) this.past.shift();
		this.future = [];
	}

	undo(): void {
		const previous = this.past.pop();
		if (!previous || !this.state.script) return;
		this.future.push(this.state.script);
		this.set({ script: previous, dirty: true, selection: prune(this.state.selection, previous) });
	}

	redo(): void {
		const next = this.future.pop();
		if (!next || !this.state.script) return;
		this.past.push(this.state.script);
		this.set({ script: next, dirty: true, selection: prune(this.state.selection, next) });
	}

	canUndo(): boolean {
		return this.past.length > 0;
	}

	canRedo(): boolean {
		return this.future.length > 0;
	}

	// -- selection ---------------------------------------------------------

	select(ids: Iterable<string>, mode: "replace" | "add" | "toggle" = "replace"): void {
		const next = mode === "replace" ? new Set<string>() : new Set(this.state.selection);
		for (const id of ids) {
			if (mode === "toggle" && next.has(id)) next.delete(id);
			else next.add(id);
		}
		this.set({ selection: next });
	}

	clearSelection(): void {
		if (this.state.selection.size === 0) return;
		this.set({ selection: new Set() });
	}

	// -- view --------------------------------------------------------------

	setView(view: View): void {
		this.set({ view });
	}
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

export function newId(): string {
	return globalThis.crypto.randomUUID();
}
