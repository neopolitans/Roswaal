/**
 * The parts every modal window shares, so they read as one family: a header
 * with a badge in the colour of the kind of window, the title and a line
 * saying where or what, anything the window adds, and × at the right.
 *
 * The badge's colour is the `--tone` of the panel around it -- `.dialog-panel`
 * sets it by kind -- or the accent where nothing does. The shell itself
 * (corners, border, shadow, backdrop, entrance, sheet on narrow screens) is
 * the stylesheet's: see "Modal windows" in theme.css.
 */

import type { ReactNode } from "react";

import { Icon, type IconName } from "./icons.jsx";

export function ModalHead({
	icon,
	title,
	sub,
	onClose,
	closeLabel = "Close",
	children,
}: {
	icon: IconName;
	title: ReactNode;
	/** One line under the title: where the thing is, or what it holds. */
	sub?: ReactNode;
	onClose?: () => void;
	closeLabel?: string;
	/** Controls of the window's own, before ×: a switch, a count. */
	children?: ReactNode;
}) {
	return (
		<header className="dialog-head">
			<span className="dialog-badge">
				<Icon name={icon} size={17} />
			</span>
			<span className="dialog-title">
				<h3>{title}</h3>
				{sub !== undefined && sub !== "" && <span className="dialog-sub">{sub}</span>}
			</span>
			<span className="dialog-head-end">
				{children}
				{onClose && (
					<button
						type="button"
						className="tb icon-only dialog-close"
						aria-label={closeLabel}
						title={`${closeLabel} (Esc)`}
						onClick={onClose}
					>
						<Icon name="close" size={14} />
					</button>
				)}
			</span>
		</header>
	);
}

/** The keys a window answers to, at the left of its foot. Hidden on touch screens. */
export function ModalKeys({ keys }: { keys: [string, string][] }) {
	return (
		<span className="dialog-keys">
			{keys.map(([key, does], i) => (
				<span key={key}>
					{i > 0 && " · "}
					<kbd>{key}</kbd> {does}
				</span>
			))}
		</span>
	);
}
