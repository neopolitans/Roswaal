/**
 * The way in, from whichever window you are already in.
 *
 * Roswaal is three surfaces — the editor, Node Design and the documentation —
 * and until now the mark in the corner of each did something different, or
 * nothing. In the editor it dropped a project menu; in the other two it was
 * decoration. So "click the Roswaal mark" had three answers, and two of them
 * were no.
 *
 * It has one answer now: the projects you were in, the projects that shipped,
 * and the way to the other two windows. The same panel in all three, because
 * the question somebody has when they reach for the mark is the same one in
 * all three.
 *
 * ## What it shows depends on where it is
 *
 * Not on a flag, but on what the host can actually answer. A daemon has your
 * recent projects and the demos on disk beside it. The playground has one
 * project on a volume. The published documentation has neither — so it has no
 * Recent section rather than an empty one, because a heading over nothing is
 * a promise the page cannot keep.
 *
 * ## Opening a project from a window that is not the editor
 *
 * Through the host, not through the URL. `api.openProject` points the daemon
 * at it and then the editor tab is opened, which adopts whatever the daemon
 * has open — the same path `roswaal serve <dir>` takes. Writing the choice
 * into local storage and hoping the editor read it would be a second
 * mechanism that disagrees with the first whenever somebody has turned
 * "reopen last project" off.
 */

import { useEffect, useRef, useState } from "react";

import { api } from "./api.js";
import { DEMO_PROJECTS, type DemoProject } from "../core/demoProjects.js";
import { Icon } from "./icons.jsx";
import { Logo } from "./logo.jsx";
import { IS_STATIC_HOST, PAGE_TARGET, pageHref, type Page } from "./pages.js";
import { projectName, projectTail, recentProjects } from "./recents.js";
import { RUNTIME_LABEL } from "../core/nodes/runtimes.js";
import { VERSION } from "../cli/version.js";

/** What each surface calls itself, for the chip and for the buttons out. */
const SURFACE_NAME: Record<Page, string> = {
	editor: "Editor",
	docs: "Docs",
	designer: "Node Design",
};

/** The other two, in the order they are offered. */
const OTHERS: Record<Page, Page[]> = {
	editor: ["designer", "docs"],
	docs: ["editor", "designer"],
	designer: ["editor", "docs"],
};

/** The icons the toolbars already use for these, so they match. */
const SURFACE_ICON = {
	editor: "build",
	docs: "document",
	designer: "palette",
} as const;

export interface IntroPanelProps {
	/** Which window this is, so it offers the other two. */
	surface: Page;
	/** The open project, where there is one, so its card can say so. */
	current?: string | null;
	/**
	 * Open a project in this window. Only the editor can; the other two hand
	 * the root to the host and open the editor tab instead.
	 */
	onOpen?: (root: string) => void;
	/** Back to the picker, where this window has one. */
	onHome?: () => void;
	/** Project actions the editor's old menu carried, where the host has them. */
	actions?: React.ReactNode;
	onClose: () => void;
}

/**
 * A row that scrolls sideways, with the arrows only while there is somewhere
 * to go.
 *
 * Measured rather than counted: whether four cards overflow depends on the
 * window, and a pair of arrows that do nothing is worse furniture than none.
 */
function Carousel({ label, children }: { label: string; children: React.ReactNode }) {
	const rail = useRef<HTMLDivElement>(null);
	const [over, setOver] = useState(false);

	useEffect(() => {
		const box = rail.current;
		if (!box) return;
		const measure = () => setOver(box.scrollWidth > box.clientWidth + 1);
		measure();
		const watcher = new ResizeObserver(measure);
		watcher.observe(box);
		return () => watcher.disconnect();
	}, [children]);

	const nudge = (by: number) => {
		const box = rail.current;
		if (!box) return;
		box.scrollBy({ left: by * Math.max(240, box.clientWidth * 0.8), behavior: "smooth" });
	};

	return (
		<section className="intro-shelf">
			<div className="intro-shelf-head">
				<h2>{label}</h2>
				{over && (
					<span className="intro-arrows">
						{/* One chevron, turned. There is no left or right glyph, and
						    two more paths to keep in step with this one would be a
						    worse answer than a rotation. */}
						<button
							className="tb icon-only turn-left"
							onClick={() => nudge(-1)}
							aria-label={`${label}: back`}
						>
							<Icon name="chevron" size={14} />
						</button>
						<button
							className="tb icon-only turn-right"
							onClick={() => nudge(1)}
							aria-label={`${label}: forward`}
						>
							<Icon name="chevron" size={14} />
						</button>
					</span>
				)}
			</div>
			<div className="intro-rail" ref={rail}>{children}</div>
		</section>
	);
}

/** The chip saying which runtime a demo compiles for. */
function TargetChip({ target }: { target: DemoProject["target"] }) {
	return <span className={`badge runtime ${target}`}>{RUNTIME_LABEL[target]}</span>;
}

export function IntroPanel(props: IntroPanelProps) {
	const { surface, current, onOpen, onHome, actions, onClose } = props;

	const [recent] = useState<string[]>(() => recentProjects());
	/** Demo folder name -> its root here. Empty until the host answers. */
	const [demoRoots, setDemoRoots] = useState<Record<string, string>>({});
	/** The demo being copied, and why the last attempt did not finish. */
	const [busy, setBusy] = useState<string | null>(null);
	const [trouble, setTrouble] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		void api.demos()
			.then((answer) => {
				if (live) setDemoRoots(answer.demos ?? {});
			})
			// A host with no demos route is an older daemon or the published
			// site. Neither is an error worth showing: there are simply none.
			.catch(() => {});
		return () => {
			live = false;
		};
	}, []);

	// Escape closes it, as it closes every other overlay in the app.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	/**
	 * Open a project from whichever window this is.
	 *
	 * In the editor that is a local matter. Anywhere else it is the host's:
	 * point the daemon at it, then open the editor, which adopts what the
	 * daemon has.
	 */
	const open = (root: string) => {
		if (onOpen) {
			onOpen(root);
			onClose();
			return;
		}
		void api.openProject(root)
			.then(() => {
				window.open(pageHref("editor"), PAGE_TARGET.editor);
				onClose();
			})
			.catch(() => {
				// The daemon refused or is not there. The editor can still be
				// opened, and will say why better than a panel can.
				window.open(pageHref("editor"), PAGE_TARGET.editor);
			});
	};

	const demos = DEMO_PROJECTS.filter((one) => demoRoots[one.dir] !== undefined);

	/**
	 * Take a copy of a demo, and open that.
	 *
	 * Never the original. The demos are files that shipped beside the tool, so
	 * the first thing anybody does to try one would otherwise be to edit the
	 * copy every other user of that install gets — and here, where they are in
	 * the repository, it turns up as a change to Roswaal rather than as
	 * somebody's own work. That is not a hypothetical; it is what happened to
	 * the Lune demo the day it was added.
	 *
	 * The developer picks where it goes, because a demo they cannot find again
	 * is barely better than one they could not take.
	 */
	const take = (demo: DemoProject) => {
		setBusy(demo.dir);
		setTrouble(null);
		void api.browseForProject()
			.then(({ path: into }) => {
				if (into === null) {
					setBusy(null);
					return;
				}
				return api.duplicateDemo(demo.dir, into).then(({ root }) => {
					setBusy(null);
					open(root);
				});
			})
			.catch((err: Error) => {
				setBusy(null);
				setTrouble(err.message || "It could not be copied.");
			});
	};

	return (
		<div className="intro-backdrop" onPointerDown={onClose}>
			<div
				className="intro-panel"
				role="dialog"
				aria-label="Roswaal"
				onPointerDown={(e) => e.stopPropagation()}
			>
				<header className="intro-head">
					<span className="logo">
						<Logo height={20} title="Roswaal" />
						Roswaal
					</span>
					<span className="intro-where">
						{SURFACE_NAME[surface]}
						<span className="version">{VERSION}</span>
					</span>
					<span style={{ flex: 1 }} />
					<button className="tb icon-only" onClick={onClose} aria-label="Close">
						<Icon name="close" size={15} />
					</button>
				</header>

				<div className="intro-body">
					{recent.length > 0 && (
						<Carousel label="Recent">
							{recent.map((root) => (
								<button
									key={root}
									className={`intro-card${root === current ? " on" : ""}`}
									onClick={() => open(root)}
									title={root}
								>
									<span className="intro-card-name">{projectName(root)}</span>
									<span className="intro-card-what">{projectTail(root)}</span>
									{root === current && <span className="intro-card-open">open</span>}
								</button>
							))}
						</Carousel>
					)}

					{demos.length > 0 && (
						<Carousel label={recent.length > 0 ? "Demos" : "Try it"}>
							{demos.map((demo) => (
								<button
									key={demo.dir}
									className="intro-card"
									disabled={busy !== null}
									onClick={() => take(demo)}
									title={`Copy ${demo.name} somewhere of your own, and open that`}
								>
									<span className="intro-card-name">
										{demo.name}
										<TargetChip target={demo.target} />
									</span>
									<span className="intro-card-what">{demo.what}</span>
									<span className="intro-card-open">
										{busy === demo.dir
											? "copying…"
											: `${demo.graphs} ${demo.graphs === 1 ? "graph" : "graphs"} · take a copy`}
									</span>
								</button>
							))}
						</Carousel>
					)}

					{trouble !== null && <p className="intro-trouble">{trouble}</p>}

					{recent.length === 0 && demos.length === 0 && (
						<p className="intro-empty">
							{IS_STATIC_HOST
								? "This is the published documentation, so there are no projects here. "
								: "No projects yet. "}
							The editor is where one is opened.
						</p>
					)}
				</div>

				<footer className="intro-foot">
					{onHome && (
						<button
							className="tb with-icon"
							onClick={() => { onHome(); onClose(); }}
							title="Close this project and go back to the start"
						>
							<span className="turn-left"><Icon name="chevron" size={15} /></span>
							Home
						</button>
					)}
					{actions}
					<span style={{ flex: 1 }} />
					{OTHERS[surface].map((page) => (
						<a
							key={page}
							className="tb with-icon"
							href={pageHref(page)}
							target={PAGE_TARGET[page]}
							rel="noreferrer"
							onClick={onClose}
						>
							<Icon name={SURFACE_ICON[page]} size={15} />
							{SURFACE_NAME[page]}
						</a>
					))}
				</footer>
			</div>
		</div>
	);
}
