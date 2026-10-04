/**
 * The mark at the top left of every window, which opens the projects panel.
 *
 * Beside it, the window it is: on a wide screen by name ("Node Design",
 * "Docs") and the version, and on a phone, where there is no room for words,
 * by the window's glyph in grey -- a graph for the editor, the palette for
 * Node Design, a page for the docs. The same three glyphs are on the buttons
 * that open those windows, so the mark answers "where am I" in the shape
 * that took you there.
 */

import { VERSION } from "../cli/version.js";
import { Icon, type IconName } from "./icons.jsx";
import { MarkedLogo, markTooltip } from "./previewBuild.jsx";

export type WindowKind = "editor" | "designer" | "docs";

const GLYPH: Record<WindowKind, IconName> = {
	editor: "graph",
	designer: "palette",
	docs: "document",
};

const NAME: Record<WindowKind, string> = {
	editor: "The editor",
	designer: "Node Design",
	docs: "Docs",
};

export function WindowMark({
	window,
	named = window !== "editor",
	onOpen,
}: {
	window: WindowKind;
	/** The window's name beside the mark on a wide screen. The editor's is the graph's tab. */
	named?: boolean;
	onOpen: () => void;
}) {
	return (
		<button
			className="logo window-mark"
			title={`Roswaal ${VERSION}, ${NAME[window]}. ${markTooltip() || "Recent projects, the demos, and the other windows."}`}
			aria-label={`Roswaal ${VERSION}, ${NAME[window]}`}
			onClick={onOpen}
		>
			<MarkedLogo height={17} />
			<span className="window-glyph" aria-hidden>
				<Icon name={GLYPH[window]} size={16} />
			</span>
			{named && <span className="window-name">{NAME[window]}</span>}
			<span className="version">{VERSION}</span>
		</button>
	);
}
