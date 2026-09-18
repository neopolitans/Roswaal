/**
 * Documentation pages open on the tab for the reader's own screen.
 *
 * The screen checks are the app's own, so these hold them to the answers the
 * app's layout gives; and every switch that splits by device has to have a tab
 * for each, or a reader on the missing one opens on a stranger's.
 */

import { afterEach, describe, expect, it } from "vitest";

import { chosenDevice, pickTab, readerDevice, rememberPick, type Device } from "../src/app/docsDevice.js";
import { buildSite, type Block } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import { createRegistry } from "../src/core/nodes/index.js";

/** A window whose media queries answer from a set of true ones. */
function screen(...truths: string[]): Window {
	return { matchMedia: (query: string) => ({ matches: truths.includes(query) }) } as unknown as Window;
}

const PHONE = "(max-width: 699px)";
const TOUCH = "(hover: none) and (pointer: coarse)";

describe("the reader's screen", () => {
	it("is a phone by the app's phone width, held any way the app calls a phone", () => {
		expect(readerDevice(screen(PHONE, TOUCH), false)).toBe("phone");
	});

	it("is a tablet on a touch screen wider than that, a phone held sideways included", () => {
		expect(readerDevice(screen(TOUCH), false)).toBe("tablet");
	});

	it("is a desktop otherwise, split by which build is showing the page", () => {
		expect(readerDevice(screen(), true)).toBe("localhost");
		expect(readerDevice(screen(), false)).toBe("webapp");
	});

	it("is a desktop when media queries cannot be asked", () => {
		const broken = { matchMedia: () => { throw new Error("no"); } } as unknown as Window;
		expect(readerDevice(broken, false)).toBe("webapp");
	});
});

describe("choosing a tab", () => {
	const tabs: { device?: Device[] }[] = [
		{ device: ["localhost", "webapp"] },
		{ device: ["tablet"] },
		{ device: ["phone"] },
	];

	it("takes the first tab for the device, and none when nothing says so", () => {
		expect(pickTab(tabs, "webapp")).toBe(0);
		expect(pickTab(tabs, "phone")).toBe(2);
		expect(pickTab([{}, {}], "phone")).toBe(-1);
	});
});

describe("a reader's pick", () => {
	const store = new Map<string, string>();
	const original = globalThis.sessionStorage;
	globalThis.sessionStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
	} as unknown as Storage;
	afterEach(() => store.clear());

	it("is remembered as a device", () => {
		rememberPick(["phone"], "webapp");
		expect(chosenDevice()).toBe("phone");
	});

	it("keeps the reader's own build when the tab is for both", () => {
		rememberPick(["localhost", "webapp"], "webapp");
		expect(chosenDevice()).toBe("webapp");
		rememberPick(["localhost", "webapp"], "tablet");
		expect(chosenDevice()).toBe("localhost");
	});

	it("is nothing when storage holds something else", () => {
		store.set("roswaal.docs.device", "fridge");
		expect(chosenDevice()).toBeNull();
		if (original) globalThis.sessionStorage = original;
	});
});

describe("the pages that split by device", () => {
	const site = buildSite(createRegistry(), new Set());
	const switches: { page: string; block: Block & { t: "tabs" } }[] = [];
	const walk = (page: string, blocks: Block[]) => {
		for (const block of blocks) {
			if (block.t === "tabs") {
				switches.push({ page, block });
				for (const tab of block.tabs) walk(page, tab.blocks);
			}
		}
	};
	for (const section of site.sections) for (const page of section.pages) walk(page.slug, page.blocks);
	const byDevice = switches.filter(({ block }) => block.tabs.some((tab) => tab.device));

	it("are the four pages that have them", () => {
		expect([...new Set(byDevice.map((s) => s.page))].sort()).toEqual(
			["controls", "getting-started", "the-interface", "toolbars"],
		);
	});

	it("have a tab for every screen, and tag every tab", () => {
		for (const { page, block } of byDevice) {
			const covered = new Set(block.tabs.flatMap((tab) => tab.device ?? []));
			expect([...covered].sort(), page).toEqual(["localhost", "phone", "tablet", "webapp"]);
			for (const tab of block.tabs) expect(tab.device, `${page} ${tab.id}`).toBeDefined();
		}
	});

	it("say which screens each radio is for on the static site", () => {
		const page = site.sections.flatMap((s) => s.pages).find((p) => p.slug === "toolbars")!;
		const html = renderPage(site, page, { version: "test" });
		expect(html).toContain('data-device="tablet"');
		expect(html).toContain('data-device="localhost"');
	});
});
