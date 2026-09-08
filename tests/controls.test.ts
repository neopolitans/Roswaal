/**
 * The Controls page, against the code that actually binds the controls.
 *
 * A page listing keystrokes is the kind of document that is true on the day it
 * is written and quietly wrong a month later — a shortcut gets added in
 * `App.tsx` and nobody thinks of the docs, and now the one place a reader can
 * look is the one place that does not know. The canvas has no menu bar, so an
 * undocumented gesture is an unreachable one.
 *
 * So this reads the key handler and asserts the page covers what it binds. It
 * is a source scan, which is not how the rest of the suite works, and it earns
 * that by testing the only thing that can go wrong here: drift.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { blockText, buildSite, findPage } from "../src/core/docs/site.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
const page = findPage(site, "controls");

/** The body of `App.tsx`'s global keydown handler, and nothing else. */
function keyHandler(): string {
	const source = readFileSync(path.join(ROOT, "src/app/App.tsx"), "utf8");
	const from = source.indexOf("const onKey = (e: KeyboardEvent)");
	const to = source.indexOf('window.addEventListener("keydown", onKey)');
	expect(from, "the key handler moved").toBeGreaterThan(-1);
	expect(to).toBeGreaterThan(from);
	return source.slice(from, to);
}

/** Every key the handler tests for, as it would be written on the page. */
function boundKeys(): string[] {
	const body = keyHandler();
	const keys = new Set<string>();
	for (const m of body.matchAll(/e\.key\.toLowerCase\(\) === "(\w+)"/g)) {
		keys.add(m[1].toUpperCase());
	}
	for (const m of body.matchAll(/e\.key === "(\w+)"/g)) keys.add(m[1]);
	return [...keys];
}

/** Every `code span` on the page — which is how a key is written there. */
function codeSpans(): Set<string> {
	const text = (page?.blocks ?? []).map(blockText).join("\n");
	return new Set([...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
}

describe("the Controls page", () => {
	it("is in the site", () => {
		expect(page).toBeDefined();
		expect(page!.title).toBe("Controls");
	});

	it("sits under Getting started, where somebody looks first", () => {
		const section = site.sections.find((s) => s.pages.some((p) => p.slug === "controls"));
		expect(section?.title).toBe("Getting started");
	});

	/** The guard the page exists for. Add a shortcut, document it. */
	it("lists every key the editor binds", () => {
		const spans = codeSpans();
		const missing = boundKeys().filter((key) => !spans.has(key));
		expect(missing, "bound in App.tsx but not on the Controls page").toEqual([]);
	});

	/** A scan that matches nothing would pass the test above without proving it. */
	it("found the handler it is checking against", () => {
		const keys = boundKeys();
		expect(keys.length).toBeGreaterThan(8);
		expect(keys).toContain("Delete");
		expect(keys).toContain("Z");
	});

	it("says what the align key does and what it lines up on", () => {
		const text = (page!.blocks).map(blockText).join("\n").toLowerCase();
		expect(text).toContain("anchor");
		expect(text).toContain("reroute knot");
	});

	/**
	 * `A` is the align key, and `Ctrl` + `A` is select-all. They are two rows
	 * that differ by a modifier, which is exactly the pair a reader misreads,
	 * so both have to be there.
	 */
	it("distinguishes align from select all", () => {
		const rows = page!.blocks
			.filter((b): b is { t: "table"; head?: string[]; rows: string[][] } => b.t === "table")
			.flatMap((b) => b.rows);
		expect(rows.some((r) => r[0] === "`A`")).toBe(true);
		expect(rows.some((r) => r[0] === "`Ctrl` + `A`")).toBe(true);
	});

	it("covers the mouse as well as the keyboard", () => {
		const headings = page!.blocks.filter((b) => b.t === "h").map((b) => (b as { text: string }).text);
		expect(headings).toContain("Keyboard");
		expect(headings).toContain("The canvas");
		expect(headings).toContain("Pins and wires");
	});
});
