/**
 * The viewport's material textures: grey detail maps made from ambientCG's
 * (CC0) colour maps, one a material, in `MATERIAL_TEXTURES`' order. Fetched
 * only for the materials a place uses, and drawn tinted by the part's Color.
 */

import { MATERIAL_TEXTURES, MATERIALS } from "../../core/rbx/materials.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";

/** Each map's side, in pixels: the texture array's size. */
export const TEXTURE_SIZE = 512;
/** Its mip levels, down to one pixel. */
export const TEXTURE_LEVELS = Math.log2(TEXTURE_SIZE) + 1;

/** Each detail map as the bundler serves it, by material. */
const URLS: Record<string, string> = {
	Brick: new URL("./textures/Brick.jpg", import.meta.url).href,
	Cobblestone: new URL("./textures/Cobblestone.jpg", import.meta.url).href,
	Pavement: new URL("./textures/Pavement.jpg", import.meta.url).href,
	WoodPlanks: new URL("./textures/WoodPlanks.jpg", import.meta.url).href,
	Wood: new URL("./textures/Wood.jpg", import.meta.url).href,
	Concrete: new URL("./textures/Concrete.jpg", import.meta.url).href,
	Grass: new URL("./textures/Grass.jpg", import.meta.url).href,
	LeafyGrass: new URL("./textures/LeafyGrass.jpg", import.meta.url).href,
	Ground: new URL("./textures/Ground.jpg", import.meta.url).href,
	Marble: new URL("./textures/Marble.jpg", import.meta.url).href,
	Granite: new URL("./textures/Granite.jpg", import.meta.url).href,
};

/** The texture layers the place's parts use, so only those are fetched. */
export function layersUsed(scene: PlaceScene): number[] {
	const rows = new Set<number>();
	for (const set of [scene.kinds, scene.translucent])
		for (const k of SCENE_KINDS) {
			const { data, count } = set[k];
			const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
			for (let i = 0; i < count; i++) rows.add(words[i * SCENE_STRIDE + 14] & 255);
		}
	const names = new Set([...rows].map((r) => MATERIALS[r]?.name));
	return MATERIAL_TEXTURES.flatMap((t, layer) => (names.has(t.material) ? [layer] : []));
}

/** A layer's map and its mip chain, each level a canvas half the last, to one pixel. */
export async function loadLayer(layer: number): Promise<HTMLCanvasElement[]> {
	const url = URLS[MATERIAL_TEXTURES[layer].material];
	const blob = await (await fetch(url)).blob();
	const image = await createImageBitmap(blob);
	const levels: HTMLCanvasElement[] = [];
	let from: CanvasImageSource = image;
	for (let size = TEXTURE_SIZE; size >= 1; size /= 2) {
		const c = document.createElement("canvas");
		c.width = c.height = size;
		const g = c.getContext("2d") as CanvasRenderingContext2D;
		g.imageSmoothingQuality = "high";
		g.drawImage(from, 0, 0, size, size);
		levels.push(c);
		from = c;
	}
	image.close();
	return levels;
}
