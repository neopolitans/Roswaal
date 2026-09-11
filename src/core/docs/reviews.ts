/**
 * Whether a person has read each documentation page, and when.
 *
 * Every built-in page is **pending** until it is listed here, and that default
 * is the point: most of this documentation was drafted with AI, and a page
 * nobody has read should say so rather than borrow the authority of one that
 * has been checked. A page is *reviewed* once somebody has read it, and
 * *verified* once what it says has been tried end to end in the editor -- or it
 * was written with the author rather than for them.
 *
 * Keyed by slug, so a generated page -- a node's reference, the release notes
 * -- is reviewed exactly the way a hand-written guide is. A node pack's pages
 * are not covered: they document the project's own code, which is the
 * project's to vouch for.
 *
 * The date is the last time the page was read, the way GOV.UK dates a help
 * page, so the oldest is the next one due. When a page changes enough to need
 * reading again, take its entry out. `npm run docs:reviews` lists where every
 * page stands.
 */

export type ReviewStatus = "pending" | "reviewed" | "verified";

export interface Review {
	status: ReviewStatus;
	/** ISO date of the last review. Absent while the page is pending. */
	date?: string;
	/**
	 * What a verified pass still needs, shown under the date — usually the one
	 * part of the page the reviewer could not vouch for, and who could. A
	 * reviewed page that needs nothing in particular leaves it out.
	 */
	verify?: string;
}

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
	pending: "Pending review",
	reviewed: "Reviewed",
	verified: "Verified",
};

/** What each badge means, for its tooltip. */
export const REVIEW_DETAILS: Record<ReviewStatus, string> = {
	pending: "Drafted with AI, and not yet read by a person.",
	reviewed: "Read by a person, and not yet checked against the editor.",
	verified: "Read, and checked against the editor end to end.",
};

/** Newest first within each status, to keep additions easy to find. */
export const REVIEWS: Record<
	string,
	{ status: Exclude<ReviewStatus, "pending">; date: string; verify?: string }
> = {
	// Verified with the author, once it had pictures for every section.
	"wires-and-pins": { status: "verified", date: "2026-09-11" },
	// Verified with the author. Settings once its rojoProject line said what
	// the setting does; Hand-written Luau once each code node had its own
	// graph and the Luau it compiles to. Lune is marked experimental on the
	// pages that mention it, which is what verifying them covers.
	"types": { status: "verified", date: "2026-09-11" },
	"variables-and-locals": { status: "verified", date: "2026-09-11" },
	"building-and-rojo": { status: "verified", date: "2026-09-11" },
	"hand-written-luau": { status: "verified", date: "2026-09-11" },
	"settings": { status: "verified", date: "2026-09-11" },
	// Read by the author, who has not shipped the networking side.
	"coming-from-blueprints": {
		status: "reviewed",
		date: "2026-09-11",
		verify:
			"someone who has shipped multiplayer in Unreal should check the **Networking** rows — " +
			"replicated functions (RPCs) especially — against real use.",
	},
};

export function reviewOf(slug: string): Review {
	return REVIEWS[slug] ?? { status: "pending" };
}

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

/**
 * `2026-09-11` as `11 September 2026`.
 *
 * Written out rather than left to `toLocaleDateString`, which would give every
 * reader a different page and the static build whatever locale it ran in.
 */
export function formatReviewDate(iso: string): string {
	const [year, month, day] = iso.split("-").map(Number);
	return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The line at the foot of a page. */
export function reviewLine(review: Review): string {
	return review.date ? `Last reviewed ${formatReviewDate(review.date)}` : "Not reviewed yet";
}
