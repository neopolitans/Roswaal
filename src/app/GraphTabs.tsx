/**
 * The open graphs, as a group of tabs among the floating tools.
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
 * Node maps, Luau files and `.luaurc` files have tabs in the same row. Every
 * tab leads with its kind's icon, drawn as the project tree draws it: a graph
 * the document, a function ƒ, a map the map, and Luau the script icon in the
 * colour of the script it becomes.
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

import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";

import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";
import { Menu } from "./Menu.jsx";
import { trackPointer } from "./pointer.js";
import type { FunctionTabs } from "./preferences.js";
import type { OpenDocument, TabKind } from "./store.js";

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

/** Each kind's icon: the project tree's, so a tab and its row match. */
const KIND_ICON: Record<TabKind, IconName> = {
	nodescript: "document",
	function: "function",
	nodemap: "map",
	luau: "luauScript",
	luaurc: "settings",
};

/**
 * A Luau file by the script it becomes, as the tree colours it: a Server
 * Script, a LocalScript or a ModuleScript.
 */
function luauClass(path: string): string {
	if (/\.server\.luau?$/i.test(path)) return "tree-script-server";
	if (/\.client\.luau?$/i.test(path)) return "tree-script-local";
	return "tree-script-module";
}

/** A tab's icon, coloured by its kind. */
export function TabIcon({ doc, size }: { doc: OpenDocument; size: number }) {
	return (
		<Icon
			name={KIND_ICON[doc.kind]}
			size={size}
			className={cx("tab-kind", `tab-kind-${doc.kind}`, doc.kind === "luau" && luauClass(doc.path))}
		/>
	);
}

/** How far the pointer must travel before a press on a tab becomes a drag. */
const DRAG_THRESHOLD = 5;

export function GraphTabs({
	documents,
	functionTabs,
	onActivate,
	onClose,
	onReorder,
}: GraphTabsProps) {
	const row = useRef<HTMLDivElement>(null);
	// The tab being dragged, and the one it would land before.
	const [drag, setDrag] = useState<{ key: string; before: string | null } | null>(null);
	const [listOpen, setListOpen] = useState(false);

	// The tabs are the open document's name as well as the way between graphs,
	// so one graph still has its tab.
	const shown = documents.length > 0;

	// Where a tab dropped at this x would land.
	//
	// The midpoint of each tab, not its edges: dropping on the left half of a
	// tab means "before this one" and on the right half "after it", which is the
	// rule every editor with draggable tabs uses and the only one that lets a
	// tab be dropped at either end of the row.
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
		// Captured so the tab keeps the pointer as it passes over its
		// neighbours; the events still bubble to the window `trackPointer` hears.
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);

		trackPointer(e, {
			move: (ev) => {
				if (!moved && Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return;
				moved = true;
				const before = landingAt(ev.clientX);
				setDrag({ key, before: before === key ? null : before });
			},
			end: (release) => {
				if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
				// A cancelled drag puts the tab back where it was.
				if (moved && release) {
					const before = landingAt(release.clientX);
					onReorder(key, before === key ? null : before);
				}
				setDrag(null);
			},
		});
	}

	if (!shown) return null;

	return (
		<div className={cx("graph-tabs tool-group", drag && "reordering")} ref={row} role="tablist">
			{documents.map((doc) => {
				const label = tabLabel(doc, functionTabs);
				const full = tabLabel(doc, "full");
				return (
					<div
						key={doc.key}
						data-tab={doc.key}
						className={cx(
							"graph-tab",
							doc.active && "on",
							doc.dirty && "dirty",
							drag?.key === doc.key && "dragging",
							drag?.before === doc.key && "drop-before",
						)}
						role="tab"
						aria-selected={doc.active}
						title={doc.kind === "function" ? `ƒ ${full}\n${doc.path}` : doc.path}
						onPointerDown={(e) => onTabPointerDown(e, doc.key)}
					>
						<TabIcon doc={doc} size={13} />
						<span className="name">{label}</span>
						{doc.dirty && <span className="tab-dirty" aria-hidden />}
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
			<div className={cx("tab-rest", drag && drag.before === null && "drop-before")}>
				{documents.length > 1 && (
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

interface TabListProps {
	documents: OpenDocument[];
	functionTabs: FunctionTabs;
	open: boolean;
	onOpen: (open: boolean) => void;
	onActivate: (key: string) => void;
}

/**
 * Every open graph at once, as a list.
 *
 * The row scrolls, which is the right behaviour and a poor way to find
 * something: a tab that has scrolled out of sight is a tab you hunt for. The
 * list is the answer to "which graphs do I have open", asked in one glance,
 * and it is where a torn-off window would otherwise have been reached for.
 */
function TabList({ documents, functionTabs, open, onOpen, onActivate }: TabListProps) {
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	return (
		<div className="tab-list">
			<button
				className="tb"
				ref={setButton}
				title={`${documents.length} open`}
				aria-label="Open documents"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => onOpen(!open)}
			>
				<Icon name="chevron" size={13} />
			</button>
			{open && button && (
				<Menu
					at={{ element: button }}
					label="Open documents"
					onClose={() => onOpen(false)}
					sections={[
						{
							entries: documents.map((doc) => ({
								key: doc.key,
								label: tabLabel(doc, functionTabs),
								glyph: <TabIcon doc={doc} size={15} />,
								title: doc.path,
								current: doc.active,
								hint: doc.dirty ? <span className="menu-dot" aria-label="Not saved" /> : undefined,
								run: () => onActivate(doc.key),
							})),
						},
					]}
				/>
			)}
		</div>
	);
}
