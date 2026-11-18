/**
 * Version numbers from 1.0: semver, with canary builds as prereleases of the
 * release they lead to. Everything that orders, groups or links versions reads
 * them through `src/core/version.ts`.
 */

import { describe, expect, it } from "vitest";

import { newerVersion } from "../src/app/releaseNotes.js";
import { minorView } from "../src/core/docs/pages/releaseNotes.js";
import { releaseBlockHtml } from "../src/core/docs/releaseHtml.js";
import { RELEASES, type Release } from "../src/core/docs/releases.js";
import { releasePageSlug } from "../src/core/docs/site.js";
import {
	compareVersions,
	isCanary,
	minorOf,
	parseVersion,
	releaseOf,
} from "../src/core/version.js";
import manifest from "../version.json" with { type: "json" };

describe("reading a version", () => {
	it("reads a stable release and a canary build", () => {
		expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
		expect(parseVersion("1.2.0-canary.4")).toEqual({ major: 1, minor: 2, patch: 0, canary: 4 });
	});

	it("refuses anything else", () => {
		for (const text of [
			"1.2",
			"v1.2.3",
			"1.2.3-beta.1",
			"1.2.3-canary",
			"1.2.3-canary.0",
			"01.2.3",
			"",
		])
			expect(parseVersion(text), text).toBeUndefined();
	});

	it("names the minor version and the release a canary build leads to", () => {
		expect(minorOf("1.1.0-canary.3")).toBe("1.1");
		expect(minorOf("0.144.3")).toBe("0.144");
		expect(releaseOf("1.1.0-canary.3")).toBe("1.1.0");
		expect(releaseOf("1.1.2")).toBe("1.1.2");
		expect(isCanary("1.1.0-canary.3")).toBe(true);
		expect(isCanary("1.1.0")).toBe(false);
		expect(releasePageSlug("1.1.0-canary.3")).toBe("release-notes/1.1");
	});
});

describe("ordering versions", () => {
	it("puts a canary build before its release, and builds in number order", () => {
		const sorted = [
			"1.1.0",
			"0.265.0",
			"1.1.0-canary.10",
			"1.0.0",
			"1.1.0-canary.2",
			"1.0.1-canary.1",
			"1.0.0-canary.1",
		].sort(compareVersions);
		expect(sorted).toEqual([
			"0.265.0",
			"1.0.0-canary.1",
			"1.0.0",
			"1.0.1-canary.1",
			"1.1.0-canary.2",
			"1.1.0-canary.10",
			"1.1.0",
		]);
	});

	it("tells what is new since a visit, and ignores what is not a version", () => {
		expect(newerVersion("1.1.0", "1.1.0-canary.3")).toBe(true);
		expect(newerVersion("1.1.0-canary.10", "1.1.0-canary.9")).toBe(true);
		expect(newerVersion("1.0.0-canary.1", "0.265.0")).toBe(true);
		expect(newerVersion("1.1.0-canary.3", "1.1.0")).toBe(false);
		expect(newerVersion("1.1.0", "not a version")).toBe(false);
	});
});

describe("the release notes' versions", () => {
	it("are all versions, newest first, the newest being version.json's", () => {
		for (const release of RELEASES)
			expect(parseVersion(release.version), release.version).toBeDefined();
		for (let i = 1; i < RELEASES.length; i++)
			expect(
				compareVersions(RELEASES[i - 1].version, RELEASES[i].version),
				`${RELEASES[i - 1].version} before ${RELEASES[i].version}`,
			).toBeGreaterThan(0);
		expect(RELEASES[0].version).toBe(manifest.version);
	});
});

describe("a minor version with canary builds", () => {
	const release = (version: string, extra: Partial<Release> = {}): Release => ({
		version,
		date: "2026-12-01",
		headline: `${version} headline`,
		...extra,
	});
	const releases: Release[] = [
		release("1.1.1-canary.1", { fixed: ["**Next fix.**"] }),
		release("1.1.0", { security: true }),
		release("1.1.0-canary.10", { added: ["**Ten.**"] }),
		release("1.1.0-canary.2", { fixed: ["**Two.**"] }),
	];
	const view = minorView("1.1", releases, new Map());

	it("lists a release's canary builds under it, and a build with no release yet as itself", () => {
		expect(view.releases.map((r) => r.version)).toEqual(["1.1.1-canary.1", "1.1.0"]);
		expect(view.releases[1].builds?.map((b) => b.version)).toEqual([
			"1.1.0-canary.10",
			"1.1.0-canary.2",
		]);
		expect(view.releases[1].tags).toEqual(["security", "feature", "fix"]);
	});

	it("reads a build's lines as the release they shipped in", () => {
		const added = view.sections.find((s) => s.kind === "added")?.entries;
		expect(added).toEqual([{ version: "1.1.0", build: "1.1.0-canary.10", text: "**Ten.**" }]);
		const fixed = view.sections.find((s) => s.kind === "fixed")?.entries;
		expect(fixed?.map((e) => e.version)).toEqual(["1.1.1-canary.1", "1.1.0"]);
		expect(fixed?.[0].build).toBeUndefined();
	});

	it("takes its headline from the .0 release, not a build numbered 10", () => {
		expect(view.headline).toBe("1.1.0 headline");
	});

	it("draws the builds folded, each linkable, and lines lit by their release", () => {
		const html = releaseBlockHtml({ t: "releaseMinor", minor: view }, (slug) => slug);
		expect(html).toContain(
			'<details class="docs-release-builds"><summary>2 canary builds</summary>',
		);
		expect(html).toContain('id="v1.1.0-canary.10"');
		expect(html).toContain('data-version="1.1.0-canary.10" data-release="1.1.0"');
	});
});
