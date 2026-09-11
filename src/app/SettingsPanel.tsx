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

import { useEffect, useMemo, useRef, useState } from "react";

import type { RoswaalConfig, Target } from "../core/schema.js";
import {
	CODE_ROLES, ROLES, themeSlug, type Theme,
} from "../core/theme.js";
import { LICENCE_TEXTS } from "../core/themeData.js";
import { BUILTIN_THEMES } from "./theme.js";
import {
	AUTOSAVE_CHOICES, DOCS_FONTS, PREVIEW_SCALE, previewScaleOf, WIRE_STYLES, type Preferences,
} from "./preferences.js";
import { Icon } from "./icons.jsx";
import { LAYER } from "./layers.js";
import { nodeColor, pinColor } from "./palette.js";

const TABS = [
	{ id: "project", title: "Project", sub: "roswaal.json" },
	{ id: "editor", title: "Editor", sub: "This browser" },
	{ id: "themes", title: "Themes", sub: "This browser" },
	{ id: "docs", title: "Docs", sub: "This browser" },
	{ id: "licences", title: "Licences", sub: "What themes carry" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export interface SettingsPanelProps {
	/**
	 * The project's root and settings. Absent where there is no project to
	 * change — the Docs window — and then the Project tab is not offered.
	 */
	root?: string;
	config?: RoswaalConfig;
	prefs: Preferences;
	/** Patches `roswaal.json`. Writes through the daemon, so it can fail. */
	onConfig?: (patch: Partial<RoswaalConfig>) => void;
	onPrefs: (patch: Partial<Preferences>) => void;
	onClose: () => void;
	/** Which tab to open on. The first one offered, otherwise. */
	initialTab?: TabId;
}

export function SettingsPanel(props: SettingsPanelProps) {
	const { config, onConfig } = props;
	const tabs = TABS.filter((t) => t.id !== "project" || config !== undefined);
	const [tab, setTab] = useState<TabId>(props.initialTab ?? tabs[0].id);
	const panel = useRef<HTMLDivElement>(null);

	useEffect(() => {
		panel.current?.focus();
	}, []);

	return (
		<div
			className="docs-backdrop"
			style={{ zIndex: LAYER.menu + 1 }}
			onPointerDown={props.onClose}
		>
			<div
				className="docs settings"
				ref={panel}
				tabIndex={-1}
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						props.onClose();
					}
				}}
			>
				<div className="docs-head">
					<Icon name="settings" size={16} />
					<strong>Settings</strong>
					<span className="sub">{props.root ?? "Preferences for this browser"}</span>
					<span className="spacer" />
					<button className="tb" onClick={props.onClose} title="Close (Esc)">
						<Icon name="close" size={15} />
					</button>
				</div>

				<div className="docs-body">
					<nav className="docs-nav">
						{tabs.map((t) => (
							<button
								key={t.id}
								className={`docs-link settings-tab${tab === t.id ? " on" : ""}`}
								onClick={() => setTab(t.id)}
							>
								<span>{t.title}</span>
								<span className="settings-tab-sub">{t.sub}</span>
							</button>
						))}
					</nav>

					<div className="settings-page">
						{tab === "project" && config && onConfig && (
							<ProjectSettings config={config} onConfig={onConfig} />
						)}
						{tab === "editor" && <EditorSettings {...props} />}
						{tab === "themes" && <ThemeSettings {...props} />}
						{tab === "docs" && <DocsSettings {...props} />}
						{tab === "licences" && <Licences />}
					</div>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

function ProjectSettings({ config, onConfig }: {
	config: RoswaalConfig;
	onConfig: (patch: Partial<RoswaalConfig>) => void;
}) {
	return (
		<>
			<h2>Project</h2>
			<p className="settings-note">
				Written to <code>roswaal.json</code> in the project root. This file is
				committed, so everyone working on this repository gets these.
			</p>

			<Row
				label="Target"
				help="Which flavour of Luau new graphs compile for. Lune is experimental and drops the Roblox nodes."
			>
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
				help="Where .nodescript and .nodemap files are read from, relative to the project root."
			>
				<TextSetting value={config.sourceDir} onCommit={(v) => onConfig({ sourceDir: v })} />
			</Row>

			<Row
				label="Compiled Luau goes to"
				help="Where generated .luau is written. This is the directory Rojo syncs."
			>
				<TextSetting value={config.outDir} onCommit={(v) => onConfig({ outDir: v })} />
			</Row>

			<Row
				label="Rojo project file"
				help="Left for Rojo. Where a file lands in the DataModel comes from your node maps, and nothing is written to this file."
			>
				<TextSetting
					value={config.rojoProject ?? ""}
					placeholder="default.project.json"
					onCommit={(v) => onConfig({ rojoProject: v === "" ? undefined : v })}
				/>
			</Row>

			<Row
				label="Compile"
				help="Hot reload recompiles a graph every time it is saved, which is every edit. Manual waits to be asked."
			>
				<div className="segmented">
					<button
						className={config.compileMode === "manual" ? "on" : ""}
						onClick={() => onConfig({ compileMode: "manual" })}
					>
						Manually
					</button>
					<button
						className={config.compileMode === "hot" ? "on" : ""}
						onClick={() => onConfig({ compileMode: "hot" })}
					>
						On every change
					</button>
				</div>
			</Row>

			<Row
				label="Format generated files"
				help="Runs stylua over the output when it is on PATH. When it is not, the file is written unformatted rather than not written."
			>
				<Toggle
					on={config.format}
					onChange={(on) => onConfig({ format: on })}
					label={config.format ? "With stylua, when available" : "Leave as emitted"}
				/>
			</Row>

			<h3>Node packs</h3>
			<p className="settings-note">
				Directories scanned for <code>.nodedef.json</code>. A pack's nodes join the
				palette and get their own reference pages, built from the same registry the
				built-in ones use.
			</p>
			<PathList
				paths={config.nodePaths}
				onChange={(nodePaths) => onConfig({ nodePaths })}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function EditorSettings({ prefs, onPrefs }: SettingsPanelProps) {
	return (
		<>
			<h2>Editor</h2>
			<p className="settings-note">
				Stored in this browser and nowhere else. They do not travel with the project
				and they never appear in a diff.
			</p>

			<Row
				label="Realign"
				help="Straighten places each node where the execution wire arriving at it comes out flat, so a run of nodes reads as one line. Columns is the plain grid."
			>
				<div className="segmented">
					{/* The same word the toolbar button uses. One name for one thing —
					    and it is short enough not to wrap, which a two-line half of a
					    segmented control does at this column width. */}
					<button
						className={prefs.alignExec ? "on" : ""}
						onClick={() => onPrefs({ alignExec: true })}
					>
						Straighten
					</button>
					<button
						className={!prefs.alignExec ? "on" : ""}
						onClick={() => onPrefs({ alignExec: false })}
					>
						Columns
					</button>
				</div>
			</Row>

			<Row
				label="Wires"
				help={WIRE_STYLES.find((w) => w.style === prefs.wireStyle)?.what ?? ""}
			>
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

			<Row
				label="Node corners"
				help="Capsule getters and reroute knots keep their shapes either way — a pill and a circle are what say “this is a value” and “this is a bend in the wire”, and they have no title to say it instead."
			>
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

			<Row
				label="Write a graph"
				help="There is no unsaved copy of a graph — the file is the document — so this is how long after your last edit it is written, not whether it is."
			>
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

			<Row
				label="On opening Roswaal"
				help="The daemon serves one project; this is only about which one this tab starts on."
			>
				<Toggle
					on={prefs.reopenLastProject}
					onChange={(on) => onPrefs({ reopenLastProject: on })}
					label={prefs.reopenLastProject ? "Reopen the last project" : "Start at the project picker"}
				/>
			</Row>
		</>
	);
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

function DocsSettings({ prefs, onPrefs }: SettingsPanelProps) {
	const percent = Math.round(prefs.docsPreviewScale * 100);
	return (
		<>
			<h2>Docs</h2>
			<p className="settings-note">
				How the documentation reads. Stored in this browser, like the editor's settings.
			</p>

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
				help="How large node and graph pictures are drawn. A graph bigger than its frame can be dragged around."
			>
				<div className="settings-range">
					<input
						type="range"
						aria-label="Preview size"
						min={PREVIEW_SCALE.min * 100}
						max={PREVIEW_SCALE.max * 100}
						step={PREVIEW_SCALE.step * 100}
						value={percent}
						onChange={(e) => onPrefs({ docsPreviewScale: previewScaleOf(Number(e.target.value) / 100) })}
					/>
					<span className="value">{percent}%</span>
				</div>
			</Row>
		</>
	);
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

function ThemeSettings({ prefs, onPrefs }: SettingsPanelProps) {
	const schemes = useMemo(
		() => [...BUILTIN_THEMES].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
		[],
	);
	const chosen = schemes.find((t) => t.name === prefs.theme);

	return (
		<>
			<h2>Themes</h2>
			<p className="settings-note">
				One JSON file each, in <code>themes/</code>. Roswaal and Beako use the same
				format, so a scheme written for one reads in the other.
			</p>

			<div className="theme-grid">
				<button
					className={`theme-card${prefs.theme === null ? " on" : ""}`}
					onClick={() => onPrefs({ theme: null })}
				>
					<SystemSwatch />
					<span className="theme-name">Follow the system</span>
					<span className="theme-credit">Light or dark, whichever your OS is set to</span>
				</button>

				{schemes.map((theme) => (
					<button
						key={theme.name}
						className={`theme-card${prefs.theme === theme.name ? " on" : ""}`}
						onClick={() => onPrefs({ theme: theme.name })}
					>
						<ThemeSwatch theme={theme} />
						<span className="theme-name">{theme.name}</span>
						<span className="theme-credit">{theme.credit ?? " "}</span>
					</button>
				))}
			</div>

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
				Every scheme names all of these. There is no inheritance, so a palette
				cannot half-apply by quietly borrowing another one's colours.
			</p>
			<RoleTable theme={chosen ?? schemes[0]} />

			<h3>What it does not</h3>
			<p className="settings-note">
				Node category colours and pin type colours are fixed and no theme changes
				them. Red is a boolean, green is a number, gold is a vector — that mapping
				is most of what makes a Roswaal graph readable at a glance, and a scheme
				that moved it would be trading the one thing the
				colours are for against a matter of taste.
			</p>
			<p className="settings-note">
				Grid, hover and shadow are not authored either. They are overlays, computed
				from whether the scheme is dark, so a palette cannot ship a hover state that
				is invisible on its own background.
			</p>
		</>
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
				<rect
					x="38"
					y="24"
					width="72"
					height="34"
					rx="4"
					fill={c.nodeBody}
					stroke={c.nodeBorder}
				/>
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
 * The terms the borrowed schemes travel under, in full.
 *
 * MIT requires the copyright notice to travel with the work, and a link is not
 * the notice travelling. The text here is the upstream `LICENSE` file copied
 * byte for byte and compiled in — not reconstructed from a template, because
 * three MIT licences in this repository are headed three different ways and one
 * of them carries an email address no template would have produced.
 */
function Licences() {
	const carried = BUILTIN_THEMES.filter((t) => t.licence !== undefined);
	const seen = new Set<string>();

	return (
		<>
			<h2>Licences</h2>
			<p className="settings-note">
				Roswaal is 0BSD. These are the schemes that are somebody else's work, and
				the terms they came with.
			</p>

			{carried.map((theme) => {
				const licence = theme.licence!;
				const first = !seen.has(licence.textFile);
				seen.add(licence.textFile);
				return (
					<div className="licence" key={themeSlug(theme.name)}>
						<h3>
							{theme.name} <span className="spdx">{licence.spdx}</span>
						</h3>
						<p className="settings-note">{licence.holder}</p>
						{first ? (
							<pre className="licence-text">{LICENCE_TEXTS[licence.textFile]}</pre>
						) : (
							<p className="settings-note">
								Same licence and same holder as above — one upstream project, two
								schemes.
							</p>
						)}
					</div>
				);
			})}

			<p className="settings-note">
				The schemes credited to <strong>neopolitans</strong> are the maintainer's own
				and carry no third-party claim. Everything Roswaal ships is listed on the
				Attributions page in the docs, and in <code>NOTICE.md</code>.
			</p>
		</>
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
function PathList({
	paths,
	onChange,
}: {
	paths: string[];
	onChange: (paths: string[]) => void;
}) {
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
