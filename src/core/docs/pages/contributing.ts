/**
 * The `contributing` page of the documentation. `buildSite` places it.
 */

import { reviewerCounts, reviewerLink } from "../reviews.js";
import type { Block, DocPage } from "../site.js";

/**
 * How to work on Roswaal itself. Written from the repository's own scripts
 * and rules — `package.json`, the release-notes test, the review ledger — so
 * every instruction here is one a reader can check against the code.
 */
export function contributingPage(): DocPage {
	return {
		slug: "contributing",
		narrow: true,
		title: "Contributing",
		summary: "Building Roswaal, what a change brings with it, and where help is wanted.",
		blocks: [
			{
				t: "p",
				text:
					"Roswaal lives at [github.com/neopolitans/Roswaal](https://github.com/neopolitans/Roswaal). " +
					"It is 0BSD, and so is anything contributed to it.",
			},

			{ t: "h", level: 2, text: "Building it" },
			{
				t: "code",
				lang: "sh",
				text: [
					"npm install",
					"npm run dev          # the daemon and the editor, reloading as you edit",
					"npm test             # the test suite",
					"npm run typecheck",
					"npm run build        # themes, the editor and the command line",
					"npm run build:docs   # these docs, as a static site",
				].join("\n"),
			},

			{ t: "h", level: 2, text: "What a change brings with it" },
			{
				t: "ul",
				items: [
					"**Tests**, in `tests/`, run with `npm test`.",
					"**A release-notes entry** in `src/core/docs/releases.ts`, saying what changed, and the version bumped in `version.json` and `package.json`. A test fails when the notes and the version disagree.",
					"**The reasoning**, where a later reader will find it: a comment on the code it explains, and the pull request. The maintainer's working notes, the architecture map and the wording rules are kept out of the repository until they have been read through for publication.",
					"**Words that name the result.** A label, a heading or a message says what happened, not which rule produced it.",
				],
			},

			{ t: "h", level: 2, text: "Reviewing the docs" },
			{
				t: "p",
				text:
					"Every page starts as **Pending review**. Someone who has read it marks it " +
					"**Reviewed**; someone who has checked it against the editor end to end marks it " +
					"**Verified**. Both are dated entries in `src/core/docs/reviews.ts`, and a reviewed " +
					"page can say what a verified pass still needs.",
			},
			{
				t: "ul",
				items: [
					"`npm run docs:reviews` lists where every page stands, oldest review first.",
					"List the page under **Reviewed Articles** or **Verified Articles** in that release's notes. A test holds the two together.",
					"When a page changes enough to need reading again, take its entry out.",
				],
			},
			{
				t: "note",
				kind: "good",
				text:
					"**Every page has a Suggest an edit button at its foot.** It opens the page's text to " +
					"rewrite and sends it as a prefilled issue, from the published site or the editor.",
			},

			{ t: "h", level: 2, text: "Where help is wanted" },
			{
				t: "note",
				kind: "good",
				text:
					"**Lune comes first.** Lune bugfixes and features are prioritized where feasible; " +
					"Roblox Studio ones are still considered.",
			},
			{
				t: "ul",
				items: [
					"**Lune.** The Lune target is experimental, and has not yet been tested by an experienced Lune developer.",
					"**Aliases and .luaurc.** The page at [Aliases and .luaurc](aliases) is written from " +
						"the RFC and from what Roswaal does with it. Someone who has shipped a Lune " +
						"project with a real alias map should check it — particularly a project with " +
						"more than one `.luaurc`, since inheritance and relative paths agree with the " +
						"simple case right up until they do not.",
					"**Networking on Coming from Blueprints.** The rows on replicated functions need checking by someone who has shipped multiplayer.",
					"**Node reference pages.** Every one is still pending review.",
				],
			},

			{ t: "h", level: 2, text: "Reviewers" },
			...reviewerBlocks(),
		],
	};
}

/**
 * Everyone credited with a review, as links to their GitHub accounts. Built
 * from the ledger, so a new reviewer appears here the moment their name is on
 * a review rather than when somebody remembers to add them.
 */
function reviewerBlocks(): Block[] {
	const reviewers = reviewerCounts();
	const how =
		"Credit a review by adding your GitHub account name to its `reviewers` in " +
		"`src/core/docs/reviews.ts`.";
	if (reviewers.length === 0) {
		return [{ t: "p", text: `Nobody is credited yet. ${how}` }];
	}
	return [
		{
			t: "ul",
			items: reviewers.map(
				(r) => `${reviewerLink(r.handle)} — ${r.pages} ${r.pages === 1 ? "page" : "pages"}`,
			),
		},
		{ t: "p", text: how },
	];
}
