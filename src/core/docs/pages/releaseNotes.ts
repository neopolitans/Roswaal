/**
 * The `release-notes` page of the documentation. `buildSite` places it.
 */

import { type Release, RELEASES } from "../releases.js";
import { releaseTags } from "../releaseTags.js";
import type { Block, DocPage } from "../site.js";

/**
 * One release: its version headed at `level`, and its sections a level below.
 * 2 and 3 for the release shown in full; 3 and 4 inside a fold.
 */
function releaseBlocks(
	release: Release, titles: ReadonlyMap<string, string>, level: 2 | 3, latest = false,
): Block[] {
	const sub = level === 2 ? 3 : 4;
	const blocks: Block[] = [{
		t: "h", level, text: release.version, aside: release.date,
		...(latest ? { badge: "Latest" } : {}),
	}];

	const tags = releaseTags(release);
	if (tags.length > 0) blocks.push({ t: "tags", tags });

	blocks.push({ t: "p", text: release.headline });

	if (release.watch) {
		blocks.push({
			t: "note",
			kind: "warn",
			text: "**Worth knowing before you upgrade.**",
			items: release.watch,
		});
	}
	// One entry per row rather than per bullet. A release note is a list of
	// separate claims, and a rule between them reads as separate in a way a
	// dot does not once an entry runs to four lines — which they do.
	for (const [heading, entries] of [
		["Added", release.added],
		["Changed", release.changed],
		["Fixed", release.fixed],
	] as const) {
		if (!entries || entries.length === 0) continue;
		blocks.push({ t: "h", level: sub, text: heading });
		blocks.push({ t: "table", rows: entries.map((entry) => [entry]) });
	}
	// Articles a person read, or checked end to end, in this release.
	for (const [heading, slugs] of [
		["Reviewed Articles", release.reviewed],
		["Verified Articles", release.verified],
	] as const) {
		if (!slugs || slugs.length === 0) continue;
		blocks.push({ t: "h", level: sub, text: heading });
		blocks.push({
			t: "table",
			rows: slugs.map((slug) => [`[${titles.get(slug) ?? slug}](${slug})`]),
		});
	}
	return blocks;
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

	// Every release folds into its minor version — 0.29.x, 0.28.x — newest
	// first: a reader after a particular version finds it by major and minor,
	// and scrolling past twenty patch releases to get there had become most of
	// the page. The newest minor version starts open, so the current release is
	// read beside its siblings rather than apart from them, marked Latest.
	const minors = new Map<string, Release[]>();
	for (const release of RELEASES) {
		const minor = release.version.split(".").slice(0, 2).join(".") + ".x";
		minors.set(minor, [...(minors.get(minor) ?? []), release]);
	}
	/**
	 * Roswaal became something other people could run at 0.59.2.
	 *
	 * Everything before it was written while nobody else could, and reads that
	 * way: entries about decisions nobody had to live with yet. It is kept,
	 * because the reasoning is still the reasoning behind the tool — and hidden
	 * by default, because somebody looking for what changed last week should
	 * not scroll two years of a private project to find it.
	 */
	const PUBLIC_FROM = [0, 59];
	const isPreRelease = (minor: string): boolean => {
		const [major, second] = minor.split(".").map((part) => Number.parseInt(part, 10));
		if (!Number.isFinite(major) || !Number.isFinite(second)) return false;
		return major < PUBLIC_FROM[0] || (major === PUBLIC_FROM[0] && second < PUBLIC_FROM[1]);
	};

	blocks.push({
		t: "toggle",
		pref: "showPreReleaseNotes",
		label: "Show the notes from before Roswaal was public",
		hint:
			"Everything up to 0.59.1, written while nobody else could run it. Kept because the " +
			"reasoning in it is still the reasoning behind the tool.",
	});

	[...minors].forEach(([minor, releases], index) => {
		blocks.push({
			t: "details",
			summary: minor,
			aside: `${releases.length} ${releases.length === 1 ? "release" : "releases"} · ${releases[0].date}`,
			open: index === 0,
			...(isPreRelease(minor) ? { prerelease: true } : {}),
			blocks: releases.flatMap((release) =>
				releaseBlocks(release, titles, 3, release === RELEASES[0]),
			),
		});
	});

	return {
		slug: "release-notes",
		title: "Release notes",
		summary: "What changed in each version, newest first.",
		narrow: true,
		blocks,
	};
}
