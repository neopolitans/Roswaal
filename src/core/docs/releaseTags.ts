/**
 * The tags under a release's version number: what kind of change it was, and
 * which surface it touched. Derived from the release wherever they can be.
 */

import type { Release, ReleaseSurface } from "./releases.js";
import type { ReleaseTag } from "./site.js";

export const SURFACES: readonly ReleaseSurface[] = ["editor", "designer", "docs"];

export const TAG_LABELS: Record<ReleaseTag, string> = {
	security: "Security",
	feature: "Feature",
	change: "Change",
	fix: "Bugfix",
	breaking: "Breaking change",
	docs: "Docs",
	editor: "Editor",
	designer: "Designer",
};

/**
 * What to tag a release, from what it actually contains.
 *
 * Derived, so a tag cannot claim something the entries below it do not show.
 * `breaking` and `security` are the exceptions and come from the release,
 * because whether a change breaks somebody, or closes a way in, is a judgement
 * rather than a fact about the shape of the note. They go first: they are what
 * somebody deciding whether to upgrade looks for.
 */
export function releaseTags(release: Release): ReleaseTag[] {
	const tags: ReleaseTag[] = [];
	if (release.security) tags.push("security");
	if (release.breaking) tags.push("breaking");
	if (release.added?.length) tags.push("feature");
	if (release.changed?.length) tags.push("change");
	if (release.fixed?.length) tags.push("fix");
	// The surfaces last, and in one order however they were listed: a tag row
	// that reshuffles between releases is a row you read twice.
	for (const surface of SURFACES) {
		if (release.affects?.includes(surface)) tags.push(surface);
	}
	return tags;
}
