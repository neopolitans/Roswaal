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
import { landingPage } from "../scripts/lib/landing.mjs";

const html: string = landingPage("9.9.9");

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
		expect(text).toContain("game:GetService(\"Players\")");
		expect(text).toContain("PlayerAdded:Connect(");
		// Highlighted, using the editor's own token classes rather than a second
		// colour scheme invented for this page.
		expect(html).toContain("tok-keyword");
		expect(html).toContain("tok-string");
	});

	it("carries no script of its own", () => {
		expect(html).not.toMatch(/<script[\s>]/i);
	});

	it("says which version it is, and that it is a preview", () => {
		expect(html).toContain("9.9.9");
		expect(html.toLowerCase()).toContain("preview");
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
	 * The attribution lives on its own page and is linked, not printed here.
	 * A landing page is chrome; the claim belongs in the documentation, where
	 * somebody looking for it will find it in full.
	 */
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
		const cards = [...html.matchAll(/<div class="landing-card([^"]*)"/g)].map((m) => m[1]);
		expect(cards.filter((c) => c.includes("planned")).length).toBe(6);
	});
});
