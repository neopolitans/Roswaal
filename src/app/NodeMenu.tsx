/**
 * The node palette, used both as a right-click context menu and as the
 * toolbar's Add menu. It is a search box first because a categorised list of
 * seventy nodes stops being browsable long before it stops growing.
 *
 * Alongside the node types it lists *presets*: one entry per variable and per
 * function in the open graph, so "Get health" and "Set health" are things you
 * search for by name rather than dropping a generic node and then pointing it
 * at something. Blueprints does the same, and for the same reason — the name
 * is what you have in mind, not the node type.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { NodeConfig, NodeDef } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { categories } from "../core/nodes/index.js";
import { LAYER } from "./layers.js";
import { nodeColor, pinColor } from "./palette.js";

export interface MenuAnchor {
	/** Position within the canvas, in screen pixels. */
	screen: { x: number; y: number };
	/** Where a spawned node should land, in world coordinates. */
	world: { x: number; y: number };
}

/** A named instance of a node type: "Get health", "Set health", "Get greet". */
export interface Preset {
	key: string;
	title: string;
	category: string;
	summary?: string;
	defId: string;
	config: NodeConfig;
	/** Swatch colour; presets use their value's type rather than a category. */
	color: string;
}

interface MenuItem {
	key: string;
	title: string;
	category: string;
	summary?: string;
	color: string;
	pure: boolean;
	def: NodeDef;
	config?: NodeConfig;
}

export interface NodeMenuProps {
	anchor: MenuAnchor;
	registry: Registry;
	target: "roblox" | "lune";
	presets: Preset[];
	onPick: (def: NodeDef, config?: NodeConfig) => void;
	onAddComment: () => void;
	onClose: () => void;
}

export function NodeMenu(props: NodeMenuProps) {
	const { anchor, registry, target, presets, onPick, onAddComment, onClose } = props;
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);

	const items = useMemo((): MenuItem[] => {
		const fromDefs = [...registry.values()]
			.filter((def) => !def.targets || def.targets.includes(target))
			.map((def) => ({
				key: def.id,
				title: def.title,
				category: def.category,
				summary: def.summary,
				color: nodeColor(def),
				pure: def.pure === true,
				def,
			}));

		const fromPresets = presets.flatMap((preset) => {
			const def = registry.get(preset.defId);
			if (!def) return [];
			return [{
				key: preset.key,
				title: preset.title,
				category: preset.category,
				summary: preset.summary,
				color: preset.color,
				pure: def.pure === true,
				def,
				config: preset.config,
			}];
		});

		// Presets first within a category: a named thing beats the generic node
		// it is an instance of.
		return [...fromPresets, ...fromDefs];
	}, [registry, target, presets]);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items
			.map((item) => ({ item, score: score(item, q) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((x) => x.item);
	}, [query, items]);

	const grouped = useMemo(() => {
		const byCategory = new Map<string, MenuItem[]>();
		for (const item of matches) {
			const list = byCategory.get(item.category);
			if (list) list.push(item);
			else byCategory.set(item.category, [item]);
		}
		const order = categories(registry).filter((c) => byCategory.has(c));
		const extra = [...byCategory.keys()].filter((c) => !order.includes(c)).sort();
		return [...order, ...extra].map((category) => ({ category, items: byCategory.get(category)! }));
	}, [matches, registry]);

	/** Flat order, so arrow keys move through the list the eye reads. */
	const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

	useEffect(() => setActive(0), [query]);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) onClose();
		};
		// Deferred so the click that opened the menu does not immediately close it.
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
		};
	}, [onClose]);

	// Keep the menu on screen when it is opened near an edge.
	const style = {
		zIndex: LAYER.menu,
		left: Math.min(anchor.screen.x, window.innerWidth - 300),
		top: Math.min(anchor.screen.y, window.innerHeight - 360),
	};

	return (
		<div className="menu" ref={root} style={style}>
			<input
				className="search"
				autoFocus
				placeholder="Search nodes and variables"
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
					if (e.key === "Enter" && flat[active]) {
						onPick(flat[active].def, flat[active].config);
					}
				}}
			/>
			<div className="items">
				{query.trim() === "" && (
					<div className="item" onClick={onAddComment}>
						<span className="swatch" style={{ background: "#6a8fbf" }} />
						<span>Comment</span>
						<span className="hint">C</span>
					</div>
				)}
				{grouped.map((group) => (
					<div key={group.category}>
						<div className="group">{group.category}</div>
						{group.items.map((item) => (
							<div
								key={item.key}
								className={`item${flat[active]?.key === item.key ? " active" : ""}`}
								title={item.summary}
								onMouseEnter={() => setActive(flat.indexOf(item))}
								onClick={() => onPick(item.def, item.config)}
							>
								<span className="swatch" style={{ background: item.color }} />
								<span>{item.title}</span>
								{item.pure && <span className="hint">pure</span>}
							</div>
						))}
					</div>
				))}
				{flat.length === 0 && <div className="empty">Nothing matches “{query}”.</div>}
			</div>
		</div>
	);
}

/** Prefix matches on the title beat substring matches, which beat the id. */
function score(item: MenuItem, query: string): number {
	const title = item.title.toLowerCase();
	if (title.startsWith(query)) return 100;
	if (title.includes(query)) return 60;
	if (item.category.toLowerCase().includes(query)) return 30;
	if (item.def.id.toLowerCase().includes(query)) return 20;
	if (item.summary?.toLowerCase().includes(query)) return 10;
	return 0;
}

/**
 * One entry per variable and per function in the graph. Built here rather than
 * in the menu so the caller keeps control of what a preset means.
 */
export function buildPresets(script: {
	variables: { id: string; name: string; type: string }[];
	nodes: { id: string; def: string; config?: NodeConfig }[];
}): Preset[] {
	const out: Preset[] = [];

	for (const variable of script.variables) {
		const config = { variable: variable.id, name: variable.name, type: variable.type };
		const color = pinColor(variable.type, "data");
		out.push({
			key: `get:${variable.id}`,
			title: `Get ${variable.name}`,
			category: "Variables",
			summary: `Reads the ${variable.type} variable "${variable.name}".`,
			defId: "variable.get",
			config,
			color,
		});
		out.push({
			key: `set:${variable.id}`,
			title: `Set ${variable.name}`,
			category: "Variables",
			summary: `Assigns the ${variable.type} variable "${variable.name}".`,
			defId: "variable.set",
			config,
			color,
		});
	}

	for (const node of script.nodes) {
		if (node.def !== "function.entry") continue;
		const name = (node.config as { name?: string } | undefined)?.name ?? "function";
		out.push({
			key: `fn:${node.id}`,
			title: `Get ${name}`,
			category: "Flow",
			summary: `A reference to the function "${name}".`,
			defId: "function.get",
			config: { function: node.id, name },
			color: pinColor("function", "data"),
		});
	}

	return out;
}
