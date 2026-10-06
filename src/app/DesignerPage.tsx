/**
 * The node designer: a visual editor for node packs.
 *
 * It opens on the packs — the project's and the built-in library's — because a
 * node is made in a pack, and where it lives decides who gets it. Choosing one
 * opens its nodes: a node edited on a canvas of its own, with its logic in
 * Luau or in nodes.
 *
 * ## It is still checked by the loader, not by a second opinion
 *
 * Everything the designer shows about a pack comes through `parseNodePack`,
 * which is the function the daemon uses to load a pack off disk. A node the
 * designer accepts is a node the project will load, and the problems shown here
 * are the problems the status panel would have shown later.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildSearchIndex, buildSite } from "../core/docs/site.js";
import { BUILTIN_NODES, createRegistry } from "../core/nodes/index.js";
import type { NodeDef, Target } from "../core/schema.js";
import { api, type PackFile } from "./api.js";
import { DocsSearch } from "./DocsSearch.jsx";
import { type OpenPack, PackBrowser } from "./designer/PackBrowser.jsx";
import { PackView } from "./designer/PackView.jsx";
import { FloatingTools, ToolGroup } from "./FloatingTools.jsx";
import { IntroPanel } from "./IntroPanel.jsx";
import { Icon } from "./icons.jsx";
import { MenuButton } from "./Menu.jsx";
import { usePhone } from "./Popout.jsx";
import { guardLeave, openPage, pageHref, pagesShareTab, pageTarget } from "./pages.js";
import { usePreferenceSync } from "./preferenceSync.js";
import { type Preferences, readPreferences, writePreferences } from "./preferences.js";
import { SiteBanner } from "./previewBuild.jsx";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { showToast, Toasts } from "./Toast.jsx";
import { applyChrome, applyTheme, findTheme } from "./theme.js";
import { WindowMark } from "./WindowMark.jsx";

export function DesignerPage() {
	const [introOpen, setIntroOpen] = useState(false);
	const [packs, setPacks] = useState<PackFile[] | null>(null);
	// The project's own nodes, for the pack cards' titles and colours.
	const [customDefs, setCustomDefs] = useState<NodeDef[]>([]);
	const [target, setTarget] = useState<Target | null>(null);
	const [noProject, setNoProject] = useState(false);
	const [open, setOpen] = useState<OpenPack | null>(null);
	const [notice, setNotice] = useState<{ text: string; kind: "ok" | "failed" } | null>(null);
	// A phone's row folds the other windows into More.
	const phone = usePhone();
	// Where the open node's own actions are drawn: a cluster of the chrome.
	const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
	const [docsJump, setDocsJump] = useState(false);

	// This browser's preferences, and the panel that changes them.
	//
	// Node Design had neither: it took the scheme it opened in and the only way
	// to change one was to go to another window and come back. A window that
	// draws nodes all day is a window somebody adjusts node corners from.
	//
	// No project settings here — `roswaal.json` describes a project and is the
	// editor's to change, and `SettingsPanel` drops that tab when no `config`
	// is passed. The docs window mounts it the same way for the same reason.
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

	// The documentation, from Node Design as well as from the editor.
	//
	// Ctrl+K opened the docs from the graph and did nothing here, which is the
	// wrong way round if anything: designing a node is where you most need the
	// reference for the one you are copying. The built-in library only — a
	// project's own packs are documented in the editor, where the registry is
	// live — which is the same index the graph's shortcut searches.
	const docsIndex = useMemo(
		() => buildSearchIndex(buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)))),
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
			void api.customNodes().then(
				({ custom }) => setCustomDefs(custom),
				() => {
					// Titles only: a pack still lists by id without them.
				},
			);
		} catch {
			// No daemon, or no project open. The built-in library is still worth looking at.
			setNoProject(true);
			setPacks([]);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const notify = useCallback((text: string, kind: "ok" | "failed" = "ok") => {
		if (kind === "ok") showToast({ title: text, icon: "palette", tone: "ok" });
		else setNotice({ text, kind });
	}, []);

	// A toast that says something worked goes on its own. One that says
	// something failed stays until it is dismissed, so it cannot be missed.
	useEffect(() => {
		if (!notice || notice.kind !== "ok") return;
		const timer = window.setTimeout(
			() => setNotice((current) => (current === notice ? null : current)),
			4000,
		);
		return () => window.clearTimeout(timer);
	}, [notice]);

	return (
		<div className="designer">
			<SiteBanner />
			{/* The window's chrome floats, as the editor's does: the mark and the
			    pack at the left, the node's own actions and the other windows at
			    the right. The node's actions are drawn by the node editor into
			    the slot, so they sit with the rest rather than in a row of their own. */}
			<div className="window-chrome">
				<FloatingTools label="Node Design">
					<ToolGroup className="mark-group">
						<WindowMark window="designer" onOpen={() => setIntroOpen(true)} />
					</ToolGroup>
					<span className="spacer" />
					<div className="tool-slot" ref={setActionsSlot} />
					{/* On a phone the other windows fold into More, as the editor's do: the
					    row has the mark and the node's own actions to hold. */}
					<ToolGroup>
						{phone ? (
							<MenuButton
								label={<Icon name="more" size={16} />}
								title="More"
								align="end"
								sections={[
									{
										entries: [
											{
												label: "How custom nodes work",
												icon: "help",
												link: {
													href: pageHref("docs", "creating-custom-nodes"),
													target: pageTarget("docs"),
												},
												run: guardLeave,
											},
											{
												label: "Docs",
												icon: "document",
												link: { href: pageHref("docs"), target: pageTarget("docs") },
												run: guardLeave,
											},
										],
									},
									{
										entries: [
											{
												label: "Open Editor",
												icon: "graph",
												link: {
													href: pageHref("editor"),
													target: pagesShareTab() ? "_self" : "_blank",
													rel: "noreferrer",
												},
												run: guardLeave,
											},
											{ label: "Settings", icon: "settings", run: () => setSettingsOpen(true) },
										],
									},
								]}
							/>
						) : (
							<>
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
									href={pageHref("editor")}
									target={pagesShareTab() ? "_self" : "_blank"}
									rel="noreferrer"
									onClick={guardLeave}
									title="Open Editor — the graph editor"
									aria-label="Open Editor"
								>
									<Icon name="graph" size={16} />
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
							</>
						)}
					</ToolGroup>
				</FloatingTools>
			</div>

			{introOpen && <IntroPanel surface="designer" onClose={() => setIntroOpen(false)} />}

			{notice && (
				<div className="designer-notice failed" role="alert">
					<span>{notice.text}</span>
					<button className="tb" onClick={() => setNotice(null)} aria-label="Dismiss">
						×
					</button>
				</div>
			)}

			<Toasts />

			{open ? (
				<PackView
					open={open}
					packs={packs ?? []}
					target={target}
					onBack={() => setOpen(null)}
					onChanged={refresh}
					prefs={prefs}
					onPrefs={updatePrefs}
					notify={notify}
					actionsSlot={actionsSlot}
				/>
			) : (
				<PackBrowser
					packs={packs}
					defs={customDefs}
					target={target}
					noProject={noProject}
					onOpen={setOpen}
					onChanged={refresh}
					notify={notify}
					actionsSlot={actionsSlot}
				/>
			)}

			{settingsOpen && (
				<SettingsPanel prefs={prefs} onPrefs={updatePrefs} onClose={() => setSettingsOpen(false)} />
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
