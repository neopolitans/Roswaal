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
	/**
	 * Who reviewed it, as GitHub account names — `neopolitans`, not a display
	 * name — so the credit is a link to a person anyone can find. Listed in the
	 * page's foot and gathered on *Contributing*.
	 */
	reviewers?: string[];
}

/** A GitHub account name: letters, digits and single hyphens, up to 39. */
export const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** A handle as a link to its GitHub profile, in the docs' inline markup. */
export function reviewerLink(handle: string): string {
	return `[@${handle}](https://github.com/${handle})`;
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
	{ status: Exclude<ReviewStatus, "pending">; date: string; verify?: string; reviewers?: string[] }
> = {
	// Verified by the author across 0.60.0 to 0.60.3, which is the release the
	// page was written in and the two that answered what reading it turned up:
	// the drawn bars sat flush against their legends and read as the top row of
	// a list, and the graph toolbars' canvas stopped where the tools stopped.
	// Both were found by looking at the page rather than at the diff.
	// Verified again for 0.72.0, with its Desktop, Tablet and Phone tabs and
	// the two bars only a touch screen has.
	"toolbars": { status: "verified", date: "2026-09-18", reviewers: ["neopolitans"] },
	// Verified by the author for 0.29.1.
	// Read again for 0.31.6, when C stopped needing a selection and the
	// Comments table gained the two ways to make one.
	"controls": { status: "verified", date: "2026-09-18", reviewers: ["neopolitans"] },
	// Read by the author against the editor and Node Design, both ways, for 0.72.0.
	// Read by the author against the editor and Node Design on a computer, a
	// tablet and a phone, for 0.72.0.
	"the-interface": { status: "verified", date: "2026-09-18", reviewers: ["neopolitans"] },
	// Read by the author for 0.72.0, with its three ways in.
	"getting-started": { status: "verified", date: "2026-09-18", reviewers: ["neopolitans"] },
	// Verified with the author, once it had pictures for every section.
	"wires-and-pins": { status: "verified", date: "2026-09-11", reviewers: ["neopolitans"] },
	// Verified with the author. Settings once its rojoProject line said what
	// the setting does; Hand-written Luau once each code node had its own
	// graph and the Luau it compiles to. Lune is marked experimental on the
	// pages that mention it, which is what verifying them covers.
	"types": { status: "verified", date: "2026-09-11", reviewers: ["neopolitans"] },
	// Verified for 0.31.4, once it described the picker itself rather than only
	// the nodes: the grouped list, the field Other… opens for a type the list
	// cannot show, and the two Declare Type shapes for a type that is a
	// declaration rather than a name.
	"casting": { status: "verified", date: "2026-09-12", reviewers: ["neopolitans"] },
	// Verified by the author for 0.64.8, after the page was rewritten in 0.64.2:
	// it had been written for 0.33.0, when function graphs were the new thing,
	// and had never said how to *call* one. Read again with the Variables panel
	// drawn on it and the pre-0.33.0 migration note taken out -- a note no
	// reader could have needed, the tool having been public only since 0.59.1.
	"functions": { status: "verified", date: "2026-09-16", reviewers: ["neopolitans"] },
	// Verified by the author for 0.65.3, reading the page against the editor.
	// The read found the drawn graph under the node previews had two Prints
	// exactly on top of each other -- which turned out to be six graphs and a
	// bug in Realign rather than a mistake in this scene. The contents were
	// verified as they stood; the picture is what changed.
	"services": { status: "verified", date: "2026-09-16", reviewers: ["neopolitans"] },
	// Read again for 0.32.0, when Get Parameter joined the locals it sits
	// beside: the same idea of reading something by name instead of by a wire.
	"variables-and-locals": { status: "verified", date: "2026-09-12", reviewers: ["neopolitans"] },
	"building-and-rojo": { status: "verified", date: "2026-09-11", reviewers: ["neopolitans"] },
	"hand-written-luau": { status: "verified", date: "2026-09-11", reviewers: ["neopolitans"] },
	// Read again for 0.31.4, when Long names was added to its table of
	// preferences: a badge that covered text nobody had checked would be the
	// one thing the ledger exists to prevent.
	"settings": { status: "verified", date: "2026-09-12", reviewers: ["neopolitans"] },
	// Verified by the author for 0.43.1, once What Roswaal is designed for named
	// Lune, Luau and Roblox alongside the borrowed names it credits.
	"attributions": { status: "verified", date: "2026-09-15", reviewers: ["neopolitans"] },
	// Read by the author for 0.65.0, against the RFC and against the editor.
	// Not verified, and deliberately: every rule on it is checked against
	// `require-by-string-aliases.html` and against what Roswaal does with it,
	// and neither of those is the same as a project that actually resolves its
	// requires through an alias map every day. The two the page leans hardest
	// on -- inheritance, and which file a relative path resolves against -- are
	// exactly the two that look correct in any project with one `.luaurc` at
	// the root, which is where reading a spec stops being enough.
	"aliases": {
		status: "reviewed",
		date: "2026-09-16",
		reviewers: ["neopolitans"],
		verify:
			"someone who has shipped a **Lune** project with a `.luaurc` should check this " +
			"against a real alias map — especially a project with more than one file, where " +
			"inheritance and relative paths stop agreeing with the simple case.",
	},
	// Read by the author, who has not shipped the networking side.
	"coming-from-blueprints": {
		status: "reviewed",
		date: "2026-09-11",
		reviewers: ["neopolitans"],
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

/**
 * The line at the foot of a page, in the docs' inline markup: reviewers are
 * links, so a renderer passes this through its inline formatting.
 */
export function reviewLine(review: Review): string {
	if (!review.date) return "Not reviewed yet";
	const by = review.reviewers?.length
		? ` by ${joinNames(review.reviewers.map(reviewerLink))}`
		: "";
	return `Last reviewed ${formatReviewDate(review.date)}${by}`;
}

/**
 * Everyone credited with a review, most pages first and then by name, with
 * the number of pages each has reviewed. For *Contributing*.
 */
export function reviewerCounts(): { handle: string; pages: number }[] {
	const counts = new Map<string, number>();
	for (const entry of Object.values(REVIEWS)) {
		for (const handle of entry.reviewers ?? []) counts.set(handle, (counts.get(handle) ?? 0) + 1);
	}
	return [...counts]
		.map(([handle, pages]) => ({ handle, pages }))
		.sort((a, b) => b.pages - a.pages || a.handle.localeCompare(b.handle));
}

/** "a", "a and b", "a, b and c". */
function joinNames(names: string[]): string {
	return names.length <= 1
		? names.join("")
		: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
