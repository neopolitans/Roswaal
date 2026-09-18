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
 *
 * It also holds its own copy of the preferences, and opens Settings for them.
 * The pictures follow the reader's Wires, Node corners and Docs settings, so
 * the window has to hear about a change wherever it was made: here directly, or
 * in the editor's window as a `storage` event.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { createRegistry } from "../core/nodes/index.js";
import { pageHref } from "./pages.js";
import type { NodeDef } from "../core/schema.js";
import { api } from "./api.js";
import { DocsView } from "./DocsPanel.jsx";
import { Icon } from "./icons.jsx";
import { Logo } from "./logo.jsx";
import { CanaryBanner, PreviewChip } from "./previewBuild.jsx";
import { IntroPanel } from "./IntroPanel.jsx";
import { readPreferences, writePreferences, type Preferences } from "./preferences.js";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { usePreferenceSync } from "./preferenceSync.js";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import { VERSION } from "../cli/version.js";

/** The slug in the address bar, so a docs page can be linked and bookmarked. */
function slugFromHash(): string | undefined {
	const hash = window.location.hash.replace(/^#/, "");
	return hash === "" ? undefined : decodeURIComponent(hash);
}

export function DocsPage() {
	const [introOpen, setIntroOpen] = useState(false);
	const [packs, setPacks] = useState<NodeDef[]>([]);
	const [packsFailed, setPacksFailed] = useState(false);
	const [slug, setSlug] = useState<string | undefined>(slugFromHash);
	const [prefs, setPrefs] = useState<Preferences>(readPreferences);
	const [settingsOpen, setSettingsOpen] = useState(false);
	/** The contents, over the page, on a screen too narrow for both. */
	const [navOpen, setNavOpen] = useState(false);

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

	// The editor or Node Design wrote a preference in its own window.
	usePreferenceSync(setPrefs);

	const updatePrefs = (patch: Partial<Preferences>) => {
		setPrefs((current) => {
			const next = { ...current, ...patch };
			writePreferences(next);
			if ("theme" in patch) applyTheme(findTheme(next.theme));
			applyChrome(next);
			return next;
		});
	};

	const registry = useMemo(() => createRegistry(packs), [packs]);

	/**
	 * A page change made inside the docs, written to the address bar and kept
	 * here too.
	 *
	 * `replaceState` rather than a hash assignment: navigating the docs should
	 * not stack up history entries you have to walk back out of. And the slug is
	 * remembered, because the address bar is what this window follows — left on
	 * the page it opened at, going back to that page's link set the same slug
	 * again, changed nothing, and left the page you had clicked to on screen.
	 */
	const onNavigate = useCallback((next: string) => {
		const url = `${window.location.pathname}#${encodeURIComponent(next)}`;
		window.history.replaceState(null, "", url);
		setSlug(next);
		setNavOpen(false);
	}, []);

	return (
		<>
		<div className={`docs-page${navOpen ? " nav-open" : ""}`}>
			{/* The sharper wording: these pages describe a build that is not out. */}
			<CanaryBanner kind="docs" />
			<header className="docs-page-head">
				{/* The mark and what this window is. "Roswaal Documentation" said
				    both of those in six syllables and neither of them quickly. */}
				<button
					className="logo as-chip"
					onClick={() => setIntroOpen(true)}
					title="Recent projects, the demos, and the other windows"
				>
					<Logo height={17} title="Roswaal" />
					Docs
					<span className="version">{VERSION}</span>
					{/* Nothing today: the browser build sends Docs to the published
					    site rather than to this window. Here anyway, because the
					    rule is every surface of that build, and the day this one is
					    served from it is not the day to remember. */}
					<PreviewChip />
				</button>
				<button
					className={`tb docs-nav-toggle${navOpen ? " on" : ""}`}
					aria-expanded={navOpen}
					onClick={() => setNavOpen((open) => !open)}
				>
					Contents
				</button>
				{packsFailed && (
					<span className="warn" title="Start the daemon and reload to include them">
						built-in nodes only — no daemon
					</span>
				)}
				<span style={{ flex: 1 }} />
				<button className="tb" onClick={() => setSettingsOpen(true)} title="Settings">
					<Icon name="settings" size={15} />
					Settings
				</button>
				<a className="tb" href={pageHref("editor")} target="_blank" rel="noreferrer">
					Open Editor
				</a>
			</header>

			{introOpen && (
				<IntroPanel surface="docs" onClose={() => setIntroOpen(false)} />
			)}

			<DocsView
				registry={registry}
				prefs={prefs}
				initialSlug={slug}
				onNavigate={onNavigate}
			/>
		</div>

		{/* Outside `.docs-page`, as it is outside the editor's shell: the
		    panel borrows the docs' class names for its frame, so inside this
		    window's rules it picked up the reading layout and cramped every row.

		    No project here, so no Project tab: those settings are the
		    repository's, and they are changed from the editor. */}
		{settingsOpen && (
			<SettingsPanel
				prefs={prefs}
				onPrefs={updatePrefs}
				onClose={() => setSettingsOpen(false)}
				initialTab="docs"
			/>
		)}
		</>
	);
}
