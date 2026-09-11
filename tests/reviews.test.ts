/**
 * Review badges on documentation pages.
 *
 * The ledger is hand-written and keyed by slug, so the thing that goes wrong is
 * a slug that no longer names a page -- a review quietly attached to nothing --
 * and a page that renders without saying where it stands.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { allPages, blockText, buildSite, findPage, type Block } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import {
	formatReviewDate, GITHUB_HANDLE, REVIEW_DETAILS, REVIEW_LABELS, REVIEWS, reviewLine, reviewOf,
} from "../src/core/docs/reviews.js";
import { RELEASES } from "../src/core/docs/releases.js";
import type { NodeDef } from "../src/core/schema.js";

const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));
const site = buildSite(createRegistry(), builtinIds);

describe("page reviews", () => {
	it("gives every built-in page a review but the release notes", () => {
		for (const page of allPages(site)) {
			if (page.slug === "release-notes") continue;
			expect(page.review, page.slug).toBeDefined();
		}
	});

	it("leaves the release notes without a badge or a footer", () => {
		const notes = findPage(site, "release-notes")!;
		expect(notes.review).toBeUndefined();
		const html = renderPage(site, notes, { version: "test" });
		expect(html).not.toContain("docs-status");
		expect(html).not.toContain("docs-reviewed");
	});

	it("leaves a node pack's pages out", () => {
		const pack: NodeDef = {
			id: "mypack.thing", title: "Thing", category: "Math",
			pure: true, inputs: [], outputs: [{ id: "result", name: "", kind: "data", type: "number" }],
			compilesTo: { kind: "expr", outputs: { result: "1" } },
		};
		const withPack = buildSite(createRegistry([pack]), builtinIds);
		expect(findPage(withPack, "node/mypack.thing")!.review).toBeUndefined();
	});

	it("counts a page nobody has listed as pending", () => {
		expect(reviewOf("no-such-page")).toEqual({ status: "pending" });
	});

	it("lists only pages that exist, each with a date", () => {
		for (const [slug, review] of Object.entries(REVIEWS)) {
			expect(findPage(site, slug), `REVIEWS names "${slug}", which is not a page`).toBeDefined();
			expect(review.date, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	/**
	 * A release that says it verified a page has to be telling the truth about
	 * the ledger, or the two will drift the first time either is edited.
	 */
	it("agrees with the release notes about what was reviewed and verified", () => {
		for (const release of RELEASES) {
			for (const slug of release.reviewed ?? []) {
				expect(findPage(site, slug), `${release.version} reviewed "${slug}"`).toBeDefined();
				expect(["reviewed", "verified"], slug).toContain(REVIEWS[slug]?.status);
			}
			for (const slug of release.verified ?? []) {
				expect(findPage(site, slug), `${release.version} verified "${slug}"`).toBeDefined();
				expect(REVIEWS[slug]?.status, slug).toBe("verified");
			}
		}
	});

	it("lists the articles as links in the release notes", () => {
		const notes = findPage(site, "release-notes")!;
		const tableRows = (blocks: Block[]): string[] =>
			blocks.flatMap((b) =>
				b.t === "table" ? b.rows.flat() : b.t === "details" ? tableRows(b.blocks) : [],
			);
		const rows = tableRows(notes.blocks);
		expect(rows).toContain("[Wires and pins](wires-and-pins)");
		expect(rows).toContain("[Coming from Blueprints](coming-from-blueprints)");
	});

	it("has a label and a meaning for every status", () => {
		for (const status of ["pending", "reviewed", "verified"] as const) {
			expect(REVIEW_LABELS[status]).not.toBe("");
			expect(REVIEW_DETAILS[status]).not.toBe("");
		}
	});
});

describe("reviewers", () => {
	it("names every reviewer by a real GitHub account name", () => {
		for (const [slug, review] of Object.entries(REVIEWS)) {
			for (const handle of review.reviewers ?? []) {
				expect(handle, `${slug} credits "${handle}"`).toMatch(GITHUB_HANDLE);
			}
		}
	});

	it("credits them in the foot of the page, as links", () => {
		expect(reviewLine({ status: "reviewed", date: "2026-09-11", reviewers: ["octocat"] }))
			.toBe("Last reviewed 11 September 2026 by [@octocat](https://github.com/octocat)");
		expect(reviewLine({ status: "verified", date: "2026-09-11", reviewers: ["a", "b", "c"] }))
			.toContain("[@a](https://github.com/a), [@b](https://github.com/b) and [@c](https://github.com/c)");
	});

	it("renders the credit as a link on the static site", () => {
		const page = findPage(site, "wires-and-pins")!;
		const html = renderPage(
			site,
			{ ...page, review: { status: "verified", date: "2026-09-11", reviewers: ["octocat"] } },
			{ version: "test" },
		);
		expect(html).toContain(`<a href="https://github.com/octocat" rel="noreferrer noopener">@octocat</a>`);
	});

	it("lists reviewers on Contributing, or says there are none yet", () => {
		const text = blockText({ t: "p", text: "" }) + findPage(site, "contributing")!.blocks.map(blockText).join(" ");
		expect(text).toContain("Reviewers");
		expect(text).toMatch(/Nobody is credited yet|@\w/);
	});
});

describe("the last-reviewed line", () => {
	it("writes a date the way GOV.UK does", () => {
		expect(formatReviewDate("2026-09-11")).toBe("11 September 2026");
		expect(formatReviewDate("2027-01-02")).toBe("2 January 2027");
	});

	it("says when a page was read, or that it has not been", () => {
		expect(reviewLine({ status: "pending" })).toBe("Not reviewed yet");
		expect(reviewLine({ status: "verified", date: "2026-09-11" }))
			.toBe("Last reviewed 11 September 2026");
	});

	it("puts the badge under the summary and the line at the foot of a static page", () => {
		const page = findPage(site, "wires-and-pins")!;
		const html = renderPage(site, { ...page, review: { status: "reviewed", date: "2026-09-11" } }, {
			version: "test",
		});
		expect(html).toContain("<h1>Wires and pins</h1>");
		expect(html).toMatch(
			/<p class="summary">[^<]*<\/p>\n<p class="docs-status"><span class="badge review reviewed"[^>]*>Reviewed<\/span><\/p>/,
		);
		expect(html).toContain(`<p class="docs-reviewed">Last reviewed 11 September 2026</p>`);
		expect(html).not.toContain("docs-verify");
	});

	it("says what a verified pass still needs, under the date", () => {
		const page = findPage(site, "coming-from-blueprints")!;
		const html = renderPage(site, page, { version: "test" });
		expect(html).toMatch(
			/<p class="docs-reviewed">.*?<\/p>\n<p class="docs-verify"><strong>To verify:<\/strong> [^\n]*Networking/,
		);
	});
});
