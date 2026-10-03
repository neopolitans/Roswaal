/**
 * The tags under a release's version number: what kind of change it was, and
 * which surface it touched. Derived from the release wherever they can be.
 */

import type { Release, ReleaseSurface } from "./releases.js";
import type { ReleaseTag } from "./site.js";

export const SURFACES: readonly ReleaseSurface[] = ["editor", "designer", "docs"];

export const TAG_LABELS: Record<ReleaseTag, string> = {
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
 * `breaking` is the exception and comes from the release, because whether a
 * change breaks somebody is a judgement about their code rather than a fact
 * about ours.
 */
export function releaseTags(release: Release): ReleaseTag[] {
	const tags: ReleaseTag[] = [];
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
