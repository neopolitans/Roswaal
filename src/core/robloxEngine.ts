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

/**
 * A datatype's properties as read off a value of it: `v.X`, `v.Magnitude`.
 * The documentation lists the constants (`Vector3.zero`, `CFrame.identity`)
 * among the properties too, and those are read off the name, not a value.
 */
export function valueProperties(datatype: string): EngineProperty[] {
	const found = ENGINE.datatypes[datatype];
	if (!found) return [];
	const constants = new Set(found.constants.map((c) => c.name));
	return found.properties.filter((p) => !constants.has(p.name));
}

/**
 * A class's property by name, its own or one it inherits, ignoring case: a
 * place file stores some under another case than the documentation names.
 */
export function findProperty(className: string, name: string): EngineProperty | undefined {
	const lower = name.toLowerCase();
	for (let cls: string | undefined = className; cls; cls = ENGINE.classes[cls]?.superclass) {
		const found = ENGINE.classes[cls]?.properties.find((p) => p.name.toLowerCase() === lower);
		if (found) return found;
	}
	return undefined;
}

/**
 * Whether a script can read this property of the class but not set it.
 *
 * The engine's `ReadOnly` tag, or a write that needs more than a game script
 * has. Not the Properties panel's `settable`, which also refuses `Hidden`:
 * that is a question about the place file, and scripts set `Position` and
 * `Orientation`, both hidden, all the time. A property the catalogue does not
 * know is not read-only here: the catalogue is a build old, and saying no to
 * what cannot be checked would be a wrong answer about a new property.
 */
export function readOnlyToScripts(className: string, name: string): boolean {
	const property = findProperty(className, name);
	if (!property || property.name !== name) return false;
	if (property.tags?.includes("ReadOnly")) return true;
	const security = property.security;
	const write = typeof security === "string" ? security : security?.write;
	return write !== undefined && write !== "None";
}

/** `(className: string, parent: Instance?)` */
export function signatureText(params: readonly EngineParam[]): string {
	return `(${params.map((p) => `${p.name}: ${p.type || "any"}`).join(", ")})`;
}
