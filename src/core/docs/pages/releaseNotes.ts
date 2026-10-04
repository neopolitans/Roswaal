/**
 * The `release-notes` page of the documentation. `buildSite` places it.
 */

import { RELEASES, type Release } from "../releases.js";
import { releaseTags } from "../releaseTags.js";
import type { Block, DocPage, ReleaseView } from "../site.js";

/** One release as its card: `release` blocks are drawn by both renderers. */
function releaseView(
	release: Release,
	titles: ReadonlyMap<string, string>,
	latest = false,
): ReleaseView {
	// One entry per row rather than per bullet. A release note is a list of
	// separate claims, and a rule between them reads as separate in a way a
	// dot does not once an entry runs to four lines -- which they do.
	const sections = (
		[
			["added", "Added", release.added],
			["changed", "Changed", release.changed],
			["fixed", "Fixed", release.fixed],
		] as const
	)
		.filter(([, , entries]) => entries && entries.length > 0)
		.map(([kind, heading, entries]) => ({ kind, heading, entries: [...(entries ?? [])] }));
	// Articles a person read, or checked end to end, in this release.
	const articles = (
		[
			["Reviewed Articles", release.reviewed],
			["Verified Articles", release.verified],
		] as const
	)
		.filter(([, slugs]) => slugs && slugs.length > 0)
		.map(([heading, slugs]) => ({
			heading,
			links: (slugs ?? []).map((slug) => `[${titles.get(slug) ?? slug}](${slug})`),
		}));
	return {
		version: release.version,
		date: release.date,
		headline: release.headline,
		...(latest ? { latest: true } : {}),
		tags: releaseTags(release),
		...(release.watch ? { watch: release.watch } : {}),
		sections,
		articles,
	};
}

/** `0.122.x`, the fold a version belongs to. */
const minorOf = (version: string): string => version.split(".").slice(0, 2).join(".") + ".x";

/** `0.12x`, the range of ten minor versions the jump bar groups it under. */
function rangeOf(minor: string): string {
	const [major, second] = minor.split(".");
	return `${major}.${second.length > 1 ? second.slice(0, -1) : "0"}x`;
}

export function releaseNotesPage(titles: ReadonlyMap<string, string>): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"What changed, and what it changes for you. An entry earns its place by " +
				"altering what a reader would do — a refactor with no visible effect is not here.",
		},
	];

	/**
	 * Roswaal became something other people could run at 0.59.2.
	 *
	 * Everything before it was written while nobody else could, and reads that
	 * way: entries about decisions nobody had to live with yet. It is kept,
	 * because the reasoning is still the reasoning behind the tool -- and hidden
	 * by default, because somebody looking for what changed last week should
	 * not scroll two years of a private project to find it.
	 */
	const PUBLIC_FROM = [0, 59];
	const isPreRelease = (minor: string): boolean => {
		const [major, second] = minor.split(".").map((part) => Number.parseInt(part, 10));
		if (!Number.isFinite(major) || !Number.isFinite(second)) return false;
		return major < PUBLIC_FROM[0] || (major === PUBLIC_FROM[0] && second < PUBLIC_FROM[1]);
	};

	// The latest release is a card of its own at the top; every other folds
	// into its minor version -- 0.29.x, 0.28.x -- newest first. A reader after
	// a particular version finds it by major and minor, and each fold says what
	// that minor version was, closed.
	const [latest, ...rest] = RELEASES;
	const minors = new Map<string, Release[]>();
	for (const release of rest) {
		const minor = minorOf(release.version);
		minors.set(minor, [...(minors.get(minor) ?? []), release]);
	}

	// The jump bar: one link per ten minor versions, to the newest fold in it,
	// named by the versions it spans -- "0.100–0.109", where "0.10x" read as
	// the tens.
	const groups = new Map<string, string[]>();
	for (const minor of minors.keys()) {
		const key = rangeOf(minor);
		groups.set(key, [...(groups.get(key) ?? []), minor]);
	}
	const bare = (minor: string) => minor.replace(/\.x$/, "");
	const ranges = [...groups.values()].map((group) => {
		const newest = group[0];
		const oldest = group[group.length - 1];
		return {
			label: newest === oldest ? bare(newest) : `${bare(oldest)}–${bare(newest)}`,
			target: `releases-${newest}`,
			...(isPreRelease(newest) ? { prerelease: true } : {}),
		};
	});

	blocks.push(
		{
			t: "toggle",
			pref: "showPreReleaseNotes",
			label: "Show the notes from before Roswaal was public",
			hint:
				"Everything up to 0.59.1, written while nobody else could run it. Kept because the " +
				"reasoning in it is still the reasoning behind the tool.",
		},
		{ t: "releaseTools", ranges },
		{ t: "release", release: releaseView(latest, titles, true) },
	);

	for (const [minor, releases] of minors) {
		// What the minor version brought: its .0's headline, or its oldest's.
		const first = releases.find((r) => r.version.endsWith(".0")) ?? releases[releases.length - 1];
		blocks.push({
			t: "details",
			summary: minor,
			sub: first.headline,
			id: `releases-${minor}`,
			aside: `${releases.length} ${releases.length === 1 ? "release" : "releases"} · ${releases[0].date}`,
			...(isPreRelease(minor) ? { prerelease: true } : {}),
			blocks: releases.map((release) => ({ t: "release", release: releaseView(release, titles) })),
		});
	}

	return {
		slug: "release-notes",
		title: "Release notes",
		summary: "What changed in each version, newest first.",
		narrow: true,
		blocks,
	};
}
