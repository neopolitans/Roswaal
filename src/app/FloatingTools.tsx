/**
 * Tools that float over a view, the way Blender's header tools float over its
 * viewport.
 *
 * A row of chrome above a canvas costs the canvas a row. Floating the tools in
 * groups along the view's top edge gives that height back, and a gap between
 * two groups is canvas you can still see and click through to.
 *
 * ## Why the view underneath never sees a click on a tool
 *
 * The strip is a **sibling** of the view, positioned over it, not a child of
 * it. The canvas starts pans and marquees from `pointerdown` on its own element
 * and zooms from a `wheel` listener on the same element, and none of those
 * events reach it from a sibling. Nesting the strip inside the canvas would have
 * meant remembering to stop every one of them at every button — and a marquee
 * that starts because somebody pressed Realign is the kind of bug that ships.
 *
 * The container itself takes no pointer events, so the space between groups
 * belongs to the view. Only the groups do.
 */

import type { ReactNode } from "react";

export function FloatingTools({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="floating-tools" role="toolbar" aria-label={label}>
			{children}
		</div>
	);
}

/** One cluster of tools, drawn as a panel of its own over the view. */
export function ToolGroup({ children, title }: { children: ReactNode; title?: string }) {
	return (
		<div className="tool-group" title={title}>
			{children}
		</div>
	);
}
