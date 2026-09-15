/**
 * Builds `src/core/robloxData.ts` from a local export of the Creator Hub.
 *
 * ## Why the source is not in the repository
 *
 * The input is six saved HTML pages from create.roblox.com, which are megabytes
 * each and are Roblox's copyrighted documentation. What is taken from them is
 * the *names* — `BasePart`, `Enum.Material`, `CFrame` — which are the engine's
 * public vocabulary and are facts about the API rather than anything authored.
 * No prose, no descriptions, no assets. The generated file is committed so a
 * clone needs none of this; this script is how it is refreshed when Roblox ships
 * a class.
 *
 * ## Running it
 *
 *   node scripts/build-roblox.mjs "<folder holding the saved pages>"
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
	console.error("Usage: node scripts/build-roblox.mjs <folder with the saved Creator Hub pages>");
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

const lists = {
	CLASSES: namesUnder(find("engine", "classes"), "classes"),
	ENUMS: namesUnder(find("engine", "enums"), "enums"),
	DATATYPES: namesUnder(find("data types"), "datatypes"),
	LIBRARIES: namesUnder(find("engine", "libraries"), "libraries"),
	ROBLOX_GLOBALS: anchorsIn(find("roblox globals")),
	LUAU_GLOBALS: anchorsIn(find("luau globals")),
};

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
	ENUMS: "Every `Enum` the engine has, by name — `Enum.Material` is `\"Material\"` here.",
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

const header = `/**
 * The Roblox engine's vocabulary, as names.
 *
 * Generated by \`scripts/build-roblox.mjs\` from a local export of the Creator
 * Hub — do not edit by hand. Only names are taken: what the engine calls its
 * classes, enums, datatypes and globals, which is the public surface of the API
 * rather than anything Roblox authored. No prose and no descriptions.
 *
 * These are **suggestions, never gates**. Every pin that offers one of these
 * lists also takes a name typed by hand, so a class Roblox ships next month
 * needs no release here — see \`PinDef.options\`.
 */

`;

writeFileSync(OUT, header + body + "\n", "utf8");
for (const [name, found] of Object.entries(lists)) {
	const count = (found ?? keep(name)).length;
	console.log(`${name.padEnd(16)} ${String(count).padStart(4)}${found ? "" : "  (kept)"}`);
}
console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`);
