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

import type { NodeDef } from "../core/schema.js";
import { categories, type Registry } from "../core/nodes/index.js";
import { previewOf, previewSvg, type PreviewOptions } from "../core/docs/preview.js";
import { keywordNodes } from "../core/keywords.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import {
	classify, RUNTIME_LABEL, RUNTIME_SUMMARY, RUNTIMES, type Runtime,
} from "../core/nodes/runtimes.js";
import { readPreferences, writePreferences } from "./preferences.js";

export interface NodePickerProps {
	registry: Registry;
	/** Only nodes this project's target can run. */
	target: "roblox" | "lune";
	/** How the picture is drawn: the reader's own geometry and colours. */
	preview: PreviewOptions;
	onPick: (def: NodeDef) => void;
	onClose: () => void;
}

/** Prefix beats substring beats category, and Luau typed in beats all of it. */
function score(def: NodeDef, query: string): number {
	const at = keywordNodes(query).indexOf(def.id);
	if (at >= 0) return 1000 - at;
	const title = def.title.toLowerCase();
	if (title === query) return 500;
	if (def.operator?.toLowerCase() === query) return 400;
	if (title.startsWith(query)) return 100;
	if (title.includes(query)) return 60;
	if (def.category.toLowerCase().includes(query)) return 30;
	if (def.id.toLowerCase().includes(query)) return 20;
	if (def.summary?.toLowerCase().includes(query)) return 10;
	return 0;
}

export function NodePicker({ registry, target, preview, onPick, onClose }: NodePickerProps) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const field = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);

	useEffect(() => {
		field.current?.focus();
	}, []);

	const forTarget = useMemo(
		() => [...registry.values()].filter((def) => !def.targets || def.targets.includes(target)),
		[registry, target],
	);

	/** Which runtime the list is narrowed to. The same preference the menu uses. */
	const [runtime, setRuntime] = useState<Runtime | null>(() => readPreferences().nodeRuntime);

	const chooseRuntime = (next: Runtime | null) => {
		setRuntime(next);
		writePreferences({ ...readPreferences(), nodeRuntime: next });
	};

	// Only the runtimes this graph actually has. See NodeMenu for why.
	const present = useMemo(() => {
		const seen = new Set(forTarget.map(classify));
		return RUNTIMES.filter((r) => seen.has(r));
	}, [forTarget]);

	const narrowed = runtime !== null && present.includes(runtime) ? runtime : null;

	const all = useMemo(
		() => (narrowed === null ? forTarget : forTarget.filter((def) => classify(def) === narrowed)),
		[forTarget, narrowed],
	);

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q === "") return all;
		return all
			.map((def) => ({ def, score: score(def, q) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score || a.def.title.localeCompare(b.def.title))
			.map((x) => x.def);
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
		const byCategory = new Map<string, NodeDef[]>();
		for (const def of matches) {
			byCategory.set(def.category, [...(byCategory.get(def.category) ?? []), def]);
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
						<span className="only" title={RUNTIME_SUMMARY[present[0]]}>
							Every node here is <strong>{RUNTIME_LABEL[present[0]]}</strong>
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
								title={RUNTIME_SUMMARY[r]}
							>
								{RUNTIME_LABEL[r]}
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
								if (chosen) onPick(chosen);
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
								{group.defs.map((def) => {
									const i = flat.indexOf(def);
									return (
										<button
											key={def.id}
											className={`node-picker-hit${i === active ? " on" : ""}`}
											onPointerEnter={() => setActive(i)}
											onClick={() => onPick(def)}
										>
											<span className="title">{def.title}</span>
											{def.pure && <span className="hint">pure</span>}
											{classify(def) !== "luau" && narrowed === null && (
												<span
													className={`hint runtime ${classify(def)}`}
													title={RUNTIME_SUMMARY[classify(def)]}
												>
													{RUNTIME_LABEL[classify(def)]}
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
									dangerouslySetInnerHTML={{ __html: previewSvg(previewOf(chosen), preview) }}
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
