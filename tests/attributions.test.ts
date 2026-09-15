/**
 * The attributions list, and the two copies of it staying in step.
 *
 * There are two on purpose. `ATTRIBUTIONS.md` is for whoever is reading the
 * repository — a packager, an auditor, someone deciding whether they can use
 * this, and it is the short form: tables, and the statements that have to be
 * made in full. The **Attributions** page is for whoever is using the editor,
 * will never open the repository at all, and wants the reasoning behind an
 * entry. Neither is allowed to be the only one.
 *
 * The failure mode is not a wrong entry; it is a *missing* one, added to
 * whichever copy the author happened to have open. Nothing about the shape of
 * either file would catch that, so the cross-check below is the only thing that
 * does.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	ATTRIBUTIONS, DEPENDENCIES, INSPIRATIONS, NAME_NOTICE, TARGETS,
} from "../src/core/docs/attributions.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { blockText, buildSite, findPage } from "../src/core/docs/site.js";

const NOTICE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "..", "ATTRIBUTIONS.md"),
	"utf8",
);

const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
const page = findPage(site, "attributions");
const pageText = page ? page.blocks.map(blockText).join("\n") : "";

describe("the attributions list", () => {
	it("says, for every entry, what it is and where it is", () => {
		for (const entry of ATTRIBUTIONS) {
			expect(entry.name, "name").not.toBe("");
			expect(entry.where, entry.name).not.toBe("");
			expect(entry.note, entry.name).not.toBe("");
		}
	});

	/**
	 * `licence` is `string | null` rather than optional so that "we have no
	 * licence for this" has to be written down. An absent field reads as an
	 * oversight; `null` reads as a decision.
	 */
	it("never leaves the licence to be inferred from a blank", () => {
		for (const entry of ATTRIBUTIONS) {
			expect(entry.licence === null || entry.licence.length > 0, entry.name).toBe(true);
		}
	});

	it("links somewhere a reader can check it", () => {
		for (const entry of ATTRIBUTIONS) {
			if (entry.url === undefined) continue;
			expect(entry.url, entry.name).toMatch(/^https:\/\//);
		}
	});
});

describe("the attributions page", () => {
	it("exists, under Learn", () => {
		expect(page).toBeDefined();
		const section = site.sections.find((s) => s.pages.some((p) => p.slug === "attributions"));
		expect(section?.title).toBe("Attributions");
	});

	it("names every attributed project", () => {
		for (const entry of ATTRIBUTIONS) {
			expect(pageText, entry.name).toContain(entry.name);
		}
	});

	/**
	 * The disclaimer is the point of the naming section, so it is asserted
	 * literally rather than by the section merely being present. Softening it
	 * to "not officially affiliated" or dropping a party would be a quiet
	 * change to what the project claims.
	 */
	it("says plainly that the names are not endorsed", () => {
		const names = NAME_NOTICE.body.join(" ");
		for (const phrase of ["not affiliated with", "KADOKAWA", "Tappei Nagatsuki", "0BSD"]) {
			expect(names, phrase).toContain(phrase);
		}
		expect(pageText).toContain("not affiliated with");
	});
});

describe("ATTRIBUTIONS.md and the attributions page", () => {
	/**
	 * The cross-check this file exists for. Add a dependency to one copy and
	 * forget the other, and this is what says so.
	 */
	it("list the same projects", () => {
		for (const entry of ATTRIBUTIONS) {
			expect(NOTICE, `${entry.name} is on the page but not in ATTRIBUTIONS.md`).toContain(entry.name);
		}
	});

	it("agree that the names are a homage and nothing more", () => {
		for (const phrase of ["not affiliated with", "KADOKAWA", "Re:Zero", "0BSD"]) {
			expect(NOTICE, phrase).toContain(phrase);
		}
	});

	/** Luau asks for attribution by name; that request is why it is listed. */
	it("carry the Luau attribution Luau actually asks for", () => {
		expect(NOTICE).toContain("Luau");
		expect(NOTICE).toContain("Roblox");
		expect(pageText).toContain("Roblox");
	});
});

/**
 * ## Built on, inspired by, designed for
 *
 * Three different claims, and the page makes them separately. An inspiration sat
 * under "What Roswaal is built on" for a release, which claimed a relationship
 * that did not exist — no code, no assets, no dependency, only conventions.
 * Overstating a debt is its own kind of inaccuracy, and so is understating one.
 */
describe("what Roswaal uses, learned from, and writes for", () => {
	it("puts every entry in exactly one of the three", () => {
		expect(DEPENDENCIES.length + INSPIRATIONS.length + TARGETS.length)
			.toBe(ATTRIBUTIONS.length);
		for (const entry of ATTRIBUTIONS) {
			expect(["uses", "inspired-by", "designed-for"], entry.name).toContain(entry.relation);
		}
	});

	/**
	 * The three platforms the output is for. Named rather than counted: dropping
	 * one would be a quiet change to what the project says it targets, and
	 * Luau's own README asks for its attribution by name.
	 */
	it("names Luau, Roblox and Lune as what the output is for", () => {
		expect([...TARGETS.map((t) => t.name)].sort()).toEqual(["Luau", "Lune", "Roblox"]);
	});

	/**
	 * A target is not a dependency, and saying so is the whole point of the
	 * third relation: nothing of theirs ships here.
	 */
	it("claims no licence over anything it only writes for", () => {
		for (const entry of TARGETS) {
			expect(entry.where, entry.name).toContain("Not bundled");
		}
	});

	/** Affirmative non-affiliation, per target, rather than left to be inferred. */
	it("says outright that it is not affiliated with any of them", () => {
		for (const entry of TARGETS) {
			expect(entry.note, entry.name).toMatch(/not affiliated with/);
		}
	});

	/**
	 * The specific mistake this guards. An entry with no licence granted to us
	 * is not something we can be built on.
	 */
	it("never calls something a dependency that is not licensed to us", () => {
		for (const entry of DEPENDENCIES) {
			expect(entry.licence, `${entry.name} is listed as used but has no licence`).not.toBeNull();
		}
	});

	it("keeps Unreal Engine on the inspiration side", () => {
		expect(INSPIRATIONS.map((a) => a.name)).toContain("Unreal Engine");
		expect(DEPENDENCIES.map((a) => a.name)).not.toContain("Unreal Engine");
	});

	/** Both headings have to exist in the other copy of record too. */
	it("says the same in ATTRIBUTIONS.md", () => {
		expect(NOTICE).toContain("What Roswaal is built on");
		expect(NOTICE).toContain("What Roswaal is inspired by");
	});
});
