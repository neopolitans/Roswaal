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
 *
 * A row on screen can be drawn by more than one component -- the editor's top
 * row is `ProjectBar` with `DocumentAction` at the end of its compile cluster,
 * and Node Design's is `DesignerPage` with the open node's actions in a slot
 * -- so a bar is read from its slices, in the order they sit on screen.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
	CANVAS_STRIP,
	controlsOf,
	DESIGNER_BAR,
	DOCS_BAR,
	EDITOR_BAR,
	GRAPH_BAR,
	MORE_MENU_PHONE,
	type ToolbarSpec,
} from "../src/core/docs/toolbars.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** One clickable element of a component: the glyphs in it and the words on it. */
interface Control {
	glyphs: string[];
	labels: string[];
}

/**
 * Part of a component's file: from `start` to `end`, or to the next exported
 * function when there is no `end`.
 */
interface Slice {
	file: string;
	start: string;
	end?: string;
}

function readSource(file: string): string {
	return readFileSync(join(ROOT, file), "utf8");
}

/** The source of one slice. */
function component({ file, start, end }: Slice): string {
	const source = readSource(file);
	const at = source.indexOf(start);
	if (at < 0) throw new Error(`${file} no longer has ${start}`);
	const stop = source.indexOf(end ?? "\nexport function ", at + start.length);
	if (end !== undefined && stop < 0) throw new Error(`${file} no longer has ${end}`);
	return stop < 0 ? source.slice(at) : source.slice(at, stop);
}

/**
 * The string literals each `const` in a file is set to, by name: a tooltip
 * written once above the element -- `title={previewTitle}` -- is that
 * constant's words. Plain declarations only, never a destructured hook.
 */
function constants(file: string): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const m of readSource(file).matchAll(/\bconst (\w+)(?::[^=]+)? =([\s\S]*?);\n/g)) {
		out.set(
			m[1],
			[...m[2].matchAll(/"([^"]*)"/g)].map((s) => s[1]),
		);
	}
	return out;
}

/**
 * The string literals in an attribute, whether written `="…"` or `={…}`, and
 * a constant's when the attribute is one: `title={DOCS_TITLE}`.
 */
function attributeStrings(element: string, name: string, consts: Map<string, string[]>): string[] {
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
		const value = element.slice(from, i - 1);
		const named = /^\s*(\w+)\s*$/.exec(value);
		if (named) out.push(...(consts.get(named[1]) ?? []));
		for (const s of value.matchAll(/"([^"]*)"/g)) out.push(s[1]);
	}
	return out;
}

function controls(source: string, consts: Map<string, string[]> = new Map()): Control[] {
	return [...source.matchAll(/<(button|a)\b[\s\S]*?<\/\1>/g)].map(([element]) => ({
		glyphs: [...element.matchAll(/<Icon name="(\w+)"/g)].map((m) => m[1]),
		labels: [
			...attributeStrings(element, "title", consts),
			...attributeStrings(element, "aria-label", consts),
			...[...element.matchAll(/className="tb-label">([^<]+)</g)].map((m) => m[1].trim()),
			// Words written straight into the element, as `Open Editor` is.
			...[...element.matchAll(/>\s*([A-Z][\w ]+?)\s*</g)].map((m) => m[1].trim()),
			// Words it shows from an expression, as Save shows `dirty ? "Save" :
			// "Saved"`. Only a literal in a shown position -- after `?`, `:`, `(`
			// or `{` -- and only words, so no class name or path is read as one.
			...[...element.matchAll(/[?:({]\s*"([A-Z][\w ]*)"/g)].map((m) => m[1]),
		],
	}));
}

/** Every control of a bar's slices, in screen order, each read with its file's constants. */
function drawnFrom(slices: Slice[]): Control[] {
	return slices.flatMap((slice) => controls(component(slice), constants(slice.file)));
}

/** A tooltip names its control first: "Refresh — re-read the project from disk". */
function names(label: string, name: string): boolean {
	return label === name || label.startsWith(`${name} — `);
}

const TOOLBAR = "src/app/Toolbar.tsx";
const PROJECT_BAR: Slice = { file: TOOLBAR, start: "export function ProjectBar(" };
const DOCUMENT_BAR: Slice = { file: TOOLBAR, start: "export function DocumentBar(" };
const DESIGNER = "src/app/DesignerPage.tsx";
const SLOT = '<div className="tool-slot"';

const BARS: [string, ToolbarSpec, Slice[]][] = [
	[
		"the editor's top row",
		EDITOR_BAR,
		[PROJECT_BAR, { file: TOOLBAR, start: "export function DocumentAction(" }],
	],
	[
		"the open graph's clusters",
		GRAPH_BAR,
		[{ file: "src/app/GraphTabs.tsx", start: "export function GraphTabs(" }, DOCUMENT_BAR],
	],
	// The menu holds the project's rows and, on a phone, the graph's.
	["the More menu on a phone", MORE_MENU_PHONE, [PROJECT_BAR, DOCUMENT_BAR]],
	[
		"the side strip",
		CANVAS_STRIP,
		[{ file: "src/app/CanvasStrip.tsx", start: "export function CanvasStrip(" }],
	],
	[
		"Node Design's top row",
		DESIGNER_BAR,
		[
			// The mark, then the slot the open node's actions are drawn into...
			{ file: DESIGNER, start: "export function DesignerPage(", end: SLOT },
			{
				file: "src/app/designer/NodeEditor.tsx",
				start: "const nodeKindGroup = () =>",
				end: "const nodeActions = nodeKindGroup();",
			},
			// ...then the other windows.
			{ file: DESIGNER, start: SLOT },
		],
	],
	[
		"the docs window's header",
		DOCS_BAR,
		[{ file: "src/app/DocsPage.tsx", start: "export function DocsPage(" }],
	],
];

describe.each(BARS)("%s", (_title, spec, slices) => {
	const drawn = drawnFrom(slices);

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
	const drawn = drawnFrom([PROJECT_BAR]);
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

	/** A tooltip kept in a constant is read from the constant, not skipped. */
	it("reads a title written as a constant", () => {
		const graph = drawnFrom([DOCUMENT_BAR]);
		expect(
			graph.some((c) => c.labels.some((l) => names(l, "Preview")) && c.glyphs.includes("terminal")),
		).toBe(true);
		expect(drawn.some((c) => c.labels.some((l) => l.startsWith("Docs — ")))).toBe(true);
	});

	/** The slices of a row are read where they sit, and a missing end is loud. */
	it("fails loudly when a slice's end has gone", () => {
		expect(() =>
			component({ file: DESIGNER, start: "export function DesignerPage(", end: "<NoSuchSlot" }),
		).toThrow(/no longer has/);
	});
});
