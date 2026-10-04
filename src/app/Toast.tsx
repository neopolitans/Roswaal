/**
 * A short notice that drops from the top centre of the window: what happened,
 * where, and then it goes.
 *
 * A wire dropped on a pin that refuses it says why here, rather than the drag
 * simply ending, which reads as the editor missing the drop. A compile says
 * what it wrote. Nothing here needs an answer; a question is a dialog.
 *
 * A module-level channel rather than props, because the component that knows
 * what happened and the layer that draws the notice are several components
 * apart. One notice at a time: a newer one replaces the last.
 */

import { type ReactNode, useEffect, useState } from "react";

import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";

export interface Toast {
	/** What happened. `**name**` is drawn bold, as on the documentation pages. */
	title: string;
	/** Where, or what it means: a path, a count, a gesture. */
	detail?: string;
	icon?: IconName;
	/** `ok` for something done, `warn` for something refused. Plain otherwise. */
	tone?: "ok" | "warn";
}

type Listener = (toast: Toast | null) => void;
const listeners = new Set<Listener>();

/** How long a notice stays, in milliseconds. Long enough to read a path. */
const SHOWN_FOR = 3200;

export function showToast(toast: Toast): void {
	for (const listener of listeners) listener(toast);
}

/** `**bold**` spans as `<strong>`; everything else as it is. */
function emphasised(text: string): ReactNode[] {
	return text
		.split(/\*\*(.+?)\*\*/g)
		.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/**
 * The layer the notices are drawn in. Placed once per window, over everything
 * else in it; it takes no clicks, so the canvas under it stays live.
 */
export function Toasts() {
	const [toast, setToast] = useState<{ toast: Toast; seq: number } | null>(null);
	const [shown, setShown] = useState(false);

	useEffect(() => {
		let seq = 0;
		const listener: Listener = (next) => {
			seq += 1;
			setToast(next ? { toast: next, seq } : null);
		};
		listeners.add(listener);
		return () => void listeners.delete(listener);
	}, []);

	// Each new notice comes in from above, even one replacing another, so a
	// second "Compiled" is seen to be a second one.
	useEffect(() => {
		if (!toast) return;
		setShown(false);
		const frame = requestAnimationFrame(() => setShown(true));
		const timer = window.setTimeout(() => setShown(false), SHOWN_FOR);
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(timer);
		};
	}, [toast]);

	if (!toast) return null;
	const { title, detail, icon, tone } = toast.toast;
	return (
		<div className="toast-layer">
			<div className={cx("toast", tone, shown && "shown")} role="status" aria-live="polite">
				<span className="toast-icon">
					<Icon name={icon ?? (tone === "warn" ? "warning" : "build")} size={15} />
				</span>
				<span className="toast-text">
					<b>{emphasised(title)}</b>
					{detail && <span>{detail}</span>}
				</span>
			</div>
		</div>
	);
}
