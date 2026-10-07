/**
 * Which classes `Instance.new` can make.
 *
 * Not every class can be. An abstract base -- `BasePart`, `GuiObject`,
 * `Instance` itself -- exists to be derived from, and a service is made by the
 * engine once and fetched with `GetService`. Studio's own data says which: a
 * class tagged `NotCreatable`, or `Service`, is one `Instance.new` refuses at
 * run time with "Unable to create an Instance of type".
 *
 * So Instance.new's Class Name offers only the rest, and a class known to be
 * uncreatable is an error before the script runs rather than when it does. A
 * name this build does not know is still taken: the list is the engine's as of
 * the data's Studio version, and a class shipped since is typed in and works.
 */

import { CLASS_OPTIONS, isSubclassOf } from "./roblox.js";
import { ENGINE } from "./robloxEngine.js";

const classes = ENGINE.classes;

/** Every class `Instance.new` refuses: tagged NotCreatable, or a service. */
export const UNCREATABLE: ReadonlySet<string> = new Set(
	Object.entries(classes)
		.filter(([, c]) => c.tags?.includes("NotCreatable") || c.tags?.includes("Service"))
		.map(([name]) => name),
);

/** Whether `Instance.new` can make this class. A name the data does not know is given the benefit. */
export function isCreatable(name: string): boolean {
	return !UNCREATABLE.has(name.trim());
}

/** Instance.new's Class Name: the usual class list, less what it cannot make. */
export const CREATABLE_CLASS_OPTIONS: string[] = CLASS_OPTIONS.filter(
	(name) => !UNCREATABLE.has(name),
);

/**
 * A few classes that can be made in place of one that cannot: what derives
 * from it, the commonest first -- `Part` and `MeshPart` for `BasePart`. None
 * for `Instance`, which everything derives from, so nothing in particular.
 */
export function creatableInstead(name: string, limit = 3): string[] {
	if (name === "Instance") return [];
	return CREATABLE_CLASS_OPTIONS.filter(
		(other) => other !== name && isSubclassOf(other, name),
	).slice(0, limit);
}
