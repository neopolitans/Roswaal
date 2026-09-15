/**
 * The open graphs, along the top of the centre.
 *
 * Slice 4 of `docs/PANELS.md`, and the half of panelisation the M103 conversion
 * actually needs: a conversion runs over several graphs, and moving between
 * them should not mean losing where you were in each.
 *
 * ## What a tab carries
 *
 * The graph's **name**, not its file name. Those can differ — a graph carries
 * its own name and that is what the compiler writes out — and the name is what
 * everything else in the editor calls it. The path is on the tooltip, for the
 * moment two graphs are called the same thing.
 *
 * A function's graph is a tab too, marked ƒ and named `hide (Occupancy)`: the
 * function, then the file it is in. The Function tabs preference can shorten
 * that to either name; the tooltip keeps both.
 *
 * The dirty dot is the same one the document bar uses. It appears for the few
 * hundred milliseconds before autosave catches up, which is short enough that
 * its real job is telling you the editor noticed rather than telling you to act.
 *
 * ## Getting back to a tab when there are a dozen
 *
 * Two answers, and they are different questions. **Dragging** reorders the row,
 * so the four graphs a conversion is actually about can sit together instead of
 * wherever opening them happened to put them. **The list** at the end of the
 * row names every open graph at once, which is what you want when the row has
 * outgrown the window and the tab you are after has scrolled off it.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import type { FunctionTabs } from "./preferences.js";
import type { OpenDocument } from "./store.js";

export interface GraphTabsProps {
	documents: OpenDocument[];
	functionTabs: FunctionTabs;
	onActivate: (key: string) => void;
	onClose: (key: string) => void;
	/**
	 * A tab was dragged to a new place: put it before `before`, or at the end
	 * when that is null. Absent leaves the row fixed.
	 */
	onReorder?: (key: string, before: string | null) => void;
}

/** What a tab says. */
export function tabLabel(doc: OpenDocument, functionTabs: FunctionTabs): string {
	if (doc.graph === null) return doc.name;
	if (functionTabs === "function") return doc.name;
	if (functionTabs === "script") return doc.scriptName;
	return `${doc.name} (${doc.scriptName})`;
}

/** How far the pointer must travel before a press on a tab becomes a drag. */
const DRAG_THRESHOLD = 5;

export function GraphTabs({ documents, functionTabs, onActivate, onClose, onReorder }: GraphTabsProps) {
	const row = useRef<HTMLDivElement>(null);
	/** The tab being dragged, and the one it would land before. */
	const [drag, setDrag] = useState<{ key: string; before: string | null } | null>(null);
	const [listOpen, setListOpen] = useState(false);

	// One graph is not a choice, and a strip showing it is a row of chrome
	// saying what the document bar underneath already says. A function's graph
	// is the exception: the bar names the file, and only the tab says which
	// graph of it this is.
	const shown = documents.length >= 2 || documents.some((d) => d.graph !== null);

	/**
	 * Where a tab dropped at this x would land.
	 *
	 * The midpoint of each tab, not its edges: dropping on the left half of a
	 * tab means "before this one" and on the right half "after it", which is the
	 * rule every editor with draggable tabs uses and the only one that lets a
	 * tab be dropped at either end of the row.
	 */
	const landingAt = (clientX: number): string | null => {
		const tabs = [...(row.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? [])];
		for (const tab of tabs) {
			const box = tab.getBoundingClientRect();
			if (clientX < box.left + box.width / 2) return tab.dataset.tab ?? null;
		}
		return null;
	};

	function onTabPointerDown(e: ReactPointerEvent, key: string) {
		// Middle-click closes, as it does in every editor with tabs.
		if (e.button === 1) {
			e.preventDefault();
			onClose(key);
			return;
		}
		if (e.button !== 0) return;
		onActivate(key);
		if (!onReorder) return;

		const startX = e.clientX;
		let moved = false;
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);

		const move = (ev: PointerEvent) => {
			if (!moved && Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return;
			moved = true;
			const before = landingAt(ev.clientX);
			setDrag({ key, before: before === key ? null : before });
		};
		const up = (ev: PointerEvent) => {
			target.releasePointerCapture?.(ev.pointerId);
			target.removeEventListener("pointermove", move);
			target.removeEventListener("pointerup", up);
			target.removeEventListener("pointercancel", up);
			if (moved) {
				const before = landingAt(ev.clientX);
				onReorder(key, before === key ? null : before);
			}
			setDrag(null);
		};
		target.addEventListener("pointermove", move);
		target.addEventListener("pointerup", up);
		target.addEventListener("pointercancel", up);
	}

	if (!shown) return null;

	return (
		<div className={`graph-tabs${drag ? " reordering" : ""}`} ref={row} role="tablist">
			{documents.map((doc) => {
				const label = tabLabel(doc, functionTabs);
				const full = tabLabel(doc, "full");
				const marks = [
					drag?.key === doc.key ? " dragging" : "",
					drag && drag.before === doc.key ? " drop-before" : "",
				].join("");
				return (
					<div
						key={doc.key}
						data-tab={doc.key}
						className={`graph-tab${doc.active ? " on" : ""}${doc.dirty ? " dirty" : ""}${marks}`}
						role="tab"
						aria-selected={doc.active}
						title={doc.graph === null ? doc.path : `ƒ ${full}\n${doc.path}`}
						onPointerDown={(e) => onTabPointerDown(e, doc.key)}
					>
						{doc.graph !== null && <Icon name="function" size={13} className="tab-fn" />}
						<span className="name">{label}</span>
						<button
							className="close"
							title={`Close ${full}`}
							aria-label={`Close ${full}`}
							// The tab beneath would otherwise activate on the way past,
							// so closing a background tab would first switch to it.
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								onClose(doc.key);
							}}
						>
							×
						</button>
					</div>
				);
			})}
			{/* The end of the row is a drop target too, and has to be wide enough
			    to hit when the row is full. It also holds the list. */}
			<div className={`tab-rest${drag && drag.before === null ? " drop-before" : ""}`}>
				{documents.length > 2 && (
					<TabList
						documents={documents}
						functionTabs={functionTabs}
						open={listOpen}
						onOpen={setListOpen}
						onActivate={(key) => {
							setListOpen(false);
							onActivate(key);
						}}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * Every open graph at once, as a list.
 *
 * The row scrolls, which is the right behaviour and a poor way to find
 * something: a tab that has scrolled out of sight is a tab you hunt for. The
 * list is the answer to "which graphs do I have open", asked in one glance,
 * and it is where a torn-off window would otherwise have been reached for.
 */
function TabList(props: {
	documents: OpenDocument[];
	functionTabs: FunctionTabs;
	open: boolean;
	onOpen: (open: boolean) => void;
	onActivate: (key: string) => void;
}) {
	const { documents, functionTabs, open } = props;
	const root = useRef<HTMLDivElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	/**
	 * Where the menu is drawn, in viewport coordinates.
	 *
	 * The tab row scrolls sideways, which means it clips its children -- an
	 * absolutely-placed menu inside it is cut off at the row's bottom edge and
	 * cannot be shown at all. So the menu is `position: fixed` and told where
	 * the button ended up, the same way the node palette is.
	 */
	const [at, setAt] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => {
			if (!root.current?.contains(e.target as Node)) props.onOpen(false);
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") props.onOpen(false);
		};
		// Captured, so a press inside the graph closes it before the graph acts
		// on the press as well.
		window.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key);
		};
	}, [open, props]);

	return (
		<div className="tab-list" ref={root}>
			<button
				className="tb"
				ref={button}
				title={`${documents.length} graphs open`}
				aria-label="Open graphs"
				aria-expanded={open}
				onClick={() => {
					const box = button.current?.getBoundingClientRect();
					if (box) setAt({ x: box.left, y: box.bottom + 2 });
					props.onOpen(!open);
				}}
			>
				<Icon name="chevron" size={13} />
			</button>
			{open && at && (
				<div className="tab-list-menu" style={{ zIndex: LAYER.menu, left: at.x, top: at.y }}>
					{documents.map((doc) => (
						<button
							key={doc.key}
							className={`tab-list-item${doc.active ? " on" : ""}`}
							title={doc.path}
							onClick={() => props.onActivate(doc.key)}
						>
							{doc.graph !== null && <Icon name="function" size={12} className="tab-fn" />}
							<span className="name">{tabLabel(doc, functionTabs)}</span>
							{doc.dirty && <span className="dot" aria-hidden />}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
