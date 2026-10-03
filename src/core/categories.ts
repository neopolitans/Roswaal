/**
 * What a node category is called on screen, as opposed to what it is keyed by.
 *
 * Apart from the schema because it is about display: the menu, the picker and
 * the documentation read it, and nothing that stores or compiles a graph does.
 */

import { ENGINE_TYPES } from "./schema.js";

/**
 * Whether the Roblox-facing categories are *called* Roblox on screen.
 *
 * They were, once. They became "Engine" and "Engine Types" to keep somebody
 * else's trademark out of the product's own chrome — the posture being that a
 * borrowed name belongs in documentation, where it can be credited, rather than
 * in a menu where it reads as a claim.
 *
 * Lune is the reason to go back. A graph now compiles for one of two runtimes,
 * and "Engine" is only unambiguous while there is one engine: a Lune developer
 * reading "Engine Types" has to already know it means Roblox's. Naming the
 * platform a node is *for* is what the name is for, and it is the ordinary way
 * one product says which other product it works with.
 *
 * ## One flag, because it may have to go back
 *
 * Flip this to `false` and every menu, heading and node page says "Engine"
 * again on the next build. Nothing else changes and nothing has to be found:
 * the strings above stay as they are, so this decides **what is displayed** and
 * not what anything is keyed by.
 *
 * That split is deliberate rather than tidy. A category name is `slugify`d into
 * a published documentation URL — `nodes/engine` — so renaming the key would
 * move every one of those pages, and moving them back would move them twice.
 * A label moves nothing.
 *
 * See `ATTRIBUTIONS.md` for the credit this obliges, which is now about the
 * product and not only about its documentation.
 */
export const ROBLOX_NAMED_CATEGORIES = true;

/** What a category is called on screen, which is not what it is keyed by. */
const CATEGORY_LABELS: Record<string, string> = {
	Engine: "Roblox",
	[ENGINE_TYPES]: "Roblox Types",
};

/**
 * A category as a reader should see it.
 *
 * Everything that *shows* a category goes through this — the node menu, the
 * picker, the documentation's headings and a node's own page. Everything that
 * *keys* by one does not.
 */
export function categoryLabel(category: string): string {
	if (!ROBLOX_NAMED_CATEGORIES) return category;
	return CATEGORY_LABELS[category] ?? category;
}
