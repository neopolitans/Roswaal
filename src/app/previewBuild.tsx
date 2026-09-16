/**
 * The preview mark, as a component, gated on which build this is.
 *
 * The rule it enforces and the words it says are in `previewMark.ts`; read that
 * first. This file is only the half that has to ask `pages.ts` which build it
 * is running in — which is why it is a separate file, since the two pages built
 * in Node cannot import anything that reaches `pages.ts` and still need the
 * words.
 *
 * Gated here rather than at each call site, so a new window gets the rule by
 * rendering the component and cannot get it half right.
 */

import { IS_STATIC_HOST } from "./pages.js";
import { PREVIEW_LABEL, PREVIEW_ON_SURFACE } from "./previewMark.js";

export {
	PREVIEW_BESIDE_LINK, PREVIEW_LABEL, PREVIEW_ON_SURFACE, previewChipMarkup,
} from "./previewMark.js";

/** The mark, on a surface of the browser build. Nothing in the daemon build. */
export function PreviewChip({ title = PREVIEW_ON_SURFACE }: { title?: string } = {}) {
	if (!IS_STATIC_HOST) return null;
	return (
		<span className="version preview-chip" title={title}>
			{PREVIEW_LABEL}
		</span>
	);
}
