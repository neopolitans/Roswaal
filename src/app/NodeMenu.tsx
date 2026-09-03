/**
 * The node palette, used both as a right-click context menu and as the
 * toolbar's Add menu. It is a search box first because a categorised list of
 * sixty nodes stops being browsable long before it stops growing.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { NodeDef } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { categories } from "../core/nodes/index.js";
import { LAYER } from "./layers.js";
import { nodeColor } from "./palette.js";

export interface MenuAnchor {
	/** Position within the canvas, in screen pixels. */
	screen: { x: number; y: number };
	/** Where a spawned node should land, in world coordinates. */
	world: { x: number; y: number };
}

export interface NodeMenuProps {
	anchor: MenuAnchor;
	registry: Registry;
	target: "roblox" | "lune";
	onPick: (def: NodeDef) => void;
	onAddComment: () => void;
	onClose: () => void;
}

export function NodeMenu({ anchor, registry, target, onPick, onAddComment, onClose }: NodeMenuProps) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const root = useRef<HTMLDivElement>(null);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		const all = [...registry.values()].filter(
			(def) => !def.targets || def.targets.includes(target),
		);
		if (!q) return all;
		return all
			.map((def) => ({ def, score: score(def, q) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((x) => x.def);
	}, [query, registry, target]);

	const grouped = useMemo(() => {
		const byCategory = new Map<string, NodeDef[]>();
		for (const def of matches) {
			const list = byCategory.get(def.category);
			if (list) list.push(def);
			else byCategory.set(def.category, [def]);
		}
		const order = categories(registry).filter((c) => byCategory.has(c));
		return order.map((category) => ({ category, defs: byCategory.get(category)! }));
	}, [matches, registry]);

	/** Flat order, so arrow keys move through the list the eye reads. */
	const flat = useMemo(() => grouped.flatMap((g) => g.defs), [grouped]);

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
				placeholder="Search nodes"
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
					if (e.key === "Enter" && flat[active]) onPick(flat[active]);
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
						{group.defs.map((def) => (
							<div
								key={def.id}
								className={`item${flat[active]?.id === def.id ? " active" : ""}`}
								title={def.summary}
								onMouseEnter={() => setActive(flat.indexOf(def))}
								onClick={() => onPick(def)}
							>
								<span className="swatch" style={{ background: nodeColor(def) }} />
								<span>{def.title}</span>
								{def.pure && <span className="hint">pure</span>}
							</div>
						))}
					</div>
				))}
				{flat.length === 0 && <div className="empty">No nodes match “{query}”.</div>}
			</div>
		</div>
	);
}

/** Prefix matches on the title beat substring matches, which beat the id. */
function score(def: NodeDef, query: string): number {
	const title = def.title.toLowerCase();
	if (title.startsWith(query)) return 100;
	if (title.includes(query)) return 60;
	if (def.category.toLowerCase().includes(query)) return 30;
	if (def.id.toLowerCase().includes(query)) return 20;
	if (def.summary?.toLowerCase().includes(query)) return 10;
	return 0;
}
