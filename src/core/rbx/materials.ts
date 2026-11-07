/**
 * How the viewport draws each Enum.Material: our own numbers, chosen by eye
 * for what each material is, our own patterns drawn by the shaders in studs on
 * the part, and for some materials a texture from ambientCG (CC0) -- nothing
 * of Roblox's. A material's look is a highlight (how strong, how tight),
 * whether it is a metal, a grain of variation in its colour, and its pattern
 * or texture; Neon, Glass and ForceField are drawn their own ways.
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
	row("Metal", 1088, 0.35, 24, true, 0.03, 1),
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

/**
 * The materials drawn from a texture rather than a pattern, in the order the
 * renderers' texture array holds them. Each is a grey detail map: brightness
 * only, averaging middle grey, so the part's Color gives the hue and the
 * texture its light and dark. Most are made from ambientCG's maps -- the
 * colour map's brightness, and for the later ones its occlusion and the
 * crevices of its displacement too -- and a few from Roswaal's own.
 * `studs` is how far one copy of it spans; `strength` how much it shows.
 */
export interface MaterialTexture {
	material: string;
	/** What it was made from: ambientCG assets by id, Roswaal's own maps by name. */
	source: string;
	studs: number;
	strength: number;
	/** Its green channel is light of its own, CrackedLava's cracks, which the shaders draw lava-yellow. */
	glows?: boolean;
}

export const MATERIAL_TEXTURES: readonly MaterialTexture[] = [
	{ material: "Brick", source: "Bricks105", studs: 8, strength: 1 },
	{ material: "Cobblestone", source: "PavingStones138", studs: 8, strength: 1 },
	{ material: "Pavement", source: "PavingStones152", studs: 10, strength: 1 },
	{ material: "WoodPlanks", source: "WoodFloor064", studs: 8, strength: 1 },
	{ material: "Wood", source: "Wood095", studs: 6, strength: 1 },
	{ material: "Concrete", source: "Concrete049", studs: 8, strength: 0.9 },
	{ material: "Grass", source: "Grass005", studs: 6, strength: 0.9 },
	{ material: "LeafyGrass", source: "Grass001", studs: 6, strength: 1 },
	{ material: "Ground", source: "Ground037", studs: 8, strength: 0.9 },
	{ material: "Marble", source: "Marble012", studs: 10, strength: 0.8 },
	{ material: "Granite", source: "Granite005A", studs: 6, strength: 0.7 },
	{ material: "Asphalt", source: "Asphalt031", studs: 8, strength: 0.8 },
	{ material: "Basalt", source: "Rock031", studs: 8, strength: 0.6 },
	{ material: "Cardboard", source: "Cardboard002", studs: 4, strength: 0.7 },
	{ material: "Carpet", source: "Carpet012", studs: 4, strength: 0.5 },
	{ material: "CeramicTiles", source: "Tiles141", studs: 8, strength: 1 },
	{ material: "ClayRoofTiles", source: "RoofingTiles012A", studs: 6, strength: 1 },
	{ material: "CorrodedMetal", source: "Metal022", studs: 6, strength: 0.7 },
	{
		material: "CrackedLava",
		source: "Rock050 and Roswaal Lava 1",
		studs: 10,
		strength: 1,
		glows: true,
	},
	{ material: "DiamondPlate", source: "DiamondPlate008B", studs: 4, strength: 0.9 },
	{ material: "Fabric", source: "Fabric086", studs: 4, strength: 0.7 },
	{ material: "Foil", source: "Foil001", studs: 4, strength: 0.8 },
	{ material: "Glacier", source: "Snow006", studs: 10, strength: 0.8 },
	{ material: "Glass", source: "Plastic010", studs: 6, strength: 0.5 },
	{ material: "Ice", source: "Roswaal Ice 2 and Granite003A", studs: 10, strength: 0.8 },
	{ material: "Leather", source: "Leather037", studs: 4, strength: 0.7 },
	{ material: "Limestone", source: "Rock018", studs: 8, strength: 0.8 },
	{ material: "Metal", source: "Metal055A", studs: 6, strength: 0.7 },
	{ material: "Mud", source: "Ground106", studs: 8, strength: 0.8 },
	{ material: "Pebble", source: "PavingStones141", studs: 6, strength: 0.9 },
	{ material: "Plaster", source: "Plaster001", studs: 8, strength: 0.7 },
	{ material: "Plastic", source: "Plastic013A", studs: 4, strength: 0.5 },
	{ material: "Rock", source: "Rock048", studs: 8, strength: 0.8 },
	{ material: "RoofShingles", source: "RoofingTiles003", studs: 6, strength: 1 },
	{ material: "Rubber", source: "Rubber004", studs: 4, strength: 0.6 },
	{ material: "Salt", source: "Snow010A and Roswaal Salt 2", studs: 10, strength: 0.9 },
	{ material: "Sand", source: "Ground093C", studs: 8, strength: 0.8 },
	{ material: "Sandstone", source: "Rock061", studs: 8, strength: 0.9 },
	{ material: "Slate", source: "Rock058", studs: 8, strength: 0.9 },
	{ material: "Snow", source: "Snow010A", studs: 8, strength: 0.7 },
];

const BY_VALUE = new Map(MATERIALS.map((m, i) => [m.value, i]));
const TEXTURE_OF = new Map(MATERIAL_TEXTURES.map((t, layer) => [t.material, { ...t, layer }]));

/** Floats a material takes in the shaders' table: three vec4s. */
export const MATERIAL_ROW = 12;

/** A material's row, by Enum.Material's value: Plastic's for one this table does not know. */
export function materialIndex(value: unknown): number {
	return typeof value === "number" ? (BY_VALUE.get(value) ?? 0) : 0;
}

/**
 * The table as the shaders read it: three vec4s a row --
 * (spec, gloss, metal, grain), (grain size, shade, pattern, texture) and
 * (the texture's studs, its strength, whether it glows, 0). `texture` is its layer + 1 once
 * that layer has loaded, and 0 until then, when the pattern is drawn instead.
 */
export function materialBlock(loaded: ReadonlySet<number> = new Set()): Float32Array {
	const out = new Float32Array(MATERIALS.length * MATERIAL_ROW);
	MATERIALS.forEach((m, i) => {
		const t = TEXTURE_OF.get(m.name);
		const layer = t && loaded.has(t.layer) ? t.layer + 1 : 0;
		out.set(
			[
				m.spec,
				m.gloss,
				m.metal ? 1 : 0,
				m.grain,
				m.grainSize,
				m.shade,
				MATERIAL_PATTERN[m.pattern],
				layer,
				t?.studs ?? 1,
				t?.strength ?? 0,
				t?.glows ? 1 : 0,
				0,
			],
			i * MATERIAL_ROW,
		);
	});
	return out;
}
