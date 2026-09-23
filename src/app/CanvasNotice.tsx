/**
 * A short message at the foot of the graph, for something the canvas did or
 * would not do.
 *
 * A wire dropped on a pin that refused it used to end the drag and say
 * nothing, which reads as the editor missing the drop. Now it says why.
 *
 * A module-level channel rather than props, because the canvas that knows what
 * happened and the centre that draws the notice are several components apart.
 * One message at a time: a newer one replaces the last.
 */

import { useEffect, useState } from "react";

type Listener = (text: string | null) => void;
const listeners = new Set<Listener>();

export function showCanvasNotice(text: string): void {
	for (const listener of listeners) listener(text);
}

export function CanvasNotice() {
	const [text, setText] = useState<string | null>(null);

	useEffect(() => {
		listeners.add(setText);
		return () => void listeners.delete(setText);
	}, []);

	useEffect(() => {
		if (text === null) return;
		const timer = window.setTimeout(() => setText(null), 4000);
		return () => window.clearTimeout(timer);
	}, [text]);

	if (text === null) return null;
	return (
		<div className="centre-notice" role="status">
			<span>{text}</span>
			<button type="button" className="tb" onClick={() => setText(null)} aria-label="Dismiss">✕</button>
		</div>
	);
}
