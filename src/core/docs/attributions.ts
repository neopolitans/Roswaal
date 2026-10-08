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
	 * Whether Roswaal **uses** this, only **learned** from it, or **produces
	 * code for** it.
	 *
	 * The distinction is the point of having it. Listing something Roswaal only
	 * learned from under "built on" claims a relationship that does not exist —
	 * no code, no assets, no dependency, only conventions a reader might
	 * recognise. Overstating a debt is its own kind of inaccuracy.
	 *
	 * `designed-for` is the third, and it is the weakest of the three on
	 * purpose: a language Roswaal writes and a runtime that runs the result.
	 * Nothing of theirs is here and nothing of theirs is licensed to us — what
	 * is being said is only "this is what the output is for".
	 *
	 * `tested-with` is for libraries these pages name and Roswaal was tried
	 * against. Nothing of theirs ships here or is needed to use Roswaal; they are
	 * named so a reader seeing them in a picture or an example knows whose they
	 * are.
	 */
	relation: "uses" | "inspired-by" | "designed-for" | "tested-with";
	/** Where it is in what ships, or "Nothing of theirs ships." */
	where: string;
	/** What Roswaal does with it, in one sentence. */
	note: string;
	/** Canonical home, so a reader can check any of this for themselves. */
	url?: string;
	/** Something the holder asks of projects like this one, quoted. */
	quote?: string;
}

/** What `where` says when nothing of a holder's is in Roswaal. */
export const NOTHING_SHIPS = "Nothing of theirs ships.";

export const ATTRIBUTIONS: Attribution[] = [
	{
		name: "Luau",
		relation: "designed-for",
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
		relation: "designed-for",
		holder: "Roblox Corporation",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal compiles to Luau that Roblox runs, and names the engine's classes, enums and services.",
		url: "https://create.roblox.com/docs",
	},
	{
		name: "Lune",
		relation: "designed-for",
		holder: "Filip Tibell and contributors",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal can compile a graph to a `.luau` file that Lune runs.",
		url: "https://lune-org.github.io/docs",
	},
	{
		name: "Unreal Engine",
		relation: "inspired-by",
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
		relation: "inspired-by",
		holder: "Unity Technologies",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal draws execution pins as triangles outside the node, as Bolt does.",
		url: "https://unity.com/features/unity-visual-scripting",
	},
	{
		name: "Blender",
		relation: "inspired-by",
		holder: "Blender Foundation",
		licence: null,
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal sets sockets on the node's border, as Blender does.",
		url: "https://www.blender.org/",
	},
	{
		name: "Affinity",
		relation: "inspired-by",
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
		relation: "inspired-by",
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
		relation: "uses",
		holder: "Google LLC",
		licence: "Apache-2.0",
		ships: true,
		where: "`src/app/icons.tsx`. Licence: `notices/upstream/material-symbols.txt`.",
		note: "Roswaal draws every icon in the editor from Material Symbols.",
		url: "https://fonts.google.com/icons",
	},
	{
		name: "CodeMirror 6",
		relation: "uses",
		holder: "Marijn Haverbeke and contributors",
		licence: "MIT",
		ships: true,
		where: "The editor bundle. Licence: `THIRD-PARTY-NOTICES.txt`.",
		note: "Roswaal's code editor, source view and licence viewer are built on CodeMirror.",
		url: "https://codemirror.net/",
	},
	{
		name: "Node.js",
		relation: "uses",
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
		relation: "uses",
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
		relation: "uses",
		holder: "PUC-Rio",
		licence: "MIT",
		ships: false,
		where: `${NOTHING_SHIPS} PUC-Rio's copyright line is in the Luau logo's licence, which Roswaal carries.`,
		note: "Luau, which Roswaal writes, is based on Lua.",
		url: "https://www.lua.org/",
	},
	{
		name: "Tokyo Night",
		relation: "uses",
		holder: "Enkia",
		licence: "MIT",
		ships: true,
		where: "`themes/tokyo-night.json` and `themes/tokyo-night-storm.json`.",
		note: "Roswaal includes two Tokyo Night colour schemes.",
		url: "https://github.com/tokyo-night/tokyo-night-vscode-theme",
	},
	{
		name: "Catppuccin",
		relation: "uses",
		holder: "Catppuccin",
		licence: "MIT",
		ships: true,
		where: "`themes/catppuccin-mocha.json`.",
		note: "Roswaal includes Catppuccin Mocha as a colour scheme.",
		url: "https://github.com/catppuccin/catppuccin",
	},
	{
		name: "Nord",
		relation: "uses",
		holder: "Sven Greb",
		licence: "MIT",
		ships: true,
		where: "`themes/nord.json`.",
		note: "Roswaal includes Nord as a colour scheme, syntax colours too.",
		url: "https://github.com/nordtheme/nord",
	},
	{
		name: "Rojo",
		relation: "uses",
		holder: "rojo-rbx and contributors",
		licence: "MPL-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal writes the files Rojo syncs into a place.",
		url: "https://rojo.space/",
	},
	{
		name: "Wally",
		relation: "uses",
		holder: "Uplift Games and contributors",
		licence: "MPL-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal reads Wally packages, and searches the public Wally registry.",
		url: "https://github.com/UpliftGames/wally",
	},
	{
		name: "Moonwave",
		relation: "uses",
		holder: "Eryn L. K. and contributors",
		licence: "MPL-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal reads Moonwave-style doc comments for hover, with a parser of its own.",
		url: "https://github.com/evaera/moonwave",
	},
	{
		name: "Roblox Creator Documentation",
		relation: "uses",
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
		relation: "uses",
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
		relation: "tested-with",
		holder: "csqrl",
		licence: "MIT",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's hover was tested on Sift, and its release notes name it.",
		url: "https://github.com/cxmeel/sift",
	},
	{
		name: "Signal",
		relation: "tested-with",
		holder: "Stephen Leitnick",
		licence: "MIT",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's docs and tests use Signal, from RbxUtil, as the example Wally package.",
		url: "https://github.com/Sleitnick/RbxUtil",
	},
	{
		name: "Promise",
		relation: "tested-with",
		holder: "Eryn L. K.",
		licence: "MIT",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's pictures show Promise as a package not installed yet.",
		url: "https://github.com/evaera/roblox-lua-promise",
	},
	{
		name: "Roact",
		relation: "tested-with",
		holder: "Roblox Corporation",
		licence: "Apache-2.0",
		ships: false,
		where: NOTHING_SHIPS,
		note: "Roswaal's docs use `@roact` as the example of an alias.",
		url: "https://github.com/Roblox/roact",
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

/** The ones Roswaal actually ships or stands on. */
export const DEPENDENCIES = ATTRIBUTIONS.filter((a) => a.relation === "uses");

/**
 * The ones it only learned from.
 *
 * Separate because "built on" and "inspired by" are different claims, and the
 * weaker one is the true one here.
 */
export const INSPIRATIONS = ATTRIBUTIONS.filter((a) => a.relation === "inspired-by");

/**
 * The languages and runtimes the generated code is for.
 *
 * Weaker than either of the others, and listed anyway: a reader seeing Roblox's
 * class names throughout the editor is owed the sentence saying whose they are.
 * Luau is here rather than under "built on" because Roswaal writes it, and its
 * README asks for the attribution in user-facing documentation, which this is.
 */
export const TARGETS = ATTRIBUTIONS.filter((a) => a.relation === "designed-for");

/**
 * Libraries these pages name and Roswaal was tried against. Their own heading,
 * because none of them is something Roswaal is built on: it only reads them.
 */
export const TESTED_WITH = ATTRIBUTIONS.filter((a) => a.relation === "tested-with");
