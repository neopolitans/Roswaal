/**
 * The designer's front page: every node pack there is, as cards.
 *
 * A node is made *in* a pack, so choosing the pack comes first — the brief's
 * order, and the right one, because where a node lives decides who gets it. The
 * project's packs come first, since they are what can be changed; the built-in
 * library follows, one card per category, to look at and not to change.
 *
 * ## What each card can do, and why a Luau pack is different
 *
 * A JSON pack can be duplicated, copied into another project, copied as JSON,
 * shown in the file manager and deleted. A `.nodedef.luau` pack has the same
 * actions except that its duplicate is *Save as JSON pack*: the designer never
 * rewrites a Luau pack, because the comments in one are the reason somebody
 * chose Luau, so an editable Luau pack is a JSON copy of it.
 *
 * ## Asking before deleting, inline
 *
 * The question names the graphs that use the pack's nodes. It is asked on the
 * card rather than in a browser dialog, which would block the page and could not
 * show a list.
 */

import { useMemo, useState } from "react";

import { BUILTIN_NODES } from "../../core/nodes/index.js";
import { packTargets, runsOn } from "../../core/packs.js";
import type { Target } from "../../core/schema.js";
import { api, type PackFile } from "../api.js";
import { Icon } from "../icons.jsx";
import { NOT_HERE, useHostCan } from "../host.js";

/** What the designer has open: a built-in category, or one of the project's packs. */
export type OpenPack = { kind: "builtin"; category: string } | { kind: "project"; path: string };

export type Notify = (text: string, kind?: "ok" | "failed") => void;

const LAYOUT_KEY = "roswaal.designer.layout";

function readLayout(): "grid" | "list" {
	try {
		return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
	} catch {
		return "grid";
	}
}

/** How a set of targets reads on a card. */
export function targetsLabel(targets: readonly Target[] | null): string {
	if (targets === null) return "Roblox and Lune";
	if (targets.length === 0) return "No target";
	return targets.map((t) => (t === "lune" ? "Lune" : "Roblox")).join(" and ") + " only";
}

/** The built-in library as packs: one per category, in the order it first appears. */
export function builtinPacks(): { category: string; count: number; targets: Target[] | null }[] {
	const byCategory = new Map<string, typeof BUILTIN_NODES>();
	for (const def of BUILTIN_NODES) {
		const list = byCategory.get(def.category) ?? [];
		list.push(def);
		byCategory.set(def.category, list);
	}
	return [...byCategory].map(([category, defs]) => ({
		category,
		count: defs.length,
		targets: packTargets(defs),
	}));
}

export interface PackBrowserProps {
	packs: PackFile[] | null;
	/** What the project compiles for, which every pack's targets are checked against. */
	target: Target | null;
	noProject: boolean;
	onOpen: (open: OpenPack) => void;
	/** Something on disk changed; read the packs again. */
	onChanged: () => Promise<void>;
	notify: Notify;
}

export function PackBrowser({ packs, target, noProject, onOpen, onChanged, notify }: PackBrowserProps) {
	// Copying a pack between projects needs a second project to copy to, which
	// needs a filesystem holding more than this one. `inspect` is that
	// question: a daemon with no folder picker can still be given a path.
	const canUseOtherProjects = useHostCan("inspect");
	const [layout, setLayout] = useState(readLayout);
	const [naming, setNaming] = useState<string | null>(null);
	const [importing, setImporting] = useState<
		{ root: string; target: Target; packs: PackFile[]; done: Set<string> } | null
	>(null);
	const builtins = useMemo(builtinPacks, []);
	const names = useMemo(() => new Set((packs ?? []).map((p) => p.name)), [packs]);

	const chooseLayout = (next: "grid" | "list") => {
		setLayout(next);
		try {
			localStorage.setItem(LAYOUT_KEY, next);
		} catch {
			// The choice still applies to this visit.
		}
	};

	const create = async () => {
		if (naming === null) return;
		try {
			const { pack } = await api.createPack(naming);
			setNaming(null);
			await onChanged();
			onOpen({ kind: "project", path: pack.path });
		} catch (err) {
			notify((err as Error).message, "failed");
		}
	};

	const startImport = async () => {
		try {
			const { path: root } = await api.browseForProject();
			if (!root) return;
			const scanned = await api.scanPacks(root);
			if (scanned.packs.length === 0) {
				notify(`${root} has no node packs.`, "failed");
				return;
			}
			setImporting({ ...scanned, done: new Set() });
		} catch (err) {
			notify((err as Error).message, "failed");
		}
	};

	return (
		<div className="pack-browser">
			<div className="pack-toolbar">
				<h1>Node packs</h1>
				<span className="spacer" />
				<div className="segmented">
					<button className={layout === "grid" ? "on" : ""} onClick={() => chooseLayout("grid")}>
						Grid
					</button>
					<button className={layout === "list" ? "on" : ""} onClick={() => chooseLayout("list")}>
						List
					</button>
				</div>
				{/* Hidden rather than disabled, unlike the file-manager buttons: a
				    tooltip explaining that there is no second project on a volume
				    holding one would not help anybody do anything. */}
				{canUseOtherProjects && (
					<button className="tb with-icon" disabled={noProject} onClick={() => void startImport()}>
						<Icon name="folderOpen" size={15} />
						Import from a project…
					</button>
				)}
				{naming === null ? (
					<button className="tb primary with-icon" disabled={noProject} onClick={() => setNaming("")}>
						<Icon name="newFile" size={15} />
						New pack
					</button>
				) : (
					<form
						className="pack-naming"
						onSubmit={(e) => {
							e.preventDefault();
							void create();
						}}
					>
						<input
							className="tb"
							autoFocus
							placeholder="Pack name"
							value={naming}
							onChange={(e) => setNaming(e.target.value)}
							onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
						/>
						<button className="tb primary" type="submit">Create</button>
						<button className="tb" type="button" onClick={() => setNaming(null)}>Cancel</button>
					</form>
				)}
			</div>

			<h2>This project</h2>
			{noProject ? (
				<p className="hint">No project is open. Open one in the editor, then reload this page.</p>
			) : packs === null ? (
				<p className="hint">Reading packs…</p>
			) : packs.length === 0 ? (
				<p className="hint">No packs yet. Make one, or import one from another project.</p>
			) : (
				<div className={`pack-grid ${layout}`}>
					{packs.map((pack) => (
						<ProjectPackCard
							key={pack.path}
							pack={pack}
							target={target}
							missing={pack.requires.filter((name) => !names.has(name))}
							onOpen={() => onOpen({ kind: "project", path: pack.path })}
							onChanged={onChanged}
							notify={notify}
						/>
					))}
				</div>
			)}

			<h2>Built in</h2>
			<div className={`pack-grid ${layout}`}>
				{builtins.map((b) => (
					<div
						key={b.category}
						className="pack-card builtin"
						role="button"
						tabIndex={0}
						onClick={() => onOpen({ kind: "builtin", category: b.category })}
						onKeyDown={(e) => e.key === "Enter" && onOpen({ kind: "builtin", category: b.category })}
					>
						<div className="pack-card-head">
							<h3>{b.category}</h3>
							<span className="badge">Built in</span>
						</div>
						<div className="pack-badges">
							<span className="count">{b.count} node{b.count === 1 ? "" : "s"}</span>
							<TargetBadge targets={b.targets} target={target} />
						</div>
					</div>
				))}
			</div>

			{importing && (
				<div className="docs-backdrop" onPointerDown={() => setImporting(null)}>
					<div className="pack-import" onPointerDown={(e) => e.stopPropagation()}>
						<div className="pack-import-head">
							<strong>Import from {importing.root}</strong>
							<span className="spacer" />
							<button className="tb" onClick={() => setImporting(null)} title="Close">
								<Icon name="close" size={15} />
							</button>
						</div>
						<ul>
							{importing.packs.map((pack) => {
								const done = importing.done.has(pack.path);
								return (
									<li key={pack.path}>
										<span className="name">{pack.name}</span>
										<span className="badge">{pack.format === "luau" ? "Luau" : "JSON"}</span>
										<span className="count">{pack.nodes.length} nodes</span>
										<TargetBadge targets={pack.targets} target={target} />
										<span className="spacer" />
										{pack.errors.length > 0 ? (
											<span className="badge warn" title={pack.errors.join("\n")}>Has problems</span>
										) : (
											<button
												className="tb"
												disabled={done}
												onClick={async () => {
													try {
														await api.importPack(importing.root, pack.path);
														setImporting((m) => (m ? { ...m, done: new Set([...m.done, pack.path]) } : m));
														await onChanged();
														notify(`${pack.name} is in this project now.`);
													} catch (err) {
														notify((err as Error).message, "failed");
													}
												}}
											>
												{done ? "Imported" : "Import"}
											</button>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}

/** What a pack runs on, marked when the project compiles for something else. */
function TargetBadge({ targets, target }: { targets: readonly Target[] | null; target: Target | null }) {
	const fits = target === null || runsOn(targets, target);
	return (
		<span
			className={`badge${fits ? "" : " warn"}`}
			title={fits ? "Runs on what this project compiles for." : "This project compiles for something these nodes do not run on."}
		>
			{targetsLabel(targets)}
		</span>
	);
}

function ProjectPackCard({
	pack, target, missing, onOpen, onChanged, notify,
}: {
	pack: PackFile;
	target: Target | null;
	/** Packs it requires that this project does not have. */
	missing: string[];
	onOpen: () => void;
	onChanged: () => Promise<void>;
	notify: Notify;
}) {
	const canUseOtherProjects = useHostCan("inspect");
	const canReveal = useHostCan("reveal");
	const [confirming, setConfirming] = useState<{ graph: string; count: number }[] | null>(null);
	const luau = pack.format === "luau";

	/** Runs an action without the click reaching the card, which opens it. */
	const act = (fn: () => Promise<void>) => (e: React.MouseEvent) => {
		e.stopPropagation();
		void fn().catch((err: Error) => notify(err.message, "failed"));
	};

	return (
		<div className="pack-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
			<div className="pack-card-head">
				<h3>{pack.name}</h3>
				<span className="badge" title={luau ? "Hand-written. The designer opens it read-only." : undefined}>
					{luau ? "Luau · read-only" : "JSON"}
				</span>
			</div>
			<div className="pack-path">{pack.path}</div>
			<div className="pack-badges">
				<span className="count">{pack.nodes.length} node{pack.nodes.length === 1 ? "" : "s"}</span>
				<TargetBadge targets={pack.targets} target={target} />
				{pack.errors.length > 0 && (
					<span className="badge warn" title={pack.errors.join("\n")}>
						{pack.errors.length} problem{pack.errors.length === 1 ? "" : "s"}
					</span>
				)}
				{missing.length > 0 && (
					<span className="badge warn" title="Its nodes' logic is built from these, and this project does not have them.">
						Needs {missing.join(", ")}
					</span>
				)}
			</div>

			{confirming ? (
				<div className="pack-confirm" onClick={(e) => e.stopPropagation()}>
					<p>
						Delete {pack.name}?{" "}
						{confirming.length === 0
							? "No graph uses its nodes."
							: `${confirming.reduce((n, u) => n + u.count, 0)} of its nodes are placed in ` +
								`${confirming.map((u) => u.graph.split("/").pop()).join(", ")}, and will show as unknown.`}
					</p>
					<button
						className="tb danger"
						onClick={act(async () => {
							await api.deletePack(pack.path);
							await onChanged();
							notify(`${pack.name} was deleted.`);
						})}
					>
						Delete
					</button>
					<button className="tb" onClick={(e) => { e.stopPropagation(); setConfirming(null); }}>
						Keep
					</button>
				</div>
			) : (
				<div className="pack-actions">
					<button
						className="tb"
						title={luau ? "An editable JSON copy, beside it" : "A copy beside it, in its own namespace"}
						onClick={act(async () => {
							const { pack: copy } = await api.duplicatePack(pack.path);
							await onChanged();
							notify(`${copy.name} is a copy of ${pack.name}.`);
						})}
					>
						<Icon name="duplicate" size={14} />
						{luau ? "Save as JSON pack" : "Duplicate"}
					</button>
					{canUseOtherProjects && (
						<button
							className="tb icon-only"
							title="Copy to another project…"
							aria-label="Copy to another project"
							onClick={act(async () => {
								const { path: root } = await api.browseForProject();
								if (!root) return;
								await api.exportPack(pack.path, root);
								notify(`${pack.name} was copied to ${root}.`);
							})}
						>
							<Icon name="external" size={14} />
						</button>
					)}
					<button
						className="tb icon-only"
						title="Copy JSON"
						aria-label="Copy the pack as JSON"
						onClick={act(async () => {
							const { nodes } = await api.readPack(pack.path);
							const document = pack.requires.length > 0 ? { requires: pack.requires, nodes } : { nodes };
							await navigator.clipboard.writeText(JSON.stringify(document, null, 2));
							notify(`${pack.name} was copied as JSON.`);
						})}
					>
						<Icon name="copy" size={14} />
					</button>
					<button
						className="tb icon-only"
						disabled={!canReveal}
						title={canReveal ? "Show in file manager" : NOT_HERE}
						aria-label="Show in file manager"
						onClick={act(async () => {
							await api.reveal(pack.path);
						})}
					>
						<Icon name="folder" size={14} />
					</button>
					<button
						className="tb icon-only"
						title="Delete…"
						aria-label="Delete the pack"
						onClick={act(async () => {
							const { usage } = await api.packUsage(pack.path);
							setConfirming(usage);
						})}
					>
						<Icon name="remove" size={14} />
					</button>
				</div>
			)}
		</div>
	);
}
