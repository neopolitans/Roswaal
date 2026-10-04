/**
 * The editor's floating chrome: the clusters along the top of the window.
 *
 * There is no bar. The graph fills the window and these float over it in small
 * groups, Procreate's way: what you work on at the left -- the mark, the
 * project, the open document and its tools -- and what you work with at the
 * right -- compiling, the Inspector, and the other windows.
 *
 * ## Why two components rather than one
 *
 * **Everything in `ProjectBar` is about the project**, everything in
 * `DocumentBar` is about the thing you have open, and the document's groups are
 * simply absent when you have nothing open. A control can only be added to one
 * of them, and the function it lands in says which it is. `ProjectBar` draws the
 * row and takes the document's groups as a slot, so the two still read as one
 * row on screen.
 *
 * ## Commands in, no state
 *
 * Both take their actions as named callbacks and hold nothing. A bar that knew
 * how to create a graph would be a second place that knows, and the first is
 * `App.tsx`, which owns the document. The one thing read from elsewhere is the
 * workspace, for the buttons that put the Project and Inspector cards out.
 *
 * ## On a phone
 *
 * The row keeps the mark, the open document, its primary action and a More
 * menu. The two cards are on the bar along the bottom instead, and a row that
 * repeated them would run off a 393-point screen.
 */

import type { ReactNode } from "react";

import type { RoswaalConfig } from "../core/schema.js";
import { cx } from "./cx.js";
import { FloatingTools, ToolGroup } from "./FloatingTools.jsx";
import { Icon } from "./icons.jsx";
import { Popout, useNarrowBar, usePhone } from "./Popout.jsx";
import { IS_STATIC_HOST } from "./pages.js";
import { WindowMark } from "./WindowMark.jsx";
import { useWorkspaceControls } from "./Workspace.jsx";

export interface ProjectBarProps {
	config: RoswaalConfig;
	/** Non-null while something long-running is in flight. */
	busy: string | null;
	/** The open document's groups: its tab and its tools. */
	document?: ReactNode;
	/** The open document's primary action, at the end of the compile group. */
	action?: ReactNode;
	/** The document's tools as rows of the More menu, on a phone. */
	phoneMenu?: ReactNode;
	onRefresh: () => void;
	onNewGraph: () => void;
	onNewMap: () => void;
	onCompileMode: (mode: RoswaalConfig["compileMode"]) => void;
	onCompileProject: () => void;
	onOpenDocs: () => void;
	/** The node designer, in its own window: a form over a node definition. */
	onOpenDesigner: () => void;
	onOpenSettings: () => void;
	/**
	 * Open the introduction panel. No anchor: it is centred rather than dropped
	 * under the mark, because the same panel opens from a header in two other
	 * windows that have nothing to anchor it to.
	 */
	onOpenIntro: () => void;
}

/** Two builds, two destinations: see `onOpenDocs`. */
const DOCS_TITLE = IS_STATIC_HOST
	? "Docs — guides, and a page for every built-in node. Opens the published documentation in its own tab; a project's own packs are documented in the editor the daemon serves."
	: "Docs — guides, and a page for every node including this project's packs. Opens in its own window.";

export function ProjectBar(props: ProjectBarProps) {
	const phone = usePhone();
	// Narrower than the whole row: the rarely used half folds into More.
	const narrow = useNarrowBar();
	const cards = useWorkspaceControls();

	// The axis, named. Two buttons reading "Manual | Dynamic" say nothing about
	// what they are manual and dynamic *about*; the group's title says it.
	const mode = (
		<span className="segmented" title="How generated Luau reaches disk">
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
		</span>
	);

	return (
		<FloatingTools label="Editor">
			{/* The way back out: the mark opens the introduction panel, which is
			    where an application's own icon is looked for. Its colour says
			    which build this is -- see `MarkedLogo`. */}
			<ToolGroup className="mark-group">
				<WindowMark window="editor" onOpen={props.onOpenIntro} />
			</ToolGroup>

			{!phone && (
				<ToolGroup>
					<button
						className={cx("tb icon-only", cards.isOpen("left") && "on")}
						title="Project — the files, the DataModel and Variables"
						aria-label="Show or hide the Project card"
						aria-pressed={cards.isOpen("left")}
						disabled={!cards.has("left")}
						onClick={() => cards.toggle("left")}
					>
						<Icon name="panelLeft" size={16} />
					</button>
					{!narrow && (
						<>
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
						</>
					)}
				</ToolGroup>
			)}

			{props.document}

			<span className="spacer" />

			{phone || narrow ? (
				<>
					{props.action && <ToolGroup>{props.action}</ToolGroup>}
					<ToolGroup>
						{!phone && (
							<button
								className={cx("tb icon-only", cards.isOpen("right") && "on")}
								title="Inspector — the selected node, or the graph's own settings"
								aria-label="Show or hide the Inspector"
								aria-pressed={cards.isOpen("right")}
								disabled={!cards.has("right")}
								onClick={() => cards.toggle("right")}
							>
								<Icon name="panelRight" size={16} />
							</button>
						)}
						<Popout label={<Icon name="more" size={16} />} title="More" end closeOnPick>
							{mode}
							<button
								className="tb with-icon"
								disabled={props.busy !== null}
								onClick={props.onCompileProject}
							>
								<Icon name="build" size={15} />
								Compile project
							</button>
							{phone && props.phoneMenu}
							<span className="tool-popout-rule" />
							<button className="tb with-icon" onClick={props.onRefresh}>
								<Icon name="refresh" size={15} />
								Refresh
							</button>
							<button className="tb with-icon" onClick={props.onNewGraph}>
								<Icon name="newFile" size={15} />
								New graph
							</button>
							<button className="tb with-icon" onClick={props.onNewMap}>
								<Icon name="map" size={15} />
								New node map
							</button>
							<span className="tool-popout-rule" />
							<button className="tb with-icon" onClick={props.onOpenDocs}>
								<Icon name="document" size={15} />
								Docs
							</button>
							<button className="tb with-icon" onClick={props.onOpenDesigner}>
								<Icon name="palette" size={15} />
								Node Design
							</button>
							<button className="tb with-icon" onClick={props.onOpenSettings}>
								<Icon name="settings" size={15} />
								Settings
							</button>
						</Popout>
					</ToolGroup>
				</>
			) : (
				<>
					<ToolGroup title="How generated Luau reaches disk">
						{mode}
						<span className="divider" />
						<button
							className="tb with-icon tb-collapsible"
							title="Compile project — every graph and node map in the project"
							disabled={props.busy !== null}
							onClick={props.onCompileProject}
						>
							{/* Drawn only where the row is short of room: see `tb-collapsible`. */}
							<Icon name="build" size={15} className="tb-icon-when-narrow" />
							<span className="tb-label">Compile project</span>
						</button>
						{props.action}
					</ToolGroup>
					<ToolGroup>
						<button
							className={cx("tb icon-only", cards.isOpen("right") && "on")}
							title="Inspector — the selected node, or the graph's own settings"
							aria-label="Show or hide the Inspector"
							aria-pressed={cards.isOpen("right")}
							disabled={!cards.has("right")}
							onClick={() => cards.toggle("right")}
						>
							<Icon name="panelRight" size={16} />
						</button>
						<span className="divider" />
						<button
							className="tb icon-only"
							title={DOCS_TITLE}
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
					</ToolGroup>
				</>
			)}
		</FloatingTools>
	);
}

/**
 * What is open, and the tools that only mean anything while it is.
 *
 * `kind` decides the whole group. A node map is a tree rather than a graph and
 * shares almost nothing with one, so it gets its name and none of the graph
 * tools -- rather than a graph's tools with six things disabled, which reads
 * as "broken" instead of "not applicable".
 *
 * The graph's name is its tab, drawn by `GraphTabs` beside this; its settings
 * are the Inspector's while nothing is selected. What is left here acts.
 */
export type DocumentBarProps =
	| {
			kind: "map";
			name: string;
			dirty: boolean;
	  }
	| {
			kind: "graph";
			/** The graph is being compiled and must not be edited. */
			locked: boolean;
			alignExec: boolean;
			/** How many nodes are selected; none previews the graph on screen. */
			selected: number;
			/** A function's graph is on screen, so an empty selection previews it. */
			inFunction: boolean;
			/** Rows of the More menu, on a phone, rather than a group of buttons. */
			asMenu?: boolean;
			onAddNode: () => void;
			onRealign: () => void;
			onToggleAlignExec: () => void;
			onPreview: () => void;
	  };

export function DocumentBar(props: DocumentBarProps) {
	// On a phone the graph's tools are rows of the More menu instead.
	const phone = usePhone();
	if (props.kind === "map") {
		return (
			<ToolGroup className="doc-group">
				<span className={cx("doc-name", props.dirty && "dirty")}>{props.name}</span>
				<span className="doc-kind">Node map</span>
			</ToolGroup>
		);
	}

	const previewTitle =
		props.selected > 0
			? "Preview — the Luau these nodes produced, in the generated file (P)"
			: props.inFunction
				? "Preview — this function's Luau (P)"
				: "Preview — the whole script's Luau (P)";

	if (phone && !props.asMenu) return null;
	if (props.asMenu) {
		return (
			<>
				<button className="tb with-icon" disabled={props.locked} onClick={props.onAddNode}>
					<Icon name="search" size={15} />
					Add node
				</button>
				<button className="tb with-icon" disabled={props.locked} onClick={props.onRealign}>
					<Icon name="layout" size={15} />
					Realign
				</button>
				<button
					className={cx("tb with-icon", props.alignExec && "on")}
					aria-pressed={props.alignExec}
					onClick={props.onToggleAlignExec}
				>
					<Icon name="straighten" size={15} />
					Straighten
				</button>
				<button className="tb with-icon" onClick={props.onPreview}>
					<Icon name="terminal" size={15} />
					Preview
				</button>
			</>
		);
	}

	return (
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
				className={cx("tb icon-only", props.alignExec && "on")}
				aria-pressed={props.alignExec}
				aria-label="Straighten"
				title={
					props.alignExec
						? "Straighten — Realign lines each node up on the execution wire arriving at it. Click to tidy into plain columns instead."
						: "Straighten — Realign tidies into plain columns. Click to line each node up on the execution wire arriving at it."
				}
				onClick={props.onToggleAlignExec}
			>
				<Icon name="straighten" size={16} />
			</button>
			{/* With a selection it picks out what those nodes produced; without
			    one it is the whole script. `P` does the same. */}
			<button
				className="tb icon-only"
				title={previewTitle}
				aria-label={
					props.selected > 0 ? "Preview the selection's Luau" : "Preview the script's Luau"
				}
				onClick={props.onPreview}
			>
				<Icon name="terminal" size={16} />
			</button>
		</ToolGroup>
	);
}

/**
 * The open document's primary action, at the end of the compile group: a
 * graph compiles, a node map writes its project file.
 */
export function DocumentAction({
	kind,
	busy,
	hasPath,
	onCompile,
}: {
	kind: "graph" | "map";
	busy: string | null;
	hasPath: boolean;
	onCompile: () => void;
}) {
	return (
		<button
			className="tb primary with-icon tb-collapsible"
			title={
				kind === "map"
					? "Write project file — the Rojo project this map describes (Ctrl+S)"
					: "Compile script — just this document (Ctrl+S)"
			}
			disabled={!hasPath || busy !== null}
			onClick={onCompile}
		>
			<Icon name="build" size={15} />
			<span className="tb-label">{kind === "map" ? "Write project file" : "Compile script"}</span>
		</button>
	);
}
