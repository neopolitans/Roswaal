/**
 * The mark at the top left of every window, which opens the projects panel.
 *
 * On a wide screen the mode strip beside it says which window this is, and
 * the version is in the panel the mark opens. On a phone, where there is no
 * strip, the window's glyph sits beside the mark in grey -- a graph for the
 * editor, the palette for Node Design, a page for the docs: the strip's
 * glyphs, so the mark answers "where am I" in the same shapes.
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

export function WindowMark({ window, onOpen }: { window: WindowKind; onOpen: () => void }) {
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
		</button>
	);
}
