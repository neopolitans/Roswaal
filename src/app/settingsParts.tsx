/**
 * What a Settings page is built from: groups, rows and switches, and the
 * search they answer to.
 *
 * Its own module so an extension's pages are built from the same parts as the
 * editor's, and read the same while searching.
 */

import { createContext, type ReactNode, useContext } from "react";

import { Icon } from "./icons.jsx";

/**
 * What the search box holds, and whether the page being drawn matched it by
 * name -- in which case all of it shows, rows and all.
 */
export const Search = createContext<{ query: string; page: boolean }>({ query: "", page: false });

/** Whether every word typed is somewhere in the text, ignoring case. */
export function matches(query: string, ...texts: string[]): boolean {
	const text = texts.join(" ").toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => text.includes(word));
}

/** Rows that belong together, under a small heading, in one box. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="settings-group">
			<h3>{title}</h3>
			<div className="settings-box">{children}</div>
		</div>
	);
}

/**
 * One setting: its name and what it does, its control at the right. While
 * searching, shown only when it matches. `changed` marks one not at its
 * default, with `onReset` to put it back.
 */
export function Row({
	label,
	help,
	children,
	changed,
	onReset,
	resetTitle,
}: {
	label: string;
	help: string;
	children?: ReactNode;
	changed?: boolean;
	onReset?: () => void;
	resetTitle?: string;
}) {
	const { query, page } = useContext(Search);
	if (query && !page && !matches(query, label, help)) return null;
	return (
		<div className={changed ? "setting is-changed" : "setting"}>
			<div className="setting-label">
				<strong>{label}</strong>
				<span>{help}</span>
			</div>
			{(children || (changed && onReset)) && (
				<div className="setting-control">
					{changed && onReset && (
						<button
							type="button"
							className="tb icon-only settings-reset"
							title={resetTitle ?? "Reset"}
							aria-label={resetTitle ?? "Reset"}
							onClick={onReset}
						>
							<Icon name="undo" size={14} />
						</button>
					)}
					{children}
				</div>
			)}
		</div>
	);
}

/** A switch with what it does now beside it. */
export function Toggle({
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
