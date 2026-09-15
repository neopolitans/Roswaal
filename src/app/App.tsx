/**
 * Application shell: project chrome around the canvas.
 *
 * Diagnostics are produced by running the compiler in the browser against the
 * in-memory graph, so they update as you wire rather than when you compile.
 * The daemon is asked only to put files on disk — same compiler, same result,
 * one source of truth.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compile, type Diagnostic } from "../core/compiler/index.js";
import { offTargetNames, offTargetNodes } from "../core/compiler/validate.js";
import { createRegistry, resolveNodePins } from "../core/nodes/index.js";
import { indentUnit, type NodeDef, type RoswaalConfig } from "../core/schema.js";
import {
	api, ProjectChangedError,
	type CompileOutcome, type CompileStep, type MapOutcome, type ProjectInfo, type TreeEntry,
} from "./api.js";
import type { InstanceLocation, NodeMap } from "../core/nodemap.js";
import { MapEditor } from "./MapEditor.jsx";
import { SourceView, type SourceDoc } from "./SourceView.jsx";
import type { DialogRequest, DialogResult, PendingDialog } from "./Dialog.jsx";
import { Logo } from "./logo.jsx";
import type { PinDef } from "../core/schema.js";
import { Canvas } from "./Canvas.jsx";
import { previewSelection } from "./SelectionPreview.jsx";
import { buildPresets, type MenuAnchor } from "./NodeMenu.jsx";
import type { PinMenuTarget } from "./PinMenu.jsx";
import { autoLayout } from "./layout.js";
import { Inspector } from "./Inspector.jsx";
import { ProjectTree } from "./ProjectTree.jsx";
import { VariablesPanel } from "./VariablesPanel.jsx";
import { ProjectMenu } from "./ProjectMenu.jsx";
import { DocumentBar, ProjectBar } from "./Toolbar.jsx";
import { Overlays } from "./Overlays.jsx";
import { GraphTabs } from "./GraphTabs.jsx";
import { Workspace } from "./Workspace.jsx";
import {
	clampLayout, movePanel, resizeDock, toggleDock,
	type DockSide, type PanelId,
} from "./panels.js";
import { screenToWorld } from "./geometry.js";
import { readPreferences, writePreferences, type Preferences } from "./preferences.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import {
	addComment, addNode, alignToAnchor, landingPins, connect, copySelection, deleteSelection, disconnectPin, pasteClipping,
	withCommentContents,
	promoteToVariable, recombinePin, selectionAnchor, setConfig as setNodeConfig, setLiteral, splitCost,
	splitPin, splitValueWarning, type Clipping,
} from "./edits.js";
import { setProjectTypes } from "./projectTypes.js";
import { store, useDocuments, useEditor, useOutline } from "./store.js";
import { ENTRY_HOME, mergeLayout, viewOf, withFunctionGraphs } from "../core/functionGraph.js";

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

/**
 * Asks the daemon which types the project's modules export. Best effort: a
 * daemon from before 0.30.0 has no answer, and the lists simply go without.
 */
function refreshTypes(): void {
	void api.exportedTypes().then(({ types }) => setProjectTypes(types), () => setProjectTypes([]));
}

export function App() {
	const editor = useEditor();
	const documents = useDocuments();
	const outline = useOutline();
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
	const layout = prefs.layout;

	/**
	 * The window got smaller, so the docks give way.
	 *
	 * Without this a layout that was fine on a wide window keeps its dock sizes
	 * when the window narrows, and the centre is squeezed to nothing -- with the
	 * splitters that would fix it pushed off the edge. It runs once on mount
	 * too, which is where a layout restored from a wider monitor is brought back
	 * inside this one.
	 *
	 * Not persisted as it goes. A window being dragged smaller fires this
	 * continuously, and a narrow window is usually temporary -- writing each
	 * step would trade the sizes somebody chose for the ones a resize happened
	 * to end on.
	 */
	useEffect(() => {
		const onResize = () =>
			setPrefs((current) => ({
				...current,
				layout: clampLayout(current.layout, window.innerWidth, window.innerHeight),
			}));
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	/**
	 * A splitter is being dragged: update, but do not write.
	 *
	 * This fires on every pointer move, and `writePreferences` serialises the
	 * whole blob and hits `localStorage` synchronously. Sixty of those a second
	 * to store an intermediate width nobody asked to keep is work done for a
	 * value that is about to be replaced.
	 */
	const onDockResize = useCallback((side: DockSide, size: number) => {
		setPrefs((current) => ({
			...current,
			layout: resizeDock(current.layout, side, size, window.innerWidth, window.innerHeight),
		}));
	}, []);

	/** The drag finished, so the size somebody chose is worth keeping. */
	const onDockResizeEnd = useCallback(() => {
		setPrefs((current) => {
			writePreferences(current);
			return current;
		});
	}, []);

	/** A panel dropped into another dock. One decision, so it is written at once. */
	const onMovePanel = useCallback((panel: PanelId, side: DockSide) => {
		setPrefs((current) => {
			const next = { ...current, layout: movePanel(current.layout, panel, side) };
			writePreferences(next);
			return next;
		});
	}, []);

	/** Collapsing is one decision rather than a stream, so it is written at once. */
	const onDockToggle = useCallback((side: DockSide) => {
		setPrefs((current) => {
			const next = { ...current, layout: toggleDock(current.layout, side) };
			writePreferences(next);
			return next;
		});
	}, []);
	/** The selection preview, which is opened deliberately and never sits open. */
	const [previewOpen, setPreviewOpen] = useState(false);
	const alignExec = prefs.alignExec;
	// Laying out has to use the width the canvas is drawing, or columns spaced
	// by the fixed width overlap the wider nodes sitting in them.
	const wideNodes = prefs.wideNodes;

	/**
	 * Changes a preference, and by default stores it.
	 *
	 * `persist` is the exception for a value that arrives as a stream rather
	 * than as a decision -- a dock size mid-drag, or a clamp while a window is
	 * being resized. Those update the editor and are written when they settle.
	 */
	const updatePrefs = useCallback((patch: Partial<Preferences>, persist = true) => {
		setPrefs((current) => {
			const next = { ...current, ...patch };
			if (persist) writePreferences(next);
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
	/**
	 * The folder a new graph or map goes into.
	 *
	 * Set by clicking anything in the tree — a folder is itself, a file is its
	 * parent — and shown in the dialog before anything is created, so it is
	 * never a hidden setting. `null` means the project's source root, which is
	 * where everything went before this existed.
	 */
	const [targetDir, setTargetDir] = useState<string | null>(null);
	/** Where the project menu is anchored, and the recents it was opened with. */
	const [projectMenu, setProjectMenu] = useState<
		{ anchor: { x: number; y: number }; recent: string[] } | null
	>(null);
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
	/**
	 * Where the pointer is over the canvas, in world coordinates.
	 *
	 * A ref rather than state: it changes on every mouse move and nothing
	 * renders from it — only `paste` reads it, once, when a key is pressed.
	 */
	const pointerAt = useRef<{ x: number; y: number } | null>(null);

	const registry = useMemo(() => createRegistry(customNodes), [customNodes]);

	/**
	 * The in-browser compile of the open graph.
	 *
	 * Was `.diagnostics` alone; the whole result is kept now because the
	 * selection preview needs the code and the source map, and they come from
	 * the same call that was already running on every edit. Nothing extra is
	 * compiled to support it.
	 */
	// Indented the way the project says, so the Source view and the compiled
	// file on disk are the same text rather than nearly the same text.
	const indent = project ? indentUnit(project.config) : undefined;
	const compiled = useMemo(
		() => (editor.script ? compile(editor.script, registry, { indent }) : null),
		[editor.script, registry, indent],
	);
	const diagnostics: Diagnostic[] = compiled?.diagnostics ?? [];

	/** What `P` previews, and the function's name when that is a whole function. */
	const previewScope = useMemo(() => {
		if (!editor.script) return { selection: editor.selection, functionName: undefined };
		const selection = previewSelection(editor.script, editor.graph, editor.selection);
		const fn = selection === editor.selection
			? undefined
			: editor.script.nodes.find((n) => n.id === editor.graph);
		const functionName = fn
			? (fn.config as { name?: string } | undefined)?.name?.trim() || "function"
			: undefined;
		return { selection, functionName };
	}, [editor.script, editor.graph, editor.selection]);

	// -- project -----------------------------------------------------------

	const loadProject = useCallback(async (root: string, init = false) => {
		setBusy("Opening project…");
		try {
			const info = init ? await api.initProject(root) : await api.openProject(root);
			api.setProjectRoot(info.root);
			setProject(info);
			remember(info.root);
			setCustomNodes((await api.customNodes()).custom);
			refreshTypes();
		} catch (err) {
			notify("Something went wrong", (err as Error).message);
		} finally {
			setBusy(null);
		}
	}, []);

	/**
	 * Leaves the project that is open and opens another.
	 *
	 * The daemon has always been able to do this — `POST /api/project/open`, and
	 * a 409 guard so a tab left on the old project cannot write into the new one.
	 * What was missing was any way to ask, once the first-run shell was behind
	 * you, and the workaround was to restart the daemon.
	 *
	 * **Unsaved work is written first, and a failure cancels the switch.**
	 * Autosave is debounced and follows the document you are looking at, so an
	 * edit from the last few hundred milliseconds — or one in a tab you moved
	 * away from inside that window — may not be on disk yet. Closing every
	 * document, which is what changing project does, would take it with it.
	 */
	const switchProject = useCallback(
		async (root: string) => {
			try {
				for (const { path, script } of store.unsaved()) {
					await api.writeScript(path, script);
				}
				if (mapDoc?.dirty) await api.writeMap(mapDoc.path, mapDoc.map);
			} catch (err) {
				notify(
					"Staying where we are",
					`Something still had unsaved changes and they could not be written: ${
						(err as Error).message
					}. Nothing was closed and the project has not changed.`,
				);
				return;
			}

			store.closeAll();
			setMapDoc(null);
			setSource(null);
			await loadProject(root);
		},
		[loadProject, mapDoc, notify],
	);

	/**
	 * The folder dialog, then whatever comes back.
	 *
	 * A directory that is not a project yet is offered rather than refused, on
	 * the same terms the first-run shell offers it: initialising writes a
	 * `roswaal.json` and nothing else. Asked rather than assumed, because
	 * choosing a folder and creating a project in it are two decisions and only
	 * one of them was made by picking it.
	 */
	const browseForProject = useCallback(async () => {
		let chosen: string | null;
		try {
			chosen = (await api.browseForProject()).path;
		} catch (err) {
			// No dialog on this machine — a daemon over SSH, a container. Typing
			// the path is the fallback the shell has always had.
			const typed = await ask({
				kind: "prompt",
				title: "Open a project",
				label: `This machine has no folder dialog (${(err as Error).message})`,
				placeholder: "C:" + SEP + "path" + SEP + "to" + SEP + "project",
			});
			chosen = typeof typed === "string" && typed.trim() !== "" ? typed.trim() : null;
		}
		if (!chosen) return;

		const look = await api.inspectProject(chosen).catch(() => null);
		if (!look || !look.exists || !look.directory) {
			notify("Nothing to open", `There is no directory at ${chosen}.`);
			return;
		}
		if (!look.initialised) {
			const yes = await ask({
				kind: "confirm",
				title: "Not a Roswaal project yet",
				message:
					`${chosen} has no roswaal.json. Initialising writes one and nothing else — ` +
					"no files are moved and nothing existing is changed.",
				confirmLabel: "Initialise",
			});
			if (yes !== true) return;
			store.closeAll();
			setMapDoc(null);
			setSource(null);
			await loadProject(chosen, true);
			return;
		}
		await switchProject(chosen);
	}, [ask, loadProject, notify, switchProject]);

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
					refreshTypes();
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
	 * Open whenever a project is, rather than only on Dynamic, because it now
	 * carries three kinds of news. Dynamic-compile events say one happened that
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
			refreshTypes();
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
			store.closeAll();
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
		// Asked here rather than only after a compile. Renaming, moving and
		// deleting all change what is stale, and none of them compiles anything —
		// so the count went on describing whatever the last compile saw.
		setOrphans((await api.orphans().catch(() => ({ orphans: [] }))).orphans);
		refreshTypes();
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
		// Already loaded: go to its tab rather than re-reading, which would throw
		// away its undo history and where it was scrolled to. `showGraph` puts
		// the tab back when only a function's tab is keeping the file open.
		if (store.showGraph(entry.path)) return;
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
			setSource(null);
			setMapDoc(null);
			if (store.showGraph(path)) return;
			const { script } = await api.readScript(path);
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
			store.closeAll();
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
				if (write) await refreshTree();
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

	// One palette entry per variable, local, function and parameter the graph on
	// screen can reach, so "Get health" is searchable by name rather than by node
	// type — and so nothing is offered that would not compile where it lands.
	const presets = useMemo(
		() => (editor.script ? buildPresets(editor.script, editor.graph) : []),
		[editor.script, editor.graph],
	);

	/**
	 * Pastes a clipping where the pointer is.
	 *
	 * Both Ctrl+V and Ctrl+D come here, because they are the same act with a
	 * different source, and a duplicate landing beside its original has the same
	 * problem a paste did: a copied **comment** is drawn over the nodes it was
	 * copied from, and membership is geometric, so dragging it afterwards takes
	 * the originals along with the copies.
	 *
	 * The pointer is only a landing point while it is over the canvas. A
	 * keystroke pressed with the mouse in a panel, or off the window entirely,
	 * falls back to the old offset — which is still a sensible answer, and is
	 * what a graph pasted from the keyboard alone has always done.
	 */
	const paste = useCallback((clip: Clipping) => {
		const at = pointerAt.current ?? undefined;
		store.edit((s) => {
			const { script, ids } = pasteClipping(s, clip, { at });
			queueMicrotask(() => store.select(ids));
			return script;
		});
	}, []);

	/**
	 * Places a node, and — when the menu was opened by dragging a wire off a pin
	 * — joins it up.
	 *
	 * The pin chosen is the **first** compatible one in declaration order, which
	 * is not a heuristic so much as the node author's own answer: pins are
	 * declared in the order they matter, so the first that fits is the one the
	 * node is mostly about. It is also what someone who knows node graphs will
	 * expect, and picking differently would mean a wire that lands somewhere
	 * surprising and has to be redone.
	 *
	 * A node with nothing compatible still gets placed. The menu narrows itself
	 * to nodes that can take the wire, so this is only reachable for a pack node
	 * whose derived pins disagree with its declared ones — and placing it
	 * unconnected is better than refusing a pick with no explanation.
	 */
	const spawn = useCallback(
		(def: NodeDef, world: { x: number; y: number }, config?: Record<string, unknown>) => {
			const from = menu?.from;
			// A hoisted Function is in no flow, so it goes straight into a graph of
			// its own, and that graph opens.
			const hoisted = def.id === "function.entry";
			const path = store.getSnapshot().path;
			store.edit((s) => {
				const at = hoisted ? ENTRY_HOME : world;
				const added = addNode(s, def, at.x, at.y);
				queueMicrotask(() => {
					if (hoisted && path) store.openFunction(path, added.id);
					store.select([added.id]);
				});
				/**
				 * An operator pill starts bracketed when Settings says so.
				 *
				 * Written onto the node rather than read from preferences at
				 * compile time, because the brackets are part of the file every
				 * developer on the project reads. A preference that silently
				 * reshaped everyone else's generated Luau would be the wrong kind
				 * of personal setting.
				 */
				const withDefaults = def.display === "operator" && prefs.logicParens
					? { parens: true, ...config }
					: config;
				let next = withDefaults
					? setNodeConfig(added.script, added.id, withDefaults)
					: added.script;
				if (!from || hoisted) return next;

				const placed = next.nodes.find((n) => n.id === added.id);
				const pins = placed ? resolveNodePins(def, placed.config) : { inputs: [], outputs: [] };
				const side = from.side === "out" ? "in" : "out";
				const candidates = side === "in" ? pins.inputs : pins.outputs;
				const landing = landingPins(def, candidates, from.pin, side)[0];
				if (!landing) return next;

				const target = { node: added.id, pin: landing.id };
				next = from.side === "out"
					? connect(next, registry, from.ref, target)
					: connect(next, registry, target, from.ref);
				return next;
			});
			setMenu(null);
		},
		[menu, registry, prefs.logicParens],
	);

	const spawnComment = useCallback((world: { x: number; y: number }) => {
		const selected = store.getSnapshot().selection;
		store.edit((s) => {
			// Wrapping a selection is the common case, so a comment created with
			// nodes selected sizes itself to enclose them. With nothing selected
			// it is a plain box at the point given: a comment is a note on the
			// canvas, and one about nothing in particular — a heading, a reminder,
			// a space left for work not done yet — is a fair thing to write.
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
		// The graph on screen, and only that: laying out the whole file would
		// arrange every function's nodes around each other.
		const graph = state.graph;
		const view = viewOf(state.script, graph);
		const selected = new Set(
			[...state.selection].filter((id) => view.nodes.some((n) => n.id === id)),
		);
		const only = selected.size > 1 ? selected : undefined;
		store.edit((s) =>
			mergeLayout(s, graph, autoLayout(viewOf(s, graph), registry, { only, alignExec, wideNodes })),
		);
	}, [registry, alignExec, wideNodes]);

	/**
	 * Deletes a selection, asking first when a function in it takes its graph
	 * along — nodes that are not on screen. A delete that only ever removes what
	 * you can see needs no question.
	 */
	const removeSelection = useCallback(async (ids: ReadonlySet<string>) => {
		const script = store.getSnapshot().script;
		if (!script || ids.size === 0) return;
		const inside = [...withFunctionGraphs(script, ids)].filter(
			(id) => !ids.has(id) && script.nodes.some((n) => n.id === id),
		).length;
		if (inside > 0) {
			const ok = await ask({
				kind: "confirm",
				title: "Delete the function's graph too?",
				message: `${inside} node${inside === 1 ? " is" : "s are"} inside it, and go${inside === 1 ? "es" : ""} with it.`,
				confirmLabel: "Delete",
				danger: true,
			});
			if (ok !== true) return;
		}
		store.edit((s) => deleteSelection(s, ids, registry));
	}, [ask, registry]);

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
	 * the other side of the change. The simple thing is to drop them without
	 * asking; here more than one gets a confirmation, because a graph you cannot
	 * see all at once should not lose wiring silently.
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
	 * Only outside Dynamic. On Dynamic a compile follows every autosave, so
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
			// Selecting, copying and previewing are reading. Everything else below
			// changes the graph, and while it is locked none of it may.
			const reading =
				(mod && (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "c")) ||
				e.key.toLowerCase() === "p";
			if (locked && !reading) return;

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
			// Compiles what is on screen. A node map open over a graph tab used to
			// compile the graph behind it, which is not what its button says.
			if (mod && e.key.toLowerCase() === "s") {
				e.preventDefault();
				if (mapDoc) void runCompileMap(mapDoc.path);
				else if (!source && editor.path) void runCompile(editor.path, true);
				return;
			}
			if (mod && e.shiftKey && e.key.toLowerCase() === "l") {
				e.preventDefault();
				realign();
				return;
			}
			if (mod && e.key.toLowerCase() === "a") {
				e.preventDefault();
				const state = store.getSnapshot();
				// Everything in the graph on screen. Selecting nodes you cannot see
				// is how the next Delete removes them.
				if (state.script) {
					const s = viewOf(state.script, state.graph);
					store.select([...s.nodes.map((n) => n.id), ...s.comments.map((c) => c.id)]);
				}
				return;
			}
			if (mod && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x")) {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				clipboard.current = copySelection(state.script, state.selection, registry);
				/**
				 * Cut takes away exactly what it took a copy of.
				 *
				 * A comment carries what it encloses, so cutting one and cutting
				 * only its box would leave the nodes behind and the paste would
				 * be a second set of them. Delete is deliberately not changed:
				 * removing a comment has always meant removing the note, and a
				 * key that quietly took eleven nodes with it is not a key anybody
				 * should have to find out about.
				 */
				if (e.key.toLowerCase() === "x") {
					void removeSelection(withCommentContents(state.script, state.selection, registry));
				}
				return;
			}
			if (mod && e.key.toLowerCase() === "v") {
				const clip = clipboard.current;
				if (!clip) return;
				e.preventDefault();
				paste(clip);
				return;
			}
			if (mod && e.key.toLowerCase() === "d") {
				const state = store.getSnapshot();
				if (!state.script || state.selection.size === 0) return;
				e.preventDefault();
				paste(copySelection(state.script, state.selection, registry));
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				void removeSelection(store.getSnapshot().selection);
				return;
			}
			// Two or more, because one node is already aligned with itself.
			if (e.key.toLowerCase() === "a" && !mod && store.getSnapshot().selection.size > 1) {
				const state = store.getSnapshot();
				const script = state.script;
				if (!script) return;
				const anchor = selectionAnchor(script, state.selection);
				if (!anchor) return;
				e.preventDefault();
				const ids = state.selection;
				const graph = state.graph;
				store.edit((s) => mergeLayout(s, graph, alignToAnchor(viewOf(s, graph), registry, ids, anchor)));
				return;
			}
			if (e.key.toLowerCase() === "c" && !mod) {
				e.preventDefault();
				/**
				 * Where the canvas is looking, rather than world origin.
				 *
				 * With a selection the point is ignored — the comment sizes
				 * itself around what is selected. Without one it is the whole
				 * answer, and `(0, 0)` would drop the comment at the world's
				 * origin, which is usually nowhere near the screen. The view's
				 * offset and zoom say where its top-left corner is without
				 * anyone needing to know how big the canvas is.
				 */
				const inset = 64;
				spawnComment(screenToWorld(store.getView(), inset, inset));
			}
			// Unmodified. With a selection it picks out what those nodes produced;
			// with nothing picked it is the whole script.
			if (e.key.toLowerCase() === "p" && !mod && store.getSnapshot().script) {
				e.preventDefault();
				setPreviewOpen(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [editor.path, mapDoc, source, runCompile, runCompileMap, spawnComment, realign, removeSelection, locked, registry, paste]);

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

	/** A function under a graph in the tree: its file first, then its graph. */
	const onTreeOpenFunction = useCallback(async (path: string, id: string) => {
		try {
			setSource(null);
			setMapDoc(null);
			if (!store.isOpen(path)) {
				const { script } = await api.readScript(path);
				store.open(path, script);
			}
			if (!store.openFunction(path, id)) {
				notify("Could not open that function", "It is no longer in the graph.");
			}
		} catch (err) {
			notify("Could not open that graph", (err as Error).message);
		}
	}, [notify]);

	/**
	 * Writes every open graph at or under `path` that has edits not yet on disk.
	 *
	 * Before a move or a rename, so the file that moves is the graph on screen.
	 * Autosave follows the tab you are looking at, and a graph in another tab can
	 * be dirty with nothing scheduled to write it.
	 */
	const flushUnder = useCallback(async (path: string) => {
		for (const { path: open, script } of store.unsaved()) {
			if (open === path || open.startsWith(path + "/")) await api.writeScript(open, script);
		}
	}, []);

	/**
	 * Points every open document at where its file went.
	 *
	 * A tab kept its old path when a graph was moved, so its next autosave wrote
	 * the graph back where it had been. A folder move carries every tab under it;
	 * a graph moved or renamed itself is read back, because its name comes from
	 * its file name.
	 */
	const followMove = useCallback(async (from: string, to: string) => {
		const moved = (path: string) =>
			path === from ? to : path.startsWith(from + "/") ? to + path.slice(from.length) : null;

		for (const path of store.openPaths()) {
			const next = moved(path);
			if (next === null) continue;
			const script = path === from ? (await api.readScript(next)).script : undefined;
			store.rename(path, next, script);
		}
		setMapDoc((doc) => {
			const next = doc && moved(doc.path);
			return doc && next ? { ...doc, path: next } : doc;
		});
		setSource((doc) => {
			const next = doc && moved(doc.path);
			return doc && next ? { ...doc, path: next } : doc;
		});
	}, []);

	const onTreeMove = useCallback(async (from: string[], toDir: string) => {
		try {
			for (const path of from) {
				await flushUnder(path);
				const { path: moved } = await api.moveScript(path, toDir);
				await followMove(path, moved);
			}
		} catch (err) {
			notify("Could not move that", (err as Error).message);
		}
		await refreshTree();
	}, [refreshTree, flushUnder, followMove, notify]);

	const onTreeReveal = useCallback(async (target: string) => {
		try {
			await api.reveal(target);
		} catch (err) {
			notify("Could not show that file", (err as Error).message);
		}
	}, [notify]);

	/**
	 * Where a new document lands, and how the dialog says so.
	 *
	 * A "New graph" button that silently drops the file into a folder you
	 * clicked ten minutes ago is worse than one that always uses the root, so
	 * the destination goes in the dialog's label. Then there is no state to
	 * remember and no surprise to undo.
	 */
	const inDir = useCallback(
		(dir: string | null) => {
			const source = project?.config.sourceDir ?? "";
			// The tree shows the compiled output as well as the graphs, and
			// clicking about in it sets the target like anything else. A graph
			// written into `outDir` would be deleted by the next compile, so
			// anything outside the source directory falls back to its root.
			// The check belongs here rather than in the tree: this is the one
			// place both the button and the menu pass through.
			const usable = dir !== null && (dir === source || dir.startsWith(source + "/"));
			return usable ? dir : source;
		},
		[project],
	);

	const createGraphIn = useCallback(async (dir: string) => {
		const name = await ask({
			kind: "prompt",
			title: "New graph",
			label: `Name — created in ${dir}`,
			value: "Untitled",
		});
		if (typeof name !== "string") return;
		try {
			const created = await api.createScript(dir, name, "Script");
			await refreshTree();
			store.open(created.path, created.script);
			setSource(null);
			setMapDoc(null);
		} catch (err) {
			notify("Could not create that graph", (err as Error).message);
		}
	}, [ask, notify, refreshTree]);

	const createMapIn = useCallback(async (dir: string) => {
		const name = await ask({
			kind: "prompt",
			title: "New node map",
			label: `Name — created in ${dir}`,
			value: "Tree",
		});
		if (typeof name !== "string") return;
		try {
			const created = await api.createMap(dir, name);
			await refreshTree();
			store.close();
			setSource(null);
			setMapDoc({ path: created.path, map: created.map, dirty: false });
		} catch (err) {
			notify("Could not create that map", (err as Error).message);
		}
	}, [ask, notify, refreshTree]);

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
			await flushUnder(target);
			const { path: renamed } = await api.renameEntry(target, name);
			await refreshTree();
			// Keep the tab, its history and its viewport: the file was renamed,
			// the graph was not touched. Closing and reopening would be simpler
			// and would throw all three away for an operation that changed
			// nothing about the document. A folder takes its open graphs with it.
			await followMove(target, renamed);
		} catch (err) {
			notify("Something went wrong", (err as Error).message);
		}
	}, [ask, notify, refreshTree, flushUnder, followMove]);

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
			// Only the tabs whose files went. A deleted file elsewhere in the
			// tree is no reason to close the graph somebody is looking at.
			for (const path of paths) store.closeDocument(path);
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
			<ProjectBar
				config={project.config}
				busy={busy}
				onRefresh={() => void refreshTree()}
				onNewGraph={() => void createGraphIn(inDir(targetDir))}
				onNewMap={() => void createMapIn(inDir(targetDir))}
				onCompileMode={(mode) => void setConfig({ compileMode: mode })}
				onCompileProject={async () => {
					await runCompile(undefined, true);
					await runCompileMap(undefined);
				}}
				onOpenDocs={() => window.open("/docs", "roswaal-docs")}
				onOpenDesigner={() => window.open("/designer", "roswaal-designer")}
				onOpenSettings={() => setSettingsOpen(true)}
				onOpenProjectMenu={(anchor) =>
					setProjectMenu({ anchor, recent: recentProjects() })
				}
			/>

			{/* Rendered here rather than in the overlay stack: it is about the
			    project, not about the graph, and Overlays takes the script. It
			    is `position: fixed`, so where it sits in the tree is invisible. */}
			{projectMenu && (
				<ProjectMenu
					anchor={projectMenu.anchor}
					current={project.root}
					recent={projectMenu.recent}
					onOpen={(root) => void switchProject(root)}
					onForget={(root) => {
						forget(root);
						setProjectMenu((m) =>
							m ? { ...m, recent: m.recent.filter((r) => r !== root) } : m,
						);
					}}
					onBrowse={() => void browseForProject()}
					onClose={() => setProjectMenu(null)}
				/>
			)}

			{/* The document row. Absent when nothing is open, which is what
			    keeps "everything above is the project, everything here is the
			    document" true rather than aspirational. */}
			{mapDoc && (
				<DocumentBar
					kind="map"
					name={mapDoc.map.name}
					dirty={mapDoc.dirty}
					busy={busy}
					onCompile={() => void runCompileMap(mapDoc.path)}
				/>
			)}

			<Workspace
				layout={layout}
				onResize={onDockResize}
				onResizeEnd={onDockResizeEnd}
				onToggle={onDockToggle}
				onMovePanel={onMovePanel}
				contents={{
					tree: (
						<>
							<h2>{project.root.split(/[\\/]/).pop()}</h2>
							<ProjectTree
								tree={project.tree}
								openPath={editor.path ?? source?.path ?? null}
								openGraph={source || mapDoc ? null : editor.graph}
								outline={outline}
								onOpenFunction={onTreeOpenFunction}
								sourceDir={project.config.sourceDir}
								nodePaths={project.config.nodePaths}
								targetDir={targetDir}
								onOpen={onTreeOpen}
								onMove={onTreeMove}
								onReveal={onTreeReveal}
								onTargetDir={setTargetDir}
								onNewGraph={createGraphIn}
								onNewMap={createMapIn}
								onNewFolder={onTreeNewFolder}
								onRename={onTreeRename}
								onDelete={onTreeDelete}
							/>
						</>
					),
					variables:
						editor.script && !source && !mapDoc ? (
							<VariablesPanel
								locked={locked}
								script={editor.script}
								graph={editor.graph}
								selection={editor.selection}
								confirm={async (title, message, confirmLabel) =>
									(await ask({ kind: "confirm", title, message, confirmLabel, danger: true })) === true
								}
							/>
						) : undefined,
					inspector:
						showInspector && editor.script ? (
							<Inspector
								locked={locked}
								script={editor.script}
								registry={registry}
								selection={editor.selection}
							/>
						) : undefined,
					analysis: (
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
					),
				}}
				floating={<CompileToast progress={progress} />}
				centre={
					<>
						{/* Above the centre's content, and only when there is a
						    choice to make. A node map or a source file is not a
						    graph and has no tab, so the strip shows what would
						    come back if you left them. */}
						<GraphTabs
							documents={documents}
							functionTabs={prefs.functionTabs}
							onActivate={(key) => {
								setSource(null);
								setMapDoc(null);
								store.activate(key);
							}}
							onClose={(key) => store.closeDocument(key)}
							onReorder={(key, before) => store.reorder(key, before)}
						/>
						<div className="centre-body">
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
						<>
						{/* The graph's own tools, floating over the canvas's top edge
						    rather than a row above it. A node map keeps its bar: it
						    has no canvas to float over. */}
						<DocumentBar
							kind="graph"
							name={editor.script.name}
							dirty={editor.dirty}
							busy={busy}
							scriptClass={editor.script.scriptClass}
							target={editor.script.target}
							typecheck={editor.script.typecheck}
							locked={locked}
							alignExec={alignExec}
							selected={editor.selection.size}
							inFunction={editor.graph !== null}
							showName={prefs.toolbarName}
							functionName={
								editor.graph === null
									? undefined
									: (editor.script.nodes.find((n) => n.id === editor.graph)?.config as
										| { name?: string }
										| undefined)?.name?.trim() || "function"
							}
							hasPath={editor.path !== null}
							onScriptClass={(value) => store.edit((s) => ({ ...s, scriptClass: value }))}
							onTarget={async (value) => {
								// Nodes written only for the other target would all become
								// errors, so say how many and ask before switching. The same
								// test `validate` reports them with.
								const off = offTargetNodes(editor.script!, registry, value);
								if (off.length > 0) {
									const name = value === "lune" ? "Lune" : "Roblox";
									const ok = await ask({
										kind: "confirm",
										title: `Compile this graph for ${name}?`,
										message:
											`${off.length === 1 ? "This node is" : `These ${off.length} nodes are`} ` +
											`not available for ${name}, and will show as errors until removed:`,
										items: offTargetNames(editor.script!, registry, value),
										confirmLabel: `Switch to ${name}`,
									});
									if (ok !== true) return;
								}
								store.edit((s) => ({ ...s, target: value }));
							}}
							onTypecheck={(value) => store.edit((s) => ({ ...s, typecheck: value }))}
							onAddNode={() => {
								const view = store.getView();
								setMenu({
									screen: { x: 320, y: 120 },
									world: { x: (400 - view.x) / view.zoom, y: (240 - view.y) / view.zoom },
								});
							}}
							onRealign={realign}
							onToggleAlignExec={toggleAlignExec}
							onPreview={() => setPreviewOpen(true)}
							onCompile={() => {
								if (editor.path) void runCompile(editor.path, true);
							}}
						/>
						<Canvas
							script={editor.script}
							graph={editor.graph}
							registry={registry}
							diagnostics={diagnostics}
							locked={locked}
							onPointerAt={(world) => { pointerAt.current = world; }}
							wireStyle={prefs.wireStyle}
							wideNodes={prefs.wideNodes}
							onRequestMenu={(screen, world, from) => setMenu({ screen, world, from })}
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
						</>
						) : (
							<div className="placeholder">
								<h1>No graph open</h1>
								<p>Double-click a <code>.nodescript</code> in the tree, or make a new one.</p>
							</div>
						)}
						</div>
					</>
				}
			/>

			<Overlays
				registry={registry}
				script={editor.script}
				selection={editor.selection}
				previewSelection={previewScope.selection}
				previewFunction={previewScope.functionName}

				drop={dropMenu}
				onDropPick={(defId, config) => {
					const def = registry.get(defId);
					if (def && dropMenu) spawn(def, dropMenu.world, config);
					setDropMenu(null);
				}}
				onDropClose={() => setDropMenu(null)}

				menu={menu}
				presets={presets}
				onMenuPick={(def, config) => menu && spawn(def, menu.world, config)}
				onAddComment={() => menu && spawnComment(menu.world)}
				onMenuClose={() => setMenu(null)}

				pinMenu={pinMenu}
				onPromote={() => pinMenu && promotePin(pinMenu)}
				onBreakLinks={() =>
					pinMenu &&
					store.edit((s) => disconnectPin(s, pinMenu.nodeId, pinMenu.pin.id, pinMenu.side, registry))
				}
				onSplit={(mode) => pinMenu && void splitOrRecombine(pinMenu, undefined, mode)}
				onRecombine={(parent) => pinMenu && void splitOrRecombine(pinMenu, parent, undefined)}
				onPinMenuClose={() => setPinMenu(null)}

				preview={previewOpen && compiled ? compiled : null}
				onPreviewClose={() => setPreviewOpen(false)}

				settings={
					settingsOpen ? { root: project.root, config: project.config, prefs } : null
				}
				onConfig={(patch) => void setConfig(patch)}
				onPrefs={updatePrefs}
				onSettingsClose={() => setSettingsOpen(false)}

				dialog={dialog}

				codeEdit={codeEdit}
				onCodeCommit={(next) => {
					if (!codeEdit) return;
					store.edit((s) => setLiteral(s, codeEdit.nodeId, codeEdit.pin.id, { t: "raw", v: next }));
					setCodeEdit(null);
				}}
				onCodeClose={() => setCodeEdit(null)}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------

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
			<p>Open a Roblox repository, or a Lune one (experimental). Roswaal writes Luau into it; Rojo does the rest.</p>

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
 * is neither about this graph nor about anything being wrong. Putting the walk
 * in the panel meant a thousand rows of good news burying the one diagnostic
 * you opened it for.
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
					{outcomes.map((outcome) => {
						// A graph with errors was held back by them, and overwriting
						// would write nothing. Only a file edited by hand, or one Roswaal
						// did not make, has anything to overwrite.
						const failed = outcome.diagnostics.some((d) => d.severity === "error");
						if (outcome.skipped) {
							return (
								<div className={`entry ${failed ? "error" : "warning"}`} key={outcome.scriptPath}>
									<span className="sev">{failed ? "failed" : "skipped"}</span>
									<span>{outcome.skipped}</span>
									{!failed && (
										<span
											className="where"
											style={{ cursor: "pointer", textDecoration: "underline" }}
											onClick={() => props.onForce(outcome.scriptPath)}
										>
											overwrite
										</span>
									)}
								</div>
							);
						}
						if (!outcome.written) return null;
						return (
							<Fragment key={outcome.scriptPath}>
								<div className="entry">
									<span className="sev" style={{ color: "var(--ok)" }}>wrote</span>
									<span>{outcome.outputPath}</span>
								</div>
								{/* Deleted because this graph now writes somewhere else. */}
								{(outcome.superseded ?? []).map((gone) => (
									<div className="entry" key={gone}>
										<span className="sev">removed</span>
										<span>{gone} → {outcome.outputPath}</span>
									</div>
								))}
							</Fragment>
						);
					})}
					{diagnostics.map((d, i) => (
						<div className={`entry ${d.severity}`} key={i} onClick={() => d.node && store.reveal(d.node)}>
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
