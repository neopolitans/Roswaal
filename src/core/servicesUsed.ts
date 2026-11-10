/**
 * The services a piece of Luau reaches: what DataModel lists besides the
 * services that hold something.
 *
 * `game:GetService("Players")`, with either quote, `game.Players` and the
 * `workspace` global. Read as text, not parsed: a service named in a comment
 * or a string counts too, which lists a service rather than hiding one, the
 * harmless way to be wrong.
 */

import { ENGINE } from "./robloxEngine.js";

/** A service by the engine catalogue: every class tagged Service. */
function isService(name: string): boolean {
	return (
		Object.hasOwn(ENGINE.classes, name) && (ENGINE.classes[name].tags ?? []).includes("Service")
	);
}

const GET_SERVICE = /\bGetService\s*\(\s*["'`]([A-Za-z]+)["'`]\s*\)/g;
const GAME_DOT = /\bgame\s*\.\s*([A-Za-z]+)/g;
const WORKSPACE = /\bworkspace\b/;

/** The service class names `source` reaches, each once. */
export function servicesUsed(source: string): Set<string> {
	const out = new Set<string>();
	for (const [, name] of source.matchAll(GET_SERVICE)) if (isService(name)) out.add(name);
	for (const [, name] of source.matchAll(GAME_DOT)) if (isService(name)) out.add(name);
	if (WORKSPACE.test(source)) out.add("Workspace");
	return out;
}
