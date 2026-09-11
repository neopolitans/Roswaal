/**
 * Review badges on documentation pages.
 *
 * The ledger is hand-written and keyed by slug, so the thing that goes wrong is
 * a slug that no longer names a page -- a review quietly attached to nothing --
 * and a page that renders without saying where it stands.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { allPages, buildSite, findPage } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import {
	formatReviewDate, REVIEW_DETAILS, REVIEW_LABELS, REVIEWS, reviewLine, reviewOf,
} from "../src/core/docs/reviews.js";
import type { NodeDef } from "../src/core/schema.js";

const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));
const site = buildSite(createRegistry(), builtinIds);

describe("page reviews", () => {
	it("gives every built-in page a review", () => {
		for (const page of allPages(site)) {
			expect(page.review, page.slug).toBeDefined();
		}
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

	it("has a label and a meaning for every status", () => {
		for (const status of ["pending", "reviewed", "verified"] as const) {
			expect(REVIEW_LABELS[status]).not.toBe("");
			expect(REVIEW_DETAILS[status]).not.toBe("");
		}
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

	it("puts the badge by the title and the line at the foot of a static page", () => {
		const page = findPage(site, "wires-and-pins")!;
		const html = renderPage(site, { ...page, review: { status: "reviewed", date: "2026-09-11" } }, {
			version: "test",
		});
		expect(html).toMatch(/<h1>Wires and pins<span class="badge review reviewed"[^>]*>Reviewed<\/span><\/h1>/);
		expect(html).toContain(`<p class="docs-reviewed">Last reviewed 11 September 2026</p>`);
	});
});
