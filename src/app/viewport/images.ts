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

import { fromBase64 } from "../../core/base64.js";
import { assetIdOf } from "../../core/rbx/browse.js";
import { api } from "../api.js";

/** Roblox's asset types for what a Decal or Texture can name. */
const IMAGE_TYPE = 1;
const DECAL_TYPE = 13;
/** As many as the daemon takes in one request. */
const BATCH = 64;

/** The image a Decal asset's model names, from its bytes as text. */
export function decalImageOf(bytes: Uint8Array): string | undefined {
	const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	// An XML model's <url>, or a binary model's string; either way one of the two link forms.
	const found = /(rbxassetid:\/\/\d+|https?:\/\/(?:www\.)?roblox\.com\/asset\/?\?id=\d+)/i.exec(
		text,
	);
	return found ? assetIdOf(found[1]) : undefined;
}

/** Downloads `ids` through the daemon, in batches; answers with those that are here. */
async function ensure(ids: string[]): Promise<Set<string>> {
	const ready = new Set<string>();
	for (let at = 0; at < ids.length; at += BATCH) {
		const { assets } = await api.robloxFetchAssets(ids.slice(at, at + BATCH));
		for (const [id, outcome] of Object.entries(assets))
			if (outcome.state === "ready") ready.add(id);
	}
	return ready;
}

/** One downloaded asset's bytes and type, or null. */
async function bytesOf(id: string): Promise<{ assetTypeId?: number; bytes: Uint8Array } | null> {
	const answer = await api.robloxAsset(id);
	if (!answer.found || !answer.data) return null;
	return { assetTypeId: answer.assetTypeId, bytes: fromBase64(answer.data) };
}

/**
 * Each of `assets` as a decoded image, handed to `show` as it arrives. A
 * Decal asset is followed to its image. Nothing happens unless someone is
 * signed in with Roblox.
 */
export async function loadImages(
	assets: readonly string[],
	show: (asset: string, image: ImageBitmap) => void,
): Promise<void> {
	if (assets.length === 0) return;
	const status = await api.robloxStatus().catch(() => null);
	if (!status?.signedIn) return;
	const unique = [...new Set(assets)];
	const ready = await ensure(unique);

	// What each asked-for id draws: itself, or the image its Decal asset names.
	const imageFor = new Map<string, string>();
	const decals: string[] = [];
	const held = new Map<string, Uint8Array>();
	for (const id of unique) {
		if (!ready.has(id)) continue;
		const got = await bytesOf(id);
		if (!got) continue;
		if (got.assetTypeId === DECAL_TYPE) {
			const image = decalImageOf(got.bytes);
			if (image) {
				imageFor.set(id, image);
				decals.push(image);
			}
		} else if (got.assetTypeId === undefined || got.assetTypeId === IMAGE_TYPE) {
			imageFor.set(id, id);
			held.set(id, got.bytes);
		}
	}
	const inner = [...new Set(decals)].filter((id) => !held.has(id));
	if (inner.length > 0) {
		const innerReady = await ensure(inner);
		for (const id of inner) {
			if (!innerReady.has(id)) continue;
			const got = await bytesOf(id);
			if (got) held.set(id, got.bytes);
		}
	}

	for (const [asked, image] of imageFor) {
		const bytes = held.get(image);
		if (!bytes) continue;
		try {
			const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
			show(asked, bitmap);
		} catch {
			// Not an image a browser can read: that face keeps its box colour.
		}
	}
}
