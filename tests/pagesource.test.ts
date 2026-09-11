/**
 * What the page editor hands back.
 *
 * The editor's whole claim is that a contributor can produce something a
 * maintainer pastes in — so the output is the part worth pinning down. A
 * picture written any way other than the `previews()` call the rest of
 * `site.ts` uses would arrive as something to rewrite rather than to paste,
 * which is the situation the editor exists to end.
 */

import { describe, expect, it } from "vitest";

import { pageSource } from "../src/app/PageEditor.js";
import { previewOf } from "../src/core/docs/preview.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { DocPage } from "../src/core/docs/site.js";

const registry = createRegistry();

const page: DocPage = { slug: "types", title: "Roswaal types", summary: "Types.", blocks: [] };
const source = (drafts: Parameters<typeof pageSource>[1]) => pageSource(page, drafts);

describe("a page as source", () => {
	it("says which page it is, and which build it was written against", () => {
		const out = source([]);
		expect(out).toContain("Roswaal types — types");
		expect(out.startsWith("//")).toBe(true);
		expect(out).toContain("blocks: [");
	});

	it("writes the ordinary blocks as the file writes them", () => {
		const out = source([
			{ block: { t: "h", level: 2, text: "Casting" } },
			{ block: { t: "p", text: "A pin's type is Roswaal's." } },
			{ block: { t: "note", kind: "warn", text: "A claim, not a check." } },
			{ block: { t: "code", lang: "luau", text: "local x = 1" } },
		]);

		expect(out).toContain('{ t: "h", level: 2, text: "Casting" },');
		expect(out).toContain('{ t: "p", text: "A pin\'s type is Roswaal\'s." },');
		expect(out).toContain('{ t: "note", kind: "warn", text: "A claim, not a check." },');
		expect(out).toContain('{ t: "code", lang: "luau", text: "local x = 1" },');
	});

	/** A picture is the thing a contributor could not write before. */
	it("writes a node picture as the previews() call the rest of the file uses", () => {
		const nodes = ["math.add", "debug.print"].map((id) => previewOf(registry.get(id)!));
		const out = source([
			{ block: { t: "preview", nodes, caption: "Two of them." }, ids: ["math.add", "debug.print"] },
		]);

		expect(out).toContain('...previews(registry, ["math.add", "debug.print"], "Two of them."),');
	});

	it("leaves the caption out when there is none", () => {
		const nodes = [previewOf(registry.get("math.add")!)];
		const out = source([{ block: { t: "preview", nodes }, ids: ["math.add"] }]);
		expect(out).toContain('...previews(registry, ["math.add"]),');
	});

	it("says where a graph came from, and that a named scene belongs elsewhere", () => {
		const script = { ...emptyish(), nodes: [{ id: "n", def: "script.begin", x: 0, y: 0 }] };
		const out = source([
			{ block: { t: "graph", script, caption: "A branch." }, path: ".roswaal/scripts/Demo.nodescript" },
		]);

		expect(out).toContain("// Built from .roswaal/scripts/Demo.nodescript.");
		expect(out).toContain("GUIDE_SCENES");
		expect(out).toContain('{ t: "graph", script: {');
		expect(out).toContain('caption: "A branch."');
	});

	/**
	 * A table is not editable in the editor, so it has to come back exactly as
	 * it went in. An editor that quietly drops what it cannot represent loses
	 * work nobody notices until later.
	 */
	it("hands back a block it cannot edit, unchanged", () => {
		const out = source([
			{ block: { t: "table", head: ["A", "B"], rows: [["1", "2"]] } },
		]);
		expect(out).toContain('{"t":"table","head":["A","B"],"rows":[["1","2"]]},');
	});

	it("escapes what a string cannot hold plainly", () => {
		const out = source([{ block: { t: "code", lang: "luau", text: 'print("hi")\nprint(2)' } }]);
		expect(out).toContain('text: "print(\\"hi\\")\\nprint(2)"');
	});
});

/** The fields a NodeScript needs, without importing the whole schema helper. */
function emptyish() {
	return {
		schemaVersion: 1,
		kind: "script" as const,
		id: "g",
		name: "Demo",
		scriptClass: "Script" as const,
		target: "roblox" as const,
		typecheck: "strict" as const,
		variables: [],
		nodes: [],
		links: [],
		comments: [],
	};
}
