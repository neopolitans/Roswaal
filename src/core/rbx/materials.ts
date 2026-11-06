/**
 * How the viewport draws each Enum.Material: our own numbers, chosen by eye
 * for what each material is, and our own patterns, drawn by the shaders in
 * studs on the part -- no textures, and nothing of Roblox's. A material's look
 * is a highlight (how strong, how tight), whether it is a metal, a grain of
 * variation in its colour, and its pattern; Neon, Glass and ForceField are
 * drawn their own ways.
 *
 * The values are Enum.Material's, from creator-docs. The host packs a part's
 * row here into its instance; the renderers read the rows as a uniform table.
 */

/** How a material is drawn, besides its numbers. */
export const MATERIAL_SHADE = { lit: 0, neon: 1, glass: 2, forceField: 3 } as const;
type Shade = (typeof MATERIAL_SHADE)[keyof typeof MATERIAL_SHADE];

/**
 * The pattern on a material's surface, as the shaders number them: wood's
 * grain, planks, brick, cobbles and pebbles, diamond plate, tiles, shingles,
 * a weave, speckle, stone, grass, blotches, CrackedLava's glowing cracks, and
 * marble's veins.
 */
export const MATERIAL_PATTERN = {
	none: 0,
	wood: 1,
	planks: 2,
	brick: 3,
	cobble: 4,
	pebble: 5,
	diamond: 6,
	tiles: 7,
	shingles: 8,
	weave: 9,
	speckle: 10,
	stone: 11,
	grass: 12,
	blotch: 13,
	lava: 14,
	marble: 15,
} as const;
type Pattern = keyof typeof MATERIAL_PATTERN;

export interface MaterialLook {
	name: string;
	/** Enum.Material's value. */
	value: number;
	/** How strong the sun's highlight is, 0 to 1. */
	spec: number;
	/** How tight it is: higher is glossier. */
	gloss: number;
	/** A metal's highlight takes its colour, and it lights less of its own. */
	metal: boolean;
	/** How much the colour varies across the surface, and the size of that variation in studs. */
	grain: number;
	grainSize: number;
	shade: Shade;
	pattern: Pattern;
}

const { lit, neon, glass, forceField } = MATERIAL_SHADE;
const row = (
	name: string,
	value: number,
	spec: number,
	gloss: number,
	metal: boolean,
	grain: number,
	grainSize: number,
	pattern: Pattern = "none",
	shade: Shade = lit,
): MaterialLook => ({ name, value, spec, gloss, metal, grain, grainSize, shade, pattern });

/** Plastic first: what an unknown material is drawn as. */
export const MATERIALS: readonly MaterialLook[] = [
	row("Plastic", 256, 0.1, 30, false, 0, 1),
	row("SmoothPlastic", 272, 0.12, 40, false, 0, 1),
	row("Neon", 288, 0, 1, false, 0, 1, "none", neon),
	row("Wood", 512, 0.05, 12, false, 0.08, 0.6, "wood"),
	row("WoodPlanks", 528, 0.05, 12, false, 0.09, 0.5, "planks"),
	row("Marble", 784, 0.25, 60, false, 0.06, 1.5, "marble"),
	row("Basalt", 788, 0.05, 10, false, 0.08, 0.8, "stone"),
	row("Slate", 800, 0.08, 14, false, 0.08, 1, "stone"),
	row("CrackedLava", 804, 0.05, 8, false, 0.12, 1, "lava"),
	row("Concrete", 816, 0.04, 8, false, 0.06, 0.5, "speckle"),
	row("Limestone", 820, 0.05, 10, false, 0.06, 1, "stone"),
	row("Granite", 832, 0.08, 20, false, 0.1, 0.4, "stone"),
	row("Pavement", 836, 0.05, 10, false, 0.07, 0.6, "tiles"),
	row("Brick", 848, 0.04, 8, false, 0.1, 0.8, "brick"),
	row("Pebble", 864, 0.06, 12, false, 0.12, 0.3, "pebble"),
	row("Cobblestone", 880, 0.06, 12, false, 0.12, 0.8, "cobble"),
	row("Rock", 896, 0.05, 10, false, 0.1, 1, "stone"),
	row("Sandstone", 912, 0.04, 8, false, 0.07, 0.8, "stone"),
	row("CorrodedMetal", 1040, 0.25, 20, true, 0.12, 0.5, "blotch"),
	row("DiamondPlate", 1056, 0.6, 60, true, 0.04, 0.3, "diamond"),
	row("Foil", 1072, 0.8, 40, true, 0.05, 0.2, "speckle"),
	row("Metal", 1088, 0.6, 50, true, 0.03, 1),
	row("Grass", 1280, 0.03, 6, false, 0.1, 0.5, "grass"),
	row("LeafyGrass", 1284, 0.03, 6, false, 0.12, 0.5, "grass"),
	row("Sand", 1296, 0.03, 6, false, 0.08, 0.3, "speckle"),
	row("Fabric", 1312, 0.02, 4, false, 0.05, 0.2, "weave"),
	row("Snow", 1328, 0.15, 10, false, 0.04, 0.8, "speckle"),
	row("Mud", 1344, 0.08, 12, false, 0.08, 0.6, "blotch"),
	row("Ground", 1360, 0.03, 6, false, 0.08, 0.7, "speckle"),
	row("Asphalt", 1376, 0.04, 8, false, 0.07, 0.3, "speckle"),
	row("Salt", 1392, 0.1, 10, false, 0.06, 0.4, "speckle"),
	row("Ice", 1536, 0.5, 80, false, 0.03, 1),
	row("Glacier", 1552, 0.45, 70, false, 0.04, 1),
	row("Glass", 1568, 0.9, 120, false, 0, 1, "none", glass),
	row("ForceField", 1584, 0, 1, false, 0, 1, "none", forceField),
	row("Air", 1792, 0.1, 30, false, 0, 1),
	row("Water", 2048, 0.6, 90, false, 0, 1),
	row("Cardboard", 2304, 0.03, 6, false, 0.06, 0.4, "speckle"),
	row("Carpet", 2305, 0.02, 4, false, 0.06, 0.15, "weave"),
	row("CeramicTiles", 2306, 0.3, 60, false, 0.03, 1, "tiles"),
	row("ClayRoofTiles", 2307, 0.08, 14, false, 0.06, 0.8, "shingles"),
	row("RoofShingles", 2308, 0.05, 10, false, 0.08, 0.5, "shingles"),
	row("Leather", 2309, 0.15, 20, false, 0.04, 0.3, "blotch"),
	row("Plaster", 2310, 0.04, 8, false, 0.04, 0.6, "speckle"),
	row("Rubber", 2311, 0.08, 10, false, 0.02, 1, "speckle"),
];

const BY_VALUE = new Map(MATERIALS.map((m, i) => [m.value, i]));

/** A material's row, by Enum.Material's value: Plastic's for one this table does not know. */
export function materialIndex(value: unknown): number {
	return typeof value === "number" ? (BY_VALUE.get(value) ?? 0) : 0;
}

/**
 * The table as the shaders read it: two vec4s a row --
 * (spec, gloss, metal, grain) and (grain size, shade, pattern, 0).
 */
export function materialBlock(): Float32Array {
	const out = new Float32Array(MATERIALS.length * 8);
	MATERIALS.forEach((m, i) => {
		out.set(
			[
				m.spec,
				m.gloss,
				m.metal ? 1 : 0,
				m.grain,
				m.grainSize,
				m.shade,
				MATERIAL_PATTERN[m.pattern],
				0,
			],
			i * 8,
		);
	});
	return out;
}
