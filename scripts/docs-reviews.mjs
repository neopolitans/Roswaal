/**
 * Where every documentation page stands: pending, reviewed or verified.
 *
 * Run with `npm run docs:reviews`, or `-- --nodes` to list node pages one by
 * one as well as count them. The ledger itself is `src/core/docs/reviews.ts`;
 * this only reports it. Reviewed and verified pages are listed oldest review
 * first, because the oldest is the next one due.
 */

import { REVIEW_LABELS } from "../src/core/docs/reviews.ts";
import { buildSite } from "../src/core/docs/site.ts";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.ts";

const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
const pages = site.sections.flatMap((section) => section.pages);
const listNodes = process.argv.includes("--nodes");

for (const status of ["pending", "reviewed", "verified"]) {
	const here = pages
		.filter((page) => page.review?.status === status)
		.sort((a, b) => (a.review?.date ?? "").localeCompare(b.review?.date ?? ""));
	const guides = here.filter((page) => !page.nodeId);
	const nodes = here.filter((page) => page.nodeId);

	console.log(`${REVIEW_LABELS[status]}: ${guides.length} guide pages, ${nodes.length} node pages`);
	for (const page of [...guides, ...(listNodes ? nodes : [])]) {
		const review = page.review;
		const when = review?.date ? `  ${review.date}` : "";
		console.log(`  ${page.slug.padEnd(34)} ${page.title}${when}`);
		if (review?.verify) console.log(`  ${"".padEnd(34)} to verify: ${review.verify}`);
	}
	console.log("");
}
