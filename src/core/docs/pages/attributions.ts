/**
 * The `attributions` page of the documentation. `buildSite` places it.
 */

import {
	type Attribution,
	DEPENDENCIES,
	INSPIRATIONS,
	NAME_NOTICE,
	TARGETS,
	TESTED_WITH,
} from "../attributions.js";
import type { Block, DocPage } from "../site.js";

/**
 * Who made what Roswaal is built on, and what it is named after.
 *
 * A page rather than only `ATTRIBUTIONS.md`, because the people who need to read it
 * are not all reading the repository — and because the naming statement is a
 * thing to say where users are, not to file where auditors are.
 */
export function attributionsPage(): DocPage {
	const blocks: Block[] = [
		{
			t: "p",
			text:
				"Roswaal is 0BSD — see the end of this page — but it writes for " +
				"languages and platforms that are not ours, it stands on work that is " +
				"not, and it is named after characters that are not ours. All three " +
				"are listed here.",
		},
		{ t: "h", level: 2, text: NAME_NOTICE.title },
	];

	for (const line of NAME_NOTICE.body) blocks.push({ t: "p", text: line });

	/**
	 * Two headings, because they are two different claims. Everything under the
	 * first ships inside Roswaal or is something it could not run without; the
	 * second is work it only learned from. Listing an inspiration under "built
	 * on" would claim a relationship that does not exist.
	 */
	const group = (heading: string, lede: string, entries: Attribution[], what = "Project") => {
		if (entries.length === 0) return;
		blocks.push({ t: "h", level: 2, text: heading });
		blocks.push({ t: "p", text: lede });
		blocks.push({
			t: "table",
			head: [what, "By", "Licence"],
			rows: entries.map((a) => [
				a.url ? `[${a.name}](${a.url})` : a.name,
				a.holder ?? "—",
				a.licence ?? "not licensed to us",
			]),
		});
		for (const entry of entries) {
			blocks.push({ t: "h", level: 3, text: entry.name });
			blocks.push({ t: "p", text: entry.note });
			blocks.push({ t: "p", text: `**Where:** ${entry.where}` });
			if (entry.quote) blocks.push({ t: "note", kind: "info", text: `"${entry.quote}"` });
		}
	};

	/**
	 * First, because it is the one a reader needs before the others make sense
	 * -- and because Roblox's class names are all over the editor, which is a
	 * thing to explain rather than leave to be inferred.
	 */
	group(
		"What Roswaal is designed for",
		"The languages and runtimes the generated code is written for. Nothing of " +
			"theirs is bundled here and nothing of theirs is licensed to Roswaal; " +
			"they are named because that is what the output is **for**, and because " +
			"a reader seeing these names throughout the editor is owed the sentence " +
			"saying whose they are.",
		TARGETS,
		"Platform",
	);
	group(
		"What Roswaal is built on",
		"Code and assets that ship inside Roswaal, or that it could not run without.",
		DEPENDENCIES,
	);
	group(
		"What Roswaal is tested with",
		"Open-source Luau libraries these pages name, and that hover, require " +
			"following and the Wally support were tried against. None is bundled, " +
			"none is needed to use Roswaal, and nothing of theirs is copied into it.",
		TESTED_WITH,
		"Library",
	);
	group(
		"What Roswaal is inspired by",
		"Work Roswaal learned from and does **not** use. No code, no assets, no " +
			"dependency — only conventions a reader might recognise, named here so " +
			"the resemblance is explained rather than left to be guessed at.",
		INSPIRATIONS,
	);

	blocks.push({ t: "h", level: 2, text: "Roswaal itself" });
	blocks.push({
		t: "note",
		kind: "good",
		text:
			"Everything in this repository that is Roswaal's own is **0BSD**: use it, " +
			"modify it, ship it, train on it, no attribution required. The list above " +
			"is what that does *not* cover.",
	});

	return {
		slug: "attributions",
		title: "Attributions",
		summary: "What Roswaal is built on, who made it, and what the names are.",
		narrow: true,
		blocks,
	};
}
