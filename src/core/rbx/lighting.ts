/**
 * A place's light as the viewport draws it: read from Lighting, its Atmosphere
 * and its Sky, from what creator-docs say the properties mean. Nothing here is
 * Roblox's; the numbers that turn a property into a colour are ours, matched
 * against Studio from the same camera.
 *
 * Read by the host, beside the scene, since the editor never holds the place.
 */

import { assetIdOf } from "./browse.js";
import type { RbxDocument, RbxInstance } from "./dom.js";

/** A Sky's six images, by the name each has after `Skybox`. */
export const SKY_FACES = ["Bk", "Dn", "Ft", "Lf", "Rt", "Up"] as const;
export type SkyFace = (typeof SKY_FACES)[number];

export interface LightingParams {
	/** Towards the sun, or the moon when the sun is down. */
	sun: number[];
	/** The light it gives, linear, with Brightness in it. */
	sunColour: number[];
	/** Cosine of the sun disc's half-angle, from SunAngularSize. */
	sunDisc: number;
	/** OutdoorAmbient and the sky's fill, linear. */
	ambient: number[];
	/** EnvironmentDiffuseScale: how much the sky lights what faces it. */
	skyFill: number;
	zenith: number[];
	horizon: number[];
	ground: number[];
	/** 2 to the ExposureCompensation. */
	exposure: number;
	/** Atmosphere's haze: how fast it thickens with distance, and its colour. */
	hazeDensity: number;
	hazeColour: number[];
	/** Lighting's own fog, used when there is no Atmosphere. */
	fog: { start: number; end: number; colour: number[]; on: boolean };
	glare: number;
	/**
	 * A Sky's six images, as asset ids, when it names all six: drawn in place
	 * of the sky made here once Sign in with Roblox has them.
	 */
	skybox?: Record<SkyFace, string>;
	/**
	 * Whether the sun made here is drawn over a Sky's images: where the Sky
	 * shows Studio's own sun. A sun image of the place's own is not drawn yet.
	 */
	skyboxSun: boolean;
	/** What lights the place, for the Properties summary: a name and what it is. */
	notes: [string, string][];
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linRgb = (c: number[]) => c.map(lin);
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

function prop<T>(inst: RbxInstance | undefined, name: string, fallback: T): T {
	const v = inst?.props.get(name)?.value;
	return v === undefined ? fallback : (v as T);
}

/** "14:30:00" as hours, as TimeOfDay stores it. */
function hours(inst: RbxInstance | undefined): number {
	const v = inst?.props.get("TimeOfDay")?.value;
	const s =
		v instanceof Uint8Array ? new TextDecoder().decode(v) : typeof v === "string" ? v : "14:00:00";
	const [h, m, sec] = s.split(":").map(Number);
	return (h || 0) + (m || 0) / 60 + (sec || 0) / 3600;
}

const DECLINATION = (23.5 * Math.PI) / 180;

/**
 * Where the sun is: an hour angle from the time, at a declination of 23.5°
 * -- the tilt of the Earth, fixed -- seen from the latitude. East is +X and
 * north is -Z, as Lighting:GetSunDirection() has it.
 */
export function sunDirection(time: number, latitude: number): number[] {
	const h = ((time - 12) / 24) * Math.PI * 2;
	const lat = (latitude * Math.PI) / 180;
	const d = DECLINATION;
	const east = -Math.cos(d) * Math.sin(h);
	const north = Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.cos(h) * Math.sin(lat);
	const up = Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(h) * Math.cos(lat);
	return [east, up, -north];
}

/** The sky's light on everything, measured from Studio: bluer than the sky looks, and nearly even from every side. */
const FILL = [1.05, 1.4, 1.85];
/** Studio's sky, measured and run back through the display transform, for an Atmosphere of Density 0.3. */
const ZENITH = [0.2472, 0.8251, 1.3945];
const HORIZON = [0.5865, 1.0226, 1.312];

export function readLighting(doc: RbxDocument): LightingParams {
	const lighting = doc.roots.find((r) => r.className === "Lighting");
	const atmosphere = lighting?.children.find((c) => c.className === "Atmosphere");
	const sky = lighting?.children.find((c) => c.className === "Sky");
	const notes: [string, string][] = [];

	const latitude = prop(lighting, "GeographicLatitude", 41.733);
	let sun = sunDirection(hours(lighting), latitude);
	const day = Math.max(0, Math.min(1, sun[1] * 4 + 0.25));
	// Below the horizon, the moon: opposite, and faint.
	const moon = sun[1] < 0;
	if (moon) sun = sun.map((v) => -v);
	const brightness = prop(lighting, "Brightness", 2);
	// Low sun is warmer: the light has come through more air.
	const warm = mix([1, 0.62, 0.38], [1, 0.96, 0.9], Math.min(1, Math.max(0, sun[1] * 3)));
	const sunColour = moon
		? [0.12, 0.14, 0.2].map((v) => v * brightness * 0.12)
		: warm.map((v) => v * brightness * 0.4);
	const size = prop(sky, "SunAngularSize", 21);

	const skyFill = prop(lighting, "EnvironmentDiffuseScale", 0);
	// With EnvironmentDiffuseScale at 0 the fill is gone and OutdoorAmbient alone is left.
	const ambient = linRgb(prop(lighting, "OutdoorAmbient", [0.5, 0.5, 0.5])).map(
		(v, i) => v + FILL[i] * skyFill * (0.06 + 0.94 * day),
	);

	// Blue overhead, the Atmosphere's colour at the horizon, thicker haze
	// washing the blue out; dark at night.
	const density = atmosphere ? prop(atmosphere, "Density", 0.395) : 0;
	const hazeTint = atmosphere
		? linRgb(prop(atmosphere, "Color", [0.78, 0.78, 0.78]))
		: [0.62, 0.72, 0.86];
	const decay = atmosphere
		? linRgb(prop(atmosphere, "Decay", [0.42, 0.44, 0.49]))
		: [0.5, 0.5, 0.5];
	const thick = Math.max(0, Math.min(1, (density - 0.3) * 1.4));
	const haze = hazeTint.map((v) => v * 1.8);
	const zenith = mix(ZENITH, haze, thick * 0.6).map((v) => v * (0.04 + 0.96 * day));
	// Towards sunset the horizon takes the Decay colour, the light that got through.
	const lowSun = 1 - Math.min(1, Math.abs(sun[1]) * 3);
	const horizon = mix(
		mix(HORIZON, haze, thick),
		decay.map((v) => v * 2),
		moon ? 0 : lowSun * 0.6,
	).map((v) => v * (0.05 + 0.95 * day));

	notes.push([
		"Haze",
		atmosphere ? `Atmosphere, density ${+density.toFixed(3)}` : "Lighting's fog, no Atmosphere",
	]);
	notes.push([moon ? "Moonlight" : "Sunlight", `Latitude ${+latitude.toFixed(1)}°`]);
	const skybox = skyboxOf(sky);
	if (sky) notes.push(["Sky", skybox ? "Its images, once downloaded" : "Not all six images named"]);

	return {
		sun,
		sunColour,
		// SunAngularSize covers the sun's image with its glow; the bright core
		// is a quarter of it across, and the glow round it does the rest.
		sunDisc: Math.cos(((size / 2) * 0.25 * Math.PI) / 180),
		ambient,
		skyFill,
		zenith,
		horizon,
		ground: horizon.map((v) => v * 0.32),
		exposure: 2 ** prop(lighting, "ExposureCompensation", 0),
		// Density is a 0-1 dial; this is haze per stud.
		hazeDensity: density * 0.0011,
		hazeColour: horizon,
		fog: {
			start: prop(lighting, "FogStart", 0),
			end: prop(lighting, "FogEnd", 100000),
			colour: linRgb(prop(lighting, "FogColor", [0.75, 0.75, 0.75])),
			on: !atmosphere,
		},
		glare: atmosphere ? prop(atmosphere, "Glare", 0) : 0,
		...(skybox ? { skybox } : {}),
		skyboxSun: ownSun(sky),
		notes,
	};
}

/** Whether a Sky shows Studio's own sun: its celestial bodies on, and no sun image of its own. */
export function ownSun(sky: RbxInstance | undefined): boolean {
	if (prop<boolean>(sky, "CelestialBodiesShown", true) === false) return false;
	const value = sky?.props.get("SunTextureId")?.value;
	const text = value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
	return typeof text !== "string" || text.trim() === "" || /^rbxasset:\/\//i.test(text.trim());
}

/** A Sky's six image ids, or nothing if any face names no image. */
export function skyboxOf(sky: RbxInstance | undefined): Record<SkyFace, string> | undefined {
	if (!sky) return undefined;
	const faces = {} as Record<SkyFace, string>;
	for (const face of SKY_FACES) {
		const value = sky.props.get(`Skybox${face}`)?.value;
		const text = value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
		const id = typeof text === "string" ? assetIdOf(text) : undefined;
		if (!id) return undefined;
		faces[face] = id;
	}
	return faces;
}

/**
 * The block the shaders read after their two matrices: eleven vec4s.
 * sun (xyz, handle alpha) · sunColour (rgb, disc) · ambient (rgb, sky fill) ·
 * zenith (rgb, exposure) · horizon (rgb, haze density) · ground (rgb, glare) ·
 * camera (xyz, 0) · select (rgb, 1) · fog (start, end, on, 0) · fog colour ·
 * haze colour.
 */
export function lightingBlock(
	l: LightingParams,
	camera: number[],
	select: number[],
	handleAlpha: number,
): Float32Array {
	return new Float32Array([
		...l.sun,
		handleAlpha,
		...l.sunColour,
		l.sunDisc,
		...l.ambient,
		l.skyFill,
		...l.zenith,
		l.exposure,
		...l.horizon,
		l.hazeDensity,
		...l.ground,
		l.glare,
		...camera,
		0,
		...select,
		1,
		l.fog.start,
		l.fog.end,
		l.fog.on ? 1 : 0,
		0,
		...l.fog.colour,
		0,
		...l.hazeColour,
		0,
	]);
}
