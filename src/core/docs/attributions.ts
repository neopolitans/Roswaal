/**
 * Attributions: what Roswaal is built on and named after, and on what terms.
 *
 * Data rather than prose, for the same reason `blueprints.ts` is: a page that
 * lists obligations is a page that goes stale silently. As data it can be
 * checked — `tests/attributions.test.ts` asserts every entry names a licence
 * and says where the thing actually lives, so an entry cannot rot into a name
 * with nothing behind it.
 *
 * `NOTICE.md` is the copy of record for anyone reading the repository; this is
 * the copy for anyone reading the documentation, and neither is allowed to be
 * the only one. They are kept in step by hand, deliberately: the two answer
 * different questions and a generated file would flatten that.
 *
 * ## The rule for adding an entry
 *
 * Something goes here when **a reader would be misled by its absence** — code
 * that ships inside Roswaal under someone else's terms, a name that is not
 * ours, or a project we would be free-riding on if we said nothing. A build
 * tool that never reaches the user does not go here; it is not in the thing
 * being distributed.
 */

export interface Attribution {
	/** What it is called. */
	name: string;
	/** Who holds it. Omitted only when genuinely unowned. */
	holder?: string;
	/**
	 * The licence, by its usual short name, or `null` where the thing is not
	 * licensed to us at all — a name used as homage is the case that matters,
	 * and writing `null` rather than leaving it blank forces that to be said
	 * out loud rather than implied by a gap.
	 */
	licence: string | null;
	/**
	 * Whether Roswaal **uses** this or only **learned** from it.
	 *
	 * The distinction is the point of having it. Listing Unreal Engine beside
	 * CodeMirror under one heading said Roswaal was built on Epic's engine, which
	 * it is not — no code, no assets, no dependency, only a set of conventions a
	 * reader might recognise. Overstating a debt is its own kind of inaccuracy,
	 * and this one had us claiming a relationship nobody wanted to claim.
	 */
	relation: "uses" | "inspired-by";
	/** Where it is in the repository, or how it reaches a user. */
	where: string;
	/** Why it is listed: what we use, and what we are not claiming. */
	note: string;
	/** Canonical home, so a reader can check any of this for themselves. */
	url?: string;
	/** Licence text worth quoting, kept short. */
	quote?: string;
}

/**
 * Code and assets that ship inside Roswaal, or that it could not exist without.
 */
export const ATTRIBUTIONS: Attribution[] = [
	{
		name: "Luau",
		relation: "uses",
		holder: "Roblox Corporation",
		licence: "MIT",
		where: "Not bundled. Roswaal writes Luau; Luau runs it.",
		note:
			"The language this tool exists to produce. Luau's own README asks that " +
			"projects integrating it carry an attribution in user-facing " +
			"documentation, and this page is where Roswaal does that. Luau and the " +
			"Luau logo belong to Roblox; Roswaal is not affiliated with or endorsed " +
			"by Roblox.",
		url: "https://luau.org/",
		quote:
			"When Luau is integrated into external projects, we ask that you honor " +
			"the license agreement and include Luau attribution into the user-facing " +
			"product documentation.",
	},
	{
		name: "Unreal Engine",
		relation: "inspired-by",
		holder: "Epic Games, Inc.",
		licence: null,
		where: "Not used, and not bundled. Named in *Coming from Blueprints*.",
		note:
			"Roswaal exists partly to shorten the move from Unreal to Roblox, so it " +
			"is deliberately familiar where it can be: two kinds of wire, pin colours " +
			"that line up, and menu wording taken from Unreal's, because the entry " +
			"you already know should be the entry you find. Naming Epic's terms is " +
			"how that mapping is explained, and it is the only thing the names are " +
			"used for — they describe Epic's product, never this one. Unreal Engine, " +
			"Unreal and Blueprint are Epic's; Roswaal is not affiliated with, " +
			"endorsed by, or derived from Epic Games, uses no Unreal Engine code, " +
			"and is not bound by the Unreal Engine EULA.",
		url: "https://www.unrealengine.com/",
	},
	{
		name: "Material Symbols",
		relation: "uses",
		holder: "Google LLC",
		licence: "Apache-2.0",
		where: "`src/app/icons.tsx`, inlined as SVG path data.",
		note:
			"Every icon in the editor. Inlined rather than fetched, because the " +
			"daemon runs on machines that are offline and a font request to Google " +
			"would be both a dependency and a privacy surprise.",
		url: "https://fonts.google.com/icons",
	},
	{
		name: "CodeMirror 6",
		relation: "uses",
		holder: "Marijn Haverbeke and contributors",
		licence: "MIT",
		where: "A runtime dependency; see `package.json`.",
		note:
			"The pop-out Luau editor, the read-only source view, and the syntax " +
			"highlighting shared between the editor and this documentation.",
		url: "https://codemirror.net/",
	},
	{
		name: "Lua",
		relation: "uses",
		holder: "PUC-Rio",
		licence: "MIT",
		where: "Not bundled. Luau is based on the Lua 5.x implementation.",
		note:
			"Listed because Luau is built on it and the chain would otherwise stop " +
			"one link short of where it started.",
		url: "https://www.lua.org/",
	},
	{
		name: "Tokyo Night",
		relation: "uses",
		holder: "Enkia",
		licence: "MIT",
		where: "`themes/tokyo-night.json` and `themes/tokyo-night-storm.json`.",
		note:
			"Two of the colour schemes. A palette of hex values is not itself a " +
			"copyrightable work, so carrying the licence is courtesy rather than " +
			"obligation — but these are recognisably somebody's design, and the " +
			"cost of saying whose is nothing. The upstream licence is vendored " +
			"byte for byte in `notices/upstream/` and shown in full under " +
			"Settings → Licences.",
		url: "https://github.com/tokyo-night/tokyo-night-vscode-theme",
	},
	{
		name: "Catppuccin",
		relation: "uses",
		holder: "Catppuccin",
		licence: "MIT",
		where: "`themes/catppuccin-mocha.json`.",
		note:
			"The Mocha flavour, as one of the colour schemes. Same posture as the " +
			"other borrowed palettes: the licence travels because the design is " +
			"someone's, not because a claim has been conceded.",
		url: "https://github.com/catppuccin/catppuccin",
	},
	{
		name: "Nord",
		relation: "uses",
		holder: "Sven Greb",
		licence: "MIT",
		where: "`themes/nord.json`.",
		note:
			"One of the colour schemes, including its syntax colours. Its licence " +
			"carries an email address and a homepage that no MIT template would " +
			"have produced, which is exactly why the file is copied rather than " +
			"reconstructed.",
		url: "https://github.com/nordtheme/nord",
	},
	{
		name: "Rojo",
		relation: "uses",
		holder: "rojo-rbx and contributors",
		licence: "MPL-2.0",
		where: "Not bundled. Roswaal writes files Rojo syncs.",
		note:
			"Not a dependency, and listed anyway: the whole workflow assumes it, " +
			"and a tool whose documentation tells you to run `rojo serve` should say " +
			"whose work that is.",
		url: "https://rojo.space/",
	},
];

/**
 * Names Roswaal uses that belong to somebody else.
 *
 * Separated from the list above because it is a different kind of statement.
 * Everything above is licensed to us and we are honouring the terms. Nothing
 * here is licensed to us at all — it is used as homage, and the only honest
 * thing to do is say so plainly, in the documentation rather than in a file
 * nobody opens.
 */
export const NAME_NOTICE = {
	title: "The names",
	body: [
		"**Roswaal** and its sibling tool **[Beako](https://github.com/neopolitans/Beako)** " +
			"are named after characters " +
			"from *Re:Zero − Starting Life in Another World* — Roswaal L. Mathers and " +
			"Beatrice — created by Tappei Nagatsuki and published by KADOKAWA. The " +
			"names are a fan's homage, chosen because each character suited what each " +
			"tool does.",
		"**This project is not affiliated with, endorsed by, or approved by " +
			"KADOKAWA, Tappei Nagatsuki, or the Re:Zero project**, and claims no " +
			"rights in those names or in anything from that work.",
		"Nothing from Re:Zero is distributed here: no artwork, no likenesses, no " +
			"text, and not the series title. The mark in `assets/` is original work.",
		"Roswaal is released under 0BSD and is not sold by its authors. 0BSD places " +
			"no restriction on what anyone else does with it, commercially or " +
			"otherwise — those choices, and any obligations that follow from them, " +
			"belong to whoever makes them.",
	],
} as const;

/** The ones Roswaal actually ships or stands on. */
export const DEPENDENCIES = ATTRIBUTIONS.filter((a) => a.relation === "uses");

/**
 * The ones it only learned from.
 *
 * Separate because "built on" and "inspired by" are different claims, and the
 * weaker one is the true one here.
 */
export const INSPIRATIONS = ATTRIBUTIONS.filter((a) => a.relation === "inspired-by");
