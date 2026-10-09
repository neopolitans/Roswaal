/**
 * The specification's requirements: every MUST and SHOULD is a numbered
 * requirement, numbered for the section it is in, and no number is used twice.
 */

import { describe, expect, it } from "vitest";

import { blockStrings } from "../src/core/docs/markup.js";
import { GROUPS } from "../src/core/docs/site.js";
import { technicalSections } from "../src/core/docs/technical/index.js";
import { createRegistry } from "../src/core/nodes/index.js";

const pages = technicalSections(GROUPS.technical, { registry: createRegistry() }).flatMap(
	(section) => section.pages,
);
const BINDS = /\*\*(MUST|MUST NOT|SHOULD|SHOULD NOT|REQUIRED|SHALL|SHALL NOT|RECOMMENDED)\*\*/;

describe("the specification's requirements", () => {
	it("writes every MUST and SHOULD as a numbered requirement", () => {
		const loose: string[] = [];
		// All requirements quotes them; it is generated from the rest.
		for (const page of pages.filter((p) => p.slug !== "technical/requirements")) {
			// 1.4 and the front page list the key words themselves, which is not a
			// requirement: a line naming three or more of them is that list.
			for (const block of page.blocks) {
				if (block.t === "req") continue;
				for (const { text } of blockStrings(block)) {
					const words = text.match(new RegExp(BINDS.source, "g")) ?? [];
					if (BINDS.test(text) && new Set(words).size < 3) {
						loose.push(`${page.slug}: ${text.slice(0, 80)}`);
					}
				}
			}
		}
		expect(loose).toEqual([]);
	});

	it("numbers each requirement for the section it is in, once", () => {
		const seen = new Set<string>();
		const wrong: string[] = [];
		for (const page of pages) {
			const chapter = /^(\d+) /.exec(page.title)?.[1];
			let section = chapter;
			for (const block of page.blocks) {
				if (block.t === "h" && block.level === 2)
					section = /^(\d+\.\d+) /.exec(block.text)?.[1] ?? section;
				if (block.t !== "req") continue;
				if (seen.has(block.id)) wrong.push(`${block.id} is used twice`);
				seen.add(block.id);
				if (!block.id.startsWith(`${section}-R`) || !/^\d+(\.\d+)?-R\d+$/.test(block.id)) {
					wrong.push(`${page.slug}: ${block.id} is under ${section}`);
				}
			}
		}
		expect(wrong).toEqual([]);
		expect(seen.size).toBeGreaterThan(50);
	});
});
