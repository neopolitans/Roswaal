/**
 * The technical specification, as sections of the documentation: a front page
 * and fourteen chapters in three parts. `buildSite` places them under their
 * own heading in the contents.
 */

import type { DocSection, PageContext } from "../site.js";
import { abstractionsPage } from "./abstractions.js";
import { accessibilityPage } from "./accessibility.js";
import { executionPage } from "./execution.js";
import { fileFormatPage } from "./fileFormat.js";
import { interactionPage } from "./interaction.js";
import { technicalPage } from "./landing.js";
import { luauForLunePage, luauForRobloxPage } from "./luauForRoblox.js";
import { overviewPage } from "./overview.js";
import { principlesPage } from "./principles.js";
import { conformancePage, processPage } from "./process.js";
import { typesPage } from "./types.js";
import { visualGrammarPage } from "./visualGrammar.js";
import { writingAProfilePage } from "./writingAProfile.js";

export function technicalSections(group: string, ctx: PageContext): DocSection[] {
	return [
		{ title: "About the specification", slug: "technical", group, pages: [technicalPage()] },
		{
			title: "Part I · Principles",
			slug: "technical-principles",
			group,
			pages: [
				overviewPage(),
				principlesPage(),
				abstractionsPage(),
				interactionPage(),
				visualGrammarPage(ctx),
				typesPage(),
				executionPage(),
				accessibilityPage(),
				fileFormatPage(),
			],
		},
		{
			title: "Part II · Profiles",
			slug: "technical-profiles",
			group,
			pages: [writingAProfilePage(), luauForRobloxPage(), luauForLunePage()],
		},
		{
			title: "Part III · Conformance and process",
			slug: "technical-process",
			group,
			pages: [conformancePage(), processPage()],
		},
	];
}
