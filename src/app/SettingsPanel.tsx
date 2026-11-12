/**
 * Settings.
 *
 * Two kinds of setting, kept visibly apart because they behave differently and
 * confusing them is expensive. **Project** settings are `roswaal.json`: they are
 * committed, every developer on the repository shares them, and changing one
 * changes what the compiler does. **Preferences** are this browser's, stored
 * locally, and nobody else ever sees them.
 *
 * The panel says which is which at the top of each section rather than relying
 * on the reader to infer it, because the single most likely mistake here is
 * putting a personal colour scheme into a file that ends up in a pull request.
 *
 * Modelled on the Docs window — a nav down the left, one section at a time —
 * for the ordinary reason that a second overlay in a third shape is one shape
 * too many.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { CARRIED_LICENCES } from "../core/licenceData.js";
import { INDENT_WIDTHS, type RoswaalConfig, type Target } from "../core/schema.js";
import { CODE_ROLES, ROLES, type Theme } from "../core/theme.js";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { BundledNotices, LicenceDetail } from "./LicenceView.jsx";
import { LAYER } from "./layers.js";
import { nodeColor, pinColor } from "./palette.js";
import { floatPanel } from "./panels.js";
import {
	ACTION_LABEL_CHOICES,
	ACTION_ROW_CHOICES,
	AUTOSAVE_CHOICES,
	CLASS_GROUPS,
	CLASS_ICON_STYLES,
	DOCS_FONTS,
	FUNCTION_TAB_CHOICES,
	GRID_CONTRASTS,
	GRID_PATTERNS,
	OUTLINE_WIDTHS,
	type OutlineWidth,
	PREVIEW_SCALE,
	type Preferences,
	previewScaleOf,
	VIEWPORT_FRAME_RATES,
	VIEWPORT_RENDERERS,
	type ViewportFrameRate,
	WHEEL_CHOICES,
	WIRE_STYLES,
} from "./preferences.js";
import { BUILTIN_THEMES } from "./theme.js";

/** Where a page's settings are kept, which the list is grouped by. */
type Keeper = "project" | "browser" | "about";

const PAGES = [
	{ id: "compiling", title: "Compiling", keeper: "project" },
	{ id: "packs", title: "Node packs", keeper: "project" },
	{ id: "canvas", title: "Canvas", keeper: "browser" },
	{ id: "nodes", title: "Nodes", keeper: "browser" },
	{ id: "workspace", title: "Workspace", keeper: "browser" },
	{ id: "scene", title: "Scene view", keeper: "browser" },
	{ id: "themes", title: "Themes", keeper: "browser" },
	{ id: "docs", title: "Docs", keeper: "browser" },
	{ id: "made", title: "How Roswaal is made", keeper: "about" },
	{ id: "licences", title: "Licences", keeper: "about" },
] as const satisfies readonly { id: string; title: string; keeper: Keeper }[];

type PageId = (typeof PAGES)[number]["id"];

/** What the list of pages says over each group of them. */
const KEEPERS: Record<Keeper, { title: string; sub?: string }> = {
	project: { title: "This project", sub: "roswaal.json" },
	browser: { title: "This browser" },
	about: { title: "About" },
};

/**
 * The pages a window offers. The editor has a project, and so has the
 * project's pages; Node Design has none to change. The docs have only what
 * changes how they read -- the theme and the docs' own -- and say where the
 * rest is.
 */
const OFFERED: Record<SettingsScope, readonly PageId[]> = {
	editor: PAGES.map((page) => page.id),
	designer: ["canvas", "nodes", "workspace", "themes", "docs", "made", "licences"],
	docs: ["themes", "docs", "made", "licences"],
};

/** Which window Settings is open in. */
export type SettingsScope = "editor" | "designer" | "docs";

export interface SettingsPanelProps {
	/**
	 * The project's root and settings. Absent where there is no project to
	 * change, and then its pages are not offered.
	 */
	root?: string;
	config?: RoswaalConfig;
	prefs: Preferences;
	/** Patches `roswaal.json`. Writes through the daemon, so it can fail. */
	onConfig?: (patch: Partial<RoswaalConfig>) => void;
	onPrefs: (patch: Partial<Preferences>) => void;
	onClose: () => void;
	/** Which page to open on. The first one offered, otherwise. */
	initialTab?: PageId;
	/** The window it is in; the editor's, unless said. */
	scope?: SettingsScope;
	/** The editor's address, for the docs' note saying the rest is there. */
	editorHref?: string;
}

/**
 * What the search box holds, and whether the page being drawn matched it by
 * name -- in which case all of it shows, rows and all.
 */
const Search = createContext<{ query: string; page: boolean }>({ query: "", page: false });

/** Whether every word typed is somewhere in the text, ignoring case. */
export function matches(query: string, ...texts: string[]): boolean {
	const text = texts.join(" ").toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => text.includes(word));
}

/** The pages a window offers, in order: its scope's, less the project's where there is none. */
export function settingsPages(scope: SettingsScope, hasProject: boolean) {
	return PAGES.filter(
		(page) => OFFERED[scope].includes(page.id) && (page.keeper !== "project" || hasProject),
	);
}

export function SettingsPanel(props: SettingsPanelProps) {
	const { config, onConfig } = props;
	const scope = props.scope ?? "editor";
	const offered = settingsPages(scope, config !== undefined);
	const [tab, setTab] = useState<PageId>(
		offered.some((page) => page.id === props.initialTab) ? props.initialTab! : offered[0].id,
	);
	const [query, setQuery] = useState("");
	const searching = query.trim() !== "";
	const panel = useRef<HTMLDivElement>(null);

	useEffect(() => {
		panel.current?.focus();
	}, []);

	const pageOf = (id: PageId) => {
		switch (id) {
			case "compiling":
				return config && onConfig ? (
					<CompilingSettings config={config} onConfig={onConfig} />
				) : null;
			case "packs":
				return config && onConfig ? <NodePackSettings config={config} onConfig={onConfig} /> : null;
			case "canvas":
				return <CanvasSettings {...props} />;
			case "nodes":
				return <NodeSettings {...props} />;
			case "workspace":
				return <WorkspaceSettings {...props} />;
			case "scene":
				return <SceneSettings {...props} />;
			case "themes":
				return <ThemeSettings {...props} />;
			case "docs":
				return <DocsSettings {...props} />;
			case "made":
				return <Made />;
			case "licences":
				return <Licences />;
		}
	};
	const keepers = (["project", "browser", "about"] as const).filter((keeper) =>
		offered.some((page) => page.keeper === keeper),
	);

	return (
		<div className="docs-backdrop" style={{ zIndex: LAYER.menu + 1 }} onPointerDown={props.onClose}>
			<div
				className="settings-sheet"
				role="dialog"
				aria-modal="true"
				aria-label="Settings"
				ref={panel}
				tabIndex={-1}
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key !== "Escape") return;
					e.preventDefault();
					// Esc clears a search first, then closes.
					if (searching) setQuery("");
					else props.onClose();
				}}
			>
				<nav className="settings-nav" aria-label="Settings pages">
					<div className="settings-brand">
						<Icon name="settings" size={17} />
						<strong>Settings</strong>
					</div>
					<label className="settings-search">
						<Icon name="search" size={14} />
						<input
							type="search"
							value={query}
							placeholder="Search settings"
							aria-label="Search settings"
							spellCheck={false}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</label>
					{keepers.map((keeper) => (
						<div key={keeper} className={cx("settings-keeper", `keeper-${keeper}`)}>
							{keeper !== "about" && (
								<div className="settings-keeper-head">
									{KEEPERS[keeper].title}
									{KEEPERS[keeper].sub && <code>{KEEPERS[keeper].sub}</code>}
								</div>
							)}
							{offered
								.filter((page) => page.keeper === keeper)
								.map((page) => (
									<button
										key={page.id}
										className={cx("settings-link", !searching && tab === page.id && "on")}
										aria-current={!searching && tab === page.id ? "page" : undefined}
										onClick={() => {
											setQuery("");
											setTab(page.id);
										}}
									>
										{page.title}
									</button>
								))}
						</div>
					))}
					{scope === "docs" && (
						<p className="settings-elsewhere">
							The Settings for your Project and Canvas Style are in Editor Mode.{" "}
							{props.editorHref && <a href={props.editorHref}>Switch to Editor Mode</a>}
						</p>
					)}
				</nav>

				<div className="settings-main">
					<button
						className="tb icon-only settings-close"
						onClick={props.onClose}
						title="Close (Esc)"
					>
						<Icon name="close" size={15} />
					</button>
					{searching ? (
						<div className="settings-results">
							{offered
								.filter((page) => page.id !== "licences")
								.map((page) => (
									<Search.Provider
										key={page.id}
										value={{ query, page: matches(query, page.title) }}
									>
										{pageOf(page.id)}
									</Search.Provider>
								))}
							<p className="settings-empty">Nothing in Settings matches “{query.trim()}”.</p>
						</div>
					) : (
						<div className="settings-current">{pageOf(tab)}</div>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * One page: its title and what it is for, then its groups. While searching,
 * one section of the results -- shown only when something in it matched.
 */
function Page({ id, note, children }: { id: PageId; note: ReactNode; children: ReactNode }) {
	const { query, page } = useContext(Search);
	const title = PAGES.find((p) => p.id === id)?.title ?? "";
	return (
		<section className={cx("settings-section", query && page && "matched")} data-page={id}>
			<header className="settings-page-head">
				<h2>{title}</h2>
				<p className="settings-note">{note}</p>
			</header>
			{children}
		</section>
	);
}

/** Rows that belong together, under a small heading, in one box. */
function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="settings-group">
			<h3>{title}</h3>
			<div className="settings-box">{children}</div>
		</div>
	);
}

/** What the project's pages say they write to. */
const PROJECT_NOTE = (
	<>
		Saved in <code>roswaal.json</code> and committed, so everyone on the project shares them.
	</>
);

function CompilingSettings({
	config,
	onConfig,
}: {
	config: RoswaalConfig;
	onConfig: (patch: Partial<RoswaalConfig>) => void;
}) {
	return (
		<Page id="compiling" note={PROJECT_NOTE}>
			<Group title="Files">
				<Row label="Target" help="The Luau new graphs compile for. Lune is experimental.">
					<select
						className="tb"
						value={config.target}
						onChange={(e) => onConfig({ target: e.target.value as Target })}
					>
						<option value="roblox">Roblox</option>
						<option value="lune">Lune (experimental)</option>
					</select>
				</Row>

				<Row
					label="Graphs live in"
					help="Where graphs and node maps are read from, in the project."
				>
					<TextSetting value={config.sourceDir} onCommit={(v) => onConfig({ sourceDir: v })} />
				</Row>

				<Row
					label="Compiled Luau goes to"
					help="Where generated .luau is written: the folder Rojo syncs."
				>
					<TextSetting value={config.outDir} onCommit={(v) => onConfig({ outDir: v })} />
				</Row>
			</Group>

			<Group title="Compiling">
				<Row label="Compile" help="Dynamic compiles on every edit. Manual waits for you.">
					<div className="segmented">
						<button
							className={config.compileMode === "manual" ? "on" : ""}
							onClick={() => onConfig({ compileMode: "manual" })}
						>
							Manual
						</button>
						<button
							className={config.compileMode === "hot" ? "on" : ""}
							onClick={() => onConfig({ compileMode: "hot" })}
						>
							Dynamic
						</button>
					</div>
				</Row>

				<Row
					label="Format generated files"
					help="Runs stylua when it is installed. Without it, files are left as written."
				>
					<Toggle
						on={config.format}
						onChange={(on) => onConfig({ format: on })}
						label={config.format ? "With stylua, when available" : "Leave as emitted"}
					/>
				</Row>

				<Row
					label="Comment headers"
					help="Writes each comment's header into the Luau, above its nodes."
				>
					<Toggle
						on={config.comments}
						onChange={(on) => onConfig({ comments: on })}
						label={config.comments ? "Written into the file" : "Kept on the canvas"}
					/>
				</Row>

				<Row
					label="Casts proved by a subclass"
					help="Skips a cast an Is A already proved, like Is A Part for BasePart."
				>
					<Toggle
						on={config.castsByHierarchy === true}
						onChange={(on) => onConfig({ castsByHierarchy: on })}
						label={config.castsByHierarchy ? "Left out" : "Written"}
					/>
				</Row>
			</Group>

			<Group title="Indentation">
				<Row
					label="Indent with"
					help="One level of indentation in the Luau. stylua follows it too."
				>
					<div className="segmented">
						<button
							className={config.indentStyle !== "space" ? "on" : ""}
							onClick={() => onConfig({ indentStyle: "tab" })}
						>
							Tab
						</button>
						<button
							className={config.indentStyle === "space" ? "on" : ""}
							onClick={() => onConfig({ indentStyle: "space" })}
						>
							Spaces
						</button>
					</div>
				</Row>

				{config.indentStyle === "space" && (
					<Row label="Spaces per level" help="How wide one level is.">
						<select
							className="tb"
							value={String(config.indentWidth)}
							onChange={(e) => onConfig({ indentWidth: Number(e.target.value) })}
						>
							{INDENT_WIDTHS.map((width) => (
								<option key={width} value={width}>
									{width}
								</option>
							))}
						</select>
					</Row>
				)}
			</Group>

			<ExportingSettings config={config} onConfig={onConfig} />
		</Page>
	);
}

/**
 * What the Export menu starts with: the same choices it keeps when "Start
 * with these choices for this project" is ticked, so they are not only in the
 * menu.
 */
function ExportingSettings({
	config,
	onConfig,
}: {
	config: RoswaalConfig;
	onConfig: (patch: Partial<RoswaalConfig>) => void;
}) {
	const kept = config.export ?? {};
	const set = (patch: Partial<NonNullable<RoswaalConfig["export"]>>) => {
		const next: Record<string, unknown> = { ...kept, ...patch };
		for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
		onConfig({ export: next });
	};
	const pick = <T,>(
		value: T,
		current: T,
		label: string,
		patch: Partial<NonNullable<RoswaalConfig["export"]>>,
	) => (
		<button className={current === value ? "on" : ""} onClick={() => set(patch)}>
			{label}
		</button>
	);
	return (
		<Group title="Exporting">
			<Row
				label="Export"
				help="What the Export menu starts with: the project as a zip, or its place alone."
			>
				<div className="segmented">
					{pick("zip", kept.shape ?? "zip", "Project (.zip)", { shape: "zip" })}
					{pick("place", kept.shape ?? "zip", "Place only", { shape: "place" })}
				</div>
			</Row>
			<Row label="Before exporting" help="Compile the graphs whose Luau is out of date first.">
				<div className="segmented">
					{pick(true, kept.compileFirst ?? true, "Compile first", { compileFirst: true })}
					{pick(false, kept.compileFirst ?? true, "Export as it is", { compileFirst: false })}
				</div>
			</Row>
			<Row
				label="Scripts"
				help="Write the project's scripts into the exported place, or leave it as it was."
			>
				<div className="segmented">
					{pick(true, kept.modify ?? true, "Modify RBXL", { modify: true })}
					{pick(false, kept.modify ?? true, "Don't Modify RBXL", { modify: false })}
				</div>
			</Row>
			<Row
				label="Save the place as"
				help="Legacy .rbxlx leaves out the kinds of property Roswaal cannot write yet; the menu names them."
			>
				<div className="segmented">
					{pick(undefined, kept.format, "As it is", { format: undefined })}
					{pick("rbxl", kept.format, ".rbxl", { format: "rbxl" })}
					{pick("rbxlx", kept.format, "Legacy .rbxlx", { format: "rbxlx" })}
				</div>
			</Row>
		</Group>
	);
}

function NodePackSettings({
	config,
	onConfig,
}: {
	config: RoswaalConfig;
	onConfig: (patch: Partial<RoswaalConfig>) => void;
}) {
	return (
		<Page
			id="packs"
			note="Folders scanned for .nodedef.json. Their nodes join the palette and the docs."
		>
			<Group title="Scanned directories">
				<Row
					label="Pack directories"
					help="From the project root. Removing one leaves the pack untouched."
				>
					<PathList paths={config.nodePaths} onChange={(nodePaths) => onConfig({ nodePaths })} />
				</Row>
			</Group>
		</Page>
	);
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function CanvasSettings({ prefs, onPrefs }: SettingsPanelProps) {
	return (
		<Page id="canvas" note="How graphs look and move. Kept in this browser.">
			<Group title="The grid">
				<Row
					label="Grid"
					help={GRID_PATTERNS.find((g) => g.value === prefs.gridPattern)?.what ?? ""}
				>
					<div className="segmented">
						{GRID_PATTERNS.map((g) => (
							<button
								key={g.value}
								className={prefs.gridPattern === g.value ? "on" : ""}
								title={g.what}
								onClick={() => onPrefs({ gridPattern: g.value })}
							>
								{g.label}
							</button>
						))}
					</div>
				</Row>

				<Row
					label="Grid contrast"
					help={GRID_CONTRASTS.find((g) => g.value === prefs.gridContrast)?.what ?? ""}
				>
					<div className="segmented">
						{GRID_CONTRASTS.map((g) => (
							<button
								key={g.value}
								className={prefs.gridContrast === g.value ? "on" : ""}
								title={g.what}
								onClick={() => onPrefs({ gridContrast: g.value })}
							>
								{g.label}
							</button>
						))}
					</div>
				</Row>
			</Group>

			<Group title="Wires and nodes">
				<Row label="Wires" help={WIRE_STYLES.find((w) => w.style === prefs.wireStyle)?.what ?? ""}>
					<div className="segmented">
						{WIRE_STYLES.map((w) => (
							<button
								key={w.style}
								className={prefs.wireStyle === w.style ? "on" : ""}
								title={w.what}
								onClick={() => onPrefs({ wireStyle: w.style })}
							>
								{w.label}
							</button>
						))}
					</div>
				</Row>

				<Row label="Node corners" help="Getters and reroute knots keep their shapes either way.">
					<div className="segmented">
						<button
							className={prefs.roundedNodes ? "on" : ""}
							onClick={() => onPrefs({ roundedNodes: true })}
						>
							Rounded
						</button>
						<button
							className={!prefs.roundedNodes ? "on" : ""}
							onClick={() => onPrefs({ roundedNodes: false })}
						>
							Square
						</button>
					</div>
				</Row>
			</Group>

			<Group title="Moving around">
				<Row
					label="Scrolling the graph"
					help={WHEEL_CHOICES.find((c) => c.value === prefs.wheel)?.what ?? ""}
				>
					<div className="segmented">
						{WHEEL_CHOICES.map((c) => (
							<button
								key={c.value}
								className={prefs.wheel === c.value ? "on" : ""}
								title={c.what}
								onClick={() => onPrefs({ wheel: c.value })}
							>
								{c.label}
							</button>
						))}
					</div>
				</Row>
			</Group>
		</Page>
	);
}

function NodeSettings({ prefs, onPrefs }: SettingsPanelProps) {
	return (
		<Page id="nodes" note="How nodes look, and what a new one starts as. Kept in this browser.">
			<Group title="Names">
				<Row
					label="Long names"
					help="Cut short with the full name on hover, or widen the node to fit."
				>
					<div className="segmented">
						<button
							className={!prefs.wideNodes ? "on" : ""}
							onClick={() => onPrefs({ wideNodes: false })}
						>
							Truncate
						</button>
						<button
							className={prefs.wideNodes ? "on" : ""}
							onClick={() => onPrefs({ wideNodes: true })}
						>
							Widen
						</button>
					</div>
				</Row>
			</Group>

			<Group title="New nodes">
				<Row
					label="New logic nodes"
					help="What a new And, Or, Not or comparison starts as. Each node keeps its own."
				>
					<div className="segmented">
						<button
							className={!prefs.logicParens ? "on" : ""}
							onClick={() => onPrefs({ logicParens: false })}
						>
							Bare
						</button>
						<button
							className={prefs.logicParens ? "on" : ""}
							onClick={() => onPrefs({ logicParens: true })}
						>
							Bracketed
						</button>
					</div>
				</Row>

				<Row
					label="New cast nodes"
					help="Whether a new Cast shows :: or its name. Each node keeps its own."
				>
					<div className="segmented">
						<button
							className={!prefs.castNames ? "on" : ""}
							onClick={() => onPrefs({ castNames: false })}
						>
							Symbol
						</button>
						<button
							className={prefs.castNames ? "on" : ""}
							onClick={() => onPrefs({ castNames: true })}
						>
							Name
						</button>
					</div>
				</Row>

				<Row
					label="New concatenate nodes"
					help="Whether a new Concatenate uses .. or an interpolated string. Each node keeps its own."
				>
					<div className="segmented">
						<button
							className={!prefs.concatInterpolate ? "on" : ""}
							onClick={() => onPrefs({ concatInterpolate: false })}
						>
							Join
						</button>
						<button
							className={prefs.concatInterpolate ? "on" : ""}
							onClick={() => onPrefs({ concatInterpolate: true })}
						>
							Interpolate
						</button>
					</div>
				</Row>
			</Group>
		</Page>
	);
}

function WorkspaceSettings({ prefs, onPrefs }: SettingsPanelProps) {
	return (
		<Page id="workspace" note="Saving, panels, and what opens first. Kept in this browser.">
			<Group title="Saving">
				<Row label="Write a graph" help="How soon after an edit the graph is saved. It always is.">
					<select
						className="tb"
						value={prefs.autosaveMs}
						onChange={(e) => onPrefs({ autosaveMs: Number(e.target.value) })}
					>
						{AUTOSAVE_CHOICES.map((c) => (
							<option key={c.ms} value={c.ms}>
								{c.label}
							</option>
						))}
					</select>
				</Row>
			</Group>

			<Group title="Panels and tabs">
				<Row
					label="Variables"
					help="Docked beside the graph, or in a window you can move and resize."
				>
					<div className="segmented">
						<button
							className={!prefs.layout.panels.variables.floating ? "on" : ""}
							onClick={() =>
								onPrefs({
									layout: floatPanel(prefs.layout, "variables", false),
								})
							}
						>
							Docked
						</button>
						<button
							className={prefs.layout.panels.variables.floating ? "on" : ""}
							onClick={() =>
								onPrefs({
									layout: floatPanel(prefs.layout, "variables", true),
								})
							}
						>
							Window
						</button>
					</div>
				</Row>

				<Row
					label="Shorten function tabs"
					help="Tabs read ƒ hide (Occupancy). The tooltip keeps both names."
				>
					<div className="segmented">
						{FUNCTION_TAB_CHOICES.map((choice) => (
							<button
								key={choice.value}
								className={prefs.functionTabs === choice.value ? "on" : ""}
								title={choice.what}
								onClick={() => onPrefs({ functionTabs: choice.value })}
							>
								{choice.label}
							</button>
						))}
					</div>
				</Row>
			</Group>

			<Group title="On a phone or a tablet">
				<Row
					label="Action buttons"
					help={ACTION_LABEL_CHOICES.find((c) => c.value === prefs.actionLabels)?.what ?? ""}
				>
					<div className="segmented">
						{ACTION_LABEL_CHOICES.map((c) => (
							<button
								key={c.value}
								className={prefs.actionLabels === c.value ? "on" : ""}
								onClick={() => onPrefs({ actionLabels: c.value })}
							>
								{c.label}
							</button>
						))}
					</div>
				</Row>

				<Row
					label="Action row"
					help={ACTION_ROW_CHOICES.find((c) => c.value === prefs.actionRow)?.what ?? ""}
				>
					<div className="segmented">
						{ACTION_ROW_CHOICES.map((c) => (
							<button
								key={c.value}
								className={prefs.actionRow === c.value ? "on" : ""}
								onClick={() => onPrefs({ actionRow: c.value })}
							>
								{c.label}
							</button>
						))}
					</div>
				</Row>
			</Group>

			<Group title="Classes">
				<Row
					label="Class icons"
					help={CLASS_ICON_STYLES.find((c) => c.value === prefs.classIcons)?.what ?? ""}
				>
					<div className="segmented">
						{CLASS_ICON_STYLES.map((c) => (
							<button
								key={c.value}
								className={prefs.classIcons === c.value ? "on" : ""}
								onClick={() => onPrefs({ classIcons: c.value })}
							>
								{c.label}
							</button>
						))}
					</div>
				</Row>

				<Row
					label="Group classes"
					help={CLASS_GROUPS.find((c) => c.value === prefs.classGroups)?.what ?? ""}
				>
					<div className="segmented">
						{CLASS_GROUPS.map((c) => (
							<button
								key={c.value}
								className={prefs.classGroups === c.value ? "on" : ""}
								onClick={() => onPrefs({ classGroups: c.value })}
							>
								{c.label}
							</button>
						))}
					</div>
				</Row>
			</Group>

			<Group title="DataModel">
				<Row
					label="Modify DataModel Instances"
					help="Change values in Properties, and add, move and delete instances in DataModel. Each change is written into the place file, after a backup."
				>
					<Toggle
						on={prefs.modifyDataModel}
						onChange={(on) => onPrefs({ modifyDataModel: on })}
						label={prefs.modifyDataModel ? "Properties can be changed" : "Properties are read-only"}
					/>
				</Row>
			</Group>

			<Group title="Starting">
				<Row label="On opening Roswaal" help="Which project this tab starts on.">
					<Toggle
						on={prefs.reopenLastProject}
						onChange={(on) => onPrefs({ reopenLastProject: on })}
						label={
							prefs.reopenLastProject ? "Reopen the last project" : "Start at the project picker"
						}
					/>
				</Row>
			</Group>
		</Page>
	);
}

function SceneSettings({ prefs, onPrefs }: SettingsPanelProps) {
	return (
		<Page id="scene" note="How a place is drawn in 3D. Kept in this browser.">
			<Group title="Renderer">
				<Row
					label="Renderer"
					help="Automatic draws with WebGPU where the browser has it, and WebGL2 where it does not. WebGPU falls back to WebGL2 where there is none."
				>
					<div className="segmented">
						{VIEWPORT_RENDERERS.map(([value, label]) => (
							<button
								key={value}
								className={prefs.viewportRenderer === value ? "on" : ""}
								onClick={() => onPrefs({ viewportRenderer: value })}
							>
								{label}
							</button>
						))}
					</div>
				</Row>

				<Row
					label="Frame rate"
					help="The most the view is drawn a second while it moves. VSync matches the display; Unlimited draws as fast as it can. The view is drawn only when something changes."
				>
					<select
						className="tb"
						value={prefs.viewportFrameRate}
						onChange={(e) => onPrefs({ viewportFrameRate: e.target.value as ViewportFrameRate })}
					>
						{VIEWPORT_FRAME_RATES.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</Row>
			</Group>

			<Group title="Selection">
				<Row label="Selection outline" help="How wide the outline round what is picked is drawn.">
					<div className="segmented">
						{(Object.keys(OUTLINE_WIDTHS) as OutlineWidth[]).map((width) => (
							<button
								key={width}
								className={prefs.outlineWidth === width ? "on" : ""}
								onClick={() => onPrefs({ outlineWidth: width })}
							>
								{width[0].toUpperCase() + width.slice(1)}
							</button>
						))}
					</div>
				</Row>
				<Row
					label="Hidden edges"
					help="Whether the outline shows through the parts in front of it, as Studio's does."
				>
					<Toggle
						on={prefs.outlineThrough}
						onChange={(on) => onPrefs({ outlineThrough: on })}
						label={prefs.outlineThrough ? "Shown through parts" : "Hidden by parts in front"}
					/>
				</Row>
			</Group>

			<Group title="Transparency">
				<Row
					label="Glass"
					help="Whether see-through Glass hides the see-through parts behind it, as Studio's does. Places are often built around it."
				>
					<Toggle
						on={prefs.glassHides}
						onChange={(on) => onPrefs({ glassHides: on })}
						label={prefs.glassHides ? "Hides see-through parts behind it" : "Shows them through it"}
					/>
				</Row>
			</Group>
		</Page>
	);
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

function DocsSettings({ prefs, onPrefs }: SettingsPanelProps) {
	const percent = Math.round(prefs.docsPreviewScale * 100);
	return (
		<Page id="docs" note="How the docs read. Kept in this browser.">
			<Group title="Reading">
				<Row label="Font" help={DOCS_FONTS.find((f) => f.font === prefs.docsFont)?.what ?? ""}>
					<div className="segmented">
						{DOCS_FONTS.map((f) => (
							<button
								key={f.font}
								className={prefs.docsFont === f.font ? "on" : ""}
								title={f.what}
								onClick={() => onPrefs({ docsFont: f.font })}
							>
								{f.label}
							</button>
						))}
					</div>
				</Row>

				<Row
					label="Preview size"
					help="How large pictures are drawn. Drag a big one to look around."
				>
					<div className="settings-range">
						<input
							type="range"
							aria-label="Preview size"
							min={PREVIEW_SCALE.min * 100}
							max={PREVIEW_SCALE.max * 100}
							step={PREVIEW_SCALE.step * 100}
							value={percent}
							onChange={(e) =>
								onPrefs({ docsPreviewScale: previewScaleOf(Number(e.target.value) / 100) })
							}
						/>
						<span className="value">{percent}%</span>
					</div>
				</Row>
			</Group>
		</Page>
	);
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

/** How long the empty place in the grid is held before what is behind it shows. */
const HOLD_TO_FIND_MS = 1200;

function ThemeSettings({ prefs, onPrefs }: SettingsPanelProps) {
	const schemes = useMemo(
		() =>
			BUILTIN_THEMES.filter((t) => !t.hidden || prefs.foundThemes.includes(t.name)).sort(
				(a, b) => a.order - b.order || a.name.localeCompare(b.name),
			),
		[prefs.foundThemes],
	);
	const chosen = schemes.find((t) => t.name === prefs.theme);
	// A scheme kept as a surprise, still to be found: the grid's next place is
	// left empty for it, and holding that place, or Shift + Alt + F1 while
	// this page is open, finds it.
	const unfound = BUILTIN_THEMES.find((t) => t.hidden && !prefs.foundThemes.includes(t.name));
	const [holding, setHolding] = useState(false);
	const [found, setFound] = useState<string | null>(null);
	const hold = useRef<number | null>(null);
	const find = useCallback(() => {
		if (!unfound) return;
		onPrefs({ foundThemes: [...prefs.foundThemes, unfound.name] });
		setFound(unfound.name);
		setHolding(false);
	}, [unfound, prefs.foundThemes, onPrefs]);
	const letGo = useCallback(() => {
		if (hold.current !== null) window.clearTimeout(hold.current);
		hold.current = null;
		setHolding(false);
	}, []);
	useEffect(() => {
		if (!unfound) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "F1" || !e.shiftKey || !e.altKey) return;
			// F1 is the browser's help otherwise.
			e.preventDefault();
			find();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [unfound, find]);
	useEffect(() => letGo, [letGo]);

	return (
		<Page
			id="themes"
			note={
				<>
					One JSON file each, in <code>themes/</code>.
				</>
			}
		>
			<div className="theme-grid">
				<button
					className={cx("theme-card", prefs.theme === null && "on")}
					onClick={() => onPrefs({ theme: null })}
				>
					<SystemSwatch />
					<span className="theme-name">Follow the system</span>
					<span className="theme-credit">Light or dark, whichever your OS is set to</span>
				</button>

				{schemes.map((theme) => (
					<button
						key={theme.name}
						className={cx("theme-card", prefs.theme === theme.name && "on")}
						onClick={() => onPrefs({ theme: theme.name })}
					>
						<ThemeSwatch theme={theme} />
						<span className="theme-name">{theme.name}</span>
						<span className="theme-credit">{theme.credit ?? " "}</span>
					</button>
				))}
				{unfound && (
					<div
						className={cx("theme-slot", holding && "holding")}
						aria-hidden
						onPointerDown={(e) => {
							if (e.button !== 0) return;
							setHolding(true);
							hold.current = window.setTimeout(find, HOLD_TO_FIND_MS);
						}}
						onPointerUp={letGo}
						onPointerLeave={letGo}
						onPointerCancel={letGo}
						onContextMenu={(e) => e.preventDefault()}
					>
						{holding && <DiskGlyph />}
					</div>
				)}
			</div>

			{found && (
				<div className="theme-found" role="status">
					<div className="theme-found-title">{found}</div>
					<p>A theme was in the empty place all along.</p>
					<div className="theme-found-actions">
						<button
							className="on"
							onClick={() => {
								onPrefs({ theme: found });
								setFound(null);
							}}
						>
							Use it
						</button>
						<button onClick={() => setFound(null)}>Not now</button>
					</div>
				</div>
			)}

			{chosen?.source && (
				<p className="settings-note">
					<strong>{chosen.name}</strong> comes from{" "}
					<a href={chosen.source} target="_blank" rel="noreferrer">
						{chosen.source.replace(/^https:\/\//, "")}
					</a>
					{chosen.licence
						? ` and is ${chosen.licence.spdx}. Its licence is under Licences, in full.`
						: "."}
				</p>
			)}

			<h3>What a theme sets</h3>
			<p className="settings-note">
				Every scheme names all of these. There is no inheritance, so a palette cannot half-apply by
				quietly borrowing another one's colours.
			</p>
			<RoleTable theme={chosen ?? schemes[0]} />

			<h3>What it does not</h3>
			<p className="settings-note">
				Node category colours and pin type colours are fixed and no theme changes them. Red is a
				boolean, green is a number, gold is a vector — that mapping is most of what makes a Roswaal
				graph readable at a glance, and a scheme that moved it would be trading the one thing the
				colours are for against a matter of taste.
			</p>
			<p className="settings-note">
				Grid, hover and shadow are not authored either. They are overlays, computed from whether the
				scheme is dark, so a palette cannot ship a hover state that is invisible on its own
				background.
			</p>
		</Page>
	);
}

/**
 * A miniature of the thing being themed.
 *
 * A row of swatches tells you the colours; it does not tell you what the editor
 * will look like, which is the actual question. So this draws the smallest
 * honest version of the canvas — ground, one node, both kinds of wire — using
 * the scheme's own values directly rather than through the custom properties,
 * which is what lets seven of them sit on one page at once.
 *
 * The node header is a category colour from `palette.ts` and deliberately does
 * not vary between cards: it is showing the reader the part a theme leaves
 * alone.
 */
function ThemeSwatch({ theme }: { theme: Theme }) {
	const c = theme.colors;
	const header = nodeColor({ category: "Roblox" });
	return (
		<svg className="theme-swatch" viewBox="0 0 160 78" role="img" aria-hidden>
			<rect x="0" y="0" width="160" height="78" fill={c.canvas} />
			<rect x="0" y="0" width="160" height="14" fill={c.panel} />
			<rect x="0" y="13.5" width="160" height="0.5" fill={c.border} />
			<circle cx="8" cy="7" r="3" fill={c.accent} />
			<rect x="16" y="5" width="26" height="4" rx="2" fill={c.subText} />
			<rect x="46" y="5" width="16" height="4" rx="2" fill={c.dimText} />

			{/* An execution wire into the node, and a data wire out of it. */}
			<path d="M4 40 C 22 40, 24 34, 38 34" stroke={c.wireExec} strokeWidth="2" fill="none" />
			<path
				d="M110 46 C 126 46, 128 56, 150 56"
				stroke={pinColor("number", "data")}
				strokeWidth="1.5"
				fill="none"
			/>

			<g>
				<rect x="38" y="24" width="72" height="34" rx="4" fill={c.nodeBody} stroke={c.nodeBorder} />
				<path d="M38 28 a4 4 0 0 1 4 -4 h64 a4 4 0 0 1 4 4 v6 h-72 z" fill={header} />
				<rect x="44" y="27" width="30" height="4" rx="2" fill="#ffffff" opacity="0.8" />
				<rect x="44" y="40" width="22" height="3" rx="1.5" fill={c.subText} />
				<rect x="44" y="48" width="16" height="3" rx="1.5" fill={c.dimText} />
				<circle cx="110" cy="46" r="3" fill={pinColor("Instance", "data")} />
			</g>

			<rect x="0" y="64" width="160" height="14" fill={c.app} />
			<rect x="6" y="69" width="40" height="4" rx="2" fill={c.text} />
			<rect x="50" y="69" width="14" height="4" rx="2" fill={c.ok} />
			<rect x="68" y="69" width="14" height="4" rx="2" fill={c.danger} />
		</svg>
	);
}

/** A disk going in, drawn while the empty place is held. */
function DiskGlyph() {
	return (
		<svg className="theme-slot-disk" viewBox="0 0 32 32" aria-hidden>
			<rect x="4" y="3" width="24" height="26" fill="#ffffff" stroke="#000022" strokeWidth="1.5" />
			<rect x="9" y="3" width="14" height="9" fill="#000022" />
			<rect x="17" y="5" width="3" height="5" fill="#ffffff" />
			<rect x="8" y="16" width="16" height="10" fill="#ff8800" />
		</svg>
	);
}

/** The one card that cannot draw a palette, because it has two. */
function SystemSwatch() {
	const light = BUILTIN_THEMES.find((t) => !t.dark) ?? BUILTIN_THEMES[0];
	const dark = BUILTIN_THEMES.find((t) => t.dark) ?? BUILTIN_THEMES[0];
	return (
		<span className="theme-swatch-pair">
			<span className="half">
				<ThemeSwatch theme={light} />
			</span>
			<span className="half right">
				<ThemeSwatch theme={dark} />
			</span>
		</span>
	);
}

function RoleTable({ theme }: { theme: Theme }) {
	return (
		<div className="role-table">
			{ROLES.map((r) => (
				<div className="role" key={r.role}>
					<span className="chip" style={{ background: theme.colors[r.role] }} />
					<code>{r.role}</code>
					<span>{r.what}</span>
				</div>
			))}
			{CODE_ROLES.map((r) => (
				<div className="role" key={`code-${r.role}`}>
					<span className="chip" style={{ background: theme.code[r.role] }} />
					<code>code.{r.role}</code>
					<span>{r.what}</span>
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------

/**
 * Everything of other people's that Roswaal carries, each licence in full.
 *
 * The licences kept by hand are compiled in (`src/core/licenceData.ts`); the
 * packages a build bundles are in the notices file beside that build, which
 * `BundledNotices` reads, so this page shows what this copy really carries.
 * One open at a time: a licence is read one at a time, and the page stays a
 * list to find yours in. The same list as the notices file and the docs, the
 * Luau logo's included: its row says what the logo is for.
 */
function Licences() {
	const { query, page } = useContext(Search);
	const [open, setOpen] = useState<string | null>(null);
	const shown = (...texts: string[]) => !query || page || matches(query, ...texts);
	const toggle = (key: string) => setOpen((was) => (was === key ? null : key));

	const row = (key: string, name: string, spdx: string, holder: string, body: ReactNode) => (
		<div className="setting licence-row" key={key}>
			<button
				type="button"
				className="licence-head"
				aria-expanded={open === key}
				onClick={() => toggle(key)}
			>
				<Icon name="chevron" size={14} rotate={open === key ? 0 : -90} />
				<span className="licence-name">{name}</span>
				<span className="spdx">{spdx}</span>
				<span className="licence-holder">{holder}</span>
			</button>
			{open === key && body}
		</div>
	);

	return (
		<Page
			id="licences"
			note="Roswaal is 0BSD. What it carries of other people's, with each licence exactly as it was published."
		>
			<Group title="Kept with Roswaal">
				{CARRIED_LICENCES.filter((licence) =>
					shown(licence.name, licence.holder, licence.spdx, licence.covers),
				).map((licence) =>
					row(
						licence.file,
						licence.name,
						licence.spdx,
						licence.holder,
						<LicenceDetail licence={licence} />,
					),
				)}
			</Group>
			<Group title="Bundled packages">
				{shown("packages", "notices", "React", "CodeMirror", "MIT", "ISC", "BSD") &&
					row(
						"notices",
						"Third-party notices",
						"MIT · ISC · BSD",
						"Every package in this build",
						<BundledNotices />,
					)}
			</Group>
			<p className="settings-note">
				The schemes credited to <strong>neopolitans</strong> are the maintainer's own and carry no
				third-party claim. Who made what, and how Roswaal uses it, is on the Attributions page in
				the docs, and in <code>ATTRIBUTIONS.md</code>.
			</p>
		</Page>
	);
}

/**
 * How Roswaal is made: a disclosure, not an attribution. Nothing of
 * Anthropic's is in Roswaal and no licence asks for this; it is said because
 * a reader is owed it. The same two sentences are under the attributions list
 * in the docs and in the README.
 */
function Made() {
	return (
		<Page id="made" note="Who makes Roswaal, and with what.">
			<Group title="How Roswaal is made">
				<div className="setting made-note">
					<p>
						Roswaal is designed and directed by its maintainer, and much of its code is written with
						Claude, Anthropic's AI model. The commits Claude helped write credit it as a co-author.
					</p>
					<p>
						Nothing of Anthropic's is in Roswaal, and Roswaal is not affiliated with or endorsed by
						Anthropic.
					</p>
				</div>
			</Group>
		</Page>
	);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Row({
	label,
	help,
	children,
}: {
	label: string;
	help: string;
	children: React.ReactNode;
}) {
	const { query, page } = useContext(Search);
	if (query && !page && !matches(query, label, help)) return null;
	return (
		<div className="setting">
			<div className="setting-label">
				<strong>{label}</strong>
				<span>{help}</span>
			</div>
			<div className="setting-control">{children}</div>
		</div>
	);
}

/**
 * A text setting that commits on blur or Enter, not per keystroke.
 *
 * Every one of these writes `roswaal.json` through the daemon, and typing
 * `src` into the output directory would otherwise write the file three times —
 * once for `s`, once for `sr`, once for the answer — with a recompile behind
 * each. Escape puts the field back rather than leaving a half-typed path
 * looking like it was accepted.
 */
function TextSetting({
	value,
	placeholder,
	onCommit,
}: {
	value: string;
	placeholder?: string;
	onCommit: (value: string) => void;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);

	const commit = () => {
		const next = draft.trim();
		if (next !== value) onCommit(next);
		else setDraft(value);
	};

	return (
		<input
			className="tb"
			value={draft}
			placeholder={placeholder}
			spellCheck={false}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					e.currentTarget.blur();
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setDraft(value);
					e.currentTarget.blur();
				}
			}}
		/>
	);
}

function Toggle({
	on,
	label,
	onChange,
}: {
	on: boolean;
	label: string;
	onChange: (on: boolean) => void;
}) {
	return (
		<label className="settings-toggle">
			<input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
			<span>{label}</span>
		</label>
	);
}

/** The node-path list: rows of directories, with the last row adding one. */
function PathList({ paths, onChange }: { paths: string[]; onChange: (paths: string[]) => void }) {
	const [adding, setAdding] = useState("");

	return (
		<div className="path-list">
			{paths.map((p, i) => (
				<div className="path-row" key={`${p}-${i}`}>
					<TextSetting
						value={p}
						onCommit={(v) => {
							const next = [...paths];
							if (v === "") next.splice(i, 1);
							else next[i] = v;
							onChange(next);
						}}
					/>
					<button
						className="tb"
						title="Stop scanning this directory. The pack itself is not touched."
						onClick={() => onChange(paths.filter((_, j) => j !== i))}
					>
						<Icon name="close" size={14} />
					</button>
				</div>
			))}
			<div className="path-row">
				<input
					className="tb"
					value={adding}
					placeholder="Add a directory…"
					spellCheck={false}
					onChange={(e) => setAdding(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						e.preventDefault();
						const v = adding.trim();
						if (v === "" || paths.includes(v)) return;
						onChange([...paths, v]);
						setAdding("");
					}}
				/>
				<button
					className="tb"
					disabled={adding.trim() === "" || paths.includes(adding.trim())}
					onClick={() => {
						onChange([...paths, adding.trim()]);
						setAdding("");
					}}
				>
					Add
				</button>
			</div>
		</div>
	);
}
