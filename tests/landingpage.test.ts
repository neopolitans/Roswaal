/**
 * The page in front of the website.
 *
 * What is worth pinning down is not how it looks but what it is made of. Its
 * whole argument is one graph shown beside the Luau compiled from it, and both
 * halves are pulled out of the documentation's own model at build time — so a
 * page that quietly lost one of them would still build, still deploy, and still
 * look like a landing page, with the demonstration missing.
 *
 * And it carries no script, deliberately. `docs.js` threw on its first line for
 * as long as it did precisely because a script can fail silently in a way
 * markup cannot; the page that does the persuading should not be able to.
 */

import { describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { LANDING_SCRIPT, landingPage } from "../scripts/lib/landing.mjs";
import { taglineFor } from "../src/core/docs/releases.js";

/**
 * The stable page, said out loud rather than taken from the environment.
 *
 * `landingPage` defaults its channel to `ROSWAAL_CHANNEL`, and the site
 * workflow sets that for the whole job — so on the canary these assertions were
 * being made against a page with a different title and a different door, and
 * two of them failed on CI while passing on every developer's machine.
 */
const html: string = landingPage("9.9.9", { canary: false });

/**
 * The page as a reader sees it, tags removed.
 *
 * The code block is highlighted, so `game:GetService` is three elements and
 * never appears in the markup as one string. What matters is what it reads as.
 */
const text = html
	.replace(/<[^>]+>/g, "")
	.replace(/&quot;/g, '"')
	// Collapsed, because a sentence in the source is wrapped across lines and
	// indented; what a reader sees is one run of words.
	.replace(/\s+/g, " ");

describe("the landing page", () => {
	it("shows a graph, drawn rather than described", () => {
		expect(html).toContain("<svg");
		expect(html).toMatch(/viewBox="[-\d. ]+"/);
	});

	/**
	 * The recognisable half. If the example ever stops compiling to something
	 * with `Connect` in it, the page is still selling visual scripting but has
	 * stopped showing the line a Roblox developer came to judge.
	 */
	it("shows the Luau that graph compiles to", () => {
		expect(text).toContain('game:GetService("Players")');
		expect(text).toContain("PlayerAdded:Connect(");
		// Highlighted, using the editor's own token classes rather than a second
		// colour scheme invented for this page.
		expect(html).toContain("tok-keyword");
		expect(html).toContain("tok-string");
	});

	/**
	 * One script, and it is not this page's.
	 *
	 * The page had none at all, which was the point: nothing to execute, so
	 * nothing to go wrong on the first thing anybody sees. That held until the
	 * page needed to know something only the reader's browser knows -- which
	 * colour scheme they picked in the editor -- and the answer is the copy the
	 * documentation already ships rather than a script written for this page.
	 */
	it("carries the shared theme script and the split bar's, and nothing inline", () => {
		const scripts = [...html.matchAll(/<script[^>]*>/gi)].map((m) => m[0]);
		expect(scripts).toHaveLength(2);
		expect(scripts[0]).toContain("docs/theme.js");
		expect(scripts[1]).toContain("landing.js");
		expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/i);
	});

	/** The split is CSS: a page whose script did not load still shows both halves at 60/40. */
	it("splits the graph and its Luau 60/40 without the script", () => {
		expect(html).toContain('class="landing-show" style="--split: 60%"');
		expect(html).toContain('role="separator"');
		expect(() => new Function(LANDING_SCRIPT)).not.toThrow();
	});

	/** Its graph is the docs' viewer: a pan-and-zoom frame with a grip that sets its height. */
	it("makes the graph a viewer whose height can be dragged", () => {
		expect(html).toContain('class="docs-preview graph landing-graph"><div class="graph-viewport">');
		expect(html).toContain('class="landing-graph-grip" role="separator"');
	});

	it("opens on a banner whose graph is drawn, not pictured", () => {
		const banner = /<header class="landing-banner[^"]*">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? "";
		expect(banner).toContain("<h1>Roswaal</h1>");
		expect(banner).toContain("<svg");
		expect(banner).toContain("Connect Event");
		expect(banner).toContain("Touched");
	});

	/**
	 * The version is on the page twice -- beside the name and in the footer -- and
	 * it no longer calls itself a preview. Those two phrases went out with the
	 * repository being opened, and a rewrite that quietly reinstates either would
	 * be telling people the release has not happened yet.
	 *
	 * The word "preview" itself still appears: `P` previews a graph, and that
	 * feature is not going anywhere. It is the status claim that is gone.
	 */
	it("says which version it is, and no longer calls itself provisional", () => {
		expect(html).toContain("9.9.9");
		expect(text).not.toContain("ahead of the first release");
		expect(html).not.toMatch(/class="tag">preview/i);
	});

	/**
	 * Every link is relative to the site root, so the page works at
	 * `neopolitans.github.io/Roswaal/` and at a domain of its own without being
	 * rebuilt differently. A leading slash would work at exactly one of those.
	 */
	it("links within the site without assuming where the site is", () => {
		const internal = [...html.matchAll(/href="(?!https?:|#)([^"]+)"/g)].map((m) => m[1]);
		expect(internal.length).toBeGreaterThan(0);
		expect(internal.filter((href) => href.startsWith("/"))).toEqual([]);
		expect(internal).toContain("try.html");
		expect(internal).toContain("docs/");
	});

	/**
	 * Feedback goes to the public repository. The source one is private, and a
	 * dead link on the first page somebody sees is worse than no link.
	 */
	it("sends feedback somewhere that exists", () => {
		expect(html).toContain("roswaal-feedback");
		expect(html).not.toContain("github.com/neopolitans/Roswaal/issues");
	});

	/**
	 * The source, linked plainly.
	 *
	 * A shields.io badge would be a third party's image on the first page anybody
	 * sees, and it would report a star count that says nothing on day one. The
	 * link goes to the repository root rather than to `issues` -- feedback has a
	 * repository of its own, and the two are not the same door.
	 */
	it("links its own source, without borrowing a mark to do it", () => {
		expect(html).toContain('href="https://github.com/neopolitans/Roswaal"');
		expect(text).toContain("Source on GitHub");
		// No image pulled from anywhere else, and no inlined third-party logo.
		expect(html).not.toContain("shields.io");
		expect(html).not.toMatch(/<img[^>]+https?:/i);
	});

	/**
	 * The attribution lives on its own page and is linked, not printed here.
	 * A landing page is chrome; the claim belongs in the documentation, where
	 * somebody looking for it will find it in full.
	 */
	/** Every third-party name the page uses, with whose it is and that Roswaal is not theirs. */
	it("says whose names it uses, and that Roswaal is independent of them", () => {
		const legal = (/<p class="landing-legal">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "").replace(
			/\s+/g,
			" ",
		);
		for (const owner of ["Roblox Corporation", "Rojo Developers", "Filip Tibell", "Epic Games"]) {
			expect(legal).toContain(owner);
		}
		expect(legal).toContain("not affiliated with");
		expect(legal).toContain("independent open-source project");
	});

	it("links the attributions rather than reciting them", () => {
		expect(html).toContain("docs/attributions.html");
		expect(html).not.toMatch(/KADOKAWA|Re:Zero/i);
	});
});

describe("the Luau on it is coloured", () => {
	/**
	 * The classes being in the markup is not the same as the colours being on
	 * the screen, and my first test asserted only the first of those — so the
	 * page shipped with its code block in one flat grey and passed.
	 *
	 * The palette is scoped to a list of containers, deliberately, and the
	 * comment above it in `theme.css` says so: extending that list is what you
	 * do when a fourth place shows Luau. This checks the landing page is in it.
	 */
	it("puts its code block in the list the palette is scoped to", async () => {
		const { readFile } = await import("node:fs/promises");
		const { join, dirname } = await import("node:path");
		const { fileURLToPath } = await import("node:url");
		const root = join(dirname(fileURLToPath(import.meta.url)), "..");
		const css = await readFile(join(root, "src", "app", "theme.css"), "utf8");

		const scoped = [...css.matchAll(/:is\(([^)]*)\)\s*\.tok-keyword/g)].map((m) => m[1]);
		expect(scoped.length).toBeGreaterThan(0);
		for (const list of scoped) expect(list).toContain("landing-code");
	});
});

describe("what the page claims it runs on", () => {
	/**
	 * Roswaal targets two runtimes and is honest about only one of them being
	 * proven. "Experimental" is exactly the qualifier that gets tidied away in a
	 * rewrite, so it is asserted rather than trusted.
	 */
	it("names both runtimes and marks Lune experimental", () => {
		expect(text).toContain("Roblox");
		expect(text).toContain("Lune");
		expect(text.toLowerCase()).toContain("experimental");
	});

	/** The tab is where the name is read first, so it says what Roswaal is. */
	it("titles the tab with what Roswaal is", () => {
		const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
		expect(title).toBe("Roswaal - Visual Scripting for Luau");
	});
});

/**
 * The footer's line about this version.
 *
 * It used to read "the first public release", which was true once and then
 * quietly stopped being: a hand-written line about a moment cannot go on
 * describing the version beside it. Every release already writes a `headline`
 * for exactly this purpose, so the footer reads that rather than keeping its
 * own copy to forget.
 */
describe("the version's tagline", () => {
	it("takes it from the release notes rather than from the page", () => {
		const page: string = landingPage("0.59.1", { canary: false });
		expect(page).toContain(taglineFor("0.59.1"));
		expect(taglineFor("0.59.1")).toBe("The source is public.");
	});

	/** The line that went stale, and must not come back. */
	it("no longer claims to be the first public release", () => {
		expect(html).not.toContain("the first public release");
	});

	/**
	 * A build from between releases has no entry. The number alone is honest;
	 * the previous release's headline beside this one's version would not be.
	 */
	it("says only the number for a version it has no line for", () => {
		expect(taglineFor("9.9.9")).toBeUndefined();
		const page: string = landingPage("9.9.9", { canary: false });
		const foot = page.slice(page.indexOf('class="landing-foot"'));
		expect(foot).toContain("Roswaal 9.9.9</span>");
	});

	/** The links go to the other end, so a growing sentence has room. */
	it("pushes the links away from the version", () => {
		expect(html).toContain('class="landing-version"');
		expect(html).toContain(".landing-foot .landing-version { margin-right: auto; }");
	});
});

describe("what is planned, told apart from what is there", () => {
	/**
	 * The roadmap sits directly above a "try it" link, so the distinction has to
	 * survive skim-reading: a plan that looks like a feature is a promise nobody
	 * made.
	 */
	it("carries a disclaimer, and says none of it has shipped", () => {
		expect(text).toMatch(/Plans rather than promises/);
		expect(text).toMatch(/none of it is in the version you can try today/);
	});

	it("marks every planned card as planned", () => {
		const plans = html.slice(
			html.indexOf('class="landing-note-plan"'),
			html.indexOf('class="landing-foot"'),
		);
		const cards = [...plans.matchAll(/<div class="landing-card([^"]*)"/g)].map((m) => m[1]);
		expect(cards.length).toBeGreaterThan(0);
		expect(cards.every((c) => c.includes("planned"))).toBe(true);
	});
});

describe("the mark on the front page", () => {
	/**
	 * The editor's mark wears the build's colour -- blue for the web app,
	 * yellow for the canary -- and the front page's mark is the same claim
	 * about the same build, so it follows the channel too.
	 */
	it("is yellow on the canary and the page's own colour otherwise", () => {
		expect(landingPage("9.9.9", { canary: true })).toContain('class="landing-banner canary"');
		expect(landingPage("9.9.9", { canary: false })).toContain('class="landing-banner"');
		expect(landingPage("9.9.9", { canary: false })).not.toContain('class="landing-banner canary"');
	});
});

describe("the canary's strip", () => {
	const canary: string = landingPage("9.9.9", { canary: true });

	/** The divider becomes the notice: what this build is, and a door to the stable one. */
	it("says what the canary is under the banner, with a way to the stable build", () => {
		const strip = /<div class="landing-strip"[\s\S]*?<\/div>\n<\/div>/.exec(canary)?.[0] ?? "";
		expect(strip).toContain("unreleased build");
		expect(strip).toContain('class="strip-stable" href="https://roswaal.app/"');
		expect(strip).toMatch(/Roswaal <span class="flag">stable<\/span>/);
		expect(canary.indexOf('<div class="landing-strip"')).toBeGreaterThan(
			canary.indexOf('<header class="landing-banner'),
		);
	});

	it("is only on the canary", () => {
		expect(html).not.toContain('class="landing-strip"');
	});
});

describe("the copy at the old address", () => {
	const backup: string = landingPage("9.9.9", { canary: false, backup: true });

	/** It is kept so projects can be rescued, and says where the site went. */
	it("points to roswaal.app and keeps out of search", () => {
		expect(backup).toContain('class="landing-canary landing-backup"');
		expect(backup).toContain('href="https://roswaal.app/"');
		expect(backup).toContain('<meta name="robots" content="noindex" />');
	});

	it("is not on the site at roswaal.app", () => {
		expect(html).not.toContain('class="landing-canary landing-backup"');
		expect(html).not.toContain('<meta name="robots" content="noindex" />');
	});
});
