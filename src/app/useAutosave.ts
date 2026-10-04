/**
 * Autosave, and keeping open graphs in step with their files on disk.
 *
 * The queue itself is made by the editor, because switching project has to
 * flush it before anything here exists; see `saveQueue.ts`. This puts every
 * dirty graph and node map on it, writes it when the page is hidden, and
 * answers the daemon's news that a graph's file changed underneath it.
 */

import type React from "react";
import { useCallback, useEffect, useRef } from "react";

import { serialiseScript } from "../core/compiler/index.js";
import type { NodeScript } from "../core/schema.js";
import { api, type MapOutcome, type ProjectInfo } from "./api.js";
import type { MapDocument } from "./centreDocument.js";
import type { SaveQueue } from "./saveQueue.js";
import { store } from "./store.js";
import type { Dialogs } from "./useDialogs.js";

export interface AutosaveContext {
	saves: SaveQueue;
	project: ProjectInfo | null;
	ask: Dialogs["ask"];
	notify: Dialogs["notify"];
	onWriteFailed: (error: Error) => void;
	runCompile: (path: string | undefined, write: boolean, force?: boolean) => Promise<void>;
	/** Whether the host compiles a graph when it sees it written: the daemon, in Dynamic mode. */
	hostCompilesOnSave: { readonly current: boolean };
	mapDoc: MapDocument | null;
	setMapDoc: React.Dispatch<React.SetStateAction<MapDocument | null>>;
	/** A map Dynamic mode compiled after saving it: what it said. */
	onMapCompiled?: (results: MapOutcome[]) => void;
}

export interface Autosave {
	/** Writes a graph now, and marks it saved if it has not changed since. */
	writeGraph: (path: string, script: NodeScript) => Promise<void>;
	/** Handles a file the daemon reports changed or removed. A ref, for an event listener set up once. */
	followDiskRef: { readonly current: (type: string, path: string) => Promise<void> };
}

export function useAutosave(context: AutosaveContext): Autosave {
	const {
		saves,
		project,
		ask,
		notify,
		onWriteFailed,
		runCompile,
		hostCompilesOnSave,
		mapDoc,
		setMapDoc,
		onMapCompiled,
	} = context;

	// Autosave. The graph on disk is the document; there is no separate "saved"
	// copy to diverge from, so an explicit save button would only be ceremony.
	//
	// Every dirty graph is queued, not only the one on screen: the queue holds
	// a write per file, so a tab switched away from or closed inside the pause
	// is still written.
	const compileAfterSave = useRef<(path: string) => void>(() => undefined);
	compileAfterSave.current = (path) => {
		// The daemon's watcher compiles the file it sees written; compiling it
		// here as well did every compile twice.
		if (project?.config.compileMode === "hot" && !hostCompilesOnSave.current)
			void runCompile(path, true);
	};
	// A node map in Dynamic mode writes its project file as it is saved, as a
	// graph writes its Luau. Folders are not moved or made here: a path half
	// typed would drag its folder through every partial name. That waits for
	// the map's own Compile, and until then a path not on disk keeps the last
	// project file, which the map's errors say.
	const compileMapAfterSave = useRef<(path: string) => void>(() => undefined);
	compileMapAfterSave.current = (path) => {
		if (project?.config.compileMode !== "hot") return;
		void api
			.compileMap({ path, write: true, sync: false })
			.then(({ results }) => onMapCompiled?.(results))
			.catch(() => undefined);
	};
	/** What this tab last wrote to each graph, to tell its own writes from somebody else's. */
	const lastWritten = useRef(new Map<string, string>());
	const writeGraph = useCallback(async (path: string, script: NodeScript) => {
		lastWritten.current.set(path, serialiseScript(script));
		await api.writeScript(path, script);
		store.markSaved(path, script);
		compileAfterSave.current(path);
	}, []);
	useEffect(() => {
		const queued = new Map<string, NodeScript>();
		return store.subscribe(() => {
			for (const { path, script } of store.unsaved()) {
				if (queued.get(path) === script) continue;
				queued.set(path, script);
				saves.put(path, () => writeGraph(path, script));
			}
		});
	}, [saves, writeGraph]);

	/**
	 * Leaving the page: write what is waiting, and say so if there is any.
	 *
	 * A hidden tab may be closed without another chance, so the queue is
	 * written as soon as the page is hidden. The browser's own "leave this
	 * page?" question is asked only while something has not been written yet.
	 */
	useEffect(() => {
		const hidden = () => {
			if (document.visibilityState === "hidden") saves.flushAll().catch(onWriteFailed);
		};
		const leaving = (event: BeforeUnloadEvent) => {
			if (!saves.busy()) return;
			saves.flushAll().catch(onWriteFailed);
			event.preventDefault();
		};
		document.addEventListener("visibilitychange", hidden);
		window.addEventListener("beforeunload", leaving);
		return () => {
			document.removeEventListener("visibilitychange", hidden);
			window.removeEventListener("beforeunload", leaving);
		};
	}, [saves, onWriteFailed]);

	/**
	 * An open graph's file changed or went on disk: a branch switch, a pull,
	 * another editor.
	 *
	 * Nothing used to listen, so the next autosave wrote the graph on screen
	 * over the one just checked out. Now a clean graph takes what the file
	 * says, one with edits of its own asks which to keep, and one whose file
	 * is gone is closed. This tab's own writes come back here too and are
	 * recognised by their content.
	 */
	const followDisk = useCallback(
		async (type: string, path: string) => {
			if (!path.endsWith(".nodescript") || !store.document(path)) return;
			const disk = await api.readScript(path).then(
				(reply) => reply.script,
				() => null,
			);
			const open = store.document(path);
			if (!open) return;

			if (disk === null) {
				if (type !== "removed") return;
				if (open.dirty) {
					notify(
						"A graph was deleted on disk",
						`${path} is gone. Your edits are still open, and saving them will bring the file back.`,
					);
					return;
				}
				saves.drop(path);
				store.closePath(path);
				return;
			}

			const text = serialiseScript(disk);
			if (text === lastWritten.current.get(path) || text === serialiseScript(open.script)) return;
			if (!open.dirty) {
				store.reload(path, disk);
				return;
			}

			saves.drop(path);
			const choice = await ask({
				kind: "choice",
				title: "This graph changed on disk",
				message: `${path} was changed outside this tab while you had edits that were not saved yet.`,
				choices: [
					{ value: "disk", label: "Use the file" },
					{ value: "mine", label: "Keep my edits", primary: true },
				],
			});
			const now = store.document(path);
			if (!now) return;
			if (choice === "disk") store.reload(path, disk);
			else saves.put(path, () => writeGraph(path, now.script));
		},
		[ask, notify, saves, writeGraph],
	);
	const followDiskRef = useRef(followDisk);
	followDiskRef.current = followDisk;

	/**
	 * Node maps autosave on the same terms graphs do, through the same queue.
	 *
	 * No cleanup on purpose: the write belongs to the file. Opening anything
	 * else sets the map to null, and that used to cancel the pending write.
	 */
	useEffect(() => {
		if (!mapDoc?.dirty) return;
		const { path, map } = mapDoc;
		saves.put(path, async () => {
			await api.writeMap(path, map);
			setMapDoc((d) => (d && d.path === path && d.map === map ? { ...d, dirty: false } : d));
			compileMapAfterSave.current(path);
		});
	}, [mapDoc, saves]);

	return { writeGraph, followDiskRef };
}
