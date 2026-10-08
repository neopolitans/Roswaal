/**
 * The documentation site model and its search.
 *
 * Three renderers walk this tree, so a mistake here shows up in all of them. The
 * tests that matter are the structural ones: every page reachable, every node
 * documented, and search ranking a title above a passing mention.
 */

import { describe, expect, it } from "vitest";
import { VERSION } from "../src/cli/version.js";
import { renderPage } from "../src/core/docs/html.js";
import { code } from "../src/core/docs/pages/blocks.js";
import { RECENT_MINORS } from "../src/core/docs/pages/releaseNotes.js";
import { RELEASES } from "../src/core/docs/releases.js";
import { reviewLine } from "../src/core/docs/reviews.js";
import {
	allPages,
	type Block,
	blockStrings,
	blockText,
	buildSearchIndex,
	buildSite,
	type DocPage,
	findPage,
	GROUPS,
	isPageLink,
	parseInline,
	releasePageSlug,
	releaseTags,
	type StringSlot,
	searchDocs,
	TAG_LABELS,
} from "../src/core/docs/site.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
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
		expect(blockText({ t: "p", text: "wire a `Vector3` in **first**" })).toBe(
			"wire a Vector3 in first",
		);
	});
});

describe("code samples", () => {
	it("takes the closing backtick's indent off every line", () => {
		const text = code`
			if ready then
				go()

			end
			`;
		expect(text).toBe("if ready then\n\tgo()\n\nend");
	});

	it("keeps a final newline written as an empty last line", () => {
		expect(code`
			x

			`).toBe("x\n");
	});

	it("refuses a line left of the margin, rather than shifting it", () => {
		expect(
			() => code`
			fine
		left
			`,
		).toThrow(/left of its closing backtick/);
	});

	it("refuses a sample that starts on the backtick's line", () => {
		expect(
			() => code`x
			`,
		).toThrow(/lines of their own/);
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
		const nodeSections = site.sections.filter(
			(s) => s.slug.startsWith("nodes/") && !s.slug.startsWith("nodes/engine-types/"),
		);
		expect(nodeSections[0].title).toBe("Flow");
		expect(nodeSections.map((s) => s.title)).toContain("Math");
	});

	/**
	 * The datatypes are their own nav group, one section per type. The failure
	 * this guards is a Vector3 page appearing under both "Engine types" and a
	 * flat "Engine Types" section in the built-in group — which is what happens
	 * if the category is left in the ordinary reference as well.
	 */
	it("gives every datatype its own section, and lists each node once", () => {
		const engine = site.sections.filter((s) => s.group === GROUPS.engineTypes);
		expect(engine.map((s) => s.title)).toEqual([
			"Vector3",
			"Vector2",
			"CFrame",
			"Color3",
			"BrickColor",
			"UDim",
			"UDim2",
			"TweenInfo",
			"Tween",
		]);

		const builtin = site.sections.filter((s) => s.group === GROUPS.builtin);
		expect(builtin.map((s) => s.title)).not.toContain("Engine Types");

		const ids = allPages(site)
			.map((p) => p.nodeId)
			.filter(Boolean);
		expect(new Set(ids).size, "a node is documented on exactly one page").toBe(ids.length);
	});

	/**
	 * A pack's node used to be discoverable only by clicking into a category and
	 * noticing the badge. Grouping them apart means you know before you click.
	 */
	it("keeps pack nodes in their own nav group", () => {
		const pack: NodeDef = {
			id: "mypack.thing",
			title: "Thing",
			category: "Math",
			pure: true,
			inputs: [],
			outputs: [{ id: "result", name: "", kind: "data", type: "number" }],
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

describe("inline markup in the pages themselves", () => {
	/**
	 * Inline markup does not nest, at all. `parseInline` gives `strong`, `em`
	 * and `code` a flat string and matches one span at a time, so anything
	 * inside any of them is printed as the characters it is written with.
	 *
	 * This was held as "no link or italics inside bold", which is how a link on
	 * Attributions shipped and how the note announcing that fix did.
	 * **Code counts too**, and that was missed: four strings on the Aliases page
	 * printed `` `.luaurc` `` with its backticks because it was written inside
	 * bold, and the test passed the whole time. The rule is now what the parser
	 * actually does rather than a list of the ways it had been broken so far.
	 *
	 * A pattern over the raw string was tried first and matched across two
	 * separate bold spans, so every string goes through the real parser.
	 */
	it("never nests markup, in any direction", () => {
		for (const page of allPages(site)) {
			for (const text of pageStrings(page, "inline")) {
				const where = `${page.slug}: ${text.slice(0, 60)}`;
				for (const run of parseInline(text)) {
					if (run.t === "text") expect(run.text, where).not.toContain("*");
					if (run.t !== "strong" && run.t !== "em" && run.t !== "link") continue;
					// A link, italics, or a code span: all three print their own
					// syntax when they are written inside one of these, and a
					// link's text is a flat string too.
					expect(run.text, where).not.toContain("](");
					expect(run.text, where).not.toContain("`");
					expect(run.text, where).not.toContain("*");
				}
			}
		}
	});

	/**
	 * A slot printed as it is — a tab's title, a legend's control name, a
	 * table's head — shows its markup as characters, so it must carry none.
	 */
	it("writes no markup where the renderer prints the string as it is", () => {
		for (const page of allPages(site)) {
			for (const text of [page.title, ...pageStrings(page, "plain")]) {
				const runs = parseInline(text);
				expect(
					runs.every((run) => run.t === "text"),
					`${page.slug}: ${text.slice(0, 60)}`,
				).toBe(true);
			}
		}
	});

	/** A summary is markup like any other line, and the meta tag has none. */
	it("renders a page's summary as markup, and strips it for the meta tag", () => {
		const page = allPages(site).find((p) => p.summary.includes("`"));
		expect(page, "no summary carries a code span, so this checks nothing").toBeDefined();
		const html = renderPage(site, page!, { version: VERSION });
		const summary = /<p class="summary">(.*?)<\/p>/.exec(html)![1];
		const meta = /<meta name="description" content="([^"]*)">/.exec(html)![1];
		expect(summary).toContain("<code>");
		expect(summary).not.toContain("`");
		expect(meta).not.toContain("`");
		expect(buildSearchIndex(site).find((e) => e.slug === page!.slug)!.summary).not.toContain("`");
	});

	it("links every page link to a page that exists", () => {
		const slugs = new Set(allPages(site).map((p) => p.slug));
		const broken: string[] = [];
		for (const page of allPages(site)) {
			for (const text of pageStrings(page, "inline")) {
				for (const run of parseInline(text)) {
					if (run.t === "link" && isPageLink(run.href) && !slugs.has(run.href)) {
						broken.push(`${page.slug} -> ${run.href}`);
					}
				}
			}
		}
		expect(broken).toEqual([]);
	});
});

/**
 * Every string on a page in one slot: the page's own lines (its summary, and
 * the review lines under it) and every block's, nested blocks included.
 */
function pageStrings(page: DocPage, slot: StringSlot): string[] {
	const own =
		slot === "inline"
			? [page.summary, ...(page.review ? [reviewLine(page.review)] : []), page.review?.verify ?? ""]
			: [];
	const blocks = page.blocks
		.flatMap((block) => blockStrings(block))
		.filter((one) => one.slot === slot)
		.map((one) => one.text);
	return [...own, ...blocks].filter((text) => text !== "");
}

describe("release notes", () => {
	const releasePages = site.sections.find((s) => s.slug === "releases")!.pages;
	const minorBlock = (page: DocPage) =>
		page.blocks.find((b): b is Block & { t: "releaseMinor" } => b.t === "releaseMinor")!;
	const minors = [...new Set(RELEASES.map((r) => r.version.split(".").slice(0, 2).join(".")))];

	/**
	 * A minor version is what somebody upgrading moves across, and most releases
	 * are a few lines: one page each for 0.144.x, 0.143.x, and so on, holding
	 * every one of its releases, newest first.
	 */
	it("gives each minor version a page holding all of its releases, newest first", () => {
		expect(releasePages[0].slug).toBe("release-notes");
		expect(releasePages.slice(1).map((p) => p.slug)).toEqual(
			minors.map((m) => `release-notes/${m}`),
		);
		for (const page of releasePages.slice(1)) {
			const view = minorBlock(page).minor;
			const own = RELEASES.filter((r) => releasePageSlug(r.version) === page.slug);
			expect(
				view.releases.map((r) => r.version),
				page.slug,
			).toEqual(own.map((r) => r.version));
			expect(page.title).toBe(`${view.minor}.x`);
		}
		// The newest is marked once, on the newest minor version and its newest release.
		const marked = releasePages.slice(1).filter((p) => minorBlock(p).minor.latest);
		expect(marked.map((p) => p.slug)).toEqual([releasePageSlug(RELEASES[0].version)]);
		expect(minorBlock(marked[0]).minor.releases[0]).toMatchObject({
			version: RELEASES[0].version,
			latest: true,
		});
	});

	/**
	 * Read together, but every line still says which release it shipped in, and
	 * nothing a release said is lost or moved to another.
	 */
	it("badges every line with the release it shipped in", () => {
		for (const page of releasePages.slice(1)) {
			const view = minorBlock(page).minor;
			const own = new Map(
				RELEASES.filter((r) => releasePageSlug(r.version) === page.slug).map((r) => [r.version, r]),
			);
			const lines = [
				...view.watch.map((l) => ["watch", l] as const),
				...view.sections.flatMap((s) => s.entries.map((l) => [s.kind, l] as const)),
			];
			for (const [kind, line] of lines) {
				const release = own.get(line.version);
				expect(release, `${page.slug}: ${line.version}`).toBeDefined();
				expect(release?.[kind] ?? [], `${line.version} ${kind}`).toContain(line.text);
			}
			const expected = [...own.values()].reduce(
				(n, r) =>
					n +
					(r.added?.length ?? 0) +
					(r.changed?.length ?? 0) +
					(r.fixed?.length ?? 0) +
					(r.watch?.length ?? 0),
				0,
			);
			expect(lines.length, page.slug).toBe(expected);
		}
	});

	/**
	 * The contents list the front page and the recent few; every other version
	 * is a page the dropdown reaches, the notes from before Roswaal was public in
	 * a group of their own at the bottom.
	 */
	it("lists the recent few in the contents, and every version in the dropdown", () => {
		const listed = releasePages.filter((p) => !p.unlisted);
		expect(listed.map((p) => p.slug)).toEqual([
			"release-notes",
			...minors.slice(0, RECENT_MINORS).map((m) => `release-notes/${m}`),
		]);
		const front = releasePages[0];
		const versions = front.blocks.find(
			(b): b is Block & { t: "releaseVersions" } => b.t === "releaseVersions",
		)!;
		const offered = versions.groups.flatMap((g) => g.items.map((i) => i.minor));
		expect(offered).toEqual(minors);
		expect(versions.groups.at(-1)?.label).toBe("Before Roswaal was public");
		expect(versions.groups.at(-1)?.items.at(-1)?.minor).toBe(minors.at(-1));
		expect(versions.latest).toBe(RELEASES[0].version);
		// Every slug the dropdown offers is a page that exists.
		for (const item of versions.groups.flatMap((g) => g.items)) {
			expect(findPage(site, item.slug), item.slug).toBeDefined();
		}
	});

	it("keeps the front page to the newest version and a line each for the few before it", () => {
		const front = releasePages[0];
		expect(front.blocks.map((b) => b.t)).toEqual([
			"p",
			"releaseVersions",
			"releaseMinor",
			"releaseRows",
		]);
		const newest = minorBlock(front);
		expect(newest.link).toBe(true);
		expect(newest.minor.minor).toBe(minors[0]);
		const rows = front.blocks.find(
			(b): b is Block & { t: "releaseRows" } => b.t === "releaseRows",
		)!;
		expect(rows.rows.map((r) => r.minor)).toEqual(minors.slice(1, RECENT_MINORS));
	});

	it("links each minor version to the ones either side", () => {
		const pages = releasePages.slice(1);
		pages.forEach((page, i) => {
			const pager = page.blocks.find(
				(b): b is Block & { t: "releasePager" } => b.t === "releasePager",
			)!;
			expect(pager.newer?.slug, page.slug).toBe(pages[i - 1]?.slug);
			expect(pager.older?.slug, page.slug).toBe(pages[i + 1]?.slug);
		});
	});

	/**
	 * Security fixes are shown, not hidden: the release that made one is
	 * tagged, and its minor version carries the badge in every place it is
	 * listed.
	 */
	it("marks the releases that fixed a security weakness, and their minor versions", () => {
		const fixes = RELEASES.filter((r) => r.security);
		expect(fixes.length).toBeGreaterThan(0);
		for (const release of fixes) {
			const page = findPage(site, releasePageSlug(release.version))!;
			const view = minorBlock(page).minor;
			expect(view.security, release.version).toBe(true);
			expect(view.releases.find((r) => r.version === release.version)?.tags).toContain("security");
			const html = renderPage(site, page, { version: VERSION });
			expect(html).toContain("Security fixes");
			expect(html).toContain(`${view.minor}.x · security fixes`);
		}
		// And none on a minor version without one.
		const clean = releasePages.slice(1).find((p) => !minorBlock(p).minor.security)!;
		expect(renderPage(site, clean, { version: VERSION })).not.toContain('class="badge security"');
	});

	/**
	 * A link to one release -- the landing page has eight -- lands on its minor
	 * version's page, which lights its lines by the anchor.
	 */
	it("anchors every release on its minor version's page", () => {
		for (const release of RELEASES.slice(0, 12)) {
			const page = findPage(site, releasePageSlug(release.version))!;
			const html = renderPage(site, page, { version: VERSION });
			expect(html, release.version).toContain(`id="v${release.version}"`);
			expect(html, release.version).toContain(`data-version="${release.version}"`);
		}
	});

	it("leaves the unlisted versions out of the contents, but not the one being read", () => {
		const old = releasePages.find((p) => p.unlisted)!;
		const elsewhere = renderPage(site, releasePages[0], { version: VERSION });
		const here = renderPage(site, old, { version: VERSION });
		const nav = (html: string) =>
			html.slice(html.indexOf('<nav class="docs-nav">'), html.indexOf("</nav>"));
		expect(nav(elsewhere)).not.toContain(`>${old.title}</a>`);
		expect(nav(here)).toContain(`>${old.title}</a>`);
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
				...(release.added ?? []),
				...(release.changed ?? []),
				...(release.fixed ?? []),
				...(release.watch ?? []),
				...(release.reviewed ?? []),
				...(release.verified ?? []),
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

/**
 * The tags under a version number.
 *
 * Derived from what the release actually contains, so a tag cannot claim
 * something the entries beneath it do not show — a release with a `fixed` list
 * is a Bugfix whether or not anyone remembered to say so. `breaking` is the one
 * exception and is stated by the release, because whether a change breaks
 * somebody is a judgement about their code rather than a fact about ours.
 */
describe("release tags", () => {
	it("says nothing about a release with no entries", () => {
		expect(releaseTags({ version: "0.0.1", date: "2026-01-01", headline: "" })).toEqual([]);
	});

	it("names each kind of section it finds", () => {
		const base = { version: "1.0.0", date: "2026-01-01", headline: "" };
		expect(releaseTags({ ...base, added: ["a"] })).toEqual(["feature"]);
		expect(releaseTags({ ...base, changed: ["a"] })).toEqual(["change"]);
		expect(releaseTags({ ...base, fixed: ["a"] })).toEqual(["fix"]);
	});

	/** An empty list is not a section. It would otherwise tag a release Feature
	 *  for an `added: []` somebody left behind while editing. */
	it("ignores a section that is present but empty", () => {
		expect(releaseTags({ version: "1.0.0", date: "2026-01-01", headline: "", added: [] })).toEqual(
			[],
		);
	});

	it("puts breaking first, where it will be read first", () => {
		const tags = releaseTags({
			version: "1.0.0",
			date: "2026-01-01",
			headline: "",
			breaking: true,
			added: ["a"],
			changed: ["b"],
			fixed: ["c"],
		});
		expect(tags).toEqual(["breaking", "feature", "change", "fix"]);
	});

	/** `watch` is often just worth knowing; it must not imply a break. */
	it("does not treat a watch note as breaking", () => {
		expect(
			releaseTags({
				version: "1.0.0",
				date: "2026-01-01",
				headline: "",
				watch: ["mind this"],
			}),
		).toEqual([]);
	});

	it("has a label for every tag it can produce", () => {
		for (const tag of releaseTags({
			version: "1.0.0",
			date: "2026-01-01",
			headline: "",
			breaking: true,
			added: ["a"],
			changed: ["b"],
			fixed: ["c"],
		})) {
			expect(TAG_LABELS[tag]).toBeTruthy();
		}
	});
});

/**
 * A tag's modifier class is prefixed, and this is asserted because the
 * unprefixed version shipped and broke twice in one release.
 *
 * `.docs` is the documentation *panel* — a full-width, full-height grid with a
 * border. So `<span class="docs-tag docs">` came out as a bordered box on its
 * own line; and because `.docs-tags` is a flex row, that one tall item stretched
 * every sibling tag to match, turning the row into columns.
 *
 * CSS collisions are not testable. The rule that prevents them is, and this is
 * it: a modifier class for a tag is namespaced to tags.
 */
describe("release tag classes", () => {
	it("namespaces every one of them", () => {
		const site = buildSite(createRegistry(), new Set());
		const page = findPage(site, "release-notes")!;
		const html = renderPage(site, page, { version: VERSION });
		for (const tag of Object.keys(TAG_LABELS)) {
			expect(html, tag).not.toMatch(new RegExp(`class="docs-tag ${tag}"`));
		}
		expect(html).toMatch(/class="docs-tag tag-/);
	});
});

/**
 * The header on a published documentation page.
 *
 * It carried the mark and nothing else for fifty releases, which was fine while
 * the docs were reached from the editor -- you arrived from the thing being
 * documented and could go back to it. Published, they are where most people
 * arrive, and the page led nowhere: the mark goes to the docs index, and the
 * only other links on it were the ones in the prose.
 *
 * The depth is the part worth holding. A node page sits a directory deeper than
 * a guide, so a link written once has to climb differently on each -- and a
 * wrong climb is a 404 on 283 of the 301 pages, or on the other 18.
 */
describe("the header of a published page", () => {
	const page = (slug: string) =>
		renderPage(
			site,
			{
				slug,
				title: "T",
				summary: "S",
				blocks: [],
			},
			{ version: "test" },
		);

	it("offers the editor and the source, not just the mark", () => {
		const html = page("getting-started");
		expect(html).toContain('Try it<span class="docs-try-more"> in your browser</span>');
		expect(html).toContain('href="https://github.com/neopolitans/Roswaal"');
	});

	it("climbs to the site root from whatever depth the page is at", () => {
		// A top-level page is in `docs/`, so one step up is the site root.
		expect(page("getting-started")).toContain('href="../try.html"');
		// A node page is in `docs/node/`, so it needs two.
		expect(page("node/event.connect")).toContain('href="../../try.html"');
	});

	/**
	 * The mark is the way to your projects, as it is in every window of the
	 * editor: the hosted editor, opened on its project picker rather than on
	 * whichever project it last had. The docs' own front page is the first
	 * entry in the nav.
	 */
	/**
	 * A version is deployed more than once, so a stamp of the version let a
	 * browser pair new pages with an older build's stylesheet. The build
	 * passes a hash of the assets, and that is what the links carry.
	 */
	it("stamps its stylesheet and script with the build's hash, not the version", () => {
		const html = renderPage(
			site,
			{ slug: "getting-started", title: "T", summary: "S", blocks: [] },
			{ version: "0.71.0", assetStamp: "2f841e432a53" },
		);
		expect(html).toContain('theme.css?v=2f841e432a53"');
		expect(html).toContain('docs.js?v=2f841e432a53"');
		expect(html).not.toContain("?v=0.71.0");
	});

	it("points the mark at the project picker", () => {
		expect(page("node/event.connect")).toContain(
			'class="logo window-mark" href="../../try.html#picker"',
		);
		expect(page("getting-started")).toContain('class="logo window-mark" href="../try.html#picker"');
	});
});
