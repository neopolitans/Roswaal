/**
 * The Place Viewer's routes: the scene it draws, and Sign in with Roblox,
 * which fetches the meshes and images a place names.
 *
 * They join the session's route table through `src/extensions/server.ts`, so
 * the daemon and the website serve them alike. Both hosts load this file, so
 * it imports the sign-in and the downloads as types only: those are the
 * daemon's, made in `../daemon.ts`, and need Node.
 */

import { toBase64 } from "../../../core/base64.js";
import type { PlaceOutline } from "../../../core/rbx/browse.js";
import type { RbxInstance } from "../../../core/rbx/index.js";
import { HttpError, UserError } from "../../../server/errors.js";
import { findPlaceFile } from "../../../server/project.js";
import { fields, query, type RouteRequest, text } from "../../../server/request.js";
import type { ExtensionContext } from "../../server.js";
import { readLighting } from "../core/lighting.js";
import { buildPlaceScene, type PlaceScene, SCENE_KINDS } from "../core/scene.js";
import { diffScene } from "../core/sceneDiff.js";
import { withUnions } from "../core/unions.js";
import type { AssetOutcome } from "./roblox/assets.js";
import type { RobloxAccount } from "./roblox/signin.js";

/** The downloads' side of Sign in with Roblox, as the routes use it. */
export interface RobloxAssets {
	fetchAll(root: string, ids: readonly string[]): Promise<Record<string, AssetOutcome>>;
	summary(root: string): Promise<{ count: number; bytes: number }>;
	clear(root: string): Promise<void>;
	read(root: string, id: string): Promise<{ assetTypeId?: number; bytes: Uint8Array } | null>;
}

/**
 * What a host gives the Place Viewer. The daemon passes both; the website
 * passes neither, and the Roblox routes answer 501 or `available: false`.
 */
export interface PlaceViewerCapabilities {
	/**
	 * Sign in with Roblox. The sign-in and its tokens stay on this computer
	 * (`roblox/signin.ts`).
	 */
	roblox?: RobloxAccount;
	/** What Sign in with Roblox downloads, kept in the project: `roblox/assets.ts`. */
	robloxAssets?: RobloxAssets;
}

type RouteHandler = (req: RouteRequest) => Promise<unknown>;

/** The Place Viewer's routes for one session. */
export function placeViewerRoutes(
	ctx: ExtensionContext,
	capabilities: PlaceViewerCapabilities = {},
): Record<string, RouteHandler> {
	/** Scenes built lately, by project and stamp, for `GET /place/scene`'s `since`. */
	const scenes = new Map<string, { scene: PlaceScene; outline: PlaceOutline }>();
	/** Each parsed place's scene, built the first time it is asked for. */
	const built = new WeakMap<object, PlaceScene>();

	function ability<K extends keyof PlaceViewerCapabilities>(
		name: K,
	): NonNullable<PlaceViewerCapabilities[K]> {
		const able = capabilities[name];
		if (!able) {
			throw new HttpError(
				501,
				`This copy of Roswaal cannot do that: no ${name} is available here.`,
			);
		}
		return able as NonNullable<PlaceViewerCapabilities[K]>;
	}

	return {
		/**
		 * The place's Workspace for the viewport: one instance buffer per
		 * shape, as base64, built once per version of the place, with its
		 * lighting and Studio's saved camera. A 409 when the place has
		 * changed since `stamp`, as for an instance.
		 *
		 * `since` names the version the viewer has. When this session built
		 * that one's scene lately and the outline is the same, the answer
		 * is a `patch`: the rows of the instances that changed, in `kinds`
		 * and `translucent`, every id whose rows go in `changed`, and the
		 * scene's other parts only where they differ. See `sceneDiff.ts`.
		 */
		"GET /place/scene": async (req) => {
			const project = ctx.project();
			const file = await findPlaceFile(project.root, project.config);
			if (!file) throw new HttpError(404, "The project has no place file.");
			const loaded = await ctx.loadPlace(project, file);
			if (query(req, "stamp") !== loaded.stamp)
				throw new HttpError(409, "The place file has changed. Reload it.");
			const workspace = loaded.doc.roots.find((r) => r.className === "Workspace");
			const idOf = (inst: RbxInstance) => loaded.index.get(inst);
			let scene = built.get(loaded);
			if (!scene) {
				scene = withUnions(buildPlaceScene(workspace, idOf), workspace, idOf);
				built.set(loaded, scene);
			}
			const key = (stamp: string) => `${project.root}\0${stamp}`;
			const since = scenes.get(key(text(req.query?.since) ?? ""));
			scenes.delete(key(loaded.stamp));
			scenes.set(key(loaded.stamp), { scene, outline: loaded.outline });
			// The last few, for the viewer to ask what changed since.
			for (const old of scenes.keys()) {
				if (scenes.size <= 4) break;
				scenes.delete(old);
			}
			const encode = (from: PlaceScene["kinds"]) => {
				const out: Record<string, { data: string; count: number }> = {};
				for (const k of SCENE_KINDS) {
					const { data, count } = from[k];
					out[k] = {
						data: toBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
						count,
					};
				}
				return out;
			};
			if (since && sameOutline(since.outline, loaded.outline)) {
				const patch = diffScene(since.scene, scene);
				return {
					patch: true,
					changed: patch.changed,
					fields: patch.fields,
					kinds: encode(patch.kinds),
					translucent: encode(patch.translucent),
					lighting: readLighting(loaded.doc),
				};
			}
			return {
				...scene,
				kinds: encode(scene.kinds),
				translucent: encode(scene.translucent),
				lighting: readLighting(loaded.doc),
			};
		},

		/** Whether anyone is signed in with Roblox, and who: never a token. */
		"GET /roblox": async () => {
			const account = capabilities.roblox;
			return account ? { available: true, ...(await account.status()) } : { available: false };
		},

		/** Starts a sign-in; the editor opens the address it is given. */
		"POST /roblox/signin": async () => ability("roblox").signIn(),

		/** Revokes the sign-in and deletes it and everything it downloaded. */
		"POST /roblox/signout": async () => {
			await ability("roblox").signOut();
			return { ok: true };
		},

		/** How many assets the open project holds from Sign in with Roblox. Reads only. */
		"GET /roblox/assets": async () => {
			const assets = capabilities.robloxAssets;
			const current = ctx.current();
			if (!assets || !current) return { available: Boolean(assets), count: 0, bytes: 0 };
			return { available: true, ...(await assets.summary(current.root)) };
		},

		/**
		 * Makes sure the open project has these assets, downloading what it
		 * lacks through the sign-in. Roblox's own are skipped. Answered per id.
		 */
		"POST /roblox/assets": async (req) => {
			const { ids } = fields<{ ids: unknown }>(req);
			if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
				throw new UserError("Pass `ids`, a list of asset ids as strings.");
			}
			const status = await ability("roblox").status();
			if (!status.signedIn) throw new HttpError(409, "Sign in with Roblox first.");
			return {
				assets: await ability("robloxAssets").fetchAll(ctx.project().root, ids as string[]),
			};
		},

		/**
		 * One downloaded asset's bytes, for the place viewer to draw: base64,
		 * as every answer is JSON. Reads only, and asks Roblox nothing; an
		 * asset not downloaded yet is `found: false`.
		 */
		"GET /roblox/asset": async (req) => {
			const assets = capabilities.robloxAssets;
			const current = ctx.current();
			if (!assets || !current) return { available: Boolean(assets), found: false };
			const held = await assets.read(current.root, query(req, "id") ?? "");
			if (!held) return { available: true, found: false };
			return {
				available: true,
				found: true,
				...(held.assetTypeId !== undefined ? { assetTypeId: held.assetTypeId } : {}),
				data: toBase64(held.bytes),
			};
		},

		/** Deletes the open project's downloaded assets. */
		"POST /roblox/assets/clear": async () => {
			await ability("robloxAssets").clear(ctx.project().root);
			return { ok: true };
		},
	};
}

/** Whether two outlines list the same instances in the same order, so an index names the same one in each. */
function sameOutline(a: PlaceOutline, b: PlaceOutline): boolean {
	if (a === b) return true;
	if (a.nodes.length !== b.nodes.length || a.classes.length !== b.classes.length) return false;
	if (a.classes.some((c, i) => c !== b.classes[i])) return false;
	return a.nodes.every((n, i) => {
		const m = b.nodes[i];
		return n.length === m.length && n.every((v, j) => v === m[j]);
	});
}
