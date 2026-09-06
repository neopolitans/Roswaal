/**
 * The documentation site model and its search.
 *
 * Three renderers walk this tree, so a mistake here shows up in all of them. The
 * tests that matter are the structural ones: every page reachable, every node
 * documented, and search ranking a title above a passing mention.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import {
	allPages, blockText, buildSearchIndex, buildSite, findPage, GROUPS, parseInline, searchDocs,
} from "../src/core/docs/site.js";
import { RELEASES } from "../src/core/docs/releases.js";
import { VERSION } from "../src/cli/version.js";
import type { NodeDef } from "../src/core/schema.js";

const registry = createRegistry();
const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));
const site = buildSite(registry, builtinIds);
const index = buildSearchIndex(site);

describe("inline markup", () => {
	it("splits code, bold, italic and links out of a line", () => {
		expect(parseInline("a `b` **c** *d* [e](f)")).toEqual([
			{ t: "text", text: "a " },
			{ t: "code", text: "b" },
			{ t: "text", text: " " },
			{ t: "strong", text: "c" },
			{ t: "text", text: " " },
			{ t: "em", text: "d" },
			{ t: "text", text: " " },
			{ t: "link", text: "e", href: "f" },
		]);
	});

	it("leaves a plain line alone", () => {
		expect(parseInline("nothing special")).toEqual([{ t: "text", text: "nothing special" }]);
	});

	/** The search index is built from this, so markup must not leak into it. */
	it("strips markup when flattening a block to text", () => {
		expect(blockText({ t: "p", text: "wire a `Vector3` in **first**" }))
			.toBe("wire a Vector3 in first");
	});
});

describe("the site", () => {
	it("gives every node in the registry a page", () => {
		const pages = allPages(site).filter((p) => p.nodeId);
		expect(pages).toHaveLength(registry.size);
		for (const def of registry.values()) {
			expect(findPage(site, `node/${def.id}`), `no page for ${def.id}`).toBeDefined();
		}
	});

	it("has no two pages sharing a slug", () => {
		const slugs = allPages(site).map((p) => p.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it("gives every page a title and a summary", () => {
		for (const page of allPages(site)) {
			expect(page.title, page.slug).not.toBe("");
			expect(page.summary, page.slug).not.toBe("");
			expect(page.blocks.length, page.slug).toBeGreaterThan(0);
		}
	});

	it("orders the node sections the way the palette does", () => {
		const nodeSections = site.sections.filter((s) => s.slug.startsWith("nodes/"));
		expect(nodeSections[0].title).toBe("Flow");
		expect(nodeSections.map((s) => s.title)).toContain("CFrames");
	});

	/**
	 * A pack's node used to be discoverable only by clicking into a category and
	 * noticing the badge. Grouping them apart means you know before you click.
	 */
	it("keeps pack nodes in their own nav group", () => {
		const pack: NodeDef = {
			id: "mypack.thing", title: "Thing", category: "Math",
			pure: true, inputs: [], outputs: [{ id: "result", name: "", kind: "data", type: "number" }],
			compilesTo: { kind: "expr", outputs: { result: "1" } },
		};
		const withPack = buildSite(createRegistry([pack]), builtinIds);

		const project = withPack.sections.filter((s) => s.group === GROUPS.project);
		expect(project.flatMap((s) => s.pages.map((p) => p.nodeId))).toEqual(["mypack.thing"]);

		// It shares a category name with built-ins, and still does not leak in.
		const builtinMath = withPack.sections.find(
			(s) => s.group === GROUPS.builtin && s.title === "Math",
		)!;
		expect(builtinMath.pages.every((p) => !p.custom)).toBe(true);
	});

	it("gives every section a group", () => {
		for (const section of site.sections) {
			expect(section.group, section.slug).toBeTruthy();
		}
	});

	it("has no Project nodes group when the project has no packs", () => {
		expect(site.sections.some((s) => s.group === GROUPS.project)).toBe(false);
	});
});

describe("release notes", () => {
	it("has a page, newest first", () => {
		const page = findPage(site, "release-notes")!;
		expect(page).toBeDefined();
		const headings = page.blocks.filter((b) => b.t === "h" && b.level === 2);
		expect(headings.length).toBe(RELEASES.length);
		expect(blockText(headings[0])).toContain(RELEASES[0].version);
	});

	/**
	 * The notes describe a release, so they must not fall behind the one people
	 * are actually running. Hand-written prose plus an automatic check is the
	 * only combination that stays both useful and true.
	 */
	it("documents the version that ships", () => {
		expect(RELEASES[0].version).toBe(VERSION);
	});

	it("dates every release absolutely", () => {
		for (const release of RELEASES) {
			expect(release.date, release.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(release.headline, release.version).not.toBe("");
		}
	});

	it("says something in every entry it lists", () => {
		for (const release of RELEASES) {
			const bullets = [
				...(release.added ?? []), ...(release.changed ?? []),
				...(release.fixed ?? []), ...(release.watch ?? []),
			];
			expect(bullets.length, `${release.version} lists nothing`).toBeGreaterThan(0);
			for (const line of bullets) expect(line.trim()).not.toBe("");
		}
	});
});

describe("node pages", () => {
	/**
	 * The reason the reference is generated in core rather than at build time: a
	 * project's own pack gets documented by the same code, in the browser.
	 */
	it("documents a project's custom nodes alongside the built-ins", () => {
		const pack: NodeDef = {
			id: "mypack.spawnEnemy",
			title: "Spawn Enemy",
			category: "Custom",
			summary: "Spawns one.",
			inputs: [{ id: "in", name: "", kind: "exec" }],
			outputs: [{ id: "then", name: "", kind: "exec" }],
			compilesTo: { kind: "statement", template: "spawnEnemy()" },
		};

		const withPack = buildSite(createRegistry([pack]), builtinIds);
		const page = findPage(withPack, "node/mypack.spawnEnemy")!;

		expect(page).toBeDefined();
		expect(page.custom).toBe(true);
		expect(page.title).toBe("Spawn Enemy");
		// And it is compiled like any other, so the pack author sees real output.
		expect(page.blocks.some((b) => b.t === "code" && b.text.includes("spawnEnemy()"))).toBe(true);
	});

	/**
	 * An output is a value the node hands back: it has no default to fall back
	 * on and no wire to demand, so "must be wired" is meaningless on one. The
	 * page said it about every output until the pin table made it visible.
	 */
	it("never calls an output required", () => {
		for (const page of allPages(site).filter((p) => p.nodeId)) {
			const outputs = page.blocks.find((b) => b.t === "pins" && b.title === "Outputs");
			if (!outputs || outputs.t !== "pins") continue;
			for (const pin of outputs.pins) {
				expect(pin.required, `${page.slug} output ${pin.id}`).toBe(false);
			}
		}
	});

	it("does not repeat the summary as the first paragraph", () => {
		const page = findPage(site, "node/cframe.lookAt")!;
		const first = page.blocks[0];
		expect(first.t === "p" && first.text === page.summary).toBe(false);
	});

	it("warns on a node page about pins that cannot be wired", () => {
		const page = findPage(site, "node/roblox.getProperty")!;
		const warning = page.blocks.find((b) => b.t === "note" && b.kind === "warn");
		expect(warning).toBeDefined();
		expect(blockText(warning!)).toContain("Property");
	});

	it("records the decompositions of a splittable pin", () => {
		const page = findPage(site, "node/cframe.mul")!;
		const inputs = page.blocks.find((b) => b.t === "pins" && b.title === "Inputs");
		expect(inputs?.t === "pins" && inputs.pins[0].splitModes).toContain("Position, Rotation");
	});
});

describe("coming from Blueprints, as a page", () => {
	it("renders every section of the mapping", () => {
		const page = findPage(site, "coming-from-blueprints")!;
		const tables = page.blocks.filter((b) => b.t === "table");
		expect(tables.length).toBeGreaterThanOrEqual(7);
	});

	it("says out loud where nothing is equivalent", () => {
		const page = findPage(site, "coming-from-blueprints")!;
		const text = page.blocks.map(blockText).join(" ");
		expect(text).toContain("nothing equivalent");
		expect(text).toContain("Construction Script");
	});
});

describe("search", () => {
	it("finds nothing for an empty query", () => {
		expect(searchDocs(index, "   ")).toEqual([]);
	});

	/** A title you half-remember beats a page that mentions the word in passing. */
	it("ranks an exact node title first", () => {
		expect(searchDocs(index, "Branch")[0].slug).toBe("node/flow.branch");
		expect(searchDocs(index, "look at")[0].slug).toBe("node/cframe.lookAt");
	});

	it("finds a node by its id as well as its title", () => {
		expect(searchDocs(index, "cframe.lookAt").map((r) => r.slug)).toContain("node/cframe.lookAt");
	});

	it("falls back to the body of a page", () => {
		const hits = searchDocs(index, "hoisted").map((r) => r.slug);
		expect(hits.length).toBeGreaterThan(0);
	});

	it("finds the guide for a concept that is not a node name", () => {
		expect(searchDocs(index, "wires and pins")[0].slug).toBe("wires-and-pins");
	});

	it("respects the limit", () => {
		expect(searchDocs(index, "e", 5).length).toBeLessThanOrEqual(5);
	});
});
