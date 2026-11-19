/**
 * Project tree.
 *
 * Shows graphs alongside the Luau already in the repository, because a Roswaal
 * project is almost always a Rojo project that predates it. Generated files are
 * marked so it is obvious which Luau is Roswaal's to overwrite.
 */

import { type DragEvent, memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { wearsClassIcon } from "../core/classIcons.js";
import type { FunctionInfo } from "../core/functionGraph.js";
import { isInstanceClass, isService } from "../core/roblox.js";
import type { TreeEntry } from "./api.js";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import { NOT_HERE, useHostCan } from "./host.js";
import { Icon, type IconName } from "./icons.jsx";
import { importableLuau } from "./importable.js";
import { requestMapPick } from "./MapEditor.jsx";
import { Menu } from "./Menu.jsx";
import { AddButton, depthStyle, SectionHead } from "./PanelParts.jsx";
import { useNarrowBar, usePhone } from "./Popout.jsx";
import { realmClass, realmOfLuau, ScriptIcon } from "./ScriptIcon.jsx";
import { SHOW_ENTRY } from "./showEntry.js";
import { useDocuments } from "./store.js";
import { fileMenu, packageMenu, type TreeAction } from "./treeMenus.js";

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
	// A place is a whole game, so the cube the compile buttons use; a model is one instance.
	place: "build",
	model: "instance",
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
	/** New graph from a graph's menu: inside it, as its child, or beside it. */
	onNewGraphNear?: (graph: string) => void;
	onNewMap: (parentDir: string) => void;
	/** Where compiled Luau goes, mirroring `sourceDir`: a graph's hover names its file. */
	outDir?: string;
	/** Makes a map the served one. */
	onServeMap?: (path: string) => void;
	/** Generated Luau whose graph is gone, which Output marks stale. */
	stale?: readonly string[];
	/** Maps a Wally realm's folder into the served map, where its realm puts it. */
	onMapRealm?: (realm: "shared" | "server") => void;
	onNewFolder: (parentDir: string) => void;
	onRename: (path: string) => void;
	onDelete: (paths: string[]) => void;
	onReveal: (path: string) => void;
	/** A hand-written `.luau` file, read into a new graph. */
	onImport?: (entry: TreeEntry) => void;
	/** Several hand-written `.luau` files, each read into a graph. */
	onImportMany?: (entries: TreeEntry[]) => void;
	/**
	 * Adding a package, from the menu on wally.toml or on a package: from the
	 * Wally registry, from a zip, or from a GitHub repository. `entry` is the
	 * package the menu was opened on, whose zip is being inserted.
	 */
	onPackage?: (how: "wally" | "zip" | "github" | "remove", entry?: TreeEntry) => void;
	/**
	 * A Roblox project with no place: the Place heading offers one,
	 * imported from a file or started from Studio's baseplate.
	 */
	onAddPlace?: (how: "import" | "new" | "copy") => void;
	/** A node pack, double-clicked under Node packs: opens Node Design. */
	onNodePacks?: () => void;
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
	onNewGraphNear,
	onNewMap,
	outDir = "",
	onServeMap,
	stale,
	onMapRealm,
	onNewFolder,
	onRename,
	onDelete,
	onReveal,
	onImport,
	onImportMany,
	onPackage,
	onAddPlace,
	onNodePacks,
}: ProjectTreeProps) {
	// A file manager to show a file in is something only a machine has.
	const canReveal = useHostCan("reveal");
	const canGithub = useHostCan("githubDownload");
	const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry } | null>(null);
	// Add Place's two ways, hung from the button.
	const [placeMenu, setPlaceMenu] = useState<Element | null>(null);
	// Output starts folded: what Roswaal writes is looked at when something is wrong.
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
		() => new Set([sectionKey("packs")]),
	);
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
	// Where New graph is in the toolbar's More menu rather than on each folder.
	// Both asked every render: a hook skipped by `||` changes the hook order
	// when the window is resized across the narrow width, and React stops.
	const narrowBar = useNarrowBar();
	const phone = usePhone();
	const menuNews = narrowBar || phone;
	/** Whether the row is one of several selected. */
	const multiple = (entry: TreeEntry) => selected.size > 1 && selected.has(entry.path);
	/** The rows Import as graphs reads: the selection, or the folder the menu is on. */
	const manyFrom = (entry: TreeEntry): ReadonlySet<string> =>
		multiple(entry) ? selected : new Set([entry.path]);
	/** Hand-written Luau among `paths`, a folder giving everything under it. */
	const importable = (paths: ReadonlySet<string>): TreeEntry[] => importableLuau(tree, paths);
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	// The project by what you do with each part, rather than as a repository
	// listing. Graphs you edit, from the services down: the "Graphs live in"
	// folder is the setting, not a row. The place you open. Node maps say where
	// files land. Packages are what the project depends on. Output is what
	// Roswaal writes and code it did not write, folded until something is wrong.
	//
	// Whether a file is ours still decides how it behaves -- whether it can be
	// renamed, whether a new graph can go beside it -- and isGraph says so.
	const groups = useMemo(() => {
		const owned = [sourceDir, ...nodePaths].filter(Boolean);
		// Overlap in either direction: `.roswaal` contains `sourceDir`, and a
		// top-level `scripts` folder would be inside it. Either way it is ours.
		const isOurs = (p: string) =>
			owned.some((dir) => dir === p || dir.startsWith(p + "/") || p.startsWith(dir + "/"));
		const isPack = (p: string) =>
			nodePaths.some((dir) => dir && (p === dir || p.startsWith(dir + "/")));
		const isGraph = (e: TreeEntry) => isOurs(e.path) || e.kind === "luaurc" || e.kind === "wally";
		const ours = tree.filter((e) => isOurs(e.path));
		const maps: TreeEntry[] = [];
		const gather = (entries: readonly TreeEntry[]) => {
			for (const e of entries) {
				if (e.kind === "nodemap") maps.push(e);
				if (e.children) gather(e.children);
			}
		};
		gather(ours);
		const withoutMaps = (entries: readonly TreeEntry[]): TreeEntry[] =>
			entries
				.filter((e) => e.kind !== "nodemap" && !isPack(e.path))
				.map((e) => (e.children ? { ...e, children: withoutMaps(e.children) } : e));
		const root = findEntry(ours, sourceDir);
		const graphs = withoutMaps(root?.children ?? ours);
		const rest = tree.filter((e) => !isOurs(e.path));
		const isPlace = (e: TreeEntry) => e.kind === "place" || e.kind === "model";
		// Places not in use wait in .roswaal/places, and are listed with the one that is.
		const waiting = (findEntry(ours, ".roswaal/places")?.children ?? []).filter(
			(e) => e.kind === "place",
		);
		// Each pack folder's contents, as Graphs lists the graphs' folder's.
		const packs = nodePaths
			.map((dir) => findEntry(ours, dir))
			.filter((e): e is TreeEntry => e !== undefined)
			.flatMap((e) => e.children ?? []);
		return {
			graphs,
			place: [...rest.filter(isPlace), ...waiting],
			maps,
			packages: rest.find((e) => e.kind === "wally")?.children ?? [],
			wally: rest.find((e) => e.kind === "wally"),
			// Output starts inside the output folder, as Graphs starts inside the
			// graphs' folder: both are settings, and the two headings then mirror
			// each other row for row. What is outside it follows.
			output: [
				...((outDir ? findEntry(rest, outDir) : undefined)?.children ?? []),
				...rest.filter(
					(e) => !isPlace(e) && e.kind !== "wally" && e.path !== outDir && e.role !== "packages",
				),
			],
			packs,
			isGraph,
			isPack,
		};
	}, [tree, sourceDir, nodePaths, outDir]);

	/**
	 * Output's marks. A file worth a look carries one: stale (its graph is
	 * gone), hand-written, imported (hand-written, with a graph now), or place
	 * (a script only the place holds). A folder holding only generated Luau has
	 * none, starts folded, and says how many files it holds; Wally's folders
	 * fold the same way. Output's count is the marked files.
	 */
	const output = useMemo(() => {
		const marks = new Map<string, "stale" | "hand-written" | "imported" | "place">();
		const folded = new Map<string, string>();
		const staleSet = new Set(stale ?? []);
		const visit = (e: TreeEntry): { only: boolean; count: number } => {
			if (e.kind === "directory") {
				if (e.role === "packages") {
					folded.set(e.path, "Wally");
					return { only: false, count: 0 };
				}
				const kids = e.children ?? [];
				let only = kids.length > 0;
				let count = 0;
				for (const child of kids) {
					const below = visit(child);
					if (!below.only) only = false;
					count += below.count;
				}
				if (only && count > 0) folded.set(e.path, `${count} generated`);
				return { only, count };
			}
			if (staleSet.has(e.path)) {
				marks.set(e.path, "stale");
				return { only: false, count: 0 };
			}
			if (e.kind === "luau" && e.generatedFrom) return { only: true, count: 1 };
			if (e.kind === "luau") {
				marks.set(
					e.path,
					e.path === "place" || e.path.startsWith("place/")
						? "place"
						: e.graph
							? "imported"
							: "hand-written",
				);
			}
			return { only: false, count: 0 };
		};
		for (const e of groups.output) visit(e);
		return { marks, folded };
	}, [groups, stale]);

	/**
	 * Whether a folder is shut. Output's generated-only folders start shut, so
	 * for them being in `collapsed` means open: one click flips either way.
	 */
	const shut = (path: string) => collapsed.has(path) !== output.folded.has(path);

	/** The place in use: its row says so, and Add offers a copy of it. */
	const inUsePlace = groups.place.find((e) => e.kind === "place" && e.inUse);

	// Asked from elsewhere -- a map's path chip -- to show a file or folder:
	// unfold its heading and the folders above it, select it, scroll to it.
	useEffect(() => {
		const onShow = (e: Event) => {
			const path = (e as CustomEvent<string>).detail;
			const section = SECTIONS.find((one) => {
				const entries: readonly TreeEntry[] = groups[one.id];
				return entries.some(
					(entry) => entry.path === path || findEntry([entry], path) !== undefined,
				);
			});
			if (!section) return;
			setCollapsed((was) => {
				const next = new Set(was);
				next.delete(sectionKey(section.id));
				const parts = path.split("/");
				for (let i = 1; i < parts.length; i++) next.delete(parts.slice(0, i).join("/"));
				return next;
			});
			setSelected(new Set([path]));
			setAnchor(path);
			requestAnimationFrame(() => {
				const row = document.querySelector(`.tree-row[data-entry="${CSS.escape(path)}"]`);
				row?.scrollIntoView({ block: "nearest" });
			});
		};
		window.addEventListener(SHOW_ENTRY, onShow);
		return () => window.removeEventListener(SHOW_ENTRY, onShow);
	}, [groups]);

	// Visible rows in display order, which is what shift-range needs.
	const rows = useMemo(() => {
		const fnsOf = (entry: TreeEntry) => outline.get(entry.path) ?? entry.functions ?? [];
		const out: Row[] = [];
		for (const section of SECTIONS) {
			const entries = groups[section.id];
			// Output only when there is something in it; Packages only where
			// packages can be added or some are listed.
			if ((section.id === "output" || section.id === "packs") && entries.length === 0) continue;
			if (section.id === "packages" && entries.length === 0 && !onPackage && !groups.wally)
				continue;
			out.push({ section, entry: SECTION_ENTRY, depth: 0 });
			if (collapsed.has(sectionKey(section.id))) continue;
			if (entries.length === 0) {
				const note = EMPTY_NOTE[section.id];
				if (note) out.push({ entry: SECTION_ENTRY, depth: 1, note });
				continue;
			}
			if (section.id === "packages") {
				for (const realm of REALMS) {
					const mine = entries.filter((e) => e.path.split("/")[1] === realm.id);
					if (mine.length === 0) continue;
					const landing = landingOfFolder(groups.maps, realm.folder);
					const key = `::realm:${realm.id}`;
					out.push({
						entry: { path: key, name: realm.label, kind: "directory" },
						depth: 1,
						realm: {
							...realm,
							...(landing ? { landing } : {}),
							mapped: landing !== undefined,
							installed: findEntry(tree, realm.folder) !== undefined,
						},
					});
					if (!collapsed.has(key)) out.push(...flatten(mine, shut, 2, fnsOf, expanded));
				}
				continue;
			}
			const listed = flatten(entries, shut, 1, fnsOf, expanded);
			if (section.id !== "maps") {
				out.push(...listed);
				continue;
			}
			// A map opened shows what it syncs, each a row that opens the map there.
			for (const row of listed) {
				out.push(row);
				const facts = row.entry.mapFacts;
				if (row.entry.kind !== "nodemap" || !facts || !expanded.has(row.entry.path)) continue;
				for (const sync of facts.syncs) out.push({ entry: row.entry, depth: row.depth + 1, sync });
			}
		}
		return out;
	}, [groups, collapsed, outline, expanded, onPackage, output]);
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
	/**
	 * Graphs and folders under Graphs whose Luau no node map syncs: written,
	 * and never seen by Rojo. A folder only passing through to a synced one
	 * inside it, as ReplicatedStorage does to Tank, reaches Studio that way and
	 * is not counted. Only once the project has a map writing a project file:
	 * before that, nothing syncs, and saying so on every row says nothing.
	 */
	const unsynced = useMemo(() => {
		const out = new Set<string>();
		if (!groups.maps.some((m) => m.mapFacts?.output)) return out;
		const visit = (e: TreeEntry, covered: boolean): boolean => {
			const here = covered || e.syncedBy !== undefined;
			if (e.kind === "nodescript") {
				if (!here) out.add(e.path);
				return here;
			}
			if (e.kind !== "directory") return true;
			let reaches = here;
			for (const child of e.children ?? []) if (visit(child, here)) reaches = true;
			if (!reaches) out.add(e.path);
			return reaches;
		};
		for (const e of groups.graphs) visit(e, false);
		return out;
	}, [groups]);

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
		const opening = shut(entry.path);
		const next = new Set(collapsed);
		for (const path of paths) {
			// In the set means shut, except for a generated-only folder, where it means open.
			if (opening !== output.folded.has(path)) next.delete(path);
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
		// A move within the tree, and a copy anywhere else: the canvas and the
		// Modules heading take the file without moving it. A browser refuses a
		// drop whose effect the drag does not allow, so "move" alone was a red
		// circle over both.
		e.dataTransfer.effectAllowed = "copyMove";
	}

	/**
	 * A folder of graphs moves as a file does, and a script with children is
	 * one: dragged, rather than clicked, which still opens and closes it. A
	 * folder a node map syncs moves too, and the map follows it. Not the graphs'
	 * own root, a service's folder -- the service stays where Studio has it --
	 * or anything Roswaal writes.
	 */
	function movableFolder(entry: TreeEntry): boolean {
		if (entry.kind !== "directory" || !groups.isGraph(entry)) return false;
		if (!sourceDir || !entry.path.startsWith(`${sourceDir}/`)) return false;
		return entry.role !== "service";
	}

	function onDrop(e: DragEvent, dir: string) {
		e.preventDefault();
		setDropTarget(null);
		const raw = e.dataTransfer.getData("application/x-roswaal");
		if (!raw) return;
		const paths = JSON.parse(raw) as string[];
		const movable = paths.filter(
			(p) =>
				// Already here, or a folder dropped on itself or inside itself.
				(!p.startsWith(dir + "/") || p.slice(dir.length + 1).includes("/")) &&
				p !== dir &&
				!dir.startsWith(p + "/"),
		);
		if (movable.length) onMove(movable, dir);
	}

	/**
	 * The Luau a graph compiles to, or a script folder's graph: the same folder
	 * under the output folder, named by the script it becomes. Worked out from
	 * the path and the script, as the compiler names it, so nothing compiles.
	 */
	const luauOf = (entry: TreeEntry): { graph: string; luau: string } | undefined => {
		const graph = entry.kind === "nodescript" ? entry.path : entry.script;
		if (!graph || !outDir || !graph.startsWith(`${sourceDir}/`)) return undefined;
		const rest = graph.slice(sourceDir.length + 1);
		const slash = rest.lastIndexOf("/");
		const name = rest.slice(slash + 1).replace(/\.nodescript$/, "");
		const suffix =
			entry.realm === "server"
				? ".server.luau"
				: entry.realm === "client"
					? ".client.luau"
					: ".luau";
		const dir = slash === -1 ? "" : rest.slice(0, slash);
		return { graph, luau: [outDir, dir, name + suffix].filter(Boolean).join("/") };
	};

	// Graphs and maps with edits not saved yet: the dot their tabs carry.
	const open = useDocuments();
	const unsaved = useMemo(() => new Set(open.filter((d) => d.dirty).map((d) => d.path)), [open]);

	/** What a menu entry does, by the action `treeMenus.ts` names it with. */
	const runTreeAction = (action: TreeAction, entry: TreeEntry) => {
		const dir = parentDirOf(entry);
		switch (action) {
			case "openLuau": {
				const file = luauOf(entry)?.luau;
				const found = file ? findEntry(tree, file) : undefined;
				return found ? onOpen(found) : undefined;
			}
			case "removeStale":
				return onDelete([entry.path]);
			case "serveMap":
				return onServeMap?.(entry.path);
			case "revealLuau": {
				const file = luauOf(entry)?.luau;
				return file ? onReveal(file) : undefined;
			}
			case "packageZip":
				return onPackage?.("zip", entry);
			case "wally":
				return onPackage?.("wally");
			case "zip":
				return onPackage?.("zip");
			case "github":
				return onPackage?.("github");
			case "removePackage":
				return onPackage?.("remove", entry);
			case "newGraph":
				if (onNewGraphNear && (entry.script || entry.kind === "nodescript"))
					return onNewGraphNear(entry.script ?? entry.path);
				return onNewGraph(dir);
			case "newMap":
				return onNewMap(dir);
			case "import":
				return onImport?.(entry);
			case "importMany":
				return onImportMany?.(importable(manyFrom(entry)));
			case "newFolder":
				return onNewFolder(dir);
			case "reveal":
				return onReveal(entry.path);
			case "rename":
				return onRename(entry.path);
			case "delete":
				return onDelete(selected.has(entry.path) ? [...selected] : [entry.path]);
		}
	};

	return (
		<div className="tree">
			{rows.map(({ entry, depth, section, fn, note, sync, realm }) => {
				if (realm) {
					const open = !collapsed.has(entry.path);
					const writes = groups.maps.some((m) => m.mapFacts?.output);
					return (
						<div
							key={entry.path}
							className={cx(
								"tree-row realm-row",
								writes && realm.installed && !realm.mapped && realm.id !== "dev" && "unsynced",
							)}
							style={depthStyle(depth, 1)}
							title={
								realm.landing
									? `${realm.folder}/, which Wally installs ${realm.label.toLowerCase()} packages into, lands in ${realm.landing}.`
									: `${realm.folder}/: no node map syncs it, so Studio never sees these packages.`
							}
							onClick={() => toggle(entry.path)}
						>
							<Icon name="chevron" size={14} className="twist" rotate={open ? 0 : -90} />
							<Icon
								name={open ? "folderOpenFilled" : "folderFilled"}
								size={15}
								className="kind tree-folder-packages"
							/>
							<span className="label">{realm.label}</span>
							<span className="tree-map-path">
								{realm.folder}/
								{realm.landing
									? ` → ${realm.landing}`
									: realm.installed
										? " · no map syncs it"
										: " · not installed yet"}
							</span>
							{!realm.mapped && realm.installed && writes && realm.id !== "dev" && onMapRealm && (
								<button
									type="button"
									className="tb tree-open"
									title={`Map ${realm.folder}/ into ${realm.id === "shared" ? "ReplicatedStorage" : "ServerScriptService"} › ${realm.folder}, in the served map`}
									onClick={(e) => {
										e.stopPropagation();
										onMapRealm(realm.id as "shared" | "server");
									}}
								>
									add to map
								</button>
							)}
						</div>
					);
				}
				if (sync) {
					return (
						<div
							key={`${entry.path}@${sync.id}`}
							className="tree-row map-sync-row"
							data-entry={`${entry.path}@${sync.id}`}
							style={depthStyle(depth, 1)}
							title={`${sync.trail}, synced from ${sync.path}. Click to open the map there.`}
							onClick={() => {
								requestMapPick(entry.path, sync.id);
								onOpen(entry);
							}}
						>
							<ExplorerIcon
								className={sync.className ?? sync.trail.split(" › ").pop() ?? "Folder"}
								service={sync.service}
								open={false}
							/>
							<span className="label">{sync.trail}</span>
							<span className="tree-map-path">{sync.path}</span>
						</div>
					);
				}
				if (note) {
					return (
						<div key={`note:${note}`} className="tree-row tree-note" style={depthStyle(depth, 1)}>
							<span className="label">{note}</span>
						</div>
					);
				}
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
					const id = section.id;
					// Dropping on Graphs moves a file to the graphs' own root, the
					// folder whose row the heading stands in for.
					const dropsHere = id === "graphs" && sourceDir !== "";
					return (
						<div
							key={sectionKey(id)}
							className={cx(
								"tree-section",
								shut && "shut",
								dropsHere && dropTarget === sourceDir && "drop-target",
							)}
							onDragOver={
								dropsHere
									? (e) => {
											e.preventDefault();
											e.dataTransfer.dropEffect = "move";
											setDropTarget(sourceDir);
										}
									: undefined
							}
							onDragLeave={
								dropsHere ? () => setDropTarget((t) => (t === sourceDir ? null : t)) : undefined
							}
							onDrop={dropsHere ? (e) => onDrop(e, sourceDir) : undefined}
						>
							<SectionHead
								title={section.label}
								hint={section.hint}
								count={id === "output" ? output.marks.size : countOf(id, groups)}
								open={!shut}
								onToggle={() => toggle(sectionKey(id))}
							>
								{id === "graphs" && sourceDir !== "" && !menuNews && (
									<AddButton
										label="New graph"
										title="A new graph at the graphs' own root"
										onClick={() => onNewGraph(sourceDir)}
									/>
								)}
								{id === "maps" && sourceDir !== "" && !menuNews && (
									<AddButton
										label="New map"
										title="A new node map at the graphs' own root"
										onClick={() => onNewMap(sourceDir)}
									/>
								)}
								{id === "packages" && onPackage && (
									<AddButton
										title="Add a package: from Wally, a zip, or a GitHub repository"
										onClick={(e) => {
											const at = e.currentTarget.getBoundingClientRect();
											setMenu({
												x: at.left,
												y: at.bottom,
												entry: groups.wally ?? WALLY_ENTRY,
											});
										}}
									/>
								)}
								{id === "place" && onAddPlace && (
									<AddButton
										label={inUsePlace ? "Add" : "Add Place"}
										title={
											inUsePlace
												? "Another place, kept in .roswaal/places: a copy of this one, a place file, or a baseplate."
												: "This project has no place. Import a .rbxl or .rbxlx, or start from a baseplate."
										}
										onClick={(e) => setPlaceMenu(e.currentTarget)}
									/>
								)}
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
							// The folder the More menu's New graph would use, where
							// that menu is the way in: a narrow window or a phone.
							// Marked rather than left implicit, because a command that
							// acts on something you clicked earlier has to show what.
							// Elsewhere each folder has its own buttons.
							menuNews &&
								isDir &&
								entry.path === targetDir &&
								holdsGraphs(entry.path) &&
								"target-dir",
							(openPath === entry.path || (entry.script && openPath === entry.script)) &&
								"open-doc",
							readonly && "readonly",
							isDir && !entry.script && (entry.children?.length ?? 0) === 0 && "tree-empty",
							entry.generatedFrom && !output.marks.has(entry.path) && "tree-generated",
							dropTarget === entry.path && "drop-target",
							unsynced.has(entry.path) && "unsynced",
						)}
						style={depthStyle(depth, 1)}
						data-entry={entry.path}
						draggable={(!isDir || movableFolder(entry)) && !isListed(entry)}
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
						onDoubleClick={() => {
							// A node pack opens in Node Design, where packs are edited.
							if (onNodePacks && groups.isPack(entry.path)) {
								onNodePacks();
								return;
							}
							// A script with children opens as its graph, as a graph does.
							const opens = isDir ? entry.children?.find((c) => c.path === entry.script) : entry;
							if (opens && opens.kind !== "wally" && !opens.missing) onOpen(opens);
						}}
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
							luauOf(entry)
								? [
										`Graph: ${luauOf(entry)?.graph}`,
										`Luau: ${luauOf(entry)?.luau}`,
										...(unsynced.has(entry.path)
											? ["No node map syncs it, so Rojo never sees its Luau."]
											: []),
									].join("\n")
								: unsynced.has(entry.path)
									? `${entry.path}: no node map syncs this, so Rojo never sees its Luau. Map it, or move it into a synced folder.`
									: entry.kind === "package"
										? entry.missing
											? `${entry.name} is in wally.toml, and not installed: run wally install.`
											: `${entry.name} ${shownVersion(entry)}. Double-click to open ${entry.target}.`
										: entry.script
											? `${entry.name}, a script with children. Double-click to open its graph.`
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
									rotate={shut(entry.path) ? -90 : 0}
								/>
								<Icon name="settings" size={15} className="kind wally" />
							</>
						) : isDir ? (
							<>
								<Icon
									name="chevron"
									size={14}
									className="twist"
									rotate={shut(entry.path) ? -90 : 0}
								/>
								{entry.script ? (
									entry.realm ? (
										<ScriptIcon
											kind="nodescript"
											realm={entry.realm}
											size={15}
											className={cx("kind nodescript", realmClass(entry.realm))}
										/>
									) : (
										<Icon name={KIND_ICONS.nodescript} size={15} className="kind nodescript" />
									)
								) : (
									<MapBadge map={entry.syncedBy}>
										{namedClass(entry) ? (
											<ExplorerIcon
												className={namedClass(entry) as string}
												service={isService(entry.name)}
												open={!shut(entry.path)}
											/>
										) : (
											<Icon
												name={folderIcon(shut(entry.path), entry.role !== undefined)}
												size={15}
												className={folderClass(entry, groups.isGraph(entry))}
											/>
										)}
									</MapBadge>
								)}
							</>
						) : (
							<>
								{/* A graph with functions opens like a folder, onto them; a map, onto what it syncs. */}
								{((outline.get(entry.path) ?? entry.functions ?? []).length > 0 ||
									(entry.mapFacts?.syncs.length ?? 0) > 0) && (
									<span
										className="function-twist"
										title={
											entry.kind === "nodemap"
												? expanded.has(entry.path)
													? "Hide what it syncs"
													: "Show what it syncs"
												: expanded.has(entry.path)
													? "Hide its functions"
													: "Show its functions"
										}
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
								{(() => {
									const realm =
										entry.kind === "luau"
											? realmOfLuau(entry.path)
											: entry.kind === "nodescript"
												? entry.realm
												: undefined;
									return realm && (entry.kind === "luau" || entry.kind === "nodescript") ? (
										<ScriptIcon
											kind={entry.kind}
											realm={realm}
											size={15}
											className={cx("kind", entry.kind, realmClass(realm))}
										/>
									) : (
										<Icon
											name={KIND_ICONS[entry.kind as keyof typeof KIND_ICONS]}
											size={15}
											className={cx(
												"kind",
												entry.kind,
												entry.kind === "luau" && scriptClass(entry.name),
												entry.kind === "nodescript" && realmClass(entry.realm),
											)}
										/>
									);
								})()}
							</>
						)}
						<span className="label">{shownName(entry)}</span>
						{(unsaved.has(entry.path) || (entry.script && unsaved.has(entry.script))) && (
							<span className="tree-dirty" title="Edits not saved yet" />
						)}
						{entry.mapFacts && <MapRowFacts facts={entry.mapFacts} />}
						{isDir && !entry.script && (entry.children?.length ?? 0) === 0 && (
							<span className="badge">empty</span>
						)}
						{entry.kind === "place" && entry.inUse && <span className="badge">in use</span>}
						{entry.kind === "place" && (
							<button
								type="button"
								className="tb tree-open"
								title={
									entry.inUse || !entry.path.startsWith(".roswaal/places/")
										? `Open ${entry.name}`
										: `Use ${entry.name}: it takes the place of the one in use`
								}
								onClick={(e) => {
									e.stopPropagation();
									onOpen(entry);
								}}
								onDoubleClick={(e) => e.stopPropagation()}
							>
								{entry.inUse || !entry.path.startsWith(".roswaal/places/") ? "Open" : "Use"}
							</button>
						)}
						{output.folded.has(entry.path) && (
							<span className="badge">{output.folded.get(entry.path)}</span>
						)}
						{output.marks.has(entry.path) && (
							<span
								className={cx("badge", output.marks.get(entry.path) === "stale" && "warn")}
								title={MARK_TITLE[output.marks.get(entry.path) as keyof typeof MARK_TITLE]}
							>
								{output.marks.get(entry.path)}
							</span>
						)}
						{entry.kind === "package" && !entry.missing ? (
							<span className="badge">{shownVersion(entry)}</span>
						) : (
							entry.version && <span className="badge">{entry.version}</span>
						)}
						{entry.missing && <span className="badge">not installed</span>}
						{/* New graph and New node map, in this folder. Their clicks stop
						    here, so pressing one never folds or opens the folder. */}
						{(isDir || entry.kind === "nodescript") && holdsGraphs(entry.path) && (
							<span
								className="tree-row-actions"
								onClick={(e) => e.stopPropagation()}
								onDoubleClick={(e) => e.stopPropagation()}
							>
								{/* A graph's New graph asks inside or beside, as its menu does;
								    its New folder goes beside it. A folder's are inside it. */}
								<button
									type="button"
									className="tb icon-only"
									title={
										isDir && !entry.script
											? `New graph in ${entry.name}`
											: `New graph by ${shownName(entry)}`
									}
									aria-label={
										isDir && !entry.script
											? `New graph in ${entry.name}`
											: `New graph by ${shownName(entry)}`
									}
									onClick={() => runTreeAction("newGraph", entry)}
								>
									<Icon name="newFile" size={14} />
								</button>
								<button
									type="button"
									className="tb icon-only"
									title={
										isDir ? `New folder in ${entry.name}` : `New folder beside ${shownName(entry)}`
									}
									aria-label={
										isDir ? `New folder in ${entry.name}` : `New folder beside ${shownName(entry)}`
									}
									onClick={() => runTreeAction("newFolder", entry)}
								>
									<Icon name="newFolder" size={14} />
								</button>
							</span>
						)}
					</div>
				);
			})}
			{rows.length === 0 && (
				<div className="tree-row readonly">
					<span className="label">Nothing to show yet.</span>
				</div>
			)}
			{placeMenu && onAddPlace && (
				<Menu
					at={{ element: placeMenu, align: "end" }}
					label="Add Place"
					onClose={() => setPlaceMenu(null)}
					sections={[
						{
							label: inUsePlace ? "Kept in .roswaal/places" : undefined,
							entries: [
								inUsePlace && {
									label: `Copy of ${inUsePlace.name}`,
									icon: "copy",
									hint: "as the file is",
									run: () => onAddPlace("copy"),
								},
								{
									label: "Import a place file\u2026",
									icon: "folderOpen",
									hint: ".rbxl or .rbxlx",
									run: () => onAddPlace("import"),
								},
								{
									label: "Start from a baseplate",
									icon: "build",
									hint: "As a new project starts",
									run: () => onAddPlace("new"),
								},
							],
						},
					]}
				/>
			)}

			{menu && (isListed(menu.entry) ? onPackage : true) && (
				<Menu
					at={menu}
					label={menu.entry.name}
					onClose={() => setMenu(null)}
					sections={(isListed(menu.entry)
						? packageMenu(menu.entry, { canGithub, notHere: NOT_HERE })
						: fileMenu(menu.entry, {
								holdsGraphs: holdsGraphs(parentDirOf(menu.entry)),
								canImport: onImport !== undefined,
								...(onImportMany && (multiple(menu.entry) || menu.entry.kind === "directory")
									? {
											importMany: {
												from: multiple(menu.entry) ? "selection" : "folder",
												files: importable(manyFrom(menu.entry)).length,
											},
										}
									: {}),
								canGithub,
								canReveal,
								notHere: NOT_HERE,
								...(output.marks.get(menu.entry.path) === "stale" ? { stale: true } : {}),
								...(onServeMap &&
								menu.entry.mapFacts?.output !== undefined &&
								!menu.entry.mapFacts.serves
									? { canServe: true }
									: {}),
								...(luauOf(menu.entry) && findEntry(tree, luauOf(menu.entry)?.luau ?? "")
									? { luau: luauOf(menu.entry)?.luau }
									: {}),
							})
					).map((entries) => ({
						entries: entries.map(({ action, ...shown }) => ({
							...shown,
							run: () => runTreeAction(action, menu.entry),
						})),
					}))}
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
	/** A line under an empty heading, saying what goes there. */
	note?: string;
	/** A Wally realm under Packages: its folder, and where a map lands it. */
	realm?: RealmRow;
	/** Something a map syncs, listed under the map, which `entry` is. */
	sync?: NonNullable<TreeEntry["mapFacts"]>["syncs"][number];
}

interface Section {
	id: "graphs" | "place" | "maps" | "packages" | "output" | "packs";
	label: string;
	hint: string;
}

/**
 * Graphs first, because the top of a list is where the thing you touch every
 * minute belongs; then where files land and what the project depends on; then
 * the place, beside what Roswaal writes into it; then what Roswaal writes; and
 * last the node packs, which a project touches least, folded.
 */
const SECTIONS: readonly Section[] = [
	{
		id: "graphs",
		label: "Graphs",
		hint: "Your graphs, from the services down. Roswaal compiles each to Luau.",
	},
	{
		id: "maps",
		label: "Node maps",
		hint: "Where your files land in Studio. Each map writes a Rojo project file.",
	},
	{
		id: "packages",
		label: "Packages",
		hint: "What wally.toml depends on, installed by Wally.",
	},
	{
		id: "place",
		label: "Place",
		hint: "The place file and models. Open a place to see it in the Place Editor.",
	},
	{
		id: "output",
		label: "Output",
		hint: "What Roswaal writes, and code it did not: the compiled Luau, hand-written Luau, Wally's folders.",
	},
	{
		id: "packs",
		label: "Node packs",
		hint: "The nodes this project adds. Double-click a pack to open Node Design.",
	},
];

/** What an empty heading says. */
const EMPTY_NOTE: Partial<Record<Section["id"], string>> = {
	graphs: "No graphs yet. New graph makes one.",
	place: "No place file.",
	maps: "No node maps.",
	packages: "No packages yet. Add one with Add.",
};

/** How many things a heading holds: graphs, places, maps, packages, files. */
function countOf(id: Section["id"], groups: Record<Section["id"], TreeEntry[]>): number {
	const files = (entries: readonly TreeEntry[]): number =>
		entries.reduce(
			(n, e) =>
				n +
				(e.children ? files(e.children) : 0) +
				(id === "graphs" ? Number(e.kind === "nodescript") : Number(e.kind !== "directory")),
			0,
		);
	return id === "output" || id === "graphs" || id === "packs"
		? files(groups[id])
		: groups[id].length;
}

/** The entry at a path, wherever it is in the tree. */
function findEntry(entries: readonly TreeEntry[], path: string): TreeEntry | undefined {
	for (const e of entries) {
		if (e.path === path) return e;
		if (e.children && path.startsWith(e.path + "/")) {
			const found = findEntry(e.children, path);
			if (found) return found;
		}
	}
	return undefined;
}

/**
 * A row's name: a graph or a map without its extension, since its heading
 * already says what it is. Every other file keeps its whole name.
 */
function shownName(entry: TreeEntry): string {
	if (entry.kind === "nodescript") return entry.name.replace(/.nodescript$/, "");
	if (entry.kind === "nodemap") return entry.name.replace(/.nodemap$/, "");
	return entry.name;
}

/**
 * The Roblox class a folder is named for, when it has an icon of its own: a
 * service, or a container such as StarterPlayerScripts. Matched by name, so the
 * folder reads as Studio's Explorer shows the instance it becomes.
 */
function namedClass(entry: TreeEntry): string | undefined {
	if (entry.kind !== "directory" || entry.script) return undefined;
	if (isService(entry.name)) return entry.name;
	return isInstanceClass(entry.name) && wearsClassIcon(entry.name) && entry.name !== "Folder"
		? entry.name
		: undefined;
}

/**
 * What a map's row says after its name: the project file it writes, with a
 * dot for whether that file is written as the map has it; serve on the one
 * `rojo serve` reads; and a clash with another map writing the same file.
 */
function MapRowFacts({ facts }: { facts: NonNullable<TreeEntry["mapFacts"]> }) {
	if (!facts.output) return null;
	const file = facts.output.split("/").pop() ?? facts.output;
	const dot =
		facts.clash !== undefined
			? { tone: "bad", title: `Not written: ${facts.clash} writes ${facts.output} too.` }
			: facts.state === "same"
				? { tone: "ok", title: `${facts.output} is written as the map has it.` }
				: facts.state === "differs"
					? {
							tone: "warn",
							title: `${facts.output} differs from the map. Write project file brings it up to date.`,
						}
					: { tone: "warn", title: `${facts.output} is not written yet.` };
	return (
		<>
			<span className="tree-map-output" title={dot.title}>
				<span className={cx("tree-dot", dot.tone)} aria-hidden="true" />
				{file}
			</span>
			{facts.serves && (
				<span className="badge" title="rojo serve reads default.project.json: this map's.">
					serve
				</span>
			)}
			{facts.clash !== undefined && (
				<span
					className="badge warn"
					title={`${facts.clash} writes ${facts.output} too. Neither writes until one writes another file.`}
				>
					clash
				</span>
			)}
		</>
	);
}

/** Wally's realms, each a folder Wally installs into. */
interface RealmRow {
	id: "shared" | "server" | "dev";
	label: string;
	folder: string;
	/** Where a map lands the folder in Studio: "ReplicatedStorage › Packages". */
	landing?: string;
	mapped: boolean;
	/** Its folder is on disk: wally install has run for it. */
	installed: boolean;
}

const REALMS: readonly Omit<RealmRow, "landing" | "mapped" | "installed">[] = [
	{ id: "shared", label: "Shared", folder: "Packages" },
	{ id: "server", label: "Server", folder: "ServerPackages" },
	{ id: "dev", label: "Dev", folder: "DevPackages" },
];

/** Where the maps land a folder, from what each syncs: the first map's that does. */
function landingOfFolder(maps: readonly TreeEntry[], folder: string): string | undefined {
	for (const map of maps) {
		const found = map.mapFacts?.syncs.find((one) => one.path === folder);
		if (found) return found.trail;
	}
	return undefined;
}

/** What each of Output's marks means, on hover. */
const MARK_TITLE = {
	stale: "Its graph is gone, so nothing writes it now. Remove it from its menu.",
	"hand-written": "Written by hand, not by a graph. Import as graph turns it into one.",
	imported: "Written by hand, with a graph imported from it.",
	place: "A script only the place holds, which Modify RBXL writes.",
} as const;

/** The node map's mark in an icon's corner, for a folder a map syncs. */
function MapBadge({ map, children }: { map: string | undefined; children: ReactNode }) {
	if (!map) return <>{children}</>;
	return (
		<span className="tree-badged" title={`Synced by ${map.split("/").pop()}`}>
			{children}
			<span className="tree-map-badge" aria-hidden="true">
				<Icon name="map" size={10} />
			</span>
		</span>
	);
}

/** Packages are listed under wally.toml; a project without one adds to a new one. */
const WALLY_ENTRY: TreeEntry = { path: "wally.toml", name: "wally.toml", kind: "wally" };

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
/**
 * The version a package row shows: its own, or 1.0.0 for one with none, such as
 * code put in a package's place. Shown only: wally.toml is never given it, so
 * `wally install` is not sent looking for a 1.0.0 that is not this package.
 */
export function shownVersion(entry: TreeEntry): string {
	return entry.version ?? "1.0.0";
}

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
	isShut: (path: string) => boolean,
	depth: number,
	fnsOf: (entry: TreeEntry) => FunctionInfo[],
	expanded: ReadonlySet<string>,
	/** A script folder's own graph, which its folder's row stands for. */
	hide?: string,
): Row[] {
	const out: Row[] = [];
	for (const entry of entries) {
		if (entry.path === hide) continue;
		out.push({ entry, depth });
		if (entry.children && !isShut(entry.path)) {
			out.push(...flatten(entry.children, isShut, depth + 1, fnsOf, expanded, entry.script));
		}
		if (entry.kind === "nodescript" && expanded.has(entry.path)) {
			for (const fn of fnsOf(entry)) out.push({ entry, depth: depth + 1, fn });
		}
	}
	return out;
}
