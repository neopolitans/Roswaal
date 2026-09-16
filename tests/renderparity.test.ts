/**
 * The docs have two renderers, and a page is only documented if both draw it.
 *
 * `DocsPanel.tsx` draws the panel inside the app; `html.ts` draws the static
 * site. They read the same `DocPage` from `site.ts`, which makes it easy to
 * add a field, teach one renderer about it, and ship a build where the feature
 * is real in one place and invisible in the other. That is not hypothetical:
 * 0.67.2 put the second runtime tag in the static site alone, and it took a
 * screenshot from somebody reading the panel to notice.
 *
 * So the union and the page shape are read out of `site.ts` and both renderers
 * are required to mention every member. It is a source-text check rather than
 * a rendering one, because rendering the React panel needs a DOM and the thing
 * that actually goes wrong is a missing branch, not a wrong pixel. A renderer
 * that names a kind and then draws it badly is a different bug; a renderer
 * that never names it at all is this one, every time.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const site = read("../src/core/docs/site.ts");
const html = read("../src/core/docs/html.ts");
const panel = read("../src/app/DocsPanel.tsx");

/** Every `t:` in the `Block` union, which is the list of things a page can be made of. */
function blockKinds(source: string): string[] {
	const union = source.slice(source.indexOf("export type Block ="));
	const end = union.indexOf("\nexport ", 1);
	const body = end === -1 ? union : union.slice(0, end);
	const kinds = [...body.matchAll(/\|\s*\{\s*t:\s*"([a-z]+)"/g)].map((m) => m[1]);
	return [...new Set(kinds)].sort();
}

/** The fields of `DocPage`, which is what a renderer reads off the page itself. */
function pageFields(source: string): string[] {
	const start = source.indexOf("export interface DocPage {");
	const body = source.slice(start, source.indexOf("\n}", start));
	const fields = [...body.matchAll(/^\t([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
	return [...new Set(fields)].sort();
}

describe("the two docs renderers stay level", () => {
	const kinds = blockKinds(site);

	it("finds the whole block union", () => {
		// A regex that silently matched nothing would make every case below
		// pass, so the list is pinned to something with a known floor.
		expect(kinds.length).toBeGreaterThan(10);
		expect(kinds).toContain("p");
		expect(kinds).toContain("toolbar");
	});

	it.each(kinds)("both renderers handle a %s block", (kind) => {
		const needle = `"${kind}"`;
		expect(html.includes(needle), `html.ts never mentions ${needle}`).toBe(true);
		expect(panel.includes(needle), `DocsPanel.tsx never mentions ${needle}`).toBe(true);
	});

	/**
	 * `nodeId` is the one field that is legitimately one-sided: it exists so
	 * the panel can send the reader back to the palette, and the static site
	 * has no palette to send anybody to.
	 */
	const PANEL_ONLY = new Set(["nodeId"]);
	const fields = pageFields(site).filter((f) => !PANEL_ONLY.has(f));

	it("finds the whole page shape", () => {
		expect(fields).toContain("blocks");
		expect(fields).toContain("runtimeVia");
	});

	it.each(fields)("both renderers read page.%s", (field) => {
		expect(html.includes(field), `html.ts never reads ${field}`).toBe(true);
		expect(panel.includes(field), `DocsPanel.tsx never reads ${field}`).toBe(true);
	});
});
