/**
 * The Roblox engine as its documentation describes it: every class, enum,
 * datatype, global and library, with their members. Generated into
 * `robloxEngine.json` by `scripts/build-engine.mjs`; refresh it with
 * `npm run build:engine` and read the diff.
 *
 * The summaries are text from Roblox's Creator Documentation
 * (https://github.com/Roblox/creator-docs), (c) Roblox Corporation, used under
 * CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), each shortened to
 * its first sentence with its markup removed. They are not covered by
 * Roswaal's 0BSD licence; see ATTRIBUTIONS.md.
 */

import data from "./robloxEngine.json" with { type: "json" };

export interface EngineParam {
	name: string;
	type: string;
	default?: string;
}

/** What every member carries: its words, and where it may be used. */
export interface EngineMember {
	name: string;
	summary: string;
	/** `None` is left out; otherwise a level, or `{ read, write }` for a property. */
	security?: string | { read?: string; write?: string };
	threadSafety?: string;
	capabilities?: string[];
	tags?: string[];
	deprecated?: boolean;
}

export interface EngineProperty extends EngineMember {
	type: string;
	category?: string;
}

export interface EngineFunction extends EngineMember {
	params: EngineParam[];
	/** What it returns, joined with commas; `""` for nothing. */
	returns: string;
}

export interface EngineEvent extends EngineMember {
	params: EngineParam[];
}

export interface EngineClass {
	superclass?: string;
	summary: string;
	tags?: string[];
	memoryCategory?: string;
	deprecated?: boolean;
	properties: EngineProperty[];
	methods: EngineFunction[];
	events: EngineEvent[];
	callbacks: EngineFunction[];
}

export interface EngineEnum {
	summary: string;
	deprecated?: boolean;
	items: { name: string; value: number; summary: string; deprecated?: boolean }[];
}

export interface EngineDatatype {
	summary: string;
	constructors: EngineEvent[];
	constants: EngineProperty[];
	properties: EngineProperty[];
	methods: EngineFunction[];
	functions: EngineFunction[];
}

export interface EngineLibrary {
	summary: string;
	functions: EngineFunction[];
	properties: EngineProperty[];
}

export interface EngineCatalogue {
	/** The attribution the text is used under, carried with the data. */
	licence: string;
	/** The Studio build the documentation describes. */
	studioVersion: string;
	classes: Record<string, EngineClass>;
	enums: Record<string, EngineEnum>;
	datatypes: Record<string, EngineDatatype>;
	globals: Record<string, EngineLibrary>;
	libraries: Record<string, EngineLibrary>;
}

export const ENGINE = data as unknown as EngineCatalogue;

/** `(className: string, parent: Instance?)` */
export function signatureText(params: readonly EngineParam[]): string {
	return `(${params.map((p) => `${p.name}: ${p.type || "any"}`).join(", ")})`;
}
