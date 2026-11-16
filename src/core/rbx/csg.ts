/**
 * What a union takes away: its parts, added and taken, drawn as one surface.
 *
 * A union's ChildData is a tree. At each level, what the parts and the unions
 * inside add, less what its NegateOperations take: a NegateOperation holds
 * the shape it takes away as a union holds its parts, and one that holds only
 * NegateOperations adds what they would take. Each part is a convex solid:
 * blocks, wedges and corner wedges as `seams.ts` has them, and cylinders and
 * balls as the polygons the renderers draw for them.
 *
 * The surface is found face by face. Each face of each part is cut along the
 * faces of every part it reaches into, into convex pieces that each lie wholly
 * inside or outside that part. A piece then lies wholly inside or outside the
 * union just in front of it and just behind it, which the tree says from the
 * parts each side is in; where the two differ the piece is part of the
 * surface, facing out of the union. So a part's face is kept where nothing is
 * against it or takes it away, and a face of what is taken away is kept,
 * turned inward, where it lies inside what is added: the walls of a hole, or
 * the face of a cut. A piece lying on the face of an earlier part is that
 * part's to keep, so two faces never draw in one place.
 */

import { SCENE_STRIDE, type SceneKind } from "./scene.js";
import {
	area,
	below,
	dot,
	flip,
	NEAR,
	overlaps,
	type SealedFace,
	type Solid,
	solidFrom,
	UNIT_FACES,
	type V,
} from "./seams.js";

/** A union's tree: a row, or what a level adds less what it takes. */
export type CsgNode = number | { add: CsgNode[]; take: CsgNode[] };

/** A face the surface keeps, with each corner's normal where the part is round. */
export interface CutFace extends SealedFace {
	normals?: V[];
}

const h = 0.5;

/** The cylinder `geometry.ts` draws: 32 sides along X, then its two caps. */
function unitCylinder(segments = 32): V[][] {
	const ring = (i: number): [number, number] => {
		const a = (i / segments) * Math.PI * 2;
		return [Math.cos(a) * h, Math.sin(a) * h];
	};
	const faces: V[][] = [];
	const capR: V[] = [];
	const capL: V[] = [];
	for (let i = 0; i < segments; i++) {
		const [y0, z0] = ring(i);
		const [y1, z1] = ring(i + 1);
		faces.push([
			[-h, y0, z0],
			[-h, y1, z1],
			[h, y1, z1],
			[h, y0, z0],
		]);
		capR.push([h, y0, z0]);
		capL.unshift([-h, y0, z0]);
	}
	faces.push(capR, capL);
	return faces;
}

/** The ball `geometry.ts` draws: ten rings of sixteen. */
function unitBall(rings = 10, segments = 16): V[][] {
	const at = (r: number, s: number): V => {
		const t = (r / rings) * Math.PI;
		const p = (s / segments) * Math.PI * 2;
		return [Math.sin(t) * Math.cos(p) * h, Math.cos(t) * h, Math.sin(t) * Math.sin(p) * h];
	};
	const faces: V[][] = [];
	for (let r = 0; r < rings; r++)
		for (let s = 0; s < segments; s++) {
			const a = at(r, s);
			const b = at(r, s + 1);
			const c = at(r + 1, s + 1);
			const d = at(r + 1, s);
			if (r === 0) faces.push([a, c, d]);
			else if (r === rings - 1) faces.push([a, b, d]);
			else faces.push([a, b, c, d]);
		}
	return faces;
}

const CYLINDER = unitCylinder();
const BALL = unitBall();

/** A row's part as a solid, and how to find the normal at a point of a round face. */
interface Part {
	solid: Solid;
	/** Each face's normal at a point, for a round face; none for a flat one. */
	round?: (face: number, p: V) => V | undefined;
}

/** A 3x3's inverse, column-major as a row holds its axes, or none. */
function inverse(m: ArrayLike<number>): number[] | undefined {
	const [a, d, g, b, e, hh, c, f, i] = Array.from({ length: 9 }, (_, k) => m[k]);
	// Rows of M: [a b c], [d e f], [g h i]; the row holds M's columns.
	const A = e * i - f * hh;
	const B = f * g - d * i;
	const C = d * hh - e * g;
	const det = a * A + b * B + c * C;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined;
	// Row-major inverse.
	return [
		A / det,
		(c * hh - b * i) / det,
		(b * f - c * e) / det,
		B / det,
		(a * i - c * g) / det,
		(c * d - a * f) / det,
		C / det,
		(b * g - a * hh) / det,
		(a * e - b * d) / det,
	];
}

function partOf(kind: SceneKind, row: ArrayLike<number>): Part | undefined {
	if (row.length < SCENE_STRIDE - 3) return undefined;
	const unit = kind === "cylinder" ? CYLINDER : kind === "ball" ? BALL : UNIT_FACES[kind];
	if (!unit) return undefined;
	const solid = solidFrom(unit, row);
	if (!solid) return undefined;
	if (kind !== "cylinder" && kind !== "ball") return { solid };
	const inv = inverse(row);
	if (!inv) return undefined;
	const sides = kind === "cylinder" ? unit.length - 2 : unit.length;
	return {
		solid,
		round: (face, p) => {
			if (face >= sides) return undefined;
			const q = [p[0] - row[9], p[1] - row[10], p[2] - row[11]];
			const u = [0, 1, 2].map(
				(k) => inv[k * 3] * q[0] + inv[k * 3 + 1] * q[1] + inv[k * 3 + 2] * q[2],
			);
			if (kind === "cylinder") u[0] = 0;
			// Normals turn by the inverse's transpose.
			const n = [0, 1, 2].map((k) => inv[k] * u[0] + inv[3 + k] * u[1] + inv[6 + k] * u[2]) as V;
			const length = Math.hypot(n[0], n[1], n[2]);
			return length > 1e-12 ? (n.map((v) => v / length) as V) : undefined;
		},
	};
}

/**
 * Where a piece of a face is, part by part: in a part on both sides of the
 * face (3), only behind it (1: the part has a face there, facing the same
 * way), or only in front (2: one facing the other way). Not there: in neither.
 */
type Where = Map<number, number>;

interface Piece {
	points: V[];
	where: Where;
}

/** `piece` of `face`, cut into pieces each wholly inside or outside part `j`. */
function split(piece: Piece, face: SealedFace, solid: Solid, j: number): Piece[] {
	let sides = 3;
	const cuts: SealedFace[] = [];
	for (const f of solid.faces) {
		const facing = dot(f.n, face.n);
		if (
			Math.abs(facing) > 1 - 1e-6 &&
			piece.points.every((p) => Math.abs(dot(f.n, p) - f.d) < NEAR)
		) {
			sides &= facing > 0 ? 1 : 2;
			continue;
		}
		cuts.push(f);
	}
	if (sides === 0) return [piece];
	// Whether the piece reaches into the part at all, by more than a hair.
	let inside: V[] | undefined = piece.points;
	for (const f of cuts) {
		inside = below(inside, f.n, f.d - NEAR);
		if (!inside) return [piece];
	}
	const out: Piece[] = [];
	let rest: V[] = piece.points;
	for (const f of cuts) {
		let most = -Infinity;
		let least = Infinity;
		for (const p of rest) {
			const r = dot(f.n, p) - f.d;
			if (r > most) most = r;
			if (r < least) least = r;
		}
		if (most <= NEAR / 2) continue;
		if (least >= -NEAR / 2) {
			out.push({ points: rest, where: piece.where });
			return out;
		}
		const outer = below(rest, flip(f.n), -f.d);
		const inner = below(rest, f.n, f.d);
		if (outer) out.push({ points: outer, where: piece.where });
		if (!inner) return out;
		rest = inner;
	}
	out.push({ points: rest, where: new Map(piece.where).set(j, sides) });
	return out;
}

/** Whether `node` holds the point a part's membership says. */
function holds(node: CsgNode, inPart: (row: number) => boolean): boolean {
	if (typeof node === "number") return inPart(node);
	return node.add.some((n) => holds(n, inPart)) && !node.take.some((n) => holds(n, inPart));
}

/** The rows `node` adds, never under anything taken away: those drawn as they are when nothing can be cut. */
export function addedRows(node: CsgNode, out = new Set<number>()): Set<number> {
	if (typeof node === "number") out.add(node);
	else for (const n of node.add) addedRows(n, out);
	return out;
}

/** Whether anything in `node` is taken away. */
export function takes(node: CsgNode): boolean {
	return typeof node !== "number" && (node.take.length > 0 || node.add.some(takes));
}

function rowsIn(node: CsgNode, out = new Set<number>()): Set<number> {
	if (typeof node === "number") out.add(node);
	else for (const n of [...node.add, ...node.take]) rowsIn(n, out);
	return out;
}

const pieceBox = (points: readonly V[]): Solid => {
	const min: V = [Infinity, Infinity, Infinity];
	const max: V = [-Infinity, -Infinity, -Infinity];
	for (const p of points)
		for (let k = 0; k < 3; k++) {
			if (p[k] < min[k]) min[k] = p[k];
			if (p[k] > max[k]) max[k] = p[k];
		}
	return { faces: [], min, max };
};

/**
 * The faces each of a union's rows keeps of `tree`'s surface, as convex
 * pieces in the rows' own space; null for a row that is no solid (a mesh).
 * `changed` is false when the rows `tree` adds keep every face whole and
 * nothing else shows, so they can be drawn as they are.
 */
export function cutFaces(
	rows: readonly { kind: SceneKind; row: ArrayLike<number> }[],
	tree: CsgNode,
): { faces: (CutFace[] | null)[]; changed: boolean } {
	const used = rowsIn(tree);
	const added = addedRows(tree);
	const parts = rows.map(({ kind, row }, i) => (used.has(i) ? partOf(kind, row) : undefined));
	let changed = false;
	const faces = parts.map((part, i) => {
		if (!part) return null;
		const { solid } = part;
		const near = parts.flatMap((other, j) =>
			j !== i && other && overlaps(solid, other.solid) ? [j] : [],
		);
		const kept: CutFace[] = [];
		solid.faces.forEach((face, f) => {
			let pieces: Piece[] = [{ points: face.points, where: new Map() }];
			const box = pieceBox(face.points);
			for (const j of near) {
				const other = (parts[j] as Part).solid;
				if (!overlaps(box, other)) continue;
				pieces = pieces.flatMap((p) => split(p, face, other, j));
			}
			let whole = false;
			for (const { points, where } of pieces) {
				const behind = holds(tree, (r) => r === i || ((where.get(r) ?? 0) & 1) !== 0);
				const front = holds(tree, (r) => r !== i && ((where.get(r) ?? 0) & 2) !== 0);
				if (behind === front) continue;
				// On an earlier part's face: that part's to keep.
				let theirs = false;
				for (const [r, sides] of where)
					if (r < i && sides !== 3) {
						theirs = true;
						break;
					}
				if (theirs || area(points) <= 1e-9) continue;
				if (behind) {
					if (points === face.points) whole = true;
					const normals = part.round && points.map((p) => part.round?.(f, p));
					kept.push({
						points,
						n: face.n,
						d: face.d,
						...(normals?.every(Boolean) ? { normals: normals as V[] } : {}),
					});
				} else {
					const turned = [...points].reverse();
					const normals = part.round && turned.map((p) => part.round?.(f, p));
					kept.push({
						points: turned,
						n: flip(face.n),
						d: -face.d,
						...(normals?.every(Boolean) ? { normals: (normals as V[]).map(flip) } : {}),
					});
				}
			}
			if (added.has(i) && !whole) changed = true;
		});
		if (!added.has(i) && kept.length > 0) changed = true;
		return kept;
	});
	return { faces, changed };
}
