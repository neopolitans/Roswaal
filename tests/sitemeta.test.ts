/**
 * What a link to the site says before anybody opens it.
 *
 * Discord, a forum's onebox and a search engine read the page as it arrives:
 * the tags have to be in the HTML, absolute, and right for the build.
 */

import { describe, expect, it } from "vitest";

import {
	APP_PAGES,
	cardUrl,
	metaTags,
	SITE_DESCRIPTION,
	softwareJsonLd,
} from "../src/core/siteMeta.js";

const stable = { canary: false };
const canary = { canary: true };
const backup = { canary: false, backup: true };

const tag = (html: string, name: string) =>
	html.match(new RegExp(`(?:property|name)="${name}" content="([^"]*)"`))?.[1];

describe("a page's preview tags", () => {
	const home = metaTags(
		{ title: "Roswaal", description: SITE_DESCRIPTION, path: "", large: true },
		stable,
	);

	it("says what Discord and Discourse read, with every address absolute", () => {
		for (const name of ["og:title", "og:description", "og:image", "og:url", "og:site_name"]) {
			expect(tag(home, name), name).toBeTruthy();
		}
		expect(tag(home, "og:image")).toBe("https://roswaal.app/social-card.png");
		expect(tag(home, "og:url")).toBe("https://roswaal.app/");
		expect(home).toContain('rel="canonical" href="https://roswaal.app/"');
		expect(home).toContain('href="https://roswaal.app/favicon-32.png"');
	});

	it("keeps the description to what a search result shows", () => {
		expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
		for (const meta of Object.values(APP_PAGES)) {
			expect(meta.description.length, meta.path).toBeLessThanOrEqual(160);
		}
	});

	it("draws a front door large and a docs page as a thumbnail", () => {
		expect(tag(home, "twitter:card")).toBe("summary_large_image");
		const page = metaTags(
			{ title: "Print", description: "x", path: "docs/node/debug.print.html" },
			stable,
		);
		expect(tag(page, "twitter:card")).toBe("summary");
	});

	it("tells the canary apart: its address, its card, its colour and its title", () => {
		const html = metaTags(
			{ title: "Try Roswaal in your browser", description: "x", path: "try.html" },
			canary,
		);
		expect(tag(html, "og:url")).toBe("https://canary.roswaal.app/try.html");
		expect(tag(html, "og:image")).toBe("https://canary.roswaal.app/social-card-canary.png");
		expect(tag(html, "theme-color")).toBe("#b8860b");
		expect(tag(html, "og:title")).toBe("Try Roswaal in your browser · Canary");
		// Not twice, where the title already says so.
		const named = metaTags({ title: "Roswaal canary", description: "x", path: "" }, canary);
		expect(tag(named, "og:title")).toBe("Roswaal canary");
	});

	it("sends the copy at the old address to roswaal.app", () => {
		const html = metaTags({ title: "Roswaal", description: "x", path: "try.html" }, backup);
		expect(tag(html, "og:url")).toBe("https://roswaal.app/try.html");
		expect(cardUrl(backup)).toBe("https://roswaal.app/social-card.png");
	});

	it("points the app's docs page at the static docs, the ones to index", () => {
		const html = metaTags(APP_PAGES["docs.html"], stable);
		expect(html).toContain('rel="canonical" href="https://roswaal.app/docs/"');
		expect(tag(html, "og:url")).toBe("https://roswaal.app/docs.html");
	});

	it("escapes what it is given", () => {
		const html = metaTags({ title: 'A "quoted" <title>', description: "x & y", path: "" }, stable);
		expect(tag(html, "og:title")).toBe("A &quot;quoted&quot; &lt;title&gt;");
		expect(tag(html, "description")).toBe("x &amp; y");
	});

	it("gives Discourse a label it shows", () => {
		expect(tag(home, "twitter:label1")).toBe("Price");
		expect(tag(home, "twitter:data1")).toBe("Free");
	});
});

describe("the front page's structured data", () => {
	it("is free software for developers, and cannot close its own element", () => {
		const html = softwareJsonLd(stable);
		const data = JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, ""));
		expect(data["@type"]).toBe("SoftwareApplication");
		expect(data.offers.price).toBe("0");
		expect(data.url).toBe("https://roswaal.app/");
		expect(html.slice(0, -"</script>".length)).not.toContain("</");
	});
});
