/**
 * The images a place's Decals and Textures show, from what Sign in with Roblox
 * has downloaded: asked of the daemon, which fetches what the project lacks,
 * then read back and decoded for the GPU.
 *
 * A Decal *asset* (type 13) is not an image: it is a small model whose Decal
 * names the image it shows. Its own `Texture` is followed to that image, which
 * is downloaded in turn. An image asset (type 1) is the picture itself.
 *
 * Nothing is asked of anyone who is not signed in; their places keep the box
 * faces they have always had.
 */

import { api } from "../../../../app/api.js";
import { fromBase64 } from "../../../../core/base64.js";
import { assetIdOf } from "../../../../core/rbx/browse.js";
import type { NotAsked } from "./assetProgress.js";

/** Roblox's asset types for what a Decal or Texture can name. */
const IMAGE_TYPE = 1;
const DECAL_TYPE = 13;
/** As many as the daemon takes in one request. */
const BATCH = 64;

/** The image a Decal asset's model names, from its bytes as text. */
export function decalImageOf(bytes: Uint8Array): string | undefined {
	const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	// An XML model's <url>, or a binary model's string; either way one of the two link forms.
	const found = /(rbxassetid:\/\/\d+|https?:\/\/(?:www\.)?roblox\.com\/\/?asset\/?\?id=\d+)/i.exec(
		text,
	);
	return found ? assetIdOf(found[1]) : undefined;
}

/** Downloads `ids` through the daemon, in batches; answers with those that are here. */
export async function ensure(ids: string[]): Promise<Set<string>> {
	const ready = new Set<string>();
	for (let at = 0; at < ids.length; at += BATCH) {
		const { assets } = await api.robloxFetchAssets(ids.slice(at, at + BATCH));
		for (const [id, outcome] of Object.entries(assets))
			if (outcome.state === "ready") ready.add(id);
	}
	return ready;
}

/** Why nothing can be asked of the daemon now; null while someone is signed in. */
export async function notAsked(): Promise<NotAsked | null> {
	const status = await api.robloxStatus().catch(() => null);
	if (!status) return "offline";
	if (!status.available) return "unavailable";
	return status.signedIn ? null : "sign-in";
}

/** One downloaded asset's bytes and type, or null. */
export async function bytesOf(
	id: string,
): Promise<{ assetTypeId?: number; bytes: Uint8Array } | null> {
	const answer = await api.robloxAsset(id);
	if (!answer.found || !answer.data) return null;
	return { assetTypeId: answer.assetTypeId, bytes: fromBase64(answer.data) };
}

/**
 * Each of `assets` as a decoded image, handed to `show` as it arrives. A
 * Decal asset is followed to its image. Nothing happens unless someone is
 * signed in with Roblox; the answer is why not, or null.
 */
export async function loadImages(
	assets: readonly string[],
	show: (asset: string, image: ImageBitmap) => void,
): Promise<NotAsked | null> {
	if (assets.length === 0) return null;
	const why = await notAsked();
	if (why) return why;
	const unique = [...new Set(assets)];
	const ready = await ensure(unique);

	const draw = async (asked: string, bytes: Uint8Array) => {
		try {
			// Its colours as they are, not multiplied by its alpha: both renderers
			// take them so, and undoing the multiply later is lossy at faint edges
			// and, in WebGL2, a copy on the page's own thread.
			const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
				premultiplyAlpha: "none",
			});
			show(asked, bitmap);
		} catch {
			// Not an image a browser can read: that face keeps its box colour.
		}
	};

	// An image is drawn as it arrives; a Decal asset once the image it names has.
	const decals = new Map<string, string[]>();
	const held = new Map<string, Uint8Array>();
	for (const id of unique) {
		if (!ready.has(id)) continue;
		const got = await bytesOf(id);
		if (!got) continue;
		if (got.assetTypeId === DECAL_TYPE) {
			const image = decalImageOf(got.bytes);
			if (image) decals.set(image, [...(decals.get(image) ?? []), id]);
		} else if (got.assetTypeId === undefined || got.assetTypeId === IMAGE_TYPE) {
			held.set(id, got.bytes);
			await draw(id, got.bytes);
		}
	}
	const inner = [...decals.keys()].filter((id) => !held.has(id));
	if (inner.length > 0) {
		const innerReady = await ensure(inner);
		for (const id of inner) {
			if (!innerReady.has(id)) continue;
			const got = await bytesOf(id);
			if (got) held.set(id, got.bytes);
		}
	}
	for (const [image, asked] of decals) {
		const bytes = held.get(image);
		if (bytes) for (const id of asked) await draw(id, bytes);
	}
	return null;
}
