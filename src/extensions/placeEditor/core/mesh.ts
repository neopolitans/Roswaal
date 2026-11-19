/**
 * Roblox's mesh files (FileMesh), as a MeshPart or a SpecialMesh names them,
 * read into the triangles the place editor draws: positions, normals,
 * texture coordinates and faces, the full-detail level only.
 *
 * Written for Roswaal from the community's unofficial specification of the
 * format, "Roblox Mesh Format" on the Roblox Developer Forum (topic 326114,
 * revised 30 March 2025); see the Attributions page. Versions 1.00 to 6.00 are
 * read. 7.00 keeps its triangles in a Draco stream, which is not read: those
 * meshes stay boxes, as does anything that cannot be read.
 *
 * Every number in the binary versions is little-endian.
 */

export class MeshError extends Error {}

export interface FileMesh {
	/** "1.00" to "7.00", as the file's first line says. */
	version: string;
	/** x, y, z for each vertex, in studs as the mesh was made. */
	positions: Float32Array;
	/** x, y, z for each vertex: which way the surface faces there. */
	normals: Float32Array;
	/** u, v for each vertex, with v running down the image. */
	uvs: Float32Array;
	/** Three vertex indices a triangle. */
	indices: Uint32Array;
}

/** The bytes of one vertex in every binary version: position, normal, uv, tangent and colour. */
const VERTEX = 40;
/** The same without its colour, which some version 2.00 meshes leave out. */
const VERTEX_NO_COLOUR = 36;
const FACE = 12;
const BONE = 60;
const SUBSET = 72;
const SKINNING = 8;

export function readMesh(bytes: Uint8Array): FileMesh {
	const newline = bytes.indexOf(10);
	if (newline < 0 || newline > 16) throw new MeshError("not a mesh file: no version line");
	const header = new TextDecoder().decode(bytes.subarray(0, newline)).trim();
	const match = /^version (\d+\.\d+)$/.exec(header);
	if (!match) throw new MeshError(`not a mesh file: "${header.slice(0, 20)}"`);
	const version = match[1];
	const body = new Reader(bytes, newline + 1);
	switch (version) {
		case "1.00":
		case "1.01":
			return readText(version, bytes.subarray(newline + 1));
		case "2.00":
			return readV2(version, body);
		case "3.00":
		case "3.01":
			return readV3(version, body);
		case "4.00":
		case "4.01":
		case "5.00":
			return readV4(version, body);
		case "6.00":
		case "7.00":
			return readChunks(version, body);
		default:
			throw new MeshError(`mesh version ${version} is not one Roswaal reads`);
	}
}

/** Little-endian numbers from a byte array, checked against its end. */
class Reader {
	private view: DataView;
	constructor(
		readonly bytes: Uint8Array,
		public at: number,
	) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}
	need(n: number): void {
		if (this.at + n > this.bytes.length) throw new MeshError("the mesh file ends early");
	}
	u8(): number {
		this.need(1);
		return this.view.getUint8(this.at++);
	}
	u16(): number {
		this.need(2);
		const v = this.view.getUint16(this.at, true);
		this.at += 2;
		return v;
	}
	u32(): number {
		this.need(4);
		const v = this.view.getUint32(this.at, true);
		this.at += 4;
		return v;
	}
	f32(offset: number): number {
		return this.view.getFloat32(offset, true);
	}
	u32At(offset: number): number {
		return this.view.getUint32(offset, true);
	}
	skip(n: number): void {
		this.need(n);
		this.at += n;
	}
}

/** Version 1: three lines of text, nine bracketed triples a triangle, every vertex its own. */
function readText(version: string, rest: Uint8Array): FileMesh {
	const lines = new TextDecoder().decode(rest).split(/\r?\n/);
	const faces = Number.parseInt(lines[0] ?? "", 10);
	if (!Number.isFinite(faces) || faces < 0)
		throw new MeshError("a version 1 mesh with no face count");
	const triples = [...(lines[1] ?? "").matchAll(/\[([^\]]*)\]/g)].map((m) =>
		m[1].split(",").map((n) => Number.parseFloat(n)),
	);
	if (triples.length < faces * 9) throw new MeshError("a version 1 mesh with too few vertices");
	const count = faces * 3;
	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const uvs = new Float32Array(count * 2);
	// Version 1.00 is twice the size it should be; 1.01 is not.
	const scale = version === "1.00" ? 0.5 : 1;
	for (let v = 0; v < count; v++) {
		const [p, n, t] = [triples[v * 3], triples[v * 3 + 1], triples[v * 3 + 2]];
		for (let a = 0; a < 3; a++) {
			positions[v * 3 + a] = (p[a] ?? 0) * scale;
			normals[v * 3 + a] = n[a] ?? 0;
		}
		// Its v is upside down.
		uvs[v * 2] = t[0] ?? 0;
		uvs[v * 2 + 1] = 1 - (t[1] ?? 0);
	}
	return {
		version,
		positions,
		normals,
		uvs,
		indices: Uint32Array.from({ length: count }, (_, i) => i),
	};
}

/** `count` vertices of `size` bytes each, from where the reader is. */
function readVertices(r: Reader, count: number, size: number) {
	if (size !== VERTEX && size !== VERTEX_NO_COLOUR)
		throw new MeshError(`a vertex of ${size} bytes`);
	r.need(count * size);
	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const uvs = new Float32Array(count * 2);
	for (let v = 0; v < count; v++) {
		const at = r.at + v * size;
		for (let a = 0; a < 3; a++) {
			positions[v * 3 + a] = r.f32(at + a * 4);
			normals[v * 3 + a] = r.f32(at + 12 + a * 4);
		}
		uvs[v * 2] = r.f32(at + 24);
		uvs[v * 2 + 1] = r.f32(at + 28);
	}
	r.at += count * size;
	return { positions, normals, uvs };
}

/** `count` triangles, each three vertex indices below `vertices`. */
function readFaces(r: Reader, count: number, size: number, vertices: number): Uint32Array {
	if (size < FACE) throw new MeshError(`a face of ${size} bytes`);
	r.need(count * size);
	const indices = new Uint32Array(count * 3);
	for (let f = 0; f < count; f++) {
		for (let k = 0; k < 3; k++) {
			const index = r.u32At(r.at + f * size + k * 4);
			if (index >= vertices) throw new MeshError("a face names a vertex the mesh does not have");
			indices[f * 3 + k] = index;
		}
	}
	r.at += count * size;
	return indices;
}

/** The faces of the full-detail level: the first of the LOD ranges, or all of them. */
function fullDetail(indices: Uint32Array, lods: number[]): Uint32Array {
	const end = lods.length >= 2 ? lods[1] : indices.length / 3;
	return end > 0 && end * 3 < indices.length ? indices.subarray(0, end * 3) : indices;
}

function readV2(version: string, r: Reader): FileMesh {
	const start = r.at;
	const headerSize = r.u16();
	const vertexSize = r.u8();
	const faceSize = r.u8();
	const numVerts = r.u32();
	const numFaces = r.u32();
	r.at = start + headerSize;
	const vertices = readVertices(r, numVerts, vertexSize);
	const indices = readFaces(r, numFaces, faceSize, numVerts);
	return { version, ...vertices, indices };
}

function readV3(version: string, r: Reader): FileMesh {
	const start = r.at;
	const headerSize = r.u16();
	const vertexSize = r.u8();
	const faceSize = r.u8();
	r.u16(); // The size of a LOD offset: 4.
	const numLods = r.u16();
	const numVerts = r.u32();
	const numFaces = r.u32();
	r.at = start + headerSize;
	const vertices = readVertices(r, numVerts, vertexSize);
	const indices = readFaces(r, numFaces, faceSize, numVerts);
	const lods = Array.from({ length: numLods }, () => r.u32());
	return { version, ...vertices, indices: fullDetail(indices, lods) };
}

/** Versions 4 and 5: skinning, bones, names and subsets after the faces, read past. */
function readV4(version: string, r: Reader): FileMesh {
	const start = r.at;
	const headerSize = r.u16();
	r.u16(); // How its LODs were made.
	const numVerts = r.u32();
	const numFaces = r.u32();
	const numLods = r.u16();
	const numBones = r.u16();
	r.at = start + headerSize;
	const vertices = readVertices(r, numVerts, VERTEX);
	if (numBones > 0) r.skip(numVerts * SKINNING);
	const indices = readFaces(r, numFaces, FACE, numVerts);
	const lods = Array.from({ length: numLods }, () => r.u32());
	return { version, ...vertices, indices: fullDetail(indices, lods) };
}

/** Versions 6 and 7: named chunks to the end of the file; only COREMESH and LODS matter here. */
function readChunks(version: string, r: Reader): FileMesh {
	let core: Omit<FileMesh, "version"> | undefined;
	let lods: number[] = [];
	while (r.at < r.bytes.length) {
		r.need(16);
		const type = new TextDecoder().decode(r.bytes.subarray(r.at, r.at + 8)).replace(/\0+$/, "");
		r.at += 8;
		const chunkVersion = r.u32();
		const size = r.u32();
		r.need(size);
		const end = r.at + size;
		if (type === "COREMESH") {
			if (chunkVersion !== 1) {
				throw new MeshError(
					"this mesh keeps its triangles compressed with Draco, which is not read",
				);
			}
			const numVerts = r.u32();
			const vertices = readVertices(r, numVerts, VERTEX);
			const numFaces = r.u32();
			core = { ...vertices, indices: readFaces(r, numFaces, FACE, numVerts) };
		} else if (type === "LODS" && chunkVersion === 1) {
			r.u16();
			r.u8();
			const count = r.u32();
			lods = Array.from({ length: count }, () => r.u32());
		}
		r.at = end;
	}
	if (!core) throw new MeshError("a mesh with no COREMESH chunk");
	return { version, ...core, indices: fullDetail(core.indices, lods) };
}

/** The box round a mesh's full-detail vertices: its smallest and largest x, y and z. */
export function meshBounds(mesh: FileMesh): { min: number[]; max: number[] } {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	const used = new Set(mesh.indices);
	for (const v of used) {
		for (let a = 0; a < 3; a++) {
			const p = mesh.positions[v * 3 + a];
			if (p < min[a]) min[a] = p;
			if (p > max[a]) max[a] = p;
		}
	}
	if (used.size === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
	return { min, max };
}

/** Sizes of the v4 and v5 trailing blocks, for a test to build a whole file with. */
export const MESH_SIZES = { VERTEX, FACE, BONE, SUBSET, SKINNING } as const;
