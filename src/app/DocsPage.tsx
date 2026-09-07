/**
 * The docs as their own window.
 *
 * A modal over the canvas was the wrong shape: you read documentation *while*
 * wiring, and a dialog that covers the graph makes you close it to look at the
 * thing you are reading about. This is a separate window — put it on a second
 * monitor, or beside the editor — served from the same daemon at `/docs`.
 *
 * It loads the project's custom node packs the same way the editor does, so the
 * reference here documents the same registry the canvas is using, packs and all.
 * If the daemon is not reachable it still opens, with the built-in library only,
 * and says so rather than showing an empty page.
 */

import { useEffect, useMemo, useState } from "react";

import { createRegistry } from "../core/nodes/index.js";
import type { NodeDef } from "../core/schema.js";
import { api } from "./api.js";
import { DocsView } from "./DocsPanel.jsx";
import { Logo } from "./logo.jsx";
import { VERSION } from "../cli/version.js";

/** The slug in the address bar, so a docs page can be linked and bookmarked. */
function slugFromHash(): string | undefined {
	const hash = window.location.hash.replace(/^#/, "");
	return hash === "" ? undefined : decodeURIComponent(hash);
}

export function DocsPage() {
	const [packs, setPacks] = useState<NodeDef[]>([]);
	const [packsFailed, setPacksFailed] = useState(false);
	const [slug, setSlug] = useState<string | undefined>(slugFromHash);

	useEffect(() => {
		void api
			.customNodes()
			.then((r) => setPacks(r.custom))
			.catch(() => setPacksFailed(true));
	}, []);

	// Back and forward should move between pages, not out of the window.
	useEffect(() => {
		const onHash = () => setSlug(slugFromHash());
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	const registry = useMemo(() => createRegistry(packs), [packs]);

	return (
		<div className="docs-page">
			<header className="docs-page-head">
				{/* The mark and what this window is. "Roswaal Documentation" said
				    both of those in six syllables and neither of them quickly. */}
				<span className="logo">
					<Logo height={17} title="Roswaal" />
					Docs
					<span className="version">{VERSION}</span>
				</span>
				{packsFailed && (
					<span className="warn" title="Start the daemon and reload to include them">
						built-in nodes only — no daemon
					</span>
				)}
				<span style={{ flex: 1 }} />
				<a className="tb" href="/" target="_blank" rel="noreferrer">
					Open the editor
				</a>
			</header>

			<DocsView
				registry={registry}
				initialSlug={slug}
				onNavigate={(next) => {
					// replaceState rather than a hash assignment: navigating the docs
					// should not stack up history entries you have to walk back out of.
					const url = `${window.location.pathname}#${encodeURIComponent(next)}`;
					window.history.replaceState(null, "", url);
				}}
			/>
		</div>
	);
}
