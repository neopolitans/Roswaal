/**
 * The specification as its own site: every link inside it lands on a page it
 * has, links out of it go to the published docs, and a frozen copy stays
 * inside itself.
 */

import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import { GROUPS } from "../src/core/docs/site.js";
import { technicalSections } from "../src/core/docs/technical/index.js";
import { SPEC_DRAFT } from "../src/core/docs/technical/spec.js";
import { renderSpecSite, specPath } from "../src/core/docs/technical/specSite.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();
const sections = technicalSections(GROUPS.technical, { registry });
const base = {
	sections,
	render: { version: "test" },
	docsBase: "https://roswaal.app/docs/",
	tryHref: "https://roswaal.app/try.html",
	draft: SPEC_DRAFT,
	drafts: [SPEC_DRAFT],
	version: "test",
};

function hrefs(html: string): string[] {
	return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

describe("the specification's own site", () => {
	const files = renderSpecSite({
		...base,
		latest: true,
		canonicalBase: "https://spec.roswaal.app/",
	});
	const paths = new Set(files.map((f) => f.path));

	it("writes a page per chapter, in a folder of its own, and a search index", () => {
		const pages = sections.flatMap((s) => s.pages);
		for (const page of pages)
			expect(paths.has(`${specPath(page.slug)}index.html`), page.slug).toBe(true);
		expect(paths.has("search.json")).toBe(true);
		expect(paths.has("visual-grammar/index.html")).toBe(true);
	});

	it("links every page inside the tree to a page it has", () => {
		const broken: string[] = [];
		for (const file of files.filter((f) => f.path.endsWith(".html"))) {
			const dir = posix.dirname(file.path);
			for (const href of hrefs(file.contents)) {
				if (/^(https?:|#|mailto:|data:)/.test(href) || href.endsWith(".css")) continue;
				// The draft switcher's links into a frozen copy, which is a tree of
				// its own beside this one.
				if (/(^|\/)\d+\.\d+\/$/.test(href)) continue;
				const target = posix.normalize(posix.join(dir, href.split("#")[0]));
				const page =
					target === "." || target.endsWith("/")
						? `${target === "." ? "" : target}index.html`
						: target;
				if (!paths.has(page.replace(/^\.\//, "")) && !paths.has(`${page}/index.html`)) {
					broken.push(`${file.path} -> ${href}`);
				}
			}
		}
		expect(broken).toEqual([]);
	});

	it("sends links to the rest of the docs to the published docs", () => {
		const types = files.find((f) => f.path === "types/index.html")!;
		// 6.3's examples name the Roblox profile's types; the guides it leans on
		// are in the docs, not here.
		const out = hrefs(types.contents).filter((h) => h.startsWith("https://roswaal.app/docs/"));
		for (const href of out)
			expect(href).toMatch(/^https:\/\/roswaal\.app\/docs\/[\w./-]+\.html(#.*)?$/);
		const principles = files.find((f) => f.path === "principles/index.html")!;
		expect(principles.contents).toContain(
			'href="https://roswaal.app/docs/coming-from-blueprints.html"',
		);
	});

	it("names spec.roswaal.app as each page's canonical address", () => {
		const page = files.find((f) => f.path === "execution/index.html")!;
		expect(page.contents).toContain(
			'<link rel="canonical" href="https://spec.roswaal.app/execution/">',
		);
	});

	it("keeps a frozen draft's links inside the frozen draft, and Latest one folder up", () => {
		const frozen = renderSpecSite({
			...base,
			latest: false,
			canonicalBase: `https://spec.roswaal.app/${SPEC_DRAFT}/`,
		});
		const page = frozen.find((f) => f.path === "types/index.html")!;
		expect(page.contents).toContain('href="../overview/"');
		expect(page.contents).toContain('href="../../">Latest</a>');
		expect(page.contents).toContain(
			`<link rel="canonical" href="https://spec.roswaal.app/${SPEC_DRAFT}/types/">`,
		);
	});
});
