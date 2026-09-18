/**
 * The two bars above the workspace.
 *
 * Extracted from `App.tsx` ahead of panelisation, which reshapes the
 * *workspace* — the sidebar, the canvas, the inspector — into dockable panels.
 * These two rows sit outside that area and are not going to be docked, so
 * moving them out first leaves `App.tsx`'s render as very nearly the thing
 * panelisation replaces, rather than that thing buried in two hundred lines of
 * buttons.
 *
 * ## Why two components rather than one
 *
 * The split is not cosmetic and predates this file. One flat row put "Refresh
 * the project" next to the typechecking mode and left you working out which of
 * twelve controls acted on what. Two rows answer that by position: **everything
 * in `ProjectBar` is about the project**, everything in `DocumentBar` is about
 * the thing you have open, and the document row is simply absent when you have
 * nothing open.
 *
 * Splitting them into two components keeps that honest, because a control can
 * only be added to one of them and the file it lands in says which it is.
 *
 * ## Commands in, no state
 *
 * Both take their actions as named callbacks and hold nothing. A bar that knew
 * how to create a graph would be a second place that knows, and the first is
 * `App.tsx`, which owns the document. So these are as thick as a set of buttons
 * and no thicker — which is also what makes them safe to move around when the
 * layout changes underneath them.
 */

import type { RoswaalConfig, ScriptClass, Target, TypecheckMode } from "../core/schema.js";
import { VERSION } from "../cli/version.js";
import { FloatingTools, ToolGroup } from "./FloatingTools.jsx";
import { Icon } from "./icons.jsx";
import { Logo } from "./logo.jsx";
import { IS_STATIC_HOST } from "./pages.js";
import { PreviewChip } from "./previewBuild.jsx";

export interface ProjectBarProps {
	config: RoswaalConfig;
	/** Non-null while something long-running is in flight. */
	busy: string | null;
	onRefresh: () => void;
	onNewGraph: () => void;
	onNewMap: () => void;
	onCompileMode: (mode: RoswaalConfig["compileMode"]) => void;
	onCompileProject: () => void;
	onOpenDocs: () => void;
	/** The node designer, in its own window: a form over a node definition. */
	onOpenDesigner: () => void;
	onOpenSettings: () => void;
	/** Opens the project menu, anchored under the mark. */
	/**
	 * Open the introduction panel. No anchor: it is centred rather than dropped
	 * under the mark, because the same panel opens from a header in two other
	 * windows that have nothing to anchor it to.
	 */
	onOpenIntro: () => void;
}

export function ProjectBar(props: ProjectBarProps) {
	return (
		<div className="toolbar">
			{/* The mark alone. The name is on it as a tooltip rather than in
			    text, because the toolbar is the one screen you are only on
			    once you have already opened the thing.

			    It is also the way back out: the mark opens the introduction
			    panel, which is where an application's own icon is looked for. */}
			<button
				className="logo"
				title={IS_STATIC_HOST
					? `Roswaal ${VERSION}, running in your browser. Your project is kept in this browser only.`
					: `Roswaal ${VERSION} — recent projects, the demos, and the other windows`}
				onClick={() => props.onOpenIntro()}
			>
				<Logo height={17} />
				{/* Small, always there. Knowing which build you are looking at
				    is the first question about any bug report. */}
				<span className="version">{VERSION}</span>
				{/* And *which kind* of build, which is the second question. A
				    shared link lands on the editor rather than on the page that
				    explains what it is, so the editor has to say. One component
				    for every surface of the browser build -- see
				    `previewBuild.tsx` for why that is a rule. */}
				<PreviewChip />
			</button>

			{/* Icons, with the label as the tooltip. A toolbar is read by shape
			    once it is known, and the words were costing most of the row —
			    which is why every creative tool spends them only where a click
			    is consequential. Compile keeps its own. */}
			<button
				className="tb icon-only"
				title="Refresh — re-read the project from disk"
				aria-label="Refresh the project"
				onClick={props.onRefresh}
			>
				<Icon name="refresh" size={16} />
			</button>
			<button
				className="tb icon-only"
				title="New graph — a .nodescript: one Script, LocalScript or ModuleScript"
				aria-label="New graph"
				onClick={props.onNewGraph}
			>
				<Icon name="newFile" size={16} />
			</button>
			<button
				className="tb icon-only"
				title="New node map — where things live in the DataModel"
				aria-label="New node map"
				onClick={props.onNewMap}
			>
				<Icon name="map" size={16} />
			</button>

			<span className="spacer" />

			{/* The axis, named. Two buttons reading "Manual | Dynamic" say nothing
			    about what they are manual and dynamic *about*, and the answer was
			    only ever in a hover title. */}
			<span className="group-label">Compile</span>
			<div className="segmented" title="How generated Luau reaches disk">
				<button
					className={props.config.compileMode === "manual" ? "on" : ""}
					onClick={() => props.onCompileMode("manual")}
				>
					Manual
				</button>
				<button
					className={props.config.compileMode === "hot" ? "on" : ""}
					onClick={() => props.onCompileMode("hot")}
				>
					Dynamic
				</button>
			</div>
			<button
				className="tb with-icon tb-collapsible"
				title="Compile every graph and node map in the project"
				disabled={props.busy !== null}
				onClick={props.onCompileProject}
			>
				{/* Drawn only where the bar is short of room: see `tb-collapsible`. */}
				<Icon name="build" size={15} className="tb-icon-when-narrow" />
				<span className="tb-label">Compile project</span>
			</button>
			{/* Two builds, two destinations. The daemon opens its own /docs, which
			    is built from the live registry and so has a page for every pack
			    node as well. The hosted build has no daemon to ask, so it opens
			    the published site — the built-in library, and nothing of yours.
			    Promising packs there sent people looking for a page that is not
			    on that site. */}
			<button
				className="tb icon-only"
				title={IS_STATIC_HOST
					? "Docs — guides, and a page for every built-in node. Opens the published documentation in its own tab; a project's own packs are documented in the editor the daemon serves."
					: "Docs — guides, and a page for every node including this project's packs. Opens in its own window."}
				aria-label="Open the documentation"
				onClick={props.onOpenDocs}
			>
				<Icon name="document" size={16} />
			</button>
			<button
				className="tb icon-only"
				title="Node Design — make a node of your own, into one of this project's packs"
				aria-label="Open Node Design"
				onClick={props.onOpenDesigner}
			>
				<Icon name="palette" size={16} />
			</button>
			<button
				className="tb icon-only"
				title="Settings — the project's, this browser's, and themes"
				aria-label="Settings"
				onClick={props.onOpenSettings}
			>
				<Icon name="settings" size={16} />
			</button>
		</div>
	);
}

/**
 * What is open, and the tools that only mean anything while it is.
 *
 * `kind` decides the whole row. A node map is a tree rather than a graph and
 * shares almost nothing with one, so it gets a name and a compile button and
 * none of the graph tools — rather than a graph row with six things disabled,
 * which reads as "broken" instead of "not applicable".
 */
export type DocumentBarProps =
	| {
			kind: "map";
			name: string;
			dirty: boolean;
			busy: string | null;
			onCompile: () => void;
	  }
	| {
			kind: "graph";
			name: string;
			dirty: boolean;
			busy: string | null;
			scriptClass: ScriptClass;
			/** What the graph compiles for. A new graph takes the project's. */
			target: Target;
			typecheck: TypecheckMode;
			/** The graph is being compiled and must not be edited. */
			locked: boolean;
			alignExec: boolean;
			/** How many nodes are selected; none previews the graph on screen. */
			selected: number;
			/** A function's graph is on screen, so an empty selection previews it. */
			inFunction: boolean;
			/** Show the name at the start of the tools. A preference. */
			showName: boolean;
			/** The function on screen, when it is a function's graph. */
			functionName?: string;
			hasPath: boolean;
			onScriptClass: (value: ScriptClass) => void;
			onTarget: (value: Target) => void;
			onTypecheck: (value: TypecheckMode) => void;
			onAddNode: () => void;
			onRealign: () => void;
			onToggleAlignExec: () => void;
			onPreview: () => void;
			onCompile: () => void;
	  };

export function DocumentBar(props: DocumentBarProps) {
	if (props.kind === "map") {
		return (
			<div className="docbar">
				<span className={`doc-name${props.dirty ? " dirty" : ""}`}>{props.name}</span>
				<span className="doc-kind">node map</span>
				<span className="spacer" />
				<button
					className="tb primary with-icon"
					title="Compile just this document (Ctrl+S)"
					disabled={props.busy !== null}
					onClick={props.onCompile}
				>
					<Icon name="build" size={15} />
					Write project file
				</button>
			</div>
		);
	}

	// Floats over the canvas's top edge in three groups — the document's own
	// settings, the tools that act on the graph, and compiling — rather than
	// taking a row above it. See FloatingTools.tsx.
	return (
		<FloatingTools label="Graph">
			<ToolGroup>
			{/* The name is a preference; the tab and the watermark already say it.
			    Unsaved edits are marked either way. */}
			{props.showName ? (
				<span className={`doc-name${props.dirty ? " dirty" : ""}`}>
					{props.functionName ? (
						<>ƒ {props.functionName} <span className="doc-of">({props.name})</span></>
					) : (
						props.name
					)}
				</span>
			) : (
				props.dirty && <span className="doc-dirty" title="Edits not written yet" />
			)}
			{/* Lune has no script classes: every file is .luau, and a Module
			    Exports node is what makes one a module. */}
			{props.target !== "lune" && (
				<select
					className="tb"
					title="What this graph compiles to"
					value={props.scriptClass}
					onChange={(e) => props.onScriptClass(e.target.value as ScriptClass)}
				>
					<option>Script</option>
					<option>LocalScript</option>
					<option>ModuleScript</option>
				</select>
			)}
			<select
				className="tb"
				title={
					"Which Luau typechecking mode the generated file declares. Default writes no" +
					" mode line; the other two also annotate the types of generated locals."
				}
				value={props.typecheck}
				disabled={props.locked}
				onChange={(e) => props.onTypecheck(e.target.value as TypecheckMode)}
			>
				<option value="default">Default</option>
				<option value="nonstrict">Nonstrict Mode</option>
				<option value="strict">Strict Mode</option>
			</select>
			</ToolGroup>

			<ToolGroup>

			<button
				className="tb icon-only"
				disabled={props.locked}
				title="Add node — at the centre of the view. Right-clicking the canvas does the same, where you click."
				aria-label="Add a node"
				onClick={props.onAddNode}
			>
				<Icon name="search" size={16} />
			</button>
			<button
				className="tb icon-only"
				disabled={props.locked}
				title="Realign — tidy the graph into columns (Ctrl+Shift+L). With several nodes selected, only those move."
				aria-label="Realign the graph"
				onClick={props.onRealign}
			>
				<Icon name="layout" size={16} />
			</button>
			<button
				className={`tb with-icon tb-collapsible${props.alignExec ? " on" : ""}`}
				aria-pressed={props.alignExec}
				title={
					props.alignExec
						? "Realign lines each node up on the execution wire arriving at it. Click to tidy into plain columns instead."
						: "Realign tidies into plain columns. Click to line each node up on the execution wire arriving at it."
				}
				onClick={props.onToggleAlignExec}
			>
				<Icon name="straighten" size={16} className="tb-icon-when-narrow" />
				<span className="tb-label">Straighten</span>
			</button>

			{/* With a selection it picks out what those nodes produced; without
			    one it is the whole script. `P` does the same. */}
			<button
				className="tb icon-only"
				title={
					props.selected > 0
						? "Preview — the Luau these nodes produced, in the generated file (P)"
						: props.inFunction
							? "Preview — this function's Luau (P)"
							: "Preview — the whole script's Luau (P)"
				}
				aria-label={props.selected > 0 ? "Preview the selection's Luau" : "Preview the script's Luau"}
				onClick={props.onPreview}
			>
				<Icon name="terminal" size={16} />
			</button>
			</ToolGroup>

			<span className="spacer" />

			<ToolGroup>
			{/* What the graph compiles for, beside the button that compiles it:
			    it is a compilation setting, and a Roblox-only node in a Lune graph
			    being an error is the fact it explains. */}
			<select
				className={`tb doc-target ${props.target}`}
				title={
					props.target === "lune"
						? "Compiles for Lune, which is experimental. Roblox-only nodes are errors here."
						: "Compiles for Roblox."
				}
				value={props.target}
				disabled={props.locked}
				onChange={(e) => props.onTarget(e.target.value as Target)}
			>
				<option value="roblox">Roblox</option>
				<option value="lune">Lune (experimental)</option>
			</select>
			<button
				className="tb primary with-icon tb-collapsible"
				title="Compile just this document (Ctrl+S)"
				disabled={!props.hasPath || props.busy !== null}
				onClick={props.onCompile}
			>
				<Icon name="build" size={15} />
				<span className="tb-label">Compile script</span>
			</button>
			</ToolGroup>
		</FloatingTools>
	);
}
