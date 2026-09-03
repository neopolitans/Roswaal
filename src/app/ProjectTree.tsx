/**
 * Project tree.
 *
 * Shows graphs alongside the Luau already in the repository, because a Roswaal
 * project is almost always a Rojo project that predates it. Generated files are
 * marked so it is obvious which Luau is Roswaal's to overwrite.
 */

import { useMemo, useState, type DragEvent } from "react";
import type { TreeEntry } from "./api.js";

const GLYPHS: Record<TreeEntry["kind"], string> = {
	directory: "▸",
	nodescript: "◆",
	nodemap: "▦",
	luau: "·",
};

export interface ProjectTreeProps {
	tree: TreeEntry[];
	openPath: string | null;
	onOpen: (entry: TreeEntry) => void;
	onMove: (from: string[], toDir: string) => void;
	onNewFolder: (parentDir: string) => void;
	onRename: (path: string) => void;
	onDelete: (paths: string[]) => void;
}

export function ProjectTree(props: ProjectTreeProps) {
	const { tree, openPath, onOpen, onMove } = props;
	const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry } | null>(null);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	/** Visible rows in display order, which is what shift-range needs. */
	const rows = useMemo(() => flatten(tree, collapsed, 0), [tree, collapsed]);
	const [anchor, setAnchor] = useState<string | null>(null);

	function toggle(path: string) {
		const next = new Set(collapsed);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		setCollapsed(next);
	}

	function click(e: React.MouseEvent, entry: TreeEntry) {
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

	// A folder's own path is where a new folder goes; a file's parent is.
	function parentDirOf(entry: TreeEntry): string {
		if (entry.kind === "directory") return entry.path;
		const slash = entry.path.lastIndexOf("/");
		return slash === -1 ? "" : entry.path.slice(0, slash);
	}

	return (
		<div className="tree" onClick={() => menu && setMenu(null)}>
			{rows.map(({ entry, depth }) => {
				const isDir = entry.kind === "directory";
				const readonly = entry.kind === "luau";
				return (
					<div
						key={entry.path}
						className={[
							"tree-row",
							selected.has(entry.path) ? "selected" : "",
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
							setMenu({ x: e.clientX, y: e.clientY, entry });
						}}
						title={entry.path}
					>
						<span
							className="glyph"
							style={
								isDir
									? { transform: collapsed.has(entry.path) ? "none" : "rotate(90deg)" }
									: undefined
							}
						>
							{GLYPHS[entry.kind]}
						</span>
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
				<div className="menu tree-menu" style={{ left: menu.x, top: menu.y }}>
					<div className="items">
						<div
							className="item"
							onClick={() => {
								props.onNewFolder(parentDirOf(menu.entry));
								setMenu(null);
							}}
						>
							New folder
						</div>
						<div
							className="item"
							onClick={() => {
								props.onRename(menu.entry.path);
								setMenu(null);
							}}
						>
							Rename
						</div>
						<div
							className="item danger"
							onClick={() => {
								const paths = selected.has(menu.entry.path) ? [...selected] : [menu.entry.path];
								props.onDelete(paths);
								setMenu(null);
							}}
						>
							Delete
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

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
