/**
 * Project tree.
 *
 * Shows graphs alongside the Luau already in the repository, because a Roswaal
 * project is almost always a Rojo project that predates it. Generated files are
 * marked so it is obvious which Luau is Roswaal's to overwrite.
 */

import { memo, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { TreeEntry } from "./api.js";
import type { FunctionInfo } from "../core/functionGraph.js";
import { Icon, type IconName } from "./icons.jsx";
import { NOT_HERE, useHostCan } from "./host.js";
import { LAYER } from "./layers.js";

const KIND_ICONS: Record<Exclude<TreeEntry["kind"], "directory">, IconName> = {
	nodescript: "document",
	nodemap: "map",
	luau: "document",
};

export interface ProjectTreeProps {
	tree: TreeEntry[];
	openPath: string | null;
	/** The function graph on screen, marked under its file. */
	openGraph: string | null;
	/**
	 * Functions of the graphs that are open, which win over what the file on
	 * disk said: a function added a moment ago is listed before autosave runs.
	 */
	outline: ReadonlyMap<string, FunctionInfo[]>;
	onOpenFunction: (path: string, functionId: string) => void;
	/** Where graphs live. Only folders under it can hold a new one. */
	sourceDir: string;
	/** Where node packs live. Roswaal's, but not somewhere a graph can go. */
	nodePaths: string[];
	/** The folder new documents go into, or null for the source root. */
	targetDir: string | null;
	onOpen: (entry: TreeEntry) => void;
	onMove: (from: string[], toDir: string) => void;
	/** A row was clicked: a folder is itself, a file is its parent. */
	onTargetDir: (dir: string) => void;
	onNewGraph: (parentDir: string) => void;
	onNewMap: (parentDir: string) => void;
	onNewFolder: (parentDir: string) => void;
	onRename: (path: string) => void;
	onDelete: (paths: string[]) => void;
	onReveal: (path: string) => void;
}

/**
 * Memoised, and it has to stay that way.
 *
 * `App` subscribes to the document store, so it re-renders on every frame of a
 * node drag — and it renders this. With a folder of 1200 graphs open that cost
 * 16ms a frame on its own and the drag stuttered. Nothing here depends on the
 * graph being edited, so none of those renders was ever going to change a row.
 *
 * The catch is that memoising is only worth anything while every prop is
 * stable. `App` hoists all six handlers into `useCallback` for that reason; a
 * new inline arrow in the JSX would quietly undo this.
 */
export const ProjectTree = memo(function ProjectTree(props: ProjectTreeProps) {
	const { tree, openPath, sourceDir, nodePaths, targetDir, onOpen, onMove, onTargetDir } = props;
	// A file manager to show a file in is something only a machine has.
	const canReveal = useHostCan("reveal");
	const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry } | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Closed by a click outside it, deferred by a tick — a right-click also
	// delivers a click here, and without the delay the menu would close on the
	// very gesture that opened it.
	useEffect(() => {
		if (!menu) return;
		const onDown = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
		};
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
		};
	}, [menu]);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	/** Graphs whose functions are listed. Shut until asked, unlike folders. */
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [dropTarget, setDropTarget] = useState<string | null>(null);
	const { outline } = props;

	/**
	 * The two halves of a Roswaal project, which the tree used to show as a flat
	 * repository listing with `.roswaal` and `src` sitting beside each other as
	 * though they were the same kind of thing.
	 *
	 * They are not. One half you author and Roswaal reads; the other half
	 * Roswaal writes and you do not edit. Everything about how a file behaves —
	 * whether it can be renamed, whether a new graph can go beside it, whether
	 * the next compile will overwrite it — follows from which half it is in, and
	 * the tree said none of that.
	 */
	const groups = useMemo(() => {
		const owned = [sourceDir, ...nodePaths].filter(Boolean);
		// Overlap in either direction: `.roswaal` contains `sourceDir`, and a
		// top-level `scripts` folder would be inside it. Either way it is ours.
		const isOurs = (p: string) =>
			owned.some((dir) => dir === p || dir.startsWith(p + "/") || p.startsWith(dir + "/"));
		return {
			graph: tree.filter((e) => isOurs(e.path)),
			compiled: tree.filter((e) => !isOurs(e.path)),
		};
	}, [tree, sourceDir, nodePaths]);

	/** Visible rows in display order, which is what shift-range needs. */
	const rows = useMemo(() => {
		const fnsOf = (entry: TreeEntry) => outline.get(entry.path) ?? entry.functions ?? [];
		const out: Row[] = [];
		for (const section of SECTIONS) {
			out.push({ section, entry: SECTION_ENTRY, depth: 0 });
			if (collapsed.has(sectionKey(section.id))) continue;
			out.push(...flatten(groups[section.id], collapsed, 1, fnsOf, expanded));
		}
		return out;
	}, [groups, collapsed, outline, expanded]);
	const [anchor, setAnchor] = useState<string | null>(null);

	// A folder's own path is where a new document goes; a file's parent is.
	function parentDirOf(entry: TreeEntry): string {
		if (entry.kind === "directory") return entry.path;
		const slash = entry.path.lastIndexOf("/");
		return slash === -1 ? "" : entry.path.slice(0, slash);
	}

	/**
	 * Whether a new graph or map can go here at all.
	 *
	 * Only under `sourceDir`. The tree also shows the compiled output, and
	 * offering "New graph" inside a folder Roswaal regenerates would be offering
	 * to write a file the next compile deletes.
	 */
	function holdsGraphs(dir: string): boolean {
		return dir === sourceDir || dir.startsWith(sourceDir + "/");
	}

	function toggle(path: string) {
		const next = new Set(collapsed);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		setCollapsed(next);
	}

	function click(e: React.MouseEvent, entry: TreeEntry) {
		// Clicking anywhere in the tree says where you are working, which is what
		// the toolbar's New graph then uses. A folder is itself; a file is the
		// folder it is in, because that is where its siblings go.
		onTargetDir(parentDirOf(entry));
		if (entry.kind === "directory") {
			toggle(entry.path);
			return;
		}
		if (e.shiftKey && anchor) {
			const from = rows.findIndex((r) => r.entry.path === anchor);
			const to = rows.findIndex((r) => r.entry.path === entry.path);
			if (from !== -1 && to !== -1) {
				const [lo, hi] = from < to ? [from, to] : [to, from];
				setSelected(
					new Set(
						rows.slice(lo, hi + 1)
							.filter((r) => r.entry.kind !== "directory" && !r.fn)
							.map((r) => r.entry.path),
					),
				);
				return;
			}
		}
		if (e.ctrlKey || e.metaKey) {
			const next = new Set(selected);
			if (next.has(entry.path)) next.delete(entry.path);
			else next.add(entry.path);
			setSelected(next);
			setAnchor(entry.path);
			return;
		}
		setSelected(new Set([entry.path]));
		setAnchor(entry.path);
	}

	function onDragStart(e: DragEvent, entry: TreeEntry) {
		// Dragging an unselected file drags just that file, which is what the
		// gesture implies; dragging a selected one carries the whole selection.
		const payload = selected.has(entry.path) ? [...selected] : [entry.path];
		e.dataTransfer.setData("application/x-roswaal", JSON.stringify(payload));
		e.dataTransfer.effectAllowed = "move";
	}

	function onDrop(e: DragEvent, dir: string) {
		e.preventDefault();
		setDropTarget(null);
		const raw = e.dataTransfer.getData("application/x-roswaal");
		if (!raw) return;
		const paths = JSON.parse(raw) as string[];
		const movable = paths.filter((p) => !p.startsWith(dir + "/") || p.slice(dir.length + 1).includes("/"));
		if (movable.length) onMove(movable, dir);
	}

	return (
		<div className="tree">
			{rows.map(({ entry, depth, section, fn }) => {
				if (fn) {
					const open = props.openPath === entry.path && props.openGraph === fn.id;
					return (
						<div
							key={`${entry.path}#${fn.id}`}
							className={`tree-row function-row${open ? " open-doc" : ""}`}
							style={{ paddingLeft: 6 + (depth + fn.depth) * 13 }}
							title={`${fn.name} in ${entry.name}. Double-click to open its graph.`}
							onDoubleClick={() => props.onOpenFunction(entry.path, fn.id)}
						>
							<Icon name="function" size={15} className="kind function" />
							<span className="label">{fn.name}</span>
						</div>
					);
				}
				if (section) {
					const shut = collapsed.has(sectionKey(section.id));
					const count = groups[section.id].length;
					return (
						<div
							key={sectionKey(section.id)}
							className={`tree-section${shut ? " shut" : ""}`}
							title={section.hint}
							onClick={() => toggle(sectionKey(section.id))}
						>
							<span className="twist">{shut ? "▸" : "▾"}</span>
							<span className="label">{section.label}</span>
							{/* Only when there is nothing, because a count beside every
							    heading is a number nobody reads. Empty is the state
							    worth explaining -- a compile has not run yet. */}
							{count === 0 && <span className="empty">empty</span>}
						</div>
					);
				}
				const isDir = entry.kind === "directory";
				const readonly = entry.kind === "luau";
				return (
					<div
						key={entry.path}
						className={[
							"tree-row",
							selected.has(entry.path) ? "selected" : "",
							// The folder the toolbar's New graph would use. Marked
							// rather than left implicit, because a button that acts
							// on something you clicked earlier has to show what.
							isDir && entry.path === targetDir && holdsGraphs(entry.path)
								? "target-dir"
								: "",
							openPath === entry.path ? "open-doc" : "",
							readonly ? "readonly" : "",
							dropTarget === entry.path ? "drop-target" : "",
						].filter(Boolean).join(" ")}
						style={{ paddingLeft: 6 + depth * 13 }}
						draggable={!isDir}
						onDragStart={(e) => onDragStart(e, entry)}
						onDragOver={(e) => {
							if (!isDir) return;
							e.preventDefault();
							e.dataTransfer.dropEffect = "move";
							setDropTarget(entry.path);
						}}
						onDragLeave={() => setDropTarget((t) => (t === entry.path ? null : t))}
						onDrop={(e) => isDir && onDrop(e, entry.path)}
						onClick={(e) => click(e, entry)}
						onDoubleClick={() => !isDir && onOpen(entry)}
						onContextMenu={(e) => {
							e.preventDefault();
							if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
							// Right-clicking is a way of saying where you are working
							// too, so the toolbar agrees with the menu you just used.
							onTargetDir(parentDirOf(entry));
							setMenu({ x: e.clientX, y: e.clientY, entry });
						}}
						title={entry.path}
					>
						{isDir ? (
							<>
								<Icon name="chevron" size={14} className="twist"
									rotate={collapsed.has(entry.path) ? -90 : 0} />
								<Icon
									name={collapsed.has(entry.path) ? "folder" : "folderOpen"}
									size={15}
									className="kind"
								/>
							</>
						) : (
							<>
								{/* A graph with functions opens like a folder, onto them. */}
								{(outline.get(entry.path) ?? entry.functions ?? []).length > 0 && (
									<span
										className="function-twist"
										title={expanded.has(entry.path) ? "Hide its functions" : "Show its functions"}
										onClick={(e) => {
											e.stopPropagation();
											const next = new Set(expanded);
											if (next.has(entry.path)) next.delete(entry.path);
											else next.add(entry.path);
											setExpanded(next);
										}}
										onDoubleClick={(e) => e.stopPropagation()}
									>
										<Icon name="chevron" size={14} className="twist"
											rotate={expanded.has(entry.path) ? 0 : -90} />
									</span>
								)}
								<Icon
									name={KIND_ICONS[entry.kind as keyof typeof KIND_ICONS]}
									size={15}
									className={`kind ${entry.kind}`}
								/>
							</>
						)}
						<span className="label">{entry.name}</span>
						{entry.generatedFrom && <span className="badge">generated</span>}
					</div>
				);
			})}
			{rows.length === 0 && (
				<div className="tree-row readonly">
					<span className="label">Nothing to show yet.</span>
				</div>
			)}

			{menu && (
				<div
					className="menu tree-menu"
					ref={menuRef}
					style={{ left: menu.x, top: menu.y, zIndex: LAYER.menu }}
				>
					<div className="items">
						{/* Making things first, then finding them, then destroying
						    them. A menu opened on a folder is nearly always opened
						    to put something in it. */}
						{holdsGraphs(parentDirOf(menu.entry)) && (
							<>
								<div
									className="item"
									onClick={() => {
										props.onNewGraph(parentDirOf(menu.entry));
										setMenu(null);
									}}
								>
									<Icon name="newFile" size={15} />
									<span>New graph here</span>
								</div>
								<div
									className="item"
									onClick={() => {
										props.onNewMap(parentDirOf(menu.entry));
										setMenu(null);
									}}
								>
									<Icon name="map" size={15} />
									<span>New map here</span>
								</div>
							</>
						)}
						<div
							className="item"
							onClick={() => {
								props.onNewFolder(parentDirOf(menu.entry));
								setMenu(null);
							}}
						>
							<Icon name="newFolder" size={15} />
							<span>New folder</span>
						</div>
						<div
							className={`item${canReveal ? "" : " item-unavailable"}`}
							title={canReveal ? undefined : NOT_HERE}
							onClick={() => {
								if (!canReveal) return;
								props.onReveal(menu.entry.path);
								setMenu(null);
							}}
						>
							<Icon name="external" size={15} />
							<span>Show in file manager</span>
						</div>
						<div
							className="item"
							onClick={() => {
								props.onRename(menu.entry.path);
								setMenu(null);
							}}
						>
							<Icon name="rename" size={15} />
							<span>Rename</span>
						</div>
						<div
							className="item danger"
							onClick={() => {
								const paths = selected.has(menu.entry.path) ? [...selected] : [menu.entry.path];
								props.onDelete(paths);
								setMenu(null);
							}}
						>
							<Icon name="remove" size={15} />
							<span>Delete</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
});

interface Row {
	entry: TreeEntry;
	depth: number;
	/** Set on a section heading, which is a row without a file behind it. */
	section?: Section;
	/** Set on a function listed under its graph, which `entry` is. */
	fn?: FunctionInfo;
}

interface Section {
	id: "graph" | "compiled";
	label: string;
	hint: string;
}

/**
 * Graphs first, output second, because that is the direction the work goes and
 * because the top of a list is where the thing you touch every minute belongs.
 */
const SECTIONS: readonly Section[] = [
	{
		id: "graph",
		label: "Graph content",
		hint: "Graphs, node maps and node packs. Yours to edit; Roswaal reads these.",
	},
	{
		id: "compiled",
		label: "Compile content",
		hint: "Everything Roswaal does not author, including the Luau it writes out.",
	},
];

/** A stand-in so a heading row can share the row type without a file. */
const SECTION_ENTRY: TreeEntry = { path: "", name: "", kind: "directory" };

/** Sections collapse through the same set as folders, so one key space. */
const sectionKey = (id: Section["id"]) => `::section:${id}`;

function flatten(
	entries: TreeEntry[],
	collapsed: ReadonlySet<string>,
	depth: number,
	fnsOf: (entry: TreeEntry) => FunctionInfo[],
	expanded: ReadonlySet<string>,
): Row[] {
	const out: Row[] = [];
	for (const entry of entries) {
		out.push({ entry, depth });
		if (entry.children && !collapsed.has(entry.path)) {
			out.push(...flatten(entry.children, collapsed, depth + 1, fnsOf, expanded));
		}
		if (entry.kind === "nodescript" && expanded.has(entry.path)) {
			for (const fn of fnsOf(entry)) out.push({ entry, depth: depth + 1, fn });
		}
	}
	return out;
}
