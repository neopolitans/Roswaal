/**
 * The Place Editor's side of the API: the scene it draws, from
 * `GET /place/scene` (`../server/routes.ts`).
 */

import { apiRequest } from "../../../app/api.js";
import { fromBase64 } from "../../../core/base64.js";
import type { LightingParams } from "../core/lighting.js";
import { type PlaceScene, SCENE_KINDS } from "../core/scene.js";
import { applyScenePatch, type ScenePatch } from "../core/sceneDiff.js";

/** The place's scene as the viewer was last sent it, which `placeScene` can be sent the changes to. */
export interface SceneSince {
	stamp: string;
	scene: PlaceScene & { lighting: LightingParams };
}

/**
 * The place's Workspace as the viewport draws it. Given the scene the viewer
 * has, only what changed since is sent, and put into a copy of it.
 */
export async function placeScene(
	stamp: string,
	since?: SceneSince,
): Promise<PlaceScene & { lighting: LightingParams }> {
	type Wire = Record<string, { data: string; count: number }>;
	const wire = await apiRequest<
		Omit<PlaceScene, "kinds" | "translucent"> & {
			kinds: Wire;
			translucent?: Wire;
			lighting: LightingParams;
			patch?: true;
			changed?: number[];
			fields?: ScenePatch["fields"];
		}
	>(
		`/api/place/scene?stamp=${encodeURIComponent(stamp)}${
			since ? `&since=${encodeURIComponent(since.stamp)}` : ""
		}`,
	);
	const decode = (from: Wire | undefined) => {
		const out = {} as PlaceScene["kinds"];
		for (const k of SCENE_KINDS) {
			const { data, count } = from?.[k] ?? { data: "", count: 0 };
			out[k] = { data: new Float32Array(fromBase64(data).buffer), count };
		}
		return out;
	};
	if (wire.patch && since) {
		const patch: ScenePatch = {
			changed: wire.changed ?? [],
			fields: wire.fields ?? {},
			kinds: decode(wire.kinds),
			translucent: decode(wire.translucent),
		};
		return { ...applyScenePatch(since.scene, patch), lighting: wire.lighting };
	}
	return { ...wire, kinds: decode(wire.kinds), translucent: decode(wire.translucent) };
}
