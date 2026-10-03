/**
 * The drawn bars against the bars the editor really renders.
 *
 * `toolbars.ts` is a replica, and a replica goes stale when somebody changes
 * the bar and not the spec. So each spec here is read against the component
 * that draws the real one: every icon the spec draws is on a control of the
 * component with that glyph, under the name the spec gives it (its tooltip,
 * its accessible label or its text), and in the same order; every labelled
 * button is there by its words.
 *
 * Read from the source rather than rendered, because the components need a
 * store and a browser to mount. A control the parse cannot see is reported as
 * missing rather than passed over, so a change of shape fails loudly.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	controlsOf,
	DESIGNER_BAR,
	DOCS_BAR,
	EDITOR_BAR,
	GRAPH_BAR,
	type ToolbarSpec,
} from "../src/core/docs/toolbars.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** One clickable element of a component: the glyphs in it and the words on it. */
interface Control {
	glyphs: string[];
	labels: string[];
}

/** The source of one component: from its declaration to the next one. */
function component(file: string, start: string): string {
	const source = readFileSync(join(ROOT, file), "utf8");
	const at = source.indexOf(start);
	if (at < 0) throw new Error(`${file} no longer has ${start}`);
	const next = source.indexOf("\nexport function ", at + start.length);
	return next < 0 ? source.slice(at) : source.slice(at, next);
}

/** The string literals in an attribute, whether written `="…"` or `={…}`. */
function attributeStrings(element: string, name: string): string[] {
	const out: string[] = [];
	for (const m of element.matchAll(new RegExp(`\\b${name}="([^"]*)"`, "g"))) out.push(m[1]);
	for (const m of element.matchAll(new RegExp(`\\b${name}=\\{`, "g"))) {
		let depth = 1;
		let i = (m.index ?? 0) + m[0].length;
		const from = i;
		for (; i < element.length && depth > 0; i++) {
			if (element[i] === "{") depth++;
			if (element[i] === "}") depth--;
		}
		for (const s of element.slice(from, i).matchAll(/"([^"]*)"/g)) out.push(s[1]);
	}
	return out;
}

function controls(source: string): Control[] {
	return [...source.matchAll(/<(button|a)\b[\s\S]*?<\/\1>/g)].map(([element]) => ({
		glyphs: [...element.matchAll(/<Icon name="(\w+)"/g)].map((m) => m[1]),
		labels: [
			...attributeStrings(element, "title"),
			...attributeStrings(element, "aria-label"),
			...[...element.matchAll(/className="tb-label">([^<]+)</g)].map((m) => m[1].trim()),
			// Words written straight into the element, as `Open Editor` is.
			...[...element.matchAll(/>\s*([A-Z][\w ]+?)\s*</g)].map((m) => m[1].trim()),
		],
	}));
}

/** A tooltip names its control first: "Refresh — re-read the project from disk". */
function names(label: string, name: string): boolean {
	return label === name || label.startsWith(`${name} — `);
}

const BARS: [string, ToolbarSpec, string, string][] = [
	["the editor's top bar", EDITOR_BAR, "src/app/Toolbar.tsx", "export function ProjectBar("],
	["the graph's bar", GRAPH_BAR, "src/app/Toolbar.tsx", "export function DocumentBar("],
	[
		"Node Design's header",
		DESIGNER_BAR,
		"src/app/DesignerPage.tsx",
		"export function DesignerPage(",
	],
	["the docs window's header", DOCS_BAR, "src/app/DocsPage.tsx", "export function DocsPage("],
];

describe.each(BARS)("%s", (_title, spec, file, start) => {
	const drawn = controls(component(file, start));

	it("is read from the component, controls and all", () => {
		expect(drawn.length).toBeGreaterThan(1);
	});

	it("draws every icon the editor has, under its name, in its order", () => {
		expect(misdrawnIcons(spec, drawn)).toEqual([]);
	});

	it("names every labelled button as the editor does", () => {
		for (const item of controlsOf(spec)) {
			if (item.t !== "button" || item.name === undefined) continue;
			const text = item.text;
			expect(
				drawn.some((c) => c.labels.some((l) => names(l, text))),
				`${spec.id}: ${text}`,
			).toBe(true);
		}
	});
});

/** The spec's named icons with no control of that glyph and name after the last. */
function misdrawnIcons(spec: ToolbarSpec, drawn: Control[]): string[] {
	const out: string[] = [];
	let last = -1;
	for (const item of controlsOf(spec)) {
		if (item.t !== "icon" || item.name === undefined) continue;
		const name = item.name;
		const at = drawn.findIndex(
			(c, i) => i > last && c.glyphs.includes(item.icon) && c.labels.some((l) => names(l, name)),
		);
		if (at < 0) out.push(`${item.icon} ${name}`);
		else last = at;
	}
	return out;
}

describe("the check itself", () => {
	const drawn = controls(component("src/app/Toolbar.tsx", "export function ProjectBar("));
	const one = (items: ToolbarSpec["groups"][number]["items"]): ToolbarSpec => ({
		...EDITOR_BAR,
		groups: [{ items }],
	});

	it("notices a renamed control, a changed glyph and a swapped order", () => {
		expect(misdrawnIcons(one([{ t: "icon", icon: "refresh", name: "Reload" }]), drawn)).toEqual([
			"refresh Reload",
		]);
		expect(misdrawnIcons(one([{ t: "icon", icon: "map", name: "Refresh" }]), drawn)).toEqual([
			"map Refresh",
		]);
		expect(
			misdrawnIcons(
				one([
					{ t: "icon", icon: "settings", name: "Settings" },
					{ t: "icon", icon: "refresh", name: "Refresh" },
				]),
				drawn,
			),
		).toEqual(["refresh Refresh"]);
	});
});
