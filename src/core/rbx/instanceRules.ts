/**
 * What Studio lets be made, deleted, moved and duplicated in a place, learnt by
 * asking it to make every class there is under every kind of parent. Apart
 * from `instances.ts`, which writes the change, so the editor can say why an
 * entry is off without bundling the place writers.
 */

import { isSubclassOf } from "../roblox.js";
import { ENGINE } from "../robloxEngine.js";

/**
 * Classes the catalogue lets be made that Studio would not put in a place:
 * refused, or made and never saved. Found by making one of every class.
 */
const NOT_IN_PLACES = new Set([
	"AdvancedDragger",
	"AudioSearchParams",
	"CustomLog",
	"DataStoreGetOptions",
	"DataStoreIncrementOptions",
	"DataStoreOptions",
	"DataStoreSetOptions",
	"Dragger",
	"ExperienceInviteOptions",
	"GetTextBoundsParams",
	"Player",
	"PluginAction",
	"PluginCapabilities",
	"StandalonePluginScripts",
]);

/** Classes Studio puts only under certain parents, and those parents. */
const PARENTS: readonly [string, readonly string[]][] = [
	["BaseWrap", ["MeshPart"]],
	["Bone", ["BasePart", "Bone"]],
	["Animator", ["Humanoid", "AnimationController"]],
	["AdPortal", ["Part"]],
];

/** Why an instance of `className` cannot be made in a place, or undefined if it can. */
export function classProblem(className: string): string | undefined {
	const known = ENGINE.classes[className];
	if (!known) return `Roswaal does not know the class ${className} yet`;
	const tags = known.tags ?? [];
	if (tags.includes("Service")) return `${className} is a service, and a place has one`;
	if (tags.includes("NotCreatable") || NOT_IN_PLACES.has(className))
		return `Studio does not make a ${className} in a place`;
	return undefined;
}

/** The classes an instance can be made of, not counting deprecated ones, by name. */
export function addableClasses(): string[] {
	return Object.keys(ENGINE.classes)
		.filter((name) => !classProblem(name) && !ENGINE.classes[name].deprecated)
		.sort();
}

/** Why an instance of `className` cannot go in a `parentClass`, or undefined if it can. */
export function parentProblem(className: string, parentClass: string): string | undefined {
	for (const [base, parents] of PARENTS)
		if (isSubclassOf(className, base) && !parents.some((p) => isSubclassOf(parentClass, p)))
			return `A ${className} goes in a ${parents.join(" or ")}`;
	return undefined;
}

/**
 * Why an instance of `className` cannot be deleted, moved or duplicated, or
 * undefined if it can. `topLevel` is for one at the top of the place.
 */
export function targetProblem(className: string, topLevel: boolean): string | undefined {
	if (topLevel) return "A service stays where it is";
	if (!ENGINE.classes[className]) return `Roswaal does not know the class ${className} yet`;
	if (classProblem(className)) return `Studio keeps a ${className} where it is`;
	return undefined;
}
