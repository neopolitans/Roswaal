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
import type { NodeDef } from "../core/schema.js";
import { api } from "./api.js";
import { cx } from "./cx.js";
import { DocsView } from "./DocsPanel.jsx";
import { ToolGroup } from "./FloatingTools.jsx";
import { IntroPanel } from "./IntroPanel.jsx";
import { Icon } from "./icons.jsx";
import { pageHref, pagesShareTab } from "./pages.js";
import { usePreferenceSync } from "./preferenceSync.js";
import { type Preferences, readPreferences, writePreferences } from "./preferences.js";
import { SiteBanner } from "./previewBuild.jsx";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import { WindowMark } from "./WindowMark.jsx";

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
	// The contents, over the page, on a screen too narrow for both.
	const [navOpen, setNavOpen] = useState(false);
	// Presses of the header's search button. See `searchRequest`.
	const [searches, setSearches] = useState(0);

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

	// A page change made inside the docs, written to the address bar and kept
	// here too.
	//
	// `replaceState` rather than a hash assignment: navigating the docs should
	// not stack up history entries you have to walk back out of. And the slug is
	// remembered, because the address bar is what this window follows — left on
	// the page it opened at, going back to that page's link set the same slug
	// again, changed nothing, and left the page you had clicked to on screen.
	const onNavigate = useCallback((next: string) => {
		const url = `${window.location.pathname}#${encodeURIComponent(next)}`;
		window.history.replaceState(null, "", url);
		setSlug(next);
		setNavOpen(false);
	}, []);

	return (
		<>
			<div className={cx("docs-page docs-window", navOpen && "nav-open")}>
				{/* The sharper wording: these pages describe a build that is not out. */}
				<SiteBanner kind="docs" />
				{/* The same floating groups as the editor's and Node Design's: the
				    mark and the search at the left, the other windows at the right. */}
				<header className="docs-page-head docs-clusters">
					<ToolGroup className="mark-group">
						{/* The build's colour, as the editor's mark wears it, and the
						    window's name -- or on a phone its glyph. See WindowMark. */}
						<WindowMark window="docs" onOpen={() => setIntroOpen(true)} />
					</ToolGroup>
					{/* Search, beside the mark: the first thing a reader reaches for,
					    and the same search Ctrl+K opens. */}
					<ToolGroup className="search-group">
						<button
							className="tb docs-search-field"
							title="Search the docs (Ctrl+K)"
							aria-label="Search the docs"
							onClick={() => {
								setNavOpen(false);
								setSearches((n) => n + 1);
							}}
						>
							<Icon name="search" size={14} />
							<span className="docs-search-label">Search the docs</span>
							<kbd>Ctrl K</kbd>
						</button>
					</ToolGroup>
					{/* The contents as a drawer, where the window is too narrow to hold
					    them beside the page. */}
					<ToolGroup className="contents-group">
						<button
							className={cx("tb docs-nav-toggle", navOpen && "on")}
							aria-expanded={navOpen}
							onClick={() => setNavOpen((open) => !open)}
						>
							Contents
						</button>
					</ToolGroup>
					{packsFailed && (
						<span className="warn" title="Start the daemon and reload to include them">
							built-in nodes only — no daemon
						</span>
					)}
					<span className="spacer" />
					<ToolGroup>
						<button
							className="tb icon-only"
							onClick={() => setSettingsOpen(true)}
							title="Settings"
							aria-label="Settings"
						>
							<Icon name="settings" size={16} />
						</button>
						<a
							className="tb icon-only"
							href={pageHref("editor")}
							target={pagesShareTab() ? "_self" : "_blank"}
							rel="noreferrer"
							title="Open Editor — the graph editor"
							aria-label="Open Editor"
						>
							<Icon name="graph" size={16} />
						</a>
					</ToolGroup>
				</header>

				{introOpen && <IntroPanel surface="docs" onClose={() => setIntroOpen(false)} />}

				{/* Tapping beside the drawer puts it away, as on the static site.
			    Here rather than inside the body, which `DocsView` draws. */}
				{navOpen && <div className="docs-nav-scrim" onClick={() => setNavOpen(false)} />}

				<DocsView
					registry={registry}
					prefs={prefs}
					initialSlug={slug}
					onNavigate={onNavigate}
					searchRequest={searches}
				/>
			</div>

			{/* Outside `.docs-page`, as it is outside the editor's shell: the
		    panel borrows the docs' class names for its frame, so inside this
		    window's rules it picked up the reading layout and cramped every row.

		    The docs' own pages only: the project's and the canvas's are the
		    editor's, and the sheet says so. */}
			{settingsOpen && (
				<SettingsPanel
					prefs={prefs}
					onPrefs={updatePrefs}
					onClose={() => setSettingsOpen(false)}
					initialTab="docs"
					scope="docs"
					editorHref={pageHref("editor")}
				/>
			)}
		</>
	);
}
