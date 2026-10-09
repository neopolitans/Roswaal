/**
 * The technical specification's own vocabulary: which draft it is, and what
 * each page's status means.
 *
 * The specification is written as pages of the documentation rather than as a
 * separate site, so it is searched, linked and rendered by the same code as
 * every guide, and offline in the editor's own Docs panel. What sets a page of
 * it apart is the status line under its title, which says whether a reader
 * implementing Roswaal's design is bound by it.
 */

import type { Block, ReqStatus } from "../site.js";

/** The draft every page of the specification currently belongs to. */
export const SPEC_DRAFT = "0.1";

export interface SpecStatus {
	/**
	 * Normative: an implementation is held to what the page says, in the words
	 * of RFC 2119 and RFC 8174 (MUST, SHOULD, MAY). Informative: the page
	 * explains, gives reasons or examples, and binds nothing.
	 */
	status: "normative" | "informative";
	draft: string;
	/** The conformance levels a normative page holds (§1.3): "Level 3". */
	levels?: string;
}

export const SPEC_LABELS: Record<SpecStatus["status"], string> = {
	normative: "Normative",
	informative: "Informative",
};

/** What each badge means, for its tooltip. */
export const SPEC_DETAILS: Record<SpecStatus["status"], string> = {
	normative:
		"An implementation is held to this page: MUST, SHOULD and MAY mean what RFC 2119 says.",
	informative: "This page explains and gives reasons. It requires nothing of an implementation.",
};

export const DRAFT_DETAIL =
	"A draft: anything here can still change, and nothing is promised until 1.0. See Process.";

/** What a requirement's status reads beside it. */
export const REQ_STATUS_LABELS: Record<ReqStatus, string> = {
	meets: "Roswaal meets",
	partly: "Roswaal partly",
	"not-yet": "Not yet in Roswaal",
};

/** A requirement's anchor on its page: `5.8-R3` is `#r-5-8-r3`. */
export function reqAnchor(id: string): string {
	return `r-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * A requirement block, written as the chapters write them:
 * `req("5.8-R3", "meets", "Notes **MUST** be drawn above …")`.
 */
export function req(id: string, roswaal: ReqStatus, text: string, gap?: string): Block {
	return { t: "req", id, roswaal, text, ...(gap ? { gap } : {}) };
}

export function normative(levels?: string): SpecStatus {
	return { status: "normative", draft: SPEC_DRAFT, ...(levels ? { levels } : {}) };
}

/** The status badge's words: "Normative · Level 3". */
export function specStatusLabel(spec: SpecStatus): string {
	return spec.levels ? `${SPEC_LABELS[spec.status]} · ${spec.levels}` : SPEC_LABELS[spec.status];
}

export function informative(): SpecStatus {
	return { status: "informative", draft: SPEC_DRAFT };
}
