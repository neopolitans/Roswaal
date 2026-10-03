/**
 * The first screen: choosing, browsing for or initialising a project.
 */

import { useEffect, useState } from "react";

import { api } from "./api.js";
import { useHostCan, useHostFailure } from "./host.js";
import { IS_STATIC_HOST } from "./pages.js";
import { MarkedLogo } from "./previewBuild.jsx";
import { forget, recentProjects } from "./recents.js";
import { errorMessage } from "../core/errorMessage.js";

/** Written as a code unit so the escape survives the JSX attribute. */
const SEP = String.fromCharCode(92);

/**
 * The shell: what Roswaal is before it has a project.
 *
 * Two changes from typing a path into a box and hoping. The path is **inspected
 * before it is opened**, so one button says the right thing — Open a project
 * that is already one, Initialise a directory that is not, and a typo is
 * reported as a typo rather than as a failure to open. And projects you have
 * opened before are listed, because a repository you work in is one you come
 * back to and an absolute path is not something to retype.
 */
export function ProjectPicker({
	onOpen, busy,
}: { onOpen: (root: string, init?: boolean) => void; busy: string | null }) {
	const [root, setRoot] = useState("");
	const [recent, setRecent] = useState<string[]>(() => recentProjects());
	const [look, setLook] = useState<
		{ exists: boolean; directory: boolean; initialised: boolean } | null
	>(null);
	/**
	 * Browse is offered until the daemon says it cannot do it.
	 *
	 * Not probed up front: finding out costs a round trip on a screen whose
	 * whole job is to be instant, and the answer only matters once. So the
	 * button is there, and a machine with no dialog — a daemon over SSH, a
	 * container — replaces it with the reason the first time you press it.
	 */
	// The folder picker is the machine's, and a host without one says so
	// before the button is drawn rather than when it is pressed.
	const canBrowse = useHostCan("browse");
	/**
	 * Set when the host never answered, which is not the same as having no
	 * project open. Offering a folder picker then is answering a question
	 * nobody asked, and hiding the one that matters.
	 */
	const hostFailure = useHostFailure();
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

	const verdict =
		typed === "" ? null
		: look === null ? { can: false, label: "Open", note: "" }
		: !look.exists ? { can: false, label: "Open", note: "There is nothing at that path." }
		: !look.directory ? { can: false, label: "Open", note: "That is a file, not a directory." }
		: look.initialised
			? { can: true, label: "Open", note: "A Roswaal project. Opens where you left it." }
			: {
				can: true, label: "Initialise",
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

	if (hostFailure !== null) {
		return (
			<div className="placeholder shell">
				<h1 className="logo"><MarkedLogo height={26} /> Roswaal</h1>
				<p className="shell-broken">
					{IS_STATIC_HOST
						? "Roswaal could not start in this tab. Nothing here can open a project until it does."
						: "The Roswaal daemon is not answering. Start it with `roswaal serve` in your project, then reload."}
				</p>
				<p className="shell-note">{hostFailure}</p>
				<div className="shell-row">
					<button className="tb primary" onClick={() => window.location.reload()}>
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
		);
	}

	return (
		<div className="placeholder shell">
			{/* Here the name stays in text beside the mark. This is the first
			    screen, and it is the one place that has to say what it is. */}
			<h1 className="logo"><MarkedLogo height={26} /> Roswaal</h1>
			<p>Open a Roblox repository, or a Lune one (experimental). Roswaal writes Luau into it; Rojo does the rest.</p>

			<div className="row">
				<input
					className="tb"
					style={{ width: 420, cursor: "text" }}
					placeholder={"C:" + SEP + "path" + SEP + "to" + SEP + "project"}
					value={root}
					autoFocus
					onChange={(e) => setRoot(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && go()}
				/>
				{noPicker === null && canBrowse && (
					<button
						className="tb"
						disabled={browsing || !!busy}
						title="Choose a folder using the file dialog"
						onClick={() => void browse()}
					>
						{browsing ? "Choosing…" : "Browse…"}
					</button>
				)}
				<button
					className="tb primary"
					disabled={!verdict?.can || !!busy}
					onClick={go}
				>
					{verdict?.label ?? "Open"}
				</button>
			</div>
			{noPicker !== null && <p className="shell-note">{noPicker}</p>}
			{noPicker === null && verdict?.note && <p className="shell-note">{verdict.note}</p>}

			{recent.length > 0 && (
				<div className="shell-recent">
					<div className="shell-recent-head">Recent</div>
					{recent.map((path) => (
						<div key={path} className="shell-recent-row">
							<button className="shell-recent-open" disabled={!!busy} onClick={() => onOpen(path)}>
								<span className="name">{path.split(/[\/]/).filter(Boolean).pop()}</span>
								<span className="path">{path}</span>
							</button>
							<button
								className="shell-recent-forget"
								title="Remove from this list"
								onClick={() => {
									forget(path);
									setRecent(recentProjects());
								}}
							>
								×
							</button>
						</div>
					))}
				</div>
			)}

			{busy && <p>{busy}</p>}
		</div>
	);
}
