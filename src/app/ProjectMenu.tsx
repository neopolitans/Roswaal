/**
 * Switching projects, from the mark in the toolbar.
 *
 * Everything behind this already existed — `POST /api/project/open`, the folder
 * picker, the recent list, and the 409 guard that stops a stale tab writing into
 * the project it *used* to have open. All of it was reachable from exactly one
 * screen: the first-run shell, which becomes unreachable the moment a project is
 * open. So the daemon could always switch projects and the editor simply had no
 * way to ask it to, and the workaround was to restart the daemon.
 *
 * The mark is where it goes because that is where it was looked for. An
 * application's own icon is the one place every desktop convention agrees
 * "about this document, and which document" lives.
 */

import { useEffect, useRef } from "react";

import { LAYER } from "./layers.js";
import { useHostCan } from "./host.js";

export interface ProjectMenuProps {
	/** Viewport position of the menu's top-left; it is `position: fixed`. */
	anchor: { x: number; y: number };
	/** The open project's root, so the menu can say what you are looking at. */
	current: string;
	/** Roots opened before, most recent first. May include `current`. */
	recent: string[];
	onOpen: (root: string) => void;
	onForget: (root: string) => void;
	/** Ask the daemon for a folder dialog, then open whatever comes back. */
	onBrowse: () => void;
	/** Hand the whole project over as one file. */
	onDownload: () => void;
	/** Throw away what the browser is holding and start from the demo. */
	onReset: () => void;
	onClose: () => void;
}

/** The last segment of a path, which is what anyone actually calls a project. */
export function projectName(root: string): string {
	const parts = root.split(/[\\/]/).filter((p) => p.length > 0);
	return parts[parts.length - 1] ?? root;
}

/**
 * Enough of the path to tell two projects apart, from the end.
 *
 * The end rather than the start: `V:\Infinite Studios\roswaal-node-scripter\`
 * is the same for every project in a repository and the part that differs is
 * always last. Truncating the other way round would show the identical half.
 */
export function projectTail(root: string, segments = 2): string {
	const separator = root.includes("\\") ? "\\" : "/";
	const parts = root.split(/[\\/]/).filter((p) => p.length > 0);
	if (parts.length <= segments) return root;
	return "…" + separator + parts.slice(-segments).join(separator);
}

export function ProjectMenu(props: ProjectMenuProps) {
	const { anchor, current, recent, onClose } = props;
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		// Deferred so the click that opened the menu does not close it again.
		const id = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
		window.addEventListener("keydown", onKey, true);
		return () => {
			window.clearTimeout(id);
			window.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onKey, true);
		};
	}, [onClose]);

	const canUseOtherProjects = useHostCan("inspect");
	// Only a host whose project is its own copy can throw it away.
	const canReset = useHostCan("reset");
	const others = recent.filter((r) => r !== current);

	return (
		<div
			ref={root}
			className="menu project-menu"
			style={{ left: anchor.x, top: anchor.y, zIndex: LAYER.menu }}
		>
			{/* What is open, named the same way the tree names it. Without this the
			    menu is a list of paths with no answer to "which one am I in". */}
			<div className="current" title={current}>
				<span className="name">{projectName(current)}</span>
				<span className="path">{projectTail(current, 3)}</span>
			</div>

			<div className="items">
				{canUseOtherProjects && others.length > 0 && <div className="group">Recent</div>}
				{canUseOtherProjects && others.map((path) => (
					<div
						key={path}
						className="item"
						title={path}
						onClick={() => {
							props.onOpen(path);
							onClose();
						}}
					>
						<span className="name">{projectName(path)}</span>
						<button
							className="forget"
							title="Remove from this list. The project itself is untouched."
							aria-label={`Forget ${projectName(path)}`}
							onClick={(e) => {
								// Or the row underneath opens the project being forgotten,
								// which is the opposite of what was asked for.
								e.stopPropagation();
								props.onForget(path);
							}}
						>
							×
						</button>
					</div>
				))}

				<div className="group">This project</div>
				<div
					className="item"
					title="Every graph, node pack and generated file, as a zip"
					onClick={() => {
						props.onDownload();
						onClose();
					}}
				>
					<span className="name">Download as a zip…</span>
				</div>

				{canReset && (
					<div
						className="item"
						title="Throw away everything in this browser and start from the demo"
						onClick={() => {
							props.onReset();
							onClose();
						}}
					>
						<span className="name">Start again from the demo…</span>
					</div>
				)}

				{/* Recent projects and opening another one both need a filesystem
				    with more than this project on it. In a browser tab there is
				    exactly one, held in memory, and a list of others would be a
				    list of nothing. */}
				{canUseOtherProjects && (
					<>
						<div className="group">Elsewhere</div>
						<div
							className="item"
							onClick={() => {
								props.onBrowse();
								onClose();
							}}
						>
							<span className="name">Open another project…</span>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
