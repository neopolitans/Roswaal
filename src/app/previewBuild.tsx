/**
 * The build mark and the canary banner, gated on which build this is.
 *
 * The rule they enforce and the words they say are in `previewMark.ts`; read
 * that first. This file is only the half that has to ask `pages.ts` which build
 * it is running in — which is why it is a separate file, since the two pages
 * built in Node cannot import anything that reaches `pages.ts` and still need
 * the words.
 *
 * Gated here rather than at each call site, so a new window gets the rule by
 * rendering the component and cannot get it half right.
 */

import { STABLE_SITE } from "../core/docs/links.js";
import { cx } from "./cx.js";
import { Logo } from "./logo.jsx";
import { IS_BACKUP, IS_CANARY, IS_STATIC_HOST } from "./pages.js";
import { BACKUP_BANNER, type BuildMark, MARK_LABEL, MARK_ON_SURFACE } from "./previewMark.js";

export {
	BACKUP_BANNER,
	type BuildMark,
	MARK_BESIDE_LINK,
	MARK_LABEL,
	MARK_ON_SURFACE,
	markChipMarkup,
	PREVIEW_BESIDE_LINK,
	PREVIEW_LABEL,
	PREVIEW_ON_SURFACE,
	previewChipMarkup,
} from "./previewMark.js";

/**
 * Which mark this build wears, or `null` for the stable daemon build.
 *
 * One mark, never two: a canary browser build says canary, because an
 * unfinished build is unfinished whether it is in a tab or on your own machine.
 */
export function buildMark(): BuildMark | null {
	if (IS_CANARY) return "canary";
	if (IS_STATIC_HOST) return "preview";
	return null;
}

/** The mark, on a surface that has one. Nothing on the stable daemon build. */
export function PreviewChip({ title }: { title?: string } = {}) {
	const mark = buildMark();
	if (mark === null) return null;
	return (
		<span className={cx("version preview-chip", mark)} title={title ?? MARK_ON_SURFACE[mark]}>
			{MARK_LABEL[mark]}
		</span>
	);
}

/**
 * The Roswaal logo, in the colour of the build: blue for the browser preview,
 * the canary's yellow for the canary, and its own colour for an installed
 * build. The editor's top bar wears the mark this way rather than as a chip:
 * the bar is the one short of room, and the chip and the version beside it
 * were two words on a row that has none to spare. The version and the words
 * the chip said are in the mark's tooltip instead, and the mark opens the
 * panel that shows both.
 *
 * The same rule as the chip -- every surface carries its mark -- by the same
 * route, one component, so the colour is decided in one place.
 */
export function MarkedLogo({ height = 17, title }: { height?: number; title?: string } = {}) {
	return <Logo height={height} title={title} className={`mark-${buildMark() ?? "stable"}`} />;
}

/** What the mark means, for a tooltip beside a tinted logo. Empty for a stable build. */
export function markTooltip(): string {
	const mark = buildMark();
	return mark === null
		? ""
		: `${MARK_LABEL[mark][0].toUpperCase()}${MARK_LABEL[mark].slice(1)}. ${MARK_ON_SURFACE[mark]}`;
}

/**
 * The banner on the copy at the old address, saying where the site went.
 *
 * The canary wore one too, until its yellow mark was found to say it well
 * enough: on a phone the banner took three lines from every window.
 */
export function SiteBanner({ kind = "app" }: { kind?: "app" | "docs" } = {}) {
	if (IS_BACKUP) {
		return (
			<div className="canary-banner canary-banner-backup" role="status">
				<span className="canary-banner-mark">{BACKUP_BANNER.mark}</span>
				<span className="canary-banner-text">{BACKUP_BANNER[kind]}</span>
				<a className="canary-banner-out" href={STABLE_SITE}>
					{BACKUP_BANNER.wayOut}
				</a>
			</div>
		);
	}
	return null;
}
