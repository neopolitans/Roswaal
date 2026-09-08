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
 * The dirty dot is the same one the document bar uses. It appears for the few
 * hundred milliseconds before autosave catches up, which is short enough that
 * its real job is telling you the editor noticed rather than telling you to act.
 */

import type { PointerEvent as ReactPointerEvent } from "react";

import type { OpenDocument } from "./store.js";

export interface GraphTabsProps {
	documents: OpenDocument[];
	onActivate: (path: string) => void;
	onClose: (path: string) => void;
}

export function GraphTabs({ documents, onActivate, onClose }: GraphTabsProps) {
	// One graph is not a choice, and a strip showing it is a row of chrome
	// saying what the document bar underneath already says.
	if (documents.length < 2) return null;

	return (
		<div className="graph-tabs" role="tablist">
			{documents.map((doc) => (
				<div
					key={doc.path}
					className={`graph-tab${doc.active ? " on" : ""}${doc.dirty ? " dirty" : ""}`}
					role="tab"
					aria-selected={doc.active}
					title={doc.path}
					onPointerDown={(e: ReactPointerEvent) => {
						// Middle-click closes, as it does in every editor with tabs.
						if (e.button === 1) {
							e.preventDefault();
							onClose(doc.path);
							return;
						}
						if (e.button === 0) onActivate(doc.path);
					}}
				>
					<span className="name">{doc.name}</span>
					<button
						className="close"
						title={`Close ${doc.name}`}
						aria-label={`Close ${doc.name}`}
						// The tab beneath would otherwise activate on the way past,
						// so closing a background tab would first switch to it.
						onPointerDown={(e) => e.stopPropagation()}
						onClick={(e) => {
							e.stopPropagation();
							onClose(doc.path);
						}}
					>
						×
					</button>
				</div>
			))}
		</div>
	);
}
