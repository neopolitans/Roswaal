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

const EFFECTIVE = "Effective 7 November 2026.";
const CONTACT = `Questions about this page go to [roswaal-feedback](${FEEDBACK_REPOSITORY}/issues/new).`;

export function privacyPage(): DocPage {
	return {
		slug: "privacy",
		narrow: true,
		title: "Privacy Policy",
		summary: "What Roswaal keeps, where, and what it never collects.",
		blocks: [
			{ t: "p", text: EFFECTIVE },
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
					"roswaal.app, canary.roswaal.app and neopolitans.github.io/Roswaal are static files " +
					"served by GitHub Pages, and Cloudflare provides the domain's DNS. GitHub receives the " +
					"usual details of each request, such as your IP address and browser, under " +
					"[GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). " +
					"Roswaal itself receives nothing.",
			},
			{
				t: "ul",
				items: [
					"**A project made in the browser** is kept in the browser's private storage for this site.",
					"**A folder you open** stays where it is on your disk; the browser remembers which one, with your permission.",
					"**Your preferences and recent projects** are kept in the browser's local storage.",
				],
			},
			{
				t: "p",
				text: "None of it leaves your device. Clearing this site's data in your browser removes it.",
			},

			{ t: "h", level: 2, text: "The command line and its daemon" },
			{
				t: "p",
				text:
					"The `roswaal` command runs on your computer. Its daemon listens only on 127.0.0.1, " +
					"so nothing else on your network can reach it, and it reads and writes only the " +
					"project folder you choose. It goes online only when you ask it to: to install a " +
					"package from the [Wally](https://wally.run) registry, or to fetch a repository from " +
					"GitHub. Those services' own policies cover those requests.",
			},

			{ t: "h", level: 2, text: "Sign in with Roblox" },
			{
				t: "p",
				text:
					"Roswaal is adding an optional Sign in with Roblox, so a place's meshes, images and " +
					"sky can be drawn. It works as follows.",
			},
			{
				t: "ul",
				items: [
					"**Only when you choose.** Roblox asks for your consent on its own page, listing the permissions Roswaal asks for: downloading assets, and identifying your account so Roswaal can show who is signed in.",
					"**Kept on your computer.** The daemon stores the sign-in in your user profile, never in a project folder and never in a log.",
					"**Used for one thing.** Roswaal downloads the assets your places refer to, through Roblox's official API, and keeps copies in the project's own folder, kept out of Git by default. It never sends them, or your sign-in, anywhere else.",
					"**Roblox's own assets are not downloaded.** Roswaal draws a plain stand-in for anything Roblox made.",
					"**Never sold, and never used to train AI.**",
					"**Deleted when access ends.** Signing out revokes the sign-in and deletes it and the downloaded copies. If Roswaal loses access to Roblox's APIs, the daemon deletes them the next time it runs.",
				],
			},

			{ t: "h", level: 2, text: "Children" },
			{
				t: "p",
				text:
					"Roswaal collects no personal information from anyone, of any age. Signing in with " +
					"Roblox is subject to Roblox's own rules for younger users.",
			},

			{ t: "h", level: 2, text: "Changes" },
			{
				t: "p",
				text:
					"A change to this policy is made on this page, with its new date, and named in the " +
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
			{ t: "p", text: EFFECTIVE },

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
					"**Assets downloaded from Roblox belong to their creators**, and Roblox's Terms of Use govern them. Roswaal keeps copies for your own work on your Roblox projects. Do not share them, for example by committing them to a public repository, unless you have the right to.",
					"**Roblox's own assets are not downloaded**, and Roswaal draws a stand-in for them.",
				],
			},

			{ t: "h", level: 2, text: "Roblox" },
			{
				t: "p",
				text:
					"Signing in with Roblox is also subject to [Roblox's Terms of Use](https://www.roblox.com/info/terms). " +
					"Do not use Roswaal in a way those terms forbid. Roswaal is not affiliated with, " +
					"endorsed by, or approved by Roblox Corporation. Luau is a trademark of Roblox " +
					"Corporation. Roblox, and the names of the engine's classes and services, belong to " +
					"Roblox Corporation.",
			},

			{ t: "h", level: 2, text: "Other services" },
			{
				t: "p",
				text:
					"Installing a Wally package or fetching a repository from GitHub uses those services, " +
					"under their own terms.",
			},

			{ t: "h", level: 2, text: "Changes" },
			{
				t: "p",
				text:
					"A change to these terms is made on this page, with its new date, and named in the " +
					`release notes. ${CONTACT}`,
			},
		],
	};
}
