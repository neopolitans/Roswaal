/**
 * Every requirement in the specification on one page, by chapter, with
 * whether Roswaal meets each: the list to read an implementation against, and
 * to proofread the specification by. Generated from the chapters, so it
 * cannot list a requirement they no longer make.
 */

import type { Block, DocPage, ReqStatus } from "../site.js";
import { informative, REQ_STATUS_LABELS, reqAnchor } from "./spec.js";

type Req = Block & { t: "req" };

export function requirementsPage(chapters: readonly DocPage[]): DocPage {
	const byChapter = chapters
		.map((page) => ({ page, reqs: page.blocks.filter((b): b is Req => b.t === "req") }))
		.filter((c) => c.reqs.length > 0);
	const all = byChapter.flatMap((c) => c.reqs);
	const count = (status: ReqStatus) => all.filter((r) => r.roswaal === status).length;

	return {
		slug: "technical/requirements",
		title: "All requirements",
		summary: "Every requirement in the specification, by chapter, and whether Roswaal meets it.",
		spec: informative(),
		blocks: [
			{
				t: "p",
				text:
					"Each requirement is numbered for the section it is in: **5.8-R3** is the third in " +
					"§5.8. A number never moves once published, so it can be cited; one that is taken " +
					"out leaves its number unused. Each links to where the chapter states it.",
			},
			{
				t: "table",
				head: ["Roswaal", "Requirements"],
				rows: [
					[REQ_STATUS_LABELS.meets, String(count("meets"))],
					[REQ_STATUS_LABELS.partly, String(count("partly"))],
					[REQ_STATUS_LABELS["not-yet"], String(count("not-yet"))],
					["**All**", `**${all.length}**`],
				],
			},
			...byChapter.flatMap(({ page, reqs }): Block[] => [
				{ t: "h", level: 2, text: page.title },
				{
					t: "table",
					head: ["Number", "Requirement", "Roswaal"],
					rows: reqs.map((r) => [
						`[${r.id}](${page.slug}#${reqAnchor(r.id)})`,
						r.text,
						r.gap ? `${REQ_STATUS_LABELS[r.roswaal]}. ${r.gap}` : REQ_STATUS_LABELS[r.roswaal],
					]),
				},
			]),
		],
	};
}
