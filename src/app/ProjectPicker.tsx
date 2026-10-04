/**
 * The first screen: choosing, browsing for or initialising a project.
 */

import { useEffect, useState } from "react";
import { VERSION } from "../cli/version.js";
import { DEMO_PROJECTS, type DemoProject } from "../core/demoProjects.js";
import { errorMessage } from "../core/errorMessage.js";
import type { Target } from "../core/schema.js";
import { api, type ProjectLook } from "./api.js";
import { cx } from "./cx.js";
import { FloatingTools, ToolGroup } from "./FloatingTools.jsx";
import { useHostCan, useHostFailure } from "./host.js";
import { Icon } from "./icons.jsx";
import { guardLeave, IS_STATIC_HOST, pageHref, pagesShareTab, pageTarget } from "./pages.js";
import { MarkedLogo } from "./previewBuild.jsx";
import {
	forget,
	openedAt,
	projectName,
	projectTail,
	recentProjects,
	sinceOpened,
} from "./recents.js";
import { showToast, Toasts } from "./Toast.jsx";

/** Written as a code unit so the escape survives the JSX attribute. */
const SEP = String.fromCharCode(92);

/** Past this many, the recent list gets a filter. */
const FILTER_FROM = 5;

/** The chip saying what a project compiles for. */
export function RuntimeChip({ target }: { target: Target }) {
	return (
		<span className={cx("runtime-chip", `runtime-chip-${target}`)}>
			{target === "lune" ? "Lune" : "Roblox"}
		</span>
	);
}

/**
 * The shell: what Roswaal is before it has a project.
 *
 * Two changes from typing a path into a box and hoping. The path is **inspected
 * before it is opened**, so one button says the right thing — Open a project
 * that is already one, Initialise a directory that is not, and a typo is
 * reported as a typo rather than as a failure to open. And projects you have
 * opened before are cards, saying what each compiles for and how big it is,
 * because a repository you work in is one you come back to and an absolute
 * path is not something to retype.
 *
 * It wears the floating chrome every other window does, so the docs and Node
 * Design are a press away before anything is open.
 */
export function ProjectPicker({
	onOpen,
	busy,
}: {
	onOpen: (root: string, init?: boolean) => void;
	busy: string | null;
}) {
	const [root, setRoot] = useState("");
	const [recent, setRecent] = useState<string[]>(() => recentProjects());
	const [look, setLook] = useState<ProjectLook | null>(null);
	// What each recent project is, asked once. Absent until the host answers.
	const [looks, setLooks] = useState<Record<string, ProjectLook>>({});
	const [filter, setFilter] = useState("");
	// The demos this install has, by folder name. Empty until the host answers.
	const [demoRoots, setDemoRoots] = useState<Record<string, string>>({});
	const [taking, setTaking] = useState<string | null>(null);
	// The folder picker is the machine's, and a host without one says so
	// before the button is drawn rather than when it is pressed.
	const canBrowse = useHostCan("browse");
	const canInspect = useHostCan("inspect");
	/**
	 * Set when the host never answered, which is not the same as having no
	 * project open. Offering a folder picker then is answering a question
	 * nobody asked, and hiding the one that matters.
	 */
	const hostFailure = useHostFailure();
	/**
	 * Browse is offered until the daemon says it cannot do it: a machine with
	 * no dialog — a daemon over SSH, a container — replaces it with the reason
	 * the first time it is pressed.
	 */
	const [noPicker, setNoPicker] = useState<string | null>(null);
	const [browsing, setBrowsing] = useState(false);

	// Asked as you type, and only about what you have typed — the daemon reads
	// one directory entry, so there is nothing to debounce harder than this.
	const typed = root.trim();
	useEffect(() => {
		if (typed === "") {
			setLook(null);
			return;
		}
		let live = true;
		const id = window.setTimeout(() => {
			void api.inspectProject(typed).then(
				(info) => live && setLook(info),
				() => live && setLook(null),
			);
		}, 250);
		return () => {
			live = false;
			window.clearTimeout(id);
		};
	}, [typed]);

	// The recent cards' details. One question each, all at once: six at most.
	useEffect(() => {
		if (!canInspect) return;
		let live = true;
		for (const path of recentProjects()) {
			void api.inspectProject(path).then(
				(info) => live && setLooks((all) => ({ ...all, [path]: info })),
				() => {
					// Unanswered, the card shows its name and path alone.
				},
			);
		}
		return () => {
			live = false;
		};
	}, [canInspect]);

	useEffect(() => {
		let live = true;
		void api
			.demos()
			.then((answer) => live && setDemoRoots(answer.demos ?? {}))
			.catch(() => {
				// A host with no demos route has none to offer, which is not an error.
			});
		return () => {
			live = false;
		};
	}, []);

	const verdict =
		typed === ""
			? null
			: look === null
				? { can: false, label: "Open", tone: "", note: "" }
				: !look.exists
					? {
							can: false,
							label: "Open",
							tone: "start-verdict-bad",
							note: "There is nothing at that path.",
						}
					: !look.directory
						? {
								can: false,
								label: "Open",
								tone: "start-verdict-bad",
								note: "That is a file, not a folder.",
							}
						: look.initialised
							? {
									can: true,
									label: "Open",
									tone: "start-verdict-ok",
									note: describe(look) ?? "A Roswaal project. Opens where you left it.",
								}
							: {
									can: true,
									label: "Initialise",
									tone: "start-verdict-new",
									note: "Not a Roswaal project yet. Initialising writes a roswaal.json and nothing else.",
								};

	const go = () => {
		if (verdict?.can) onOpen(typed, verdict.label === "Initialise");
	};

	/**
	 * The daemon opens the dialog, because a browser cannot produce a path —
	 * see `src/server/browse.ts`. It fills the field rather than opening the
	 * project: choosing a folder and opening it are two decisions, and the
	 * verdict below the field is what belongs between them.
	 */
	const browse = async () => {
		setBrowsing(true);
		try {
			const { path: chosen } = await api.browseForProject(typed || undefined);
			if (chosen) setRoot(chosen);
		} catch (err) {
			setNoPicker(errorMessage(err));
		} finally {
			setBrowsing(false);
		}
	};

	/**
	 * A copy of a demo, never the original: the demos ship beside the tool,
	 * and editing one changes what the next person to try it sees. The
	 * developer picks where it goes. See `IntroPanel`'s `take`.
	 */
	const take = async (demo: DemoProject) => {
		setTaking(demo.dir);
		try {
			const { path: into } = await api.browseForProject();
			if (into === null) return;
			const { root: copy } = await api.duplicateDemo(demo.dir, into);
			onOpen(copy);
		} catch (err) {
			showToast({ title: `${demo.name} was not copied`, detail: errorMessage(err), tone: "warn" });
		} finally {
			setTaking(null);
		}
	};

	const chrome = (
		<div className="window-chrome">
			<FloatingTools label="Roswaal">
				<ToolGroup className="mark-group">
					<span className="logo window-mark" title={`Roswaal ${VERSION}`}>
						<MarkedLogo height={17} />
						<span className="window-name">Roswaal</span>
						<span className="version">{VERSION}</span>
					</span>
				</ToolGroup>
				<span className="spacer" />
				<ToolGroup>
					<a
						className="tb icon-only"
						href={pageHref("docs")}
						target={pageTarget("docs")}
						onClick={guardLeave}
						title="Docs — the documentation"
						aria-label="Docs"
					>
						<Icon name="document" size={16} />
					</a>
					<a
						className="tb icon-only"
						href={pageHref("designer")}
						target={pagesShareTab() ? "_self" : "_blank"}
						rel="noreferrer"
						onClick={guardLeave}
						title="Node Design — the node packs"
						aria-label="Node Design"
					>
						<Icon name="palette" size={16} />
					</a>
				</ToolGroup>
			</FloatingTools>
		</div>
	);

	const hero = (
		<div className="start-hero">
			{/* The name stays in text beside the mark. This is the first screen,
			    and it is the one place that has to say what it is. */}
			<MarkedLogo height={44} />
			<div>
				<h1>Roswaal</h1>
				<p>
					Visual scripting for Luau. Open a Roblox repository, or a Lune one; Roswaal writes the
					Luau, and Rojo does the rest.
				</p>
			</div>
		</div>
	);

	if (hostFailure !== null) {
		return (
			<div className="start-page">
				{chrome}
				<div className="start-scroll">
					<div className="start-column">
						{hero}
						<div className="start-card start-down">
							<h2>
								{IS_STATIC_HOST
									? "Roswaal could not start in this tab"
									: "The Roswaal daemon is not answering"}
							</h2>
							<p>
								{IS_STATIC_HOST
									? "Nothing here can open a project until it does."
									: "The editor needs it to read and write your project. Start it in the project's folder, then reload."}
							</p>
							{!IS_STATIC_HOST && (
								<div className="start-command">
									<code>roswaal serve</code>
									<button
										type="button"
										className="tb"
										onClick={() =>
											void navigator.clipboard
												?.writeText("roswaal serve")
												.then(() =>
													showToast({ title: "Copied", detail: "roswaal serve", icon: "copy" }),
												)
												.catch(() => {
													// No clipboard here; the command is on screen to copy by hand.
												})
										}
									>
										Copy
									</button>
								</div>
							)}
							<p className="start-note">{hostFailure}</p>
							<div className="start-row">
								<button
									type="button"
									className="tb primary"
									onClick={() => window.location.reload()}
								>
									Reload
								</button>
								{IS_STATIC_HOST && (
									<a
										className="tb"
										href="https://github.com/neopolitans/roswaal-feedback/issues/new"
										target="_blank"
										rel="noreferrer"
									>
										Report this
									</a>
								)}
							</div>
						</div>
					</div>
				</div>
				<Toasts />
			</div>
		);
	}

	const shown = recent.filter((path) => path.toLowerCase().includes(filter.trim().toLowerCase()));
	const demos = DEMO_PROJECTS.filter((one) => demoRoots[one.dir] !== undefined);

	return (
		<div className="start-page">
			{chrome}
			<div className="start-scroll">
				<div className="start-column">
					{hero}

					<div className="start-card start-open">
						<label className="start-label" htmlFor="start-path">
							Open a project
						</label>
						<div className="start-row">
							<span className="start-field">
								<Icon name="folder" size={16} />
								<input
									id="start-path"
									placeholder={"C:" + SEP + "path" + SEP + "to" + SEP + "project"}
									value={root}
									autoFocus
									autoComplete="off"
									spellCheck={false}
									onChange={(e) => setRoot(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && go()}
								/>
							</span>
							{noPicker === null && canBrowse && (
								<button
									type="button"
									className="tb with-icon"
									disabled={browsing || !!busy}
									title="Choose a folder using the file dialog"
									onClick={() => void browse()}
								>
									<Icon name="folderOpen" size={15} />
									{browsing ? "Choosing…" : "Browse…"}
								</button>
							)}
							<button
								type="button"
								className="tb primary"
								disabled={!verdict?.can || !!busy}
								onClick={go}
							>
								{verdict?.label ?? "Open"}
							</button>
						</div>
						<p className={cx("start-verdict", noPicker === null && verdict?.tone)}>
							<span className="start-dot" aria-hidden />
							{noPicker ??
								busy ??
								(verdict?.note ||
									(canBrowse
										? "Type a folder's path, or Browse… for your computer's own dialog."
										: "Type a folder's path."))}
						</p>
					</div>

					{recent.length > 0 && (
						<>
							<div className="start-section">
								<span>Recent</span>
								<span className="start-count">{recent.length}</span>
								<span className="spacer" />
								{recent.length >= FILTER_FROM && (
									<input
										className="start-filter"
										placeholder="Filter recent projects"
										aria-label="Filter recent projects"
										value={filter}
										onChange={(e) => setFilter(e.target.value)}
									/>
								)}
							</div>
							{shown.length === 0 ? (
								<p className="start-empty">No recent project matches “{filter.trim()}”.</p>
							) : (
								<div className="start-cards">
									{shown.map((path) => (
										<RecentCard
											key={path}
											path={path}
											look={looks[path]}
											busy={!!busy}
											onOpen={() => onOpen(path)}
											onForget={() => {
												forget(path);
												setRecent(recentProjects());
												showToast({
													title: `Took **${projectName(path)}** off the list`,
													detail: "The folder is untouched.",
													icon: "close",
												});
											}}
										/>
									))}
								</div>
							)}
						</>
					)}

					{demos.length > 0 && (
						<>
							<div className="start-section">
								<span>Try a demo</span>
							</div>
							<div className="start-cards">
								{demos.map((demo) => (
									<button
										key={demo.dir}
										type="button"
										className="start-tile start-demo"
										disabled={taking !== null || !!busy}
										title="Choose where the copy goes. The demo itself is never edited."
										onClick={() => void take(demo)}
									>
										<span className="start-tile-name">
											{demo.name}
											<RuntimeChip target={demo.target} />
										</span>
										<span className="start-tile-what">{demo.what}</span>
										<span className="start-tile-meta">
											{demo.graphs} graphs
											<span className="start-faint">
												· {taking === demo.dir ? "copying…" : "take a copy"}
											</span>
										</span>
									</button>
								))}
							</div>
						</>
					)}

					<footer className="start-foot">
						<a
							href={pageHref("docs", "getting-started")}
							target={pageTarget("docs")}
							onClick={guardLeave}
						>
							Getting started
						</a>
						<a
							href={pageHref("docs", "command-line")}
							target={pageTarget("docs")}
							onClick={guardLeave}
						>
							Command line
						</a>
						<a
							href={pageHref("docs", "release-notes")}
							target={pageTarget("docs")}
							onClick={guardLeave}
						>
							What is new in {VERSION}
						</a>
						<span className="spacer" />
						<span>
							New project in a terminal: <code>roswaal init</code>
						</span>
					</footer>
				</div>
			</div>
			<Toasts />
		</div>
	);
}

/** "A Roswaal project · Roblox · 14 graphs", when the host said. */
function describe(look: ProjectLook): string | null {
	if (look.target === undefined || look.graphs === undefined) return null;
	const graphs = `${look.graphs} graph${look.graphs === 1 ? "" : "s"}`;
	return `A Roswaal project · ${look.target === "lune" ? "Lune" : "Roblox"} · ${graphs}`;
}

/**
 * One recent project. What it compiles for and how many graphs, once the
 * host has said; a project that has gone says so, and keeps its Forget.
 */
function RecentCard({
	path,
	look,
	busy,
	onOpen,
	onForget,
}: {
	path: string;
	look: ProjectLook | undefined;
	busy: boolean;
	onOpen: () => void;
	onForget: () => void;
}) {
	const at = openedAt(path);
	const gone = look !== undefined && (!look.exists || !look.directory);
	return (
		<div className={cx("start-tile", gone && "start-tile-gone")}>
			<button
				type="button"
				className="start-tile-open"
				disabled={busy}
				onClick={onOpen}
				title={path}
			>
				<span className="start-tile-name">{projectName(path)}</span>
				<span className="start-tile-path">{projectTail(path, 3)}</span>
				<span className="start-tile-meta">
					{gone ? (
						<span className="start-missing">Not found at this path</span>
					) : (
						<>
							{look?.target && <RuntimeChip target={look.target} />}
							{look?.graphs !== undefined && (
								<span>
									{look.graphs} graph{look.graphs === 1 ? "" : "s"}
								</span>
							)}
						</>
					)}
					{at !== null && <span className="start-faint">· {sinceOpened(at)}</span>}
				</span>
			</button>
			<span className="start-tile-acts">
				<button
					type="button"
					className="tb icon-only"
					title="Take it off this list"
					aria-label={`Take ${projectName(path)} off this list`}
					onClick={onForget}
				>
					<Icon name="close" size={13} />
				</button>
			</span>
		</div>
	);
}
