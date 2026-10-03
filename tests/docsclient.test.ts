/**
 * The published site's search box, run against a stand-in for the page.
 *
 * Two things it must do the way the editor does. It must rank with
 * `rankDocs` — a second scorer disagreed with the app about the order of two
 * pages that score the same. And it must print an index entry as text: a title
 * written into `innerHTML` is markup the page runs.
 */

import { describe, expect, it } from "vitest";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { buildDocsClient } from "../scripts/lib/docsClient.mjs";
import { rankDocs, type SearchEntry } from "../src/core/docs/search.js";

const client: string = await buildDocsClient();

/** Just enough of an element for the script: children, text, a class, events. */
class FakeElement {
	children: FakeElement[] = [];
	textContent = "";
	className = "";
	href = "";
	hidden = false;
	value = "";
	dataset: Record<string, string> = {};
	listeners = new Map<string, (event: unknown) => void>();
	constructor(readonly tag: string) {}
	set innerHTML(html: string) {
		throw new Error(`innerHTML written: ${html}`);
	}
	append(...nodes: FakeElement[]): void {
		this.children.push(...nodes);
	}
	replaceChildren(...nodes: FakeElement[]): void {
		this.children = nodes;
	}
	addEventListener(type: string, listener: (event: unknown) => void): void {
		this.listeners.set(type, listener);
	}
}
class FakeInput extends FakeElement {}

const INDEX: SearchEntry[] = [
	{
		slug: "b",
		title: "Zeta <img src=x onerror=alert(1)>",
		summary: "",
		section: "S",
		body: "loop",
	},
	{ slug: "a", title: "Alpha", summary: "", section: "<b>S</b>", body: "loop" },
	{ slug: "c", title: "Loop", summary: "", section: "S", body: "" },
];

/** Runs the bundle against a page holding the search box, and types `query`. */
async function search(query: string): Promise<FakeElement[]> {
	const box = new FakeInput("input");
	const results = new FakeElement("div");
	const tree = new FakeElement("div");
	const byId: Record<string, FakeElement> = { q: box, results, tree };
	const document = {
		documentElement: { dataset: { slug: "node/x" } },
		getElementById: (id: string) => byId[id] ?? null,
		createElement: (tag: string) => new FakeElement(tag),
		addEventListener: () => {},
	};
	const window: Record<string, unknown> = {};
	const fetch = async () => ({ json: async () => INDEX });
	const run = new Function(
		"window",
		"document",
		"fetch",
		"HTMLInputElement",
		"Element",
		"navigator",
		"setTimeout",
		client,
	);
	run(window, document, fetch, FakeInput, FakeElement, {}, () => 0);
	const shared = window.__roswaalSearch as { ready: Promise<void> };
	await shared.ready;
	box.value = query;
	box.listeners.get("input")!({});
	expect(results.hidden).toBe(false);
	return results.children;
}

describe("the site's search box", () => {
	it("ranks with rankDocs, ties and all", async () => {
		const hits = await search("loop");
		expect(hits.map((hit) => hit.href)).toEqual(
			rankDocs(INDEX, "loop", 25).map((hit) => `../${hit.entry.slug}.html`),
		);
		// The two passing mentions score the same, and sort by title as the
		// app's palette sorts them -- not by where they sit in the index.
		expect(hits.map((hit) => hit.children[0].textContent)).toEqual([
			"Loop",
			"Alpha",
			"Zeta <img src=x onerror=alert(1)>",
		]);
	});

	it("prints titles and sections as text", async () => {
		const hits = await search("a");
		const texts = hits.flatMap((hit) => hit.children.map((part) => part.textContent));
		expect(texts).toContain("<b>S</b>");
		expect(texts).toContain("Zeta <img src=x onerror=alert(1)>");
	});

	it("carries no scorer of its own", () => {
		expect(client).not.toContain("toLowerCase().indexOf");
	});
});
