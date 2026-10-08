/**
 * Attributions: what Roswaal is built on and named after, and on what terms.
 *
 * Data rather than prose, for the same reason `blueprints.ts` is: a page that
 * lists obligations is a page that goes stale silently. As data it can be
 * checked — `tests/attributions.test.ts` asserts every entry names a licence
 * and says where the thing actually lives, so an entry cannot rot into a name
 * with nothing behind it.
 *
 * `ATTRIBUTIONS.md` is the copy of record for anyone reading the repository.
 * This is the copy for anyone reading the documentation. Neither is allowed to
 * be the only one, and the test keeps them listing the same things.
 *
 * ## The rule for adding an entry
 *
 * Something goes here when **a reader would be misled by its absence** — code
 * that ships inside Roswaal under someone else's terms, a name that is not
 * ours, or a project we would be free-riding on if we said nothing. A build
 * tool that never reaches the user does not go here; it is not in the thing
 * being distributed.
 *
 * ## How an entry is written
 *
 * For whoever holds it, at a glance, so the same few rules everywhere:
 *
 * - `note` is one sentence, with Roswaal as the subject, saying what Roswaal
 *   does with it. The reasons it is listed belong here, in comments, not on
 *   the page.
 * - `where` is a path, or "Nothing of theirs ships." -- nothing in between, so
 *   no reader has to work out whether something is bundled.
 * - Quoted text says what was changed.
 * - Trademark lines are said once per holder, in `TRADEMARKS`, and the
 *   non-affiliation once for the whole page. No legal conclusions of our own.
 */

export interface Attribution {
	/** What it is called. */
	name: string;
	/** Who holds it. Omitted only when genuinely unowned. */
	holder?: string;
	/**
	 * Their licence, by its usual short name, or `null` where nothing is
	 * licensed to us at all -- a name, a convention, a platform written for.
	 * Writing `null` rather than leaving it blank forces that to be said out
	 * loud rather than implied by a gap.
	 */
	licence: string | null;
	/**
	 * Whether anything of theirs is in what Roswaal distributes. Where it is
	 * not, the page says no licence is needed rather than naming one that
	 * governs nothing here.
	 */
	ships: boolean;
	/**
	 * How Roswaal uses it: one of `USAGES`, each saying what is and is not in
	 * Roswaal. The distinction is the point. Listing something Roswaal only
	 * learned from as included claims a relationship that does not exist, and
	 * "uses" once covered both code that ships and tools that never do.
	 */
	usage: UsageKey;
	/** What the at-a-glance grid calls it, where the name is long. */
	short?: string;
	/**
	 * The licence its button opens: a file in `notices/upstream/` without its
	 * `.txt`, or `notices` for the build's `THIRD-PARTY-NOTICES.txt`. Absent where
	 * nothing of theirs ships.
	 */
	licenceFile?: string;
	/** What the licence button says, where the SPDX name alone would mislead. */
	licenceLabel?: string;
	/** A second, narrower use the grid shows in its own column: the Luau logo. */
	also?: { usage: UsageKey; short: string };
	/** Where it is in what ships, or "Nothing of theirs ships." */
	where: string;
	/** What Roswaal does with it, in one sentence. */
	note: string;
	/** Canonical home, so a reader can check any of this for themselves. */
	url?: string;
	/** Something the holder asks of projects like this one, quoted. */
	quote?: string;
}

export type UsageKey =
	| "included"
	| "quoted"
	| "target"
	| "works"
	| "example"
	| "inspired"
	| "homage";

/**
 * The seven ways Roswaal uses someone's work, in the order the page shows
 * them: what each means, and what it promises the holder.
 */
export const USAGES: { key: UsageKey; label: string; means: string; promise: string }[] = [
	{
		key: "included",
		label: "Included",
		means: "Code or assets that ship inside Roswaal.",
		promise: "Its licence travels with it, in full.",
	},
	{
		key: "quoted",
		label: "Quoted",
		means: "Someone's words, shipped inside Roswaal under their licence.",
		promise: "Marked as theirs and not 0BSD, with what was changed.",
	},
	{
		key: "target",
		label: "Written for",
		means: "What the code Roswaal generates is written for.",
		promise: "Named to say what Roswaal works with. Nothing of theirs ships.",
	},
	{
		key: "works",
		label: "Works with",
		means: "Tools and formats Roswaal reads or writes.",
		promise: "Nothing of theirs ships, and Roswaal does not run their software.",
	},
	{
		key: "example",
		label: "Example",
		means: "Named in the docs, pictures or tests as a real-world example.",
		promise: "A name, and sometimes code Roswaal was tried against. Nothing copied.",
	},
	{
		key: "inspired",
		label: "Inspired by",
		means: "Conventions Roswaal learned from.",
		promise: "No code, assets, content or dependency.",
	},
	{
		key: "homage",
		label: "Named after",
		means: "A name used as homage.",
		promise: "Not licensed, and no rights claimed. Nothing from the work is used.",
	},
];

/** What `where` says when nothing of a holder's is in Roswaal. */
export const NOTHING_SHIPS = "Nothing of theirs ships.";

export const ATTRIBUTIONS: Attribution[] = [
	{
		name: "Luau",
		usage: "target",
		licenceFile: "luau-site",
		licenceLabel: "MIT · logo",
		also: { usage: "included", short: "Luau logo (canary)" },
		holder: "Roblox Corporation",
		licence: "MIT",
		ships: true,
		where:
			"In the canary build only, the `.luau` file icon is the Luau logo, carried with its " +
			"licence. Otherwise nothing of theirs ships.",
		note: "Roswaal writes Luau code, and this page is the attribution Luau asks for.",
		url: "https://luau.org/",
		quote:
			"When Luau is integrated into external projects, we ask that you honor " +
			"the license agreement and include Luau attribution into the user-facing " +
			"product documentation.",
	},
	{
		name: "Roblox",
		usage: "target",
		holder: "Roblox Corporation",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal compiles to Luau that Roblox runs, and names the engine's classes, enums and services.",
		url: "https://create.roblox.com/docs",
	},
	{
		name: "Lune",
		usage: "target",
		holder: "Filip Tibell and contributors",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal can compile a graph to a `.luau` file that Lune runs.",
		url: "https://lune-org.github.io/docs",
	},
	{
		name: "Unreal Engine",
		usage: "inspired",
		holder: "Epic Games, Inc.",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note:
			"Roswaal's graphs read like Blueprints: execution and data wires, and pins coloured " +
			"by type. *Coming from Blueprints* names Epic's terms.",
		url: "https://www.unrealengine.com/",
	},
	{
		name: "Unity Visual Scripting (Bolt)",
		usage: "inspired",
		short: "Visual Scripting (Bolt)",
		holder: "Unity Technologies",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal draws execution pins as triangles outside the node, as Bolt does.",
		url: "https://unity.com/features/unity-visual-scripting",
	},
	{
		name: "Blender",
		usage: "inspired",
		holder: "Blender Foundation",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal sets sockets on the node's border, as Blender does.",
		url: "https://www.blender.org/",
	},
	{
		name: "Affinity",
		usage: "inspired",
		holder: "Canva",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note:
			"Roswaal's mode strip follows Affinity's: icons beside the mark, and a box that slides " +
			"to the one in use.",
		url: "https://www.affinity.studio/",
	},
	{
		name: "Procreate",
		usage: "inspired",
		holder: "Savage Interactive Pty Ltd",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note:
			"Roswaal floats its tools in small clusters at the window's edge, and keeps zoom, undo " +
			"and redo on a strip at the side, as Procreate does.",
		url: "https://procreate.com/",
	},
	{
		name: "Material Symbols",
		usage: "included",
		licenceFile: "material-symbols",
		holder: "Google LLC",
		licence: "Apache-2.0",
		ships: true,
		where: "`src/app/icons.tsx`. Licence: `notices/upstream/material-symbols.txt`.",
		note: "Roswaal draws every icon in the editor from Material Symbols.",
		url: "https://fonts.google.com/icons",
	},
	{
		name: "CodeMirror 6",
		usage: "included",
		short: "CodeMirror",
		licenceFile: "notices",
		holder: "Marijn Haverbeke and contributors",
		licence: "MIT",
		ships: true,
		where: "The editor bundle. Licence: `THIRD-PARTY-NOTICES.txt`.",
		note: "Roswaal's code editor, source view and licence viewer are built on CodeMirror.",
		url: "https://codemirror.net/",
	},
	{
		name: "Node.js",
		usage: "included",
		licenceFile: "notices",
		licenceLabel: "MIT and others",
		holder: "OpenJS Foundation and Node.js contributors",
		licence: "MIT",
		ships: true,
		where:
			"Inside the release binaries. Its licence, which covers what it carries, is in " +
			"`THIRD-PARTY-NOTICES.txt` in each zip.",
		note: "Roswaal's release binaries contain the Node.js runtime.",
		url: "https://nodejs.org/",
	},
	{
		name: "Open-source packages",
		usage: "included",
		short: "Packages",
		licenceFile: "notices",
		licenceLabel: "MIT · ISC · BSD",
		holder: "Their authors",
		licence: "MIT, ISC and BSD-3-Clause",
		ships: true,
		where:
			"The editor and the release binaries. Each licence: `THIRD-PARTY-NOTICES.txt`, beside " +
			"every build and in every zip.",
		note:
			"Roswaal includes the open-source packages it is built with, React and Express among " +
			"them, each listed with its own licence file.",
	},
	{
		name: "Lua",
		usage: "works",
		holder: "PUC-Rio",
		licence: "MIT",
		ships: false,
		where: `${NOTHING_SHIPS} PUC-Rio's copyright line is in the Luau logo's licence, which Roswaal carries.`,
		note: "Luau, which Roswaal writes, is based on Lua.",
		url: "https://www.lua.org/",
	},
	{
		name: "Tokyo Night",
		usage: "included",
		licenceFile: "tokyo-night",
		holder: "Enkia",
		licence: "MIT",
		ships: true,
		where: "`themes/tokyo-night.json` and `themes/tokyo-night-storm.json`.",
		note: "Roswaal includes two Tokyo Night colour schemes.",
		url: "https://github.com/tokyo-night/tokyo-night-vscode-theme",
	},
	{
		name: "Catppuccin",
		usage: "included",
		licenceFile: "catppuccin",
		holder: "Catppuccin",
		licence: "MIT",
		ships: true,
		where: "`themes/catppuccin-mocha.json`.",
		note: "Roswaal includes Catppuccin Mocha as a colour scheme.",
		url: "https://github.com/catppuccin/catppuccin",
	},
	{
		name: "Nord",
		usage: "included",
		licenceFile: "nord",
		holder: "Sven Greb",
		licence: "MIT",
		ships: true,
		where: "`themes/nord.json`.",
		note: "Roswaal includes Nord as a colour scheme, syntax colours too.",
		url: "https://github.com/nordtheme/nord",
	},
	{
		name: "Rojo",
		usage: "works",
		holder: "rojo-rbx and contributors",
		licence: "MPL-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal writes the files Rojo syncs into a place.",
		url: "https://rojo.space/",
	},
	{
		name: "Wally",
		usage: "works",
		holder: "Uplift Games and contributors",
		licence: "MPL-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal reads Wally packages, and searches the public Wally registry.",
		url: "https://github.com/UpliftGames/wally",
	},
	{
		name: "Moonwave",
		usage: "works",
		holder: "Eryn L. K. and contributors",
		licence: "MPL-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal reads Moonwave-style doc comments for hover, with a parser of its own.",
		url: "https://github.com/evaera/moonwave",
	},
	{
		name: "Roblox Creator Documentation",
		usage: "quoted",
		short: "Creator Documentation",
		licenceFile: "creator-docs",
		licenceLabel: "CC BY 4.0",
		holder: "Roblox Corporation",
		licence: "CC-BY-4.0",
		ships: true,
		where:
			"`src/core/robloxEngine.json` and `src/core/robloxMembers.ts`. Licence: " +
			"`notices/upstream/creator-docs.txt`.",
		note:
			"Roswaal shows one-sentence summaries of the engine's API, © Roblox Corporation. " +
			"Changed: shortened, and markup removed. This text stays under CC BY 4.0, not 0BSD.",
		url: "https://github.com/Roblox/creator-docs",
	},
	{
		name: "Lune's type definitions",
		usage: "quoted",
		short: "Type definitions",
		licenceFile: "lune",
		holder: "Filip Tibell and contributors",
		licence: "MPL-2.0",
		ships: true,
		where: "`src/core/luneApi.ts`. Licence: `notices/upstream/lune.txt`.",
		note:
			"Roswaal shows Lune's function signatures and parameter descriptions, unchanged, from " +
			"v0.10.5. They stay under the MPL, not 0BSD.",
		url: "https://github.com/lune-org/lune",
	},
	{
		name: "Sift",
		usage: "example",
		holder: "csqrl",
		licence: "MIT",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's hover was tested on Sift, and its release notes name it.",
		url: "https://github.com/cxmeel/sift",
	},
	{
		name: "Signal",
		usage: "example",
		holder: "Stephen Leitnick",
		licence: "MIT",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's docs and tests use Signal, from RbxUtil, as the example Wally package.",
		url: "https://github.com/Sleitnick/RbxUtil",
	},
	{
		name: "Promise",
		usage: "example",
		holder: "Eryn L. K.",
		licence: "MIT",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's pictures show Promise as a package not installed yet.",
		url: "https://github.com/evaera/roblox-lua-promise",
	},
	{
		name: "Roact",
		usage: "example",
		holder: "Roblox Corporation",
		licence: "Apache-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's docs use `@roact` as the example of an alias.",
		url: "https://github.com/Roblox/roact",
	},
	{
		name: "The name “Roswaal”",
		usage: "homage",
		short: "The name",
		holder: "KADOKAWA · Tappei Nagatsuki",
		licence: null,
		ships: false,
		where: `${NOTHING_SHIPS} The name only: no artwork, likeness or text from the work.`,
		note:
			"Roswaal is named after Roswaal L. Mathers, a character in *Re:Zero − Starting Life in " +
			"Another World*.",
	},
];

/**
 * Each holder's trademark line, said once, in the holder's own words where
 * they publish them.
 *
 * Luau's is the line luau.org/brand asks every project using the name to
 * carry. Procreate's is the one on procreate.com: its guidelines suggest a
 * longer notice ending "used with authorisation", which would not be true
 * here. Affinity's follows Canva's own terms, which say the software belongs to
 * "Canva, its affiliates or its licensors".
 */
export const TRADEMARKS: { holder: string; line: string }[] = [
	{
		holder: "Roblox Corporation",
		line:
			"Luau is a trademark of Roblox Corporation. Roblox, and the names of the engine's " +
			"classes and services, belong to Roblox Corporation.",
	},
	{
		holder: "Epic Games, Inc.",
		line:
			"Unreal, Unreal Engine and Blueprint are trademarks or registered trademarks of Epic " +
			"Games, Inc. in the United States of America and elsewhere.",
	},
	{
		holder: "Unity Technologies",
		line: "Unity and Bolt are trademarks or registered trademarks of Unity Technologies.",
	},
	{
		holder: "Blender Foundation",
		line: "Blender is a registered trademark of the Blender Foundation.",
	},
	{
		holder: "Canva",
		line: "Affinity is a trademark of Canva, its affiliates or its licensors.",
	},
	{
		holder: "Savage Interactive Pty Ltd",
		line:
			"Procreate® is a registered trademark of Savage Interactive Pty Ltd. Roswaal is not " +
			"owned or endorsed by, or affiliated with, Procreate.",
	},
];

/** Said once, at the top of the page and of `ATTRIBUTIONS.md`, for everyone listed. */
export const NOT_AFFILIATED =
	"Roswaal is not affiliated with, endorsed by, or approved by anyone on this page.";

/**
 * Names Roswaal uses that belong to somebody else.
 *
 * Separated from the list above because it is a different kind of statement:
 * nothing here is licensed to us at all. It is used as homage, and the only
 * honest thing to do is say so plainly, where users read.
 */
export const NAME_NOTICE = {
	title: "The name",
	body: [
		"**Roswaal** is named after Roswaal L. Mathers, a character in *Re:Zero − Starting Life " +
			"in Another World* by Tappei Nagatsuki, published by KADOKAWA. The name is a fan's homage.",
		"Roswaal is not affiliated with, endorsed by, or approved by KADOKAWA, Tappei Nagatsuki, " +
			"or the Re:Zero project, and claims no rights in their names or work. No artwork, " +
			"likeness or text from it is used, and the mark in `assets/` is original.",
		"Roswaal is 0BSD and is not sold by its authors. What anyone else does with it, and " +
			"anything that follows from that, is theirs.",
	],
} as const;

/**
 * How Roswaal is made: a disclosure, not an attribution. Nothing of
 * Anthropic's is in Roswaal and no licence asks for it. The same two sentences
 * are in Settings › How Roswaal is made and in the README.
 */
export const HOW_IT_IS_MADE = [
	"Roswaal is designed and directed by its maintainer, and much of its code is written with " +
		"Claude, Anthropic's AI model. The commits Claude helped write credit it as a co-author.",
	"Nothing of Anthropic's is in Roswaal, and Roswaal is not affiliated with or endorsed by " +
		"Anthropic.",
] as const;

/** The entries one usage type covers, in page order. */
export function entriesUsed(usage: UsageKey): Attribution[] {
	return ATTRIBUTIONS.filter((a) => a.usage === usage);
}

/** Who holds what, holders A to Z, each holder's entries in page order. */
export function byHolder(): { holder: string; entries: Attribution[] }[] {
	const holders = new Map<string, Attribution[]>();
	for (const entry of ATTRIBUTIONS) {
		const holder = entry.holder ?? "—";
		holders.set(holder, [...(holders.get(holder) ?? []), entry]);
	}
	return [...holders]
		.sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
		.map(([holder, entries]) => ({ holder, entries }));
}

/** A holder's trademark line, or its name notice, said above its entries. */
export function holderStatement(holder: string): string | undefined {
	if (holder === "KADOKAWA · Tappei Nagatsuki") return NAME_NOTICE.body[1];
	return TRADEMARKS.find((mark) => mark.holder === holder)?.line;
}

/** What the licence column says for an entry. */
export function licenceShown(entry: Attribution): string {
	if (!entry.ships || !entry.licence) return "None needed";
	return entry.licenceLabel ?? entry.licence;
}

/** An anchor for a holder or an entry: lower case, words joined by dashes. */
export function attributionSlug(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
