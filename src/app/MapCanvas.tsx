/**
 * A node map on the canvas, opened the way a graph opens.
 *
 * The DataModel is the entry, and a flow wire runs from each node to what it
 * holds. Each node is drawn as the canvas draws one: a header tinted by what
 * it is, the flow pins on the header, and its rows. **Syncs from** is an
 * optional pin: set, Rojo fills the node from that folder; unset, the node
 * passes through and holds only what is wired under it.
 *
 * - Pan, zoom and move nodes as on a graph; where each node sits is kept in
 *   the `.nodemap`, and Realign lays the map out again.
 * - Drag a wire off a node's out pin into empty space for the picker: the
 *   folders the reading rule puts there, then classes, then a comment. Drop
 *   it on another node instead to move that node under this one.
 * - Pick up a node's incoming wire and drop it on another node to move it
 *   there. Its folder follows, graphs and all.
 * - Comments frame nodes and carry notes, which the project file never sees.
 *
 * Folders on disk under a synced node are Rojo's to bring in, and stay in the
 * Project panel; the list layout shows them.
 */

import {
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import { ZOOM } from "../core/canvasLayers.js";
import {
	alignMap,
	MAP_NODE,
	mapNodeHeight,
	mapPins,
	mapPositions,
	type Point,
	realignMap,
} from "../core/mapLayout.js";
import { movedIn, rulePath, trailOf } from "../core/mapRule.js";
import {
	COMMON_SERVICES,
	CONTAINER_CLASSES,
	findMapNode,
	isModelFile,
	type MapComment,
	type MapNode,
	mapNodeParent,
	mapNodeRemove,
	mapNodeUpdate,
} from "../core/nodemap.js";
import { TUCKED } from "../core/rbx/browse.js";
import { normalisePath } from "../core/rojoPaths.js";
import { api, type PlaceTree } from "./api.js";
import { freeBox } from "./CanvasStrip.jsx";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import { ToolGroup } from "./FloatingTools.jsx";
import { FolderPicker } from "./FolderPicker.jsx";
import { GridLayer } from "./GridLayer.jsx";
import { type WireStyle, wireBounds, wirePath } from "./geometry.js";
import { Icon, type IconName } from "./icons.jsx";
import {
	filesText,
	folderRoots,
	freeName,
	type MapEditing,
	stateWords,
	TREE_DRAG,
} from "./MapEditor.jsx";
import { Menu, MenuButton, MenuSurface } from "./Menu.jsx";
import { entryAt, folderState, foldersUnder, graphFolderOf, outputFolderOf } from "./mapDisk.js";
import type { MenuSection } from "./menuModel.js";
import type { MenuAnchor } from "./menuPlace.js";
import { COMMENT_COLORS, COMMENT_DEFAULT_COLOR } from "./palette.js";
import { trackPointer } from "./pointer.js";
import { Toggle } from "./settingsParts.jsx";
import { newId } from "./store.js";

// ---------------------------------------------------------------------------
// The view, kept per map so a tab comes back where it was left
// ---------------------------------------------------------------------------

interface View {
	x: number;
	y: number;
	zoom: number;
}

const START: View = { x: 80, y: 120, zoom: 1 };
const views = new Map<string, View>();
const viewListeners = new Set<() => void>();

function subscribeViews(fn: () => void): () => void {
	viewListeners.add(fn);
	return () => viewListeners.delete(fn);
}

function setMapView(path: string, view: View): void {
	views.set(path, view);
	for (const fn of viewListeners) fn();
}

const viewOf = (path: string): View => views.get(path) ?? START;

function useMapView(path: string): View {
	return useSyncExternalStore(subscribeViews, () => viewOf(path));
}

const clampZoom = (zoom: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));

function mapCanvasBox(): DOMRect | null {
	return document.querySelector(".centre-body .map-canvas")?.getBoundingClientRect() ?? null;
}

/** Zooms about the middle of the canvas. */
function zoomMapTo(path: string, zoom: number): void {
	const box = mapCanvasBox();
	const view = viewOf(path);
	const next = clampZoom(zoom);
	if (!box || next === view.zoom) return;
	const sx = box.width / 2;
	const sy = box.height / 2;
	const wx = (sx - view.x) / view.zoom;
	const wy = (sy - view.y) / view.zoom;
	setMapView(path, { x: sx - wx * next, y: sy - wy * next, zoom: next });
}

/** The whole map, nodes and comments, in the part of the canvas no card covers. */
function fitMap(ed: MapEditing): void {
	const box = mapCanvasBox();
	if (!box) return;
	const at = mapPositions(ed.map);
	let x0 = Number.POSITIVE_INFINITY;
	let y0 = Number.POSITIVE_INFINITY;
	let x1 = Number.NEGATIVE_INFINITY;
	let y1 = Number.NEGATIVE_INFINITY;
	const take = (x: number, y: number, w: number, h: number) => {
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x + w);
		y1 = Math.max(y1, y + h);
	};
	for (const [id, p] of at) {
		take(p.x - 16, p.y, MAP_NODE.width + 32, mapNodeHeight(id === ed.map.root.id) + 30);
	}
	for (const c of ed.map.comments ?? []) take(c.x, c.y, c.w, c.h);
	if (!Number.isFinite(x0)) return;
	const free = freeBox(box);
	const foot = document.querySelector(".dock.foot")?.getBoundingClientRect();
	if (foot && foot.height > 0 && foot.top > box.top + free.y + 120) {
		free.h = Math.max(120, Math.min(free.h, foot.top - box.top - 16 - free.y));
	}
	const zoom = clampZoom(Math.min(free.w / (x1 - x0), free.h / (y1 - y0), 1));
	setMapView(ed.path, {
		x: free.x + (free.w - (x1 - x0) * zoom) / 2 - x0 * zoom,
		y: free.y + (free.h - (y1 - y0) * zoom) / 2 - y0 * zoom,
		zoom,
	});
}

// ---------------------------------------------------------------------------
// The Add button in the top bar asks the canvas for its picker
// ---------------------------------------------------------------------------

let addListener: (() => void) | null = null;

/** Opens the add picker beside the picked node, as dragging off its out pin does. */
function requestAdd(): void {
	addListener?.();
}

// ---------------------------------------------------------------------------
// What a node is
// ---------------------------------------------------------------------------

/** The folder colour Syncs from's pin is drawn in. */
const FOLDER_PIN = "#d9a12b";

/** A node's header colour and tab: what it is in the tree. */
function kindOf(ed: MapEditing, node: MapNode): { colour: string; tab: IconName; word: string } {
	const root = node === ed.map.root;
	if (ed.filesystem) {
		if (root) return { colour: "#5a6474", tab: "folder", word: "Project folder" };
		return node.file
			? { colour: "#6f4f9b", tab: "luauScript", word: "File" }
			: { colour: "#5b5fa6", tab: "folder", word: "Directory" };
	}
	if (root) return { colour: "#a93b2c", tab: "map", word: "DataModel" };
	if (!node.className) return { colour: "#2c7676", tab: "instance", word: "Service" };
	return {
		colour: "#2f6f8f",
		tab: node.className === "Folder" ? "folder" : "instance",
		word: node.className,
	};
}

/** A node's second row: what is at its folder, or what it holds. */
function statusOf(ed: MapEditing, node: MapNode): { text: string; tone?: string; title?: string } {
	const root = node === ed.map.root;
	if (ed.filesystem) {
		if (root) return { text: "the project folder" };
		return { text: node.file ? "a file Roswaal writes" : "a directory" };
	}
	if (root) return { text: `writes ${ed.map.output}` };
	if (!node.path && node.ignoreUnknown) {
		return {
			text: "kept as the place has it",
			title: "Rojo syncs nothing here and leaves what the place holds.",
		};
	}
	if (node.path) {
		const words = stateWords(folderState(ed.tree, node.path, ed.outDir, ed.sourceDir));
		return {
			text: words.text + (node.optional ? " · optional" : ""),
			tone: words.tone === "ok" ? undefined : words.tone,
			title: words.title,
		};
	}
	const loose = ed.looseFiles(node.id);
	if (loose > 0) {
		return {
			text: `${filesText(loose)} here ${loose === 1 ? "does" : "do"} not sync`,
			tone: "warn",
			title: `${rulePath(ed.outDir, trailOf(ed.map, node.id))} has ${filesText(loose)} directly in it, and nothing maps them.`,
		};
	}
	return { text: "holds what is wired under it" };
}

/** Every node with its parent, depth first. */
function flatten(root: MapNode): { node: MapNode; parent: MapNode | null }[] {
	const out: { node: MapNode; parent: MapNode | null }[] = [];
	const visit = (node: MapNode, parent: MapNode | null) => {
		out.push({ node, parent });
		for (const child of node.children) visit(child, node);
	};
	visit(root, null);
	return out;
}

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

interface AddOption {
	key: string;
	group: string;
	name: string;
	hint: string;
	glyph?: ReactNode;
	/** Shown, and not placed: a folder wired already, or brought in by the one above. */
	dim?: boolean;
	/** A node to place, or a comment, or something done without placing (a folder made on disk). */
	make: { node: MapNode } | { comment: true } | { run: () => void };
}

/** What can be added under `parent`: folders on disk by the rule, then classes, then a comment. */
function addOptions(ed: MapEditing, parent: MapNode): AddOption[] {
	const { map, outDir, sourceDir, tree } = ed;
	const out: AddOption[] = [];
	const comment: AddOption = {
		key: "comment",
		group: "",
		name: "Comment",
		hint: "C",
		make: { comment: true },
	};
	if (ed.filesystem) {
		if (parent.file) return [comment];
		out.push(
			{
				key: "dir",
				group: "Add",
				name: "Directory",
				hint: "a folder",
				glyph: <Icon name="folder" size={13} />,
				make: { node: { id: newId(), name: freeName(parent, "folder"), children: [] } },
			},
			{
				key: "file",
				group: "Add",
				name: "File",
				hint: ".luau",
				glyph: <Icon name="luauScript" size={13} />,
				make: {
					node: { id: newId(), name: freeName(parent, "module"), file: true, children: [] },
				},
			},
		);
		return [...out, comment];
	}
	if (parent === map.root) {
		const used = new Set(parent.children.map((one) => one.name));
		for (const name of COMMON_SERVICES) {
			if (used.has(name)) continue;
			out.push({
				key: `service:${name}`,
				group: "Services",
				name,
				hint: rulePath(outDir, [name]),
				glyph: <ExplorerIcon className={name} service open={false} size={13} />,
				make: { node: { id: newId(), name, path: rulePath(outDir, [name]), children: [] } },
			});
		}
		return [...out, comment];
	}

	const trail = trailOf(map, parent.id);
	const synced = parent.path ? normalisePath(parent.path) : undefined;
	const folder = synced ?? rulePath(outDir, trail);
	const named = new Set(parent.children.map((one) => one.name));
	for (const name of foldersUnder(tree, folder, outDir, sourceDir)) {
		const wired = named.has(name);
		out.push({
			key: `disk:${name}`,
			group: "On disk, by the reading rule",
			name,
			hint: synced ? `synced through ${parent.name}` : wired ? "wired already" : "syncs it",
			glyph: <ExplorerIcon className="Folder" service={false} open={false} size={13} />,
			dim: synced !== undefined || wired,
			make: {
				node: {
					id: newId(),
					name,
					className: "Folder",
					path: `${folder}/${name}`,
					children: [],
				},
			},
		});
	}
	for (const className of CONTAINER_CLASSES) {
		const folderClass = className === "Folder";
		const name = freeName(parent, className);
		out.push({
			key: `class:${className}`,
			group: "Instances",
			name: className,
			hint: folderClass
				? synced
					? `made in ${synced}`
					: "a folder by the rule"
				: "passes through",
			glyph: <ExplorerIcon className={className} service={false} open={false} size={13} />,
			make:
				folderClass && synced
					? { run: () => ed.addDiskFolder(synced) }
					: {
							node: {
								id: newId(),
								name,
								className,
								...(folderClass ? { path: rulePath(outDir, [...trail, name]) } : {}),
								children: [],
							},
						},
		});
	}
	return [...out, comment];
}

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

type WireDrag = {
	/** `out`: a wire off `id`'s out pin. `in`: `id`'s incoming wire, picked up. */
	kind: "out" | "in";
	id: string;
	to: Point;
	/** The node the pointer is over, where dropping there would do something. */
	over: string | null;
	moved: boolean;
};

type Moving = { nodes: ReadonlySet<string>; comments: ReadonlySet<string>; dx: number; dy: number };

type Adding = { parent: string; at: Point; screen: { x: number; y: number } };

export function MapCanvas({
	ed,
	wireStyle,
	wheel,
}: {
	ed: MapEditing;
	wireStyle: WireStyle;
	wheel: "zoom" | "pan";
}) {
	const { map, path } = ed;
	const view = useMapView(path);
	const box = useRef<HTMLDivElement>(null);
	const [wire, setWire] = useState<WireDrag | null>(null);
	const wireRef = useRef<WireDrag | null>(null);
	const [moving, setMoving] = useState<Moving | null>(null);
	const movingRef = useRef<Moving | null>(null);
	const [resizing, setResizing] = useState<{ id: string; w: number; h: number } | null>(null);
	const [adding, setAdding] = useState<Adding | null>(null);
	const [syncing, setSyncing] = useState<{ id: string; at: Element } | null>(null);
	const [selected, setSelected] = useState<ReadonlySet<string>>(
		() => new Set(ed.pick.kind === "node" ? [ed.pick.id] : []),
	);
	const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
		null,
	);
	const [editing, setEditing] = useState<string | null>(null);
	const [menu, setMenu] = useState<{
		at: MenuAnchor;
		label: string;
		sections: MenuSection[];
	} | null>(null);
	const wheelMode = useRef(wheel);
	wheelMode.current = wheel;

	const placed = useMemo(() => mapPositions(map), [map]);
	const nodes = useMemo(() => flatten(map.root), [map]);
	const comments = map.comments ?? [];
	const pickedId = ed.pick.kind === "node" ? ed.pick.id : null;

	// A node picked from outside the canvas -- the list, Instance, an exception
	// -- becomes the selection, as the graph's reveal does.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only when the pick changes.
	useEffect(() => {
		if (pickedId && !selected.has(pickedId)) setSelected(new Set([pickedId]));
	}, [pickedId]);

	/** Selects `ids`, and gives Instance the last node among them. */
	const select = (ids: Iterable<string>, mode: "replace" | "add" | "toggle" = "replace") => {
		const next = new Set(mode === "replace" ? [] : selected);
		let last: string | null = null;
		for (const id of ids) {
			if (mode === "toggle" && next.has(id)) next.delete(id);
			else {
				next.add(id);
				if (findMapNode(map.root, id)) last = id;
			}
		}
		setSelected(next);
		if (last) ed.setPick({ kind: "node", id: last });
	};

	/** What a drag of the selection carries: its nodes and comments, and the nodes inside its comments. */
	const carried = (from: ReadonlySet<string>): Moving => {
		const nodeIds = new Set<string>();
		const commentIds = new Set<string>();
		for (const id of from) {
			if (comments.some((c) => c.id === id)) commentIds.add(id);
			else if (findMapNode(map.root, id)) nodeIds.add(id);
		}
		for (const c of comments) {
			if (!commentIds.has(c.id)) continue;
			for (const id of nodesInside(c)) nodeIds.add(id);
		}
		return { nodes: nodeIds, comments: commentIds, dx: 0, dy: 0 };
	};

	/** The nodes wholly inside a comment, which go where it goes. */
	const nodesInside = (c: MapComment): string[] =>
		nodes
			.filter(({ node }) => {
				const at = placed.get(node.id);
				if (!at) return false;
				const h = mapNodeHeight(node === map.root);
				return (
					at.x >= c.x && at.y >= c.y && at.x + MAP_NODE.width <= c.x + c.w && at.y + h <= c.y + c.h
				);
			})
			.map(({ node }) => node.id);

	/** Deletes what is selected, the DataModel apart, as one change. */
	const removeSelected = () => {
		let root = map.root;
		for (const id of selected) if (id !== map.root.id) root = mapNodeRemove(root, id);
		const kept = comments.filter((c) => !selected.has(c.id));
		if (root === map.root && kept.length === comments.length) return;
		ed.commit({ ...map, root, comments: kept.length ? kept : undefined });
		setSelected(new Set());
		ed.setPick({ kind: "node", id: map.root.id });
	};

	/** A box around the selection, or none. */
	const selectionBounds = (): { x: number; y: number; w: number; h: number } | null => {
		let x0 = Number.POSITIVE_INFINITY;
		let y0 = Number.POSITIVE_INFINITY;
		let x1 = Number.NEGATIVE_INFINITY;
		let y1 = Number.NEGATIVE_INFINITY;
		for (const id of selected) {
			const c = comments.find((one) => one.id === id);
			const at = c ? null : placed.get(id);
			const rect = c
				? { x: c.x, y: c.y, w: c.w, h: c.h }
				: at
					? { x: at.x, y: at.y, w: MAP_NODE.width, h: mapNodeHeight(id === map.root.id) }
					: null;
			if (!rect) continue;
			x0 = Math.min(x0, rect.x);
			y0 = Math.min(y0, rect.y);
			x1 = Math.max(x1, rect.x + rect.w);
			y1 = Math.max(y1, rect.y + rect.h);
		}
		return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
	};

	const posOf = (id: string): Point => {
		const at = placed.get(id) ?? { x: 0, y: 0 };
		return moving?.nodes.has(id) ? { x: at.x + moving.dx, y: at.y + moving.dy } : at;
	};
	const commentAt = (c: MapComment): MapComment => {
		const moved = moving?.comments.has(c.id) ? { x: c.x + moving.dx, y: c.y + moving.dy } : {};
		const sized = resizing?.id === c.id ? { w: resizing.w, h: resizing.h } : {};
		return { ...c, ...moved, ...sized };
	};

	const toWorld = (clientX: number, clientY: number): Point => {
		const r = box.current?.getBoundingClientRect();
		const v = viewOf(path);
		return {
			x: (clientX - (r?.left ?? 0) - v.x) / v.zoom,
			y: (clientY - (r?.top ?? 0) - v.y) / v.zoom,
		};
	};
	const toScreen = (p: Point): { x: number; y: number } => {
		const r = box.current?.getBoundingClientRect();
		const v = viewOf(path);
		return { x: (r?.left ?? 0) + v.x + p.x * v.zoom, y: (r?.top ?? 0) + v.y + p.y * v.zoom };
	};

	// A map opened for the first time is fitted to the window.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per map.
	useLayoutEffect(() => {
		if (!views.has(path)) fitMap(ed);
	}, [path]);

	// The wheel pans or zooms, as on a graph; Ctrl or a pinch always zooms.
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const zoomAbout = (sx: number, sy: number, factor: number, from = viewOf(path)) => {
			const zoom = clampZoom(from.zoom * factor);
			const wx = (sx - from.x) / from.zoom;
			const wy = (sy - from.y) / from.zoom;
			setMapView(path, { x: sx - wx * zoom, y: sy - wy * zoom, zoom });
		};
		let pinch: { view: View; sx: number; sy: number } | null = null;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (pinch) return;
			const r = el.getBoundingClientRect();
			const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
			const dx = e.deltaX * unit;
			const dy = e.deltaY * unit;
			const zooming = e.ctrlKey || e.metaKey || (wheelMode.current === "zoom" && dx === 0);
			if (!zooming) {
				const v = viewOf(path);
				setMapView(path, { ...v, x: v.x - dx, y: v.y - dy });
				return;
			}
			if (dy === 0) return;
			const factor =
				e.deltaMode !== 0 || Math.abs(dy) >= 50
					? dy < 0
						? ZOOM.step
						: 1 / ZOOM.step
					: Math.exp(-dy * 0.01);
			zoomAbout(e.clientX - r.left, e.clientY - r.top, factor);
		};
		type SafariGesture = Event & { scale: number; clientX: number; clientY: number };
		const onGestureStart = (event: Event) => {
			event.preventDefault();
			if (touches.current.size > 0) return;
			const e = event as SafariGesture;
			const r = el.getBoundingClientRect();
			pinch = { view: viewOf(path), sx: e.clientX - r.left, sy: e.clientY - r.top };
		};
		const onGestureChange = (event: Event) => {
			event.preventDefault();
			if (!pinch || touches.current.size > 0) return;
			zoomAbout(pinch.sx, pinch.sy, (event as SafariGesture).scale, pinch.view);
		};
		const onGestureEnd = (event: Event) => {
			event.preventDefault();
			pinch = null;
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		el.addEventListener("gesturestart", onGestureStart);
		el.addEventListener("gesturechange", onGestureChange);
		el.addEventListener("gestureend", onGestureEnd);
		return () => {
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("gesturestart", onGestureStart);
			el.removeEventListener("gesturechange", onGestureChange);
			el.removeEventListener("gestureend", onGestureEnd);
		};
	}, [path]);

	// The top bar's Add: the picker beside the picked node.
	useEffect(() => {
		addListener = () => {
			const node = findMapNode(map.root, pickedId ?? map.root.id) ?? map.root;
			openAddBeside(node);
		};
		return () => {
			addListener = null;
		};
	});

	// -- changes ------------------------------------------------------------

	/** Every node at the place it is drawn: what any move or add starts from, so nothing else shifts. */
	const frozen = (shift?: Moving): MapNode => {
		const visit = (node: MapNode): MapNode => {
			const at = placed.get(node.id) ?? { x: 0, y: 0 };
			const pos = shift?.nodes.has(node.id) ? { x: at.x + shift.dx, y: at.y + shift.dy } : at;
			return {
				...node,
				pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
				children: node.children.map(visit),
			};
		};
		return visit(map.root);
	};

	const addNode = (parentId: string, child: MapNode, at: Point) => {
		const root = mapNodeUpdate(frozen(), parentId, (node) => ({
			...node,
			children: [...node.children, { ...child, pos: { x: Math.round(at.x), y: Math.round(at.y) } }],
		}));
		ed.commit({ ...map, root });
		ed.setPick({ kind: "node", id: child.id });
	};

	const addComment = (at: Point, size = { w: 340, h: 150 }) => {
		const made: MapComment = {
			id: newId(),
			x: Math.round(at.x),
			y: Math.round(at.y),
			w: Math.round(size.w),
			h: Math.round(size.h),
			color: `#${COMMENT_DEFAULT_COLOR}`,
			title: "Comment",
		};
		ed.setComments([...comments, made]);
		setSelected(new Set([made.id]));
		setEditing(made.id);
	};

	const removeComment = (id: string) => {
		ed.setComments(comments.filter((c) => c.id !== id));
		setSelected((was) => new Set([...was].filter((one) => one !== id)));
	};

	const realign = () => ed.commit({ ...map, root: realignMap(map) });

	/** Whether moving `id` under `parent` would change anything. */
	const canMove = (id: string, parent: string): boolean => {
		const node = findMapNode(map.root, id);
		const target = findMapNode(map.root, parent);
		if (!node || !target || node === map.root || target.file) return false;
		if (findMapNode(node, parent)) return false;
		return mapNodeParent(map.root, id)?.id !== parent;
	};

	/** Back to the canvas once a picker closes, so Delete and C reach it. */
	const refocus = () => window.setTimeout(() => box.current?.focus({ preventScroll: true }), 0);

	// -- pointers -----------------------------------------------------------

	const touches = useRef(new Map<number, { x: number; y: number }>());
	const gesture = useRef<"pan" | "pinch" | null>(null);

	function canvasMenu(clientX: number, clientY: number) {
		const at = toWorld(clientX, clientY);
		setMenu({
			at: { x: clientX, y: clientY },
			label: "The map",
			sections: [
				{
					entries: [
						{ label: "Comment here", icon: "pin", hint: "C", run: () => addComment(at) },
						{ label: "Realign", icon: "straighten", run: realign },
						{ label: "Fit to the window", icon: "fit", run: () => fitMap(ed) },
					],
				},
			],
		});
	}

	function nodeMenu(node: MapNode, clientX: number, clientY: number) {
		if (!selected.has(node.id)) select([node.id]);
		const exception = ed.odd.get(node.id);
		const folder = node.path && ed.isFolderPath(node.path) ? normalisePath(node.path) : undefined;
		setMenu({
			at: { x: clientX, y: clientY },
			label: node.name,
			sections: [
				{
					entries: [
						!node.file && {
							label: "Add inside…",
							icon: "plus",
							run: () => openAddBeside(node),
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
						node !== map.root &&
							(selected.has(node.id) && selected.size > 1
								? {
										label: `Delete ${selected.size}`,
										icon: "remove",
										danger: true,
										hint: "Del",
										run: removeSelected,
									}
								: {
										label: "Delete",
										icon: "remove",
										danger: true,
										hint: "Del",
										run: () => ed.remove(node.id),
									}),
					],
				},
			],
		});
	}

	function openAddBeside(node: MapNode) {
		const at = posOf(node.id);
		const world = { x: at.x + MAP_NODE.width + MAP_NODE.columnGap, y: at.y };
		const screen = toScreen({ x: world.x, y: world.y + MAP_NODE.head });
		setAdding({ parent: node.id, at: world, screen });
	}

	/**
	 * A press on the empty canvas, as on a graph: a mouse draws a marquee (Shift
	 * or Ctrl adds to the selection), the middle button or Alt pans. A finger
	 * pans and two pinch; a finger held still then dragged draws a marquee, and
	 * held and lifted opens the menu.
	 */
	function onCanvasDown(e: ReactPointerEvent<HTMLDivElement>) {
		const target = e.target as Element;
		if (target.closest(".node, .comment, button, input, textarea")) return;
		box.current?.focus({ preventScroll: true });
		const finger = e.pointerType !== "mouse";
		if (!finger && e.button !== 0 && e.button !== 1) return;
		const sx = e.clientX;
		const sy = e.clientY;
		const additive = e.shiftKey || e.ctrlKey || e.metaKey;
		if (!finger && e.button === 0 && !e.altKey) {
			startMarquee(e, toWorld(sx, sy), additive);
			return;
		}
		const start = viewOf(path);
		touches.current.set(e.pointerId, { x: sx, y: sy });
		let held = false;
		let marqueeFrom: Point | null = null;
		let timer: number | undefined;
		if (touches.current.size === 2) {
			gesture.current = "pinch";
		} else {
			gesture.current = "pan";
			if (finger)
				timer = window.setTimeout(() => {
					held = true;
				}, 500);
		}
		const pinchFrom = gesture.current === "pinch" ? pinchStart() : null;
		let moved = false;
		trackPointer(e, {
			move: (ev) => {
				touches.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
				const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6;
				if (far) moved = true;
				if (gesture.current === "pinch") {
					window.clearTimeout(timer);
					if (pinchFrom) pinchTo(pinchFrom);
					return;
				}
				if (held && far) {
					// Held, then dragged: a marquee from where the finger was held.
					marqueeFrom ??= toWorld(sx, sy);
					setMarquee(rectOf(marqueeFrom, toWorld(ev.clientX, ev.clientY)));
					return;
				}
				if (far) window.clearTimeout(timer);
				setMapView(path, { ...start, x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy });
			},
			end: (release) => {
				window.clearTimeout(timer);
				touches.current.delete(e.pointerId);
				if (touches.current.size === 0) gesture.current = null;
				if (!release) {
					setMarquee(null);
					return;
				}
				if (marqueeFrom) {
					commitMarquee(rectOf(marqueeFrom, toWorld(release.clientX, release.clientY)), false);
					return;
				}
				if (held && !moved) canvasMenu(sx, sy);
				else if (!moved && gesture.current === null) setSelected(new Set());
			},
		});
	}

	const rectOf = (a: Point, b: Point) => ({
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	});

	function startMarquee(e: ReactPointerEvent, from: Point, additive: boolean) {
		if (!additive) setSelected(new Set());
		trackPointer(e, {
			move: (ev) => setMarquee(rectOf(from, toWorld(ev.clientX, ev.clientY))),
			end: (release) => {
				if (!release) {
					setMarquee(null);
					return;
				}
				commitMarquee(rectOf(from, toWorld(release.clientX, release.clientY)), additive);
			},
		});
	}

	/** Everything the box touches, nodes and comments, as on a graph. */
	function commitMarquee(rect: { x: number; y: number; w: number; h: number }, additive: boolean) {
		setMarquee(null);
		if (rect.w < 3 && rect.h < 3) return;
		const meets = (x: number, y: number, w: number, h: number) =>
			x < rect.x + rect.w && x + w > rect.x && y < rect.y + rect.h && y + h > rect.y;
		const hits: string[] = [];
		for (const c of comments) if (meets(c.x, c.y, c.w, c.h)) hits.push(c.id);
		for (const { node } of nodes) {
			const at = placed.get(node.id);
			if (at && meets(at.x, at.y, MAP_NODE.width, mapNodeHeight(node === map.root)))
				hits.push(node.id);
		}
		select(hits, additive ? "add" : "replace");
	}

	function pinchStart(): { d: number; mx: number; my: number; view: View } | null {
		const [a, b] = [...touches.current.values()];
		if (!a || !b) return null;
		return {
			d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
			mx: (a.x + b.x) / 2,
			my: (a.y + b.y) / 2,
			view: viewOf(path),
		};
	}

	function pinchTo(from: { d: number; mx: number; my: number; view: View }) {
		const [a, b] = [...touches.current.values()];
		const r = box.current?.getBoundingClientRect();
		if (!a || !b || !r) return;
		const zoom = clampZoom((from.view.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / from.d);
		const wx = (from.mx - r.left - from.view.x) / from.view.zoom;
		const wy = (from.my - r.top - from.view.y) / from.view.zoom;
		const mx = (a.x + b.x) / 2 - r.left;
		const my = (a.y + b.y) / 2 - r.top;
		setMapView(path, { x: mx - wx * zoom, y: my - wy * zoom, zoom });
	}

	const nodeUnder = (clientX: number, clientY: number): string | null =>
		document
			.elementFromPoint(clientX, clientY)
			?.closest("[data-map-node]")
			?.getAttribute("data-map-node") ?? null;

	/** A press on a node: a pin starts a wire, anything else picks it and moves it. */
	function onNodeDown(e: ReactPointerEvent, node: MapNode) {
		const target = e.target as Element;
		if (e.pointerType === "mouse" && e.button !== 0) return;
		const pin = target.closest("[data-pin]")?.getAttribute("data-pin") as "in" | "out" | null;
		if (pin) {
			startWire(e, node, pin);
			return;
		}
		if (target.closest("button, input, textarea")) return;
		e.stopPropagation();
		box.current?.focus({ preventScroll: true });
		if (e.shiftKey || e.ctrlKey || e.metaKey) {
			select([node.id], "toggle");
			return;
		}
		const group = selected.has(node.id) ? selected : new Set([node.id]);
		if (!selected.has(node.id)) select([node.id]);
		else ed.setPick({ kind: "node", id: node.id });
		const carry = carried(group);
		startMove(e, carry.nodes, carry.comments, () => nodeMenu(node, e.clientX, e.clientY));
	}

	function startMove(
		e: ReactPointerEvent,
		nodeIds: ReadonlySet<string>,
		commentIds: ReadonlySet<string>,
		hold?: () => void,
	) {
		const sx = e.clientX;
		const sy = e.clientY;
		const zoom = viewOf(path).zoom;
		let moved = false;
		const timer = e.pointerType === "touch" && hold ? window.setTimeout(hold, 500) : undefined;
		trackPointer(e, {
			move: (ev) => {
				if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
				moved = true;
				window.clearTimeout(timer);
				const next = {
					nodes: nodeIds,
					comments: commentIds,
					dx: (ev.clientX - sx) / zoom,
					dy: (ev.clientY - sy) / zoom,
				};
				movingRef.current = next;
				setMoving(next);
			},
			end: (release) => {
				window.clearTimeout(timer);
				const last = movingRef.current;
				movingRef.current = null;
				setMoving(null);
				if (!moved || !release || !last) return;
				const root = last.nodes.size > 0 ? frozen(last) : map.root;
				const next = comments.map((c) =>
					last.comments.has(c.id)
						? { ...c, x: Math.round(c.x + last.dx), y: Math.round(c.y + last.dy) }
						: c,
				);
				ed.commit({ ...map, root, ...(next.length ? { comments: next } : {}) });
			},
		});
	}

	function startWire(e: ReactPointerEvent, node: MapNode, pin: "in" | "out") {
		e.stopPropagation();
		e.preventDefault();
		if (pin === "in" && node === map.root) return;
		if (pin === "out" && node.file) return;
		const sx = e.clientX;
		const sy = e.clientY;
		const first: WireDrag = {
			kind: pin,
			id: node.id,
			to: toWorld(sx, sy),
			over: null,
			moved: false,
		};
		wireRef.current = first;
		setWire(first);
		trackPointer(e, {
			move: (ev) => {
				const was = wireRef.current;
				if (!was) return;
				const under = nodeUnder(ev.clientX, ev.clientY);
				const over =
					under === null
						? null
						: pin === "out"
							? canMove(under, node.id)
								? under
								: null
							: canMove(node.id, under)
								? under
								: null;
				const next = {
					...was,
					to: toWorld(ev.clientX, ev.clientY),
					over,
					moved: was.moved || Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4,
				};
				wireRef.current = next;
				setWire(next);
			},
			end: (release) => {
				const last = wireRef.current;
				wireRef.current = null;
				setWire(null);
				if (!release || !last) return;
				if (!last.moved) {
					if (pin === "out") openAddBeside(node);
					return;
				}
				if (last.over) {
					if (pin === "out") ed.reparent(last.over, node.id);
					else ed.reparent(node.id, last.over);
					return;
				}
				// Off the out pin into empty space: the picker, where it was let go.
				if (pin === "out") {
					const at = { x: last.to.x + 11, y: last.to.y - MAP_NODE.head / 2 };
					setAdding({
						parent: node.id,
						at,
						screen: { x: release.clientX, y: release.clientY + 12 },
					});
				}
			},
		});
	}

	function onCommentDown(e: ReactPointerEvent, c: MapComment) {
		const target = e.target as Element;
		if (e.pointerType === "mouse" && e.button !== 0) return;
		if (target.closest("input, textarea, button")) return;
		e.stopPropagation();
		box.current?.focus({ preventScroll: true });
		if (e.shiftKey || e.ctrlKey || e.metaKey) {
			select([c.id], "toggle");
			return;
		}
		if (!selected.has(c.id)) select([c.id]);
		if (target.closest(".map-comment-resize")) {
			startResize(e, c);
			return;
		}
		if (!target.closest(".bar")) return;
		// A comment takes the nodes inside it along, as on a graph.
		const carry = carried(selected.has(c.id) ? selected : new Set([c.id]));
		startMove(e, carry.nodes, carry.comments);
	}

	function startResize(e: ReactPointerEvent, c: MapComment) {
		const sx = e.clientX;
		const sy = e.clientY;
		const zoom = viewOf(path).zoom;
		let last = { id: c.id, w: c.w, h: c.h };
		trackPointer(e, {
			move: (ev) => {
				last = {
					id: c.id,
					w: Math.max(180, Math.round(c.w + (ev.clientX - sx) / zoom)),
					h: Math.max(80, Math.round(c.h + (ev.clientY - sy) / zoom)),
				};
				setResizing(last);
			},
			end: (release) => {
				setResizing(null);
				if (!release || (last.w === c.w && last.h === c.h)) return;
				ed.setComments(
					comments.map((one) => (one.id === c.id ? { ...one, w: last.w, h: last.h } : one)),
				);
			},
		});
	}

	function onKey(e: KeyboardEvent<HTMLDivElement>) {
		if (e.target !== e.currentTarget) return;
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			removeSelected();
		} else if (mod && key === "z" && ed.canUndo) {
			e.preventDefault();
			ed.undo();
		} else if (mod && key === "a") {
			e.preventDefault();
			select([...nodes.map(({ node }) => node.id), ...comments.map((c) => c.id)]);
		} else if (key === "a" && !mod && !e.altKey) {
			// Two or more, because one node is already aligned with itself.
			const ids = [...selected].filter((id) => findMapNode(map.root, id));
			if (ids.length < 2) return;
			e.preventDefault();
			const lined = alignMap(map, placed, ids);
			const visit = (node: MapNode): MapNode => {
				const at = lined.get(node.id) ?? placed.get(node.id) ?? { x: 0, y: 0 };
				return {
					...node,
					pos: { x: Math.round(at.x), y: Math.round(at.y) },
					children: node.children.map(visit),
				};
			};
			ed.commit({ ...map, root: visit(map.root) });
		} else if (mod && e.shiftKey && key === "l") {
			e.preventDefault();
			realign();
		} else if (key === "c" && !mod && !e.altKey) {
			e.preventDefault();
			// Around the selection, as on a graph; with none, in the middle of
			// what no card covers.
			const around = selectionBounds();
			if (around) {
				addComment({ x: around.x - 24, y: around.y - 50 }, { w: around.w + 48, h: around.h + 74 });
				return;
			}
			const r = box.current?.getBoundingClientRect();
			if (r) {
				const free = freeBox(r);
				const at = toWorld(r.left + free.x + free.w / 2, r.top + free.y + free.h / 2);
				addComment({ x: at.x - 170, y: at.y - 75 });
			}
		} else if (e.key === "Escape") {
			setSelected(new Set());
		}
	}

	// -- drawing ------------------------------------------------------------

	const ends: { key: string; a: Point; b: Point; lifted: boolean }[] = [];
	for (const { node, parent } of nodes) {
		if (!parent) continue;
		ends.push({
			key: `${parent.id}>${node.id}`,
			a: mapPins(posOf(parent.id)).out,
			b: mapPins(posOf(node.id)).in,
			lifted: wire?.kind === "in" && wire.id === node.id && wire.moved,
		});
	}
	const dragEnd = (() => {
		if (!wire?.moved) return null;
		if (wire.kind === "out") {
			const a = mapPins(posOf(wire.id)).out;
			const b = wire.over ? mapPins(posOf(wire.over)).in : wire.to;
			return { a, b };
		}
		const b = mapPins(posOf(wire.id)).in;
		const a = wire.over ? mapPins(posOf(wire.over)).out : wire.to;
		return { a, b };
	})();
	const bounds = wireBounds(dragEnd ? [...ends, dragEnd] : ends);

	// Off a pin into empty space: a ghost of the first thing the picker offers.
	const ghost = (() => {
		if (!wire?.moved || wire.kind !== "out" || wire.over) return null;
		const parent = findMapNode(map.root, wire.id);
		if (!parent) return null;
		const first = addOptions(ed, parent).find((one) => !one.dim && "node" in one.make);
		return first
			? { name: first.name, at: { x: wire.to.x + 11, y: wire.to.y - MAP_NODE.head / 2 } }
			: null;
	})();

	const tip = (() => {
		if (!wire?.moved || !wire.over) return null;
		const moved = wire.kind === "in" ? wire.id : wire.over;
		const into = wire.kind === "in" ? wire.over : wire.id;
		const node = findMapNode(map.root, moved);
		const parent = findMapNode(map.root, into);
		if (!node || !parent) return null;
		if (ed.filesystem) return { title: `Into ${parent.name}`, text: "" };
		const from = rulePath(ed.outDir, trailOf(map, moved));
		const follows = !node.path || normalisePath(node.path) === from;
		const to = rulePath(ed.outDir, [...trailOf(map, into), node.name]);
		const graphs = graphFolderOf(from, ed.outDir, ed.sourceDir);
		const onDisk = graphs !== undefined && entryAt(ed.tree, graphs)?.kind === "directory";
		const result = movedIn(map, ed.outDir, moved, into);
		const text = result?.folded
			? `It moves into ${normalisePath(parent.path ?? "")}, which ${parent.name} syncs: Rojo brings it in from there.`
			: follows
				? `Its folder becomes ${to}${onDisk ? ", and its graphs move with it." : "."}`
				: `It keeps ${normalisePath(node.path ?? "")}.`;
		return { title: `Into ${parent.name}`, text };
	})();

	const problems = new Map<string, { text: string; error: boolean }[]>();
	for (const one of ed.exceptions) {
		problems.set(one.node, [
			...(problems.get(one.node) ?? []),
			{ text: `Not where the reading rule puts it: ${one.expected}.`, error: false },
		]);
	}
	for (const d of ed.compiled.diagnostics) {
		if (!d.node) continue;
		problems.set(d.node, [
			...(problems.get(d.node) ?? []),
			{ text: d.message, error: d.severity === "error" },
		]);
	}

	const fileName = (path.split("/").pop() ?? path).replace(/\.nodemap$/, "");
	const syncNode = syncing ? findMapNode(map.root, syncing.id) : null;
	const addParent = adding ? findMapNode(map.root, adding.parent) : null;

	return (
		<div
			className={cx("canvas map-canvas", wire?.moved && "canvas--wiring")}
			ref={box}
			tabIndex={0}
			role="application"
			aria-label={`${fileName}, a node map`}
			onKeyDown={onKey}
			onPointerDown={onCanvasDown}
			onContextMenu={(e) => {
				e.preventDefault();
				const target = e.target as Element;
				const id = target.closest("[data-map-node]")?.getAttribute("data-map-node");
				const node = id ? findMapNode(map.root, id) : null;
				if (node) nodeMenu(node, e.clientX, e.clientY);
				else if (!target.closest(".comment")) canvasMenu(e.clientX, e.clientY);
			}}
			onDragOver={(e) => {
				if (!e.dataTransfer.types.includes(TREE_DRAG) || ed.filesystem) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
			}}
			onDrop={(e) => {
				const raw = e.dataTransfer.getData(TREE_DRAG);
				if (!raw) return;
				e.preventDefault();
				const id = nodeUnder(e.clientX, e.clientY);
				ed.mapDropped(
					JSON.parse(raw) as string[],
					id ? (findMapNode(map.root, id) ?? undefined) : undefined,
				);
			}}
		>
			<GridLayer view={view} />
			<div className="watermark">
				<small>{ed.filesystem ? "Node map · a filesystem" : `Node map · ${map.name}`}</small>
				{fileName}
			</div>

			{marquee && (
				<div
					className="marquee"
					style={{
						left: marquee.x * view.zoom + view.x,
						top: marquee.y * view.zoom + view.y,
						width: marquee.w * view.zoom,
						height: marquee.h * view.zoom,
						zIndex: 30,
					}}
				/>
			)}

			<div
				className="world"
				style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
			>
				{comments.map((one) => (
					<MapCommentView
						key={one.id}
						comment={commentAt(one)}
						selected={selected.has(one.id)}
						editing={editing === one.id}
						onDown={(e) => onCommentDown(e, one)}
						onEdit={() => setEditing(one.id)}
						onDone={(patch) => {
							setEditing(null);
							if (patch.title === one.title && (patch.note ?? "") === (one.note ?? "")) return;
							ed.setComments(
								comments.map((c) =>
									c.id === one.id
										? {
												...c,
												title: patch.title || "Comment",
												...(patch.note ? { note: patch.note } : { note: undefined }),
											}
										: c,
								),
							);
						}}
						onColour={(color) =>
							ed.setComments(comments.map((c) => (c.id === one.id ? { ...c, color } : c)))
						}
						onRemove={() => removeComment(one.id)}
					/>
				))}

				<svg
					className="wires"
					aria-hidden="true"
					style={
						bounds
							? { left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }
							: undefined
					}
					viewBox={bounds ? `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}` : undefined}
				>
					{ends.map((one) => (
						<path
							key={one.key}
							d={wirePath(one.a, one.b, wireStyle)}
							stroke="var(--wire-exec)"
							strokeWidth={2.4}
							opacity={one.lifted ? 0.25 : 0.95}
						/>
					))}
					{dragEnd && (
						<path
							d={wirePath(dragEnd.a, dragEnd.b, wireStyle)}
							stroke={wire?.over ? "var(--accent)" : "var(--wire-exec)"}
							strokeWidth={2.6}
							strokeDasharray="6 5"
						/>
					)}
				</svg>

				{nodes.map(({ node }) => (
					<MapNodeView
						key={node.id}
						ed={ed}
						node={node}
						at={posOf(node.id)}
						picked={selected.has(node.id)}
						target={wire?.over === node.id}
						onDown={(e) => onNodeDown(e, node)}
						onSyncs={(at) => setSyncing({ id: node.id, at })}
					/>
				))}

				{ghost && (
					<div
						className="node map-node map-ghost"
						style={
							{
								left: ghost.at.x,
								top: ghost.at.y,
								width: MAP_NODE.width,
								"--cat": "#2f6f8f",
							} as CSSProperties
						}
					>
						<div className="head" style={{ height: MAP_NODE.head }}>
							<span className="lines">
								<span className="title">{ghost.name}</span>
							</span>
						</div>
					</div>
				)}

				{nodes.map(({ node }) => {
					const list = problems.get(node.id);
					if (!list) return null;
					const at = posOf(node.id);
					return (
						<div
							key={`p:${node.id}`}
							className={cx("problem-note", !list.some((one) => one.error) && "warn")}
							role="note"
							style={{
								left: at.x,
								top: at.y + mapNodeHeight(node === map.root) + 8,
								maxWidth: MAP_NODE.width + 40,
							}}
						>
							{list.map((one) => one.text).join(" ")}
						</div>
					);
				})}
			</div>

			{tip && wire && (
				<div
					className="map-tip"
					style={{
						left: toScreen(wire.to).x - (box.current?.getBoundingClientRect().left ?? 0) + 18,
						top: toScreen(wire.to).y - (box.current?.getBoundingClientRect().top ?? 0) + 18,
					}}
				>
					<b>{tip.title}</b>
					{tip.text && <span>{tip.text}</span>}
				</div>
			)}

			{adding && addParent && (
				<AddPicker
					ed={ed}
					parent={addParent}
					at={adding.screen}
					onClose={() => {
						setAdding(null);
						refocus();
					}}
					onPick={(option) => {
						setAdding(null);
						refocus();
						if ("comment" in option.make) addComment(adding.at);
						else if ("run" in option.make) option.make.run();
						else addNode(addParent.id, option.make.node, adding.at);
					}}
				/>
			)}

			{syncing && syncNode && (
				<SyncsFromPicker
					ed={ed}
					node={syncNode}
					at={syncing.at}
					onClose={() => {
						setSyncing(null);
						refocus();
					}}
				/>
			)}

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

// ---------------------------------------------------------------------------
// A node
// ---------------------------------------------------------------------------

function MapNodeView({
	ed,
	node,
	at,
	picked,
	target,
	onDown,
	onSyncs,
}: {
	ed: MapEditing;
	node: MapNode;
	at: Point;
	picked: boolean;
	target: boolean;
	onDown: (e: ReactPointerEvent) => void;
	onSyncs: (at: Element) => void;
}) {
	const root = node === ed.map.root;
	const kind = kindOf(ed, node);
	const status = statusOf(ed, node);
	const odd = ed.odd.get(node.id);
	const service = !root && !ed.filesystem && !node.className;
	const rows = root ? 1 : 2;

	const first = (() => {
		if (root) return null;
		if (ed.filesystem) {
			return (
				<div className="segmented map-seg" role="group" aria-label="Kind">
					<button
						type="button"
						className={cx(!node.file && "on")}
						onClick={() => node.file && ed.updateNode(node.id, { file: undefined })}
					>
						Directory
					</button>
					<button
						type="button"
						className={cx(node.file && "on")}
						onClick={() => !node.file && ed.updateNode(node.id, { file: true })}
					>
						File
					</button>
				</div>
			);
		}
		const set = node.path !== undefined;
		const kept = !set && node.ignoreUnknown === true;
		return (
			<>
				<span
					className={cx("pin data fam-value", (set || kept) && "connected")}
					style={{ color: FOLDER_PIN }}
					aria-hidden="true"
				>
					<span className="dot" />
				</span>
				<span className="pin-label">Syncs from</span>
				{set ? (
					<button
						type="button"
						className={cx("literal picker map-path", odd && "odd")}
						title={`${normalisePath(node.path ?? "")}${node.optional ? ", optional" : ""}. Choose another, or pass through.`}
						onClick={(e) => onSyncs(e.currentTarget)}
					>
						<span className="preview">{normalisePath(node.path ?? "")}</span>
						<Icon name="chevron" size={11} />
					</button>
				) : kept ? (
					<button
						type="button"
						className="literal picker map-path map-kept"
						title="Kept from the place: Rojo leaves it as the place has it. Choose a folder, or pass through."
						onClick={(e) => onSyncs(e.currentTarget)}
					>
						<Icon name="instance" size={11} />
						<span className="preview">the place</span>
						<Icon name="chevron" size={11} />
					</button>
				) : (
					<button
						type="button"
						className="literal unset map-path"
						title="It syncs nothing itself. Choose a folder for Rojo to fill it from."
						onClick={(e) => onSyncs(e.currentTarget)}
					>
						passes through
					</button>
				)}
			</>
		);
	})();

	return (
		<div
			className={cx(
				"node map-node",
				picked && "node--selected",
				target && "map-target",
				odd && "map-odd",
			)}
			data-map-node={node.id}
			data-control={node.id}
			style={
				{ left: at.x, top: at.y, width: MAP_NODE.width, "--cat": kind.colour } as CSSProperties
			}
			onPointerDown={onDown}
		>
			<div className="head" style={{ height: MAP_NODE.head }}>
				<span className="tab">
					<Icon name={kind.tab} size={16} />
				</span>
				<span className="lines">
					<span className="title">{node.name || "(no name)"}</span>
				</span>
				{!ed.filesystem && (
					<span className="node-class" title={kind.word}>
						<ExplorerIcon
							className={root ? "DataModel" : (node.className ?? node.name)}
							service={service}
							open={false}
							size={14}
						/>
					</span>
				)}
			</div>
			<div className="rows" style={{ height: rows * MAP_NODE.row + MAP_NODE.foot }}>
				{first && (
					<div className="row">
						<span className="side left">{first}</span>
						<span className="side right" />
					</div>
				)}
				<div className="row">
					<span className="side left">
						<span className={cx("map-status", status.tone)} title={status.title}>
							{status.text}
						</span>
					</span>
					<span className="side right" />
				</div>
			</div>
			{!root && (
				<span
					className="head-pin in"
					data-pin="in"
					title="Drag this wire onto another node to move it there"
					style={{ top: MAP_NODE.head / 2 }}
				>
					<span className="pin exec connected" style={{ color: "var(--wire-exec)" }}>
						<span className="dot" />
					</span>
				</span>
			)}
			{!node.file && (
				<span
					className="head-pin out"
					data-pin="out"
					title="Drag off to add inside it, or onto a node to move that one here"
					style={{ top: MAP_NODE.head / 2 }}
				>
					<span
						className={cx("pin exec", node.children.length > 0 && "connected")}
						style={{ color: "var(--wire-exec)" }}
					>
						<span className="dot" />
					</span>
				</span>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// A comment
// ---------------------------------------------------------------------------

function MapCommentView({
	comment,
	selected,
	editing,
	onDown,
	onEdit,
	onDone,
	onColour,
	onRemove,
}: {
	comment: MapComment;
	selected: boolean;
	editing: boolean;
	onDown: (e: ReactPointerEvent) => void;
	onEdit: () => void;
	onDone: (patch: { title: string; note?: string }) => void;
	onColour: (color: string) => void;
	onRemove: () => void;
}) {
	const [title, setTitle] = useState(comment.title);
	const [note, setNote] = useState(comment.note ?? "");
	const wrap = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when editing starts.
	useEffect(() => {
		if (!editing) return;
		setTitle(comment.title);
		setNote(comment.note ?? "");
	}, [editing]);

	const done = () => onDone({ title: title.trim(), note: note.trim() || undefined });

	return (
		<div
			ref={wrap}
			className={cx(
				"comment map-comment",
				selected && "comment--selected",
				editing && "map-editing",
			)}
			style={
				{
					left: comment.x,
					top: comment.y,
					width: comment.w,
					height: comment.h,
					"--comment-color": comment.color,
					// Above the nodes while it is edited, so its tools are not under one.
					...(editing ? { zIndex: 5 } : {}),
				} as CSSProperties
			}
			onPointerDown={onDown}
			onBlur={(e) => {
				if (editing && !wrap.current?.contains(e.relatedTarget as Node | null)) done();
			}}
		>
			{editing ? (
				<>
					<div className="bar">
						<input
							className="map-comment-title"
							aria-label="Comment title"
							// biome-ignore lint/a11y/noAutofocus: it was just made, or double-clicked to edit.
							autoFocus
							onFocus={(e) => e.currentTarget.select()}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") done();
								if (e.key === "Escape") onDone({ title: comment.title, note: comment.note });
							}}
						/>
					</div>
					<textarea
						className="map-comment-note"
						aria-label="Note"
						placeholder="A note the project file has no place for"
						value={note}
						onChange={(e) => setNote(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") onDone({ title: comment.title, note: comment.note });
						}}
					/>
					<div className="map-comment-tools">
						{COMMENT_COLORS.map((one) => (
							<button
								type="button"
								key={one.hex}
								className={cx("map-swatch", comment.color === `#${one.hex}` && "on")}
								title={one.name}
								aria-label={one.name}
								style={{ background: `#${one.hex}` }}
								onClick={() => onColour(`#${one.hex}`)}
							/>
						))}
						<span className="sp" />
						<button type="button" className="tb" onClick={onRemove}>
							Delete
						</button>
						<button type="button" className="tb primary" onClick={done}>
							Done
						</button>
					</div>
				</>
			) : (
				<>
					<div
						className="bar"
						onDoubleClick={onEdit}
						title="Drag to move it and what is inside. Double-click to edit."
					>
						{comment.title}
					</div>
					{comment.note && (
						<div className="map-comment-text" onDoubleClick={onEdit}>
							{comment.note}
						</div>
					)}
				</>
			)}
			<span className="map-comment-resize" aria-hidden="true" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// The add picker
// ---------------------------------------------------------------------------

function AddPicker({
	ed,
	parent,
	at,
	onClose,
	onPick,
}: {
	ed: MapEditing;
	parent: MapNode;
	at: { x: number; y: number };
	onClose: () => void;
	onPick: (option: AddOption) => void;
}) {
	const [query, setQuery] = useState("");
	const options = useMemo(() => addOptions(ed, parent), [ed, parent]);
	const q = query.trim().toLowerCase();
	const shown = options.filter((one) => q === "" || one.name.toLowerCase().includes(q));
	const live = shown.filter((one) => !one.dim);
	const [lit, setLit] = useState(0);
	const current = live[Math.min(lit, live.length - 1)];
	const groups: { label: string; items: AddOption[] }[] = [];
	for (const one of shown) {
		const last = groups[groups.length - 1];
		if (last && last.label === one.group) last.items.push(one);
		else groups.push({ label: one.group, items: [one] });
	}

	return (
		<MenuSurface
			at={at}
			label={`Add in ${parent.name}`}
			className="node-picker map-add"
			onClose={onClose}
		>
			<div className="node-picker-field">
				<Icon name="search" size={14} />
				<input
					// biome-ignore lint/a11y/noAutofocus: the picker opens to be typed into.
					autoFocus
					aria-label={`Add in ${parent.name}`}
					placeholder={`Add in ${parent.name}`}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setLit(0);
					}}
					onKeyDown={(e) => {
						if (e.key === "ArrowDown" || e.key === "ArrowUp") {
							e.preventDefault();
							const step = e.key === "ArrowDown" ? 1 : -1;
							setLit((n) => Math.max(0, Math.min(live.length - 1, n + step)));
						} else if (e.key === "Enter" && current) {
							e.preventDefault();
							onPick(current);
						}
					}}
				/>
				<span className="count">{live.length}</span>
			</div>
			<div className="node-picker-list">
				{groups.map((group) =>
					group.label === "" ? (
						<div key="comment" className="node-picker-group node-picker-comments">
							{group.items.map((one) => (
								<button
									type="button"
									key={one.key}
									className={cx("node-picker-hit node-picker-comment", one === current && "on")}
									onClick={() => onPick(one)}
								>
									<span className="swatch" style={{ background: `#${COMMENT_DEFAULT_COLOR}` }} />
									<span className="name">{one.name}</span>
									<span className="hint">{one.hint}</span>
								</button>
							))}
						</div>
					) : (
						<div key={group.label} className="node-picker-group">
							<div className="head">{group.label}</div>
							{group.items.map((one) => (
								<button
									type="button"
									key={one.key}
									className={cx("node-picker-hit", one === current && "on", one.dim && "map-dim")}
									disabled={one.dim}
									onClick={() => onPick(one)}
								>
									{one.glyph}
									<span className="title">{one.name}</span>
									<span className="hint">{one.hint}</span>
								</button>
							))}
						</div>
					),
				)}
				{shown.length === 0 && <div className="empty">Nothing by that name.</div>}
			</div>
			<div className="node-picker-foot">
				<span>
					<kbd>Enter</kbd> place
				</span>
				<span>
					<kbd>Esc</kbd> cancel
				</span>
				<span>Drop a wire on a node to move it here</span>
			</div>
		</MenuSurface>
	);
}

// ---------------------------------------------------------------------------
// Syncs from
// ---------------------------------------------------------------------------

/** A file Syncs from's Files tab offers beside folders: a model Rojo builds an instance from. */
const pickableModel = (name: string) => isModelFile(name);

/**
 * Syncs from: Files, the project's folders and model files, with the rule's
 * folder one click away and Optional; or DataModel, the instances already in
 * the place, to keep one from the place or copy it out as a model file.
 */
function SyncsFromPicker({
	ed,
	node,
	at,
	onClose,
}: {
	ed: MapEditing;
	node: MapNode;
	at: Element;
	onClose: () => void;
}) {
	const rule = rulePath(ed.outDir, trailOf(ed.map, node.id));
	const kept = node.path === undefined && node.ignoreUnknown === true;
	const [tab, setTab] = useState<"files" | "place">(kept ? "place" : "files");
	const [choice, setChoice] = useState(node.path ? normalisePath(node.path) : rule);
	const [optional, setOptional] = useState(node.optional ?? false);
	return (
		<MenuSurface
			at={{ element: at, align: "start" }}
			label={`${node.name} syncs from`}
			className="map-sync"
			onClose={onClose}
		>
			<div className="map-sync-head">
				<b>{node.name} syncs from</b>
				<div className="segmented map-sync-tabs" role="tablist" aria-label="Syncs from">
					<button
						type="button"
						role="tab"
						aria-selected={tab === "files"}
						className={cx(tab === "files" && "on")}
						onClick={() => setTab("files")}
					>
						Files
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "place"}
						className={cx(tab === "place" && "on")}
						onClick={() => setTab("place")}
					>
						DataModel
					</button>
				</div>
			</div>
			{tab === "files" ? (
				<>
					{choice !== rule && (
						<button type="button" className="linkish map-sync-rule" onClick={() => setChoice(rule)}>
							The rule's: {rule}
						</button>
					)}
					<FolderPicker
						tree={ed.tree}
						roots={folderRoots(ed.tree, ed.outDir)}
						value={choice}
						onPick={(picked) => setChoice(outputFolderOf(picked, ed.outDir, ed.sourceDir))}
						onNewFolder={ed.onNewFolder}
						files={pickableModel}
					/>
					<div className="map-sync-choice" title={choice}>
						{choice}
					</div>
					<div className="map-sync-optional">
						<Toggle on={optional} label="Optional" onChange={setOptional} />
						<span>If it is missing, the node passes through instead of failing.</span>
					</div>
					<div className="map-sync-actions">
						<button
							type="button"
							className="tb"
							disabled={node.path === undefined && !kept}
							onClick={() => {
								ed.setSyncFrom(node.id, undefined, false);
								onClose();
							}}
						>
							Pass through
						</button>
						<button
							type="button"
							className="tb primary"
							onClick={() => {
								ed.setSyncFrom(node.id, choice, optional);
								onClose();
							}}
						>
							Sync
						</button>
					</div>
				</>
			) : (
				<PlacePick ed={ed} node={node} rule={rule} onClose={onClose} />
			)}
		</MenuSurface>
	);
}

/** The place as Syncs from's DataModel tab reads it. */
type PlaceRead =
	| { kind: "reading" }
	| { kind: "none" }
	| { kind: "unreadable"; why: string }
	| { kind: "read"; tree: Extract<PlaceTree, { outline: unknown }> };

/**
 * The DataModel tab: the place's instances, starting at this node's own.
 *
 * Rojo fills an instance only from disk, so an instance picked here is kept
 * or copied. **Keep from the place** syncs nothing and has Rojo leave what the
 * place holds there. **Save as a model file** copies the picked instance out
 * to a .rbxm at the node's folder and syncs from it; the place keeps its own.
 */
function PlacePick({
	ed,
	node,
	rule,
	onClose,
}: {
	ed: MapEditing;
	node: MapNode;
	rule: string;
	onClose: () => void;
}) {
	const [read, setRead] = useState<PlaceRead>({ kind: "reading" });
	const [busy, setBusy] = useState(false);
	const [said, setSaid] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		api.place().then(
			(tree) => live && setRead(tree.file === null ? { kind: "none" } : { kind: "read", tree }),
			(err: unknown) =>
				live &&
				setRead({ kind: "unreadable", why: err instanceof Error ? err.message : String(err) }),
		);
		return () => {
			live = false;
		};
	}, []);

	const outline = read.kind === "read" ? read.tree.outline : null;
	const kids = useMemo(() => {
		const out = new Map<number, number[]>();
		outline?.nodes.forEach(([, , parent], i) => {
			out.set(parent, [...(out.get(parent) ?? []), i]);
		});
		return out;
	}, [outline]);
	/** This node's own instance in the place, found by its names from the service down. */
	const own = useMemo(() => {
		if (!outline) return undefined;
		let parent = -1;
		let found: number | undefined;
		for (const name of trailOf(ed.map, node.id)) {
			found = (kids.get(parent) ?? []).find((i) => outline.nodes[i][1] === name);
			if (found === undefined) return undefined;
			parent = found;
		}
		return found;
	}, [outline, kids, ed.map, node.id]);

	const [where, setWhere] = useState<number | null>(null);
	const [picked, setPicked] = useState<number | null>(null);
	const here = where ?? (own !== undefined && outline ? outline.nodes[own][2] : -1);
	const chosen = picked ?? own ?? null;

	if (read.kind === "reading") return <div className="map-sync-note">Reading the place…</div>;
	if (read.kind === "none")
		return (
			<div className="map-sync-note">The project has no place file to keep instances from.</div>
		);
	if (read.kind === "unreadable" || !outline)
		return (
			<div className="map-sync-note">
				The place could not be read{read.kind === "unreadable" ? `: ${read.why}` : "."}
			</div>
		);

	const classOf = (i: number) => outline.classes[outline.nodes[i][0]];
	const steps: number[] = [];
	for (let i = here; i !== -1; i = outline.nodes[i][2]) steps.unshift(i);
	// The services the Explorer keeps out of sight stay out of sight here too.
	const list = (kids.get(here) ?? []).filter(
		(i) => i === own || here !== -1 || (outline.nodes[i][3] & TUCKED) === 0,
	);
	const service = (i: number) => outline.nodes[i][2] === -1;
	const target = `${rule}.rbxm`;
	const taken = entryAt(ed.tree, target) !== undefined;
	const nodeIsService = node !== ed.map.root && !node.className;
	const canKeep = chosen !== null && chosen === own;
	const canSave = chosen !== null && !service(chosen) && !nodeIsService && !taken && !busy;

	return (
		<>
			<div className="folder-pick">
				<div className="fp-crumbs">
					<button
						type="button"
						className={cx("fp-step", here === -1 && "here")}
						onClick={() => setWhere(-1)}
					>
						{read.tree.file.split("/").pop()}
					</button>
					{steps.map((i, n) => (
						<span key={i} className="fp-step-wrap">
							<span className="fp-sep" aria-hidden="true">
								›
							</span>
							<button
								type="button"
								className={cx("fp-step", n === steps.length - 1 && "here")}
								onClick={() => setWhere(i)}
							>
								{outline.nodes[i][1]}
							</button>
						</span>
					))}
				</div>
				<div className="fp-list" role="listbox" aria-label="Instances">
					{list.length === 0 && <div className="fp-none">Nothing in here.</div>}
					{list.map((i) => {
						const inner = (kids.get(i) ?? []).length > 0;
						return (
							<div
								key={i}
								role="option"
								aria-selected={chosen === i}
								tabIndex={0}
								className={cx("fp-item", chosen === i && "on")}
								onClick={() => setPicked(i)}
								onDoubleClick={() => inner && setWhere(i)}
								onKeyDown={(e) => {
									if (e.key === "Enter") setPicked(i);
									else if (e.key === "ArrowRight" && inner) setWhere(i);
								}}
							>
								<ExplorerIcon className={classOf(i)} service={service(i)} open={false} />
								<span className="fp-name">{outline.nodes[i][1]}</span>
								{i === own && <span className="map-sync-mine">this node</span>}
								{inner && (
									<button
										type="button"
										className="fp-in"
										title={`Into ${outline.nodes[i][1]}`}
										aria-label={`Into ${outline.nodes[i][1]}`}
										onClick={(e) => {
											e.stopPropagation();
											setWhere(i);
										}}
									>
										<Icon name="chevron" size={13} />
									</button>
								)}
							</div>
						);
					})}
				</div>
			</div>
			<div className="map-sync-optional">
				{own === undefined
					? `The place has no ${trailOf(ed.map, node.id).join(".")} to keep.`
					: "Keep from the place: Rojo leaves this node's instance as the place has it."}{" "}
				{nodeIsService
					? "A service cannot be a model file."
					: taken
						? `${target} is there already.`
						: `Save as a model file copies the picked instance to ${target}; the place keeps its own.`}
			</div>
			{said && <div className="map-sync-said">{said}</div>}
			<div className="map-sync-actions">
				<button
					type="button"
					className="tb"
					disabled={!canKeep}
					onClick={() => {
						ed.keepFromPlace(node.id);
						onClose();
					}}
				>
					Keep from the place
				</button>
				<button
					type="button"
					className="tb primary"
					disabled={!canSave}
					onClick={async () => {
						if (chosen === null) return;
						setBusy(true);
						try {
							const made = await api.extractModel(read.tree.stamp, chosen, target);
							ed.syncFromModel(node.id, made.path, classOf(chosen));
							if (made.leftOut.length > 0) {
								setSaid(
									`Saved ${made.path}. The place has properties Roswaal cannot read yet (${made.leftOut.join(", ")}); any this instance had are not in the copy.`,
								);
							} else onClose();
						} catch (err) {
							setSaid(err instanceof Error ? err.message : String(err));
						} finally {
							setBusy(false);
						}
					}}
				>
					Save as a model file
				</button>
			</div>
		</>
	);
}

// ---------------------------------------------------------------------------
// Around the canvas
// ---------------------------------------------------------------------------

/** Zoom, undo and fit, where the graph has its strip. */
export function MapStrip({ ed }: { ed: MapEditing }) {
	const view = useMapView(ed.path);
	const percent = Math.round(view.zoom * 100);
	return (
		<div className="side-strip tool-group" role="toolbar" aria-label="View">
			<button
				type="button"
				className="tb icon-only"
				title="Zoom in"
				aria-label="Zoom in"
				onClick={() => zoomMapTo(ed.path, view.zoom * 1.25)}
			>
				<Icon name="plus" size={16} />
			</button>
			<input
				className="strip-zoom"
				type="range"
				min={Math.round(ZOOM.min * 100)}
				max={Math.round(ZOOM.max * 100)}
				value={percent}
				aria-label="Zoom"
				onChange={(e) => zoomMapTo(ed.path, Number(e.target.value) / 100)}
			/>
			<button
				type="button"
				className="tb icon-only"
				title="Zoom out"
				aria-label="Zoom out"
				onClick={() => zoomMapTo(ed.path, view.zoom / 1.25)}
			>
				<Icon name="minus" size={16} />
			</button>
			<button
				type="button"
				className="strip-percent"
				title="Back to 100%"
				onClick={() => zoomMapTo(ed.path, 1)}
			>
				{percent}%
			</button>
			<span className="strip-rule" />
			<button
				type="button"
				className="tb icon-only"
				title="Undo (Ctrl+Z)"
				aria-label="Undo"
				disabled={!ed.canUndo}
				onClick={ed.undo}
			>
				<Icon name="undo" size={16} />
			</button>
			<span className="strip-rule" />
			<button
				type="button"
				className="tb icon-only"
				title="Fit the map to the window"
				aria-label="Fit"
				onClick={() => fitMap(ed)}
			>
				<Icon name="fit" size={16} />
			</button>
		</div>
	);
}

/** The map's tools after its tab: Add, Realign, and Graph or List. */
export function MapTools({ ed }: { ed: MapEditing }) {
	const graph = ed.layout === "graph";
	return (
		<ToolGroup className="map-tools">
			{graph && (
				<>
					<button
						type="button"
						className="tb icon-only"
						title="Add — inside the picked node. Dragging off a node's out pin does the same, where you let go."
						aria-label="Add"
						onClick={requestAdd}
					>
						<Icon name="plus" size={16} />
					</button>
					<button
						type="button"
						className="tb icon-only"
						title="Realign — lay the map out again, a column a level"
						aria-label="Realign"
						onClick={() => ed.commit({ ...ed.map, root: realignMap(ed.map) })}
					>
						<Icon name="straighten" size={16} />
					</button>
				</>
			)}
			{/* Graph or List, as one button naming which, as Dynamic or Manual is. */}
			<MenuButton
				label={
					<>
						<Icon name={graph ? "graph" : "vpExplorer"} size={15} />
						{graph ? "Graph" : "List"}
					</>
				}
				title="Draw the map as"
				sections={[
					{
						label: "Draw the map as",
						entries: [
							{
								label: "Graph",
								icon: "graph",
								hint: "on the canvas",
								checked: graph,
								run: () => ed.setLayout("graph"),
							},
							{
								label: "List",
								icon: "vpExplorer",
								hint: "as rows",
								checked: !graph,
								run: () => ed.setLayout("list"),
							},
						],
					},
				]}
			/>
		</ToolGroup>
	);
}
