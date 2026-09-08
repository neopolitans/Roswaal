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

import type { RoswaalConfig, ScriptClass, TypecheckMode } from "../core/schema.js";
import { VERSION } from "../cli/version.js";
import { Icon } from "./icons.jsx";
import { Logo } from "./logo.jsx";

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
	onOpenSettings: () => void;
	/** Opens the project menu, anchored under the mark. */
	onOpenProjectMenu: (anchor: { x: number; y: number }) => void;
}

export function ProjectBar(props: ProjectBarProps) {
	return (
		<div className="toolbar">
			{/* The mark alone. The name is on it as a tooltip rather than in
			    text, because the toolbar is the one screen you are only on
			    once you have already opened the thing.

			    It is also the way back out: the mark opens the project menu,
			    which is where an application's own icon is looked for. */}
			<button
				className="logo"
				title={`Roswaal ${VERSION} — switch project`}
				onClick={(e) => {
					const box = e.currentTarget.getBoundingClientRect();
					props.onOpenProjectMenu({ x: box.left, y: box.bottom + 4 });
				}}
			>
				<Logo height={17} />
				{/* Small, always there. Knowing which build you are looking at
				    is the first question about any bug report. */}
				<span className="version">{VERSION}</span>
			</button>

			<button
				className="tb with-icon"
				title="Re-read the project from disk"
				onClick={props.onRefresh}
			>
				<Icon name="refresh" size={15} />
				Refresh
			</button>
			<button
				className="tb with-icon"
				title="A new .nodescript: one Script, LocalScript or ModuleScript"
				onClick={props.onNewGraph}
			>
				<Icon name="newFile" size={15} />
				New graph
			</button>
			<button
				className="tb with-icon"
				title="A node map describes where things live in the DataModel"
				onClick={props.onNewMap}
			>
				<Icon name="map" size={15} />
				New map
			</button>

			<span className="spacer" />

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
					Hot reload
				</button>
			</div>
			<button
				className="tb"
				title="Compile every graph and node map in the project"
				disabled={props.busy !== null}
				onClick={props.onCompileProject}
			>
				Compile project
			</button>
			<button
				className="tb"
				title="Guides, and a reference page for every node — including this project's own packs. Opens in its own window so it does not cover the graph."
				onClick={props.onOpenDocs}
			>
				Docs
			</button>
			<button
				className="tb with-icon"
				title="Project settings, editor preferences and themes"
				onClick={props.onOpenSettings}
			>
				<Icon name="settings" size={15} />
				Settings
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
			typecheck: TypecheckMode;
			/** The graph is being compiled and must not be edited. */
			locked: boolean;
			alignExec: boolean;
			/** Nothing selected means nothing to preview. */
			selected: number;
			hasPath: boolean;
			onScriptClass: (value: ScriptClass) => void;
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

	return (
		<div className="docbar">
			<span className={`doc-name${props.dirty ? " dirty" : ""}`}>{props.name}</span>
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

			<span className="divider" />

			<button
				className="tb with-icon"
				disabled={props.locked}
				title="Add a node at the centre of the view. Right-clicking the canvas does the same, where you click."
				onClick={props.onAddNode}
			>
				<Icon name="search" size={15} />
				Add node
			</button>
			<button
				className="tb with-icon"
				disabled={props.locked}
				title="Tidy the graph into columns (Ctrl+Shift+L). With several nodes selected, only those move."
				onClick={props.onRealign}
			>
				<Icon name="layout" size={15} />
				Realign
			</button>
			<button
				className={`tb${props.alignExec ? " on" : ""}`}
				aria-pressed={props.alignExec}
				title={
					props.alignExec
						? "Realign lines each node up on the execution wire arriving at it. Click to tidy into plain columns instead."
						: "Realign tidies into plain columns. Click to line each node up on the execution wire arriving at it."
				}
				onClick={props.onToggleAlignExec}
			>
				Straighten
			</button>

			{/* Only with a selection, which is the whole design: an advanced tool
			    that appears when it has a question to answer and is not chrome
			    the rest of the time. `P` does the same without reaching for it. */}
			{props.selected > 0 && (
				<button
					className="tb with-icon"
					title="Show the Luau these nodes produced, in the generated file (P)"
					onClick={props.onPreview}
				>
					<Icon name="terminal" size={15} />
					Preview
				</button>
			)}

			<span className="spacer" />

			<button
				className="tb primary with-icon"
				title="Compile just this document (Ctrl+S)"
				disabled={!props.hasPath || props.busy !== null}
				onClick={props.onCompile}
			>
				<Icon name="build" size={15} />
				Compile script
			</button>
		</div>
	);
}
