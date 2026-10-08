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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { ICONS, SHOWS_LUAU_MARK } from "../src/app/icons.jsx";
import {
	ATTRIBUTIONS,
	DEPENDENCIES,
	HOW_IT_IS_MADE,
	INSPIRATIONS,
	NAME_NOTICE,
	NOT_AFFILIATED,
	NOTHING_SHIPS,
	TARGETS,
	TESTED_WITH,
	TRADEMARKS,
} from "../src/core/docs/attributions.js";
import { blockText, buildSite, findPage } from "../src/core/docs/site.js";
import { CARRIED_LICENCES } from "../src/core/licenceData.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";

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
			expect(NOTICE, `${entry.name} is on the page but not in ATTRIBUTIONS.md`).toContain(
				entry.name,
			);
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

	/**
	 * The `.luau` icon is the Luau logo. luau.org/brand asks for this line from
	 * any project using the name, and the logo's MIT notice has to travel with
	 * it, so both are asserted rather than trusted to stay.
	 */
	it("carry Luau's trademark line and the logo's licence", () => {
		const line = "Luau is a trademark of Roblox Corporation.";
		expect(NOTICE).toContain(line);
		expect(pageText).toContain(line);
		const licence = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), "..", "notices", "upstream", "luau-site.txt"),
			"utf8",
		);
		expect(licence).toContain("Copyright (c) 2019-2026 Roblox Corporation");
		expect(licence).toContain("The above copyright notice and this permission notice");
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
	it("puts every entry in exactly one of the four", () => {
		expect(DEPENDENCIES.length + INSPIRATIONS.length + TARGETS.length + TESTED_WITH.length).toBe(
			ATTRIBUTIONS.length,
		);
		for (const entry of ATTRIBUTIONS) {
			expect(["uses", "inspired-by", "designed-for", "tested-with"], entry.name).toContain(
				entry.relation,
			);
		}
	});

	/** A library Roswaal was only tried against ships nothing here. */
	it("bundles none of the libraries it was tested with", () => {
		expect(TESTED_WITH.map((t) => t.name).sort()).toEqual(["Promise", "Roact", "Sift", "Signal"]);
		for (const entry of TESTED_WITH) {
			expect(entry.where, entry.name).toBe(NOTHING_SHIPS);
			expect(entry.ships, entry.name).toBe(false);
			expect(entry.licence, entry.name).not.toBeNull();
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
			expect(entry.where.toLowerCase(), entry.name).toContain("nothing of theirs ships");
		}
	});

	/**
	 * Affirmative non-affiliation, said once for everyone on the page and in
	 * ATTRIBUTIONS.md, rather than left to be inferred -- and every holder whose
	 * name is a trademark has its line in both.
	 */
	it("says outright that it is not affiliated with any of them", () => {
		expect(pageText).toContain(NOT_AFFILIATED);
		expect(NOTICE).toContain("not affiliated with, endorsed by, or approved by anyone listed here");
		const flat = (text: string) => text.replace(/\s+/g, " ");
		for (const mark of TRADEMARKS) {
			expect(flat(pageText), mark.holder).toContain(mark.line);
			expect(flat(NOTICE), mark.holder).toContain(mark.line);
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

	/**
	 * Where nothing of a holder's ships, the page says so in those words and
	 * names no licence; where something does, it says where and under what.
	 */
	it("says whether anything of each ships, and never both ways", () => {
		for (const entry of ATTRIBUTIONS) {
			if (entry.ships) {
				expect(entry.where.startsWith(NOTHING_SHIPS), entry.name).toBe(false);
				expect(entry.licence, entry.name).not.toBeNull();
			} else {
				expect(entry.where.startsWith(NOTHING_SHIPS), entry.name).toBe(true);
			}
		}
	});

	it("keeps Affinity and Procreate on the inspiration side", () => {
		const inspirations = INSPIRATIONS.map((a) => a.name);
		expect(inspirations).toContain("Affinity");
		expect(inspirations).toContain("Procreate");
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
/**
 * The Luau logo is the `.luau` icon on the canary only, until Roblox has
 * answered whether the use is permitted.
 *
 * Asserted without asking which channel the suite is in: the test config pins
 * `ROSWAAL_CHANNEL` to stable, while the Vite define is read when the config
 * loads and so is canary on the canary's CI. Whether a stable bundle really
 * holds no copy of the mark was checked by searching every build's output.
 */
describe("the Luau mark stays on the canary", () => {
	it("is drawn exactly when the gate says so", () => {
		expect(ICONS.luauScript === ICONS.codeFile).toBe(!SHOWS_LUAU_MARK);
	});

	it("is gated on the canary channel, in the editor and under Node", () => {
		const source = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "icons.tsx"),
			"utf8",
		);
		expect(source).toContain('__ROSWAAL_CHANNEL__ === "canary"');
		expect(source).toMatch(/ROSWAAL_CHANNEL === "canary";/);
		expect(source).toMatch(/luauScript: SHOWS_LUAU_MARK\s*\?/);
	});

	it("is described as canary-only wherever it is described", () => {
		expect(NOTICE).toContain("In the canary build only");
		expect(pageText).toContain("In the canary build only");
	});
});

/**
 * Every licence Roswaal keeps by hand is on the page, in full, so a holder can
 * read their notice where they find their name.
 */
describe("the licences on the attributions page", () => {
	it("holds every carried licence, by name and in full", () => {
		expect(page?.blocks.some((block) => block.t === "licences")).toBe(true);
		for (const licence of CARRIED_LICENCES) {
			expect(pageText, licence.name).toContain(licence.name);
		}
	});

	it("names the notices file every build carries", () => {
		expect(pageText).toContain("THIRD-PARTY-NOTICES.txt");
		expect(NOTICE).toContain("THIRD-PARTY-NOTICES.txt");
	});
});

/**
 * How Roswaal is made: the same two sentences under the list, in
 * ATTRIBUTIONS.md and in the README, so it reads the same wherever someone
 * meets it.
 */
describe("how Roswaal is made", () => {
	const README = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "..", "README.md"),
		"utf8",
	);
	const flat = (text: string) => text.replace(/\s+/g, " ");

	it("is said the same on the page, in ATTRIBUTIONS.md and in the README", () => {
		for (const line of HOW_IT_IS_MADE) {
			expect(flat(pageText)).toContain(line);
			expect(flat(NOTICE)).toContain(line);
			expect(flat(README)).toContain(line);
		}
	});
});
