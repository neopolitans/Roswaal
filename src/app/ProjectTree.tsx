/**
 * Project tree.
 *
 * Shows graphs alongside the Luau already in the repository, because a Roswaal
 * project is almost always a Rojo project that predates it. Generated files are
 * marked so it is obvious which Luau is Roswaal's to overwrite.
 */

import { memo, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { TreeEntry } from "./api.js";
import { Icon, type IconName } from "./icons.jsx";
import { LAYER } from "./layers.js";

const KIND_ICONS: Record<Exclude<TreeEntry["kind"], "directory">, IconName> = {
	nodescript: "document",
	nodemap: "map",
	luau: "document",
};

export interface ProjectTreeProps {
	tree: TreeEntry[];
	openPath: string | null;
	/** Where graphs live. Only folders under it can hold a new one. */
	sourceDir: string;
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
	const { tree, openPath, sourceDir, targetDir, onOpen, onMove, onTargetDir } = props;
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
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	/** Visible rows in display order, which is what shift-range needs. */
	const rows = useMemo(() => flatten(tree, collapsed, 0), [tree, collapsed]);
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
							.filter((r) => r.entry.kind !== "directory")
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
			{rows.map(({ entry, depth }) => {
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
							<Icon
								name={KIND_ICONS[entry.kind as keyof typeof KIND_ICONS]}
								size={15}
								className={`kind ${entry.kind}`}
							/>
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
							className="item"
							onClick={() => {
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
}

function flatten(entries: TreeEntry[], collapsed: ReadonlySet<string>, depth: number): Row[] {
	const out: Row[] = [];
	for (const entry of entries) {
		out.push({ entry, depth });
		if (entry.children && !collapsed.has(entry.path)) {
			out.push(...flatten(entry.children, collapsed, depth + 1));
		}
	}
	return out;
}
