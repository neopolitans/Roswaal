/**
 * Pieces every inspecting panel shares: a section's heading, and what the
 * panel is showing at its top.
 *
 * One heading for the Inspector's lists and pins, Properties' groups, the
 * Project panel's two halves and the type picker's groups: its name in the
 * accent colour with a line running on from it, a count, and a fold. It
 * replaced a handful of grey capitals that sat too close to the rows under
 * them to tell apart. `docs/toolbars.ts` draws the same markup.
 */

import { type CSSProperties, type ReactNode, useState } from "react";

import { cx } from "./cx.js";
import { Icon, type IconName } from "./icons.jsx";

export interface SectionHeadProps {
	title: string;
	/** How many things the section holds, beside its name. */
	count?: number;
	/** Folded or not. Without `onToggle` the heading is a heading and nothing else. */
	open?: boolean;
	onToggle?: () => void;
	/** Buttons at the far end of the line, such as Add. */
	children?: ReactNode;
	hint?: string;
}

export function SectionHead({
	title,
	count,
	open = true,
	onToggle,
	children,
	hint,
}: SectionHeadProps) {
	const inner = (
		<>
			{onToggle && <Icon name="chevron" size={14} className="pane-fold" />}
			<span className="pane-title">{title}</span>
			{count !== undefined && <span className="pane-count">{count}</span>}
		</>
	);
	return (
		<div className="pane-head" title={hint}>
			{onToggle ? (
				<button type="button" className="pane-toggle" aria-expanded={open} onClick={onToggle}>
					{inner}
				</button>
			) : (
				<span className="pane-toggle">{inner}</span>
			)}
			<span className="pane-line" />
			{children && <span className="pane-tools">{children}</span>}
		</div>
	);
}

/** A section that folds, open to begin with. Not remembered: it is tidying, not a setting. */
export function useFold(initial = true): [boolean, () => void] {
	const [open, setOpen] = useState(initial);
	return [open, () => setOpen((was) => !was)];
}

/** Add, at the end of a heading's line. */
export function AddButton({ onClick, title }: { onClick: () => void; title?: string }) {
	return (
		<button type="button" className="tb pane-add" title={title} onClick={onClick}>
			<Icon name="plus" size={13} />
			Add
		</button>
	);
}

export interface IdentProps {
	name: string;
	/** What kind of thing it is: a node's category, an instance's class. */
	kind: string;
	/** The badge's colour: the node's, the folder's. */
	color: string;
	icon?: IconName;
	children?: ReactNode;
	className?: string;
}

/** What the panel is showing: a badge in its colour, its name, and its kind. */
export function Ident({ name, kind, color, icon, children, className }: IdentProps) {
	return (
		<div className={cx("ident", className)}>
			<span className="ident-badge" style={{ background: color }}>
				{icon && <Icon name={icon} size={17} />}
			</span>
			<span className="ident-text">
				<span className="ident-name">{name}</span>
				<span className="ident-kind">{kind}</span>
			</span>
			{children && <span className="ident-tools">{children}</span>}
		</div>
	);
}

/**
 * A row's indent, and its depth for the guides: a hairline under each open
 * folder, drawn by `.tree-row::before`.
 *
 * `from` is the first depth that has a folder row to hang a line from. The
 * Project panel's top folders sit under a section heading rather than a
 * folder, so their level draws no line; a place's services are its top rows.
 */
export function depthStyle(depth: number, from = 0): CSSProperties {
	return {
		paddingLeft: 6 + depth * 13,
		"--depth": Math.max(0, depth - from),
		"--guide-from": from,
	} as CSSProperties;
}
