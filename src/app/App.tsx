/**
 * Application shell: project chrome around the canvas.
 *
 * Diagnostics are produced by running the compiler in the browser against the
 * in-memory graph, so they update as you wire rather than when you compile.
 * The daemon is asked only to put files on disk — same compiler, same result,
 * one source of truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compile, type Diagnostic } from "../core/compiler/index.js";
import { VERSION } from "../cli/version.js";
import { createRegistry } from "../core/nodes/index.js";
import type { NodeDef, RoswaalConfig, ScriptClass } from "../core/schema.js";
import {
	api, ProjectChangedError,
	type CompileOutcome, type CompileStep, type MapOutcome, type ProjectInfo, type TreeEntry,
} from "./api.js";
import type { InstanceLocation, NodeMap } from "../core/nodemap.js";
import { MapEditor } from "./MapEditor.jsx";
import { CodeEditor } from "./CodeEditor.jsx";
import { SourceView, type SourceDoc } from "./SourceView.jsx";
import { Dialog, type DialogRequest, type DialogResult, type PendingDialog } from "./Dialog.jsx";
import { Icon } from "./icons.jsx";
import { Logo } from "./logo.jsx";
import { LAYER } from "./layers.js";
import type { PinDef } from "../core/schema.js";
import { Canvas } from "./Canvas.jsx";
import { buildPresets, NodeMenu, type MenuAnchor } from "./NodeMenu.jsx";
import { PinMenu, type PinMenuTarget } from "./PinMenu.jsx";
import { autoLayout } from "./layout.js";
import { Inspector } from "./Inspector.jsx";
import { ProjectTree } from "./ProjectTree.jsx";
import { VariablesPanel } from "./VariablesPanel.jsx";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { readPreferences, writePreferences, type Preferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import {
	addComment, addNode, copySelection, deleteSelection, disconnectPin, pasteClipping,
	promoteToVariable, recombinePin, setConfig as setNodeConfig, setLiteral, splitCost,
	splitPin, splitValueWarning, type Clipping,
} from "./edits.js";
import { store, useEditor } from "./store.js";

const LAST_PROJECT_KEY = "roswaal.lastProject";
/**
 * Projects opened before, most recent first.
 *
 * Typing an absolute path into a text field is fine once and tiresome the
 * fourth time, and a repository you work in is a repository you come back to.
 * Per-browser rather than in the config: which projects *you* have open is not
 * something to commit.
 */
const RECENT_KEY = "roswaal.recentProjects";
const RECENT_LIMIT = 6;

function recentProjects(): string[] {
	try {
		const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
		return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === "string") : [];
	} catch {
		return [];
	}
}

/** Moves a root to the front of the list, keeping it short and unique. */
function remember(root: string): void {
	localStorage.setItem(LAST_PROJECT_KEY, root);
	const next = [root, ...recentProjects().filter((r) => r !== root)].slice(0, RECENT_LIMIT);
	localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

/** Drops one from the list, for a path that is no longer there. */
function forget(root: string): void {
	localStorage.setItem(RECENT_KEY, JSON.stringify(recentProjects().filter((r) => r !== root)));
	if (localStorage.getItem(LAST_PROJECT_KEY) === root) localStorage.removeItem(LAST_PROJECT_KEY);
}
/** Written as a code unit so the escape survives the JSX attribute. */
const SEP = String.fromCharCode(92);

export function App() {
	const editor = useEditor();
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [customNodes, setCustomNodes] = useState<NodeDef[]>([]);
	const [menu, setMenu] = useState<MenuAnchor | null>(null);
	const [pinMenu, setPinMenu] = useState<PinMenuTarget | null>(null);
	const [outcomes, setOutcomes] = useState<CompileOutcome[]>([]);
	// The walk of the current project compile, one entry per file. Empty
	// between compiles, and it holds the last walk until the next one starts.
	const [progress, setProgress] = useState<CompileStep[]>([]);
	// A compile this tab asked for is in flight. Narrower than `busy`, which is
	// also set for opening a project and writing a node map — neither of which
	// is a reason to stop editing the graph.
	const [compiling, setCompiling] = useState(false);
	const [statusOpen, setStatusOpen] = useState(true);
	/**
	 * This browser's preferences, read once and written back on every change.
	 *
	 * State rather than a read at each use, so a change made in the settings
	 * panel reaches the toolbar toggle and the autosave timer in the same
	 * render. `main.tsx` has already applied the theme by the time this runs —
	 * this is the copy that keeps it applied as it changes.
	 */
	const [prefs, setPrefs] = useState<Preferences>(readPreferences);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const alignExec = prefs.alignExec;

	const updatePrefs = useCallback((patch: Partial<Preferences>) => {
		setPrefs((current) => {
			const next = { ...current, ...patch };
			writePreferences(next);
			if ("theme" in patch) applyTheme(findTheme(next.theme));
			if ("roundedNodes" in patch) applyChrome(next);
			return next;
		});
	}, []);
	const [source, setSource] = useState<SourceDoc | null>(null);
	// A node map is a tree, not a graph, so it lives beside the graph store
	// rather than inside it. Nothing about undo or selection carries over.
	const [mapDoc, setMapDoc] = useState<{ path: string; map: NodeMap; dirty: boolean } | null>(null);
	const [mapOutcomes, setMapOutcomes] = useState<MapOutcome[]>([]);
	// Generated files whose graph has moved or gone. Rojo cannot tell they are
	// stale, so it syncs them, and the same module turns up twice.
	const [orphans, setOrphans] = useState<string[]>([]);
	const [codeEdit, setCodeEdit] = useState<
		{ nodeId: string; pin: PinDef; value: string } | null
	>(null);
	const [dialog, setDialog] = useState<PendingDialog | null>(null);
	// A file dropped on the canvas, once we know where it lives in the DataModel
	// and therefore what can usefully be made from it.
	const [dropMenu, setDropMenu] = useState<
		{ screen: { x: number; y: number }; world: { x: number; y: number };
		  name: string; location: InstanceLocation } | null
	>(null);

	/** Opens a modal and resolves with what the developer chose. */
	const ask = useCallback((request: DialogRequest): Promise<DialogResult> => {
		return new Promise((resolve) => {
			setDialog({
				request,
				resolve: (result) => {
					setDialog(null);
					resolve(result);
				},
			});
		});
	}, []);

	const notify = useCallback(
		(title: string, message: string) => void ask({ kind: "notice", title, message }),
		[ask],
	);
	const [busy, setBusy] = useState<string | null>(null);
	// Deliberately in-memory rather than the system clipboard: a graph fragment
	// is not text, and round-tripping it through one would lose pin identity.
	const clipboard = useRef<Clipping | null>(null);

	const registry = useMemo(() => createRegistry(customNodes), [customNodes]);

	const diagnostics: Diagnostic[] = useMemo(() => {
		if (!editor.script) return [];
		return compile(editor.script, registry).diagnostics;
	}, [editor.script, registry]);

	// -- project -----------------------------------------------------------

	const loadProject = useCallback(async (root: string, init = false) => {
		setBusy("Opening project…");
		try {
			const info = init ? await api.initProject(root) : await api.openProject(root);
			api.setProjectRoot(info.root);
			setProject(info);
			remember(info.root);
			setCustomNodes((await api.customNodes()).custom);
		} catch (err) {
			notify("Something went wrong", (err as Error).message);
		} finally {
			setBusy(null);
		}
	}, []);

	useEffect(() => {
		// The daemon wins over the remembered path: if it was started with
		// `roswaal serve` in a directory, that is the project the developer meant.
		void (async () => {
			try {
				const existing = await api.currentProject();
				if (existing.open) {
					api.setProjectRoot(existing.root);
					setProject(existing);
					remember(existing.root);
					setCustomNodes((await api.customNodes()).custom);
					return;
				}
			} catch {
				// No daemon yet, or an older one. Fall through to the last project.
			}
			// Only this branch is a preference. A project the daemon already has
			// open is the one `roswaal serve` was pointed at, and starting at the
			// picker instead would be ignoring an instruction rather than
			// honouring a setting.
			if (!readPreferences().reopenLastProject) return;
			const last = localStorage.getItem(LAST_PROJECT_KEY);
			if (last) void loadProject(last);
		})();
	}, [loadProject]);

	/**
	 * The daemon's event stream.
	 *
	 * Open whenever a project is, rather than only in hot mode, because it now
	 * carries three kinds of news. Hot-reload events say a compile happened that
	 * this tab did not ask for — a branch switch, a pull, another editor — and
	 * only ever arrive when the watcher is running. The `project` event says the
	 * daemon has been pointed somewhere else, and a tab that does not hear that
	 * goes on editing a document belonging to a project it is no longer serving.
	 * And `compile` events narrate a project compile while it runs, because the
	 * POST that asked for it does not answer until the whole walk is done.
	 */
	useEffect(() => {
		if (!project) return;
		const open = project.root;
		const stream = new EventSource("/api/events");

		stream.addEventListener("hot", (event) => {
			const detail = JSON.parse((event as MessageEvent).data) as {
				type: string; path: string; outcome?: CompileOutcome; message?: string;
			};
			if (detail.outcome) setOutcomes([detail.outcome]);
			void api.tree().then(({ tree }) => setProject((p) => (p ? { ...p, tree } : p)));
		});

		/**
		 * The walk of a project compile, file by file, while it is running.
		 *
		 * A fresh walk announces itself by starting at 1, which is what resets
		 * the list — rather than the compile button clearing it, because the
		 * compile may have been started in another tab or by the watcher, and
		 * this tab wants to show that one too.
		 */
		stream.addEventListener("compile", (event) => {
			const step = JSON.parse((event as MessageEvent).data) as CompileStep;
			setProgress((steps) => {
				if (step.index === 1 && step.state === "working") return [step];
				const next = steps.slice();
				const at = next.findIndex((s) => s.index === step.index);
				if (at === -1) next.push(step);
				else next[at] = step;
				return next;
			});
		});

		stream.addEventListener("project", (event) => {
			const { root } = JSON.parse((event as MessageEvent).data) as { root: string | null };
			// The tab that asked for the switch has already followed it.
			if (!root || root === open) return;
			store.close();
			setSource(null);
			setMapDoc(null);
			notify(
				"Following the daemon to another project",
				`The daemon is now serving ${root}. Anything open here belonged to ${open}, ` +
					"so it has been closed rather than saved into the new one.",
			);
			void loadProject(root);
		});

		return () => stream.close();
	}, [project?.root, notify, loadProject]);

	const refreshTree = useCallback(async () => {
		const { tree } = await api.tree();
		setProject((p) => (p ? { ...p, tree } : p));
	}, []);

	// -- documents ---------------------------------------------------------

	const openEntry = useCallback(async (entry: TreeEntry) => {
		if (entry.kind === "luau") {
			setMapDoc(null);
			setSource({
				path: entry.path,
				text: (await api.readSource(entry.path)).text,
				generatedFrom: entry.generatedFrom,
			});
			return;
		}
		setSource(null);
		if (entry.kind === "nodemap") {
			store.close();
			const { map } = await api.readMap(entry.path);
			setMapDoc({ path: entry.path, map, dirty: false });
			return;
		}
		setMapDoc(null);
		const { script } = await api.readScript(entry.path);
		store.open(entry.path, script);
	}, []);

	/**
	 * Opens a graph by path rather than by tree entry.
	 *
	 * A generated file knows the graph it came from as a path and nothing more,
	 * and hunting for that entry in the tree to open it the long way round would
	 * be work for its own sake.
	 */
	const openGraphPath = useCallback(async (path: string) => {
		try {
			const { script } = await api.readScript(path);
			setSource(null);
			setMapDoc(null);
			store.open(path, script);
		} catch (err) {
			notify("Could not open that graph", (err as Error).message);
		}
	}, [notify]);

	// Node maps autosave on the same terms graphs do.
	const mapSaveTimer = useRef<number | null>(null);
	useEffect(() => {
		if (!mapDoc?.dirty) return;
		if (mapSaveTimer.current) window.clearTimeout(mapSaveTimer.current);
		const { path, map } = mapDoc;
		mapSaveTimer.current = window.setTimeout(() => {
			void api.writeMap(path, map).then(
				() => setMapDoc((d) => (d && d.path === path ? { ...d, dirty: false } : d)),
				onWriteFailed,
			);
		}, prefs.autosaveMs);
		return () => {
			if (mapSaveTimer.current) window.clearTimeout(mapSaveTimer.current);
		};
	}, [mapDoc, prefs.autosaveMs]);

	/**
	 * A write the daemon refused because it is now serving a different project.
	 *
	 * Nothing was written, which is the point — before the guard existed this
	 * was a silent success into the wrong repository. The document is closed
	 * rather than kept open over a project it no longer belongs to, because the
	 * next keystroke would try to save it again.
	 */
	const onProjectChanged = useCallback(
		async (err: ProjectChangedError) => {
			store.close();
			setSource(null);
			setMapDoc(null);
			notify(
				"The daemon moved to another project",
				`${err.message} Nothing was written to either project.`,
			);
			if (err.root) await loadProject(err.root);
		},
		[notify, loadProject],
	);

	/** Reports a failed write, telling a moved project apart from a real error. */
	const onWriteFailed = useCallback(
		(err: Error) => {
			if (err instanceof ProjectChangedError) void onProjectChanged(err);
			else notify("Could not save", err.message);
		},
		[notify, onProjectChanged],
	);

	// Autosave. The graph on disk is the document; there is no separate "saved"
	// copy to diverge from, so an explicit save button would only be ceremony.
	const saveTimer = useRef<number | null>(null);
	useEffect(() => {
		if (!editor.dirty || !editor.path || !editor.script) return;
		if (saveTimer.current) window.clearTimeout(saveTimer.current);
		const path = editor.path;
		const script = editor.script;
		saveTimer.current = window.setTimeout(() => {
			void api.writeScript(path, script).then(
				() => {
					store.markSaved();
					if (project?.config.compileMode === "hot") void runCompile(path, true);
				},
				onWriteFailed,
			);
		}, prefs.autosaveMs);
		return () => {
			if (saveTimer.current) window.clearTimeout(saveTimer.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor.dirty, editor.path, editor.script, project?.config.compileMode, prefs.autosaveMs]);

	// -- compiling ---------------------------------------------------------

	const runCompileMap = useCallback(
		async (path: string | undefined, force = false) => {
			setBusy("Writing project file…");
			try {
				const { results } = await api.compileMap({ path, write: true, force });
				setMapOutcomes(results);
				setStatusOpen(true);
				await refreshTree();
			} catch (err) {
				notify("Something went wrong", (err as Error).message);
			} finally {
				setBusy(null);
			}
		},
		[refreshTree],
	);

	const runCompile = useCallback(
		async (path: string | undefined, write: boolean, force = false) => {
			setBusy(write ? "Compiling…" : "Checking…");
			setCompiling(true);
			try {
				const { results } = await api.compile({ path, write, force });
				setOutcomes(results);
				setStatusOpen(true);
				if (write) {
					await refreshTree();
					setOrphans((await api.orphans().catch(() => ({ orphans: [] }))).orphans);
				}
			} catch (err) {
				notify("Something went wrong", (err as Error).message);
			} finally {
				setBusy(null);
				setCompiling(false);
			}
		},
		[refreshTree],
	);

	/**
	 * Writes `roswaal.json` and takes the daemon's answer as the truth.
	 *
	 * A rejection used to be an unhandled promise, which was survivable while
	 * the only caller was a two-position toggle that could not really fail. The
	 * settings panel writes paths, and a path the daemon refuses has to say so —
	 * otherwise the field goes on showing the value that was not saved.
	 */
	const setConfig = useCallback(async (patch: Partial<RoswaalConfig>) => {
		if (!project) return;
		const config = { ...project.config, ...patch };
		try {
			const saved = await api.saveConfig(config);
			setProject({ ...project, config: saved.config });
			// Only the settings that decide what is on disk, and where. A
			// compile-mode toggle changes nothing the tree shows, and it is the
			// one of these that gets pressed repeatedly.
			const rereads = ["sourceDir", "outDir", "nodePaths", "rojoProject"];
			if (rereads.some((key) => key in patch)) await refreshTree();
		} catch (err) {
			if (err instanceof ProjectChangedError) void onProjectChanged(err);
			else notify("That setting was not saved", (err as Error).message);
		}
	}, [project, refreshTree, notify, onProjectChanged]);

	// -- canvas actions ----------------------------------------------------

	// One palette entry per variable and per function in the open graph, so
	// "Get health" is searchable by name rather than by node type.
	const presets = useMemo(
		() => (editor.script ? buildPresets(editor.script) : []),
		[editor.script],
	);

	const spawn = useCallback(
		(def: NodeDef, world: { x: number; y: number }, config?: Record<string, unknown>) => {
			store.edit((s) => {
				const added = addNode(s, def, world.x, world.y);
				queueMicrotask(() => store.select([added.id]));
				return config ? setNodeConfig(added.script, added.id, config) : added.script;
			});
			setMenu(null);
		},
		[],
	);

	const spawnComment = useCallback((world: { x: number; y: number }) => {
		const selected = store.getSnapshot().selection;
		store.edit((s) => {
			// Wrapping a selection is the common case, so a comment created with
			// nodes selected sizes itself to enclose them.
			const box = boundsOf(s, selected, registry);
			const rect = box
				? { x: box.x - 24, y: box.y - 52, w: box.w + 48, h: box.h + 76 }
				: { x: world.x, y: world.y, w: 320, h: 200 };
			const { script, id } = addComment(s, rect);
			queueMicrotask(() => store.select([id]));
			return script;
		});
		setMenu(null);
	}, [registry]);

	/**
	 * Tidies the graph into ranked columns. Acts on the selection when there is
	 * more than one node in it, so a corner can be straightened without moving
	 * everything else.
	 */
	const realign = useCallback(() => {
		const state = store.getSnapshot();
		if (!state.script) return;
		const selected = new Set(
			[...state.selection].filter((id) => state.script!.nodes.some((n) => n.id === id)),
		);
		const only = selected.size > 1 ? selected : undefined;
		store.edit((s) => autoLayout(s, registry, { only, alignExec }));
	}, [registry, alignExec]);

	/**
	 * Turns a pin's typed-in value into a script variable, then selects the
	 * getter it made — the next thing you do is almost always to that getter,
	 * and leaving the selection on the node behind it means going to find it.
	 */
	const promotePin = useCallback(
		(pin: PinMenuTarget) => {
			const state = store.getSnapshot();
			if (!state.script) return;
			const result = promoteToVariable(state.script, registry, pin.nodeId, pin.pin);
			if (!result) return;
			store.edit(() => result.script);
			store.select([result.node]);
		},
		[registry],
	);

	/**
	 * Breaks a struct pin into components, or puts one back.
	 *
	 * Either direction can strand wires — there is nowhere for them to land on
	 * the other side of the change. Unreal drops them without asking; here more
	 * than one gets a confirmation, because a graph you cannot see all at once
	 * should not lose wiring silently.
	 */
	const splitOrRecombine = useCallback(
		async (target: PinMenuTarget, parent: string | undefined, mode: string | undefined) => {
			const state = store.getSnapshot();
			if (!state.script) return;

			const pinId = parent ?? target.pin.id;
			const stranded = splitCost(state.script, registry, target.nodeId, target.side, pinId);
			if (stranded > 1) {
				const ok = await ask({
					kind: "confirm",
					title: mode ? "Split this pin?" : "Recombine this pin?",
					message:
						`${stranded} wires are attached and cannot follow the change. ` +
						"They will be disconnected; the values typed into the pins are kept.",
					confirmLabel: mode ? "Split" : "Recombine",
				});
				if (ok !== true) return;
			}

			// Splitting is meant to change how a value is shown, never what it
			// is. When the value cannot be taken apart, that promise breaks —
			// so say so first rather than letting the graph quietly compile to
			// something else.
			const lost =
				mode !== undefined
					? splitValueWarning(state.script, registry, target.nodeId, target.side, pinId, mode)
					: null;
			if (lost !== null) {
				const ok = await ask({
					kind: "confirm",
					title: "This value cannot be split",
					message:
						`"${target.pin.name || pinId}" holds ${lost}, which Roswaal cannot take apart. ` +
						"The components would start at their defaults, so the script would compile " +
						"differently. Wire a node in instead, or split anyway and set the components " +
						"by hand.",
					confirmLabel: "Split anyway",
					danger: true,
				});
				if (ok !== true) return;
			}

			store.edit((s) =>
				mode !== undefined
					? splitPin(s, registry, target.nodeId, target.side, pinId, mode)
					: recombinePin(s, registry, target.nodeId, target.side, pinId),
			);
		},
		[registry, ask],
	);

	const toggleAlignExec = useCallback(() => {
		updatePrefs({ alignExec: !alignExec });
	}, [alignExec, updatePrefs]);

	/**
	 * The graph is read-only because it is being compiled.
	 *
	 * Only outside hot reload. In hot mode a compile follows every autosave, so
	 * locking on one would lock the canvas roughly whenever you stopped typing —
	 * the mode exists precisely so that compiling is not a thing you think about.
	 * Outside it a compile is something you asked for and then wait for, and an
	 * edit made during the walk lands in the written file or does not, depending
	 * on where the walk had got to. That file then disagrees with the graph and
	 * nothing says so.
	 */
	const locked = compiling && project?.config.compileMode !== "hot";

	// The policy is decided here, because the compile mode is; the refusal
	// happens in the store, because that is the one place every edit goes
	// through. Disabling the controls below is the courtesy on top of it.
	useEffect(() => {
		store.setLocked(locked);
	}, [locked]);

	// -- keyboard ----------------------------------------------------------

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
				return;
			}
			const mod = e.ctrlKey || e.metaKey;

			// Selecting and copying are reading. Everything else below changes
			// the graph, and while it is locked none of it may.
			if (locked && !(mod && (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "c"))) {
				return;
			}

			if (mod && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) store.redo();
				else store.undo();
				return;
			}
			if (mod && e.key.toLowerCase() === "y") {
				e.preventDefault();
				store.redo();
				return;
			}
			if (mod && e.key.toLowerCase() === "s") {
				e.preventDefault();
				if (editor.path) void runCompile(editor.path, true);
				return;
			}
			if (mod && e.shiftKey && e.key.toLowerCase() === "l") {
				e.preventDefault();
				realign();
				return;
			}
			if (mod && e.key.toLowerCase() === "a") {
				e.preventDefault();
				const s = store.getSnapshot().script;
				if (s) store.select([...s.nodes.map((n) => n.id), ...s.comments.map((c) => c.id)]);
				return;
			}
			if (mod && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x")) {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				clipboard.current = copySelection(state.script, state.selection);
				if (e.key.toLowerCase() === "x") {
					const ids = state.selection;
					store.edit((s) => deleteSelection(s, ids));
				}
				return;
			}
			if (mod && e.key.toLowerCase() === "v") {
				const clip = clipboard.current;
				if (!clip) return;
				e.preventDefault();
				store.edit((s) => {
					const { script, ids } = pasteClipping(s, clip);
					queueMicrotask(() => store.select(ids));
					return script;
				});
				return;
			}
			if (mod && e.key.toLowerCase() === "d") {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				const clip = copySelection(state.script, state.selection);
				store.edit((s) => {
					const { script, ids } = pasteClipping(s, clip);
					queueMicrotask(() => store.select(ids));
					return script;
				});
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				const ids = store.getSnapshot().selection;
				if (ids.size) store.edit((s) => deleteSelection(s, ids));
				return;
			}
			if (e.key.toLowerCase() === "c" && !mod && store.getSnapshot().selection.size > 0) {
				e.preventDefault();
				spawnComment({ x: 0, y: 0 });
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [editor.path, runCompile, spawnComment, realign, locked]);

	// -- project tree ------------------------------------------------------

	/**
	 * The tree's handlers are hoisted out of the render, and `ProjectTree` is
	 * memoised, because otherwise **the tree re-renders on every frame of a
	 * drag**. This component subscribes to the document store, so moving a node
	 * re-renders it sixty times a second, and it renders the tree — which with
	 * a folder of 1200 graphs open cost 16ms a frame on its own: 4.2ms became
	 * 20.7ms, and dragging visibly stuttered.
	 *
	 * Memoising only works if every prop is stable, which is what these are
	 * for. They depend on `editor.path` and `mapDoc`, which change when you open
	 * a document and not while you are dragging in one.
	 */
	const onTreeOpen = useCallback((entry: TreeEntry) => void openEntry(entry), [openEntry]);

	const onTreeMove = useCallback(async (from: string[], toDir: string) => {
		for (const path of from) await api.moveScript(path, toDir);
		await refreshTree();
	}, [refreshTree]);

	const onTreeReveal = useCallback(async (target: string) => {
		try {
			await api.reveal(target);
		} catch (err) {
			notify("Could not show that file", (err as Error).message);
		}
	}, [notify]);

	const onTreeNewFolder = useCallback(async (parentDir: string) => {
		const name = await ask({
			kind: "prompt",
			title: "New folder",
			label: "Name",
			value: "NewFolder",
		});
		if (typeof name !== "string") return;
		try {
			await api.createFolder(`${parentDir}/${name}`.replace(/^\//, ""));
			await refreshTree();
		} catch (err) {
			notify("Something went wrong", (err as Error).message);
		}
	}, [ask, notify, refreshTree]);

	const onTreeRename = useCallback(async (target: string) => {
		const currentName = target.split("/").pop() ?? "";
		const name = await ask({
			kind: "prompt",
			title: "Rename",
			label: "New name",
			value: currentName,
			confirmLabel: "Rename",
		});
		if (typeof name !== "string" || name === currentName) return;
		try {
			const { path: renamed } = await api.renameEntry(target, name);
			await refreshTree();
			// Keep the document open if it was the thing renamed.
			if (editor.path === target) {
				const { script } = await api.readScript(renamed);
				store.open(renamed, script);
			}
		} catch (err) {
			notify("Something went wrong", (err as Error).message);
		}
	}, [ask, notify, refreshTree, editor.path]);

	const onTreeDelete = useCallback(async (paths: string[]) => {
		const label = paths.length === 1 ? paths[0] : `${paths.length} items`;
		const ok = await ask({
			kind: "confirm",
			title: "Delete",
			message: `Delete ${label}? This cannot be undone from Roswaal.`,
			confirmLabel: "Delete",
			danger: true,
		});
		if (ok !== true) return;
		try {
			for (const target of paths) await api.deleteScript(target);
			if (editor.path && paths.includes(editor.path)) store.close();
			if (mapDoc && paths.includes(mapDoc.path)) setMapDoc(null);
			await refreshTree();
		} catch (err) {
			notify("Something went wrong", (err as Error).message);
		}
	}, [ask, notify, refreshTree, editor.path, mapDoc]);

	// -- render ------------------------------------------------------------

	if (!project) return <ProjectPicker onOpen={loadProject} busy={busy} />;

	const showInspector = !source && !mapDoc && editor.script !== null && editor.selection.size === 1;
	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const warningCount = diagnostics.length - errorCount;

	return (
		<div className="app">
			{/* The application: what Roswaal is doing, whatever is open. */}
			<div className="toolbar">
				{/* The mark alone. The name is on it as a tooltip rather than in
				    text, because the toolbar is the one screen you are only on
				    once you have already opened the thing. */}
				<span className="logo">
					<Logo height={17} title={`Roswaal ${VERSION}`} />
					{/* Small, always there. Knowing which build you are looking at
					    is the first question about any bug report. */}
					<span className="version" title={`Roswaal ${VERSION}`}>{VERSION}</span>
				</span>
				<button
					className="tb with-icon"
					title="Re-read the project from disk"
					onClick={() => void refreshTree()}
				>
					<Icon name="refresh" size={15} />
					Refresh
				</button>
				<button
					className="tb with-icon"
					title="A new .nodescript: one Script, LocalScript or ModuleScript"
					onClick={async () => {
						const name = await ask({
							kind: "prompt",
							title: "New graph",
							label: "Name",
							value: "Untitled",
						});
						if (typeof name !== "string") return;
						const created = await api.createScript(project.config.sourceDir, name, "Script");
						await refreshTree();
						store.open(created.path, created.script);
						setSource(null);
					}}
				>
					<Icon name="newFile" size={15} />
					New graph
				</button>
				<button
					className="tb with-icon"
					title="A node map describes where things live in the DataModel"
					onClick={async () => {
						const name = await ask({
							kind: "prompt",
							title: "New node map",
							label: "Name",
							value: "Tree",
						});
						if (typeof name !== "string") return;
						const created = await api.createMap(project.config.sourceDir, name);
						await refreshTree();
						store.close();
						setSource(null);
						setMapDoc({ path: created.path, map: created.map, dirty: false });
					}}
				>
					<Icon name="map" size={15} />
					New map
				</button>

				<span className="spacer" />

				<div className="segmented" title="How generated Luau reaches disk">
					<button
						className={project.config.compileMode === "manual" ? "on" : ""}
						onClick={() => void setConfig({ compileMode: "manual" })}
					>
						Manual
					</button>
					<button
						className={project.config.compileMode === "hot" ? "on" : ""}
						onClick={() => void setConfig({ compileMode: "hot" })}
					>
						Hot reload
					</button>
				</div>
				<button
					className="tb"
					title="Compile every graph and node map in the project"
					disabled={busy !== null}
					onClick={async () => {
						await runCompile(undefined, true);
						await runCompileMap(undefined);
					}}
				>
					Compile project
				</button>
				<button
					className="tb"
					title="Guides, and a reference page for every node — including this project's own packs. Opens in its own window so it does not cover the graph."
					onClick={() => window.open("/docs", "roswaal-docs")}
				>
					Docs
				</button>
				<button
					className="tb with-icon"
					title="Project settings, editor preferences and themes"
					onClick={() => setSettingsOpen(true)}
				>
					<Icon name="settings" size={15} />
					Settings
				</button>
			</div>

			{/* The document: its name, its own settings, and the tools that only
			    mean anything while it is open.

			    Split out because one flat row put "Refresh the project" next to
			    "strict" and left you working out which of twelve controls acted on
			    what. Two rows answer that by position: everything above is about the
			    project, everything here is about the thing you are looking at, and
			    the row is simply absent when you are not looking at anything. */}
			{(editor.script || mapDoc) && (
				<div className="docbar">
					{mapDoc ? (
						<>
							<span className={`doc-name${mapDoc.dirty ? " dirty" : ""}`}>
								{mapDoc.map.name}
							</span>
							<span className="doc-kind">node map</span>
						</>
					) : editor.script ? (
						<>
							<span className={`doc-name${editor.dirty ? " dirty" : ""}`}>
								{editor.script.name}
							</span>
							<select
								className="tb"
								title="What this graph compiles to"
								value={editor.script.scriptClass}
								onChange={(e) =>
									store.edit((s) => ({ ...s, scriptClass: e.target.value as ScriptClass }))
								}
							>
								<option>Script</option>
								<option>LocalScript</option>
								<option>ModuleScript</option>
							</select>
							<label
								className="tb"
								title="Emit --!strict at the top of the generated file"
								style={{ cursor: "pointer" }}
							>
								<input
									type="checkbox"
									checked={editor.script.strict}
									disabled={locked}
									onChange={(e) => store.edit((s) => ({ ...s, strict: e.target.checked }))}
								/>{" "}
								strict
							</label>

							<span className="divider" />

							<button
								className="tb with-icon"
								disabled={!editor.script || locked}
								title="Add a node at the centre of the view. Right-clicking the canvas does the same, where you click."
								onClick={() => {
									const view = store.getView();
									setMenu({
										screen: { x: 320, y: 120 },
										world: { x: (400 - view.x) / view.zoom, y: (240 - view.y) / view.zoom },
									});
								}}
							>
								<Icon name="search" size={15} />
								Add node
							</button>
							<button
								className="tb with-icon"
								disabled={!editor.script || locked}
								title="Tidy the graph into columns (Ctrl+Shift+L). With several nodes selected, only those move."
								onClick={realign}
							>
								<Icon name="layout" size={15} />
								Realign
							</button>
							<button
								className={`tb${alignExec ? " on" : ""}`}
								aria-pressed={alignExec}
								title={
									alignExec
										? "Realign lines each node up on the execution wire arriving at it. Click to tidy into plain columns instead."
										: "Realign tidies into plain columns. Click to line each node up on the execution wire arriving at it."
								}
								onClick={toggleAlignExec}
							>
								Straighten
							</button>
						</>
					) : null}

					<span className="spacer" />

					<button
						className="tb primary with-icon"
						title="Compile just this document (Ctrl+S)"
						disabled={(!editor.path && !mapDoc) || busy !== null}
						onClick={() => {
							if (mapDoc) void runCompileMap(mapDoc.path);
							else if (editor.path) void runCompile(editor.path, true);
						}}
					>
						<Icon name="build" size={15} />
						{mapDoc ? "Write project file" : "Compile script"}
					</button>
				</div>
			)}

			<div className={`workspace${showInspector ? " with-inspector" : ""}`}>
				<div className="sidebar">
					<h2>{project.root.split(/[\\/]/).pop()}</h2>
					<ProjectTree
						tree={project.tree}
						openPath={editor.path ?? source?.path ?? null}
						onOpen={onTreeOpen}
						onMove={onTreeMove}
						onReveal={onTreeReveal}
						onNewFolder={onTreeNewFolder}
						onRename={onTreeRename}
						onDelete={onTreeDelete}
					/>
					{editor.script && !source && !mapDoc && (
						<VariablesPanel
							locked={locked}
							script={editor.script}
							selection={editor.selection}
							confirm={async (title, message, confirmLabel) =>
								(await ask({ kind: "confirm", title, message, confirmLabel, danger: true })) === true
							}
						/>
					)}
				</div>

				{mapDoc ? (
					<MapEditor
						map={mapDoc.map}
						dirty={mapDoc.dirty}
						tree={project.tree}
						onChange={(next) => setMapDoc({ ...mapDoc, map: next, dirty: true })}
					/>
				) : source ? (
					<SourceView
						doc={source}
						onOpenGraph={(path) => void openGraphPath(path)}
						onEdit={async (path) => {
							try {
								const { editor: found } = await api.openInEditor(path);
								notify("Handed over", `Opened ${path.split("/").pop()} in ${found}.`);
							} catch (err) {
								notify("Could not open it", (err as Error).message);
							}
						}}
						onReveal={(path) => void api.reveal(path)}
					/>
				) : editor.script ? (
					<Canvas
						script={editor.script}
						registry={registry}
						diagnostics={diagnostics}
						locked={locked}
						wireStyle={prefs.wireStyle}
						onRequestMenu={(screen, world) => setMenu({ screen, world })}
						onRequestPinMenu={(screen, nodeId, pin, side) =>
							setPinMenu({ screen, nodeId, pin, side })
						}
						onEditCode={(nodeId, pin, value) => setCodeEdit({ nodeId, pin, value })}
						onDropFile={async (dropped, screen, world) => {
							const name = dropped.split("/").pop() ?? dropped;
							try {
								const { location } = await api.resolve(dropped);
								if (!location) {
									notify(
										"Nothing to make from that",
										`No node map says where ${name} ends up in the DataModel, so ` +
											"there is no path to require it by. Add one, or point an " +
											"existing map at the folder it is in.",
									);
									return;
								}
								setDropMenu({ screen, world, name, location });
							} catch (err) {
								notify("Could not resolve that file", (err as Error).message);
							}
						}}
					/>
				) : (
					<div className="placeholder">
						<h1>No graph open</h1>
						<p>Double-click a <code>.nodescript</code> in the tree, or make a new one.</p>
					</div>
				)}

				{showInspector && editor.script && (
					<Inspector
						locked={locked}
						script={editor.script}
						registry={registry}
						selection={editor.selection}
					/>
				)}

				{/* Floats over the bottom-right of the graph. Last child so it
				    draws above the canvas without needing a z-index of its own. */}
				<CompileToast progress={progress} />
			</div>

			<StatusPanel
				open={statusOpen}
				onToggle={() => setStatusOpen((v) => !v)}
				busy={busy}
				errorCount={errorCount}
				warningCount={warningCount}
				diagnostics={diagnostics}
				outcomes={outcomes}
				mapOutcomes={mapOutcomes}
				orphans={orphans}
				onRemoveOrphans={async () => {
					const ok = await ask({
						kind: "confirm",
						title: "Remove stale files",
						message:
							`Delete ${orphans.length} generated file${orphans.length === 1 ? "" : "s"} ` +
							"with no graph behind them? They are output, so nothing is lost that a " +
							"compile cannot rebuild.",
						confirmLabel: "Remove",
						danger: true,
					});
					if (ok !== true) return;
					await api.removeOrphans(orphans);
					setOrphans([]);
					await refreshTree();
				}}
				packErrors={project.packErrors}
				onForce={(path) => void runCompile(path, true, true)}
			/>

			{dropMenu && (
				<DropMenu
					{...dropMenu}
					onClose={() => setDropMenu(null)}
					onPick={(defId, config) => {
						const def = registry.get(defId);
						if (def) spawn(def, dropMenu.world, config);
						setDropMenu(null);
					}}
				/>
			)}


			{settingsOpen && (
				<SettingsPanel
					root={project.root}
					config={project.config}
					prefs={prefs}
					onConfig={(patch) => void setConfig(patch)}
					onPrefs={updatePrefs}
					onClose={() => setSettingsOpen(false)}
				/>
			)}

			{dialog && <Dialog {...dialog} />}

			{codeEdit && (
				<CodeEditor
					title={codeEdit.pin.name || "Luau"}
					value={codeEdit.value}
					hint="Emitted verbatim into the generated file"
					script={editor.script}
					registry={registry}
					nodeId={codeEdit.nodeId}
					onClose={() => setCodeEdit(null)}
					onCommit={(next) => {
						store.edit((s) => setLiteral(s, codeEdit.nodeId, codeEdit.pin.id, { t: "raw", v: next }));
						setCodeEdit(null);
					}}
				/>
			)}

			{menu && editor.script && (
				<NodeMenu
					anchor={menu}
					registry={registry}
					target={editor.script.target}
					presets={presets}
					onPick={(def, config) => spawn(def, menu.world, config)}
					onAddComment={() => spawnComment(menu.world)}
					onClose={() => setMenu(null)}
				/>
			)}

			{pinMenu && editor.script && (
				<PinMenu
					target={pinMenu}
					script={editor.script}
					registry={registry}
					onPromote={() => promotePin(pinMenu)}
					onBreakLinks={() =>
						store.edit((s) =>
							disconnectPin(s, pinMenu.nodeId, pinMenu.pin.id, pinMenu.side),
						)
					}
					onSplit={(mode) => void splitOrRecombine(pinMenu, undefined, mode)}
					onRecombine={(parent) => void splitOrRecombine(pinMenu, parent, undefined)}
					onClose={() => setPinMenu(null)}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------

interface DropMenuProps {
	screen: { x: number; y: number };
	name: string;
	location: InstanceLocation;
	onPick: (defId: string, config: Record<string, unknown>) => void;
	onClose: () => void;
}

/**
 * What can be made from a file dropped on the canvas.
 *
 * The whole value is that the path is already worked out: you dragged the
 * module in, so Roswaal knows it is ReplicatedStorage + Greeter and you do not
 * have to type either.
 */
function DropMenu({ screen, name, location, onPick, onClose }: DropMenuProps) {
	const root = useRef<HTMLDivElement>(null);
	const config = { root: location.root, path: location.path };
	const full = location.path ? `${location.root}.${location.path}` : location.root;

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) onClose();
		};
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
		};
	}, [onClose]);

	return (
		<div
			className="menu drop-menu"
			ref={root}
			style={{ zIndex: LAYER.menu, left: screen.x, top: screen.y + 40 }}
		>
			<div className="drop-head">
				<strong>{name}</strong>
				<code>{full}</code>
			</div>
			<div className="items">
				{location.isModule && (
					<div
						className="item"
						title="A hoisted require, with the path already filled in"
						onClick={() =>
							onPick("module.requirePath", { ...config, as: "" })
						}
					>
						<span className="swatch" style={{ background: "#6f4f9b" }} />
						<span>Require Module</span>
						<span className="hint">pure</span>
					</div>
				)}
				<div
					className="item"
					title="A reference to the instance itself"
					onClick={() => onPick("roblox.instancePath", config)}
				>
					<span className="swatch" style={{ background: "#2c7676" }} />
					<span>Instance</span>
					<span className="hint">pure</span>
				</div>
				{!location.isModule && (
					<p className="drop-note">
						This compiles to a Script rather than a ModuleScript, so there is nothing to
						require.
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * The shell: what Roswaal is before it has a project.
 *
 * Two changes from typing a path into a box and hoping. The path is **inspected
 * before it is opened**, so one button says the right thing — Open a project
 * that is already one, Initialise a directory that is not, and a typo is
 * reported as a typo rather than as a failure to open. And projects you have
 * opened before are listed, because a repository you work in is one you come
 * back to and an absolute path is not something to retype.
 */
function ProjectPicker({
	onOpen, busy,
}: { onOpen: (root: string, init?: boolean) => void; busy: string | null }) {
	const [root, setRoot] = useState("");
	const [recent, setRecent] = useState<string[]>(() => recentProjects());
	const [look, setLook] = useState<
		{ exists: boolean; directory: boolean; initialised: boolean } | null
	>(null);
	/**
	 * Browse is offered until the daemon says it cannot do it.
	 *
	 * Not probed up front: finding out costs a round trip on a screen whose
	 * whole job is to be instant, and the answer only matters once. So the
	 * button is there, and a machine with no dialog — a daemon over SSH, a
	 * container — replaces it with the reason the first time you press it.
	 */
	const [noPicker, setNoPicker] = useState<string | null>(null);
	const [browsing, setBrowsing] = useState(false);

	// Asked as you type, and only about what you have typed — the daemon reads
	// one directory entry, so there is nothing to debounce harder than this.
	const typed = root.trim();
	useEffect(() => {
		if (typed === "") {
			setLook(null);
			return;
		}
		let live = true;
		const id = window.setTimeout(() => {
			void api.inspectProject(typed).then(
				(info) => live && setLook(info),
				() => live && setLook(null),
			);
		}, 250);
		return () => {
			live = false;
			window.clearTimeout(id);
		};
	}, [typed]);

	const verdict =
		typed === "" ? null
		: look === null ? { can: false, label: "Open", note: "" }
		: !look.exists ? { can: false, label: "Open", note: "There is nothing at that path." }
		: !look.directory ? { can: false, label: "Open", note: "That is a file, not a directory." }
		: look.initialised
			? { can: true, label: "Open", note: "A Roswaal project. Opens where you left it." }
			: {
				can: true, label: "Initialise",
				note: "Not a Roswaal project yet. Initialising writes a roswaal.json and nothing else.",
			};

	const go = () => {
		if (verdict?.can) onOpen(typed, verdict.label === "Initialise");
	};

	/**
	 * The daemon opens the dialog, because a browser cannot produce a path —
	 * see `src/server/browse.ts`. It fills the field rather than opening the
	 * project: choosing a folder and opening it are two decisions, and the
	 * verdict below the field is what belongs between them.
	 */
	const browse = async () => {
		setBrowsing(true);
		try {
			const { path: chosen } = await api.browseForProject(typed || undefined);
			if (chosen) setRoot(chosen);
		} catch (err) {
			setNoPicker((err as Error).message);
		} finally {
			setBrowsing(false);
		}
	};

	return (
		<div className="placeholder shell">
			{/* Here the name stays in text beside the mark. This is the first
			    screen, and it is the one place that has to say what it is. */}
			<h1 className="logo"><Logo height={26} /> Roswaal</h1>
			<p>Open a Roblox or Lune repository. Roswaal writes Luau into it; Rojo does the rest.</p>

			<div className="row">
				<input
					className="tb"
					style={{ width: 420, cursor: "text" }}
					placeholder={"C:" + SEP + "path" + SEP + "to" + SEP + "project"}
					value={root}
					autoFocus
					onChange={(e) => setRoot(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && go()}
				/>
				{noPicker === null && (
					<button
						className="tb"
						disabled={browsing || !!busy}
						title="Choose a folder using the file dialog"
						onClick={() => void browse()}
					>
						{browsing ? "Choosing…" : "Browse…"}
					</button>
				)}
				<button
					className="tb primary"
					disabled={!verdict?.can || !!busy}
					onClick={go}
				>
					{verdict?.label ?? "Open"}
				</button>
			</div>
			{noPicker !== null && <p className="shell-note">{noPicker}</p>}
			{noPicker === null && verdict?.note && <p className="shell-note">{verdict.note}</p>}

			{recent.length > 0 && (
				<div className="shell-recent">
					<div className="shell-recent-head">Recent</div>
					{recent.map((path) => (
						<div key={path} className="shell-recent-row">
							<button className="shell-recent-open" disabled={!!busy} onClick={() => onOpen(path)}>
								<span className="name">{path.split(/[\/]/).filter(Boolean).pop()}</span>
								<span className="path">{path}</span>
							</button>
							<button
								className="shell-recent-forget"
								title="Remove from this list"
								onClick={() => {
									forget(path);
									setRecent(recentProjects());
								}}
							>
								×
							</button>
						</div>
					))}
				</div>
			)}

			{busy && <p>{busy}</p>}
		</div>
	);
}

/** The last segment of a path, which is what identifies a file at a glance. */
function fileName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** How long a finished compile stays on screen before it takes itself away. */
const TOAST_LINGER_MS = 4000;

/**
 * A project compile, narrated in the corner of the graph.
 *
 * Deliberately *not* in the status panel, which is the script analysis view —
 * that panel answers "what is wrong with this graph", and a compile's progress
 * is neither about this graph nor about anything being wrong. Unreal keeps the
 * two apart for the same reason, and putting the walk in the panel meant a
 * thousand rows of good news burying the one diagnostic you opened it for.
 *
 * It floats over the canvas rather than taking space from it, because it is
 * temporary and the graph underneath is what you were looking at.
 */
function CompileToast({ progress }: { progress: CompileStep[] }) {
	const [showing, setShowing] = useState(false);

	const walking = progress.find((step) => step.state === "working");
	const settled = progress.filter((step) => step.state !== "working");
	const total = progress[0]?.total ?? 0;

	useEffect(() => {
		if (progress.length === 0) return;
		setShowing(true);
		// While a file is still being compiled there is no timer to start: the
		// next event will run this again, and the last one to arrive is the one
		// that has no `working` step and therefore starts the countdown.
		if (walking) return;
		const timer = window.setTimeout(() => setShowing(false), TOAST_LINGER_MS);
		return () => window.clearTimeout(timer);
	}, [progress, walking]);

	if (!showing || progress.length === 0) return null;

	const wrote = settled.filter((step) => step.state === "wrote").length;
	const failed = settled.filter((step) => step.state === "failed").length;
	const skipped = settled.filter((step) => step.state === "skipped").length;

	// What actually happened, in the order it matters. A compile that wrote
	// nothing because nothing needed writing is not worth a line of its own.
	const summary = [
		wrote > 0 ? `${wrote} written` : null,
		skipped > 0 ? `${skipped} skipped` : null,
		failed > 0 ? `${failed} failed` : null,
	].filter(Boolean).join(" · ") || `${settled.length} checked`;

	return (
		<div
			className={`compile-toast${failed > 0 && !walking ? " has-failures" : ""}`}
			// Dismissable, because it covers the bottom-right corner of the graph
			// and four seconds is a long time if that is where you were working.
			onClick={() => setShowing(false)}
			title="Dismiss"
			role="status"
			aria-live="polite"
		>
			<div className="head">
				<span className="what">{walking ? "Compiling project" : "Compiled"}</span>
				<span className="count">
					{walking ? `${walking.index} of ${total}` : `${settled.length} files`}
				</span>
			</div>
			{/* The file, while there is one. Its name rather than its path: the
			    path is the same for a thousand of them and the name is not. */}
			<div className="detail">{walking ? fileName(walking.scriptPath) : summary}</div>
			<div className="track">
				<span
					className="fill"
					style={{ width: `${(settled.length / Math.max(total, 1)) * 100}%` }}
				/>
			</div>
		</div>
	);
}

interface StatusPanelProps {
	open: boolean;
	onToggle: () => void;
	busy: string | null;
	errorCount: number;
	warningCount: number;
	diagnostics: Diagnostic[];
	outcomes: CompileOutcome[];
	mapOutcomes: MapOutcome[];
	orphans: string[];
	onRemoveOrphans: () => void;
	packErrors: string[];
	onForce: (path: string) => void;
}

function StatusPanel(props: StatusPanelProps) {
	const { diagnostics, outcomes } = props;
	return (
		<div className="status">
			<div className="bar" onClick={props.onToggle}>
				<span>{props.open ? "▾" : "▸"}</span>
				<span className="count" style={{ color: props.errorCount ? "var(--danger)" : undefined }}>
					{props.errorCount} error{props.errorCount === 1 ? "" : "s"}
				</span>
				<span className="count" style={{ color: props.warningCount ? "var(--warning)" : undefined }}>
					{props.warningCount} warning{props.warningCount === 1 ? "" : "s"}
				</span>
				<span className="spacer" style={{ flex: 1 }} />
				{props.busy && <span>{props.busy}</span>}
				{!props.busy && outcomes.length > 0 && (
					<span>
						{outcomes.filter((o) => o.written).length} of {outcomes.length} written
					</span>
				)}
			</div>

			{props.open && (
				<div className="list">
					{props.orphans.length > 0 && (
						<div className="entry warning">
							<span className="sev">stale</span>
							<span>
								{props.orphans.length} generated file
								{props.orphans.length === 1 ? "" : "s"} with no graph behind
								{props.orphans.length === 1 ? " it" : " them"}: {props.orphans.join(", ")}
							</span>
							<span
								className="where"
								style={{ cursor: "pointer", textDecoration: "underline" }}
								onClick={props.onRemoveOrphans}
							>
								remove
							</span>
						</div>
					)}
					{props.packErrors.map((message, i) => (
						<div className="entry error" key={`pack${i}`}>
							<span className="sev">pack</span>
							<span>{message}</span>
						</div>
					))}
					{props.mapOutcomes.map((outcome) => (
						<div className={`entry ${outcome.written ? "" : "warning"}`} key={outcome.mapPath}>
							<span className="sev" style={outcome.written ? { color: "var(--ok)" } : undefined}>
								{outcome.written ? "wrote" : "skipped"}
							</span>
							<span>{outcome.skipped ?? outcome.outputPath}</span>
						</div>
					))}
					{outcomes.map((outcome) => (
						outcome.skipped ? (
							<div className="entry warning" key={outcome.scriptPath}>
								<span className="sev">skipped</span>
								<span>{outcome.skipped}</span>
								<span
									className="where"
									style={{ cursor: "pointer", textDecoration: "underline" }}
									onClick={() => props.onForce(outcome.scriptPath)}
								>
									overwrite
								</span>
							</div>
						) : outcome.written ? (
							<div className="entry" key={outcome.scriptPath}>
								<span className="sev" style={{ color: "var(--ok)" }}>wrote</span>
								<span>{outcome.outputPath}</span>
							</div>
						) : null
					))}
					{diagnostics.map((d, i) => (
						<div className={`entry ${d.severity}`} key={i} onClick={() => d.node && store.select([d.node])}>
							<span className="sev">{d.severity}</span>
							<span>{d.message}</span>
							{d.pin && <span className="where">{d.pin}</span>}
						</div>
					))}
					{diagnostics.length === 0 && outcomes.length === 0 && props.mapOutcomes.length === 0 &&
						props.orphans.length === 0 && props.packErrors.length === 0 && (
						<div className="entry">
							<span className="sev" style={{ color: "var(--ok)" }}>ok</span>
							<span>No problems found.</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function boundsOf(
	script: { nodes: { id: string; x: number; y: number }[]; comments: { id: string; x: number; y: number; w: number; h: number }[] },
	ids: ReadonlySet<string>,
	registry: ReturnType<typeof createRegistry>,
) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	let found = false;

	for (const node of script.nodes) {
		if (!ids.has(node.id)) continue;
		const def = registry.get((node as { def?: string }).def ?? "");
		const rows = def ? Math.max(def.inputs.length, def.outputs.length, 1) : 1;
		found = true;
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + 216);
		maxY = Math.max(maxY, node.y + 30 + rows * 24 + 10);
	}
	for (const c of script.comments) {
		if (!ids.has(c.id)) continue;
		found = true;
		minX = Math.min(minX, c.x);
		minY = Math.min(minY, c.y);
		maxX = Math.max(maxX, c.x + c.w);
		maxY = Math.max(maxY, c.y + c.h);
	}
	return found ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}
