/**
 * Finding a node by looking at it.
 *
 * The palette answers "what is it called". This answers the other half: you
 * remember roughly what the node looks like — how many pins, which side the
 * result is on, whether it has an execution wire — and you want to see it
 * before you place it. A menu of titles cannot do that, and a graph full of
 * nodes you placed and deleted again is what the missing picture costs.
 *
 * So: the picker shape from 0.38.0 — search at the top, everything under it,
 * grouped, arrows to move — with the **node drawn** beside the list as you walk
 * it, by the same renderer the documentation uses. What you see here is what
 * lands on the canvas.
 *
 * Opened with `Ctrl` and the right mouse button, which is the ordinary node
 * menu's gesture with a modifier: the same question asked a slower way.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { NodeConfig, NodeDef } from "../core/schema.js";
import type { Preset } from "./NodeMenu.jsx";
import { categories, type Registry } from "../core/nodes/index.js";
import { previewOf, previewSvg, type PreviewOptions } from "../core/docs/preview.js";
import { keywordNodes } from "../core/keywords.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import { classify } from "../core/nodes/runtimes.js";
import {
	FILTER_LABEL, FILTER_SUMMARY, MENU_FILTERS, readPreferences, writePreferences,
	type MenuFilter,
} from "./preferences.js";

export interface NodePickerProps {
	registry: Registry;
	/** Only nodes this project's target can run. */
	target: "roblox" | "lune";
	/**
	 * What the open graph declares — its variables, locals, functions and the
	 * parameters of the body you are in.
	 *
	 * The picker listed the library and nothing else, so the one search that
	 * knows what a node *looks* like could not find the node you named
	 * yourself. They are the same entries the node menu offers, built once in
	 * `App.tsx` and scoped there, so the two searches cannot disagree about
	 * what is in scope.
	 */
	presets?: Preset[];
	/** How the picture is drawn: the reader's own geometry and colours. */
	preview: PreviewOptions;
	onPick: (def: NodeDef, config?: NodeConfig) => void;
	onClose: () => void;
}

/**
 * One row: a library node, or something the graph declares.
 *
 * A preset is a node *plus the configuration that makes it that one* — Get
 * Variable pointed at `Accumulator`. Carrying the config rather than only the
 * definition is what lets the preview draw the thing you are about to place
 * instead of the nameless capsule it is built on.
 */
interface Hit {
	key: string;
	title: string;
	category: string;
	summary?: string;
	def: NodeDef;
	config?: NodeConfig;
	/** What the filter chips narrow on. `graph` for anything the graph declares. */
	filter: MenuFilter;
}

/**
 * Prefix beats substring beats category, and Luau typed in beats all of it.
 *
 * Scored on the **hit's** title rather than the definition's, so searching
 * "accumulator" finds Get Accumulator — the definition behind it is called Get
 * Variable and would never match. The keyword and id rules still read the
 * definition, because those are questions about the node.
 */
function score(hit: Hit, query: string): number {
	const def = hit.def;
	const at = keywordNodes(query).indexOf(def.id);
	if (at >= 0) return 1000 - at;
	const title = hit.title.toLowerCase();
	if (title === query) return 500;
	if (def.operator?.toLowerCase() === query) return 400;
	if (title.startsWith(query)) return 100;
	if (title.includes(query)) return 60;
	if (hit.category.toLowerCase().includes(query)) return 30;
	if (def.id.toLowerCase().includes(query)) return 20;
	if (hit.summary?.toLowerCase().includes(query)) return 10;
	return 0;
}

export function NodePicker(
	{ registry, target, presets = [], preview, onPick, onClose }: NodePickerProps,
) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const field = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);

	useEffect(() => {
		field.current?.focus();
	}, []);

	/**
	 * Everything on offer: what the graph declares, then the library.
	 *
	 * The graph's own first, deliberately. A name you chose is a name you are
	 * more likely to be looking for than a node called something similar, and
	 * with equal scores the earlier one wins.
	 */
	const forTarget = useMemo((): Hit[] => {
		const mine: Hit[] = presets.flatMap((preset) => {
			const def = registry.get(preset.defId);
			if (!def) return [];
			return [{
				key: preset.key,
				title: preset.title,
				category: preset.category,
				summary: preset.summary,
				def,
				config: preset.config,
				filter: "graph" as const,
			}];
		});

		const library: Hit[] = [...registry.values()]
			.filter((def) => !def.targets || def.targets.includes(target))
			.map((def) => ({
				key: def.id,
				title: def.title,
				category: def.category,
				summary: def.summary,
				def,
				filter: classify(def),
			}));

		return [...mine, ...library];
	}, [registry, target, presets]);

	/** What the list is narrowed to. The same preference the menu uses. */
	const [runtime, setRuntime] = useState<MenuFilter | null>(() => readPreferences().nodeFilter);

	const chooseRuntime = (next: MenuFilter | null) => {
		setRuntime(next);
		writePreferences({ ...readPreferences(), nodeFilter: next });
	};

	// Only what this graph actually has. See NodeMenu for why.
	const present = useMemo(() => {
		const seen = new Set<MenuFilter>(forTarget.map((hit) => hit.filter));
		return MENU_FILTERS.filter((r) => seen.has(r));
	}, [forTarget]);

	const narrowed = runtime !== null && present.includes(runtime) ? runtime : null;

	const all = useMemo(
		() => (narrowed === null ? forTarget : forTarget.filter((hit) => hit.filter === narrowed)),
		[forTarget, narrowed],
	);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q === "") return all;
		return all
			.map((hit) => ({ hit, score: score(hit, q) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
			.map((x) => x.hit);
	}, [all, query]);

	/**
	 * Grouped by category while browsing, flat while searching.
	 *
	 * The same rule the palette follows, for the same reason: six matches under
	 * four headings is four headings too many, and a search is a list you read
	 * top to bottom.
	 */
	const groups = useMemo(() => {
		if (query.trim() !== "") return [{ label: "", defs: matches }];
		const order = categories(registry);
		const byCategory = new Map<string, Hit[]>();
		for (const hit of matches) {
			byCategory.set(hit.category, [...(byCategory.get(hit.category) ?? []), hit]);
		}
		return [...order, ...[...byCategory.keys()].filter((c) => !order.includes(c))]
			.filter((c) => byCategory.has(c))
			.map((label) => ({ label, defs: byCategory.get(label)! }));
	}, [matches, query, registry]);

	const flat = useMemo(() => groups.flatMap((g) => g.defs), [groups]);
	const chosen = flat[Math.min(active, flat.length - 1)];

	useEffect(() => setActive(0), [query]);

	useEffect(() => {
		list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
	}, [active, flat]);

	const move = (by: number) => {
		if (flat.length === 0) return;
		setActive((at) => (at + by + flat.length) % flat.length);
	};

	return createPortal(
		<div
			className="picker-backdrop"
			style={{ zIndex: LAYER.menu }}
			onPointerDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="node-picker" role="dialog" aria-label="Find a node">
				{present.length === 1 && (
					<div className="menu-runtimes" role="group" aria-label="Runtime">
						<span className="only" title={FILTER_SUMMARY[present[0]]}>
							Every node here is <strong>{FILTER_LABEL[present[0]]}</strong>
						</span>
					</div>
				)}
				{present.length > 1 && (
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
				<div className="node-picker-field">
					<Icon name="search" size={14} />
					<input
						ref={field}
						value={query}
						placeholder="Find a node — its name, or the Luau it writes"
						autoComplete="off"
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								move(1);
							} else if (e.key === "ArrowUp") {
								e.preventDefault();
								move(-1);
							} else if (e.key === "Enter") {
								e.preventDefault();
								if (chosen) onPick(chosen.def, chosen.config);
							} else if (e.key === "Escape") {
								e.preventDefault();
								e.stopPropagation();
								onClose();
							}
						}}
					/>
					<span className="count">{flat.length}</span>
					<button className="tb icon-only" title="Close" onClick={onClose}>
						×
					</button>
				</div>

				<div className="node-picker-body">
					<div className="node-picker-list" ref={list}>
						{flat.length === 0 && (
							<div className="empty">Nothing matches “{query.trim()}”.</div>
						)}
						{groups.map((group) => (
							<div key={group.label || "all"} className="node-picker-group">
								{group.label && <div className="head">{group.label}</div>}
								{group.defs.map((hit) => {
									const i = flat.indexOf(hit);
									return (
										<button
											key={hit.key}
											className={`node-picker-hit${i === active ? " on" : ""}`}
											onPointerEnter={() => setActive(i)}
											onClick={() => onPick(hit.def, hit.config)}
										>
											<span className="title">{hit.title}</span>
											{hit.def.pure && <span className="hint">pure</span>}
											{hit.filter !== "luau" && narrowed === null && (
												<span
													className={`hint runtime ${hit.filter}`}
													title={FILTER_SUMMARY[hit.filter]}
												>
													{FILTER_LABEL[hit.filter]}
												</span>
											)}
										</button>
									);
								})}
							</div>
						))}
					</div>

					{/* The half a list cannot give you: the node itself, drawn the way
					    your canvas draws it. */}
					<div className="node-picker-preview">
						{chosen && (
							<>
								<div
									className="shot"
									dangerouslySetInnerHTML={{
										// With the config, so a graph's own entry is drawn as
										// the node it will place rather than as the nameless
										// one it is built on.
										__html: previewSvg(previewOf(chosen.def, chosen.config), preview),
									}}
								/>
								<div className="about">
									<div className="name">{chosen.title}</div>
									<div className="where">{chosen.category}</div>
									{chosen.summary && <p className="summary">{chosen.summary}</p>}
								</div>
							</>
						)}
					</div>
				</div>

				<div className="node-picker-foot">
					<span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
					<span><kbd>Enter</kbd> to place</span>
					<span><kbd>Esc</kbd> to close</span>
				</div>
			</div>
		</div>,
		document.body,
	);
}
