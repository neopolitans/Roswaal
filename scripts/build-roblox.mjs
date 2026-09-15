/**
 * Builds `src/core/robloxData.ts` from a local export of the Creator Hub.
 *
 * ## Why the source is not in the repository
 *
 * The input is six saved HTML pages from create.roblox.com, which are megabytes
 * each and are Roblox's copyrighted documentation. What is taken from them is
 * the *names* — `BasePart`, `Enum.Material`, `CFrame` — and which class derives
 * from which, both of which are facts about the API rather than anything
 * authored. No prose, no descriptions, no assets. The generated file is
 * committed so a clone needs none of this; this script is how it is refreshed
 * when Roblox ships a class.
 *
 * ## Running it
 *
 *   npm run build:roblox -- "<folder holding the saved pages>"
 *
 * Save these six from the Creator Hub with "Web page, complete", and point the
 * script at the folder. The `_files` folders beside them are not read.
 *
 *   Roblox Engine classes, Roblox Engine enums, Roblox Engine data types,
 *   Roblox Engine libraries, Roblox globals, Luau globals
 *
 * A page that is missing leaves its list as it was rather than emptying it, so a
 * partial export cannot silently delete half the vocabulary.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const folder = process.argv[2];
if (!folder) {
	console.error('Usage: npm run build:roblox -- "<folder with the saved Creator Hub pages>"');
	process.exit(1);
}

/** The saved page whose name contains all of these words, or null. */
function find(...words) {
	const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".html"));
	const hit = files.find((f) => words.every((w) => f.toLowerCase().includes(w.toLowerCase())));
	return hit ? path.join(folder, hit) : null;
}

/**
 * Every name linked under `/reference/engine/<kind>/`.
 *
 * A saved page carries its whole left-hand navigation, which is the complete
 * index for that kind — so the links are the list, and no parsing of the page's
 * body is needed.
 */
function namesUnder(file, kind) {
	if (!file) return null;
	const html = readFileSync(file, "utf8");
	const found = new Set();
	const pattern = new RegExp(`reference/engine/${kind}/([A-Za-z0-9_]+)`, "g");
	for (const match of html.matchAll(pattern)) found.add(match[1]);
	return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * The function and value names a globals page documents.
 *
 * These have no per-name page to link to, so they are the heading anchors
 * instead — `id="tostring"`. The page's own furniture uses ids too, so anything
 * that is not a plain lowercase Luau identifier is dropped, along with a short
 * list of chrome that would otherwise pass.
 */
const CHROME = new Set([
	"main", "functions", "properties", "false", "true", "nil", "left-nav",
	"summary", "overview", "description", "parameters", "returns", "code-samples",
	// Not chrome by shape, but not a global either: the page links to itself.
	"reference",
]);

function anchorsIn(file) {
	if (!file) return null;
	const html = readFileSync(file, "utf8");
	const found = new Set();
	for (const match of html.matchAll(/id="([A-Za-z_][A-Za-z0-9_.]*)"/g)) {
		const id = match[1];
		if (CHROME.has(id)) continue;
		// No Luau or Roblox global has an underscore in it, and an SVG clip path
		// — `clip0_806_28536` — otherwise reads as one.
		if (id.includes("_")) continue;
		if (!/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)?$/.test(id)) continue;
		found.add(id);
	}
	return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * Each class's superclass, read off the navigation tree.
 *
 * The saved page writes the whole inheritance path into every tree item's id —
 * `tree-Engine API/Classes/Object/Instance/Constraint/AlignPosition` — so the
 * engine's own hierarchy is there to be read rather than guessed at. That beats
 * the categories Studio's Insert Object shows, which are hand-made groupings
 * with no machine-readable source and no bearing on what a class *is*.
 *
 * `Object` is the root, so it is the one class with no entry here.
 */
function parentsIn(file) {
	if (!file) return null;
	const html = readFileSync(file, "utf8");
	const parents = {};
	for (const match of html.matchAll(/id="tree-Engine API\/Classes\/([A-Za-z0-9_/]+)"/g)) {
		const parts = match[1].split("/");
		if (parts.length >= 2) parents[parts[parts.length - 1]] = parts[parts.length - 2];
	}
	const sorted = Object.entries(parents).sort(([a], [b]) => a.localeCompare(b));
	return sorted.length > 0 ? Object.fromEntries(sorted) : null;
}

const classesPage = find("engine", "classes");

const lists = {
	CLASSES: namesUnder(classesPage, "classes"),
	ENUMS: namesUnder(find("engine", "enums"), "enums"),
	DATATYPES: namesUnder(find("data types"), "datatypes"),
	LIBRARIES: namesUnder(find("engine", "libraries"), "libraries"),
	ROBLOX_GLOBALS: anchorsIn(find("roblox globals")),
	LUAU_GLOBALS: anchorsIn(find("luau globals")),
};

const parents = parentsIn(classesPage);

/** What the file says now, so a missing page keeps its list rather than clearing it. */
const OUT = path.join(process.cwd(), "src/core/robloxData.ts");
let existing = "";
try {
	existing = readFileSync(OUT, "utf8");
} catch {
	// First run.
}

function keep(name) {
	const match = new RegExp(`export const ${name}: readonly string\\[\\] = \\[([^\\]]*)\\]`).exec(existing);
	if (!match) return [];
	return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function keepParents() {
	const start = existing.indexOf("export const CLASS_PARENTS");
	if (start === -1) return {};
	const body = existing.slice(start);
	const out = {};
	for (const line of body.matchAll(/"([A-Za-z0-9_]+)": "([A-Za-z0-9_]+)"/g)) out[line[1]] = line[2];
	return out;
}

/** Wraps a long list at a readable width rather than one name to a line. */
function render(names) {
	const lines = [];
	let line = "\t";
	for (const name of names) {
		const piece = `"${name}", `;
		if (line.length + piece.length > 96) {
			lines.push(line.trimEnd());
			line = "\t";
		}
		line += piece;
	}
	if (line.trim() !== "") lines.push(line.trimEnd());
	return lines.join("\n");
}

const DOC = {
	CLASSES: "Every Instance class the engine has, alphabetically.",
	ENUMS: 'Every `Enum` the engine has, by name — `Enum.Material` is `"Material"` here.',
	DATATYPES: "Roblox's own value types: CFrame, Color3, TweenInfo, and the rest.",
	LIBRARIES: "The engine's libraries, as they are reached in Luau.",
	ROBLOX_GLOBALS: "Globals Roblox adds on top of Luau's.",
	LUAU_GLOBALS: "Luau's own globals, before Roblox adds anything.",
};

const body = Object.entries(lists)
	.map(([name, found]) => {
		const names = found ?? keep(name);
		const note = found ? "" : "\n// Kept from the previous build: its page was not in the export.";
		return `/** ${DOC[name]} */${note}\nexport const ${name}: readonly string[] = [\n${render(names)}\n];`;
	})
	.join("\n\n");

const hierarchy = parents ?? keepParents();

const PARENTS_DOC = [
	"/**",
	" * Each class's superclass, as the engine's own inheritance says.",
	" *",
	" * `Object` is the root and is the one class absent from the keys. Read it",
	" * through `classChain` and `isSubclassOf` in `roblox.ts` rather than directly:",
	" * a chain that loops, or names a class the export did not have, is their",
	" * problem to survive rather than every caller's.",
	" */",
].join("\n");

const parentLines = Object.entries(hierarchy)
	.map(([child, parent]) => `\t${child}: "${parent}",`)
	.join("\n");

const parentsBlock = parentLines === ""
	? ""
	: `\n\n${PARENTS_DOC}\nexport const CLASS_PARENTS: Readonly<Record<string, string>> = {\n${parentLines}\n};`;

const header = `/**
 * The Roblox engine's vocabulary, as names and as inheritance.
 *
 * Generated by \`scripts/build-roblox.mjs\` from a local export of the Creator
 * Hub — do not edit by hand. Only facts about the API are taken: what the engine
 * calls its classes, enums, datatypes and globals, and which class derives from
 * which. No prose and no descriptions.
 *
 * These are **suggestions, never gates**. Every pin that offers one of these
 * lists also takes a name typed by hand, so a class Roblox ships next month
 * needs no release here — see \`PinDef.options\`.
 */

`;

writeFileSync(OUT, header + body + parentsBlock + "\n", "utf8");

for (const [name, found] of Object.entries(lists)) {
	const count = (found ?? keep(name)).length;
	console.log(`${name.padEnd(16)} ${String(count).padStart(4)}${found ? "" : "  (kept)"}`);
}
const kept = parents ? "" : "  (kept)";
console.log(`${"CLASS_PARENTS".padEnd(16)} ${String(Object.keys(hierarchy).length).padStart(4)}${kept}`);
console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`);
