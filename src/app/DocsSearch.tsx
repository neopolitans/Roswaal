/**
 * The docs search palette: Ctrl+K, and a window over the page.
 *
 * The sidebar's field is the right shape for "narrow the list I am looking at"
 * and the wrong one for "find the page about X". It is a column two hundred
 * pixels wide, so a hit shows its title and the section it is in and nothing
 * else — which is enough when you already know the page and not enough when you
 * are looking for one.
 *
 * This is the other half: the whole width of the window, a line of the page's
 * own summary under each hit, the section it belongs to, and a mark saying
 * whether it is an article or a node's reference. Opened by the shortcut every
 * documentation site has trained people to reach for.
 *
 * Rendered through a portal for the reason `ValuePicker` is: the docs view is
 * inside a dock in the editor and a scrolled column in the window, and a
 * `position: fixed` child of either is contained by it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { rankDocs, type DocsHit, type SearchEntry } from "../core/docs/site.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";

export interface DocsSearchProps {
	index: SearchEntry[];
	/**
	 * Slugs visited this session, most recent first.
	 *
	 * Shown when nothing has been typed. A palette that opens empty is a palette
	 * that asks you a question; the pages you were just reading are the answer
	 * often enough to be worth offering, and are the one list here that is about
	 * you rather than about the documentation.
	 */
	recent: readonly string[];
	onPick: (slug: string) => void;
	onClose: () => void;
}

/** How many hits the palette shows. Enough to scroll, few enough to scan. */
const LIMIT = 24;

export function DocsSearch({ index, recent, onPick, onClose }: DocsSearchProps) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const field = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);

	useEffect(() => {
		field.current?.focus();
		field.current?.select();
	}, []);

	const bySlug = useMemo(() => new Map(index.map((e) => [e.slug, e])), [index]);

	const hits = useMemo((): DocsHit[] => {
		if (query.trim() === "") {
			return recent
				.map((slug) => bySlug.get(slug))
				.filter((e): e is SearchEntry => !!e)
				.map((entry) => ({ entry, score: 0, named: false }));
		}
		return rankDocs(index, query, LIMIT);
	}, [index, bySlug, query, recent]);

	/**
	 * Two lists, in one order.
	 *
	 * **Best match** is the pages called what you typed; **Related** is the ones
	 * that merely say it somewhere. Splitting them is what makes the second half
	 * skippable — and the arrows still walk the whole thing top to bottom,
	 * because a heading between two rows is not a reason to stop.
	 */
	const sections = useMemo(() => {
		if (query.trim() === "") return [{ head: "Recently visited", hits }];
		const best = hits.filter((hit) => hit.named);
		const related = hits.filter((hit) => !hit.named);
		return [
			...(best.length > 0 ? [{ head: "Best match", hits: best }] : []),
			...(related.length > 0 ? [{ head: "Related", hits: related }] : []),
		];
	}, [hits, query]);

	/** The rows as the arrows walk them, which is the sections flattened. */
	const flat = useMemo(() => sections.flatMap((section) => section.hits), [sections]);

	useEffect(() => setActive(0), [query]);

	// Keep the highlighted row on screen while the arrows walk past the fold.
	useEffect(() => {
		list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
	}, [active, flat]);

	const move = (by: number) => {
		if (flat.length === 0) return;
		setActive((at) => (at + by + flat.length) % flat.length);
	};

	return createPortal(
		<div
			className="docs-palette-backdrop"
			style={{ zIndex: LAYER.menu }}
			onPointerDown={(e) => {
				// Only a click on the backdrop itself closes it: a drag that starts
				// inside the panel and ends outside is a text selection.
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="docs-palette" role="dialog" aria-label="Search the docs">
				<div className="docs-palette-field">
					<Icon name="search" size={14} />
					<input
						ref={field}
						value={query}
						placeholder="Search the docs"
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
								const hit = flat[active];
								if (hit) onPick(hit.entry.slug);
							} else if (e.key === "Escape") {
								e.preventDefault();
								e.stopPropagation();
								onClose();
							}
						}}
					/>
					<button className="tb icon-only" title="Close" onClick={onClose}>
						×
					</button>
				</div>

				<div className="docs-palette-list" ref={list}>
					{flat.length === 0 && (
						<div className="empty">
							{query.trim() === ""
								? "Pages you open are listed here."
								: `Nothing matches “${query.trim()}”.`}
						</div>
					)}
					{sections.map((section) => (
						<div key={section.head} className="docs-palette-section">
							<div className="docs-palette-head">{section.head}</div>
							{section.hits.map((hit) => {
								const i = flat.indexOf(hit);
								const kind = hit.entry.nodeId ? "node" : "article";
								return (
									<button
										key={hit.entry.slug}
										className={`docs-palette-hit${i === active ? " on" : ""}`}
										onPointerEnter={() => setActive(i)}
										onClick={() => onPick(hit.entry.slug)}
									>
										{/* `kind-node`, not `node`: `.node` is the canvas node, and a bare
										    modifier class in a six-thousand-line stylesheet finds it.
										    This one came out `position: absolute`, under the title. */}
										<span className={`kind kind-${kind}`}>
											{kind === "node" ? "Node" : "Article"}
										</span>
										<span className="body">
											<span className="title">{hit.entry.title}</span>
											<span className="where">{hit.entry.section}</span>
											<span className="summary">{hit.entry.summary}</span>
										</span>
									</button>
								);
							})}
						</div>
					))}
				</div>

				<div className="docs-palette-foot">
					<span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
					<span><kbd>Enter</kbd> to open</span>
					<span><kbd>Esc</kbd> to close</span>
				</div>
			</div>
		</div>,
		document.body,
	);
}
