/**
 * The SolidModel assets a place's unions name, from what Sign in with Roblox
 * has downloaded: asked of the daemon, which fetches what the project lacks,
 * then read back and opened as the models they are, for their ChildData.
 * A union inside one that names an asset of its own is followed to it.
 *
 * Nothing is asked of anyone who is not signed in; their unions stay undrawn,
 * as they were. See `../../core/unions.ts` for how they are drawn.
 */

import type { RbxInstance } from "../../../../core/rbx/dom.js";
import { childDataOf, nestedUnionAssets, SOLID_MODEL_TYPE } from "../../core/unions.js";
import type { NotAsked } from "./assetProgress.js";
import { bytesOf, ensure, notAsked } from "./images.js";

/**
 * Each of `assets`, and the assets the unions inside them name, handed to
 * `show` as its ChildData is read; the answer is why none were asked for, or null.
 */
export async function loadUnionModels(
	assets: readonly string[],
	show: (asset: string, roots: RbxInstance[]) => void,
): Promise<NotAsked | null> {
	if (assets.length === 0) return null;
	const why = await notAsked();
	if (why) return why;
	const seen = new Set<string>();
	let wanted = [...new Set(assets)];
	// A few levels at most: a union made of unions made of unions.
	for (let depth = 0; wanted.length > 0 && depth < 8; depth++) {
		for (const id of wanted) seen.add(id);
		const ready = await ensure(wanted);
		const inner: string[] = [];
		for (const id of wanted) {
			if (!ready.has(id)) continue;
			const got = await bytesOf(id);
			if (!got || (got.assetTypeId !== undefined && got.assetTypeId !== SOLID_MODEL_TYPE)) continue;
			const roots = childDataOf(got.bytes);
			if (!roots) continue;
			show(id, roots);
			inner.push(...nestedUnionAssets(roots));
		}
		wanted = [...new Set(inner)].filter((id) => !seen.has(id));
	}
	return null;
}
