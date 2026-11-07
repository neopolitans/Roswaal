/**
 * The viewport's material textures: grey detail maps, most made from
 * ambientCG's (CC0) maps, one a material, in `MATERIAL_TEXTURES`' order.
 * Fetched only for the materials a place uses, and drawn tinted by the part's
 * Color. CrackedLava's is a PNG, its glow kept apart in green.
 */

import { MATERIAL_TEXTURES, MATERIALS } from "../../core/rbx/materials.js";
import { type PlaceScene, SCENE_KINDS, SCENE_STRIDE } from "../../core/rbx/scene.js";

/**
 * Each map's side, in pixels: the texture array's size. Half on a touch
 * screen, where a tablet's memory is shared with everything else it runs.
 */
export const TEXTURE_SIZE =
	typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 256 : 512;
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
	Asphalt: new URL("./textures/Asphalt.jpg", import.meta.url).href,
	Basalt: new URL("./textures/Basalt.jpg", import.meta.url).href,
	Cardboard: new URL("./textures/Cardboard.jpg", import.meta.url).href,
	Carpet: new URL("./textures/Carpet.jpg", import.meta.url).href,
	CeramicTiles: new URL("./textures/CeramicTiles.jpg", import.meta.url).href,
	ClayRoofTiles: new URL("./textures/ClayRoofTiles.jpg", import.meta.url).href,
	CorrodedMetal: new URL("./textures/CorrodedMetal.jpg", import.meta.url).href,
	CrackedLava: new URL("./textures/CrackedLava.png", import.meta.url).href,
	DiamondPlate: new URL("./textures/DiamondPlate.jpg", import.meta.url).href,
	Fabric: new URL("./textures/Fabric.jpg", import.meta.url).href,
	Foil: new URL("./textures/Foil.jpg", import.meta.url).href,
	Glacier: new URL("./textures/Glacier.jpg", import.meta.url).href,
	Glass: new URL("./textures/Glass.jpg", import.meta.url).href,
	Ice: new URL("./textures/Ice.jpg", import.meta.url).href,
	Leather: new URL("./textures/Leather.jpg", import.meta.url).href,
	Limestone: new URL("./textures/Limestone.jpg", import.meta.url).href,
	Metal: new URL("./textures/Metal.jpg", import.meta.url).href,
	Mud: new URL("./textures/Mud.jpg", import.meta.url).href,
	Pebble: new URL("./textures/Pebble.jpg", import.meta.url).href,
	Plaster: new URL("./textures/Plaster.jpg", import.meta.url).href,
	Plastic: new URL("./textures/Plastic.jpg", import.meta.url).href,
	Rock: new URL("./textures/Rock.jpg", import.meta.url).href,
	RoofShingles: new URL("./textures/RoofShingles.jpg", import.meta.url).href,
	Rubber: new URL("./textures/Rubber.jpg", import.meta.url).href,
	Salt: new URL("./textures/Salt.jpg", import.meta.url).href,
	Sand: new URL("./textures/Sand.jpg", import.meta.url).href,
	Sandstone: new URL("./textures/Sandstone.jpg", import.meta.url).href,
	Slate: new URL("./textures/Slate.jpg", import.meta.url).href,
	Snow: new URL("./textures/Snow.jpg", import.meta.url).href,
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
