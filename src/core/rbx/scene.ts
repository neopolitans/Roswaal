/**
 * A place's Workspace as the viewport draws it: one instance buffer per shape.
 *
 * Built by the host, from the place it has already parsed, and sent to the
 * editor whole -- the editor never holds the place, only names and classes
 * (see `browse.ts`), and a buffer is the one other thing a renderer needs.
 *
 * Each instance is 15 words (60 bytes):
 *
 * - c0, c1, c2: the CFrame's rotation columns, each times the size on its axis;
 * - p: the position;
 * - colour: RGBA8, packed into one word, the alpha 1 - Transparency;
 * - id: the instance's place in the DataModel browser's order, so a click in
 *   the view and a row in the tree name the same instance;
 * - look: its row in `MATERIALS` in the low byte, Reflectance × 255 in the next.
 *
 * Parts that are seen through -- Transparency above 0, or ForceField -- are
 * kept apart, in `translucent`, to be drawn after the rest and blended.
 *
 * For now a MeshPart, or a part with a FileMesh, is its bounding box, fully
 * transparent parts are left out, and a mesh modifier's Scale and Offset are
 * applied to the shape it stands for.
 */

import { assetIdOf } from "./browse.js";
import { type RbxInstance, stringProp } from "./dom.js";
import { MATERIAL_SHADE, MATERIALS, materialIndex } from "./materials.js";

export const SCENE_KINDS = ["block", "wedge", "cornerWedge", "cylinder", "ball", "mesh"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
/** Words an instance. */
export const SCENE_STRIDE = 15;
/** Where an instance's whole numbers start: its colour, its id and its look. */
const FIRST_WORD = 12;

/**
 * Rows of numbers as the renderers read them: the transform as floats, and the
 * whole numbers as the bits they are. Those must not pass through a float on
 * the way, as JS numbers: an opaque colour with a lot of blue is a NaN as a
 * float, and Safari and Firefox read every NaN as the same one.
 */
export function instanceData(rows: readonly number[]): Float32Array {
	const data = new Float32Array(rows.length);
	const words = new Uint32Array(data.buffer);
	rows.forEach((value, i) => {
		if (i % SCENE_STRIDE < FIRST_WORD) data[i] = value;
		else words[i] = value;
	});
	return data;
}

export interface PlaceScene {
	kinds: Record<SceneKind, { data: Float32Array; count: number }>;
	/** Parts seen through, drawn after `kinds` and blended. */
	translucent: Record<SceneKind, { data: Float32Array; count: number }>;
	/** Where most of the place is: the median of each axis, and a radius holding 95% of it. */
	centre: [number, number, number];
	radius: number;
	/** Fully transparent parts, left out. */
	transparent: number;
	/**
	 * Pivots, by row in the DataModel browser: a row-major 3x3 rotation, then the
	 * position. Each Model's is its PrimaryPart's pivot, else its WorldPivot; a
	 * model with neither is left out, and is square to the world. A part is here
	 * only when its pivot is not its drawn box's centre and axes: a PivotOffset,
	 * or a mesh modifier that moves or turns what is drawn. A model's selection
	 * box and handles are square to its pivot, as Studio's are and as
	 * `Model:GetBoundingBox` describes.
	 */
	pivots?: Record<number, number[]>;
	/** Where Studio's camera was when the place was saved: Workspace's Camera. */
	camera?: { id: number; position: number[]; rotation: number[]; fieldOfView: number };
	/**
	 * Decals and Textures, each a quad on its part's face, drawn once its image
	 * has been downloaded through Sign in with Roblox. See `faceImages`.
	 */
	images?: SceneImage[];
}

/**
 * A Decal or a Texture on one face of a part: the quad in world space, a
 * hair off the face, and where on the image each corner is. A Decal stretches
 * its image over the face; a Texture tiles it, StudsPerTile and OffsetStuds
 * from the face's top left.
 */
export interface SceneImage {
	/** The image's asset id, as the file names it. */
	asset: string;
	/** The part's row, which is its DataModel browser index. */
	part: number;
	/** Top left, top right, bottom right, bottom left: x, y, z each. */
	corners: number[];
	/** u, v for each corner in the same order. */
	uv: number[];
	/** Which way the face looks. */
	normal: number[];
	/** Color3, 0 to 1. */
	tint: number[];
	/** 1 - Transparency. */
	alpha: number;
}

const PARTS = new Set([
	"Part",
	"WedgePart",
	"CornerWedgePart",
	"TrussPart",
	"SpawnLocation",
	"Seat",
	"VehicleSeat",
	"MeshPart",
]);

type Frame = { position: number[]; rotation: number[] };

/** `a` then `b`, each a row-major 3x3. */
function rotate(a: number[], b: number[]): number[] {
	return Array.from({ length: 9 }, (_, n) => {
		const i = Math.floor(n / 3);
		const j = n % 3;
		return a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
	});
}

/** `frame` then `by`: CFrame multiplication. */
function compose(frame: Frame, by: Frame): Frame {
	const r = frame.rotation;
	const o = by.position;
	return {
		rotation: rotate(r, by.rotation),
		position: [0, 1, 2].map(
			(a) => frame.position[a] + r[a * 3] * o[0] + r[a * 3 + 1] * o[1] + r[a * 3 + 2] * o[2],
		),
	};
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Whether an offset moves or turns anything. */
function moves(offset: Frame): boolean {
	return offset.position.some((v) => v !== 0) || offset.rotation.some((v, i) => v !== IDENTITY[i]);
}

/** A part's pivot: its CFrame turned and moved by its PivotOffset. */
export function partPivot(part: RbxInstance): Frame | undefined {
	const cf = part.props.get("CFrame")?.value as Frame | undefined;
	if (!cf) return undefined;
	const offset = part.props.get("PivotOffset")?.value as Frame | undefined;
	return offset && moves(offset) ? compose(cf, offset) : cf;
}

/** A Model's pivot: its PrimaryPart's, else its WorldPivot, else nothing. */
export function modelPivot(model: RbxInstance): Frame | undefined {
	const primary = model.props.get("PrimaryPart")?.value as RbxInstance | null | undefined;
	const pivot = primary && partPivot(primary);
	if (pivot) return pivot;
	const world = model.props.get("WorldPivotData")?.value as Frame | null | undefined;
	return world ?? undefined;
}

const flat = (f: Frame) => [...f.rotation, ...f.position];

function vec3(inst: RbxInstance, name: string): number[] | undefined {
	const v = inst.props.get(name)?.value;
	return Array.isArray(v) ? (v as number[]) : undefined;
}

/** The shape a part is drawn as, from its class, its Shape, and a mesh modifier inside it. */
function kindOf(inst: RbxInstance, modifier: RbxInstance | undefined): SceneKind {
	if (modifier) {
		if (modifier.className === "BlockMesh") return "block";
		if (modifier.className === "CylinderMesh") return "cylinder";
		// SpecialMesh.MeshType: Head 0, Wedge 2, Sphere 3, Cylinder 4, FileMesh 5, CornerWedge 11.
		const type = modifier.props.get("MeshType")?.value;
		return type === 2
			? "wedge"
			: type === 3 || type === 0
				? "ball"
				: type === 4
					? "cylinder"
					: type === 5
						? "mesh"
						: type === 11
							? "cornerWedge"
							: "block";
	}
	if (inst.className === "WedgePart") return "wedge";
	if (inst.className === "CornerWedgePart") return "cornerWedge";
	if (inst.className === "MeshPart") return "mesh";
	if (inst.className === "Part") {
		// PartType: Ball 0, Block 1, Cylinder 2, Wedge 3, CornerWedge 4.
		const shape = inst.props.get("shape")?.value ?? inst.props.get("Shape")?.value;
		return shape === 0
			? "ball"
			: shape === 2
				? "cylinder"
				: shape === 3
					? "wedge"
					: shape === 4
						? "cornerWedge"
						: "block";
	}
	return "block";
}

/**
 * The parts under `workspace`, drawn (none when the place has no Workspace). `idOf` is the browser's index for an
 * instance, which the renderer hands back for whatever is clicked.
 */
export function buildPlaceScene(
	workspace: RbxInstance | undefined,
	idOf: (inst: RbxInstance) => number | undefined,
): PlaceScene {
	const empty = (): Record<SceneKind, number[]> => ({
		block: [],
		wedge: [],
		cornerWedge: [],
		cylinder: [],
		ball: [],
		mesh: [],
	});
	const lists = empty();
	const seeThrough = empty();
	const positions: number[] = [];
	const pivots: Record<number, number[]> = {};
	const images: SceneImage[] = [];
	let transparent = 0;

	const visit = (inst: RbxInstance) => {
		for (const child of inst.children) visit(child);
		if (inst.props.has("WorldPivotData") || inst.props.has("PrimaryPart")) {
			const id = idOf(inst);
			const pivot = modelPivot(inst);
			if (id !== undefined && pivot) pivots[id] = flat(pivot);
		}
		if (!PARTS.has(inst.className)) return;
		const transparency = inst.props.get("Transparency")?.value;
		if (typeof transparency === "number" && transparency >= 0.999) {
			transparent++;
			return;
		}
		const id = idOf(inst);
		const cf = inst.props.get("CFrame")?.value as
			| { position: number[]; rotation: number[] }
			| undefined;
		let size = vec3(inst, "size") ?? vec3(inst, "Size");
		if (id === undefined || !cf || !size) return;
		const rgb = vec3(inst, "Color3uint8") ?? [163, 162, 165];

		const modifier = inst.children.find(
			(c) =>
				c.className === "SpecialMesh" ||
				c.className === "BlockMesh" ||
				c.className === "CylinderMesh",
		);
		const kind = kindOf(inst, modifier);
		const offset = (modifier && vec3(modifier, "Offset")) ?? [0, 0, 0];
		if (modifier && kind !== "mesh") {
			const scale = vec3(modifier, "Scale") ?? [1, 1, 1];
			size = [size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]];
		}
		if (kind === "ball") {
			const d = Math.min(size[0], size[1], size[2]);
			size = [d, d, d];
		}
		// A cylinder part runs the length of X and is round across, as wide as
		// the narrower of Y and Z: Studio never draws it oval. A CylinderMesh
		// stretches to its part, so it keeps both.
		if (kind === "cylinder" && !modifier) {
			const d = Math.min(size[1], size[2]);
			size = [size[0], d, d];
		}

		const r = cf.rotation;
		let x = [r[0], r[3], r[6]];
		let y = [r[1], r[4], r[7]];
		const z = [r[2], r[5], r[8]];
		let sx = size[0];
		let sy = size[1];
		// A CylinderMesh stands upright: its axis is the part's Y, which is the
		// unit cylinder's X turned a quarter about Z.
		if (modifier?.className === "CylinderMesh") {
			const tx = x;
			x = y;
			y = [-tx[0], -tx[1], -tx[2]];
			[sx, sy] = [sy, sx];
		}
		const p = [0, 1, 2].map(
			(a) =>
				cf.position[a] + r[a * 3] * offset[0] + r[a * 3 + 1] * offset[1] + r[a * 3 + 2] * offset[2],
		);
		const see = typeof transparency === "number" ? Math.max(0, Math.min(1, transparency)) : 0;
		const alpha = Math.round((1 - see) * 255);
		const colour = (rgb[0] & 255) | ((rgb[1] & 255) << 8) | ((rgb[2] & 255) << 16) | (alpha << 24);
		// Decals and Textures: on a block or a mesh, which are drawn as their box.
		if ((kind === "block" || kind === "mesh") && !modifier) {
			images.push(...faceImages(inst, id, r, cf.position, size));
		}
		const material = materialIndex(inst.props.get("Material")?.value);
		const reflectance = inst.props.get("Reflectance")?.value;
		const shine = Math.round(
			Math.max(0, Math.min(1, typeof reflectance === "number" ? reflectance : 0)) * 255,
		);
		const through = alpha < 255 || MATERIALS[material].shade === MATERIAL_SHADE.forceField;
		(through ? seeThrough : lists)[kind].push(
			x[0] * sx,
			x[1] * sx,
			x[2] * sx,
			y[0] * sy,
			y[1] * sy,
			y[2] * sy,
			z[0] * size[2],
			z[1] * size[2],
			z[2] * size[2],
			p[0],
			p[1],
			p[2],
			colour,
			id,
			material | (shine << 8),
		);
		positions.push(p[0], p[1], p[2]);
		// The pivot, where it is not the drawn box's centre and axes.
		const pivotOffset = inst.props.get("PivotOffset")?.value as Frame | undefined;
		if (modifier || (pivotOffset && moves(pivotOffset))) {
			const pivot = partPivot(inst);
			if (pivot) pivots[id] = flat(pivot);
		}
	};
	if (workspace) visit(workspace);

	// The median of each axis, and a radius holding 95% of parts, so a skybox
	// shell or a part left far out does not set the camera.
	const n = positions.length / 3;
	const axis = (a: number) => {
		const v = Array.from({ length: n }, (_, i) => positions[i * 3 + a]).sort((p, q) => p - q);
		return v[Math.floor(n / 2)] ?? 0;
	};
	const centre: [number, number, number] = [axis(0), axis(1), axis(2)];
	const dist = Array.from({ length: n }, (_, i) =>
		Math.hypot(
			positions[i * 3] - centre[0],
			positions[i * 3 + 1] - centre[1],
			positions[i * 3 + 2] - centre[2],
		),
	).sort((p, q) => p - q);
	const radius = Math.max(50, dist[Math.floor(n * 0.95)] ?? 100);

	const pack = (from: Record<SceneKind, number[]>) => {
		const out = {} as PlaceScene["kinds"];
		for (const k of SCENE_KINDS)
			out[k] = { data: instanceData(from[k]), count: from[k].length / SCENE_STRIDE };
		return out;
	};
	const scene: PlaceScene = {
		kinds: pack(lists),
		translucent: pack(seeThrough),
		centre,
		radius,
		transparent,
		pivots,
		...(images.length > 0 ? { images } : {}),
	};
	const studio = workspace?.children.find((c) => c.className === "Camera");
	const cf = studio?.props.get("CFrame")?.value as
		| { position: number[]; rotation: number[] }
		| undefined;
	const camId = studio && idOf(studio);
	if (cf && camId !== undefined) {
		const fov = studio?.props.get("FieldOfView")?.value;
		scene.camera = {
			id: camId,
			position: [...cf.position],
			rotation: [...cf.rotation],
			fieldOfView: typeof fov === "number" ? fov : 70,
		};
	}
	return scene;
}

/**
 * Each face as Roblox names it (Enum.NormalId), as the part's axes: which way
 * it looks, and which ways are up and right on the image to someone facing it.
 * An axis is its index and sign. Right is up × normal. The side faces' up is
 * the part's Y; Top's is towards Front, and Bottom's towards Back.
 */
const FACES: Record<
	number,
	{ n: [number, number]; up: [number, number]; right: [number, number] }
> = {
	0: { n: [0, 1], up: [1, 1], right: [2, -1] }, // Right
	1: { n: [1, 1], up: [2, -1], right: [0, 1] }, // Top
	2: { n: [2, 1], up: [1, 1], right: [0, 1] }, // Back
	3: { n: [0, -1], up: [1, 1], right: [2, 1] }, // Left
	4: { n: [1, -1], up: [2, 1], right: [0, 1] }, // Bottom
	5: { n: [2, -1], up: [1, 1], right: [0, -1] }, // Front
};

/** How far off its face an image is drawn, in studs, so the face does not show through. */
const IMAGE_LIFT = 0.02;

/** An image's asset id: from a ContentId string, or a Content value's uri. */
function imageAsset(inst: RbxInstance): string | undefined {
	const content = inst.props.get("TextureContent")?.value as { uri?: string } | undefined;
	const raw = content?.uri ?? stringProp(inst, "Texture") ?? "";
	return assetIdOf(raw.trim());
}

function numberProp(inst: RbxInstance, name: string, fallback: number): number {
	const v = inst.props.get(name)?.value;
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * The Decals and Textures directly under a part, as quads. `rotation` is the
 * part's, row-major; `size` its size in studs.
 */
export function faceImages(
	part: RbxInstance,
	id: number,
	rotation: number[],
	position: number[],
	size: number[],
): SceneImage[] {
	const out: SceneImage[] = [];
	const axis = (a: number, sign: number) =>
		[rotation[a], rotation[3 + a], rotation[6 + a]].map((v) => v * sign + 0);
	for (const child of part.children) {
		if (child.className !== "Decal" && child.className !== "Texture") continue;
		const asset = imageAsset(child);
		if (!asset) continue;
		const transparency = numberProp(child, "Transparency", 0);
		if (transparency >= 0.999) continue;
		const face = FACES[numberProp(child, "Face", 5)] ?? FACES[5];
		const n = axis(face.n[0], face.n[1]);
		const up = axis(face.up[0], face.up[1]);
		const right = axis(face.right[0], face.right[1]);
		const out_ = size[face.n[0]] / 2 + IMAGE_LIFT;
		const hu = size[face.up[0]] / 2;
		const hr = size[face.right[0]] / 2;
		const centre = [0, 1, 2].map((k) => position[k] + n[k] * out_);
		const corner = (r: number, u: number) =>
			[0, 1, 2].map((k) => centre[k] + right[k] * hr * r + up[k] * hu * u);
		let uv = [0, 0, 1, 0, 1, 1, 0, 1];
		if (child.className === "Texture") {
			const su = Math.max(numberProp(child, "StudsPerTileU", 2), 0.01);
			const sv = Math.max(numberProp(child, "StudsPerTileV", 2), 0.01);
			const ou = numberProp(child, "OffsetStudsU", 0);
			const ov = numberProp(child, "OffsetStudsV", 0);
			const u0 = ou / su;
			const u1 = (hr * 2 + ou) / su;
			const v0 = ov / sv;
			const v1 = (hu * 2 + ov) / sv;
			uv = [u0, v0, u1, v0, u1, v1, u0, v1];
		}
		const colour = child.props.get("Color3")?.value;
		const tint = Array.isArray(colour) && colour.length === 3 ? (colour as number[]) : [1, 1, 1];
		out.push({
			asset,
			part: id,
			corners: [...corner(-1, 1), ...corner(1, 1), ...corner(1, -1), ...corner(-1, -1)],
			uv,
			normal: n,
			tint,
			alpha: 1 - Math.max(0, Math.min(1, transparency)),
		});
	}
	return out;
}
