/**
 * The project's `.luaurc` aliases, and the specifiers worth offering.
 *
 * Held outside React state for the reason `projectTypes.ts` is: two unrelated
 * places read it — the module row in the Variables panel and the Require at Top
 * node in the Inspector — and threading it between them would be props for
 * their own sake. `App` fills it from the daemon; this only holds it.
 *
 * ## Why a suggestion and not a picker
 *
 * A specifier has to stay typeable. The set of things a require can name is
 * still moving — a `.luaurc` written after this build, a path nobody has made
 * yet — and a control that only offers what Roswaal knows would be a control
 * that refuses the thing you are in the middle of adding. So it is a
 * `<datalist>`: everything known is one keystroke away, and anything else is
 * just typed.
 */

import { useSyncExternalStore } from "react";

import { aliasesOf, chainFor, parseLuaurc, type LuaurcSource } from "../core/luaurc.js";
import { LUNE_MODULES } from "../core/luneApi.js";
import { ROBLOX_ALIASES } from "../core/modules.js";
import type { Target } from "../core/schema.js";

let current: LuaurcSource[] = [];
const listeners = new Set<() => void>();

export function setProjectAliases(next: LuaurcSource[]): void {
	current = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useProjectLuaurc(): LuaurcSource[] {
	return useSyncExternalStore(subscribe, () => current, () => current);
}

export interface SpecifierSuggestion {
	/** What goes in the field. */
	value: string;
	/** Why it is offered, shown beside it where the control can. */
	what: string;
}

/**
 * Everything a specifier could sensibly be, for this graph.
 *
 * Ordered by how close to hand each is: the project's own aliases first,
 * because they are what somebody here has decided; then the runtime's built-in
 * prefixes; then the two path forms, which need no knowledge at all.
 *
 * `filePath` is the graph doing the requiring. A `.luaurc` in `src/ui` defines
 * aliases for `src/ui` and below, so which aliases are offered depends on where
 * the graph is — the same rule the compiler resolves by, asked here so the two
 * cannot disagree about what exists.
 */
export function specifierSuggestions(
	files: LuaurcSource[], filePath: string, target: Target,
): SpecifierSuggestion[] {
	const out: SpecifierSuggestion[] = [];

	const chain = chainFor(files.map((file) => parseLuaurc(file.dir, file.text)), filePath);
	for (const [, alias] of aliasesOf(chain)) {
		out.push({
			value: `@${alias.name}`,
			what: alias.from === "" ? "from the project's .luaurc" : `from ${alias.from}/.luaurc`,
		});
	}

	if (target === "lune") {
		// Lune reserves these, so no `.luaurc` can redefine them and every one
		// of them resolves without a project having said anything.
		for (const module of LUNE_MODULES) {
			out.push({ value: `@lune/${module.alias}`, what: module.what });
		}
	} else {
		for (const alias of ROBLOX_ALIASES) {
			out.push({
				value: `@${alias}/`,
				what: alias === "self"
					? "this script's own children"
					: "down from the DataModel root",
			});
		}
	}

	out.push({ value: "./", what: "a sibling of this file" });
	out.push({ value: "../", what: "up one, then down" });
	return out;
}
