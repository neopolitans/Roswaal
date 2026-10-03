/**
 * A project compile's progress, floating over the canvas.
 */

import { useEffect, useState } from "react";

import type { CompileStep } from "./api.js";

/** The last segment of a path, which is what identifies a file at a glance. */
function fileName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** How long a finished compile stays on screen before it takes itself away. */
const TOAST_LINGER_MS = 4000;

/**
 * A project compile, narrated in the corner of the graph.
 *
 * Deliberately *not* in the status panel, which is the script analysis view —
 * that panel answers "what is wrong with this graph", and a compile's progress
 * is neither about this graph nor about anything being wrong. Putting the walk
 * in the panel meant a thousand rows of good news burying the one diagnostic
 * you opened it for.
 *
 * It floats over the canvas rather than taking space from it, because it is
 * temporary and the graph underneath is what you were looking at.
 */
export function CompileToast({ progress }: { progress: CompileStep[] }) {
	const [showing, setShowing] = useState(false);

	const walking = progress.find((step) => step.state === "working");
	const settled = progress.filter((step) => step.state !== "working");
	const total = progress[0]?.total ?? 0;

	useEffect(() => {
		if (progress.length === 0) return;
		setShowing(true);
		// While a file is still being compiled there is no timer to start: the
		// next event will run this again, and the last one to arrive is the one
		// that has no `working` step and therefore starts the countdown.
		if (walking) return;
		const timer = window.setTimeout(() => setShowing(false), TOAST_LINGER_MS);
		return () => window.clearTimeout(timer);
	}, [progress, walking]);

	if (!showing || progress.length === 0) return null;

	const wrote = settled.filter((step) => step.state === "wrote").length;
	const failed = settled.filter((step) => step.state === "failed").length;
	const skipped = settled.filter((step) => step.state === "skipped").length;

	// What actually happened, in the order it matters. A compile that wrote
	// nothing because nothing needed writing is not worth a line of its own.
	const summary =
		[
			wrote > 0 ? `${wrote} written` : null,
			skipped > 0 ? `${skipped} skipped` : null,
			failed > 0 ? `${failed} failed` : null,
		]
			.filter(Boolean)
			.join(" · ") || `${settled.length} checked`;

	return (
		<div
			className={`compile-toast${failed > 0 && !walking ? " has-failures" : ""}`}
			// Dismissable, because it covers the bottom-right corner of the graph
			// and four seconds is a long time if that is where you were working.
			onClick={() => setShowing(false)}
			title="Dismiss"
			role="status"
			aria-live="polite"
		>
			<div className="head">
				<span className="what">{walking ? "Compiling project" : "Compiled"}</span>
				<span className="count">
					{walking ? `${walking.index} of ${total}` : `${settled.length} files`}
				</span>
			</div>
			{/* The file, while there is one. Its name rather than its path: the
			    path is the same for a thousand of them and the name is not. */}
			<div className="detail">{walking ? fileName(walking.scriptPath) : summary}</div>
			<div className="track">
				<span
					className="fill"
					style={{ width: `${(settled.length / Math.max(total, 1)) * 100}%` }}
				/>
			</div>
		</div>
	);
}
