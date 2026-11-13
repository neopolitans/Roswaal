/**
 * The `privacy` and `terms` pages of the documentation. `buildSite` places
 * them, under Legal.
 *
 * Written from what the code does, so each line can be checked against it:
 * the daemon listens on 127.0.0.1 (`src/server/app.ts`), reaches out only to
 * install a Wally package or fetch a repository from GitHub
 * (`src/server/wally.ts`, `src/server/download.ts`), and the website keeps a
 * project in the browser's own storage. Sign in with Roblox is described as
 * Roblox's Creator Third Party App Policy requires it to work: one app,
 * registered, asking for the least it needs, its data kept on the user's
 * machine, never sold or used to train AI, and deleted when access ends.
 */

import { FEEDBACK_REPOSITORY } from "../links.js";
import type { DocPage } from "../site.js";

/** When these pages took effect: said at the top of each. */
const EFFECTIVE = "7 November 2026";

/**
 * When each page last changed, said at the top of it. Moved with every change
 * to the page's text, as its Changes section promises; the editor's notice
 * (`LegalNotice.tsx`) is shown again when either moves.
 */
export const LEGAL_EDITED = {
	terms: "13 November 2026",
	privacy: "13 November 2026",
} as const;

function datesOf(edited: string) {
	return [
		{
			t: "facts" as const,
			rows: [
				["Date Effective", EFFECTIVE],
				["Last Edited", edited],
			] as [string, string][],
		},
	];
}

/** Roblox's documents, linked wherever either page mentions one. */
const ROBLOX = {
	terms: "https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use",
	appTerms:
		"https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms",
	appPolicy:
		"https://en.help.roblox.com/hc/en-gb/articles/37924211313044-Creator-Third-Party-App-Policy",
	privacy:
		"https://en.help.roblox.com/hc/en-us/articles/115004630823-Roblox-Privacy-and-Cookie-Policy",
	openCloud: "https://create.roblox.com/docs/cloud",
};

/**
 * Every service Roswaal relies on, what for, and its own terms and privacy
 * policy. Wally's registry publishes neither; it says so rather than leave a
 * gap that reads as an oversight.
 */
const SERVICES = [
	"**GitHub** hosts the website through GitHub Pages, Roswaal's source and its releases, which Rokit installs from; the daemon fetches a repository from GitHub when you ask. [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) · [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).",
	"**Cloudflare** registers the roswaal.app domain and answers its DNS; it does not carry the website's traffic. [Cloudflare Website and Online Services Terms of Use](https://www.cloudflare.com/website-terms/) · [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).",
	"**The Wally registry**, at api.wally.run, is where the daemon installs a package from when you ask. It publishes no terms or privacy policy of its own; its software is [UpliftGames/wally](https://github.com/UpliftGames/wally), under the Mozilla Public License 2.0, and each package carries its own licence, which governs what you may do with it.",
	`**Roblox** is where Sign in with Roblox and asset downloads go, through its [Open Cloud API](${ROBLOX.openCloud}). [Roblox Terms of Use](${ROBLOX.terms}) · [Creator Third Party App Terms](${ROBLOX.appTerms}) · [Creator Third Party App Policy](${ROBLOX.appPolicy}) · [Roblox Privacy and Cookie Policy](${ROBLOX.privacy}).`,
];
const CONTACT = `Questions about this page go to [roswaal-feedback](${FEEDBACK_REPOSITORY}/issues/new).`;

export function privacyPage(): DocPage {
	return {
		slug: "privacy",
		narrow: true,
		title: "Privacy Policy",
		summary: "What Roswaal keeps, where, and what it never collects.",
		blocks: [
			...datesOf(LEGAL_EDITED.privacy),
			{
				t: "p",
				text:
					"Roswaal is free, open-source software. It has no servers of its own and no accounts, " +
					"and it collects nothing about you: no analytics, no advertising, no tracking, and no " +
					"cookies. What it keeps stays on your device.",
			},

			{ t: "h", level: 2, text: "The website" },
			{
				t: "p",
				text:
					"[roswaal.app](https://roswaal.app), its preview at [canary.roswaal.app](https://canary.roswaal.app) " +
					"and its backup at [neopolitans.github.io/Roswaal](https://neopolitans.github.io/Roswaal/) " +
					"are static files served by GitHub Pages, and Cloudflare answers the domain's DNS. GitHub receives the " +
					"usual details of each request, such as your IP address and browser, under its own " +
					"privacy statement, listed below. Roswaal itself receives nothing.",
			},
			{ t: "h", level: 3, text: "Your files, in each browser" },
			{
				t: "ul",
				items: [
					"**Chrome and Edge on a computer** can open a folder on your disk through the browser's File System Access API. You choose the folder in the browser's own dialog and grant access. Roswaal reads and writes only inside it, and the browser may ask again in a later session. The site never learns the folder's path: it keeps the browser's handle to it in its IndexedDB storage, so the folder can be reopened.",
					"**Other browsers**, including Safari, Firefox, other browsers built on Chromium, and every browser on iPad and iPhone, cannot open a folder. A project you make there is kept in the browser's private storage for this site, its origin private file system, which is separate from your other files. Projects come in as a zip you import, and leave as a zip you download.",
					"**Your preferences and recent projects** are kept in the browser's local storage, under names that begin with `roswaal`.",
				],
			},
			{
				t: "p",
				text:
					"None of it leaves your device. Clearing this site's data in your browser removes it; " +
					"a folder you opened stays on your disk as it is.",
			},

			{ t: "h", level: 2, text: "The command line and its daemon" },
			{
				t: "p",
				text:
					"The `roswaal` command and its daemon, the background process the editor talks to, " +
					"run on your computer.",
			},
			{
				t: "ul",
				items: [
					"**Only your computer, and only your account, can use it.** The daemon listens on 127.0.0.1, so nothing else on your network can connect to it, and it answers only requests that carry its key.",
					"**Only your project, and its key.** It reads and writes the project folder you choose, and any file you name to the command, such as a place you export. Each time it starts it writes a new key to `.roswaal` in your home folder, readable only by your account. The editor you open from it keeps that key in the tab's session storage, which the browser clears when the tab is closed. Nothing else of yours is touched.",
					"**Online only when you ask.** It installs a package from the [Wally](https://wally.run) registry, or fetches a repository from GitHub, when you tell it to, and makes no other requests.",
					"**Those services' own policies** cover those requests; they are listed below.",
				],
			},
			{ t: "h", level: 3, text: "Your files, on each system" },
			{
				t: "p",
				text:
					"On every system, the daemon writes graphs, node maps, the place and `roswaal.json` " +
					"through a temporary file beside each, which is then renamed into place, so a crash " +
					"never leaves half of one; other files it writes directly. Before it changes the place, " +
					"it can keep a copy in `.roswaal/backups`. It follows no link that leads out of the " +
					"project, and it starts every program by its full path, never one from the project " +
					"folder. If [StyLua](https://github.com/JohnnyMorganz/StyLua) " +
					"is installed, the daemon runs it to format the Luau it writes. Beyond that, it opens " +
					"your system's own programs only when you ask:",
			},
			{
				t: "ul",
				items: [
					"**Windows**, through the release build or npm. Choosing a folder opens the Windows folder dialog, through Windows PowerShell. Show in file manager opens File Explorer. Edit in the code editor finds Visual Studio Code, its Insiders build, VSCodium or Cursor on your PATH or in its usual install folder.",
					"**macOS**, through the release build or npm. Choosing a folder opens the macOS folder dialog, through AppleScript. Show in file manager opens Finder. Edit in the code editor opens Visual Studio Code, VSCodium or Cursor from Applications.",
					"**Linux**, through npm. Choosing a folder opens zenity or kdialog if one is installed; otherwise you type the path. Show in file manager uses xdg-open. Edit in the code editor finds Visual Studio Code, its Insiders build, VSCodium or Cursor on your PATH.",
				],
			},
			{
				t: "p",
				text: "Those programs show you what you chose. The daemon reads nothing back from them but the folder you picked.",
			},

			{ t: "h", level: 2, text: "Sign in with Roblox" },
			{
				t: "p",
				text:
					"Roswaal is adding an optional Sign in with Roblox, so a place's meshes, images and " +
					"sky can be drawn. It works as follows.",
			},
			{
				t: "p",
				text:
					"You do not need it to make, compile or export projects. Without it, Roswaal cannot " +
					"draw the meshes and images a place uses from the Roblox Creator Marketplace, so you " +
					"view and edit the place with plain stand-ins in their place.",
			},
			{
				t: "ul",
				items: [
					"**Only when you choose.** Roblox asks for your consent on its own page, listing the permissions Roswaal asks for: to download assets (`legacy-asset:manage`), to read who made an asset (`asset:read`), and to identify your account (`openid`), which gives Roswaal your Roblox user ID and nothing else about you, not your name or avatar.",
					'**Read only.** Roswaal reads and downloads assets, and never uploads, changes or deletes them, although Roblox names one of these permissions "manage".',
					"**Kept on your computer.** The daemon stores the sign-in in your user profile, never in a project folder and never in a log.",
					`**Used for one thing.** Roswaal downloads the assets your places refer to, through Roblox's official [Open Cloud API](${ROBLOX.openCloud}), and keeps copies in the project's own folder, kept out of Git by default. It never sends them, or your sign-in, anywhere else.`,
					"**Roblox's own assets are not downloaded.** Roswaal draws a plain stand-in for anything Roblox made.",
					`**Never sold, never rebroadcast online, and never used to train AI.** Nothing downloaded through Sign in with Roblox is put back online by Roswaal, and all of it remains subject to Roblox's applicable terms: its [Terms of Use](${ROBLOX.terms}) and its [Creator Third Party App Terms](${ROBLOX.appTerms}).`,
					"**Deleted when access ends.** Signing out asks Roblox to revoke the sign-in, and deletes it and the downloaded copies; access Roblox has already granted runs out by itself within 15 minutes. If Roswaal loses access to Roblox's APIs, the daemon deletes them the next time it runs.",
				],
			},

			{ t: "h", level: 2, text: "Services Roswaal uses" },
			{
				t: "p",
				text:
					"Each of these handles what you send it under its own policies, which Roswaal does " +
					"not control.",
			},
			{ t: "ul", items: SERVICES },

			{ t: "h", level: 2, text: "Children" },
			{
				t: "p",
				text:
					"Roswaal collects no personal information from anyone, of any age. Signing in with " +
					`Roblox is subject to Roblox's own rules for younger users, in its [Terms of Use](${ROBLOX.terms}) ` +
					`and its [Privacy and Cookie Policy](${ROBLOX.privacy}).`,
			},

			{ t: "h", level: 2, text: "Changes" },
			{
				t: "p",
				text:
					"A change to this policy is made on this page, with its Last Edited date, and named in the " +
					`release notes. ${CONTACT}`,
			},
		],
	};
}

export function termsPage(): DocPage {
	return {
		slug: "terms",
		narrow: true,
		title: "Terms of Service",
		summary: "Using Roswaal, what is yours, and what belongs to others.",
		blocks: [
			...datesOf(LEGAL_EDITED.terms),

			// The short version first, each line one the sections below back up.
			{ t: "h", level: 2, text: "You May" },
			{
				t: "ul",
				items: [
					"**Use Roswaal for anything**, personal or commercial, with no account.",
					"**Copy, change and share Roswaal's own code and assets**, as they are or modified, under its 0BSD licence, without needing to credit anyone. The third-party parts it includes keep their own licences, which you must follow; the [Attributions](attributions) page lists each one.",
					"**Keep, publish and sell what you make with it.** Your graphs, scripts and places are yours.",
					"**Sign in with Roblox** to draw your places' meshes, images and sky, and sign out at any time, which deletes what was downloaded. It is optional: you can make projects without it.",
				],
			},

			{ t: "h", level: 2, text: "You May Not" },
			{
				t: "ul",
				items: [
					"**Share assets Roswaal downloaded for you**, for example by committing them to a public repository, unless you have the right to.",
					"**Sell, or train AI on**, assets or data that came to you through Sign in with Roblox.",
					"**Sell, or train AI on, packages from the Wally registry**, unless the package's own licence allows it.",
					"**Use Roswaal to break the terms** of Roblox or the other services listed below, or to infringe anyone's rights.",
					"**Use Roswaal to reach what you are not allowed to**, or to get around a service's limits or security.",
					"**Present Roswaal as made or endorsed by Roblox Corporation.**",
				],
			},

			{ t: "h", level: 2, text: "Who Roswaal is for" },
			{
				t: "p",
				text:
					"Roswaal is designed primarily for people aged 18 and over. If you are under 18, ask a " +
					"parent or guardian before you use it, and read these terms, the [Privacy Policy](privacy) " +
					"and the terms of the services Roswaal uses with them first, whether your project is " +
					"personal or commercial.",
			},

			{ t: "h", level: 2, text: "The software" },
			{
				t: "p",
				text:
					"Roswaal is free, open-source software under the [0BSD licence](https://github.com/neopolitans/Roswaal/blob/main/LICENSE). " +
					"You may use, copy, modify and share it for any purpose. It is provided as is, without " +
					"warranty of any kind, and its authors are not liable for any damages arising from its " +
					"use, as the licence says in full.",
			},

			{ t: "h", level: 2, text: "Your work" },
			{
				t: "p",
				text:
					"Graphs, scripts and places you make with Roswaal are yours. Roswaal claims no rights " +
					"in them.",
			},

			{ t: "h", level: 2, text: "Other people's work" },
			{
				t: "ul",
				items: [
					"**You are responsible for having the right** to open, edit and share what you work on.",
					`**Assets downloaded from Roblox belong to their creators**, and [Roblox's Terms of Use](${ROBLOX.terms}) govern them. Roswaal keeps copies for your own work on your Roblox projects. Do not share them, for example by committing them to a public repository, unless you have the right to.`,
					"**Roblox's own assets are not downloaded**, and Roswaal draws a stand-in for them.",
				],
			},

			{ t: "h", level: 2, text: "Services Roswaal uses" },
			{
				t: "p",
				text:
					"Using a part of Roswaal that relies on one of these services means agreeing to that " +
					"service's own terms as well as these. Do not use Roswaal in a way they forbid.",
			},
			{ t: "ul", items: SERVICES },

			{ t: "h", level: 2, text: "Roblox" },
			{
				t: "p",
				text:
					"Roswaal is not affiliated with, endorsed by, or approved by Roblox Corporation. Luau " +
					"is a trademark of Roblox Corporation. Roblox, and the names of the engine's classes " +
					"and services, belong to Roblox Corporation. The Luau logo marks `.luau` files with " +
					"the Luau team's permission; Roswaal is not made by the Luau team.",
			},

			{ t: "h", level: 2, text: "Changes" },
			{
				t: "p",
				text:
					"A change to these terms is made on this page, with its Last Edited date, and named in the " +
					`release notes. ${CONTACT}`,
			},
		],
	};
}
