/**
 * An icon for every engine class and Roblox datatype, in its purpose's colour.
 *
 * Reads the classes from `src/core/robloxEngine.json`, decides each one's
 * purpose and glyph by the rules in `lib/classIconRules.mjs`, and writes
 * `src/core/classIconData.ts` and `classIconPurposes.ts`: every icon's SVG markup, filled and outline, in
 * Material's 960 grid, and which class and datatype wears which.
 *
 * ## Where the shapes come from
 *
 * - Material Symbols (Apache-2.0, Google), version `MATERIAL` below, fetched
 *   from jsDelivr into `node_modules/.cache` the first time and read from there
 *   after. Credited in ATTRIBUTIONS.md and `notices/upstream/material-symbols.txt`.
 * - Roswaal's own drawings in `assets/`: CFrame, TrussPart, EchoIcon and
 *   NoClassIcon (0BSD, with the Affinity files they were exported from).
 * - Composites built here from both: ScrollingFrame's scroll bar, the server
 *   mark on networked events and functions, and so on. See `COMPOSITES`.
 *
 * Roblox's own class icons are not used, looked at or traced.
 *
 * ## The three layers
 *
 * An icon is `[under, cut, over]`. `cut` is cut out of `under` by a mask, and
 * `over` is drawn on top, uncut: the server mark is a hole in the bolt with the
 * server drawn in it. A real cut rather than a patch of background colour,
 * because the icon sits on a highlighted row as often as on the panel.
 *
 * ## Run on purpose, commit the result
 *
 *     npm run build:icons
 *
 * A normal build never touches the network.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as R from "./lib/classIconRules.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MATERIAL = "0.49.0";
const CACHE = join(ROOT, "node_modules", ".cache", `material-symbols-${MATERIAL}`);
const OUT = join(ROOT, "src", "core", "classIconData.ts");
const PURPOSES_OUT = join(ROOT, "src", "core", "classIconPurposes.ts");

/** Roswaal's own drawings, by the name the rules use: the file, and whether it keeps its own colours. */
const DRAWN = {
	CFrame: ["CFrameRecolourable.svg", false],
	CFrameColored: ["CFrameColored.svg", true],
	TrussPart: ["TrussPart.svg", false],
	EchoIcon: ["EchoIcon.svg", false],
	NoClassIcon: ["NoClassIcon.svg", false],
};

const engine = JSON.parse(
	await readFile(join(ROOT, "src", "core", "robloxEngine.json"), "utf8"),
).classes;

// ---------------------------------------------------------------------------
// Purposes and glyphs, by the rules
// ---------------------------------------------------------------------------

function chain(name) {
	const out = [];
	for (let c = name; c in engine && !out.includes(c); c = engine[c].superclass) out.push(c);
	return out;
}

function purposeOf(name) {
	for (const a of chain(name)) if (a in R.ANCESTORS) return R.ANCESTORS[a];
	for (const [pattern, purpose] of R.NAMES) if (pattern.test(name)) return purpose;
	return "studio";
}

function frameOf(name) {
	for (const a of chain(name)) if (a in R.FRAMES) return R.FRAMES[a];
	return undefined;
}

function glyphOf(name, purpose) {
	if (name in R.GLYPHS) return R.GLYPHS[name];
	for (const [pattern, glyph] of R.TOKENS) if (pattern.test(name)) return glyph;
	return R.PURPOSES[purpose].glyph;
}

function markOf(name) {
	for (const a of chain(name)) if (a in R.MARKS) return R.MARKS[a];
	return "data_object";
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** A Material glyph's path data, outline or filled, from the cache or jsDelivr. */
async function material(name, filled) {
	const file = `${name}${filled ? "-fill" : ""}.svg`;
	const at = join(CACHE, file);
	let text;
	try {
		text = await readFile(at, "utf8");
	} catch {
		const url = `https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@${MATERIAL}/outlined/${file}`;
		const response = await fetch(url);
		if (!response.ok) throw new Error(`${url}: ${response.status}`);
		text = await response.text();
		await mkdir(CACHE, { recursive: true });
		await writeFile(at, text);
	}
	const paths = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
	if (paths.length === 0) throw new Error(`${file}: no path`);
	return paths.map((d) => `<path d="${d}"/>`).join("");
}

/** One of Roswaal's drawings, in its own 512 grid, every fill the current colour unless it keeps its own. */
async function drawing(name) {
	const [file, keep] = DRAWN[name];
	const text = await readFile(join(ROOT, "assets", file), "utf8");
	const open = text.indexOf("<svg");
	const head = text.slice(open, text.indexOf(">", open));
	const style = /\sstyle="([^"]*)"/.exec(head)?.[1] ?? "";
	let body = text.slice(text.indexOf(">", open) + 1, text.lastIndexOf("</svg>"));
	if (!keep) body = body.replace(/fill:\s*(?!none)[^;"]+/g, "fill:currentColor");
	body = body
		.replace(/\s(serif:id|id)="[^"]*"/g, "")
		.replace(/>\s+</g, "><")
		.trim();
	return { body: `<g style="${style}">${body}</g>`, keep };
}

const num = (n) => String(Math.round(n * 1000) / 1000);

/** Markup in Material's grid placed in the box x, y, w (square). */
function place(markup, x, y, w, grid = 960) {
	const s = w / grid;
	// Material's grid runs 0 to -960; a drawing's runs 0 to 512 downwards.
	const dy = grid === 960 ? y + 960 * s : y;
	if (s === 1 && x === 0 && dy === 0) return markup;
	return `<g transform="translate(${num(x)} ${num(dy)}) scale(${num(s)})">${markup}</g>`;
}

/** A glyph by its rules name, filled or outline, filling the box. */
async function glyph(name, filled, x = 0, y = -960, w = 960) {
	if (name.startsWith("drawn:")) {
		const d = await drawing(name.slice(6));
		return place(d.body, x, y, w, 512);
	}
	return place(await material(name, filled), x, y, w);
}

const STROKE = 'fill="none" stroke="currentColor" stroke-width="60" stroke-linecap="round"';
const LINES = `<path d="M100-640H260M40-480H260M100-320H260" ${STROKE}/>`;
const BROKEN = `<path d="M100-640H140M210-640H260M40-480H110M190-480H260M100-320H140M210-320H260" ${STROKE}/>`;
const SQUARE_O =
	"M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm0-60h600v-600H180v600Z";
const SQUARE_F =
	"M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Z";
const PILL_O =
	"M140-240q-24 0-42-18t-18-42v-360q0-24 18-42t42-18h680q24 0 42 18t18 42v360q0 24-18 42t-42 18H140Zm0-60h680v-360H140v360Z";
const PILL_F =
	"M140-240q-24 0-42-18t-18-42v-360q0-24 18-42t42-18h680q24 0 42 18t18 42v360q0 24-18 42t-42 18H140Z";
const WINDOW =
	"M140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Zm0-60h680v-436H140v436Z";
const GLYPH_T = "M430-160v-540H200v-100h560v100H530v540H430Z";
const T = (cx, cy, s) =>
	`<path d="${GLYPH_T}" transform="translate(${cx} ${cy}) scale(${s}) translate(-480 480)"/>`;
/** The server mark's hole, and the server drawn in it: Material's dns, bottom right. */
const SERVER_CUT = '<circle cx="730" cy="-230" r="250"/>';
const server = (filled) => glyph("dns", filled, 540, -420, 380);

/**
 * Icons built from parts, each `[under, cut, over]` for filled or outline.
 * Material glyphs with marks of Roswaal's own, in Material's 960 grid and its
 * 60-unit stroke.
 */
const COMPOSITES = {
	// A Frame with a scroll bar down its right side.
	scrolling_frame: async (f) =>
		f
			? [
					`<path d="${SQUARE_F}"/>`,
					'<rect x="600" y="-780" width="180" height="600" rx="24"/>',
					'<rect x="660" y="-740" width="60" height="250" rx="30"/>',
				]
			: [
					`<path d="${SQUARE_O}"/><path d="M576-780h60v600h-60Z"/><rect x="678" y="-740" width="60" height="250" rx="30"/>`,
				],
	// GuiButton's button holding TextLabel's T.
	text_button: async (f) =>
		f
			? [`<path d="${PILL_F}"/>`, T(480, -480, 0.5)]
			: [`<path d="${PILL_O}"/>${T(480, -480, 0.5)}`],
	// GuiObject's window holding the T and a text caret: somewhere to type.
	text_box: async () => [
		`<path d="${WINDOW}"/>${T(340, -438, 0.38)}<rect x="560" y="-610" width="44" height="344" rx="22"/>`,
	],
	// Events: a bolt, with the server mark when it crosses the network.
	bolt_server: async (f) => [await glyph("bolt", f), SERVER_CUT, await server(f)],
	// One that may not arrive: broken lines behind it.
	bolt_server_broken: async (f) => [
		`${await glyph("bolt", f, 200, -860, 760)}${BROKEN}`,
		SERVER_CUT,
		await server(f),
	],
	// ReplicatedStorage's box, with what sets the other two apart in the corner:
	// the server for ServerStorage, a rocket for ReplicatedFirst.
	storage_server: async (f) => [await glyph("inventory_2", f), SERVER_CUT, await server(f)],
	storage_first: async (f) => [
		await glyph("inventory_2", f),
		SERVER_CUT,
		await glyph("rocket_launch", f, 540, -420, 380),
	],
	// Functions: a cube in motion.
	deployed_code_motion: async (f) => [`${await glyph("deployed_code", f, 200, -860, 760)}${LINES}`],
	deployed_code_motion_server: async (f) => [
		`${await glyph("deployed_code", f, 200, -860, 760)}${LINES}`,
		SERVER_CUT,
		await server(f),
	],
};

/** The value frame, filled or outline, for the ValueBase classes. */
const FRAME_F = '<rect x="110" y="-850" width="740" height="740" rx="150"/>';
const FRAME_O =
	'<rect x="110" y="-850" width="740" height="740" rx="150" fill="none" stroke="currentColor" stroke-width="64"/>';

/** An icon's layers, filled or outline. */
async function layers(spec, filled) {
	if (spec.frame) {
		const mark = await glyph(spec.glyph, filled, 250, -710, 460);
		return filled ? [FRAME_F, mark] : [FRAME_O + mark];
	}
	if (spec.glyph.startsWith("c:")) return COMPOSITES[spec.glyph.slice(2)](filled);
	return [await glyph(spec.glyph, filled)];
}

// ---------------------------------------------------------------------------
// Resolve and write
// ---------------------------------------------------------------------------

const PURPOSE_IDS = Object.keys(R.PURPOSES);
const bodies = [];
const bodyIndex = new Map();

/** The index of an icon's markup, shared by every class that wears it. */
async function bodyOf(spec) {
	const key = `${spec.frame ?? ""}|${spec.glyph}`;
	if (bodyIndex.has(key)) return bodyIndex.get(key);
	const trim = (l) => {
		const out = [...l];
		while (out.length > 1 && !out[out.length - 1]) out.pop();
		return out.map((s) => s ?? "");
	};
	const f = trim(await layers(spec, true));
	const o = trim(await layers(spec, false));
	const same = JSON.stringify(f) === JSON.stringify(o);
	bodies.push(same ? [f] : [f, o]);
	bodyIndex.set(key, bodies.length - 1);
	return bodies.length - 1;
}

const classes = {};
for (const name of Object.keys(engine).sort()) {
	if (R.SCRIPTS.has(name)) continue;
	const purpose = purposeOf(name);
	const frame = frameOf(name);
	const spec = frame ? { frame, glyph: markOf(name) } : { glyph: glyphOf(name, purpose) };
	classes[name] = [PURPOSE_IDS.indexOf(purpose), await bodyOf(spec)];
}
const types = {};
for (const [name, [g, purpose]] of Object.entries(R.DATATYPES).sort(([a], [b]) =>
	a.localeCompare(b),
)) {
	types[name] = [PURPOSE_IDS.indexOf(purpose), await bodyOf({ glyph: g })];
}
const none = await bodyOf({ glyph: "drawn:NoClassIcon" });

const purposes = Object.fromEntries(
	PURPOSE_IDS.map((id) => [id, [R.PURPOSES[id].label, R.PURPOSES[id].dark, R.PURPOSES[id].light]]),
);
const json = (v) => JSON.stringify(v);
const header = `// Generated by scripts/build-class-icons.mjs. Do not edit by hand.
// From the engine catalogue and the rules in scripts/lib/classIconRules.mjs: \`npm run build:icons\`.
`;
await writeFile(
	PURPOSES_OUT,
	`${header}
/** Each purpose: its label, and its colour on a dark scheme and a light one. */
export const PURPOSES = ${json(purposes)} as const;

export type Purpose = keyof typeof PURPOSES;

/** The purposes in order, for the indexes in classIconData.ts. */
export const PURPOSE_ORDER: readonly Purpose[] = ${json(PURPOSE_IDS)};
`,
);
const source = `${header}//
// Glyphs: Material Symbols ${MATERIAL} (Apache-2.0, Google), and Roswaal's own
// drawings in assets/ (0BSD). See ATTRIBUTIONS.md.

/**
 * Every icon's markup in Material's 960 grid: \`[under, cut, over]\` filled,
 * then the same outline where it differs.
 */
export const ICON_BODIES: readonly (readonly (readonly string[])[])[] = [
${bodies.map((b) => `\t${json(b)},`).join("\n")}
];

/** Each engine class but the scripts: its purpose and its icon, by index. */
export const CLASS_ICONS: Readonly<Record<string, readonly [number, number]>> = {
${Object.entries(classes)
	.map(([k, v]) => `\t${k}: ${json(v)},`)
	.join("\n")}
};

/** Each Roblox datatype with an icon: the purpose that colours it where its wire is grey, and its icon. */
export const TYPE_ICONS: Readonly<Record<string, readonly [number, number]>> = {
${Object.entries(types)
	.map(([k, v]) => `\t${k}: ${json(v)},`)
	.join("\n")}
};

/** The icon for a name with none of its own. */
export const NO_ICON = ${none};
`;
await writeFile(OUT, source);
console.log(
	`${Object.keys(classes).length} classes, ${Object.keys(types).length} types, ${bodies.length} icons, ${Math.round(source.length / 1024)} KiB`,
);
