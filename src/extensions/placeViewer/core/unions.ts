/**
 * Unions in the place viewer, drawn as the parts they were made from.
 *
 * A UnionOperation keeps its shape in two forms. `MeshData` is the solved
 * shape, which is obfuscated, and which Roswaal does not read. `ChildData` is
 * a binary model of the parts the union was made from, which our own reader
 * opens. Studio keeps the pair in a SolidModel asset (type 39) that the
 * union's AssetId names: a binary model holding one PartOperationAsset. A
 * file can also hold them on the union itself, as ChildData or ChildData2.
 *
 * Where the parts go, from the files we have read: ChildData's CFrames are in
 * the union's own frame as it was made, whose origin is the middle of the
 * solved shape's box, and InitialSize is that box. A union moved or turned
 * since carries that frame in its CFrame; one resized since is the same shape
 * stretched by Size / InitialSize along each of its own axes. So a part is
 * drawn at CFrame · diag(Size / InitialSize) · its CFrame in ChildData, and a
 * union inside ChildData nests the same way.
 *
 * The parts a union adds are drawn as ordinary parts, all in the union's
 * Material, Transparency and Reflectance; in the union's Color when
 * UsePartColor is on, else each in its own. What it takes away, its
 * NegateOperations, is cut from them (see `csg.ts`), the faces of the cut in
 * the colour the negated part would have been. A cut that cannot be made, as
 * from a mesh, is left out, so the union is drawn without it, and listed in
 * `unionCuts`. An IntersectOperation is not drawn, as the parts it was made
 * from would draw more than it is.
 */

import { assetIdOf } from "../../../core/rbx/browse.js";
import { type RbxInstance, stringProp } from "../../../core/rbx/dom.js";
import { readRbx } from "../../../core/rbx/index.js";
import { addedRows, type CsgNode, type CutFace, cutFaces, takes } from "./csg.js";
import {
	buildPlaceScene,
	instanceData,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneKind,
	type SceneMesh,
} from "./scene.js";
import { type SealedFace, sealedFaces } from "./seams.js";

/** Roblox's asset type for the asset a union's AssetId names. */
export const SOLID_MODEL_TYPE = 39;

/** The key a union that holds its own ChildData is drawn by, before its row. */
const INLINE = "inline:";

/** How a union paints the parts it is drawn as. */
export interface UnionPaint {
	/** Color3uint8. */
	rgb: number[];
	/** Enum.Material's value. */
	material: number;
	transparency: number;
	reflectance: number;
	/** The union's Color on every part, rather than each part's own. */
	usePartColor: boolean;
}

/** A union the scene draws once the model its AssetId names is here. */
export interface SceneUnion {
	/** Its row: its place in the DataModel browser's order. */
	id: number;
	/** The SolidModel asset its AssetId names. */
	asset: string;
	/** Where its ChildData is drawn: CFrame · diag(Size / InitialSize), a row-major 3x3, then the position. */
	frame: number[];
	/** Its own box as a row's first twelve floats: each axis times its size, then its middle. */
	box: number[];
	paint: UnionPaint;
}

type Affine = { m: number[]; p: number[] };

const MODIFIERS = new Set(["SpecialMesh", "BlockMesh", "CylinderMesh"]);
/** What `buildPlaceScene` draws, as it names them. */
const DRAWN = new Set([
	"Part",
	"WedgePart",
	"CornerWedgePart",
	"TrussPart",
	"SpawnLocation",
	"Seat",
	"VehicleSeat",
	"MeshPart",
]);

function vec3(inst: RbxInstance, ...names: string[]): number[] | undefined {
	for (const name of names) {
		const v = inst.props.get(name)?.value;
		if (Array.isArray(v) && v.length === 3) return v as number[];
	}
	return undefined;
}

function num(inst: RbxInstance, name: string, fallback: number): number {
	const v = inst.props.get(name)?.value;
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bytes(inst: RbxInstance, name: string): Uint8Array | undefined {
	const v = inst.props.get(name)?.value;
	return v instanceof Uint8Array && v.length > 0 ? v : undefined;
}

/** The SolidModel asset a union's AssetId names, or none. */
export function unionAssetOf(union: RbxInstance): string | undefined {
	return assetIdOf((stringProp(union, "AssetId") ?? "").trim());
}

/** A union's ChildData, where the union itself holds it, read as a model's roots. */
function inlineChildData(union: RbxInstance): RbxInstance[] | undefined {
	const data = bytes(union, "ChildData") ?? bytes(union, "ChildData2");
	if (!data) return undefined;
	try {
		return readRbx(data).roots;
	} catch {
		return undefined;
	}
}

/**
 * The parts a SolidModel asset's union was made from: its PartOperationAsset's
 * ChildData, read as a model's roots. None for anything else.
 */
export function childDataOf(asset: Uint8Array): RbxInstance[] | undefined {
	try {
		const holder = readRbx(asset).roots.find((r) => r.className === "PartOperationAsset");
		return holder && inlineChildData(holder);
	} catch {
		return undefined;
	}
}

/**
 * The SolidModel assets the unions and NegateOperations inside a ChildData
 * name, which drawing it needs too, as do those inside one held inline.
 */
export function nestedUnionAssets(roots: readonly RbxInstance[]): string[] {
	const out: string[] = [];
	const visit = (inst: RbxInstance) => {
		if (inst.className === "IntersectOperation") return;
		if (inst.className === "UnionOperation" || inst.className === "NegateOperation") {
			const own = inlineChildData(inst);
			if (own) for (const root of own) visit(root);
			else {
				const asset = unionAssetOf(inst);
				if (asset) out.push(asset);
			}
			return;
		}
		for (const child of inst.children) visit(child);
	};
	for (const root of roots) visit(root);
	return out;
}

/** `frame` (a union or part's CFrame) times diag(`scale`), as an affine map. */
function affineOf(cf: { position: number[]; rotation: number[] }, scale: number[]): Affine {
	const r = cf.rotation;
	return {
		m: Array.from({ length: 9 }, (_, n) => r[n] * scale[n % 3]),
		p: [...cf.position],
	};
}

/** `a` then `b`: `b`'s points mapped by `a`. */
function then(a: Affine, b: Affine): Affine {
	const m = Array.from({ length: 9 }, (_, n) => {
		const i = Math.floor(n / 3);
		const j = n % 3;
		return a.m[i * 3] * b.m[j] + a.m[i * 3 + 1] * b.m[3 + j] + a.m[i * 3 + 2] * b.m[6 + j];
	});
	return { m, p: apply(a, b.p) };
}

function turn(m: number[], v: ArrayLike<number>, at = 0): number[] {
	return [0, 1, 2].map(
		(i) => m[i * 3] * v[at] + m[i * 3 + 1] * v[at + 1] + m[i * 3 + 2] * v[at + 2],
	);
}

function apply(a: Affine, v: ArrayLike<number>, at = 0): number[] {
	return turn(a.m, v, at).map((x, i) => x + a.p[i]);
}

/** How much a union has been stretched since it was made: Size / InitialSize, 1 where either is missing. */
function stretchOf(union: RbxInstance): number[] {
	const size = vec3(union, "size", "Size");
	const initial = vec3(union, "InitialSize");
	if (!size || !initial) return [1, 1, 1];
	return size.map((s, a) =>
		initial[a] > 1e-6 && Number.isFinite(s / initial[a]) ? s / initial[a] : 1,
	);
}

/** A union's paint, from its own properties. */
function paintOf(union: RbxInstance): UnionPaint {
	return {
		rgb: vec3(union, "Color3uint8") ?? [163, 162, 165],
		material: num(union, "Material", 256),
		transparency: Math.max(0, Math.min(1, num(union, "Transparency", 0))),
		reflectance: num(union, "Reflectance", 0),
		usePartColor: union.props.get("UsePartColor")?.value === true,
	};
}

/**
 * A union as the scene names it, or none: one not drawn at all, fully
 * transparent, or with no CFrame or size. `asset` is the key its ChildData
 * is found by.
 */
export function sceneUnion(union: RbxInstance, id: number, asset: string): SceneUnion | undefined {
	const cf = union.props.get("CFrame")?.value as
		| { position: number[]; rotation: number[] }
		| undefined;
	const size = vec3(union, "size", "Size");
	if (!cf || !size) return undefined;
	const paint = paintOf(union);
	if (paint.transparency >= 0.999) return undefined;
	const { m, p } = affineOf(cf, stretchOf(union));
	const r = cf.rotation;
	const box = [0, 1, 2].flatMap((j) => [r[j] * size[j], r[3 + j] * size[j], r[6 + j] * size[j]]);
	return { id, asset, frame: [...m, ...p], box: [...box, ...cf.position], paint };
}

/** A union's outline before its parts are here, and after: its own box, as a row. */
export function unionOutline(union: SceneUnion): Float32Array {
	return instanceData([...union.box, 0xffffffff, union.id, 0]);
}

/** What drawing unions adds to a scene. */
interface Added {
	solid: Record<SceneKind, Float32Array[]>;
	seeThrough: Record<SceneKind, Float32Array[]>;
	meshes: SceneMesh[];
	meshSlots: Map<string, number>;
	/** The faces each union's rows keep, by the rows' shapes and their tree: copies of one union are worked out once. */
	kept: Map<string, { faces?: (SealedFace[] | CutFace[] | null)[]; missed: boolean }>;
}

/** A ChildData drawn: what it adds less what it takes, its rows named by their numbers from `leaves`. */
interface Drawn {
	add: CsgNode[];
	take: CsgNode[];
	/** Something in it could not be drawn: an IntersectOperation, or a NegateOperation whose shape is not here. */
	missing: boolean;
}

/**
 * One union's ChildData drawn into `added`: its parts as rows, each mapped by
 * `at`, each named in its id by a number of its own from `leaves`, and the
 * tree of what is added and taken that those numbers make.
 */
function drawChildData(
	roots: readonly RbxInstance[],
	at: Affine,
	paint: UnionPaint,
	ownColours: boolean,
	leaves: { next: number },
	models: ReadonlyMap<string, readonly RbxInstance[]>,
	added: Added,
	depth: number,
): Drawn {
	const drawn: Drawn = { add: [], take: [], missing: false };
	const level: RbxInstance[] = [];
	const leafOf = new Map<RbxInstance, number>();
	const visit = (inst: RbxInstance) => {
		if (inst.className === "IntersectOperation") {
			drawn.missing = true;
			return;
		}
		if (inst.className === "UnionOperation" || inst.className === "NegateOperation") {
			// A union inside, or what is taken away: its own ChildData, in its own
			// frame inside this one.
			const negate = inst.className === "NegateOperation";
			const inner = inlineChildData(inst) ?? models.get(unionAssetOf(inst) ?? "");
			const cf = inst.props.get("CFrame")?.value as
				| { position: number[]; rotation: number[] }
				| undefined;
			if (!inner || !cf || depth > 8) {
				if (negate) drawn.missing = true;
				return;
			}
			// Where this level keeps its own colours, the inner union is one part
			// among them: in its own Color, or each of its parts in theirs.
			const own = ownColours && inst.props.get("UsePartColor")?.value !== true;
			const innerPaint = ownColours
				? { ...paint, rgb: vec3(inst, "Color3uint8") ?? paint.rgb }
				: paint;
			const got = drawChildData(
				inner,
				then(at, affineOf(cf, stretchOf(inst))),
				innerPaint,
				own,
				leaves,
				models,
				added,
				depth + 1,
			);
			if (got.missing) drawn.missing = true;
			const node: CsgNode = { add: got.add, take: got.take };
			if (!negate) drawn.add.push(...(got.take.length === 0 ? got.add : [node]));
			// A NegateOperation of NegateOperations adds back what they take.
			else if (got.add.length === 0) drawn.add.push(...got.take);
			else drawn.take.push(node);
			return;
		}
		if (DRAWN.has(inst.className)) {
			const part = painted(inst, paint, ownColours);
			const leaf = leaves.next++;
			leafOf.set(part, leaf);
			drawn.add.push(leaf);
			level.push(part);
		} else for (const child of inst.children) visit(child);
	};
	for (const root of roots) visit(root);
	if (level.length === 0) return drawn;

	const workspace: RbxInstance = {
		className: "Workspace",
		name: "Workspace",
		parent: null,
		children: level,
		props: new Map(),
		service: true,
	};
	const scene = buildPlaceScene(workspace, (inst) => leafOf.get(inst));
	// Each of this level's meshes, by its slot in the scene being added to.
	const slots = (scene.meshes ?? []).map((mesh) => {
		const key = JSON.stringify(mesh);
		let slot = added.meshSlots.get(key);
		if (slot === undefined) {
			slot = added.meshes.length;
			added.meshSlots.set(key, slot);
			added.meshes.push(mesh);
		}
		return slot;
	});
	for (const [from, to] of [
		[scene.kinds, added.solid],
		[scene.translucent, added.seeThrough],
	] as const)
		for (const kind of SCENE_KINDS) {
			const { data, count } = from[kind];
			if (count === 0) continue;
			const out = mapRows(data.slice(0, count * SCENE_STRIDE), at);
			const words = new Uint32Array(out.buffer);
			for (let i = 0; i < count; i++) {
				const o = i * SCENE_STRIDE;
				const look = words[o + 14];
				// The slot's 15 bits; the top bit is NO_SHADOW, kept as it was.
				const mesh = (look >>> 16) & 0x7fff;
				if (mesh > 0) words[o + 14] = ((look & 0x8000ffff) | ((slots[mesh - 1] + 1) << 16)) >>> 0;
			}
			to[kind].push(out);
		}
	return drawn;
}

/** Rows moved by `at`, in place: their axes turned and their middles mapped. */
function mapRows(rows: Float32Array, at: Affine): Float32Array {
	for (let o = 0; o < rows.length; o += SCENE_STRIDE) {
		const axes = [0, 1, 2].flatMap((j) => turn(at.m, rows, o + j * 3));
		const p = apply(at, rows, o + 9);
		rows.set(axes, o);
		rows.set(p, o + 9);
	}
	return rows;
}

const IDENTITY: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0] };

/** A 3x3's inverse, row-major, or none. */
function inverse(m: number[]): number[] | undefined {
	const [a, b, c, d, e, f, g, h, i] = m;
	const A = e * i - f * h;
	const B = f * g - d * i;
	const C = d * h - e * g;
	const det = a * A + b * B + c * C;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined;
	return [
		A / det,
		(c * h - b * i) / det,
		(b * f - c * e) / det,
		B / det,
		(a * i - c * g) / det,
		(c * d - a * f) / det,
		C / det,
		(b * g - a * h) / det,
		(a * e - b * d) / det,
	];
}

const fine = (v: number) => Math.round(v * 1e7) / 1e7 + 0;

/** `node` with each of its rows' numbers from `leaves` as its place in `rows`; rows not drawn are left out. */
function byRow(node: CsgNode, place: ReadonlyMap<number, number>): CsgNode | undefined {
	if (typeof node === "number") return place.get(node);
	const add = node.add.flatMap((n) => byRow(n, place) ?? []);
	const take = node.take.flatMap((n) => byRow(n, place) ?? []);
	return { add, take };
}

/**
 * One union's rows, in its own space as ChildData has them, into `added` in
 * the world, made of what `tree` adds less what it takes. Where its parts meet
 * or are cut (see `seams.ts` and `csg.ts`), they are drawn as one shape a
 * colour, a mesh of the faces they keep, whose row is the union's own box;
 * the rest are its parts' rows, moved by its frame. Answers whether a cut
 * could not be made.
 */
function sealInto(local: Added, use: SceneUnion, added: Added, tree: CsgNode): boolean {
	const at: Affine = { m: use.frame.slice(0, 9), p: use.frame.slice(9, 12) };
	const rows: { set: "solid" | "seeThrough"; kind: SceneKind; row: Float32Array }[] = [];
	for (const set of ["solid", "seeThrough"] as const)
		for (const kind of SCENE_KINDS)
			for (const chunk of local[set][kind])
				for (let o = 0; o < chunk.length; o += SCENE_STRIDE)
					rows.push({ set, kind, row: chunk.subarray(o, o + SCENE_STRIDE) });
	// Each row's number from `leaves`, in its id, and the union's id there instead.
	const place = new Map<number, number>();
	rows.forEach(({ row }, r) => {
		const words = new Uint32Array(row.buffer, row.byteOffset, SCENE_STRIDE);
		place.set(words[13], r);
		words[13] = use.id;
	});
	const ours = byRow(tree, place) ?? { add: [], take: [] };
	// Drawn as they are when nothing can be cut: what is added, and nothing taken.
	const shown = addedRows(ours);
	const plain = (r: number) => {
		const { set, kind, row } = rows[r];
		if (shown.has(r)) added[set][kind].push(mapRows(row.slice(), at));
	};
	// The box's axes are its columns; as a row-major 3x3.
	const unbox = inverse(
		Array.from({ length: 9 }, (_, n) => use.box[(n % 3) * 3 + Math.floor(n / 3)]),
	);
	// From the union's own space to its box's unit space, where the mesh is made.
	const toUnit = unbox && {
		m: then({ m: unbox, p: [0, 0, 0] }, { m: at.m, p: [0, 0, 0] }).m,
		p: turn(
			unbox,
			[0, 1, 2].map((k) => at.p[k] - use.box[9 + k]),
		),
	};
	const normals = toUnit && inverse(toUnit.m);
	// A row's look holds a mesh's slot in 15 bits.
	const room = added.meshes.length + rows.length < 0x7fff;
	const cuts = takes(ours);
	let faces: (SealedFace[] | CutFace[] | null)[] | undefined;
	let missed = cuts;
	if (toUnit && normals && room) {
		// The faces are the rows' shapes', whatever their colours.
		const key = `${JSON.stringify(ours)} ${rows.map(({ kind, row }) => `${kind} ${new Uint32Array(row.buffer, row.byteOffset, 12).join()}`).join(" ")}`;
		let got = added.kept.get(key);
		if (!got) {
			if (!cuts) got = { faces: sealedFaces(rows), missed: false };
			else {
				const cut = cutFaces(rows, ours);
				// A row taken away that is no solid is a cut not made.
				const missing = cut.faces.some((f, r) => f === null && !shown.has(r));
				got = { faces: cut.changed ? cut.faces : undefined, missed: missing };
			}
			added.kept.set(key, got);
		}
		faces = got.faces;
		missed = got.missed;
	}
	if (!toUnit || !normals || !faces) {
		for (let r = 0; r < rows.length; r++) plain(r);
		return missed;
	}
	// Each colour and look's faces, as one mesh.
	const groups = new Map<
		string,
		{ set: "solid" | "seeThrough"; colour: number; look: number; v: number[]; i: number[] }
	>();
	rows.forEach(({ set, row }, r) => {
		const kept = faces[r];
		if (!kept) {
			plain(r);
			return;
		}
		const words = new Uint32Array(row.buffer, row.byteOffset, SCENE_STRIDE);
		const key = `${set} ${words[12]} ${words[14]}`;
		let group = groups.get(key);
		if (!group) {
			group = { set, colour: words[12], look: words[14], v: [], i: [] };
			groups.set(key, group);
		}
		// Normals turn by the inverse's transpose.
		const unit = (v: ArrayLike<number>) => {
			const n = [0, 1, 2].map(
				(k) => normals[k] * v[0] + normals[3 + k] * v[1] + normals[6 + k] * v[2],
			);
			const length = Math.hypot(n[0], n[1], n[2]) || 1;
			return n.map((x) => fine(x / length));
		};
		for (const face of kept as CutFace[]) {
			const flat = unit(face.n);
			const base = group.v.length / 6;
			face.points.forEach((p, k) => {
				const round = face.normals?.[k];
				group.v.push(...apply(toUnit, p).map(fine), ...(round ? unit(round) : flat));
			});
			for (let k = 1; k < face.points.length - 1; k++) group.i.push(base, base + k, base + k + 1);
		}
	});
	for (const group of groups.values()) {
		if (group.i.length === 0) continue;
		const mesh: SceneMesh = { asset: "", made: { vertices: group.v, indices: group.i } };
		const key = JSON.stringify(mesh);
		let slot = added.meshSlots.get(key);
		if (slot === undefined) {
			slot = added.meshes.length;
			added.meshSlots.set(key, slot);
			added.meshes.push(mesh);
		}
		const look = ((group.look & 0x8000ffff) | ((slot + 1) << 16)) >>> 0;
		added[group.set].mesh.push(instanceData([...use.box, group.colour, use.id, look]));
	}
	return missed;
}

/**
 * A ChildData part as the union paints it: a copy with the union's Material,
 * Transparency and Reflectance, and its Color unless it keeps its own. A part
 * from an older file holds only a BrickColor, which takes the union's Color.
 * Of what is inside it, only its mesh modifier: Decals do not survive a union.
 */
function painted(part: RbxInstance, paint: UnionPaint, ownColours: boolean): RbxInstance {
	const props = new Map(part.props);
	props.set("Transparency", { type: "Float32", value: paint.transparency });
	props.set("Material", { type: "Enum", value: paint.material });
	props.set("Reflectance", { type: "Float32", value: paint.reflectance });
	props.delete("PivotOffset");
	if (!ownColours || !vec3(part, "Color3uint8"))
		props.set("Color3uint8", { type: "Color3uint8", value: paint.rgb });
	return {
		...part,
		parent: null,
		props,
		children: part.children.filter((c) => MODIFIERS.has(c.className)),
	};
}

/** The SolidModel assets a scene's unions still wait for. */
export function unionsWaiting(scene: PlaceScene): string[] {
	const drawn = new Set(scene.unionsDrawn ?? []);
	return [
		...new Set(
			(scene.unions ?? [])
				.filter((use) => !drawn.has(use.id) && !use.asset.startsWith(INLINE))
				.map((use) => use.asset),
		),
	];
}

/**
 * `scene` with each union in `scene.unions` not drawn yet, whose ChildData is
 * in `models` by the key the union names it by, drawn and added to
 * `unionsDrawn`. The same scene back when there is none.
 */
export function addUnions<T extends PlaceScene>(
	scene: T,
	models: ReadonlyMap<string, readonly RbxInstance[]>,
): T {
	const done = new Set(scene.unionsDrawn ?? []);
	const ready = (scene.unions ?? []).filter((use) => !done.has(use.id) && models.has(use.asset));
	if (ready.length === 0) return scene;
	const meshes = [...(scene.meshes ?? [])];
	const added: Added = {
		solid: Object.fromEntries(SCENE_KINDS.map((k) => [k, []])) as unknown as Added["solid"],
		seeThrough: Object.fromEntries(SCENE_KINDS.map((k) => [k, []])) as unknown as Added["solid"],
		meshes,
		meshSlots: new Map(meshes.map((mesh, slot) => [JSON.stringify(mesh), slot])),
		kept: new Map(),
	};
	const cuts = [...(scene.unionCuts ?? [])];
	const empty = () =>
		Object.fromEntries(SCENE_KINDS.map((k) => [k, []])) as unknown as Added["solid"];
	for (const use of ready) {
		const roots = models.get(use.asset) ?? [];
		// Its parts in its own space first, to be made one surface there.
		const local: Added = { ...added, solid: empty(), seeThrough: empty() };
		const paint = use.paint;
		const leaves = { next: 0 };
		const drawn = drawChildData(
			roots,
			IDENTITY,
			paint,
			!paint.usePartColor,
			leaves,
			models,
			local,
			0,
		);
		const tree: CsgNode = { add: drawn.add, take: drawn.take };
		if (sealInto(local, use, added, tree) || drawn.missing) cuts.push(use.id);
	}
	const join = (
		from: PlaceScene["kinds"],
		more: Record<SceneKind, Float32Array[]>,
	): PlaceScene["kinds"] => {
		const out = {} as PlaceScene["kinds"];
		for (const kind of SCENE_KINDS) {
			const parts = [from[kind].data.subarray(0, from[kind].count * SCENE_STRIDE), ...more[kind]];
			const data = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
			let at = 0;
			for (const p of parts) {
				data.set(p, at);
				at += p.length;
			}
			out[kind] = { data, count: data.length / SCENE_STRIDE };
		}
		return out;
	};
	return {
		...scene,
		kinds: join(scene.kinds, added.solid),
		translucent: join(scene.translucent, added.seeThrough),
		...(meshes.length > 0 ? { meshes } : {}),
		unionsDrawn: [...done, ...ready.map((use) => use.id)],
		unionCuts: cuts,
	};
}

/**
 * The unions under `workspace` added to its scene, each listed in `unions`:
 * those that hold their own ChildData drawn now, and those whose AssetId
 * names a SolidModel left for the editor to draw once Sign in with Roblox has
 * downloaded it (`unionsWaiting`). Until then those are not drawn, as before.
 */
export function withUnions(
	scene: PlaceScene,
	workspace: RbxInstance | undefined,
	idOf: (inst: RbxInstance) => number | undefined,
): PlaceScene {
	const uses: SceneUnion[] = [];
	const inline = new Map<string, readonly RbxInstance[]>();
	let transparent = 0;
	const visit = (inst: RbxInstance) => {
		for (const child of inst.children) visit(child);
		if (inst.className !== "UnionOperation") return;
		const id = idOf(inst);
		if (id === undefined) return;
		if (num(inst, "Transparency", 0) >= 0.999) {
			transparent++;
			return;
		}
		const own = inlineChildData(inst);
		const asset = own ? `${INLINE}${id}` : unionAssetOf(inst);
		if (!asset) return;
		const use = sceneUnion(inst, id, asset);
		if (!use) return;
		uses.push(use);
		if (own) inline.set(asset, own);
	};
	if (workspace) visit(workspace);
	if (uses.length === 0 && transparent === 0) return scene;
	const named = { ...scene, transparent: scene.transparent + transparent };
	return uses.length > 0 ? addUnions({ ...named, unions: uses }, inline) : named;
}
