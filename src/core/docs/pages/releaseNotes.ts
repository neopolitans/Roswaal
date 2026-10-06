/**
 * The release notes: a front page, and a page for each minor version.
 *
 * One page held every release once, and with three hundred of them it was a
 * long walk to anything but the newest. So each minor version -- 0.144.0 to
 * 0.144.4 -- is a page of its own, its releases read together with every line
 * saying which one it shipped in; the contents list the recent few, and a
 * versions dropdown reaches the rest. `buildSite` places them.
 */

import { RELEASES, type Release } from "../releases.js";
import { releaseTags } from "../releaseTags.js";
import {
	type Block,
	type DocPage,
	type MinorRow,
	type MinorView,
	type ReleaseTag,
	releasePageSlug,
	type Shipped,
	type VersionChoice,
} from "../site.js";

/** How many minor versions the contents and the front page show. Older ones are in the dropdown. */
export const RECENT_MINORS = 5;

/**
 * Roswaal became something other people could run at 0.59.2.
 *
 * Everything before it was written while nobody else could, and reads that
 * way: entries about decisions nobody had to live with yet. It is kept, because
 * the reasoning is still the reasoning behind the tool, and grouped last in the
 * dropdown, apart, because somebody after what changed last week should not
 * have to step over two years of a private project to find it.
 */
const PUBLIC_FROM: [number, number] = [0, 59];

/** `0.144`, the minor version a release belongs to. */
export function minorOf(version: string): string {
	return version.split(".").slice(0, 2).join(".");
}

function isPrePublic(minor: string): boolean {
	const [major, second] = minor.split(".").map((part) => Number.parseInt(part, 10));
	return major < PUBLIC_FROM[0] || (major === PUBLIC_FROM[0] && second < PUBLIC_FROM[1]);
}

/** Every release by its minor version, both newest first, as `RELEASES` is. */
export function byMinor(releases: readonly Release[] = RELEASES): Map<string, Release[]> {
	const out = new Map<string, Release[]>();
	for (const release of releases) {
		const minor = minorOf(release.version);
		out.set(minor, [...(out.get(minor) ?? []), release]);
	}
	return out;
}

/** Tags in the order one release's come in, whichever releases they came from. */
function tagsOf(releases: readonly Release[]): ReleaseTag[] {
	const all = new Set(releases.flatMap(releaseTags));
	const order: ReleaseTag[] = [
		"security",
		"breaking",
		"feature",
		"change",
		"fix",
		"editor",
		"designer",
		"docs",
	];
	return order.filter((tag) => all.has(tag));
}

/**
 * A minor version's releases as one view, every line carrying the release it
 * shipped in. `releases` newest first.
 */
export function minorView(
	minor: string,
	releases: readonly Release[],
	titles: ReadonlyMap<string, string>,
	latest = false,
): MinorView {
	const shipped = (pick: (r: Release) => readonly string[] | undefined): Shipped[] =>
		releases.flatMap((r) => (pick(r) ?? []).map((text) => ({ version: r.version, text })));
	const link = (slug: string) => `[${titles.get(slug) ?? slug}](${slug})`;
	const first = releases.find((r) => r.version.endsWith(".0")) ?? releases[releases.length - 1];
	const sections = (
		[
			["added", "Added", shipped((r) => r.added)],
			["changed", "Changed", shipped((r) => r.changed)],
			["fixed", "Fixed", shipped((r) => r.fixed)],
		] as const
	)
		.filter(([, , entries]) => entries.length > 0)
		.map(([kind, heading, entries]) => ({ kind, heading, entries }));
	const articles = (
		[
			["Reviewed Articles", shipped((r) => r.reviewed?.map(link))],
			["Verified Articles", shipped((r) => r.verified?.map(link))],
		] as const
	)
		.filter(([, links]) => links.length > 0)
		.map(([heading, links]) => ({ heading, links }));
	return {
		minor,
		slug: releasePageSlug(releases[0].version),
		headline: first.headline,
		...(latest ? { latest: true } : {}),
		...(releases.some((r) => r.security) ? { security: true } : {}),
		tags: tagsOf(releases),
		from: releases[releases.length - 1].date,
		to: releases[0].date,
		releases: releases.map((r, i) => ({
			version: r.version,
			date: r.date,
			headline: r.headline,
			tags: releaseTags(r),
			...(latest && i === 0 ? { latest: true } : {}),
		})),
		watch: shipped((r) => r.watch),
		sections,
		articles,
	};
}

/** `0.140–0.144`: ten minor versions to a group in the dropdown. */
function tensOf(minor: string): string {
	const [major, second] = minor.split(".").map((part) => Number.parseInt(part, 10));
	const low = Math.floor(second / 10) * 10;
	return `${major}.${low}–${major}.${low + 9}`;
}

/** Every minor version for the dropdown: newest first, by tens, the early notes apart and last. */
export function versionChoices(minors: Map<string, Release[]>): VersionChoice[] {
	const groups = new Map<string, VersionChoice["items"]>();
	const early: VersionChoice["items"] = [];
	for (const [minor, releases] of minors) {
		const item = {
			minor,
			slug: releasePageSlug(releases[0].version),
			newest: releases[0].version,
			...(releases.some((r) => r.security) ? { security: true } : {}),
		};
		if (isPrePublic(minor)) early.push(item);
		else groups.set(tensOf(minor), [...(groups.get(tensOf(minor)) ?? []), item]);
	}
	const out = [...groups].map(([label, items]) => ({ label, items }));
	if (early.length > 0) out.push({ label: "Before Roswaal was public", items: early });
	return out;
}

/**
 * The release notes' pages: the front page first, then one per minor version,
 * newest first. Only the recent few are listed in the contents.
 */
export function releaseNotesPages(titles: ReadonlyMap<string, string>): DocPage[] {
	const minors = byMinor();
	const entries = [...minors];
	const latest = RELEASES[0].version;
	const groups = versionChoices(minors);
	const versions = (current?: string): Block => ({
		t: "releaseVersions",
		...(current ? { current } : {}),
		latest,
		groups,
	});
	const label = (minor: string) => `${minor}.x`;

	const pages: DocPage[] = entries.map(([minor, releases], i) => {
		const newer = entries[i - 1];
		const older = entries[i + 1];
		const view = minorView(minor, releases, titles, i === 0);
		return {
			slug: view.slug,
			title: label(minor),
			summary: view.headline,
			releaseNewest: releases[0].version,
			narrow: true,
			...(i < RECENT_MINORS && !isPrePublic(minor) ? {} : { unlisted: true }),
			blocks: [
				versions(minor),
				{ t: "releaseMinor", minor: view },
				{
					t: "releasePager",
					...(newer
						? {
								newer: { slug: releasePageSlug(newer[1][0].version), label: label(newer[0]) },
							}
						: {}),
					...(older
						? {
								older: { slug: releasePageSlug(older[1][0].version), label: label(older[0]) },
							}
						: {}),
				},
			],
		};
	});

	const [[newestMinor, newestReleases], ...rest] = entries;
	const rows: MinorRow[] = rest.slice(0, RECENT_MINORS - 1).map(([minor, releases]) => ({
		minor,
		slug: releasePageSlug(releases[0].version),
		headline: minorView(minor, releases, titles).headline,
		newest: releases[0].version,
		date: releases[0].date,
		...(releases.some((r) => r.security) ? { security: true } : {}),
	}));
	const front: DocPage = {
		slug: "release-notes",
		title: "Release notes",
		summary: "What changed in each version, newest first.",
		releaseNewest: latest,
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"What changed, and what it changes for you. An entry earns its place by " +
					"altering what a reader would do — a refactor with no visible effect is not here.",
			},
			versions(),
			{
				t: "releaseMinor",
				minor: minorView(newestMinor, newestReleases, titles, true),
				link: true,
			},
			{ t: "releaseRows", rows },
		],
	};
	return [front, ...pages];
}
