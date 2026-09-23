/**
 * The views the code editor reads, taken from the engine catalogue.
 *
 * What a datatype's name reaches after a dot, one sentence on each class and
 * datatype, and each class's own methods — shaped for completion and hover.
 * Built from `robloxEngine.ts` rather than generated separately, so there is
 * one catalogue to refresh (`npm run build:engine`) and one set of terms it is
 * used under: the summaries are Roblox's text under CC BY 4.0; see that file
 * and ATTRIBUTIONS.md. Deprecated members are left out of all of it.
 */

import { ENGINE, signatureText, type EngineParam } from "./robloxEngine.js";

export interface DatatypeStatic {
	name: string;
	kind: "constructor" | "constant" | "function";
	/** The signature of a constructor or function, or a constant's type. */
	detail: string;
	summary: string;
}

export interface ClassMethod {
	name: string;
	/** Its parameters: `(className: string)`. */
	detail: string;
	/** What it returns, or "" for nothing. */
	returns: string;
	summary: string;
}

/** A constructor with overloads is listed once: its first signature, and how many more. */
function withOverloads(
	entries: readonly { name: string; summary: string; params: EngineParam[]; deprecated?: boolean }[],
	kind: DatatypeStatic["kind"],
): DatatypeStatic[] {
	const out: DatatypeStatic[] = [];
	const counts = new Map<string, number>();
	for (const entry of entries) {
		if (entry.deprecated || !/^[A-Za-z_]\w*$/.test(entry.name)) continue;
		const seen = counts.get(entry.name);
		counts.set(entry.name, (seen ?? 0) + 1);
		if (seen === undefined) {
			out.push({ name: entry.name, kind, detail: signatureText(entry.params), summary: entry.summary });
		}
	}
	return out.map((item) => {
		const more = (counts.get(item.name) ?? 1) - 1;
		return more > 0 ? { ...item, detail: `${item.detail} +${more} more` } : item;
	});
}

function staticsOf(name: string): DatatypeStatic[] {
	const datatype = ENGINE.datatypes[name];
	return [
		...withOverloads(datatype.constructors, "constructor"),
		...datatype.constants
			.filter((c) => !c.deprecated)
			.map((c) => ({ name: c.name, kind: "constant" as const, detail: c.type, summary: c.summary })),
		...withOverloads(datatype.functions, "function"),
	];
}

export const DATATYPE_STATICS: Record<string, readonly DatatypeStatic[]> = Object.fromEntries(
	Object.keys(ENGINE.datatypes)
		.map((name) => [name, staticsOf(name)] as const)
		.filter(([, list]) => list.length > 0),
);

export const CLASS_SUMMARIES: Record<string, string> = Object.fromEntries(
	Object.entries(ENGINE.classes).filter(([, c]) => c.summary !== "").map(([name, c]) => [name, c.summary]),
);

export const DATATYPE_SUMMARIES: Record<string, string> = Object.fromEntries(
	Object.entries(ENGINE.datatypes).filter(([, d]) => d.summary !== "").map(([name, d]) => [name, d.summary]),
);

/** Each class's own methods, not inherited ones, by class name. */
export const CLASS_METHODS: Record<string, readonly ClassMethod[]> = Object.fromEntries(
	Object.entries(ENGINE.classes)
		.map(([name, c]) => [name, c.methods
			.filter((m) => !m.deprecated)
			.map((m) => ({ name: m.name, detail: signatureText(m.params), returns: m.returns, summary: m.summary }))] as const)
		.filter(([, list]) => list.length > 0),
);
