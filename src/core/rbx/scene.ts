/**
 * A place's Workspace as the viewport draws it: one instance buffer per shape.
 *
 * Built by the host, from the place it has already parsed, and sent to the
 * editor whole -- the editor never holds the place, only names and classes
 * (see `browse.ts`), and a buffer is the one other thing a renderer needs.
 *
 * Each instance is 14 words (56 bytes):
 *
 * - c0, c1, c2: the CFrame's rotation columns, each times the size on its axis;
 * - p: the position;
 * - colour: RGBA8, packed into one word;
 * - id: the instance's place in the DataModel browser's order, so a click in
 *   the view and a row in the tree name the same instance.
 *
 * For now a MeshPart, or a part with a FileMesh, is its bounding box, fully
 * transparent parts are left out, and a mesh modifier's Scale and Offset are
 * applied to the shape it stands for.
 */

import type { RbxInstance } from "./dom.js";

export const SCENE_KINDS = ["block", "wedge", "cornerWedge", "cylinder", "ball", "mesh"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
/** Words an instance. */
export const SCENE_STRIDE = 14;

export interface PlaceScene {
	kinds: Record<SceneKind, { data: Float32Array; count: number }>;
	/** Where most of the place is: the median of each axis, and a radius holding 95% of it. */
	centre: [number, number, number];
	radius: number;
	/** Fully transparent parts, left out. */
	transparent: number;
	/** Where Studio's camera was when the place was saved: Workspace's Camera. */
	camera?: { id: number; position: number[]; rotation: number[]; fieldOfView: number };
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
	const lists: Record<SceneKind, number[]> = {
		block: [],
		wedge: [],
		cornerWedge: [],
		cylinder: [],
		ball: [],
		mesh: [],
	};
	const f32 = new Float32Array(1);
	const u32 = new Uint32Array(f32.buffer);
	const word = (bits: number) => {
		u32[0] = bits >>> 0;
		return f32[0];
	};
	const positions: number[] = [];
	let transparent = 0;

	const visit = (inst: RbxInstance) => {
		for (const child of inst.children) visit(child);
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
		const colour = (rgb[0] & 255) | ((rgb[1] & 255) << 8) | ((rgb[2] & 255) << 16) | (255 << 24);
		lists[kind].push(
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
			word(colour),
			word(id),
		);
		positions.push(p[0], p[1], p[2]);
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

	const kinds = {} as PlaceScene["kinds"];
	for (const k of SCENE_KINDS)
		kinds[k] = { data: new Float32Array(lists[k]), count: lists[k].length / SCENE_STRIDE };
	const scene: PlaceScene = { kinds, centre, radius, transparent };
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
