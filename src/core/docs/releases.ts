/**
 * Release notes.
 *
 * Hand-written, because "what changed and why it matters to you" is a judgement
 * a generator cannot make — a commit log is a record of work, not a record of
 * consequences. But the newest entry's version is checked against
 * `version.json` by a test, so the notes cannot silently fall a release behind
 * the thing they claim to describe.
 *
 * The rule for writing one: **an entry earns its place by changing what a
 * reader would do.** A refactor with no visible effect does not go here. A
 * behaviour that used to be one thing and is now another always does, even when
 * the change was a fix, because somebody has built a habit on the old one.
 *
 * And an entry **describes the change, it does not argue for it**. Saying a
 * behaviour is intentional is fair when a reader would otherwise report it as a
 * bug; explaining why it was chosen, what the alternative was, or what the
 * trade-off cost is not. That reasoning lives in `NOTES.md`, which is where
 * somebody goes when they want it — rather than being put in front of everyone
 * who opened a changelog to find out what is different.
 */

import { RELEASES_0_0 } from "./releases/minor0.js";
import { RELEASES_0_10 } from "./releases/minor10.js";
import { RELEASES_0_20 } from "./releases/minor20.js";
import { RELEASES_0_30 } from "./releases/minor30.js";
import { RELEASES_0_40 } from "./releases/minor40.js";
import { RELEASES_0_50 } from "./releases/minor50.js";
import { RELEASES_0_60 } from "./releases/minor60.js";
import { RELEASES_0_70 } from "./releases/minor70.js";
import { RELEASES_0_80 } from "./releases/minor80.js";
import { RELEASES_0_90 } from "./releases/minor90.js";
import { RELEASES_0_100 } from "./releases/minor100.js";
import { RELEASES_0_110 } from "./releases/minor110.js";

/**
 * A part of the tool a release can say it touched.
 *
 * Here rather than beside the other tags in `releaseTags.ts` because that file
 * imports this one and not the other way round — a type-only cycle compiles
 * and is still a cycle to read.
 */
export type ReleaseSurface = "editor" | "designer" | "docs";

export interface Release {
	version: string;
	/** ISO date. Absolute, so it still means something in six months. */
	date: string;
	/** One line: what this release is about. */
	headline: string;
	added?: string[];
	changed?: string[];
	fixed?: string[];
	/** Behaviour somebody may have relied on that now works differently. */
	watch?: string[];
	/**
	 * Slugs of documentation pages marked Reviewed or Verified in this release,
	 * listed under their own headings as links. Slugs rather than titles so a
	 * renamed page cannot leave an entry naming something that is gone; a test
	 * holds each one against `REVIEWS`.
	 */
	reviewed?: string[];
	verified?: string[];
	/**
	 * Set when upgrading can break working code, which is the one thing the tags
	 * on a release cannot work out for themselves: Feature, Change and Bugfix
	 * follow from whether `added`, `changed` and `fixed` have entries, but
	 * whether a change breaks somebody is a judgement about *their* code.
	 *
	 * Not the same as `watch`, which is often just worth knowing. This is for
	 * "something that worked will stop".
	 */
	breaking?: boolean;
	/**
	 * Which surfaces this release touched: the editor, Node Design, the
	 * documentation.
	 *
	 * Stated rather than derived, because no shape of a release note says which
	 * part of the tool changed. Absent means *not stated*, not *not affected*:
	 * the oldest releases do not state it.
	 *
	 * The point of it is a reader scanning for one thing. Somebody who only
	 * writes graphs does not need to read a Designer release, and somebody
	 * keeping a fork's documentation in step needs exactly the Docs ones.
	 */
	affects?: ReleaseSurface[];
}

/**
 * What this version is about, in one line.
 *
 * A hand-written line about a moment cannot describe the version beside it
 * for long. Every release already writes a `headline`, which is the same
 * sentence for the same purpose, so the front page's footer reads that
 * instead of carrying its own copy.
 *
 * Falls back to nothing rather than to a guess: a version with no entry is a
 * build from between releases, and a footer that named the previous release's
 * headline beside this one's number would be worse than a footer that says
 * only the number.
 */
export function taglineFor(version: string): string | undefined {
	return RELEASES.find((release) => release.version === version)?.headline;
}

/**
 * Newest first: each file is newest first, and the files are in order of
 * their minor versions, newest first.
 *
 * A new release goes at the top of the newest file. The first release of a
 * new tenth — 0.120.0 — starts `releases/minor120.ts`, spread in above the
 * rest.
 */
export const RELEASES: Release[] = [
	...RELEASES_0_110,
	...RELEASES_0_100,
	...RELEASES_0_90,
	...RELEASES_0_80,
	...RELEASES_0_70,
	...RELEASES_0_60,
	...RELEASES_0_50,
	...RELEASES_0_40,
	...RELEASES_0_30,
	...RELEASES_0_20,
	...RELEASES_0_10,
	...RELEASES_0_0,
];
