/**
 * Application shell: project chrome around the canvas.
 *
 * Diagnostics are produced by running the compiler in the browser against the
 * in-memory graph, so they update as you wire rather than when you compile.
 * The daemon is asked only to put files on disk — same compiler, same result,
 * one source of truth.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { compile, type Diagnostic } from "../core/compiler/index.js";
import { offTargetNames, offTargetNodes } from "../core/compiler/validate.js";
import { buildSearchIndex, buildSite } from "../core/docs/site.js";
import { errorMessage } from "../core/errorMessage.js";
import { diffLines, shownLines } from "../core/lineDiff.js";
import type { InstanceLocation } from "../core/nodemap.js";
import { FUNCTION_NODES } from "../core/nodes/flow.js";
import { BUILTIN_NODES, createRegistry } from "../core/nodes/index.js";
import { indentUnit, type NodeDef, type RoswaalConfig } from "../core/schema.js";
import { AliasDocument } from "./AliasDocument.jsx";
import {
	api,
	type CompileOutcome,
	type CompileStep,
	type MapOutcome,
	openEventStream,
	ProjectChangedError,
	type ProjectInfo,
	type TreeEntry,
} from "./api.js";
import { Canvas } from "./Canvas.jsx";
import { CanvasStrip } from "./CanvasStrip.jsx";
import { PanelHead } from "./Cards.jsx";
import { CompileToast } from "./CompileToast.jsx";
import { onCodeEditRequest } from "./codeEditRequests.js";
import { previewFor } from "./DocsPanel.jsx";
import { DocsSearch } from "./DocsSearch.jsx";
import { ExportMenu } from "./ExportMenu.jsx";
import { type Clipping, disconnectPin, setLiteral, setConfig as setNodeConfig } from "./edits.js";
import { GraphSettings } from "./GraphSettings.jsx";
import { GraphTabs } from "./GraphTabs.jsx";
import {
	useCanImportPlace,
	useCanImportZip,
	useCanOpenDirectory,
	useHostCan,
	useRememberedFolders,
} from "./host.js";
import { Inspector } from "./Inspector.jsx";
import { IntroPanel } from "./IntroPanel.jsx";
import { MapEditor } from "./MapEditor.jsx";
import { MenuButton } from "./Menu.jsx";
import type { WireFrom } from "./menuSearch.js";
import type { MenuAnchor } from "./NodeMenu.jsx";
import { NodePicker } from "./NodePicker.jsx";
import { functionNameOf } from "./nodeConfig.js";
import { type CodeEditState, Overlays } from "./Overlays.jsx";
import type { PinMenuTarget } from "./PinMenu.jsx";
import { PlaceBrowser, PlaceProperties, type PlaceTarget } from "./PlaceBrowser.jsx";
import { ProjectPicker } from "./ProjectPicker.jsx";
import { ProjectTree } from "./ProjectTree.jsx";
import { IS_STATIC_HOST, openHome, openPage } from "./pages.js";
import type { PanelId } from "./panels.js";
import { readPreferences, wheelAction } from "./preferences.js";
import { SiteBanner } from "./previewBuild.jsx";
import { setProjectAliases } from "./projectAliases.js";
import { setProjectFunctions, setProjectTypes } from "./projectTypes.js";
import { forget, lastProject, remember } from "./recents.js";
import { previewSelection } from "./SelectionPreview.jsx";
import { SourceView } from "./SourceView.jsx";
import { StatusPanel } from "./StatusPanel.jsx";
import { SaveQueue } from "./saveQueue.js";
import { sideKey, store, useDocuments, useEditor, useOutline } from "./store.js";
import { showToast, Toasts } from "./Toast.jsx";
import { DocumentAction, DocumentBar, graphMenuEntries, ProjectBar } from "./Toolbar.jsx";
import { liveSelection, TouchBar } from "./TouchBar.jsx";
import { useAutosave } from "./useAutosave.js";
import { useDialogs } from "./useDialogs.js";
import { useGraphCommands } from "./useGraphCommands.js";
import { useLayoutPrefs } from "./useLayoutPrefs.js";
import { useProjectActions } from "./useProjectActions.js";
import { SpecifierHints, VariablesPanel } from "./VariablesPanel.jsx";
import { Workspace } from "./Workspace.jsx";

/** Written as a code unit so the escape survives the JSX attribute. */
const SEP = String.fromCharCode(92);

/**
 * Asks the daemon which types the project's modules export. Best effort: a
 * daemon from before 0.30.0 has no answer, and the lists simply go without.
 */
function refreshTypes(): void {
	void api.exportedTypes().then(
		({ types, functions }) => {
			setProjectTypes(types);
			setProjectFunctions(functions ?? []);
		},
		() => {
			setProjectTypes([]);
			setProjectFunctions([]);
		},
	);
}

/**
 * Asks the daemon for the project's `.luaurc` files, so a specifier field can
 * offer the aliases somebody has already defined.
 *
 * Best effort and refreshed with the types: they change for the same reasons —
 * somebody edited a file — and a project with no `.luaurc` simply has none.
 */
function refreshAliases(): void {
	void api.luaurcFiles().then(
		({ files }) => setProjectAliases(files),
		() => setProjectAliases([]),
	);
}

/**
 * The page was opened on `#picker`: the docs' mark links here, and it opens
 * the editor with the projects panel up, as pressing the editor's own mark
 * does. That panel rather than the bare picker screen, because in the browser
 * build the panel is where the demos and your folders are.
 *
 * Read once when the module loads. The effect that tidies the address runs
 * twice in development, and the second run would find nothing to read.
 */
const OPENED_FOR_PICKER = typeof window !== "undefined" && window.location.hash === "#picker";

export function App() {
	const editor = useEditor();
	const documents = useDocuments();
	const outline = useOutline();
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [customNodes, setCustomNodes] = useState<NodeDef[]>([]);
	const [menu, setMenu] = useState<MenuAnchor | null>(null);
	/**
	 * Where a node picked from the picker would land, and whether it is open.
	 *
	 * A world position rather than a boolean: the picker is opened by a
	 * right-click on the canvas, and the node goes where that click was however
	 * long you spend looking through it.
	 */
	const [nodePicker, setNodePicker] = useState<{ x: number; y: number; from?: WireFrom } | null>(
		null,
	);
	// A wire dropped into the menu or the picker is still half-done: a graph
	// taken from disk now would take the pin it is waiting to land on.
	useEffect(() => {
		store.hold("menu", Boolean(menu?.from || nodePicker?.from));
	}, [menu, nodePicker]);
	/** The docs page the editor's Ctrl+K jumped to, opened in the docs window. */
	const [docsJump, setDocsJump] = useState(false);
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
	const {
		prefs,
		updatePrefs,
		revealPanel,
		onDockResize,
		onDockResizeEnd,
		onDockToggle,
		onLayout,
		onFramePanel,
		onFramePanelEnd,
	} = useLayoutPrefs();
	const [settingsOpen, setSettingsOpen] = useState(false);
	/**
	 * The node map, Luau file or `.luaurc` in front, if a graph is not. Each has
	 * a tab of its own, kept by the store beside the graphs'.
	 *
	 * A `.luaurc` carries every one in the project, because the open file
	 * inherits from the files above it and a name added here must not collide
	 * with one of those. They are read when it is opened rather than held, so
	 * the document cannot be showing a file somebody changed on disk half an
	 * hour ago.
	 */
	const aliasDoc = editor.side?.kind === "luaurc" ? editor.side.doc : null;
	const source = editor.side?.kind === "luau" ? editor.side.doc : null;
	const mapDoc = editor.side?.kind === "map" ? editor.side.doc : null;
	const layout = prefs.layout;

	/** The selection preview, which is opened deliberately and never sits open. */
	const [previewOpen, setPreviewOpen] = useState(false);
	const alignExec = prefs.alignExec;

	const [mapOutcomes, setMapOutcomes] = useState<MapOutcome[]>([]);
	// Generated files whose graph has moved or gone. Rojo cannot tell they are
	// stale, so it syncs them, and the same module turns up twice.
	const [orphans, setOrphans] = useState<string[]>([]);
	const [unsynced, setUnsynced] = useState<{ graph: string; folder: string }[]>([]);
	const [codeEdit, setCodeEdit] = useState<CodeEditState | null>(null);
	// The Inspector asks for the editor this way; see `codeEditRequests.ts`.
	useEffect(() => onCodeEditRequest(setCodeEdit), []);
	/**
	 * The folder a new graph or map goes into.
	 *
	 * Set by clicking anything in the tree — a folder is itself, a file is its
	 * parent — and shown in the dialog before anything is created, so it is
	 * never a hidden setting. `null` means the project's source root, which is
	 * where everything went before this existed.
	 */
	const [targetDir, setTargetDir] = useState<string | null>(null);
	/**
	 * What the Project panel shows when the project has a place: its files, or
	 * the place's instances. The browser stays mounted once opened, as the
	 * tree does, so switching back keeps what was open.
	 */
	const [projectView, setProjectView] = useState<"files" | "datamodel">("files");
	const [placeSeen, setPlaceSeen] = useState(false);
	/** The place instance the Properties panel shows; the panel is there only while one is. */
	const [placeInspect, setPlaceInspect] = useState<PlaceTarget | null>(null);
	/** A reference followed in Properties, for the browser to pick and show. */
	const [placeReveal, setPlaceReveal] = useState<{ index: number; seq: number } | null>(null);
	/** Slides a drawer out on a phone or a tablet: Properties, when it is asked for. */
	const [showDrawer, setShowDrawer] = useState<{ panel: PanelId; seq: number } | null>(null);

	/**
	 * Shows an instance's properties. Asked for outright -- a double-click or
	 * a double tap -- it also brings the panel out: its drawer on a tablet,
	 * and its dock back if that was collapsed.
	 */
	const onPlaceInspect = useCallback(
		(target: PlaceTarget | null, open: boolean) => {
			setPlaceInspect(target);
			if (!target || !open) return;
			setShowDrawer((prev) => ({ panel: "properties", seq: (prev?.seq ?? 0) + 1 }));
			revealPanel("properties");
		},
		[revealPanel],
	);
	const onPlacePick = useCallback((index: number) => {
		setPlaceReveal((prev) => ({ index, seq: (prev?.seq ?? 0) + 1 }));
	}, []);
	const onPlaceClose = useCallback(() => setPlaceInspect(null), []);
	// Another project's place numbers its instances differently.
	useEffect(() => setPlaceInspect(null), [project?.root]);
	// The folder from a previous session, when one is waiting on a click.
	const rememberedFolders = useRememberedFolders();
	// What this host can do, for the project actions in the panel's footer.
	// Hidden rather than disabled: a button that needs a different host is a
	// button with no action behind it to explain.
	const hostCanBrowse = useHostCan("browse");
	const hostCanReset = useHostCan("reset");
	const hostCanOpenFolder = useCanOpenDirectory();
	const hostCanImportZip = useCanImportZip();
	const zipInput = useRef<HTMLInputElement>(null);
	const hostCanImportPlace = useCanImportPlace();
	const placeInput = useRef<HTMLInputElement>(null);
	/**
	 * The introduction panel. No anchor: it is centred rather than dropped
	 * under the mark, because it is the same panel in all three windows and
	 * two of them have nothing to anchor it to.
	 */
	const [introOpen, setIntroOpen] = useState(OPENED_FOR_PICKER);
	// A file dropped on the canvas, once we know where it lives in the DataModel
	// and therefore what can usefully be made from it.
	const [dropMenu, setDropMenu] = useState<{
		screen: { x: number; y: number };
		world: { x: number; y: number };
		name: string;
		location: InstanceLocation;
	} | null>(null);

	const { dialog, dialogOpen, ask, notify } = useDialogs();

	/**
	 * Autosave's queue: one pending write per file, graphs and node maps alike.
	 * See `saveQueue.ts`.
	 *
	 * One for the life of the page, reading the pause and the failure handler
	 * through refs, so that changing either does not build a new queue and
	 * drop what the old one was holding.
	 */
	const autosaveMs = useRef(prefs.autosaveMs);
	autosaveMs.current = prefs.autosaveMs;
	const writeFailed = useRef<(error: Error) => void>(() => undefined);
	/** Whether the host compiles a graph when it sees it written: the daemon, in Dynamic mode. */
	const hostCompilesOnSave = useRef(false);
	const saves = useMemo(
		() =>
			new SaveQueue(
				() => autosaveMs.current,
				(error) => writeFailed.current(error),
			),
		[],
	);
	const [busy, setBusy] = useState<string | null>(null);
	// Deliberately in-memory rather than the system clipboard: a graph fragment
	// is not text, and round-tripping it through one would lose pin identity.
	const clipboard = useRef<Clipping | null>(null);
	/** Whether there is anything to paste, for the touch bar's Paste button. */
	const [hasClip, setHasClip] = useState(false);
	/**
	 * Where the pointer is over the canvas, in world coordinates.
	 *
	 * A ref rather than state: it changes on every mouse move and nothing
	 * renders from it — only `paste` reads it, once, when a key is pressed.
	 */
	const pointerAt = useRef<{ x: number; y: number } | null>(null);

	const registry = useMemo(() => createRegistry(customNodes), [customNodes]);
	/** How the node picker draws: the same settings the docs pictures follow. */
	const nodePreview = useMemo(() => previewFor(prefs, registry), [prefs, registry]);
	/**
	 * The documentation, for the editor's own Ctrl+K.
	 *
	 * Built here rather than in the docs window, which is a separate page: this
	 * is the index of what there is to jump *to*, and building it costs one walk
	 * of the site the first time somebody asks.
	 */
	const docsIndex = useMemo(
		() => buildSearchIndex(buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)))),
		[registry],
	);

	// The store needs it for the rules that resolve a node's pins -- see
	// `Store.apply`. Set here rather than passed to every edit, because every
	// edit goes through the store and none of them should have to remember.
	useEffect(() => {
		store.setRegistry(registry);
	}, [registry]);

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
	const withComments = project?.config.comments ?? true;
	const castsByHierarchy = project?.config.castsByHierarchy === true;
	// Deferred, because every pointer move of a drag is an edit: the canvas
	// renders each frame at once, and the compile catches up when React has a
	// moment, skipping the scripts it no longer needs.
	const compileSource = useDeferredValue(editor.script);
	const compiled = useMemo(
		() =>
			compileSource
				? compile(compileSource, registry, { indent, comments: withComments, castsByHierarchy })
				: null,
		[compileSource, registry, indent, withComments, castsByHierarchy],
	);
	const diagnostics: Diagnostic[] = compiled?.diagnostics ?? [];

	/** What `P` previews, and the function's name when that is a whole function. */
	const previewScope = useMemo(() => {
		if (!editor.script) return { selection: editor.selection, functionName: undefined };
		const selection = previewSelection(editor.script, editor.graph, editor.selection);
		const fn =
			selection === editor.selection
				? undefined
				: editor.script.nodes.find((n) => n.id === editor.graph);
		const functionName = fn ? functionNameOf(fn) : undefined;
		return { selection, functionName };
	}, [editor.script, editor.graph, editor.selection]);

	// -- project -----------------------------------------------------------

	/**
	 * Opens a project, and says whether it opened.
	 *
	 * The answer matters to the introduction panel, which lists projects from
	 * a previous session: a root that has since been deleted, renamed or -- in
	 * the browser build -- thrown away with the volume is still on that list,
	 * and the panel needs to know the open failed so it can offer to take it
	 * off rather than closing over a dialog that says only what went wrong.
	 */
	const loadProject = useCallback(
		async (root: string, init = false, quiet = false): Promise<boolean> => {
			setBusy("Opening project…");
			try {
				const info = init ? await api.initProject(root) : await api.openProject(root);
				api.setProjectRoot(info.root);
				setProject(info);
				/**
				 * Only where a root means something next time.
				 *
				 * The browser build's roots are *mount points* on its own volume —
				 * `/lune_test` for a folder whose real name is all the page is ever
				 * told. Between sessions that path means nothing: the folder is
				 * reached through the handle the browser kept, and the mount point
				 * is made again from its name. Remembering it produced a card that
				 * looked openable and was not.
				 */
				if (!IS_STATIC_HOST) remember(info.root);
				setCustomNodes((await api.customNodes()).custom);
				refreshTypes();
				refreshAliases();
				return true;
			} catch (err) {
				// `quiet` is the introduction panel, which stays open and says so on
				// the card itself, with the cross to take it off the list beside it.
				// A dialog as well would be the same news twice, over the top of the
				// one place the reader can act on it.
				if (!quiet) notify("Something went wrong", errorMessage(err));
				return false;
			} finally {
				setBusy(null);
			}
		},
		[],
	);

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
		async (root: string, quiet = false): Promise<boolean> => {
			try {
				await saves.flushAll();
				// Still dirty means an earlier write failed and nothing is
				// queued for it any more: one more try before closing it.
				for (const { path, script } of store.unsaved()) {
					await api.writeScript(path, script);
				}
				for (const map of store.unsavedMaps()) await api.writeMap(map.path, map.map);
			} catch (err) {
				notify(
					"Staying where we are",
					`Something still had unsaved changes and they could not be written: ${errorMessage(
						err,
					)}. Nothing was closed and the project has not changed.`,
				);
				return false;
			}

			store.closeAll();
			return loadProject(root, false, quiet);
		},
		[loadProject, notify, saves],
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
				label: `This machine has no folder dialog (${errorMessage(err)})`,
				icon: "folderOpen",
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
			await loadProject(chosen, true);
			return;
		}
		await switchProject(chosen);
	}, [ask, loadProject, notify, switchProject]);

	useEffect(() => {
		// The daemon wins over the remembered path: if it was started with
		// `roswaal serve` in a directory, that is the project the developer meant.
		void (async () => {
			// Taken off the address once read, or every reload would open the
			// projects panel again. See `OPENED_FOR_PICKER`.
			if (OPENED_FOR_PICKER) {
				history.replaceState(null, "", window.location.pathname + window.location.search);
			}
			try {
				const existing = await api.currentProject();
				if (existing.open) {
					api.setProjectRoot(existing.root);
					setProject(existing);
					// Guarded for the reason `loadProject` is: the browser build's
					// roots are mount points on its own volume, and the playground
					// always has one open — so every load was putting `/demo` on
					// the recent list, which is not a project anybody chose.
					if (!IS_STATIC_HOST) remember(existing.root);
					setCustomNodes((await api.customNodes()).custom);
					refreshTypes();
					refreshAliases();
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
			const last = lastProject();
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
		const stream = openEventStream();

		// Only the daemon's stream says it is ready, and the daemon watches the
		// graphs: in Dynamic mode it compiles each saved file itself.
		stream.addEventListener("ready", () => {
			hostCompilesOnSave.current = true;
		});

		stream.addEventListener("hot", (event) => {
			const detail = JSON.parse((event as MessageEvent).data) as {
				type: string;
				path: string;
				outcome?: CompileOutcome;
				message?: string;
			};
			if (detail.outcome) setOutcomes([detail.outcome]);
			void api.tree().then(({ tree, place }) => setProject((p) => (p ? { ...p, tree, place } : p)));
			refreshTypes();
			refreshAliases();
			void followDiskRef.current(detail.type, detail.path);
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
		const { tree, place } = await api.tree();
		setProject((p) => (p ? { ...p, tree, place } : p));
		// Asked here rather than only after a compile. Renaming, moving and
		// deleting all change what is stale, and none of them compiles anything —
		// so the count went on describing whatever the last compile saw.
		const stale = await api.orphans().catch(() => ({ orphans: [], unsynced: [] }));
		setOrphans(stale.orphans);
		setUnsynced(stale.unsynced ?? []);
		refreshTypes();
		refreshAliases();
	}, []);

	// -- documents ---------------------------------------------------------

	/** The directory a file is in, project-relative. */
	const dirOf = (filePath: string) => filePath.split("/").slice(0, -1).join("/");

	const openEntry = useCallback(async (entry: TreeEntry): Promise<void> => {
		// A package listed under wally.toml opens the module a require of it reaches.
		if (entry.kind === "package") {
			if (entry.target)
				return openEntry({
					path: entry.target,
					name: entry.target.split("/").pop()!,
					kind: "luau",
				});
			return;
		}
		if (entry.kind === "wally") return;
		// Each opens in a tab of its own, beside the graphs, and leaves them open.
		if (entry.kind === "luaurc") {
			const { files } = await api.luaurcFiles();
			store.openSide({ kind: "luaurc", doc: { dir: dirOf(entry.path), files } });
			return;
		}
		if (entry.kind === "luau") {
			const { text } = await api.readSource(entry.path);
			store.openSide({
				kind: "luau",
				doc: { path: entry.path, text, generatedFrom: entry.generatedFrom },
			});
			return;
		}
		if (entry.kind === "nodemap") {
			const { map } = await api.readMap(entry.path);
			store.openSide({ kind: "map", doc: { path: entry.path, map, dirty: false } });
			return;
		}
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
	const openGraphPath = useCallback(
		async (path: string) => {
			try {
				if (store.showGraph(path)) return;
				const { script } = await api.readScript(path);
				store.open(path, script);
			} catch (err) {
				notify("Could not open that graph", errorMessage(err));
			}
		},
		[notify],
	);

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
			// Every write still waiting is for the project that has gone.
			saves.drop("");
			store.closeAll();
			notify(
				"The daemon moved to another project",
				`${err.message} Nothing was written to either project.`,
			);
			if (err.root) await loadProject(err.root);
		},
		[notify, loadProject, saves],
	);

	/** Reports a failed write, telling a moved project apart from a real error. */
	const onWriteFailed = useCallback(
		(err: Error) => {
			if (err instanceof ProjectChangedError) void onProjectChanged(err);
			// A notice rather than a window: a save that fails while you work
			// should not stop the work. The full error is a click away.
			else {
				showToast({
					title: "Could not save",
					detail: "Click for details",
					tone: "warn",
					onClick: () => notify("Could not save", err.message),
				});
			}
		},
		[notify, onProjectChanged],
	);

	writeFailed.current = onWriteFailed;

	// -- compiling ---------------------------------------------------------

	// Defined further down, by the project actions; read through refs so the
	// compile can follow a moved folder and ask again with the answer.
	const followMoveRef = useRef<((from: string, to: string) => Promise<void>) | null>(null);
	const runCompileMapRef = useRef<
		((path: string | undefined, force?: boolean, merge?: boolean) => Promise<void>) | null
	>(null);

	const runCompileMap = useCallback(
		async (path: string | undefined, force = false, merge = false): Promise<void> => {
			setBusy("Writing project file…");
			try {
				// A folder may move under the open graphs: what they hold has to
				// be on disk first, or a late autosave writes them back where
				// they were.
				await saves.flushAll();
				for (const { path: open, script } of store.unsaved()) await api.writeScript(open, script);
				const { results } = await api.compileMap({ path, write: true, force, merge });
				setMapOutcomes(results);
				setStatusOpen(true);
				// The tabs and the open file follow a folder that moved.
				for (const move of results.flatMap((r) => r.moved ?? [])) {
					await followMoveRef.current?.(move.graphsFrom, move.graphsTo);
					await followMoveRef.current?.(move.from, move.to);
				}
				await refreshTree();
				const moved = results.flatMap((r) => r.moved ?? []);
				if (moved.length > 0) {
					const kept = moved.reduce((n, m) => n + m.kept.length, 0);
					showToast({
						title:
							moved.length === 1
								? `Moved ${moved[0].name} to ${moved[0].to}`
								: `Moved ${moved.length} folders to their new paths`,
						detail:
							kept > 0
								? `${kept} file${kept === 1 ? "" : "s"} stayed behind: see Script analysis`
								: "With its graphs, recompiled there",
						icon: "folderOpen",
						tone: kept > 0 ? "warn" : "ok",
					});
				}
				// The new folder had files: moving into it is a decision.
				const held = results.flatMap((r) => r.held ?? []);
				if (held.length > 0 && !merge) {
					const ok = await ask({
						kind: "confirm",
						title: "Move into a folder that has files?",
						message:
							"These map entries point at folders that already hold files. Moving puts the old " +
							"folder's files beside them; a file whose name is already there stays where it was.",
						items: held.map((h) => `${h.name}: ${h.from}/ → ${h.to}/`),
						confirmLabel: "Move",
					});
					if (ok === true) {
						await runCompileMapRef.current?.(path, force, true);
						return;
					}
				}
				const one = path && results.length === 1 ? results[0] : undefined;
				if (moved.length > 0) {
					// Said by the toast above.
				} else if (one?.written) {
					const made = one.made?.length ?? 0;
					showToast({
						title: `Wrote ${one.outputPath}`,
						detail: made > 0 ? `Made ${made} folder${made === 1 ? "" : "s"} it syncs` : undefined,
						icon: "build",
						tone: "ok",
					});
				} else if (one?.skipped) {
					showToast({ title: "Not written", detail: one.skipped, tone: "warn" });
				}
			} catch (err) {
				notify("Something went wrong", errorMessage(err));
			} finally {
				setBusy(null);
			}
		},
		[refreshTree, saves, ask],
	);

	runCompileMapRef.current = runCompileMap;

	const runCompile = useCallback(
		async (path: string | undefined, write: boolean, force = false) => {
			setBusy(write ? "Compiling…" : "Checking…");
			setCompiling(true);
			try {
				const { results } = await api.compile({ path, write, force });
				setOutcomes(results);
				setStatusOpen(true);
				if (write) await refreshTree();
				// One graph compiled: say what it wrote, where you are looking.
				// A project's compile has its own progress toast.
				const one = path && write && results.length === 1 ? results[0] : undefined;
				if (one?.written) {
					const name =
						(path ?? "")
							.split("/")
							.pop()
							?.replace(/\.nodescript$/, "") ?? "";
					showToast({
						title: `Compiled ${name}`,
						detail: one.outputPath,
						icon: "build",
						tone: "ok",
					});
				} else if (one?.skipped) {
					showToast({ title: "Not written", detail: one.skipped, tone: "warn" });
				}
			} catch (err) {
				notify("Something went wrong", errorMessage(err));
			} finally {
				setBusy(null);
				setCompiling(false);
			}
		},
		[refreshTree],
	);

	/**
	 * Overwriting a file Roswaal did not write, after showing what changes.
	 *
	 * The file is somebody's own work until this point, and an imported graph
	 * is the usual way here, so what the graph would write is put beside what
	 * is there first. A file that cannot be read has nothing to show, and is
	 * still asked about.
	 */
	const overwriteWith = useCallback(
		async (outcome: CompileOutcome) => {
			let current: string | undefined;
			try {
				current = (await api.readSource(outcome.outputPath)).text;
			} catch {
				current = undefined;
			}
			const diff = current === undefined ? [] : diffLines(current, outcome.code);
			const changed = diff.filter((d) => d.kind !== "same").length;
			const ok = await ask({
				kind: "confirm",
				title: `Overwrite ${outcome.outputPath}?`,
				message:
					current === undefined
						? "Roswaal did not write this file. Compiling replaces it with the graph's output."
						: changed === 0
							? "Roswaal did not write this file, but the graph writes the same lines. Overwriting takes it over."
							: `Roswaal did not write this file. ${changed} line${changed === 1 ? "" : "s"} change:`,
				diff: shownLines(diff),
				confirmLabel: "Overwrite",
				danger: true,
			});
			if (ok === true) await runCompile(outcome.scriptPath, true, true);
		},
		[ask, runCompile],
	);

	/**
	 * Writes `roswaal.json` and takes the daemon's answer as the truth.
	 *
	 * A rejection used to be an unhandled promise, which was survivable while
	 * the only caller was a two-position toggle that could not really fail. The
	 * settings panel writes paths, and a path the daemon refuses has to say so —
	 * otherwise the field goes on showing the value that was not saved.
	 */
	const setConfig = useCallback(
		async (patch: Partial<RoswaalConfig>) => {
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
				else notify("That setting was not saved", errorMessage(err));
			}
		},
		[project, refreshTree, notify, onProjectChanged],
	);

	const { writeGraph, followDiskRef } = useAutosave({
		saves,
		project,
		ask,
		notify,
		onWriteFailed,
		runCompile,
		hostCompilesOnSave,
		onMapCompiled: setMapOutcomes,
	});

	const {
		locked,
		presets,
		promotePin,
		realign,
		spawn,
		spawnComment,
		splitOrRecombine,
		toggleAlignExec,
	} = useGraphCommands({
		editor,
		project,
		registry,
		prefs,
		updatePrefs,
		ask,
		dialogOpen,
		clipboard,
		setHasClip,
		pointerAt,
		menu,
		setMenu,
		setPreviewOpen,
		setDocsJump,
		compiling,
		runCompile,
		runCompileMap,
		source,
		mapDoc,
	});

	const {
		createGraphIn,
		createMapIn,
		importLuauFile,
		exportOpen,
		importPlace,
		importRojo,
		importZip,
		inDir,
		onPackageZip,
		onPlaceOpenFile,
		onTreeDelete,
		onTreeMove,
		onTreeNewFolder,
		onTreeOpen,
		onTreeOpenFunction,
		onTreePackage,
		onTreeRename,
		onTreeReveal,
		openFolder,
		packageZipInput,
		placeGraphFor,
		reopenFolder,
		resetProject,
		setExportOpen,
		followMove,
	} = useProjectActions({
		project,
		ask,
		notify,
		saves,
		writeGraph,
		loadProject,
		refreshTree,
		openEntry,
		setIntroOpen,
	});

	followMoveRef.current = followMove;

	// -- render ------------------------------------------------------------

	if (!project) return <ProjectPicker onOpen={loadProject} busy={busy} />;

	// A graph is what the centre shows: not a node map, a source file or aliases.
	const graphOpen = !source && !mapDoc && !aliasDoc && editor.script !== null;
	const showInspector = graphOpen && editor.selection.size === 1;
	// Add node, from the graph's tools: the palette, at the middle of the view.
	const addNodeAtCentre = () => {
		const view = store.getView();
		setMenu({
			screen: { x: 320, y: 120 },
			world: { x: (400 - view.x) / view.zoom, y: (240 - view.y) / view.zoom },
		});
	};
	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const warningCount = diagnostics.length - errorCount;

	return (
		<div className="app">
			{/* Above everything, including the toolbar: a build that may be
			    halfway through an idea says so before you start working in it. */}
			<SiteBanner />
			{/* One list, at the root, because a `<datalist>` has to be in the
			    document for every field that names it — and the fields that do
			    are in two panels and on the canvas. */}
			<SpecifierHints />

			{/* Rendered here rather than in the overlay stack: it is about the
			    project, not about the graph, and Overlays takes the script. It
			    is `position: fixed`, so where it sits in the tree is invisible. */}
			{introOpen && (
				<IntroPanel
					surface="editor"
					current={project.root}
					onOpen={(root) => switchProject(root, true)}
					folders={rememberedFolders}
					onOpenFolder={reopenFolder}
					onForget={forget}
					onHome={() => {
						if (IS_STATIC_HOST) void openHome();
						else setProject(null);
					}}
					onClose={() => setIntroOpen(false)}
					actions={
						<>
							{/* One button for what can be done to the project, so the
						    footer is Home, Project, and the other two windows. */}
							<MenuButton
								label="Project"
								title="Open, export or start again"
								side="above"
								sections={[
									{
										entries: [
											hostCanBrowse && {
												label: "Browse…",
												icon: "folderOpen",
												run: () => void browseForProject(),
											},
											hostCanOpenFolder && {
												label: "Open folder…",
												icon: "folder",
												run: () => void openFolder(),
											},
											hostCanImportZip && {
												label: "Open .zip…",
												icon: "folderOpen",
												run: () => zipInput.current?.click(),
											},
											hostCanImportPlace && {
												label: "Open place…",
												icon: "folderOpen",
												run: () => placeInput.current?.click(),
											},
										],
									},
									{
										// Into the project, and out of it.
										entries: [
											{ label: "Import Rojo project…", icon: "map", run: () => void importRojo() },
											{ label: "Export…", icon: "copy", run: () => setExportOpen(true) },
										],
									},
									{
										entries: [
											hostCanReset && {
												label: "Start again",
												icon: "refresh",
												run: () => void resetProject(),
											},
										],
									},
								]}
							/>
							{/* Outside the menu, which closes on the tap that opens
						    the picker; the input has to outlast it. */}
							{hostCanImportPlace && (
								<input
									ref={placeInput}
									type="file"
									accept=".rbxl,.rbxlx,application/octet-stream"
									hidden
									onChange={(event) => {
										const file = event.target.files?.[0];
										event.target.value = "";
										if (file) void importPlace(file);
									}}
								/>
							)}
							{hostCanImportZip && (
								<input
									ref={zipInput}
									type="file"
									accept=".zip,application/zip"
									hidden
									onChange={(event) => {
										const file = event.target.files?.[0];
										// Cleared, so picking the same zip again is a change.
										event.target.value = "";
										if (file) void importZip(file);
									}}
								/>
							)}
						</>
					}
				/>
			)}

			<Workspace
				layout={layout}
				chrome={
					<ProjectBar
						config={project.config}
						busy={busy}
						document={
							<>
								{/* The open documents: the active one's name, the others
								    beside it while there is room, and a list of all of them.
								    Graphs, functions, node maps, Luau and .luaurc alike. */}
								<GraphTabs
									documents={documents}
									functionTabs={prefs.functionTabs}
									onActivate={(key) => store.activate(key)}
									onClose={(key) => store.closeDocument(key)}
									onReorder={(key, before) => store.reorder(key, before)}
								/>
								{mapDoc ? (
									<DocumentBar kind="map" name={mapDoc.map.name} dirty={mapDoc.dirty} />
								) : graphOpen ? (
									<DocumentBar
										kind="graph"
										locked={locked}
										alignExec={alignExec}
										selected={editor.selection.size}
										inFunction={editor.graph !== null}
										onAddNode={addNodeAtCentre}
										onRealign={realign}
										onToggleAlignExec={toggleAlignExec}
										onPreview={() => setPreviewOpen(true)}
									/>
								) : null}
							</>
						}
						action={
							mapDoc ? (
								<DocumentAction
									kind="map"
									busy={busy}
									hasPath
									onCompile={() => void runCompileMap(mapDoc.path)}
								/>
							) : graphOpen ? (
								<DocumentAction
									kind="graph"
									busy={busy}
									hasPath={editor.path !== null}
									onCompile={() => {
										if (editor.path) void runCompile(editor.path, true);
									}}
								/>
							) : undefined
						}
						phoneMenu={
							graphOpen
								? graphMenuEntries({
										locked,
										alignExec,
										onAddNode: addNodeAtCentre,
										onRealign: realign,
										onToggleAlignExec: toggleAlignExec,
										onPreview: () => setPreviewOpen(true),
									})
								: undefined
						}
						onRefresh={() => void refreshTree()}
						onNewGraph={() => void createGraphIn(inDir(targetDir))}
						onNewMap={() => void createMapIn(inDir(targetDir))}
						onCompileMode={(mode) => void setConfig({ compileMode: mode })}
						onCompileProject={async () => {
							// Maps first: a folder that moves takes its graphs with it,
							// and they then compile where they are going to stay.
							await runCompileMap(undefined);
							await runCompile(undefined, true);
						}}
						onOpenDocs={() => void openPage("docs")}
						onOpenDesigner={() => void openPage("designer")}
						onOpenSettings={() => setSettingsOpen(true)}
						onOpenIntro={() => setIntroOpen(true)}
					/>
				}
				strip={
					graphOpen && editor.script ? (
						<CanvasStrip
							script={editor.script}
							graph={editor.graph}
							registry={registry}
							wide={prefs.wideNodes}
						/>
					) : undefined
				}
				drawerKey={`${editor.path}|${editor.graph}|${source?.path}|${mapDoc?.path}|${aliasDoc ? "alias" : ""}`}
				showDrawer={showDrawer}
				touchBar={
					editor.script && !source && !mapDoc && !aliasDoc ? (
						<TouchBar
							selected={liveSelection(editor.script, editor.selection)}
							canPaste={hasClip}
							locked={locked}
							labels={prefs.actionLabels}
							style={prefs.actionRow}
						/>
					) : undefined
				}
				onResize={onDockResize}
				onResizeEnd={onDockResizeEnd}
				onToggle={onDockToggle}
				onLayout={onLayout}
				onFramePanel={onFramePanel}
				onFramePanelEnd={onFramePanelEnd}
				contents={{
					tree: (
						<>
							{/* The project's name beside the card's title, the switch at the
							    header's end, so the tree keeps its height on a phone. */}
							<PanelHead sub={project.root.split(/[\\/]/).pop()}>
								{project.place && (
									<span className="segmented project-views">
										<button
											className={projectView === "files" ? "on" : ""}
											onClick={() => setProjectView("files")}
										>
											Files
										</button>
										<button
											className={projectView === "datamodel" ? "on" : ""}
											title={`The instances in ${project.place}`}
											onClick={() => {
												setProjectView("datamodel");
												setPlaceSeen(true);
											}}
										>
											DataModel
										</button>
									</span>
								)}
							</PanelHead>
							{project.place && placeSeen && (
								<div className="project-view" hidden={projectView !== "datamodel"}>
									<PlaceBrowser
										file={project.place}
										refreshKey={project.tree}
										onInspect={onPlaceInspect}
										inspecting={placeInspect?.index ?? null}
										reveal={placeReveal}
									/>
								</div>
							)}
							<div
								className="project-view"
								hidden={Boolean(project.place) && projectView === "datamodel"}
							>
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
									onImport={importLuauFile}
									onTargetDir={setTargetDir}
									onNewGraph={createGraphIn}
									onNewMap={createMapIn}
									onNewFolder={onTreeNewFolder}
									onRename={onTreeRename}
									onDelete={onTreeDelete}
									onPackage={onTreePackage}
								/>
								<input
									ref={packageZipInput}
									type="file"
									accept=".zip,application/zip"
									hidden
									onChange={(event) => {
										const file = event.target.files?.[0];
										event.target.value = "";
										if (file) void onPackageZip(file);
									}}
								/>
							</div>
						</>
					),
					variables:
						editor.script && !source && !mapDoc ? (
							<VariablesPanel
								locked={locked}
								script={editor.script}
								graph={editor.graph}
								selection={editor.selection}
								registry={registry}
								confirm={async (title, message, confirmLabel) =>
									(await ask({ kind: "confirm", title, message, confirmLabel, danger: true })) ===
									true
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
						) : graphOpen && editor.script ? (
							<GraphSettings
								name={editor.script.name}
								scriptClass={editor.script.scriptClass}
								target={editor.script.target}
								typecheck={editor.script.typecheck}
								locked={locked}
								nodes={editor.script.nodes.length}
								functions={editor.script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).length}
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
							/>
						) : undefined,
					properties:
						project.place && placeInspect ? (
							<PlaceProperties
								target={placeInspect}
								onPick={onPlacePick}
								onOpenFile={onPlaceOpenFile}
								graphFor={placeGraphFor}
								onClose={onPlaceClose}
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
							unsynced={unsynced}
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
							onForce={(outcome) => void overwriteWith(outcome)}
						/>
					),
				}}
				floating={
					<>
						<CompileToast progress={progress} />
					</>
				}
				centre={
					<>
						<div className="centre-body">
							{aliasDoc ? (
								<AliasDocument
									key={aliasDoc.dir}
									dir={aliasDoc.dir}
									files={aliasDoc.files}
									target={project.config.target}
									onWrite={(dir, text) => {
										void api.writeLuaurc(dir, text).then(
											(written) => {
												const side = { kind: "luaurc", doc: aliasDoc } as const;
												store.updateSide(sideKey(side), () => ({
													kind: "luaurc",
													doc: { dir: aliasDoc.dir, files: written.files },
												}));
											},
											(err: unknown) => notify("The .luaurc was not written", errorMessage(err)),
										);
									}}
								/>
							) : mapDoc ? (
								<MapEditor
									key={mapDoc.path}
									map={mapDoc.map}
									dirty={mapDoc.dirty}
									tree={project.tree}
									outDir={project.config.outDir}
									onChange={(next) => store.editMap(mapDoc.path, next)}
								/>
							) : source ? (
								<SourceView
									key={source.path}
									doc={source}
									onOpenGraph={(path) => void openGraphPath(path)}
									onEdit={async (path) => {
										try {
											const { editor: found } = await api.openInEditor(path);
											notify("Handed over", `Opened ${path.split("/").pop()} in ${found}.`);
										} catch (err) {
											notify("Could not open it", errorMessage(err));
										}
									}}
									onReveal={(path) => void api.reveal(path)}
								/>
							) : editor.script ? (
								<>
									<Canvas
										script={editor.script}
										graph={editor.graph}
										registry={registry}
										diagnostics={diagnostics}
										locked={locked}
										onPointerAt={(world) => {
											pointerAt.current = world;
										}}
										wireStyle={prefs.wireStyle}
										wheel={wheelAction(prefs.wheel)}
										wideNodes={prefs.wideNodes}
										onRequestMenu={(screen, world, from) => setMenu({ screen, world, from })}
										onRequestNodePicker={(world, from) => setNodePicker({ ...world, from })}
										onDropNode={(defId, config, world, member) => {
											const def = registry.get(defId);
											if (def) spawn(def, world, config, undefined, member);
											setNodePicker(null);
										}}
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
												notify("Could not resolve that file", errorMessage(err));
											}
										}}
									/>
								</>
							) : (
								<div className="placeholder">
									<h1>No graph open</h1>
									<p>
										Double-click a <code>.nodescript</code> in the tree, or make a new one.
									</p>
								</div>
							)}
						</div>
					</>
				}
			/>

			{/* Ctrl and the right mouse button, on the canvas: the same question as
			    the palette, asked by looking rather than by name. */}
			{nodePicker && editor.script && (
				<NodePicker
					registry={registry}
					target={editor.script.target}
					// The same entries the node menu offers, scoped the same way --
					// a function's parameters inside its own body and nowhere else.
					// Built once above, so the two searches cannot disagree about
					// what this graph has.
					presets={presets}
					preview={nodePreview}
					onPick={(def, config, member) => {
						spawn(def, nodePicker, config, undefined, member, nodePicker.from);
						setNodePicker(null);
					}}
					onClose={() => setNodePicker(null)}
				/>
			)}

			{/* Ctrl+K here jumps to a documentation page, the way it searches them
			    in the docs window. Picking one opens that window on it. */}
			{docsJump && (
				<DocsSearch
					index={docsIndex}
					recent={[]}
					onPick={(slug) => {
						void openPage("docs", slug);
						setDocsJump(false);
					}}
					onClose={() => setDocsJump(false)}
				/>
			)}

			{exportOpen && <ExportMenu onClose={() => setExportOpen(false)} onError={notify} />}

			<Toasts />

			<Overlays
				registry={registry}
				script={editor.script}
				graphPath={editor.path}
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
				onMenuPick={(def, config, literals, member) =>
					menu && spawn(def, menu.world, config, literals, member)
				}
				onAddComment={() => menu && spawnComment(menu.world)}
				onMenuClose={() => setMenu(null)}
				pinMenu={pinMenu}
				onPromote={() => pinMenu && promotePin(pinMenu)}
				onBreakLinks={() =>
					pinMenu &&
					store.edit((s) =>
						disconnectPin(s, pinMenu.nodeId, pinMenu.pin.id, pinMenu.side, registry),
					)
				}
				onSplit={(mode) => pinMenu && void splitOrRecombine(pinMenu, undefined, mode)}
				onRecombine={(parent) => pinMenu && void splitOrRecombine(pinMenu, parent, undefined)}
				onPinMenuClose={() => setPinMenu(null)}
				preview={previewOpen && compiled ? compiled : null}
				onPreviewClose={() => setPreviewOpen(false)}
				settings={settingsOpen ? { root: project.root, config: project.config, prefs } : null}
				onConfig={(patch) => void setConfig(patch)}
				onPrefs={updatePrefs}
				onSettingsClose={() => setSettingsOpen(false)}
				dialog={dialog}
				codeEdit={codeEdit}
				onCodeCommit={(next) => {
					if (!codeEdit) return;
					const { nodeId, pin, field } = codeEdit;
					if (field) store.edit((s) => setNodeConfig(s, nodeId, { [field]: next }));
					else if (pin) store.edit((s) => setLiteral(s, nodeId, pin.id, { t: "raw", v: next }));
					setCodeEdit(null);
				}}
				onCodeClose={() => setCodeEdit(null)}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
