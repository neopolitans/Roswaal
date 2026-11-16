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
 * UsePartColor is on, else each in its own. What a union takes away (its
 * NegateOperations) and an IntersectOperation's overlap would need our own
 * CSG: until then a NegateOperation is left out, so the union is drawn
 * without the cut, and listed in `unionCuts`. An IntersectOperation is not
 * drawn, as the parts it was made from would draw more than it is.
 */

import { assetIdOf } from "./browse.js";
import { type RbxInstance, stringProp } from "./dom.js";
import { readRbx } from "./index.js";
import {
	buildPlaceScene,
	instanceData,
	type PlaceScene,
	SCENE_KINDS,
	SCENE_STRIDE,
	type SceneKind,
	type SceneMesh,
} from "./scene.js";

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

/** The SolidModel assets the unions inside a ChildData name, which drawing it needs too. */
export function nestedUnionAssets(roots: readonly RbxInstance[]): string[] {
	const out: string[] = [];
	const visit = (inst: RbxInstance) => {
		if (inst.className === "UnionOperation" && !inlineChildData(inst)) {
			const asset = unionAssetOf(inst);
			if (asset) out.push(asset);
			return;
		}
		if (inst.className === "NegateOperation" || inst.className === "IntersectOperation") return;
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
}

/**
 * One union's ChildData drawn into `added`: its parts as rows with the
 * union's `id`, each mapped by `at`. Answers whether anything was left out
 * for want of our own CSG.
 */
function drawChildData(
	roots: readonly RbxInstance[],
	at: Affine,
	paint: UnionPaint,
	ownColours: boolean,
	id: number,
	models: ReadonlyMap<string, readonly RbxInstance[]>,
	added: Added,
	depth: number,
): boolean {
	let cut = false;
	const level: RbxInstance[] = [];
	const visit = (inst: RbxInstance) => {
		if (inst.className === "NegateOperation" || inst.className === "IntersectOperation") {
			cut = true;
			return;
		}
		if (inst.className === "UnionOperation") {
			// A union inside: its own ChildData, in its own frame inside this one.
			const inner = inlineChildData(inst) ?? models.get(unionAssetOf(inst) ?? "");
			const cf = inst.props.get("CFrame")?.value as
				| { position: number[]; rotation: number[] }
				| undefined;
			if (!inner || !cf || depth > 8) return;
			// Where this level keeps its own colours, the inner union is one part
			// among them: in its own Color, or each of its parts in theirs.
			const own = ownColours && inst.props.get("UsePartColor")?.value !== true;
			const innerPaint = ownColours
				? { ...paint, rgb: vec3(inst, "Color3uint8") ?? paint.rgb }
				: paint;
			cut =
				drawChildData(
					inner,
					then(at, affineOf(cf, stretchOf(inst))),
					innerPaint,
					own,
					id,
					models,
					added,
					depth + 1,
				) || cut;
			return;
		}
		if (DRAWN.has(inst.className)) level.push(painted(inst, paint, ownColours));
		else for (const child of inst.children) visit(child);
	};
	for (const root of roots) visit(root);
	if (level.length === 0) return cut;

	const workspace: RbxInstance = {
		className: "Workspace",
		name: "Workspace",
		parent: null,
		children: level,
		props: new Map(),
		service: true,
	};
	const scene = buildPlaceScene(workspace, () => id);
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
			const out = data.slice(0, count * SCENE_STRIDE);
			const words = new Uint32Array(out.buffer);
			for (let i = 0; i < count; i++) {
				const o = i * SCENE_STRIDE;
				const axes = [0, 1, 2].flatMap((j) => turn(at.m, out, o + j * 3));
				const p = apply(at, out, o + 9);
				out.set(axes, o);
				out.set(p, o + 9);
				const look = words[o + 14];
				// The slot's 15 bits; the top bit is NO_SHADOW, kept as it was.
				const mesh = (look >>> 16) & 0x7fff;
				if (mesh > 0) words[o + 14] = ((look & 0x8000ffff) | ((slots[mesh - 1] + 1) << 16)) >>> 0;
			}
			to[kind].push(out);
		}
	return cut;
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
	};
	const cuts = [...(scene.unionCuts ?? [])];
	for (const use of ready) {
		const at = { m: use.frame.slice(0, 9), p: use.frame.slice(9, 12) };
		const roots = models.get(use.asset) ?? [];
		if (drawChildData(roots, at, use.paint, !use.paint.usePartColor, use.id, models, added, 0))
			cuts.push(use.id);
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
