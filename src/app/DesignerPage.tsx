/**
 * The node designer: a visual editor for node packs.
 *
 * It opens on the packs — the project's and the built-in library's — because a
 * node is made in a pack, and where it lives decides who gets it. Choosing one
 * opens its nodes. See `docs/PLAN-0.34.0.md` for where this is going: a node
 * edited on a canvas of its own, with its logic in Luau or in nodes.
 *
 * ## It is still checked by the loader, not by a second opinion
 *
 * Everything the designer shows about a pack comes through `parseNodePack`,
 * which is the function the daemon uses to load a pack off disk. A node the
 * designer accepts is a node the project will load, and the problems shown here
 * are the problems the status panel would have shown later.
 */

import { useCallback, useEffect, useState } from "react";

import type { Target } from "../core/schema.js";
import { api, type PackFile } from "./api.js";
import { PackBrowser, type OpenPack } from "./designer/PackBrowser.jsx";
import { PackView } from "./designer/PackView.jsx";
import { PAGE_TARGET, pageHref } from "./pages.js";
import { Icon } from "./icons.jsx";
import { Logo } from "./logo.jsx";
import { VERSION } from "../cli/version.js";

export function DesignerPage() {
	const [packs, setPacks] = useState<PackFile[] | null>(null);
	const [target, setTarget] = useState<Target | null>(null);
	const [noProject, setNoProject] = useState(false);
	const [open, setOpen] = useState<OpenPack | null>(null);
	const [notice, setNotice] = useState<{ text: string; kind: "ok" | "failed" } | null>(null);

	const refresh = useCallback(async () => {
		try {
			const found = await api.packs();
			setPacks(found.packs);
			setTarget(found.target);
			setNoProject(false);
		} catch {
			// No daemon, or no project open. The built-in library is still worth looking at.
			setNoProject(true);
			setPacks([]);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const notify = useCallback((text: string, kind: "ok" | "failed" = "ok") => setNotice({ text, kind }), []);

	// A toast that says something worked goes on its own. One that says
	// something failed stays until it is dismissed, so it cannot be missed.
	useEffect(() => {
		if (!notice || notice.kind !== "ok") return;
		const timer = window.setTimeout(() => setNotice((current) => (current === notice ? null : current)), 4000);
		return () => window.clearTimeout(timer);
	}, [notice]);

	return (
		<div className="designer">
			<header className="docs-page-head">
				<span className="logo">
					<Logo height={17} title="Roswaal" />
					Node Design
					<span className="version">{VERSION}</span>
				</span>
				<span style={{ flex: 1 }} />
				<a
					className="tb icon-only"
					href={pageHref("docs", "creating-custom-nodes")}
					target="roswaal-docs"
					title="How custom nodes work"
					aria-label="How custom nodes work"
				>
					<Icon name="help" size={16} />
				</a>
				<a className="tb with-icon" href={pageHref("docs")} target={PAGE_TARGET.docs} title="The documentation">
					<Icon name="document" size={15} />
					Docs
				</a>
				<a className="tb" href={pageHref("editor")} target="_blank" rel="noreferrer">
					Open Editor
				</a>
			</header>

			{notice && (
				<div className={`designer-notice ${notice.kind}`} role={notice.kind === "failed" ? "alert" : "status"}>
					<span>{notice.text}</span>
					<button className="tb" onClick={() => setNotice(null)} aria-label="Dismiss">
						×
					</button>
				</div>
			)}

			{open ? (
				<PackView
					open={open}
					packs={packs ?? []}
					target={target}
					onBack={() => setOpen(null)}
					onChanged={refresh}
					notify={notify}
				/>
			) : (
				<PackBrowser
					packs={packs}
					target={target}
					noProject={noProject}
					onOpen={setOpen}
					onChanged={refresh}
					notify={notify}
				/>
			)}
		</div>
	);
}
