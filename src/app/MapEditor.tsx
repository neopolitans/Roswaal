/**
 * The node map editor: its own mode, as the Place Editor is.
 *
 * A `.nodemap` is a tree, not a graph, so the centre is a tree rather than a
 * canvas. What sits around it are panels like any other -- docked, folded,
 * moved, floated or closed from the Panels menu -- because a map is read in
 * different proportions at different times: the tree while it is built, the
 * project file while checking what Rojo will be told.
 *
 * - **Instance**, on the right: the picked row's fields.
 * - **This map**, under it: what the map is, the file it writes, and Rojo's
 *   place settings.
 * - **Project file**, along the foot: what the map writes, the picked row's
 *   lines lit, and whether the file on disk matches.
 *
 * The tree reads from either end. From the DataModel, each instance shows the
 * folder that fills it; from the output folder, each folder shows where it
 * lands. Either way the other side comes from the reading rule (`mapRule.ts`),
 * so a map is built by breaking one hierarchy down, and only a mapping that
 * breaks the rule asks you to think about both.
 *
 * `useMapEditor` holds what the four share -- the picked row, the folds, the
 * undo history, and every change -- so each draws from one place.
 */

import {
	type DragEvent,
	type KeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { type MapFigureLine, mapFigure } from "../core/docs/mapFigure.js";
import {
	landingOf,
	mapAt,
	newFolderFor,
	type RuleException,
	renameByRule,
	ruleExceptions,
	ruleLanding,
	rulePath,
	syncedFolderOf,
	trailOf,
} from "../core/mapRule.js";
import {
	COMMON_SERVICES,
	CONTAINER_CLASSES,
	compileNodeMap,
	emptyMap,
	findMapNode,
	isFilesystemMap,
	type MapCompileResult,
	type MapNode,
	mapNodeMove,
	mapNodeParent,
	mapNodeRemove,
	mapNodeUpdate,
	type NodeMap,
} from "../core/nodemap.js";
import { isService } from "../core/roblox.js";
import { mappedPaths, normalisePath } from "../core/rojoPaths.js";
import { api, type TreeEntry } from "./api.js";
import { PanelHead } from "./Cards.jsx";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import { FolderPicker } from "./FolderPicker.jsx";
import { Icon } from "./icons.jsx";
import { Menu, MenuSurface } from "./Menu.jsx";
import {
	entryAt,
	type FolderState,
	folderExists,
	folderState,
	foldersUnder,
	graphFolderOf,
	outputFolderOf,
} from "./mapDisk.js";
import type { MenuSection } from "./menuModel.js";
import type { MenuAnchor } from "./menuPlace.js";
import { trackPointer } from "./pointer.js";
import { Toggle } from "./settingsParts.jsx";
import { showEntry } from "./showEntry.js";
import { newId } from "./store.js";

const HISTORY_LIMIT = 50;

/** A row of a map dragged within the tree. */
const MAP_DRAG = "application/x-roswaal-map";
/** Files and folders dragged from the Project panel. */
const TREE_DRAG = "application/x-roswaal";

/** What the editor is handed: the open map, and what it needs of the project. */
export interface MapEditorInput {
	/** The `.nodemap` file. */
	path: string;
	map: NodeMap;
	dirty: boolean;
	/** The project tree: what is at each path, and the folders to choose from. */
	tree: TreeEntry[];
	/** Where compiled Luau goes, and where the reading rule puts folders. */
	outDir: string;
	/** Where graphs live, mirroring the output folder. */
	sourceDir: string;
	onChange: (next: NodeMap) => void;
	/** Makes a folder inside `parent`, asking its name; the Project panel's New folder. */
	onNewFolder?: (parent: string) => void;
}

/** What is picked: a node of the map, or a folder on disk the map does not name. */
export type MapPick = { kind: "node"; id: string } | { kind: "folder"; path: string };

/** One row of the tree. */
export interface Row {
	key: string;
	depth: number;
	pick: MapPick;
	node?: MapNode;
	/** A folder row's output path. */
	folder?: string;
	parent: boolean;
}

type Where = "before" | "after" | "inside";

/** The editor's shared state and every change it makes. */
export interface MapEditing extends MapEditorInput {
	filesystem: boolean;
	pick: MapPick;
	setPick: (pick: MapPick) => void;
	/** The picked node; the root while a folder on disk is picked is `null`. */
	current: MapNode | null;
	collapsed: ReadonlySet<string>;
	toggle: (key: string) => void;
	view: "dm" | "src";
	setView: (view: "dm" | "src") => void;
	rows: Row[];
	compiled: MapCompileResult;
	lines: MapFigureLine[];
	exceptions: RuleException[];
	odd: ReadonlyMap<string, RuleException>;
	canUndo: boolean;
	undo: () => void;
	commit: (next: NodeMap) => void;
	updateNode: (id: string, patch: Partial<MapNode>) => void;
	rename: (id: string, name: string) => void;
	addChild: (parentId: string, child: MapNode) => void;
	addFolder: (parentId: string) => void;
	addService: (name: string) => void;
	remove: (id: string) => void;
	mapByRule: (folder: string) => boolean;
	mapDropped: (paths: string[], target?: MapNode) => void;
	showFolder: (folder: string) => void;
	/** A folder on disk inside `folder`, asking its name: in its graph folder where it has one. */
	addDiskFolder: (folder: string) => void;
	isFolderPath: (path: string) => boolean;
}

const LAYOUT_KEY = "roswaal.mapLayout";

/** List or Graph, as this browser last chose. */
function readLayoutChoice(): "list" | "graph" {
	try {
		return localStorage.getItem(LAYOUT_KEY) === "graph" ? "graph" : "list";
	} catch {
		return "list";
	}
}

function writeLayoutChoice(layout: "list" | "graph"): void {
	try {
		localStorage.setItem(LAYOUT_KEY, layout);
	} catch {
		// Private browsing: the choice holds until the page is closed.
	}
}

/** Stands in while no map is open, so the hooks run in the same order. */
const NO_MAP = emptyMap("", "none", () => "none");

const looksLikeFolder = (path: string): boolean =>
	!/\.[A-Za-z]+$/.test(path.split("/").pop() ?? "");

const filesText = (count: number): string => `${count} file${count === 1 ? "" : "s"}`;

/** What a folder's chip says after its path, and how it is drawn. */
function stateWords(state: FolderState): { text: string; tone: string; title: string } {
	switch (state.kind) {
		case "files":
			return { text: filesText(state.count), tone: "ok", title: "Rojo syncs this folder." };
		case "empty":
			return { text: "empty", tone: "warn", title: "The folder is there, with nothing in it yet." };
		case "file":
			return { text: "a file", tone: "ok", title: "Rojo makes one instance of this file." };
		case "pending":
			return {
				text: "made when written",
				tone: "warn",
				title: "Not there yet: writing the map makes this folder.",
			};
		case "missing":
			return {
				text: "not found",
				tone: "bad",
				title: "Nothing is at this path. Rojo builds an empty instance.",
			};
	}
}

/** The node whose path is `at`, depth first. */
function nodeWithPath(root: MapNode, at: string): MapNode | undefined {
	if (root.path && normalisePath(root.path) === at) return root;
	for (const child of root.children) {
		const found = nodeWithPath(child, at);
		if (found) return found;
	}
	return undefined;
}

/** A name not yet used under `parent`. */
function freeName(parent: MapNode, base: string): string {
	const taken = new Set(parent.children.map((one) => one.name));
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}${n}`)) n++;
	return `${base}${n}`;
}

// ---------------------------------------------------------------------------
// The shared state
// ---------------------------------------------------------------------------

export function useMapEditor(input: MapEditorInput | null): MapEditing | null {
	const map = input?.map ?? NO_MAP;
	const path = input?.path ?? null;
	const tree = input?.tree ?? [];
	const outDir = input?.outDir ?? "src";
	const sourceDir = input?.sourceDir ?? "";
	const filesystem = isFilesystemMap(map);

	const rootPick: MapPick = { kind: "node", id: map.root.id };
	const [opened, setOpened] = useState<string | null>(path);
	const [pick, setPick] = useState<MapPick>(rootPick);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const [history, setHistory] = useState<NodeMap[]>([]);
	const [view, setView] = useState<"dm" | "src">("dm");
	// Another map opened: start it afresh, rather than with this one's picks.
	if (opened !== path) {
		setOpened(path);
		setPick(rootPick);
		setCollapsed(new Set());
		setHistory([]);
	}

	const compiled = useMemo(() => compileNodeMap(map), [map]);
	const lines = useMemo(() => mapFigure(map).lines, [map]);
	const exceptions = useMemo(
		() => (filesystem ? [] : ruleExceptions(map, outDir)),
		[map, outDir, filesystem],
	);
	const odd = useMemo(() => new Map(exceptions.map((one) => [one.node, one])), [exceptions]);
	const current = pick.kind === "node" ? (findMapNode(map.root, pick.id) ?? map.root) : null;

	const isFolderPath = (at: string): boolean => {
		const entry = entryAt(tree, at);
		return entry ? entry.kind === "directory" : looksLikeFolder(at);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: `isFolderPath` reads only `tree`.
	const rows = useMemo<Row[]>(() => {
		const out: Row[] = [];
		const disk = (folder: string) => foldersUnder(tree, folder, outDir, sourceDir);
		if (view === "src" && !filesystem) {
			// Every folder under the output folder, the graph folders that
			// become them, and every folder a mapping names.
			const all = new Set<string>();
			const add = (at: string) => {
				const parts = normalisePath(at).split("/").filter(Boolean);
				for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
			};
			add(outDir);
			const walk = (entry: TreeEntry | undefined, toOut: (at: string) => string) => {
				for (const one of entry?.children ?? []) {
					if (one.kind !== "directory" || one.script !== undefined || one.role === "script")
						continue;
					add(toOut(one.path));
					walk(one, toOut);
				}
			};
			walk(entryAt(tree, outDir), (at) => at);
			walk(entryAt(tree, sourceDir), (at) => outputFolderOf(at, outDir, sourceDir));
			for (const one of mappedPaths(map.root)) if (isFolderPath(one.base)) add(one.base);
			const kids = new Map<string, string[]>();
			const tops: string[] = [];
			for (const at of [...all].sort((a, b) => a.localeCompare(b))) {
				const slash = at.lastIndexOf("/");
				const up = slash === -1 ? "" : at.slice(0, slash);
				if (up === "" || !all.has(up)) tops.push(at);
				else kids.set(up, [...(kids.get(up) ?? []), at]);
			}
			const top = normalisePath(outDir);
			tops.sort((a, b) => (a === top ? -1 : b === top ? 1 : a.localeCompare(b)));
			const visit = (at: string, depth: number) => {
				const mapped = nodeWithPath(map.root, at);
				const key = `folder:${at}`;
				const below = kids.get(at) ?? [];
				out.push({
					key,
					depth,
					pick: mapped ? { kind: "node", id: mapped.id } : { kind: "folder", path: at },
					folder: at,
					...(mapped ? { node: mapped } : {}),
					parent: below.length > 0,
				});
				if (!collapsed.has(key)) for (const one of below) visit(one, depth + 1);
			};
			for (const one of tops) visit(one, 0);
			return out;
		}
		const visitFolder = (at: string, depth: number) => {
			const key = `folder:${at}`;
			const below = disk(at);
			out.push({
				key,
				depth,
				pick: { kind: "folder", path: at },
				folder: at,
				parent: below.length > 0,
			});
			if (!collapsed.has(key)) for (const name of below) visitFolder(`${at}/${name}`, depth + 1);
		};
		const visit = (node: MapNode, depth: number) => {
			// Folders on disk under a synced node, which the map need not name:
			// Rojo brings them in through the folder above.
			const synced =
				!filesystem && node.path && isFolderPath(node.path) ? normalisePath(node.path) : undefined;
			const named = new Set(node.children.map((one) => one.name));
			const below = synced ? disk(synced).filter((name) => !named.has(name)) : [];
			out.push({
				key: node.id,
				depth,
				pick: { kind: "node", id: node.id },
				node,
				parent: node.children.length + below.length > 0,
			});
			if (collapsed.has(node.id)) return;
			for (const child of node.children) visit(child, depth + 1);
			for (const name of below) visitFolder(`${synced}/${name}`, depth + 1);
		};
		visit(map.root, 0);
		return out;
	}, [map, tree, outDir, sourceDir, view, collapsed, filesystem]);

	if (!input) return null;
	const { onChange } = input;

	const commit = (next: NodeMap) => {
		setHistory((h) => [...h.slice(-HISTORY_LIMIT), map]);
		onChange(next);
	};

	const undo = () => {
		const previous = history[history.length - 1];
		if (!previous) return;
		setHistory(history.slice(0, -1));
		onChange(previous);
	};

	const updateNode = (id: string, patch: Partial<MapNode>) =>
		commit({ ...map, root: mapNodeUpdate(map.root, id, (node) => ({ ...node, ...patch })) });

	const rename = (id: string, name: string) =>
		commit({
			...map,
			root: filesystem
				? mapNodeUpdate(map.root, id, (node) => ({ ...node, name }))
				: renameByRule(map, outDir, id, name),
		});

	const addChild = (parentId: string, child: MapNode) => {
		commit({
			...map,
			root: mapNodeUpdate(map.root, parentId, (node) => ({
				...node,
				children: [...node.children, child],
			})),
		});
		setPick({ kind: "node", id: child.id });
		setCollapsed((was) => {
			const next = new Set(was);
			next.delete(parentId);
			return next;
		});
	};

	/**
	 * A folder under a node: on disk where something already syncs the node,
	 * which the Project panel's New folder makes; otherwise a mapping with the
	 * folder the rule gives it.
	 */
	const addFolder = (parentId: string) => {
		const parent = findMapNode(map.root, parentId);
		if (!parent || parent === map.root) return;
		const made = newFolderFor(map, outDir, parentId, "Folder");
		if (made.kind === "disk") {
			const synced = syncedFolderOf(map, parentId) ?? "";
			input.onNewFolder?.(graphFolderOf(synced, outDir, sourceDir) ?? synced);
			return;
		}
		const name = freeName(parent, "Folder");
		addChild(parentId, {
			id: newId(),
			name,
			className: "Folder",
			path: rulePath(outDir, [...trailOf(map, parentId), name]),
			children: [],
		});
	};

	const addService = (name: string) =>
		addChild(map.root.id, { id: newId(), name, path: rulePath(outDir, [name]), children: [] });

	const remove = (id: string) => {
		if (id === map.root.id) return;
		const parent = mapNodeParent(map.root, id);
		commit({ ...map, root: mapNodeRemove(map.root, id) });
		setPick({ kind: "node", id: parent?.id ?? map.root.id });
	};

	const mapByRule = (folder: string): boolean => {
		const landing = ruleLanding(outDir, folder);
		if (!landing) return false;
		const made = mapAt(map.root, landing, folder, newId);
		commit({ ...map, root: made.root });
		setPick({ kind: "node", id: made.id });
		return true;
	};

	/**
	 * Folders dragged in from the Project panel: each where the rule puts it,
	 * or failing that, inside the instance it was dropped on. One already
	 * synced is only picked.
	 */
	const mapDropped = (paths: string[], target?: MapNode) => {
		let next = map;
		let last: MapPick | null = null;
		for (const one of paths) {
			const entry = entryAt(tree, one);
			if (!entry || entry.kind !== "directory") continue;
			const folder = outputFolderOf(one, outDir, sourceDir);
			if (landingOf(next, folder)) {
				last = { kind: "folder", path: folder };
				continue;
			}
			const landing = ruleLanding(outDir, folder);
			if (landing) {
				const made = mapAt(next.root, landing, folder, newId);
				next = { ...next, root: made.root };
				last = { kind: "node", id: made.id };
				continue;
			}
			const host = target ? findMapNode(next.root, target.id) : null;
			if (host && host !== next.root && syncedFolderOf(next, host.id) === undefined) {
				const child: MapNode = {
					id: newId(),
					name: freeName(host, folder.split("/").pop() ?? "Folder"),
					className: "Folder",
					path: folder,
					children: [],
				};
				next = {
					...next,
					root: mapNodeUpdate(next.root, host.id, (node) => ({
						...node,
						children: [...node.children, child],
					})),
				};
				last = { kind: "node", id: child.id };
			}
		}
		if (next !== map) commit(next);
		if (last) setPick(last);
	};

	/** Shows a folder in the Project panel: its graph folder where it has one. */
	const showFolder = (folder: string) => {
		const graphs = graphFolderOf(folder, outDir, sourceDir);
		showEntry(graphs && entryAt(tree, graphs) ? graphs : folder);
	};

	const addDiskFolder = (folder: string) =>
		input.onNewFolder?.(graphFolderOf(folder, outDir, sourceDir) ?? folder);

	const toggle = (key: string) =>
		setCollapsed((was) => {
			const next = new Set(was);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	return {
		...input,
		filesystem,
		pick,
		setPick,
		current,
		collapsed,
		toggle,
		view,
		setView,
		rows,
		compiled,
		lines,
		exceptions,
		odd,
		canUndo: history.length > 0,
		undo,
		commit,
		updateNode,
		rename,
		addChild,
		addFolder,
		addService,
		remove,
		mapByRule,
		mapDropped,
		showFolder,
		addDiskFolder,
		isFolderPath,
	};
}

// ---------------------------------------------------------------------------
// The tree, in the centre
// ---------------------------------------------------------------------------

const RULE_HELP =
	"The reading rule: a folder named for a service lands in that service; src/shared, " +
	"src/server and src/client land where Rojo's template puts them; anything else lands " +
	"inside its parent, as a Folder. A mapping whose folder the rule would not give it is an exception.";

/** The Explorer's icon for a node, with the map's mark where it syncs a folder. */
function NodeIcon({
	node,
	root,
	filesystem,
}: {
	node: MapNode;
	root: boolean;
	filesystem: boolean;
}) {
	if (filesystem) {
		return <Icon name={node.file ? "luauScript" : "folder"} size={15} className="kind" />;
	}
	const service = !root && !node.className;
	const icon = (
		<ExplorerIcon
			className={root ? "DataModel" : (node.className ?? node.name)}
			service={service}
			open={false}
		/>
	);
	return node.path ? <Marked>{icon}</Marked> : icon;
}

function Marked({ children, title }: { children: ReactNode; title?: string }) {
	return (
		<span className="tree-badged" title={title}>
			{children}
			<span className="tree-map-badge" aria-hidden="true">
				<Icon name="map" size={10} />
			</span>
		</span>
	);
}

export function MapTreeView({ ed }: { ed: MapEditing }) {
	const { map, filesystem, rows, pick, collapsed, view, exceptions } = ed;
	const [menu, setMenu] = useState<{
		at: MenuAnchor;
		label: string;
		sections: MenuSection[];
	} | null>(null);
	const [dropAt, setDropAt] = useState<{ key: string; where: Where } | null>(null);
	const [showExceptions, setShowExceptions] = useState(false);
	const [layout, setLayout] = useState<"list" | "graph">(readLayoutChoice);
	const rowsBox = useRef<HTMLDivElement>(null);
	const fileName = ed.path.split("/").pop() ?? ed.path;

	const isPicked = (row: Row): boolean =>
		row.pick.kind === "node"
			? pick.kind === "node" && pick.id === row.pick.id
			: pick.kind === "folder" && pick.path === row.pick.path;

	function onRowsKey(e: KeyboardEvent<HTMLDivElement>) {
		if (e.target !== e.currentTarget) return;
		const at = rows.findIndex(isPicked);
		const row = rows[at];
		if ((e.key === "Delete" || e.key === "Backspace") && pick.kind === "node") {
			e.preventDefault();
			ed.remove(pick.id);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const next =
				rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))];
			if (next) ed.setPick(next.pick);
		} else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && row?.parent) {
			e.preventDefault();
			const shut = collapsed.has(row.key);
			if ((e.key === "ArrowLeft") !== shut) ed.toggle(row.key);
		} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && ed.canUndo) {
			e.preventDefault();
			ed.undo();
		}
	}

	function rowMenu(row: Row, at: MenuAnchor) {
		const node = row.node;
		const folder =
			row.folder ??
			(node?.path && ed.isFolderPath(node.path) ? normalisePath(node.path) : undefined);
		const exception = node ? ed.odd.get(node.id) : undefined;
		const unmapped =
			row.pick.kind === "folder" && !landingOf(map, row.pick.path) ? row.pick.path : undefined;
		const landing = unmapped === undefined ? null : ruleLanding(ed.outDir, unmapped);
		ed.setPick(row.pick);
		setMenu({
			at,
			label: node?.name ?? row.folder ?? "",
			sections: [
				{
					entries: [
						node &&
							!filesystem &&
							node !== map.root && {
								label: "Add folder inside",
								icon: "newFolder",
								run: () => ed.addFolder(node.id),
							},
						landing !== null &&
							unmapped !== undefined && {
								label: `Map it to ${landing.join(" › ")}`,
								icon: "map",
								run: () => {
									ed.mapByRule(unmapped);
								},
							},
						folder !== undefined && {
							label: "Show in the Project panel",
							icon: "locate",
							run: () => ed.showFolder(folder),
						},
						exception && {
							label: `Use the rule's folder, ${exception.expected}`,
							icon: "undo",
							run: () => ed.updateNode(exception.node, { path: exception.expected }),
						},
					],
				},
				{
					entries: [
						node &&
							node !== map.root && {
								label: "Delete",
								icon: "remove",
								danger: true,
								hint: "Del",
								run: () => ed.remove(node.id),
							},
					],
				},
			],
		});
	}

	function onRowDragOver(e: DragEvent, row: Row) {
		const types = e.dataTransfer.types;
		if (types.includes(MAP_DRAG) && row.node) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			const box = e.currentTarget.getBoundingClientRect();
			const y = (e.clientY - box.top) / box.height;
			const where: Where =
				row.node === map.root ? "inside" : y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
			setDropAt({ key: row.key, where });
		} else if (types.includes(TREE_DRAG) && !filesystem) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
			setDropAt({ key: row.key, where: "inside" });
		}
	}

	function onRowDrop(e: DragEvent, row: Row) {
		e.preventDefault();
		const where = dropAt?.where ?? "inside";
		setDropAt(null);
		const moving = e.dataTransfer.getData(MAP_DRAG);
		if (moving && row.node) {
			const root = mapNodeMove(map.root, moving, row.node.id, where);
			if (root !== map.root) ed.commit({ ...map, root });
			return;
		}
		const raw = e.dataTransfer.getData(TREE_DRAG);
		if (raw) ed.mapDropped(JSON.parse(raw) as string[], row.node);
	}

	const used = new Set(map.root.children.map((one) => one.name));
	const serviceMenu = (at: Element) =>
		setMenu({
			at: { element: at },
			label: "Add a service",
			sections: [
				{
					entries: COMMON_SERVICES.filter((name) => !used.has(name)).map((name) => ({
						label: name,
						glyph: <ExplorerIcon className={name} service open={false} />,
						hint: rulePath(ed.outDir, [name]),
						run: () => ed.addService(name),
					})),
				},
			],
		});

	const current = ed.current;
	const folderParent = current && current !== map.root && !current.file ? current : null;

	/** A node's + in the graph: a service at the root, a folder anywhere else. */
	function addAt(row: Row, at: Element) {
		const node = row.node;
		ed.setPick(row.pick);
		if (filesystem) {
			if (node && !node.file) ed.addChild(node.id, { id: newId(), name: "folder", children: [] });
		} else if (view === "src" || !node) {
			if (row.folder) ed.addDiskFolder(row.folder);
		} else if (node === map.root) {
			serviceMenu(at);
		} else {
			ed.addFolder(node.id);
		}
	}

	const chooseLayout = (next: "list" | "graph") => {
		setLayout(next);
		writeLayoutChoice(next);
	};

	return (
		<div className="map-editor map-cards modal-shell">
			<section className="map-card map-tree" aria-label="The map">
				<header className="map-head">
					<span className="map-title">
						<b className={ed.dirty ? "dirty" : undefined}>{fileName.replace(/\.nodemap$/, "")}</b>
						<span className="map-sub">
							{filesystem ? "node map · a filesystem" : `node map · ${map.name}`}
						</span>
					</span>
					<span className="sp" />
					<div className="segmented map-layout" role="tablist" aria-label="Draw the map as">
						<button
							type="button"
							className={cx(layout === "list" && "on")}
							title="The tree as rows, one under another"
							onClick={() => chooseLayout("list")}
						>
							List
						</button>
						<button
							type="button"
							className={cx(layout === "graph" && "on")}
							title="The tree as a graph, left to right, with a + on each node to add inside it"
							onClick={() => chooseLayout("graph")}
						>
							Graph
						</button>
					</div>
					{!filesystem && (
						<div className="segmented map-view" role="tablist" aria-label="Read the map from">
							<button
								type="button"
								className={cx(view === "dm" && "on")}
								title="Instances from the DataModel down, each with the folder that fills it"
								onClick={() => ed.setView("dm")}
							>
								<ExplorerIcon className="DataModel" service={false} open={false} size={13} />
								DataModel
							</button>
							<button
								type="button"
								className={cx(view === "src" && "on")}
								title={`Folders from ${ed.outDir} down, each with where it lands`}
								onClick={() => ed.setView("src")}
							>
								<Icon name="folder" size={13} />
								{ed.outDir}
							</button>
						</div>
					)}
					{filesystem ? (
						<>
							<button
								type="button"
								className="tb with-icon"
								disabled={!current || current.file === true}
								onClick={() =>
									current && ed.addChild(current.id, { id: newId(), name: "folder", children: [] })
								}
							>
								<Icon name="newFolder" size={13} />
								Directory
							</button>
							<button
								type="button"
								className="tb with-icon"
								disabled={!current || current.file === true}
								onClick={() =>
									current &&
									ed.addChild(current.id, { id: newId(), name: "module", file: true, children: [] })
								}
							>
								<Icon name="newFile" size={13} />
								File
							</button>
						</>
					) : (
						<>
							<button
								type="button"
								className="tb with-icon"
								title="A service under the DataModel, synced from its folder in the output folder"
								onClick={(e) => serviceMenu(e.currentTarget)}
							>
								<Icon name="plus" size={13} />
								Service
							</button>
							<button
								type="button"
								className="tb with-icon"
								disabled={!folderParent}
								title={
									folderParent
										? `A folder in ${folderParent.name}`
										: "Pick a service or a folder to add one inside it"
								}
								onClick={() => folderParent && ed.addFolder(folderParent.id)}
							>
								<Icon name="newFolder" size={13} />
								Folder
							</button>
						</>
					)}
					<button
						type="button"
						className="tb icon-only"
						title="Undo"
						aria-label="Undo"
						disabled={!ed.canUndo}
						onClick={ed.undo}
					>
						<Icon name="undo" size={14} />
					</button>
				</header>

				{layout === "graph" ? (
					<MapGraphView
						ed={ed}
						isPicked={isPicked}
						dropKey={dropAt?.key ?? null}
						onMenu={rowMenu}
						onAdd={addAt}
						onKey={onRowsKey}
						onDragOver={onRowDragOver}
						onDrop={onRowDrop}
						onDropAway={(e) => {
							e.preventDefault();
							setDropAt(null);
							const raw = e.dataTransfer.getData(TREE_DRAG);
							if (raw) ed.mapDropped(JSON.parse(raw) as string[]);
						}}
					/>
				) : (
					<div
						className="map-rows"
						ref={rowsBox}
						role="tree"
						aria-label={fileName}
						tabIndex={0}
						onKeyDown={onRowsKey}
						onDragLeave={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
						}}
					>
						{rows.map((row) => (
							<MapRowView
								key={row.key}
								ed={ed}
								row={row}
								picked={isPicked(row)}
								drop={dropAt?.key === row.key ? dropAt.where : null}
								onPick={() => {
									ed.setPick(row.pick);
									rowsBox.current?.focus({ preventScroll: true });
								}}
								onMenu={(at) => rowMenu(row, at)}
								onDragStart={(e) => {
									if (!row.node || row.node === map.root) return;
									e.dataTransfer.setData(MAP_DRAG, row.node.id);
									e.dataTransfer.effectAllowed = "move";
								}}
								onDragOver={(e) => onRowDragOver(e, row)}
								onDrop={(e) => onRowDrop(e, row)}
							/>
						))}
						{!filesystem && (
							<div
								className={cx("map-drop", dropAt?.key === "end" && "on")}
								onDragOver={(e) => {
									if (!e.dataTransfer.types.includes(TREE_DRAG)) return;
									e.preventDefault();
									e.dataTransfer.dropEffect = "copy";
									setDropAt({ key: "end", where: "inside" });
								}}
								onDrop={(e) => {
									e.preventDefault();
									setDropAt(null);
									const raw = e.dataTransfer.getData(TREE_DRAG);
									if (raw) ed.mapDropped(JSON.parse(raw) as string[]);
								}}
							>
								Drop a folder from Graphs or Output here to map it.
							</div>
						)}
					</div>
				)}

				{!filesystem && layout === "list" && (
					<footer className="map-rule">
						{exceptions.length === 0 ? (
							<span className="map-rule-ok" title="Every folder is where the reading rule puts it">
								<span className="map-check">✓</span>
								Follows the reading rule
							</span>
						) : (
							<button
								type="button"
								className="map-rule-odd"
								aria-expanded={showExceptions}
								onClick={() => setShowExceptions((was) => !was)}
							>
								<Icon
									name="chevron"
									size={12}
									className={cx("map-rule-chev", showExceptions && "open")}
								/>
								{exceptions.length === 1 ? "1 exception" : `${exceptions.length} exceptions`} to the
								reading rule
							</button>
						)}
						<span className="map-rule-help" title={RULE_HELP}>
							?
						</span>
						{showExceptions &&
							exceptions.map((one) => (
								<button
									type="button"
									key={one.node}
									className="map-rule-row"
									onClick={() => ed.setPick({ kind: "node", id: one.node })}
								>
									<b>{one.trail.join(" › ")}</b>
									<span>
										{one.path} <i>rule: {one.expected}</i>
									</span>
								</button>
							))}
					</footer>
				)}
				{ed.compiled.diagnostics.length > 0 && (
					<div className="map-diagnostics">
						{ed.compiled.diagnostics.map((d, i) => (
							<button
								type="button"
								key={i}
								className={cx("entry", d.severity)}
								onClick={() => d.node && ed.setPick({ kind: "node", id: d.node })}
							>
								<Icon name="warning" size={13} />
								<span>{d.message}</span>
							</button>
						))}
					</div>
				)}
			</section>
			{menu && (
				<Menu
					at={menu.at}
					label={menu.label}
					sections={menu.sections}
					onClose={() => setMenu(null)}
				/>
			)}
		</div>
	);
}

/** What a row says about itself, in either layout: its name, icon and detail. */
interface RowFacts {
	name: string;
	icon: ReactNode;
	/** The chip in the list, the second line in the graph. */
	detail: {
		text: string;
		tone: "ok" | "warn" | "bad" | "faint";
		title: string;
		icon?: ReactNode;
		/** A folder the detail shows in the Project panel when clicked. */
		folder?: string;
		odd?: boolean;
	} | null;
	/** What the graph says where the list says nothing. */
	quiet: string;
	unsynced: boolean;
	/** A folder this row syncs from, in the DataModel reading. */
	syncs: boolean;
}

function describeRow(ed: MapEditing, row: Row): RowFacts {
	const { map, filesystem, view, tree, outDir, sourceDir } = ed;
	const node = row.node;
	const root = node === map.root;
	const name =
		view === "src" && row.folder
			? (row.folder.split("/").pop() ?? row.folder)
			: (node?.name ?? row.folder?.split("/").pop() ?? "");

	if (view === "src" && row.folder) {
		// From the output folder: a folder, and where it lands.
		const folderIcon = <ExplorerIcon className="Folder" service={false} open={false} />;
		const icon = node ? <Marked title={`Synced as ${node.name}`}>{folderIcon}</Marked> : folderIcon;
		const landing = landingOf(map, row.folder);
		const rule = landing ? null : ruleLanding(outDir, row.folder);
		// A folder only passing through to mapped ones below it, as src and
		// src/ReplicatedStorage do, needs nothing: mapping it would sync them twice.
		const at = normalisePath(row.folder);
		const through = !landing && mappedPaths(map.root).some((one) => one.base.startsWith(`${at}/`));
		const detail: RowFacts["detail"] = through
			? null
			: landing
				? {
						text: landing.join(" › "),
						tone: "ok",
						title: `Lands in ${landing.join(" › ")}`,
						icon: (
							<ExplorerIcon
								className={landing[0]}
								service={isService(landing[0])}
								open={false}
								size={11}
							/>
						),
					}
				: rule
					? {
							text: `${rule.join(" › ")} · not mapped`,
							tone: "warn",
							title: `The rule puts it in ${rule.join(" › ")}. Map it from its menu.`,
						}
					: {
							text: "not synced",
							tone: "faint",
							title: "No mapping syncs this folder, and it is named for no service.",
						};
		return {
			name,
			icon,
			detail,
			quiet: "holds mapped folders",
			unsynced: !landing && !through,
			syncs: false,
		};
	}

	if (node) {
		const icon = <NodeIcon node={node} root={root} filesystem={filesystem} />;
		if (filesystem) {
			return {
				name,
				icon,
				detail: node.file ? { text: ".luau", tone: "faint", title: "A file Roswaal writes" } : null,
				quiet: root ? "the project folder" : "a directory",
				unsynced: false,
				syncs: false,
			};
		}
		if (node.path) {
			const exception = ed.odd.get(node.id)?.expected;
			const words = stateWords(folderState(tree, node.path, outDir, sourceDir));
			const folder = normalisePath(node.path);
			return {
				name,
				icon,
				detail: {
					text: `${folder} · ${words.text}`,
					tone: words.tone as "ok" | "warn" | "bad",
					title:
						`${folder}: ${words.title}` +
						(exception ? ` Not where the rule puts it, ${exception}.` : "") +
						" Click to show it in the Project panel.",
					folder,
					odd: exception !== undefined,
				},
				quiet: "",
				unsynced: false,
				syncs: true,
			};
		}
		return {
			name,
			icon,
			detail: null,
			quiet: root ? `writes ${map.output}` : "holds only what is under it",
			unsynced: false,
			syncs: false,
		};
	}

	// A folder on disk under a synced instance, which the map need not name.
	const folder = row.folder ?? "";
	const state = folderState(tree, folder, outDir, sourceDir);
	return {
		name,
		icon: <ExplorerIcon className="Folder" service={false} open={false} />,
		detail: {
			text: `on disk · ${state.kind === "files" ? filesText(state.count) : "empty"}`,
			tone: "faint",
			title: `${folder}, synced through the folder above`,
		},
		quiet: "",
		unsynced: false,
		syncs: false,
	};
}

interface MapRowViewProps {
	ed: MapEditing;
	row: Row;
	picked: boolean;
	drop: Where | null;
	onPick: () => void;
	onMenu: (at: MenuAnchor) => void;
	onDragStart: (e: DragEvent) => void;
	onDragOver: (e: DragEvent) => void;
	onDrop: (e: DragEvent) => void;
}

/** A detail as the list's chip: a button where it shows a folder. */
function Chip({ ed, detail }: { ed: MapEditing; detail: NonNullable<RowFacts["detail"]> }) {
	const cls = cx("pathchip", detail.tone, detail.odd && "odd");
	if (detail.folder) {
		const folder = detail.folder;
		return (
			<button
				type="button"
				className={cls}
				title={detail.title}
				onClick={(e) => {
					e.stopPropagation();
					ed.showFolder(folder);
				}}
			>
				{detail.text}
			</button>
		);
	}
	return (
		<span className={cls} title={detail.title}>
			{detail.icon}
			{detail.text}
		</span>
	);
}

function MapRowView(props: MapRowViewProps) {
	const { ed, row } = props;
	const node = row.node;
	const root = node === ed.map.root;
	const shut = ed.collapsed.has(row.key);
	const facts = describeRow(ed, row);

	return (
		<div
			className={cx(
				"map-row",
				props.picked && "selected",
				!node && "disk",
				props.drop && `drop-${props.drop}`,
				facts.unsynced && "unsynced",
			)}
			role="treeitem"
			aria-selected={props.picked}
			aria-expanded={row.parent ? !shut : undefined}
			data-control={node?.id}
			style={{ paddingLeft: 8 + row.depth * 16 }}
			draggable={!!node && !root}
			onClick={props.onPick}
			onDoubleClick={() => row.parent && ed.toggle(row.key)}
			onContextMenu={(e) => {
				e.preventDefault();
				props.onMenu({ x: e.clientX, y: e.clientY });
			}}
			onDragStart={props.onDragStart}
			onDragOver={props.onDragOver}
			onDrop={props.onDrop}
		>
			<span
				className="glyph"
				style={{ visibility: row.parent ? "visible" : "hidden" }}
				onClick={(e) => {
					e.stopPropagation();
					ed.toggle(row.key);
				}}
			>
				<Icon name="chevron" size={12} className={cx("map-chev", !shut && "open")} />
			</span>
			{facts.icon}
			<span className="name">{facts.name}</span>
			{facts.detail && <Chip ed={ed} detail={facts.detail} />}
		</div>
	);
}

// ---------------------------------------------------------------------------
// The tree as a graph
// ---------------------------------------------------------------------------

/** A node's card, and the room between columns and rows. */
const CARD_W = 236;
const CARD_H = 54;
const COLUMN = CARD_W + 56;
const ROW_STEP = CARD_H + 16;
const PAD = 24;

export interface Placed {
	row: Row;
	x: number;
	y: number;
	children: Placed[];
}

/**
 * The rows laid out left to right: a column a level, each parent level with
 * the middle of its children, leaves one under another.
 */
export function placeRows(rows: Row[]): { roots: Placed[]; width: number; height: number } {
	const roots: Placed[] = [];
	const stack: Placed[] = [];
	for (const row of rows) {
		const one: Placed = { row, x: PAD + row.depth * COLUMN, y: 0, children: [] };
		while (stack.length > row.depth) stack.pop();
		const parent = stack[stack.length - 1];
		if (parent) parent.children.push(one);
		else roots.push(one);
		stack.push(one);
	}
	let next = 0;
	let deepest = 0;
	const place = (one: Placed) => {
		deepest = Math.max(deepest, one.row.depth);
		if (one.children.length === 0) {
			one.y = PAD + next * ROW_STEP;
			next++;
			return;
		}
		for (const child of one.children) place(child);
		one.y = (one.children[0].y + one.children[one.children.length - 1].y) / 2;
	};
	for (const root of roots) place(root);
	return {
		roots,
		width: PAD * 2 + deepest * COLUMN + CARD_W + 24,
		height: PAD * 2 + Math.max(1, next) * ROW_STEP - 16,
	};
}

interface MapGraphViewProps {
	ed: MapEditing;
	isPicked: (row: Row) => boolean;
	dropKey: string | null;
	onMenu: (row: Row, at: MenuAnchor) => void;
	onAdd: (row: Row, at: Element) => void;
	onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
	onDragOver: (e: DragEvent, row: Row) => void;
	onDrop: (e: DragEvent, row: Row) => void;
	onDropAway: (e: DragEvent) => void;
}

function MapGraphView(props: MapGraphViewProps) {
	const { ed } = props;
	const [ruleOpen, setRuleOpen] = useState(true);
	const box = useRef<HTMLDivElement>(null);
	const laid = useMemo(() => placeRows(ed.rows), [ed.rows]);
	const all: Placed[] = [];
	const visit = (one: Placed) => {
		all.push(one);
		for (const child of one.children) visit(child);
	};
	for (const root of laid.roots) visit(root);

	// Drag the empty canvas to move about it.
	function onPanDown(e: ReactPointerEvent<HTMLDivElement>) {
		const target = e.target as Element;
		if (e.button !== 0 || target.closest(".mapg-node, .mapg-rule")) return;
		const el = box.current;
		if (!el) return;
		el.focus({ preventScroll: true });
		const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
		trackPointer(e, {
			move: (ev) => {
				el.scrollLeft = start.left - (ev.clientX - start.x);
				el.scrollTop = start.top - (ev.clientY - start.y);
			},
		});
	}

	const wire = (from: Placed, to: Placed) => {
		const x1 = from.x + CARD_W;
		const y1 = from.y + CARD_H / 2;
		const x2 = to.x;
		const y2 = to.y + CARD_H / 2;
		const mid = (x1 + x2) / 2;
		return `M${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
	};

	return (
		<div className="mapg">
			<div
				className="mapg-scroll grid-surface"
				ref={box}
				role="tree"
				aria-label="The map as a graph"
				tabIndex={0}
				onKeyDown={props.onKey}
				onPointerDown={onPanDown}
				onDragOver={(e) => {
					if (!e.dataTransfer.types.includes(TREE_DRAG) || ed.filesystem) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = "copy";
				}}
				onDrop={props.onDropAway}
			>
				<div className="mapg-plane" style={{ width: laid.width, height: laid.height }}>
					<svg className="mapg-wires" width={laid.width} height={laid.height} aria-hidden="true">
						{all.flatMap((one) =>
							one.children.map((child) => (
								<path
									key={`${one.row.key}>${child.row.key}`}
									d={wire(one, child)}
									className={cx("mapg-wire", !child.row.node && "disk")}
								/>
							)),
						)}
					</svg>
					{all.map((one) => (
						<GraphNode
							key={one.row.key}
							ed={ed}
							placed={one}
							picked={props.isPicked(one.row)}
							drop={props.dropKey === one.row.key}
							onMenu={(at) => props.onMenu(one.row, at)}
							onAdd={(at) => props.onAdd(one.row, at)}
							onDragOver={(e) => props.onDragOver(e, one.row)}
							onDrop={(e) => {
								e.stopPropagation();
								props.onDrop(e, one.row);
							}}
							onPick={() => {
								ed.setPick(one.row.pick);
								box.current?.focus({ preventScroll: true });
							}}
						/>
					))}
				</div>
			</div>
			{!ed.filesystem && (
				<aside className={cx("mapg-rule", !ruleOpen && "shut")}>
					<button type="button" className="mapg-rule-head" onClick={() => setRuleOpen(!ruleOpen)}>
						<Icon name="chevron" size={12} className={cx("map-rule-chev", ruleOpen && "open")} />
						<b>Reading rule</b>
						<span className={cx("mapg-rule-count", ed.exceptions.length > 0 && "odd")}>
							{ed.exceptions.length === 0
								? "followed"
								: ed.exceptions.length === 1
									? "1 exception"
									: `${ed.exceptions.length} exceptions`}
						</span>
					</button>
					{ruleOpen && (
						<>
							<p>
								<span className="map-check">✓</span>A folder named for a service lands in that
								service
							</p>
							<p>
								<span className="map-check">✓</span>shared, server and client land where Rojo's
								template puts them
							</p>
							<p>
								<span className="map-check">✓</span>Anything else lands inside its parent, as a
								Folder
							</p>
							{ed.exceptions.map((one) => (
								<button
									type="button"
									key={one.node}
									className="map-rule-row"
									onClick={() => ed.setPick({ kind: "node", id: one.node })}
								>
									<b>{one.trail.join(" › ")}</b>
									<span>
										{one.path} <i>rule: {one.expected}</i>
									</span>
								</button>
							))}
						</>
					)}
				</aside>
			)}
		</div>
	);
}

interface GraphNodeProps {
	ed: MapEditing;
	placed: Placed;
	picked: boolean;
	drop: boolean;
	onPick: () => void;
	onMenu: (at: MenuAnchor) => void;
	onAdd: (at: Element) => void;
	onDragOver: (e: DragEvent) => void;
	onDrop: (e: DragEvent) => void;
}

function GraphNode(props: GraphNodeProps) {
	const { ed, placed } = props;
	const row = placed.row;
	const node = row.node;
	const root = node === ed.map.root;
	const facts = describeRow(ed, row);
	const shut = ed.collapsed.has(row.key);
	const canAdd = !(node?.file ?? false);
	return (
		<div
			className={cx(
				"mapg-node",
				root && "root",
				props.picked && "selected",
				!node && "disk",
				facts.unsynced && "unsynced",
				facts.detail?.odd && "odd",
				props.drop && "drop",
			)}
			style={{ left: placed.x, top: placed.y, width: CARD_W, height: CARD_H }}
			role="treeitem"
			aria-selected={props.picked}
			aria-expanded={row.parent ? !shut : undefined}
			data-control={node?.id}
			draggable={!!node && !root}
			onClick={props.onPick}
			onDoubleClick={() => row.parent && ed.toggle(row.key)}
			onContextMenu={(e) => {
				e.preventDefault();
				props.onMenu({ x: e.clientX, y: e.clientY });
			}}
			onDragStart={(e) => {
				if (!node || root) return;
				e.dataTransfer.setData(MAP_DRAG, node.id);
				e.dataTransfer.effectAllowed = "move";
			}}
			onDragOver={props.onDragOver}
			onDrop={props.onDrop}
		>
			<div className="mapg-name">
				{facts.icon}
				<b>{facts.name}</b>
				{facts.syncs && <span className="mapg-badge">syncs</span>}
				{row.parent && (
					<button
						type="button"
						className="mapg-fold"
						title={shut ? "Show what is inside" : "Fold what is inside"}
						aria-label={shut ? "Unfold" : "Fold"}
						onClick={(e) => {
							e.stopPropagation();
							ed.toggle(row.key);
						}}
					>
						<Icon name="chevron" size={12} className={cx("map-chev", !shut && "open")} />
					</button>
				)}
			</div>
			{facts.detail ? (
				<div
					className={cx("mapg-other", facts.detail.tone, facts.detail.folder && "link")}
					title={facts.detail.title}
					onClick={(e) => {
						const folder = facts.detail?.folder;
						if (!folder) return;
						e.stopPropagation();
						ed.showFolder(folder);
					}}
				>
					{facts.detail.icon ?? (facts.detail.folder ? <Icon name="folder" size={11} /> : null)}
					<span>{facts.detail.text}</span>
				</div>
			) : (
				<div className="mapg-other faint">
					<span>{facts.quiet}</span>
				</div>
			)}
			{canAdd && (
				<button
					type="button"
					className="mapg-plus"
					title={addTitle(ed, row)}
					aria-label={addTitle(ed, row)}
					onClick={(e) => {
						e.stopPropagation();
						props.onAdd(e.currentTarget);
					}}
				>
					+
				</button>
			)}
		</div>
	);
}

/** What a node's + adds. */
function addTitle(ed: MapEditing, row: Row): string {
	if (ed.filesystem) return "A directory inside it";
	if (ed.view === "src") return "A folder inside it, on disk";
	if (row.node === ed.map.root) return "A service, synced from its folder in the output folder";
	if (!row.node) return "A folder inside it, on disk";
	return ed.isFolderPath(row.node.path ?? "") && row.node.path
		? "A folder inside it, on disk: Rojo brings it in"
		: "A folder inside it, its path from the reading rule";
}

// ---------------------------------------------------------------------------
// The panels around it
// ---------------------------------------------------------------------------

/** One field as a Settings row: its name and help, then the control. */
function Field({
	label,
	help,
	part,
	wide,
	children,
}: {
	label: string;
	help?: ReactNode;
	part?: string;
	/** The control under its name, across the panel: a path, which is long. */
	wide?: boolean;
	children: ReactNode;
}) {
	return (
		<div className={wide ? "setting wide" : "setting"} data-part={part}>
			<div className="setting-label">
				<b>{label}</b>
				{help && <span>{help}</span>}
			</div>
			<div className="setting-control">{children}</div>
		</div>
	);
}

/**
 * A text field that keeps what is typed until it is left or Enter is pressed,
 * for values read back in another form -- a list of numbers -- where reading
 * each keystroke would undo the comma just typed.
 */
function DraftInput({
	value,
	placeholder,
	label,
	onCommit,
}: {
	value: string;
	placeholder?: string;
	label: string;
	onCommit: (text: string) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<input
			className="tb"
			aria-label={label}
			value={draft ?? value}
			placeholder={placeholder}
			onFocus={() => setDraft(value)}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => {
				if (draft !== null && draft !== value) onCommit(draft);
				setDraft(null);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				else if (e.key === "Escape") {
					setDraft(null);
					e.currentTarget.blur();
				}
			}}
		/>
	);
}

/** The Instance panel: the picked node's fields, or a folder on disk's. */
export function MapInstancePanel({ ed }: { ed: MapEditing }) {
	const node = ed.current;
	if (node) return <NodeFields ed={ed} node={node} />;
	if (ed.pick.kind === "folder") return <FolderFields ed={ed} folder={ed.pick.path} />;
	return null;
}

function NodeFields({ ed, node }: { ed: MapEditing; node: MapNode }) {
	const { map, filesystem, tree, outDir, sourceDir } = ed;
	const [classMenu, setClassMenu] = useState<Element | null>(null);
	const [choosing, setChoosing] = useState<Element | null>(null);
	const root = node === map.root;
	const parentIsRoot = mapNodeParent(map.root, node.id) === map.root;
	const service = !root && !filesystem && !node.className;
	const exception = ed.odd.get(node.id)?.expected;
	const patch = (change: Partial<MapNode>) => ed.updateNode(node.id, change);
	const kind = filesystem
		? root
			? "the project folder"
			: node.file
				? "File"
				: "Directory"
		: root
			? "DataModel"
			: service
				? "Service"
				: (node.className ?? "Folder");

	const pathHelp = (() => {
		if (filesystem || root) return undefined;
		if (!node.path) return "Nothing syncs it: it holds only what is under it.";
		const state = folderState(tree, node.path, outDir, sourceDir);
		const words = stateWords(state);
		return state.kind === "files" ? `${filesText(state.count)}; ${words.title}` : words.title;
	})();

	return (
		<div className="map-panel modal-shell">
			<PanelHead sub={`${node.name || "(no name)"} · ${kind}`}>
				{!root && (
					<button
						type="button"
						className="tb icon-only"
						title="Delete"
						aria-label="Delete"
						onClick={() => ed.remove(node.id)}
					>
						<Icon name="remove" size={14} />
					</button>
				)}
			</PanelHead>
			<div className="settings-box">
				<Field label="Name" part="name">
					<input
						className="tb"
						aria-label="Name"
						value={node.name}
						readOnly={root && !filesystem}
						onChange={(e) => ed.rename(node.id, e.target.value)}
					/>
				</Field>
				{filesystem && !root && (
					<Field label="Kind" part="kind">
						<div className="segmented">
							<button
								type="button"
								className={cx(!node.file && "on")}
								onClick={() => patch({ file: undefined })}
							>
								Directory
							</button>
							<button
								type="button"
								className={cx(node.file && "on")}
								onClick={() => patch({ file: true })}
							>
								File
							</button>
						</div>
					</Field>
				)}
				{!filesystem && !root && (
					<Field
						label="Class"
						part="class"
						help={service ? "Rojo knows a service by its name." : undefined}
					>
						<button
							type="button"
							className="pickbox"
							aria-haspopup="menu"
							onClick={(e) => setClassMenu(e.currentTarget)}
						>
							<ExplorerIcon
								className={node.className ?? node.name}
								service={service}
								open={false}
							/>
							<span className="clip">{service ? "Service" : (node.className ?? "Folder")}</span>
							<Icon name="chevron" size={12} className="pickbox-chev" />
						</button>
					</Field>
				)}
				{!filesystem && !root && (
					<Field
						label="Path"
						part="path"
						wide
						help={
							<>
								{pathHelp}
								{exception && (
									<>
										{" "}
										The rule would say {exception}.{" "}
										<button
											type="button"
											className="linkish"
											onClick={() => patch({ path: exception })}
										>
											Use it
										</button>
									</>
								)}
							</>
						}
					>
						<span className="path-pick">
							<input
								className="tb"
								aria-label="Path"
								placeholder="Not synced"
								value={node.path ?? ""}
								onChange={(e) => patch({ path: e.target.value || undefined })}
							/>
							<button type="button" className="tb" onClick={(e) => setChoosing(e.currentTarget)}>
								Choose…
							</button>
						</span>
					</Field>
				)}
				{!filesystem && !root && (
					<Field
						label="Ignore unknown"
						part="ignoreUnknown"
						help="Leave alone what Rojo did not put there."
					>
						<Toggle
							on={node.ignoreUnknown ?? false}
							label={node.ignoreUnknown ? "Left alone" : "Removed"}
							onChange={(on) => patch({ ignoreUnknown: on || undefined })}
						/>
					</Field>
				)}
				{!filesystem && !root && (
					<ListRows
						label="Ignore paths"
						part="ignorePaths"
						help="Globs under this path for Rojo to skip, such as shared/**."
						values={node.ignorePaths ?? []}
						placeholder="shared/**"
						onChange={(next) => patch({ ignorePaths: next.length ? next : undefined })}
					/>
				)}
				{!filesystem && root && (
					<Field label="Services" help="Add one from the tree's Service button.">
						<span className="map-count">{node.children.length}</span>
					</Field>
				)}
			</div>
			{classMenu && (
				<Menu
					at={{ element: classMenu }}
					label="Class"
					onClose={() => setClassMenu(null)}
					sections={[
						{
							label: parentIsRoot ? "Services" : undefined,
							entries: parentIsRoot
								? COMMON_SERVICES.map((name) => ({
										label: name,
										glyph: <ExplorerIcon className={name} service open={false} />,
										current: service && node.name === name,
										run: () => patch({ name, className: undefined }),
									}))
								: [],
						},
						{
							label: "Instances",
							entries: CONTAINER_CLASSES.map((name) => ({
								label: name,
								glyph: <ExplorerIcon className={name} service={false} open={false} />,
								current: node.className === name,
								run: () => patch({ className: name }),
							})),
						},
					]}
				/>
			)}
			{choosing && (
				<MenuSurface
					at={{ element: choosing, align: "end" }}
					label="Choose a folder"
					className="map-choose"
					onClose={() => setChoosing(null)}
				>
					<FolderPicker
						tree={tree}
						roots={folderRoots(tree, outDir)}
						value={node.path ?? ""}
						onPick={(at) => patch({ path: outputFolderOf(at, outDir, sourceDir) })}
						onNewFolder={ed.onNewFolder}
					/>
				</MenuSurface>
			)}
		</div>
	);
}

/** The folders Choose… starts from: the output folder, then the rest of the project's. */
function folderRoots(tree: readonly TreeEntry[], outDir: string): string[] {
	const out = normalisePath(outDir);
	const tops = tree.filter((one) => one.kind === "directory" && !one.name.startsWith("."));
	return [out, ...tops.map((one) => one.path).filter((one) => one !== out)];
}

/** A folder on disk the map does not name. */
function FolderFields({ ed, folder }: { ed: MapEditing; folder: string }) {
	const landing = landingOf(ed.map, folder);
	const rule = landing ? null : ruleLanding(ed.outDir, folder);
	const there = folderExists(ed.tree, folder, ed.outDir, ed.sourceDir);
	const name = folder.split("/").pop() ?? folder;
	return (
		<div className="map-panel modal-shell">
			<PanelHead sub={`${name} · a folder on disk`} />
			<div className="settings-box">
				<Field label="Folder" wide help={there ? undefined : "Not on disk yet."}>
					<span className="path-pick">
						<code className="map-code">{folder}</code>
						{there && (
							<button type="button" className="tb" onClick={() => ed.showFolder(folder)}>
								Show
							</button>
						)}
					</span>
				</Field>
				<Field
					label="Lands in"
					wide
					help={
						landing
							? "Synced through the folder a mapping names above it."
							: rule
								? "Nothing maps it yet. The reading rule says where it belongs."
								: "Nothing maps it, and it is named for no service. Drag it onto an instance to map it there."
					}
				>
					<span className="map-landing">
						{landing ? (
							landing.join(" › ")
						) : rule ? (
							<button type="button" className="tb with-icon" onClick={() => ed.mapByRule(folder)}>
								<Icon name="map" size={13} />
								Map it to {rule.join(" › ")}
							</button>
						) : (
							"Nowhere"
						)}
					</span>
				</Field>
			</div>
		</div>
	);
}

/** The This map panel: what the map is, the file it writes, and Rojo's place settings. */
export function MapSettingsPanel({ ed }: { ed: MapEditing }) {
	const { map, filesystem, commit } = ed;
	const rojo = map.rojo ?? {};
	const setRojo = (key: string, value: unknown) => {
		const next = { ...rojo };
		if (value === undefined) delete next[key];
		else next[key] = value;
		commit({ ...map, rojo: Object.keys(next).length ? next : undefined });
	};
	const ids = (key: string): string => {
		const value = rojo[key];
		return Array.isArray(value) ? value.join(", ") : "";
	};
	const setIds = (key: string, text: string) => {
		const list = text
			.split(/[\s,]+/)
			.filter((one) => /^\d+$/.test(one))
			.map(Number);
		setRojo(key, list.length ? list : undefined);
	};
	const number = (key: string): string => (typeof rojo[key] === "number" ? String(rojo[key]) : "");
	const setNumber = (key: string, text: string) => {
		const value = text.trim();
		setRojo(key, /^\d+$/.test(value) ? Number(value) : undefined);
	};

	return (
		<div className="map-panel modal-shell">
			<PanelHead sub={map.name} />
			<div className="settings-box">
				<Field
					label="Describes"
					part="describes"
					help={
						filesystem
							? "Directories and files. Nothing is written: compiling checks the layout."
							: "Instances, written as a Rojo project file."
					}
				>
					<div className="segmented">
						<button
							type="button"
							className={cx(!filesystem && "on")}
							onClick={() => filesystem && commit({ ...map, target: undefined })}
						>
							DataModel
						</button>
						<button
							type="button"
							className={cx(filesystem && "on")}
							onClick={() => !filesystem && commit({ ...map, target: "lune" })}
						>
							Filesystem
						</button>
					</div>
				</Field>
				{!filesystem && (
					<>
						<Field label="Project name" help="Rojo's name for the project.">
							<input
								className="tb"
								aria-label="Project name"
								value={map.name}
								onChange={(e) => commit({ ...map, name: e.target.value })}
							/>
						</Field>
						<Field
							label="Writes"
							part="output"
							help={
								map.output === "default.project.json"
									? "Rojo serves this one by default."
									: `Rojo serves it when named: rojo serve ${map.output}`
							}
						>
							<input
								className="tb"
								aria-label="Writes"
								value={map.output}
								onChange={(e) => commit({ ...map, output: e.target.value })}
							/>
						</Field>
						<Field label="Place IDs" help="servePlaceIds: the places rojo serve may sync into.">
							<DraftInput
								label="Place IDs"
								value={ids("servePlaceIds")}
								placeholder="Any place"
								onCommit={(text) => setIds("servePlaceIds", text)}
							/>
						</Field>
						<Field
							label="Blocked place IDs"
							help="blockedPlaceIds: places it must never sync into."
						>
							<DraftInput
								label="Blocked place IDs"
								value={ids("blockedPlaceIds")}
								placeholder="None"
								onCommit={(text) => setIds("blockedPlaceIds", text)}
							/>
						</Field>
						<Field label="Place ID" help="placeId: set in the place while syncing.">
							<DraftInput
								label="Place ID"
								value={number("placeId")}
								placeholder="Unset"
								onCommit={(text) => setNumber("placeId", text)}
							/>
						</Field>
						<Field label="Game ID" help="gameId: set in the place while syncing.">
							<DraftInput
								label="Game ID"
								value={number("gameId")}
								placeholder="Unset"
								onCommit={(text) => setNumber("gameId", text)}
							/>
						</Field>
						<Field label="Port" help="servePort: where rojo serve listens.">
							<DraftInput
								label="Port"
								value={number("servePort")}
								placeholder="34872"
								onCommit={(text) => setNumber("servePort", text)}
							/>
						</Field>
						<ListRows
							label="Project-wide ignores"
							part="globs"
							help="Passed to Rojo as globIgnorePaths."
							values={map.globIgnorePaths ?? []}
							placeholder="**/*.spec.luau"
							onChange={(next) =>
								commit({ ...map, globIgnorePaths: next.length ? next : undefined })
							}
						/>
					</>
				)}
			</div>
		</div>
	);
}

/** The Project file panel: what the map writes, the picked row's lines lit. */
export function MapFilePanel({ ed }: { ed: MapEditing }) {
	const { map, filesystem, dirty, compiled, lines, current } = ed;
	const [onDisk, setOnDisk] = useState<string | null | undefined>(undefined);
	const box = useRef<HTMLPreElement>(null);
	const lit = current && current !== map.root ? current.id : undefined;

	// The project file as it is on disk, to say whether the map's matches it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: read again whenever the written text changes.
	useEffect(() => {
		if (filesystem || dirty) return;
		let live = true;
		api.readSource(map.output).then(
			(read) => live && setOnDisk(read.text),
			() => live && setOnDisk(null),
		);
		return () => {
			live = false;
		};
	}, [filesystem, dirty, map.output, compiled.json]);

	// Bring the lit lines into view in the file, never the page.
	useEffect(() => {
		const pre = box.current;
		if (!pre || lit === undefined) return;
		const line = pre.querySelector<HTMLElement>(".map-preview-line.lit");
		if (!line) return;
		const top = line.offsetTop - pre.offsetTop;
		if (top < pre.scrollTop || top > pre.scrollTop + pre.clientHeight - line.offsetHeight) {
			pre.scrollTop = Math.max(0, top - pre.clientHeight / 3);
		}
	}, [lit]);

	const tag = filesystem
		? null
		: dirty
			? { text: "written when saved", tone: "warn" }
			: onDisk === undefined
				? null
				: onDisk === null
					? { text: "not written yet", tone: "warn" }
					: onDisk === compiled.json
						? { text: "matches the file", tone: "ok" }
						: { text: "differs from the file", tone: "warn" };

	return (
		<div className="map-panel map-file-panel">
			<PanelHead sub={filesystem ? "the layout" : map.output}>
				{tag && <span className={cx("map-tag", tag.tone)}>{tag.text}</span>}
			</PanelHead>
			<pre className={cx("map-preview", filesystem && "layout")} ref={box}>
				{lines.map((line, i) => (
					<span
						key={i}
						className={cx("map-preview-line", line.key !== undefined && line.key === lit && "lit")}
						onClick={() => line.key && ed.setPick({ kind: "node", id: line.key })}
					>
						{"  ".repeat(line.indent) + line.text}
						{line.note && <span className="map-reach">{line.note}</span>}
					</span>
				))}
			</pre>
		</div>
	);
}

/** A list of globs as a Settings row: each one a field, with Add. */
function ListRows({
	label,
	help,
	part,
	values,
	placeholder,
	onChange,
}: {
	label: string;
	help: string;
	part: string;
	values: string[];
	placeholder: string;
	onChange: (next: string[]) => void;
}) {
	return (
		<div className="setting map-list" data-part={part}>
			<div className="setting-label">
				<b>{label}</b>
				<span>{help}</span>
			</div>
			<div className="setting-control map-list-control">
				{values.map((value, i) => (
					<div className="map-list-row" key={i}>
						<input
							className="tb"
							aria-label={`${label} ${i + 1}`}
							value={value}
							placeholder={placeholder}
							onChange={(e) => {
								const next = [...values];
								next[i] = e.target.value;
								onChange(next);
							}}
						/>
						<button
							type="button"
							className="tb icon-only"
							title="Remove"
							aria-label="Remove"
							onClick={() => onChange(values.filter((_, j) => j !== i))}
						>
							<Icon name="close" size={13} />
						</button>
					</div>
				))}
				<button type="button" className="tb with-icon" onClick={() => onChange([...values, ""])}>
					<Icon name="plus" size={13} />
					Add
				</button>
			</div>
		</div>
	);
}
