/**
 * What each Roblox datatype offers after its name and a dot.
 *
 * `Instance.new`, `Vector3.new`, `Vector3.zero`, `CFrame.lookAt`,
 * `Color3.fromRGB`: the constructors and constants a datatype's own name
 * reaches. The code editor's completion knew Luau's libraries — `math.`,
 * `string.` — and nothing of these, so `Instance.` offered nothing at all.
 * `Instance` is the case that makes the point: it is a class, whose members
 * the property catalogue already lists, and a datatype, whose one constructor
 * is `Instance.new` — two different things reached by one name.
 *
 * Read from Roblox's own creator-docs, as the class catalogues are, so the
 * list is the engine's and not a hand-kept guess. Run it on purpose:
 *
 *     npm run build:statics
 *
 * and commit what it writes. A normal build never touches the network.
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLASSES, DATATYPES } from "../src/core/robloxData.ts";
import { parseYaml } from "./lib/creatorDocs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE =
	"https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine";
const BASE = `${REFERENCE}/datatypes`;

/** Fetches `names` from one folder, a few at a time, as parsed YAML by name. */
async function fetchAll(folder, names, width = 16) {
	const out = new Map();
	for (let i = 0; i < names.length; i += width) {
		await Promise.all(names.slice(i, i + width).map(async (name) => {
			const response = await fetch(`${REFERENCE}/${folder}/${encodeURIComponent(name)}.yaml`);
			if (response.ok) out.set(name, parseYaml(await response.text()));
		}));
	}
	return out;
}

/** The first sentence of a summary, on one line. */
function brief(text) {
	const line = String(text ?? "").replace(/\s+/g, " ").trim();
	const stop = line.search(/\.(\s|$)/);
	return (stop >= 0 ? line.slice(0, stop + 1) : line)
		.replace(/`(?:Datatype|Class|Enum|Library)\.([^`|]+)(?:\|[^`]+)?`/g, "$1");
}

function signature(entry) {
	const params = Array.isArray(entry.parameters) ? entry.parameters : [];
	return `(${params.map((p) => `${p.name}: ${p.type ?? "any"}`).join(", ")})`;
}

const statics = {};
const missing = [];

for (const datatype of DATATYPES) {
	const response = await fetch(`${BASE}/${encodeURIComponent(datatype)}.yaml`);
	if (!response.ok) {
		missing.push(datatype);
		continue;
	}
	const doc = parseYaml(await response.text());
	const out = [];
	const seen = new Map();

	const add = (entry, kind) => {
		const full = String(entry.name ?? "");
		const dot = full.indexOf(".");
		if (dot < 0 || full.slice(0, dot) !== datatype) return;
		const name = full.slice(dot + 1);
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return;
		// Several overloads of one constructor: listed once, with the first
		// signature and how many more there are.
		const known = seen.get(name);
		if (known) {
			known.overloads += 1;
			return;
		}
		const item = {
			name,
			kind,
			detail: kind === "constant" ? String(entry.type ?? "") : signature(entry),
			summary: brief(entry.summary),
			overloads: 1,
		};
		seen.set(name, item);
		out.push(item);
	};

	for (const entry of Array.isArray(doc.constructors) ? doc.constructors : []) add(entry, "constructor");
	for (const entry of Array.isArray(doc.constants) ? doc.constants : []) add(entry, "constant");
	for (const entry of Array.isArray(doc.functions) ? doc.functions : []) add(entry, "function");

	if (out.length > 0) {
		statics[datatype] = out.map(({ overloads, ...item }) => (
			overloads > 1 ? { ...item, detail: `${item.detail} +${overloads - 1} more` } : item
		));
	}
}

/**
 * One sentence on what each class and datatype is, for the code editor's
 * hover: `Instance.new("Part")` returns a Part, and the hover says what a
 * Part is and links to its page.
 */
const summaries = { classes: {}, datatypes: {} };
/**
 * Each class's own methods — `Instance:IsA`, `Instance:FindFirstChild` — for
 * hover and completion after a colon. Own only: inherited ones are found by
 * walking up the hierarchy, so `IsA` is listed once, on Instance, rather
 * than on six hundred classes.
 */
const methods = {};
for (const [name, doc] of await fetchAll("classes", [...CLASSES])) {
	const line = brief(doc.summary);
	if (line) summaries.classes[name] = line;
	const own = [];
	for (const entry of Array.isArray(doc.methods) ? doc.methods : []) {
		if (String(entry.deprecation_message ?? "").trim() !== "") continue;
		const full = String(entry.name ?? "");
		const method = full.slice(full.indexOf(":") + 1);
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(method)) continue;
		const returns = (Array.isArray(entry.returns) ? entry.returns : [])
			.map((r) => String(r.type ?? "")).filter((t) => t !== "" && t !== "()");
		own.push({
			name: method,
			detail: signature(entry),
			returns: returns.join(", "),
			summary: brief(entry.summary),
		});
	}
	if (own.length > 0) methods[name] = own;
}
for (const [name, doc] of await fetchAll("datatypes", [...DATATYPES])) {
	const line = brief(doc.summary);
	if (line) summaries.datatypes[name] = line;
}

const header = [
	"/**",
	" * Generated by `scripts/build-statics.mjs` from Roblox's creator-docs.",
	" * Do not edit by hand; run `npm run build:statics` and commit the result.",
	" *",
	" * What a datatype's own name reaches after a dot — its constructors,",
	" * constants and static functions, once each — and one sentence on what",
	" * each class and datatype is. See the script for why.",
	" */",
	"",
	"export interface DatatypeStatic {",
	"\tname: string;",
	"\tkind: \"constructor\" | \"constant\" | \"function\";",
	"\t/** The signature of a constructor or function, or a constant's type. */",
	"\tdetail: string;",
	"\tsummary: string;",
	"}",
	"",
].join("\n");

await writeFile(
	join(ROOT, "src/core/robloxStatics.ts"),
	`${header}export const DATATYPE_STATICS: Record<string, readonly DatatypeStatic[]> = ${JSON.stringify(statics, null, "\t")};\n\n` +
	`/** One sentence per class, by class name. */\n` +
	`export const CLASS_SUMMARIES: Record<string, string> = ${JSON.stringify(summaries.classes, null, "\t")};\n\n` +
	`/** One sentence per datatype, by name. */\n` +
	`export const DATATYPE_SUMMARIES: Record<string, string> = ${JSON.stringify(summaries.datatypes, null, "\t")};\n\n` +
	`export interface ClassMethod {\n\tname: string;\n\t/** Its parameters: \`(className: string)\`. */\n\tdetail: string;\n\t/** What it returns, or "" for nothing. */\n\treturns: string;\n\tsummary: string;\n}\n\n` +
	`/** Each class's own methods, not inherited ones, by class name. */\n` +
	`export const CLASS_METHODS: Record<string, readonly ClassMethod[]> = ${JSON.stringify(methods)};\n`,
);
console.log(`${Object.values(methods).reduce((n, list) => n + list.length, 0)} methods across ${Object.keys(methods).length} classes`);
console.log(`${Object.keys(summaries.classes).length} class summaries, ${Object.keys(summaries.datatypes).length} datatype summaries`);

const count = Object.values(statics).reduce((n, list) => n + list.length, 0);
console.log(`${Object.keys(statics).length} datatypes, ${count} statics -> src/core/robloxStatics.ts`);
if (missing.length > 0) console.log(`no page for: ${missing.join(", ")}`);
