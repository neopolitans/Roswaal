/**
 * Choosing a folder in the project, as a Save As dialog does: a path of steps
 * to go back up, the folders where you are, and New folder beside them.
 *
 * A click picks a folder; a double-click, or its arrow, goes into it. Folders
 * show the Explorer's icons, so ReplicatedStorage reads as the service it
 * becomes, and a folder a node map syncs carries the map's mark.
 */

import { useMemo, useState } from "react";

import { isService } from "../core/roblox.js";
import { normalisePath } from "../core/rojoPaths.js";
import type { TreeEntry } from "./api.js";
import { cx } from "./cx.js";
import { ExplorerIcon } from "./ExplorerIcon.jsx";
import { Icon } from "./icons.jsx";
import { entryAt } from "./mapDisk.js";

export interface FolderPickerProps {
	tree: readonly TreeEntry[];
	/** The folders at the top, before you go into any: the project's own. */
	roots: readonly string[];
	/** The folder picked now. */
	value: string;
	onPick: (path: string) => void;
	/** Makes a folder in the one you are in. Absent, there is no New folder. */
	onNewFolder?: (parent: string) => void;
}

const parentOf = (path: string): string => {
	const at = normalisePath(path);
	const slash = at.lastIndexOf("/");
	return slash === -1 ? "" : at.slice(0, slash);
};

const subfolders = (entry: TreeEntry | undefined): TreeEntry[] =>
	(entry?.children ?? [])
		.filter((one) => one.kind === "directory")
		.sort((a, b) => a.name.localeCompare(b.name));

/** A folder's icon: the service it is named for, or a Folder; the map's mark when one syncs it. */
export function FolderIcon({ entry, top }: { entry: TreeEntry; top?: boolean }) {
	const named = !top && isService(entry.name);
	const icon = (
		<ExplorerIcon className={named ? entry.name : "Folder"} service={named} open={false} />
	);
	if (!entry.syncedBy) return icon;
	return (
		<span className="tree-badged" title={`Synced by ${entry.syncedBy.split("/").pop()}`}>
			{icon}
			<span className="tree-map-badge" aria-hidden="true">
				<Icon name="map" size={10} />
			</span>
		</span>
	);
}

export function FolderPicker({ tree, roots, value, onPick, onNewFolder }: FolderPickerProps) {
	const tops = useMemo(
		() => roots.map((root) => entryAt(tree, root)).filter((one): one is TreeEntry => !!one),
		[tree, roots],
	);
	// Start in the picked folder's parent, so it is in the list and lit.
	const [at, setAt] = useState<string | null>(() => {
		const parent = parentOf(value);
		return parent && entryAt(tree, parent) ? parent : null;
	});
	const here = at === null ? undefined : entryAt(tree, at);
	const list = at === null ? tops : subfolders(here);
	const steps = at === null ? [] : normalisePath(at).split("/");
	const picked = normalisePath(value);

	return (
		<div className="folder-pick">
			<div className="fp-crumbs">
				<button
					type="button"
					className={cx("fp-step", at === null && "here")}
					onClick={() => setAt(null)}
				>
					Project
				</button>
				{steps.map((step, i) => {
					const path = steps.slice(0, i + 1).join("/");
					return (
						<span key={path} className="fp-step-wrap">
							<span className="fp-sep" aria-hidden="true">
								›
							</span>
							<button
								type="button"
								className={cx("fp-step", i === steps.length - 1 && "here")}
								onClick={() => setAt(path)}
							>
								{step}
							</button>
						</span>
					);
				})}
				<span className="sp" />
				{onNewFolder && at !== null && (
					<button type="button" className="tb with-icon" onClick={() => onNewFolder(at)}>
						<Icon name="newFolder" size={13} />
						New folder
					</button>
				)}
			</div>
			<div className="fp-list" role="listbox" aria-label="Folders">
				{list.length === 0 && <div className="fp-none">No folders in here.</div>}
				{list.map((entry) => {
					const inner = subfolders(entry).length > 0;
					return (
						<div
							key={entry.path}
							role="option"
							aria-selected={entry.path === picked}
							tabIndex={0}
							className={cx("fp-item", entry.path === picked && "on")}
							title={entry.path}
							onClick={() => onPick(entry.path)}
							onDoubleClick={() => inner && setAt(entry.path)}
							onKeyDown={(e) => {
								if (e.key === "Enter") onPick(entry.path);
								else if (e.key === "ArrowRight" && inner) setAt(entry.path);
								else if (e.key === "ArrowLeft" && at !== null) setAt(parentOf(at) || null);
							}}
						>
							<FolderIcon entry={entry} top={at === null} />
							<span className="fp-name">{entry.name}</span>
							{inner && (
								<button
									type="button"
									className="fp-in"
									title={`Into ${entry.name}`}
									aria-label={`Into ${entry.name}`}
									onClick={(e) => {
										e.stopPropagation();
										setAt(entry.path);
									}}
								>
									<Icon name="chevron" size={13} />
								</button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
