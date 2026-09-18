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

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Target } from "../core/schema.js";
import { api, type PackFile } from "./api.js";
import { PackBrowser, type OpenPack } from "./designer/PackBrowser.jsx";
import { PackView } from "./designer/PackView.jsx";
import { DocsSearch } from "./DocsSearch.jsx";
import { buildSearchIndex, buildSite } from "../core/docs/site.js";
import { BUILTIN_NODES, createRegistry } from "../core/nodes/index.js";
import { pageHref, guardLeave, openPage, pageTarget, pagesShareTab } from "./pages.js";
import { usePreferenceSync } from "./preferenceSync.js";
import { readPreferences, writePreferences, type Preferences } from "./preferences.js";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import { Icon } from "./icons.jsx";
import { CanaryBanner, MarkedLogo } from "./previewBuild.jsx";
import { IntroPanel } from "./IntroPanel.jsx";
import { VERSION } from "../cli/version.js";

export function DesignerPage() {
	const [introOpen, setIntroOpen] = useState(false);
	const [packs, setPacks] = useState<PackFile[] | null>(null);
	const [target, setTarget] = useState<Target | null>(null);
	const [noProject, setNoProject] = useState(false);
	const [open, setOpen] = useState<OpenPack | null>(null);
	const [notice, setNotice] = useState<{ text: string; kind: "ok" | "failed" } | null>(null);
	const [docsJump, setDocsJump] = useState(false);

	/**
	 * This browser's preferences, and the panel that changes them.
	 *
	 * Node Design had neither: it took the scheme it opened in and the only way
	 * to change one was to go to another window and come back. A window that
	 * draws nodes all day is a window somebody adjusts node corners from.
	 *
	 * No project settings here — `roswaal.json` describes a project and is the
	 * editor's to change, and `SettingsPanel` drops that tab when no `config`
	 * is passed. The docs window mounts it the same way for the same reason.
	 */
	const [prefs, setPrefs] = useState<Preferences>(readPreferences);
	const [settingsOpen, setSettingsOpen] = useState(false);
	usePreferenceSync(setPrefs);

	const updatePrefs = useCallback((patch: Partial<Preferences>) => {
		setPrefs((current) => {
			const next = { ...current, ...patch };
			writePreferences(next);
			if ("theme" in patch) applyTheme(findTheme(next.theme));
			applyChrome(next);
			return next;
		});
	}, []);

	/**
	 * The documentation, from Node Design as well as from the editor.
	 *
	 * Ctrl+K opened the docs from the graph and did nothing here, which is the
	 * wrong way round if anything: designing a node is where you most need the
	 * reference for the one you are copying. The built-in library only — a
	 * project's own packs are documented in the editor, where the registry is
	 * live — which is the same index the graph's shortcut searches.
	 */
	const docsIndex = useMemo(
		() => buildSearchIndex(
			buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id))),
		),
		[],
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			if (!mod || e.key.toLowerCase() !== "k") return;
			e.preventDefault();
			setDocsJump(true);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

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
			<CanaryBanner />
			<header className="docs-page-head">
				<button
					className="logo as-chip"
					onClick={() => setIntroOpen(true)}
					title="Recent projects, the demos, and the other windows"
				>
					{/* A window of the browser build says so, the same way the editor
					    does: the mark in the build's colour. See `MarkedLogo`. */}
					<MarkedLogo height={17} title="Roswaal" />
					Node Design
					<span className="version">{VERSION}</span>
				</button>
				<span style={{ flex: 1 }} />
				<a
					className="tb icon-only"
					href={pageHref("docs", "creating-custom-nodes")}
					target={pageTarget("docs")}
					onClick={guardLeave}
					title="How custom nodes work"
					aria-label="How custom nodes work"
				>
					<Icon name="help" size={16} />
				</a>
				<a
					className="tb with-icon tb-collapsible"
					href={pageHref("docs")}
					target={pageTarget("docs")}
					onClick={guardLeave}
					title="The documentation"
				>
					<Icon name="document" size={15} />
					{/* Its icon alone on a phone, so Settings keeps the header's row. */}
					<span className="tb-label">Docs</span>
				</a>
				<a
					className="tb"
					href={pageHref("editor")}
					target={pagesShareTab() ? "_self" : "_blank"}
					rel="noreferrer"
					onClick={guardLeave}
				>
					Open Editor
				</a>
				<button
					type="button"
					className="tb icon-only"
					onClick={() => setSettingsOpen(true)}
					title="Settings"
					aria-label="Settings"
				>
					<Icon name="settings" size={16} />
				</button>
			</header>

			{introOpen && (
				<IntroPanel surface="designer" onClose={() => setIntroOpen(false)} />
			)}

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

			{settingsOpen && (
				<SettingsPanel
					prefs={prefs}
					onPrefs={updatePrefs}
					onClose={() => setSettingsOpen(false)}
				/>
			)}

			{docsJump && (
				<DocsSearch
					index={docsIndex}
					recent={[]}
					onPick={(slug) => {
						void openPage("docs", slug);
						setDocsJump(false);
					}}
					onClose={() => setDocsJump(false)}
				/>
			)}
		</div>
	);
}
