/**
 * The node palette, used both as a right-click context menu and as the
 * toolbar's Add menu. It is a search box first because a categorised list of
 * seventy nodes stops being browsable long before it stops growing.
 *
 * Alongside the node types it lists *presets*: one entry per variable and per
 * function in the open graph, so "Get health" and "Set health" are things you
 * search for by name rather than dropping a generic node and then pointing it
 * at something, because the name is what you have in mind, not the node type.
 *
 * What is listed and in what order is `menuSearch.ts`; this is the menu that
 * draws it and is driven by the keyboard and the pointer.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { Registry } from "../core/nodes/index.js";
import { categoryLabel } from "../core/categories.js";
import type { Literal, NodeConfig, NodeDef } from "../core/schema.js";
import { cx } from "./cx.js";
import { useDismiss } from "./dismiss.js";
import { LAYER } from "./layers.js";
import {
	buildPresets, draggedServiceItems, flattenGroups, groupMenu, libraryItems, luneItems,
	memberItems, namedItems, narrowItems, presentRuntimes, reachableDefs, searchMenu,
	serviceItems, type MenuAnchor, type MenuItem, type Preset,
} from "./menuSearch.js";
import { COMMENT_DEFAULT_COLOR, pinColor } from "./palette.js";
import {
	FILTER_LABEL, FILTER_SUMMARY, readPreferences, writePreferences, type MenuFilter,
} from "./preferences.js";
import { requiredTypes, useProjectTypes } from "./projectTypes.js";
import { useEditor } from "./store.js";

// What the rest of the editor imports from here, defined beside the search.
export { buildPresets };
export type { MenuAnchor, Preset };

export interface NodeMenuProps {
	anchor: MenuAnchor;
	registry: Registry;
	target: "roblox" | "lune";
	presets: Preset[];
	onPick: (
		def: NodeDef,
		config?: NodeConfig,
		literals?: Record<string, Literal>,
		member?: { name: string; type?: string },
	) => void;
	onAddComment: () => void;
	onClose: () => void;
}

export function NodeMenu({
	anchor, registry, target, presets, onPick, onAddComment, onClose,
}: NodeMenuProps) {
	// What the open graph declares, for the members of a dragged wire's type.
	const script = useEditor().script;
	const projectTypes = useProjectTypes();
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);
	const from = anchor.from;

	const allItems = useMemo(
		() => libraryItems(registry, target, presets),
		[registry, target, presets],
	);

	// Which runtime the list is narrowed to, remembered between openings.
	//
	// On top of the target's own filter rather than instead of it — `allItems`
	// has already dropped anything this graph cannot compile. What is left to
	// narrow is mostly "show me only what is portable", which is the question
	// somebody asks when they are thinking about moving a graph.
	const [runtime, setRuntime] = useState<MenuFilter | null>(() => readPreferences().nodeFilter);

	const chooseRuntime = (next: MenuFilter | null) => {
		setRuntime(next);
		writePreferences({ ...readPreferences(), nodeFilter: next });
	};

	// With one runtime present there is nothing to choose between, so the row
	// says so instead of offering a choice.
	const present = useMemo(() => presentRuntimes(allItems), [allItems]);

	// A remembered runtime that this graph has none of would hide everything.
	const narrowed = runtime !== null && present.includes(runtime) ? runtime : null;

	const reachable = useMemo(() => reachableDefs(registry, from), [from, registry]);

	const items = useMemo(
		() => narrowItems(allItems, reachable, narrowed),
		[allItems, reachable, narrowed],
	);

	const services = useMemo(
		() => serviceItems(registry, target, from?.service),
		[registry, target, from?.service],
	);
	const lune = useMemo(() => luneItems(registry, target), [registry, target]);
	const names = useMemo(() => namedItems(registry, target), [registry, target]);
	const draggedService = useMemo(() => draggedServiceItems(services, from), [services, from]);

	const draggedMembers = useMemo(() => {
		// Only a wire dragged out of a value has members to offer.
		if (!script || from?.side !== "out") return [];
		const external = new Map(
			requiredTypes(script, projectTypes)
				.filter((entry) => entry.fields && entry.fields.length > 0)
				// Kept to the entries the filter above found fields on.
				.map((entry) => [entry.type, entry.fields ?? []] as const),
		);
		return memberItems({ script, registry, external }, from);
	}, [from, registry, script, projectTypes]);

	// Placing what an entry stands for.
	//
	// One function for the click and for Enter, so an entry that places a
	// getter and a Get Member on it does both whichever way it is picked.
	const pick = (item: MenuItem) => onPick(item.def, item.config, item.literals, item.member);

	const matches = useMemo(
		() => searchMenu(query, { items, services, lune, names, draggedService, draggedMembers }, from),
		[query, items, services, lune, names, draggedService, draggedMembers, from],
	);

	const grouped = useMemo(
		() => groupMenu(matches, { registry, searching: query.trim() !== "", service: from?.service }),
		[matches, query, registry, from?.service],
	);

	// Flat order, so arrow keys move through the list the eye reads.
	const flat = useMemo(() => flattenGroups(grouped), [grouped]);

	useEffect(() => setActive(0), [query]);

	// Escape is the search field's own, which also steps out of a category.
	useDismiss(root, onClose);

	// Keep the menu on screen when it is opened near an edge.
	const style = {
		zIndex: LAYER.menu,
		left: Math.min(anchor.screen.x, window.innerWidth - 300),
		top: Math.min(anchor.screen.y, window.innerHeight - 360),
	};

	return (
		<div className="menu" ref={root} style={style}>
			{anchor.from && (
				/* The list is narrowed to what the wire can reach, and that is a
				   surprising thing for a search box to do without saying so. It
				   also answers "which pin am I still holding" after a drag
				   across the graph. */
				<div className="menu-from">
					<span className="dot" style={{ background: pinColor(anchor.from.pin.type, anchor.from.pin.kind) }} />
					<span>
						{anchor.from.side === "out" ? "Wire from" : "Wire into"}{" "}
						<strong>{anchor.from.pin.name || anchor.from.pin.id}</strong>
					</span>
				</div>
			)}
			{present.length === 1 && (
				/* Nothing to choose between, but something to say. A Lune graph is
				   all base Luau until the Lune library lands, and an empty space
				   where the filter goes reads as the filter being broken rather
				   than as there being one answer. */
				<div className="menu-runtimes" role="group" aria-label="Runtime">
					<span className="only" title={FILTER_SUMMARY[present[0]]}>
						Every node here is <strong>{FILTER_LABEL[present[0]]}</strong>
					</span>
				</div>
			)}
			{present.length > 1 && (
				/* Which runtime, on top of what this graph can compile. */
				<div className="menu-runtimes" role="group" aria-label="Filter by runtime">
					<button
						type="button"
						className={narrowed === null ? "on" : ""}
						onClick={() => chooseRuntime(null)}
						title="Every node this graph can compile"
					>
						All
					</button>
					{present.map((r) => (
						<button
							key={r}
							type="button"
							className={narrowed === r ? "on" : ""}
							onClick={() => chooseRuntime(narrowed === r ? null : r)}
							title={FILTER_SUMMARY[r]}
						>
							{FILTER_LABEL[r]}
						</button>
					))}
				</div>
			)}
			<input
				className="search"
				autoFocus
				placeholder={anchor.from ? "Search what can take this wire" : "Search nodes and variables"}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape") onClose();
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setActive((i) => Math.min(i + 1, flat.length - 1));
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setActive((i) => Math.max(i - 1, 0));
					}
					if (e.key === "Enter" && flat[active]) pick(flat[active]);
				}}
			/>
			<div className="items">
				{query.trim() === "" && (
					<div className="item" onClick={onAddComment}>
						<span className="swatch" style={{ background: `#${COMMENT_DEFAULT_COLOR}` }} />
						<span>Comment</span>
						<span className="hint">C</span>
					</div>
				)}
				{grouped.map((group) => {
					const row = (item: MenuItem) => (
						<div
							key={item.key}
							className={cx("item", flat[active]?.key === item.key && "active")}
							title={item.summary}
							onMouseEnter={() => setActive(flat.indexOf(item))}
							onClick={() => pick(item)}
						>
							<span className="swatch" style={{ background: item.color }} />
							<span>{item.title}</span>
							{item.pure && <span className="hint">pure</span>}
							{/* What it needs, where that is worth saying. Base Luau
							    is the unmarked case -- badging four rows in five
							    would be noise -- and a narrowed list already says
							    it on the chip above. */}
							{item.runtime !== "luau" && narrowed === null && (
								<span
									className={cx("hint runtime", item.runtime)}
									title={FILTER_SUMMARY[item.runtime]}
								>
									{item.runtimeLabel ?? FILTER_LABEL[item.runtime]}
								</span>
							)}
						</div>
					);
					return (
						<div key={group.category}>
							<div className="group">{categoryLabel(group.category)}</div>
							{group.loose.map(row)}
							{group.groups.map((sub) => (
								<div key={sub.sub}>
									<div className="subgroup">{sub.sub}</div>
									{sub.items.map(row)}
								</div>
							))}
						</div>
					);
				})}
				{flat.length === 0 && <div className="empty">Nothing matches “{query}”.</div>}
			</div>
		</div>
	);
}
