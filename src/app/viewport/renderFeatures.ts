/**
 * The Rendering panel's switches: each part of the picture on its own, the
 * ten steps a frame is built in, and the presets. Off leaves a part out of
 * the view only; the place is untouched.
 *
 * A switch takes effect in one of three ways: in the lighting the view is
 * given (`litFor`: the sun, the sky's light, Ambient, shadows' softness, the
 * air and the post effects), as a bit the shaders read (`featureBits`), or as
 * a pass the renderer draws or leaves out (images, see-through parts, the sky,
 * glow, beams and particles).
 */

import type { LightingParams } from "../../core/rbx/lighting.js";

export interface RenderFeatures {
	matTextures: boolean;
	matGrain: boolean;
	smoothMeshes: boolean;
	neonFaces: boolean;
	images: boolean;
	seeThrough: boolean;
	sun: boolean;
	skyFill: boolean;
	ambient: boolean;
	highlights: boolean;
	skyReflections: boolean;
	sunShadows: boolean;
	farShadows: boolean;
	softEdges: boolean;
	skyShadows: boolean;
	nearSkyMaps: boolean;
	thinParts: boolean;
	pointLights: boolean;
	spotLights: boolean;
	surfaceLights: boolean;
	lightHighlights: boolean;
	neonGlow: boolean;
	lavaGlow: boolean;
	beams: boolean;
	particles: boolean;
	sky: boolean;
	skyImages: boolean;
	sunImage: boolean;
	atmosphere: boolean;
	fog: boolean;
	bloom: boolean;
	colourCorrection: boolean;
	blur: boolean;
	frustumCulling: boolean;
	occlusionCulling: boolean;
}

export type FeatureKey = keyof RenderFeatures;

/** A switch: its label, the step it belongs to (0: none), what it does, and the switch it sits under. */
export interface FeatureInfo {
	key: FeatureKey;
	label: string;
	step: number;
	hint: string;
	parent?: FeatureKey;
}

/** The ten steps a frame is built in, in order: each turns on its own switches. */
export const RENDER_STEPS: readonly (readonly [string, string])[] = [
	["Surfaces", "No light: the parts in their colours and materials."],
	["Sun and sky light", "The sun, the sky's light and Ambient, without shadows."],
	["Shadows", "The sun's shadows, and the sky kept out of rooms."],
	["Lights", "PointLights, SpotLights and SurfaceLights."],
	["Decals and Textures", "Images on faces."],
	["See-through parts", "Glass and parts with a Transparency."],
	["Glow", "Neon's halo and CrackedLava's cracks."],
	["Beams and particles", "Beams and ParticleEmitters."],
	["Haze and fog", "Atmosphere and fog."],
	["Post effects", "Bloom, colour correction and blur."],
];

const f = (
	key: FeatureKey,
	label: string,
	step: number,
	hint: string,
	parent?: FeatureKey,
): FeatureInfo => ({ key, label, step, hint, parent });

/** The panel's groups of switches, in the order it shows them. */
export const FEATURE_GROUPS: readonly { title: string; features: readonly FeatureInfo[] }[] = [
	{
		title: "Surfaces",
		features: [
			f(
				"matTextures",
				"Material textures",
				1,
				"Each material's texture, tinted by its part's Color.",
			),
			f("matGrain", "Material grain", 1, "The fine noise and patterns in grainy materials."),
			f(
				"smoothMeshes",
				"Smooth shading",
				1,
				"MeshParts, balls and cylinders shaded smooth, as Studio does. Off, each triangle is flat.",
			),
			f("neonFaces", "Neon", 1, "Neon lit by itself. Off, it is shaded as Plastic."),
			f("images", "Decals and Textures", 5, "Images on faces."),
			f("seeThrough", "See-through parts", 6, "Glass and parts with a Transparency."),
		],
	},
	{
		title: "Light",
		features: [
			f("sun", "Sunlight", 2, "Direct light from the sun."),
			f("skyFill", "Sky's light", 2, "OutdoorAmbient and the light of the sky."),
			f("ambient", "Ambient", 2, "Lighting.Ambient, indoors and out."),
			f("highlights", "Sun highlights", 2, "The sun's highlight on shiny materials."),
			f("skyReflections", "Sky reflections", 2, "The sky seen in Metal, Glass and Reflectance."),
		],
	},
	{
		title: "Shadows",
		features: [
			f("sunShadows", "Sun shadows", 3, "Sharp shadows near the camera, in three cascades."),
			f(
				"farShadows",
				"Far shadows",
				3,
				"Shadows past 1,024 studs, from one map of the place.",
				"sunShadows",
			),
			f("softEdges", "Soft edges", 3, "Edges softened by ShadowSoftness.", "sunShadows"),
			f("skyShadows", "Sky shadows", 3, "Closed rooms keep the sky's light out."),
			f(
				"nearSkyMaps",
				"Near sky maps",
				3,
				"Sharper sky shadows within 384 studs of the camera.",
				"skyShadows",
			),
			f(
				"thinParts",
				"Thin parts cast none",
				3,
				"Struts and rails darken nothing under them.",
				"skyShadows",
			),
		],
	},
	{
		title: "Lights",
		features: [
			f("pointLights", "PointLights", 4, "PointLights, without shadows."),
			f("spotLights", "SpotLights", 4, "SpotLights, without shadows."),
			f("surfaceLights", "SurfaceLights", 4, "SurfaceLights, without shadows."),
			f("lightHighlights", "Light highlights", 4, "Each light's highlight on shiny materials."),
		],
	},
	{
		title: "Glow and effects",
		features: [
			f("neonGlow", "Neon glow", 7, "The halo round Neon."),
			f("lavaGlow", "CrackedLava", 7, "CrackedLava's cracks give light and glow."),
			f("beams", "Beams", 8, "Beams."),
			f("particles", "Particles", 8, "ParticleEmitters near the camera."),
		],
	},
	{
		title: "Sky and air",
		features: [
			f("sky", "Sky", 1, "The sky behind the place."),
			f("skyImages", "Sky images", 1, "The Sky's six images.", "sky"),
			f("sunImage", "Sun image", 1, "The Sky's own sun.", "sky"),
			f("atmosphere", "Atmosphere", 9, "Atmosphere's haze, thinner with height."),
			f("fog", "Fog", 9, "Lighting's fog."),
		],
	},
	{
		title: "Post effects",
		features: [
			f("bloom", "Bloom", 10, "A BloomEffect over the whole picture."),
			f("colourCorrection", "Colour correction", 10, "A ColorCorrectionEffect."),
			f("blur", "Blur", 10, "A BlurEffect."),
		],
	},
	{
		title: "Performance",
		features: [
			f(
				"frustumCulling",
				"Frustum culling",
				0,
				"Parts outside the view are not drawn. The wireframe shows what is left.",
			),
			f(
				"occlusionCulling",
				"Occlusion culling",
				0,
				"Parts hidden behind solid parts are not drawn, tested against the last frame. The wireframe shows what is left.",
				"frustumCulling",
			),
		],
	},
];

export const FEATURES: readonly FeatureInfo[] = FEATURE_GROUPS.flatMap((g) => g.features);
const BY_KEY = new Map(FEATURES.map((i) => [i.key, i]));

/** Everything on: the picture as Studio draws it. */
export const STUDIO_FEATURES: RenderFeatures = Object.fromEntries(
	FEATURES.map((i) => [i.key, true]),
) as unknown as RenderFeatures;

/** Whether a switch takes effect: on, and every switch it sits under on. */
export function featureOn(features: RenderFeatures, key: FeatureKey): boolean {
	const info = BY_KEY.get(key);
	return features[key] && (!info?.parent || featureOn(features, info.parent));
}

/**
 * The step the switches show: the last step with all of its own switches on
 * and every earlier one's; and whether that is all that is on.
 */
export function stepOf(features: RenderFeatures): { step: number; exact: boolean } {
	let step = 0;
	for (let s = 1; s <= RENDER_STEPS.length; s++) {
		if (FEATURES.filter((i) => i.step === s).every((i) => features[i.key])) step = s;
		else break;
	}
	return { step, exact: FEATURES.every((i) => i.step <= step || !features[i.key]) };
}

/** Everything up to step `n` on, everything after it off. */
export function upToStep(n: number): RenderFeatures {
	return Object.fromEntries(FEATURES.map((i) => [i.key, i.step <= n])) as unknown as RenderFeatures;
}

/** The switches set apart from `base`, by key. */
export function changedFrom(
	features: RenderFeatures,
	base: RenderFeatures = STUDIO_FEATURES,
): FeatureKey[] {
	return FEATURES.filter((i) => features[i.key] !== base[i.key]).map((i) => i.key);
}

/** A preset: its name, what it sets, and the view it looks at (a debugging preset's). */
export interface RenderPreset {
	id: string;
	label: string;
	features: RenderFeatures;
	/** The view a debugging preset opens on: see RenderMode. */
	look?: "lit" | "cost" | "lights" | "overdraw" | "density" | "sunMaps";
	/** Light ranges drawn. */
	lightRanges?: boolean;
}

/** The surfaces and sky every debugging preset keeps, so what it shows has a place to show on. */
const BASE: FeatureKey[] = [
	"matTextures",
	"matGrain",
	"smoothMeshes",
	"neonFaces",
	"sky",
	"skyImages",
	"sunImage",
];
const only = (keys: FeatureKey[]): RenderFeatures =>
	Object.fromEntries(
		FEATURES.map((i) => [i.key, BASE.includes(i.key) || keys.includes(i.key)]),
	) as unknown as RenderFeatures;
const without = (keys: FeatureKey[]): RenderFeatures =>
	Object.fromEntries(
		FEATURES.map((i) => [i.key, !keys.includes(i.key)]),
	) as unknown as RenderFeatures;

/** Performance presets: from Studio's picture down to the least the view can draw. */
export const PERFORMANCE_PRESETS: readonly RenderPreset[] = [
	{ id: "studio", label: "As Studio", features: STUDIO_FEATURES },
	{ id: "balanced", label: "Balanced", features: without(["softEdges", "skyReflections"]) },
	{
		id: "fast",
		label: "Fast (iPad)",
		features: without(["softEdges", "skyReflections", "farShadows", "particles", "blur"]),
	},
	{
		id: "lowest",
		label: "Lowest",
		features: without([
			"softEdges",
			"skyReflections",
			"farShadows",
			"particles",
			"blur",
			"beams",
			"nearSkyMaps",
			"highlights",
			"lightHighlights",
			"bloom",
			"atmosphere",
			"matGrain",
		]),
	},
];

/** Render debugging presets: one feature at a time, with the view that shows what it costs. */
export const DEBUG_PRESETS: readonly RenderPreset[] = [
	{
		id: "debug-sun",
		label: "Sun and its shadows",
		features: only(["sun", "sunShadows", "farShadows", "softEdges"]),
	},
	{
		id: "debug-sky",
		label: "Sky light and sky shadows",
		features: only(["skyFill", "ambient", "skyShadows", "nearSkyMaps", "thinParts"]),
	},
	{
		id: "debug-lights",
		label: "Part lights alone",
		features: only(["pointLights", "spotLights", "surfaceLights", "lightHighlights"]),
		lightRanges: true,
	},
	{
		id: "debug-light-cost",
		label: "What the lights cost",
		features: STUDIO_FEATURES,
		look: "lights",
	},
	{
		id: "debug-surfaces",
		label: "Materials and meshes",
		features: only(["sun", "skyFill", "ambient", "highlights", "skyReflections", "images"]),
	},
	{
		id: "debug-effects",
		label: "Glow, beams and particles",
		features: only(["sun", "skyFill", "ambient", "neonGlow", "lavaGlow", "beams", "particles"]),
	},
	{
		id: "debug-see-through",
		label: "See-through cost",
		features: STUDIO_FEATURES,
		look: "overdraw",
	},
	{ id: "debug-triangles", label: "Triangle cost", features: STUDIO_FEATURES, look: "density" },
];

export const RENDER_PRESETS: readonly RenderPreset[] = [...PERFORMANCE_PRESETS, ...DEBUG_PRESETS];

/** The preset by its id; As Studio for one that is gone. */
export function presetById(id: string): RenderPreset {
	return RENDER_PRESETS.find((p) => p.id === id) ?? PERFORMANCE_PRESETS[0];
}

/**
 * The bits the place's shaders read, in the Rendering panel's vec4's y (see
 * view.ts's renderDebug): which parts of a surface's look and light are on.
 * Under 2^24, so a float carries them exactly.
 */
export const FEATURE_BIT = {
	textures: 1,
	grain: 2,
	smooth: 4,
	neon: 8,
	highlights: 16,
	reflections: 32,
	farShadows: 64,
	skyShadows: 128,
	nearSky: 256,
	pointLights: 512,
	spotLights: 1024,
	surfaceLights: 2048,
	lightHighlights: 4096,
	lava: 8192,
	/** Neon's halo, in the glow's source; CrackedLava's is `lava`. */
	neonGlow: 32768,
	/** No light at all is on: the parts drawn in their colours, as the Surfaces step shows them. */
	unlit: 16384,
} as const;

export function featureBits(features: RenderFeatures): number {
	const on = (k: FeatureKey) => featureOn(features, k);
	const pairs: [boolean, number][] = [
		[on("matTextures"), FEATURE_BIT.textures],
		[on("matGrain"), FEATURE_BIT.grain],
		[on("smoothMeshes"), FEATURE_BIT.smooth],
		[on("neonFaces"), FEATURE_BIT.neon],
		[on("highlights"), FEATURE_BIT.highlights],
		[on("skyReflections"), FEATURE_BIT.reflections],
		[on("farShadows"), FEATURE_BIT.farShadows],
		[on("skyShadows"), FEATURE_BIT.skyShadows],
		[on("nearSkyMaps"), FEATURE_BIT.nearSky],
		[on("pointLights"), FEATURE_BIT.pointLights],
		[on("spotLights"), FEATURE_BIT.spotLights],
		[on("surfaceLights"), FEATURE_BIT.surfaceLights],
		[on("lightHighlights"), FEATURE_BIT.lightHighlights],
		[on("lavaGlow"), FEATURE_BIT.lava],
		[on("neonGlow"), FEATURE_BIT.neonGlow],
		[!litAtAll(features), FEATURE_BIT.unlit],
	];
	return pairs.reduce((bits, [yes, bit]) => (yes ? bits | bit : bits), 0);
}

/** Whether any light is on: the sun, the sky's light, Ambient or a kind of light. */
export function litAtAll(features: RenderFeatures): boolean {
	return (
		features.sun ||
		features.skyFill ||
		features.ambient ||
		features.pointLights ||
		features.spotLights ||
		features.surfaceLights
	);
}

/**
 * The place's lighting as the view is given it, with what is switched off
 * taken out: the sun's light, the sky's, Ambient, the sun's shadows and
 * their softness, the air, the Sky's sun and the post effects. The Sky's
 * images are left to the view (see `featureOn(…, "skyImages")`), as they
 * arrive on their own.
 */
export function litFor(lighting: LightingParams, features: RenderFeatures): LightingParams {
	const on = (k: FeatureKey) => featureOn(features, k);
	const dark = [0, 0, 0];
	const post = { ...lighting.post };
	if (!on("bloom")) post.bloom = undefined;
	if (!on("colourCorrection")) post.colour = undefined;
	if (!on("blur")) post.blur = undefined;
	return {
		...lighting,
		sunColour: on("sun") ? lighting.sunColour : dark,
		ambient: on("skyFill") ? lighting.ambient : dark,
		skyFill: on("skyFill") ? lighting.skyFill : 0,
		indoor: on("ambient") ? lighting.indoor : dark,
		sunShadows: on("sunShadows") ? lighting.sunShadows : false,
		shadowSoftness: on("softEdges") ? lighting.shadowSoftness : 0,
		hazeDensity: on("atmosphere") ? lighting.hazeDensity : 0,
		fog: on("fog") ? lighting.fog : { ...lighting.fog, on: false },
		sunImage: on("sunImage") ? lighting.sunImage : undefined,
		post,
	};
}

/** The passes the renderers draw or leave out, as the switches say. */
export interface RenderPasses {
	/** The glow's pass: Neon's halo or CrackedLava's. */
	glow: boolean;
	/** The post effects' pass. */
	post: boolean;
	sky: boolean;
	skyImages: boolean;
	images: boolean;
	seeThrough: boolean;
	beams: boolean;
	particles: boolean;
	/** The near sky maps opened, so thin parts cast no sky shadow. */
	thinParts: boolean;
	/** Parts out of view, and hidden behind solid parts, left out of the camera's passes. */
	frustum: boolean;
	occlusion: boolean;
}

export function passesOf(features: RenderFeatures): RenderPasses {
	const on = (k: FeatureKey) => featureOn(features, k);
	return {
		glow: on("neonGlow") || on("lavaGlow"),
		post: on("bloom") || on("colourCorrection") || on("blur"),
		sky: on("sky"),
		skyImages: on("skyImages"),
		images: on("images"),
		seeThrough: on("seeThrough"),
		beams: on("beams"),
		particles: on("particles"),
		thinParts: on("thinParts"),
		frustum: on("frustumCulling"),
		occlusion: on("occlusionCulling"),
	};
}

/** Whether the air is drawn at all: Atmosphere's haze or Lighting's fog. */
export function airOn(features: RenderFeatures): boolean {
	return featureOn(features, "atmosphere") || featureOn(features, "fog");
}
