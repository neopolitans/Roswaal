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
import { createRegistry } from "../core/nodes/index.js";
import type { NodeDef, RoswaalConfig, ScriptClass } from "../core/schema.js";
import { api, type CompileOutcome, type ProjectInfo, type TreeEntry } from "./api.js";
import { Canvas } from "./Canvas.jsx";
import { NodeMenu, type MenuAnchor } from "./NodeMenu.jsx";
import { Inspector } from "./Inspector.jsx";
import { ProjectTree } from "./ProjectTree.jsx";
import {
	addComment, addNode, copySelection, deleteSelection, pasteClipping, type Clipping,
} from "./edits.js";
import { store, useEditor } from "./store.js";

const LAST_PROJECT_KEY = "roswaal.lastProject";
/** Written as a code unit so the escape survives the JSX attribute. */
const SEP = String.fromCharCode(92);
const AUTOSAVE_MS = 600;

export function App() {
	const editor = useEditor();
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [customNodes, setCustomNodes] = useState<NodeDef[]>([]);
	const [menu, setMenu] = useState<MenuAnchor | null>(null);
	const [outcomes, setOutcomes] = useState<CompileOutcome[]>([]);
	const [statusOpen, setStatusOpen] = useState(true);
	const [source, setSource] = useState<{ path: string; text: string } | null>(null);
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
			setProject(info);
			localStorage.setItem(LAST_PROJECT_KEY, info.root);
			setCustomNodes((await api.customNodes()).custom);
		} catch (err) {
			window.alert((err as Error).message);
		} finally {
			setBusy(null);
		}
	}, []);

	useEffect(() => {
		const last = localStorage.getItem(LAST_PROJECT_KEY);
		if (last) void loadProject(last);
	}, [loadProject]);

	// Hot reload events, so a compile triggered by a branch switch or another
	// editor shows up here rather than leaving the tree stale.
	useEffect(() => {
		if (!project || project.config.compileMode !== "hot") return;
		const stream = new EventSource("/api/events");
		stream.addEventListener("hot", (event) => {
			const detail = JSON.parse((event as MessageEvent).data) as {
				type: string; path: string; outcome?: CompileOutcome; message?: string;
			};
			if (detail.outcome) setOutcomes([detail.outcome]);
			void api.tree().then(({ tree }) => setProject((p) => (p ? { ...p, tree } : p)));
		});
		return () => stream.close();
	}, [project?.root, project?.config.compileMode]);

	const refreshTree = useCallback(async () => {
		const { tree } = await api.tree();
		setProject((p) => (p ? { ...p, tree } : p));
	}, []);

	// -- documents ---------------------------------------------------------

	const openEntry = useCallback(async (entry: TreeEntry) => {
		if (entry.kind === "luau") {
			setSource({ path: entry.path, text: (await api.readSource(entry.path)).text });
			return;
		}
		setSource(null);
		const { script } = await api.readScript(entry.path);
		store.open(entry.path, script);
	}, []);

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
				(err: Error) => window.alert(`Could not save: ${err.message}`),
			);
		}, AUTOSAVE_MS);
		return () => {
			if (saveTimer.current) window.clearTimeout(saveTimer.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor.dirty, editor.path, editor.script, project?.config.compileMode]);

	// -- compiling ---------------------------------------------------------

	const runCompile = useCallback(
		async (path: string | undefined, write: boolean, force = false) => {
			setBusy(write ? "Compiling…" : "Checking…");
			try {
				const { results } = await api.compile({ path, write, force });
				setOutcomes(results);
				setStatusOpen(true);
				if (write) await refreshTree();
			} catch (err) {
				window.alert((err as Error).message);
			} finally {
				setBusy(null);
			}
		},
		[refreshTree],
	);

	const setConfig = useCallback(async (patch: Partial<RoswaalConfig>) => {
		if (!project) return;
		const config = { ...project.config, ...patch };
		await api.saveConfig(config);
		setProject({ ...project, config });
	}, [project]);

	// -- canvas actions ----------------------------------------------------

	const spawn = useCallback(
		(def: NodeDef, world: { x: number; y: number }) => {
			store.edit((s) => {
				const { script, id } = addNode(s, def, world.x, world.y);
				queueMicrotask(() => store.select([id]));
				return script;
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

	// -- keyboard ----------------------------------------------------------

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
				return;
			}
			const mod = e.ctrlKey || e.metaKey;

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
	}, [editor.path, runCompile, spawnComment]);

	// -- render ------------------------------------------------------------

	if (!project) return <ProjectPicker onOpen={loadProject} busy={busy} />;

	const showInspector = !source && editor.script !== null && editor.selection.size === 1;
	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const warningCount = diagnostics.length - errorCount;

	return (
		<div className="app">
			<div className="toolbar">
				<span className="brand">ROSWAAL</span>
				<button className="tb" onClick={() => void refreshTree()}>Refresh</button>
				<button
					className="tb"
					disabled={!editor.script}
					title="Add a node at the centre of the view"
					onClick={() => {
						const view = store.getSnapshot().view;
						setMenu({
							screen: { x: 320, y: 120 },
							world: { x: (400 - view.x) / view.zoom, y: (240 - view.y) / view.zoom },
						});
					}}
				>
					Add node
				</button>
				<button
					className="tb"
					onClick={async () => {
						const name = window.prompt("Name for the new graph", "Untitled");
						if (!name) return;
						const created = await api.createScript(project.config.sourceDir, name, "Script");
						await refreshTree();
						store.open(created.path, created.script);
						setSource(null);
					}}
				>
					New graph
				</button>

				{editor.script && (
					<>
						<span className={`doc-name${editor.dirty ? " dirty" : ""}`}>{editor.script.name}</span>
						<select
							className="tb"
							value={editor.script.scriptClass}
							onChange={(e) =>
								store.edit((s) => ({ ...s, scriptClass: e.target.value as ScriptClass }))
							}
						>
							<option>Script</option>
							<option>LocalScript</option>
							<option>ModuleScript</option>
						</select>
						<label className="tb" style={{ cursor: "pointer" }}>
							<input
								type="checkbox"
								checked={editor.script.strict}
								onChange={(e) => store.edit((s) => ({ ...s, strict: e.target.checked }))}
							/>{" "}
							strict
						</label>
					</>
				)}

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
					className="tb primary"
					disabled={!editor.path || busy !== null}
					onClick={() => editor.path && void runCompile(editor.path, true)}
				>
					Compile script
				</button>
				<button
					className="tb"
					disabled={busy !== null}
					onClick={() => void runCompile(undefined, true)}
				>
					Compile project
				</button>
			</div>

			<div className={`workspace${showInspector ? " with-inspector" : ""}`}>
				<div className="sidebar">
					<h2>{project.root.split(/[\\/]/).pop()}</h2>
					<ProjectTree
						tree={project.tree}
						openPath={editor.path ?? source?.path ?? null}
						onOpen={(entry) => void openEntry(entry)}
						onMove={async (from, toDir) => {
							for (const path of from) await api.moveScript(path, toDir);
							await refreshTree();
						}}
					/>
				</div>

				{source ? (
					<pre className="source-view">{source.text}</pre>
				) : editor.script ? (
					<Canvas
						script={editor.script}
						registry={registry}
						diagnostics={diagnostics}
						onRequestMenu={(screen, world) => setMenu({ screen, world })}
					/>
				) : (
					<div className="placeholder">
						<h1>No graph open</h1>
						<p>Double-click a <code>.nodescript</code> in the tree, or make a new one.</p>
					</div>
				)}

				{showInspector && editor.script && (
					<Inspector
						script={editor.script}
						registry={registry}
						selection={editor.selection}
					/>
				)}
			</div>

			<StatusPanel
				open={statusOpen}
				onToggle={() => setStatusOpen((v) => !v)}
				busy={busy}
				errorCount={errorCount}
				warningCount={warningCount}
				diagnostics={diagnostics}
				outcomes={outcomes}
				packErrors={project.packErrors}
				onForce={(path) => void runCompile(path, true, true)}
			/>

			{menu && editor.script && (
				<NodeMenu
					anchor={menu}
					registry={registry}
					target={editor.script.target}
					onPick={(def) => spawn(def, menu.world)}
					onAddComment={() => spawnComment(menu.world)}
					onClose={() => setMenu(null)}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------

function ProjectPicker({
	onOpen, busy,
}: { onOpen: (root: string, init?: boolean) => void; busy: string | null }) {
	const [root, setRoot] = useState("");
	return (
		<div className="placeholder">
			<h1>Roswaal</h1>
			<p>Open a Roblox or Lune repository. Roswaal writes Luau into it; Rojo does the rest.</p>
			<div className="row">
				<input
					className="tb"
					style={{ width: 420, cursor: "text" }}
					placeholder={"C:" + SEP + "path" + SEP + "to" + SEP + "project"}
					value={root}
					onChange={(e) => setRoot(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && root && onOpen(root)}
				/>
				<button className="tb primary" disabled={!root || !!busy} onClick={() => onOpen(root)}>
					Open
				</button>
				<button className="tb" disabled={!root || !!busy} onClick={() => onOpen(root, true)}>
					Initialise
				</button>
			</div>
			{busy && <p>{busy}</p>}
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
					{props.packErrors.map((message, i) => (
						<div className="entry error" key={`pack${i}`}>
							<span className="sev">pack</span>
							<span>{message}</span>
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
					{diagnostics.length === 0 && outcomes.length === 0 && props.packErrors.length === 0 && (
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
