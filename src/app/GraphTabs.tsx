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
 */

import type { PointerEvent as ReactPointerEvent } from "react";

import { Icon } from "./icons.jsx";
import type { FunctionTabs } from "./preferences.js";
import type { OpenDocument } from "./store.js";

export interface GraphTabsProps {
	documents: OpenDocument[];
	functionTabs: FunctionTabs;
	onActivate: (key: string) => void;
	onClose: (key: string) => void;
}

/** What a tab says. */
export function tabLabel(doc: OpenDocument, functionTabs: FunctionTabs): string {
	if (doc.graph === null) return doc.name;
	if (functionTabs === "function") return doc.name;
	if (functionTabs === "script") return doc.scriptName;
	return `${doc.name} (${doc.scriptName})`;
}

export function GraphTabs({ documents, functionTabs, onActivate, onClose }: GraphTabsProps) {
	// One graph is not a choice, and a strip showing it is a row of chrome
	// saying what the document bar underneath already says. A function's graph
	// is the exception: the bar names the file, and only the tab says which
	// graph of it this is.
	if (documents.length < 2 && !documents.some((d) => d.graph !== null)) return null;

	return (
		<div className="graph-tabs" role="tablist">
			{documents.map((doc) => {
				const label = tabLabel(doc, functionTabs);
				const full = tabLabel(doc, "full");
				return (
					<div
						key={doc.key}
						className={`graph-tab${doc.active ? " on" : ""}${doc.dirty ? " dirty" : ""}`}
						role="tab"
						aria-selected={doc.active}
						title={doc.graph === null ? doc.path : `ƒ ${full}\n${doc.path}`}
						onPointerDown={(e: ReactPointerEvent) => {
							// Middle-click closes, as it does in every editor with tabs.
							if (e.button === 1) {
								e.preventDefault();
								onClose(doc.key);
								return;
							}
							if (e.button === 0) onActivate(doc.key);
						}}
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
		</div>
	);
}
