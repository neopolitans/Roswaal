/**
 * Project tree.
 *
 * Shows graphs alongside the Luau already in the repository, because a Roswaal
 * project is almost always a Rojo project that predates it. Generated files are
 * marked so it is obvious which Luau is Roswaal's to overwrite.
 */

import { type DragEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import type { FunctionInfo } from "../core/functionGraph.js";
import type { TreeEntry } from "./api.js";
import { cx } from "./cx.js";
import { NOT_HERE, useHostCan } from "./host.js";
import { Icon, type IconName } from "./icons.jsx";
import { Menu } from "./Menu.jsx";
import { depthStyle, SectionHead } from "./PanelParts.jsx";

const KIND_ICONS: Record<Exclude<TreeEntry["kind"], "directory">, IconName> = {
	nodescript: "document",
	nodemap: "map",
	luau: "luauScript",
	// A gear: it is the project's settings for requires, and the shape people
	// already associate with that.
	luaurc: "settings",
	// The project's other settings file for what it requires, so the same gear.
	wally: "settings",
	package: "instance",
};

/** Listed from `wally.toml` rather than found on disk: no menu, no drag, no rename. */
const isListed = (entry: TreeEntry) => entry.kind === "wally" || entry.kind === "package";

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
	/** A hand-written `.luau` file, read into a new graph. */
	onImport?: (entry: TreeEntry) => void;
	/**
	 * Adding a package, from the menu on wally.toml or on a package: from the
	 * Wally registry, from a zip, or from a GitHub repository. `entry` is the
	 * package the menu was opened on, whose zip is being inserted.
	 */
	onPackage?: (how: "wally" | "zip" | "github" | "remove", entry?: TreeEntry) => void;
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
export const ProjectTree = memo(function ProjectTree({
	tree,
	openPath,
	openGraph,
	outline,
	onOpenFunction,
	sourceDir,
	nodePaths,
	targetDir,
	onOpen,
	onMove,
	onTargetDir,
	onNewGraph,
	onNewMap,
	onNewFolder,
	onRename,
	onDelete,
	onReveal,
	onImport,
	onPackage,
}: ProjectTreeProps) {
	// A file manager to show a file in is something only a machine has.
	const canReveal = useHostCan("reveal");
	const canGithub = useHostCan("githubDownload");
	const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry } | null>(null);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	// Wally's folders start shut: `_Index` holds every file of every package,
	// and opened it is most of the tree. Once each, so shutting is not undone
	// every time the tree is read again.
	const seenPackages = useRef(new Set<string>());
	useEffect(() => {
		const fresh = tree.filter((e) => e.role === "packages" && !seenPackages.current.has(e.path));
		if (fresh.length === 0) return;
		for (const e of fresh) seenPackages.current.add(e.path);
		setCollapsed((prev) => new Set([...prev, ...fresh.map((e) => e.path)]));
	}, [tree]);
	// Graphs whose functions are listed. Shut until asked, unlike folders.
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	// The two halves of a Roswaal project, shown as two rather than as a flat
	// repository listing with `.roswaal` and `src` beside each other as though
	// they were the same kind of thing.
	//
	// They are not. One half you author and Roswaal reads; the other half
	// Roswaal writes and you do not edit. Everything about how a file behaves —
	// whether it can be renamed, whether a new graph can go beside it, whether
	// the next compile will overwrite it — follows from which half it is in.
	const groups = useMemo(() => {
		const owned = [sourceDir, ...nodePaths].filter(Boolean);
		// Overlap in either direction: `.roswaal` contains `sourceDir`, and a
		// top-level `scripts` folder would be inside it. Either way it is ours.
		const isOurs = (p: string) =>
			owned.some((dir) => dir === p || dir.startsWith(p + "/") || p.startsWith(dir + "/"));
		// A `.luaurc` is graph content wherever it sits. The split is between what
		// Roswaal *reads* and what it *writes*, and this is read -- it decides
		// what a require resolves to, exactly as a node pack decides what a node
		// is. Landing it beside the compiled Luau said the opposite.
		// So is `wally.toml`: what a project depends on is part of what it reads.
		const isGraph = (e: TreeEntry) => isOurs(e.path) || e.kind === "luaurc" || e.kind === "wally";
		return {
			graph: tree.filter(isGraph),
			compiled: tree.filter((e) => !isGraph(e)),
			isGraph,
		};
	}, [tree, sourceDir, nodePaths]);

	// Visible rows in display order, which is what shift-range needs.
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

	// Whether a new graph or map can go here at all.
	//
	// Only under `sourceDir`. The tree also shows the compiled output, and
	// offering "New graph" inside a folder Roswaal regenerates would be offering
	// to write a file the next compile deletes.
	function holdsGraphs(dir: string): boolean {
		return dir === sourceDir || dir.startsWith(sourceDir + "/");
	}

	function toggle(path: string) {
		const next = new Set(collapsed);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		setCollapsed(next);
	}

	/**
	 * Shift+click on a folder: it and every folder inside it open, or all of
	 * them shut, as Studio's Explorer does. Which, by the folder clicked.
	 */
	function toggleDeep(entry: TreeEntry) {
		const paths: string[] = [];
		const walk = (e: TreeEntry) => {
			if (!e.children) return;
			paths.push(e.path);
			for (const child of e.children) walk(child);
		};
		walk(entry);
		const opening = collapsed.has(entry.path);
		const next = new Set(collapsed);
		for (const path of paths) {
			if (opening) next.delete(path);
			else next.add(path);
		}
		setCollapsed(next);
	}

	function click(e: React.MouseEvent, entry: TreeEntry) {
		if (entry.kind === "wally") {
			toggle(entry.path);
			return;
		}
		if (entry.kind === "package") {
			setSelected(new Set([entry.path]));
			return;
		}
		// Clicking anywhere in the tree says where you are working, which is what
		// the toolbar's New graph then uses. A folder is itself; a file is the
		// folder it is in, because that is where its siblings go.
		onTargetDir(parentDirOf(entry));
		if (entry.kind === "directory") {
			if (e.shiftKey) toggleDeep(entry);
			else toggle(entry.path);
			return;
		}
		if (e.shiftKey && anchor) {
			const from = rows.findIndex((r) => r.entry.path === anchor);
			const to = rows.findIndex((r) => r.entry.path === entry.path);
			if (from !== -1 && to !== -1) {
				const [lo, hi] = from < to ? [from, to] : [to, from];
				setSelected(
					new Set(
						rows
							.slice(lo, hi + 1)
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
		const movable = paths.filter(
			(p) => !p.startsWith(dir + "/") || p.slice(dir.length + 1).includes("/"),
		);
		if (movable.length) onMove(movable, dir);
	}

	return (
		<div className="tree">
			{rows.map(({ entry, depth, section, fn }) => {
				if (fn) {
					const open = openPath === entry.path && openGraph === fn.id;
					return (
						<div
							key={`${entry.path}#${fn.id}`}
							className={cx("tree-row function-row", open && "open-doc")}
							style={depthStyle(depth + fn.depth, 1)}
							title={`${fn.name} in ${entry.name}. Double-click to open its graph.`}
							onDoubleClick={() => onOpenFunction(entry.path, fn.id)}
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
						<div key={sectionKey(section.id)} className={cx("tree-section", shut && "shut")}>
							<SectionHead
								title={section.label}
								hint={section.hint}
								open={!shut}
								onToggle={() => toggle(sectionKey(section.id))}
							>
								{/* Only when there is nothing, because a count beside every
								    heading is a number nobody reads. Empty is the state
								    worth explaining -- a compile has not run yet. */}
								{count === 0 && <span className="empty">empty</span>}
							</SectionHead>
						</div>
					);
				}
				const isDir = entry.kind === "directory";
				const readonly = entry.kind === "luau" || entry.missing === true;
				return (
					<div
						key={entry.path}
						className={cx(
							"tree-row",
							selected.has(entry.path) && "selected",
							// The folder the toolbar's New graph would use. Marked
							// rather than left implicit, because a button that acts
							// on something you clicked earlier has to show what.
							isDir && entry.path === targetDir && holdsGraphs(entry.path) && "target-dir",
							openPath === entry.path && "open-doc",
							readonly && "readonly",
							dropTarget === entry.path && "drop-target",
						)}
						style={depthStyle(depth, 1)}
						draggable={!isDir && !isListed(entry)}
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
						onDoubleClick={() =>
							!isDir && entry.kind !== "wally" && !entry.missing && onOpen(entry)
						}
						onContextMenu={(e) => {
							e.preventDefault();
							// wally.toml and its packages: a menu of their own, for adding.
							if (isListed(entry)) {
								if (onPackage) setMenu({ x: e.clientX, y: e.clientY, entry });
								return;
							}
							if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
							// Right-clicking is a way of saying where you are working
							// too, so the toolbar agrees with the menu you just used.
							onTargetDir(parentDirOf(entry));
							setMenu({ x: e.clientX, y: e.clientY, entry });
						}}
						title={
							entry.kind === "package"
								? entry.missing
									? `${entry.name} is in wally.toml, and not installed: run wally install.`
									: `${entry.name}${entry.version ? ` ${entry.version}` : ""}. Double-click to open ${entry.target}.`
								: isDir && !groups.isGraph(entry) && entry.role
									? `${entry.path}: ${FOLDER_TITLE[entry.role]}`
									: entry.path
						}
					>
						{entry.kind === "wally" ? (
							<>
								<Icon
									name="chevron"
									size={14}
									className="twist"
									rotate={collapsed.has(entry.path) ? -90 : 0}
								/>
								<Icon name="settings" size={15} className="kind wally" />
							</>
						) : isDir ? (
							<>
								<Icon
									name="chevron"
									size={14}
									className="twist"
									rotate={collapsed.has(entry.path) ? -90 : 0}
								/>
								<Icon
									name={folderIcon(collapsed.has(entry.path), entry.role !== undefined)}
									size={15}
									className={folderClass(entry, groups.isGraph(entry))}
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
										<Icon
											name="chevron"
											size={14}
											className="twist"
											rotate={expanded.has(entry.path) ? 0 : -90}
										/>
									</span>
								)}
								<Icon
									name={KIND_ICONS[entry.kind as keyof typeof KIND_ICONS]}
									size={15}
									className={cx(
										"kind",
										entry.kind,
										entry.kind === "luau" && scriptClass(entry.name),
									)}
								/>
							</>
						)}
						<span className="label">{entry.name}</span>
						{entry.generatedFrom && <span className="badge">generated</span>}
						{entry.version && <span className="badge">{entry.version}</span>}
						{entry.missing && <span className="badge">not installed</span>}
					</div>
				);
			})}
			{rows.length === 0 && (
				<div className="tree-row readonly">
					<span className="label">Nothing to show yet.</span>
				</div>
			)}

			{menu && isListed(menu.entry) && onPackage && (
				<Menu
					at={menu}
					label={menu.entry.name}
					onClose={() => setMenu(null)}
					sections={[
						{
							entries: [
								menu.entry.kind === "package" &&
									menu.entry.missing && {
										label: "Insert its zip…",
										icon: "folderOpen",
										run: () => onPackage("zip", menu.entry),
									},
							],
						},
						{
							entries: [
								{ label: "Add from Wally…", icon: "instance", run: () => onPackage("wally") },
								{ label: "Insert package zip…", icon: "folderOpen", run: () => onPackage("zip") },
								{
									label: "Insert GitHub repo…",
									icon: "external",
									disabled: !canGithub,
									title: canGithub ? undefined : NOT_HERE,
									run: () => onPackage("github"),
								},
							],
						},
						{
							// Last, as every menu's red entry is.
							entries: [
								menu.entry.kind === "package" && {
									label: "Remove package…",
									icon: "remove",
									danger: true,
									run: () => onPackage("remove", menu.entry),
								},
							],
						},
					]}
				/>
			)}

			{menu && !isListed(menu.entry) && (
				<Menu
					at={menu}
					label={menu.entry.name}
					onClose={() => setMenu(null)}
					sections={[
						{
							// Making things first, then finding them, then changing and
							// destroying them. A menu opened on a folder is nearly always
							// opened to put something in it.
							entries: [
								holdsGraphs(parentDirOf(menu.entry)) && {
									label: "New graph here",
									icon: "newFile",
									run: () => onNewGraph(parentDirOf(menu.entry)),
								},
								holdsGraphs(parentDirOf(menu.entry)) && {
									label: "New map here",
									icon: "map",
									run: () => onNewMap(parentDirOf(menu.entry)),
								},
								onImport &&
									menu.entry.kind === "luau" &&
									!menu.entry.generatedFrom && {
										label: "Import as graph",
										icon: "graph",
										run: () => onImport(menu.entry),
									},
								{
									label: "New folder",
									icon: "newFolder",
									run: () => onNewFolder(parentDirOf(menu.entry)),
								},
							],
						},
						{
							entries: [
								{
									label: "Show in file manager",
									icon: "external",
									disabled: !canReveal,
									title: canReveal ? undefined : NOT_HERE,
									run: () => onReveal(menu.entry.path),
								},
							],
						},
						{
							entries: [
								{ label: "Rename", icon: "rename", run: () => onRename(menu.entry.path) },
								{
									label: "Delete",
									icon: "remove",
									danger: true,
									run: () =>
										onDelete(selected.has(menu.entry.path) ? [...selected] : [menu.entry.path]),
								},
							],
						},
					]}
				/>
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
		label: "Graph Content",
		hint: "Graphs, node maps and node packs. Yours to edit; Roswaal reads these.",
	},
	{
		id: "compiled",
		label: "Compile Content",
		hint: "Everything Roswaal does not author, including the Luau it writes out.",
	},
];

/**
 * Folders by what they are. Grey for a plain folder or a synced Folder; blue
 * for one that is a service, a container or a script in Studio; red for
 * `place/`, whose scripts only the place holds and only Modify RBXL writes.
 */
const FOLDER_CLASS: Record<NonNullable<TreeEntry["role"]> | "plain", string> = {
	plain: "tree-folder-plain",
	synced: "tree-folder-plain",
	service: "tree-folder-special",
	script: "tree-folder-special",
	place: "tree-folder-place",
	packages: "tree-folder-packages",
};

/**
 * A folder a node map syncs, or one that is a script, the place's or Wally's,
 * is drawn filled, and a plain one outlined, so what reaches Studio stands out
 * from what only organises. The colour says what it is there.
 */
function folderIcon(collapsed: boolean, filled: boolean): IconName {
	if (filled) return collapsed ? "folderFilled" : "folderOpenFilled";
	return collapsed ? "folder" : "folderOpen";
}

/**
 * A folder's colour. Graph content keeps its plain folders quiet, since there
 * every folder is the graphs' own; one mirroring a service is coloured as the
 * service is.
 */
function folderClass(entry: TreeEntry, isGraph: boolean): string {
	if (isGraph && entry.role === undefined) return "kind";
	return `kind ${FOLDER_CLASS[entry.role ?? "plain"]}`;
}

const FOLDER_TITLE: Record<NonNullable<TreeEntry["role"]>, string> = {
	service: "a service or container in Studio",
	synced: "a Folder in Studio, synced by a node map",
	script: "a script in Studio, with the rest of the folder as its children",
	place: "only in the place; Modify RBXL writes it back",
	packages: "Wally's packages, installed by wally install; Roswaal never writes here",
};

/**
 * A Luau file by the script it becomes: a Server Script white on dark and
 * slate on light, a LocalScript green, a ModuleScript blue.
 */
function scriptClass(name: string): string {
	if (/\.server\.luau?$/i.test(name)) return "tree-script-server";
	if (/\.client\.luau?$/i.test(name)) return "tree-script-local";
	return "tree-script-module";
}

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
