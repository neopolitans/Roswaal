/**
 * The Roblox engine, as its own documentation describes it, in one catalogue.
 *
 * Every class with its properties, methods, events and callbacks — types,
 * parameters, what each returns, security, thread safety, capabilities, tags —
 * every enum and its items, every datatype with its constructors, constants,
 * properties and methods, and the globals and libraries Luau code reaches.
 * Written to `src/core/robloxEngine.json` and read through
 * `src/core/robloxEngine.ts`.
 *
 * ## Why creator-docs, and not the API dump
 *
 * Roblox publishes a machine-readable API dump beside each Studio build, but
 * with no licence, and its Terms of Use restrict redistributing the Services
 * and derivative works of them. Roblox's documentation repository is
 * explicitly licensed — prose under CC BY 4.0 — and its reference files carry
 * everything the dump does that Roswaal needs, plus what the dump lacks:
 * descriptions, and the datatypes. So this reads only creator-docs.
 *
 * ## Attribution
 *
 * The summaries are Roblox's text, used under CC BY 4.0 and changed (each
 * shortened to its first sentence, its markup removed). They are not 0BSD. The
 * notice travels inside the JSON as `licence`, and is on the Attributions page
 * and in ATTRIBUTIONS.md.
 *
 * ## Run on purpose, commit the result
 *
 *     npm run build:engine
 *
 * A normal build never touches the network. Refreshing the catalogue is a
 * deliberate step whose diff is there to be read, as every generated
 * catalogue in Roswaal is.
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "./lib/creatorDocs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "Roblox/creator-docs";
const REFERENCE = "content/en-us/reference/engine";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/${REFERENCE}`;
const API = `https://api.github.com/repos/${REPO}/contents/${REFERENCE}`;

/** The first sentence of a summary, on one line, with the doc links unwrapped. */
function brief(text) {
	const line = String(text ?? "").replace(/\s+/g, " ").trim();
	const stop = line.search(/\.(\s|$)/);
	return (stop >= 0 ? line.slice(0, stop + 1) : line)
		.replace(/`(?:Datatype|Class|Enum|Library|Global)\.([^`|]+)(?:\|[^`]+)?`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

const list = (value) => (Array.isArray(value) ? value : []);
const deprecated = (entry) => String(entry.deprecation_message ?? "").trim() !== ""
	|| list(entry.tags).includes("Deprecated");

/** A member's own name: `BasePart.Touched` is `Touched`, `Instance:IsA` is `IsA`. */
function own(full) {
	const text = String(full ?? "");
	const at = Math.max(text.lastIndexOf("."), text.lastIndexOf(":"));
	return at >= 0 ? text.slice(at + 1) : text;
}

function params(entry) {
	return list(entry.parameters).map((p) => ({
		name: String(p.name ?? ""),
		type: String(p.type ?? ""),
		...(p.default !== null && p.default !== undefined && String(p.default) !== ""
			? { default: String(p.default) } : {}),
	}));
}

function returns(entry) {
	return list(entry.returns).map((r) => String(r.type ?? "")).filter((t) => t !== "" && t !== "()").join(", ");
}

/** What every member keeps: its words, and the facts that decide where it can be used. */
function common(entry) {
	return {
		name: own(entry.name),
		summary: brief(entry.summary),
		...(entry.security !== undefined && entry.security !== "None" ? { security: entry.security } : {}),
		...(entry.thread_safety ? { threadSafety: String(entry.thread_safety) } : {}),
		...(list(entry.capabilities).length > 0 ? { capabilities: list(entry.capabilities).map(String) } : {}),
		...(list(entry.tags).length > 0 ? { tags: list(entry.tags).map(String) } : {}),
		...(deprecated(entry) ? { deprecated: true } : {}),
	};
}

async function folder(name) {
	const response = await fetch(`${API}/${name}`, {
		headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
	});
	if (!response.ok) throw new Error(`listing ${name}: ${response.status} ${response.statusText}`);
	const entries = await response.json();
	return entries.map((e) => e.name).filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -5));
}

/** Fetches every file in a folder, a few at a time, as parsed YAML by name. */
async function fetchAll(name, names, width = 16) {
	const out = new Map();
	const missing = [];
	for (let i = 0; i < names.length; i += width) {
		await Promise.all(names.slice(i, i + width).map(async (file) => {
			const response = await fetch(`${RAW}/${name}/${encodeURIComponent(file)}.yaml`);
			if (response.ok) out.set(file, parseYaml(await response.text()));
			else missing.push(file);
		}));
	}
	if (missing.length > 0) console.log(`  ${name}: no page for ${missing.join(", ")}`);
	return out;
}

const studioVersion = (await (await fetch(`${RAW}/STUDIO_VERSION`)).text()).trim().split(/\s+/)[0];

const classes = {};
for (const [name, doc] of [...(await fetchAll("classes", await folder("classes")))].sort()) {
	classes[name] = {
		...(list(doc.inherits)[0] ? { superclass: String(list(doc.inherits)[0]) } : {}),
		summary: brief(doc.summary),
		...(list(doc.tags).length > 0 ? { tags: list(doc.tags).map(String) } : {}),
		...(doc.memory_category ? { memoryCategory: String(doc.memory_category) } : {}),
		...(deprecated(doc) ? { deprecated: true } : {}),
		properties: list(doc.properties).map((e) => ({
			...common(e),
			type: String(e.type ?? ""),
			...(e.category ? { category: String(e.category) } : {}),
		})),
		methods: list(doc.methods).map((e) => ({ ...common(e), params: params(e), returns: returns(e) })),
		events: list(doc.events).map((e) => ({ ...common(e), params: params(e) })),
		callbacks: list(doc.callbacks).map((e) => ({ ...common(e), params: params(e), returns: returns(e) })),
	};
}

const enums = {};
for (const [name, doc] of [...(await fetchAll("enums", await folder("enums")))].sort()) {
	enums[name] = {
		summary: brief(doc.summary),
		...(deprecated(doc) ? { deprecated: true } : {}),
		items: list(doc.items).map((item) => ({
			name: String(item.name ?? ""),
			value: Number(item.value ?? 0),
			summary: brief(item.summary),
			...(deprecated(item) ? { deprecated: true } : {}),
		})),
	};
}

const datatypes = {};
for (const [name, doc] of [...(await fetchAll("datatypes", await folder("datatypes")))].sort()) {
	datatypes[name] = {
		summary: brief(doc.summary),
		constructors: list(doc.constructors).map((e) => ({ ...common(e), params: params(e) })),
		constants: list(doc.constants).map((e) => ({ ...common(e), type: String(e.type ?? "") })),
		properties: list(doc.properties).map((e) => ({ ...common(e), type: String(e.type ?? "") })),
		methods: list(doc.methods).map((e) => ({ ...common(e), params: params(e), returns: returns(e) })),
		functions: list(doc.functions).map((e) => ({ ...common(e), params: params(e), returns: returns(e) })),
	};
}

/** Globals and libraries share a shape: functions and properties by name. */
function reachable(doc) {
	return {
		summary: brief(doc.summary),
		functions: list(doc.functions).map((e) => ({ ...common(e), params: params(e), returns: returns(e) })),
		properties: list(doc.properties).map((e) => ({ ...common(e), type: String(e.type ?? "") })),
	};
}
const globals = {};
for (const [name, doc] of await fetchAll("globals", await folder("globals"))) globals[name] = reachable(doc);
const libraries = {};
for (const [name, doc] of await fetchAll("libraries", await folder("libraries"))) libraries[name] = reachable(doc);

const catalogue = {
	licence:
		"Text from Roblox's Creator Documentation (https://github.com/Roblox/creator-docs), " +
		"(c) Roblox Corporation, used under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). " +
		"Changed: each summary shortened to its first sentence and its markup removed. " +
		"Not covered by Roswaal's 0BSD licence; see ATTRIBUTIONS.md.",
	studioVersion,
	classes,
	enums,
	datatypes,
	globals,
	libraries,
};

await writeFile(join(ROOT, "src/core/robloxEngine.json"), `${JSON.stringify(catalogue)}\n`);

const members = Object.values(classes).reduce(
	(n, c) => n + c.properties.length + c.methods.length + c.events.length + c.callbacks.length, 0,
);
console.log(
	`Studio ${studioVersion}: ${Object.keys(classes).length} classes (${members} members), ` +
	`${Object.keys(enums).length} enums, ${Object.keys(datatypes).length} datatypes, ` +
	`${Object.keys(globals).length} globals, ${Object.keys(libraries).length} libraries ` +
	"-> src/core/robloxEngine.json",
);
