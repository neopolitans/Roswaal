/**
 * Reading Roblox's binary format: `.rbxl` places and `.rbxm` models.
 *
 * A 32-byte header, then chunks: `META`, `SSTR` (shared strings), one `INST`
 * per class listing its instances, one `PROP` per property of a class holding
 * that property for every instance of it, `PRNT` (the tree), and `END`. Each
 * chunk is stored, LZ4-compressed (models, Rojo builds) or zstd-compressed
 * (Studio's place saves); the payload's own magic says which.
 *
 * Arrays of fixed-size numbers are stored **transposed** -- all the first
 * bytes, then all the second -- and big-endian within a value, which
 * compresses far better. Integers are zigzagged, floats have their sign bit
 * rotated to the bottom, and referents are delta-encoded.
 *
 * A property of a type this does not decode is left out and counted in
 * `undecoded`. Each `PROP` chunk says how long it is, so one unknown type costs
 * that property and nothing else.
 */

import { type CFrameValue, type Prop, type PropType, type RbxDocument, RbxError, type RbxInstance, text } from "./dom.js";
import { lz4Decompress } from "./lz4.js";
import { isZstd, zstdDecompress } from "./zstd.js";

const MAGIC = "<roblox!";
const SIGNATURE = [0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a];

/** True when the bytes are a binary place or model. */
export function isBinaryRbx(bytes: Uint8Array): boolean {
	if (bytes.length < 14) return false;
	for (let i = 0; i < 8; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) return false;
	return SIGNATURE.every((b, i) => bytes[8 + i] === b);
}

const TYPE_NAMES: Record<number, string> = {
	1: "String", 2: "Bool", 3: "Int32", 4: "Float32", 5: "Float64", 6: "UDim", 7: "UDim2", 8: "Ray",
	9: "Faces", 10: "Axes", 11: "BrickColor", 12: "Color3", 13: "Vector2", 14: "Vector3",
	15: "Vector2int16", 16: "CFrame", 17: "Quaternion", 18: "Enum", 19: "Ref", 20: "Vector3int16",
	21: "NumberSequence", 22: "ColorSequence", 23: "NumberRange", 24: "Rect", 25: "PhysicalProperties",
	26: "Color3uint8", 27: "Int64", 28: "SharedString", 29: "ProtectedString", 30: "OptionalCFrame",
	31: "UniqueId", 32: "Font", 33: "SecurityCapabilities", 34: "Content",
};

class Reader {
	o = 0;
	private readonly view: DataView;
	constructor(readonly b: Uint8Array) {
		this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
	}
	need(n: number): void {
		if (this.o + n > this.b.length) throw new RbxError("a chunk ends in the middle of a value");
	}
	u8(): number {
		this.need(1);
		return this.b[this.o++];
	}
	u32(): number {
		this.need(4);
		const v = this.view.getUint32(this.o, true);
		this.o += 4;
		return v;
	}
	f32(): number {
		this.need(4);
		const v = this.view.getFloat32(this.o, true);
		this.o += 4;
		return v;
	}
	f64(): number {
		this.need(8);
		const v = this.view.getFloat64(this.o, true);
		this.o += 8;
		return v;
	}
	bytes(n: number): Uint8Array {
		this.need(n);
		const v = this.b.subarray(this.o, this.o + n);
		this.o += n;
		return v;
	}
	string(): Uint8Array {
		return this.bytes(this.u32());
	}
	/** `count` transposed big-endian u32s. */
	interleaved(count: number): Uint32Array {
		this.need(count * 4);
		const out = new Uint32Array(count);
		const b = this.b;
		const o = this.o;
		for (let i = 0; i < count; i++) {
			out[i] = ((b[o + i] << 24) | (b[o + count + i] << 16) | (b[o + 2 * count + i] << 8) | b[o + 3 * count + i]) >>> 0;
		}
		this.o += count * 4;
		return out;
	}
	ints(count: number): number[] {
		return Array.from(this.interleaved(count), unzigzag);
	}
	floats(count: number): number[] {
		return Array.from(this.interleaved(count), unrotate);
	}
	/** Delta-encoded referents. */
	referents(count: number): number[] {
		const raw = this.ints(count);
		let acc = 0;
		return raw.map((v) => (acc += v));
	}
}

const unzigzag = (v: number): number => (v >>> 1) ^ -(v & 1);

const floatBits = new DataView(new ArrayBuffer(4));
function unrotate(v: number): number {
	floatBits.setUint32(0, ((v >>> 1) | ((v & 1) << 31)) >>> 0);
	return floatBits.getFloat32(0);
}

/** The 24 axis-aligned rotations a CFrame can store as one byte. */
function basicRotation(id: number): number[] {
	const axes = [
		[1, 0, 0], [0, 1, 0], [0, 0, 1],
		[-1, 0, 0], [0, -1, 0], [0, 0, -1],
	];
	const r0 = axes[Math.floor((id - 1) / 6)];
	const r1 = axes[(id - 1) % 6];
	if (!r0 || !r1) throw new RbxError(`a CFrame with rotation id ${id}`);
	const r2 = [r0[1] * r1[2] - r0[2] * r1[1], r0[2] * r1[0] - r0[0] * r1[2], r0[0] * r1[1] - r0[1] * r1[0]];
	return [r0[0], r1[0], r2[0], r0[1], r1[1], r2[1], r0[2], r1[2], r2[2]];
}

function readCFrames(r: Reader, count: number): CFrameValue[] {
	const rotations: number[][] = [];
	for (let i = 0; i < count; i++) {
		const id = r.u8();
		if (id === 0) {
			const m: number[] = [];
			for (let k = 0; k < 9; k++) m.push(r.f32());
			rotations.push(m);
		} else {
			rotations.push(basicRotation(id));
		}
	}
	const x = r.floats(count);
	const y = r.floats(count);
	const z = r.floats(count);
	return rotations.map((rotation, i) => ({ position: [x[i], y[i], z[i]], rotation }));
}

/** Transposed big-endian 8-byte values, zigzagged. */
function readInt64s(r: Reader, count: number): bigint[] {
	const bytes = r.bytes(count * 8);
	const out: bigint[] = [];
	for (let i = 0; i < count; i++) {
		let v = 0n;
		for (let k = 0; k < 8; k++) v = (v << 8n) | BigInt(bytes[k * count + i]);
		out.push((v >> 1n) ^ -(v & 1n));
	}
	return out;
}

/**
 * Values of one property for `count` instances, or undefined for a type this
 * does not decode. Refs come back as referent numbers, resolved by the caller.
 */
function readValues(r: Reader, type: number, count: number, shared: Uint8Array[]): [PropType, unknown[]] | undefined {
	switch (type) {
		case 1:
		case 29: {
			const out: Uint8Array[] = [];
			for (let i = 0; i < count; i++) out.push(r.string());
			return [type === 1 ? "String" : "ProtectedString", out];
		}
		case 2: {
			const out: boolean[] = [];
			for (let i = 0; i < count; i++) out.push(r.u8() !== 0);
			return ["Bool", out];
		}
		case 3:
			return ["Int32", r.ints(count)];
		case 4:
			return ["Float32", r.floats(count)];
		case 5: {
			const out: number[] = [];
			for (let i = 0; i < count; i++) out.push(r.f64());
			return ["Float64", out];
		}
		case 6: {
			const scale = r.floats(count);
			const offset = r.ints(count);
			return ["UDim", scale.map((s, i) => [s, offset[i]])];
		}
		case 7: {
			const sx = r.floats(count);
			const sy = r.floats(count);
			const ox = r.ints(count);
			const oy = r.ints(count);
			return ["UDim2", sx.map((s, i) => [s, ox[i], sy[i], oy[i]])];
		}
		case 11:
			return ["BrickColor", Array.from(r.interleaved(count))];
		case 12: {
			const [x, y, z] = [r.floats(count), r.floats(count), r.floats(count)];
			return ["Color3", x.map((_, i) => [x[i], y[i], z[i]])];
		}
		case 13: {
			const [x, y] = [r.floats(count), r.floats(count)];
			return ["Vector2", x.map((_, i) => [x[i], y[i]])];
		}
		case 14: {
			const [x, y, z] = [r.floats(count), r.floats(count), r.floats(count)];
			return ["Vector3", x.map((_, i) => [x[i], y[i], z[i]])];
		}
		case 16:
			return ["CFrame", readCFrames(r, count)];
		case 18:
			return ["Enum", Array.from(r.interleaved(count))];
		case 19:
			return ["Ref", r.referents(count)];
		case 23: {
			const out: number[][] = [];
			for (let i = 0; i < count; i++) out.push([r.f32(), r.f32()]);
			return ["NumberRange", out];
		}
		case 24: {
			const [a, b, c, d] = [r.floats(count), r.floats(count), r.floats(count), r.floats(count)];
			return ["Rect", a.map((_, i) => [a[i], b[i], c[i], d[i]])];
		}
		case 26: {
			const bytes = r.bytes(count * 3);
			const out: number[][] = [];
			for (let i = 0; i < count; i++) out.push([bytes[i], bytes[count + i], bytes[2 * count + i]]);
			return ["Color3uint8", out];
		}
		case 27:
			return ["Int64", readInt64s(r, count)];
		case 28: {
			const indices = r.interleaved(count);
			return ["SharedString", Array.from(indices, (i) => shared[i] ?? new Uint8Array(0))];
		}
		case 30: {
			if (r.u8() !== 16) throw new RbxError("an OptionalCFrame without its CFrames");
			const frames = readCFrames(r, count);
			if (r.u8() !== 2) throw new RbxError("an OptionalCFrame without its flags");
			const present: boolean[] = [];
			for (let i = 0; i < count; i++) present.push(r.u8() !== 0);
			return ["OptionalCFrame", frames.map((f, i) => (present[i] ? f : null))];
		}
		case 31: {
			// 16 bytes a value, transposed like everything else. Kept as hex:
			// it is an identity to match on, not a number to do sums with.
			const bytes = r.bytes(count * 16);
			const out: string[] = [];
			for (let i = 0; i < count; i++) {
				let hex = "";
				for (let k = 0; k < 16; k++) hex += bytes[k * count + i].toString(16).padStart(2, "0");
				out.push(hex);
			}
			return ["UniqueId", out];
		}
		default:
			return undefined;
	}
}

interface ClassChunk {
	name: string;
	instances: RbxInstance[];
}

/** Reads a binary place or model. Throws `RbxError` for a file it cannot read. */
export function readBinary(bytes: Uint8Array): RbxDocument {
	if (!isBinaryRbx(bytes)) throw new RbxError("not a binary Roblox place or model");
	const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const version = header.getUint16(14, true);
	if (version !== 0) throw new RbxError(`format version ${version}, where this reads version 0`);

	const classes = new Map<number, ClassChunk>();
	const byRef = new Map<number, RbxInstance>();
	const instances: RbxInstance[] = [];
	const shared: Uint8Array[] = [];
	const undecoded = new Map<string, number>();
	const pendingRefs: { inst: RbxInstance; prop: string; ref: number }[] = [];
	const parents: [number, number][] = [];

	let p = 32;
	let ended = false;
	while (p + 16 <= bytes.length) {
		const name = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
		const compressed = header.getUint32(p + 4, true);
		const length = header.getUint32(p + 8, true);
		p += 16;
		const stored = compressed === 0;
		const size = stored ? length : compressed;
		if (p + size > bytes.length) throw new RbxError(`the ${name.trim()} chunk runs past the end of the file`);
		const raw = bytes.subarray(p, p + size);
		p += size;
		if (name === "END\0") {
			ended = true;
			break;
		}
		const data = stored ? raw : isZstd(raw) ? zstdDecompress(raw, length) : lz4Decompress(raw, length);
		if (data.length !== length) throw new RbxError(`the ${name.trim()} chunk decompressed to the wrong length`);
		const r = new Reader(data);

		if (name === "INST") {
			const id = r.u32();
			const className = text(r.string());
			const isService = r.u8() === 1;
			const count = r.u32();
			const refs = r.referents(count);
			const chunk: ClassChunk = { name: className, instances: [] };
			for (const ref of refs) {
				const inst: RbxInstance = {
					className,
					name: className,
					parent: null,
					children: [],
					props: new Map(),
					service: isService,
				};
				chunk.instances.push(inst);
				byRef.set(ref, inst);
				instances.push(inst);
			}
			classes.set(id, chunk);
		} else if (name === "PROP") {
			const id = r.u32();
			const prop = text(r.string());
			const type = r.u8();
			const chunk = classes.get(id);
			if (!chunk) throw new RbxError(`a property of class ${id}, which no INST chunk named`);
			const count = chunk.instances.length;
			const decoded = readValues(r, type, count, shared);
			if (!decoded) {
				const typeName = TYPE_NAMES[type] ?? `type ${type}`;
				undecoded.set(typeName, (undecoded.get(typeName) ?? 0) + 1);
				continue;
			}
			const [propType, values] = decoded;
			chunk.instances.forEach((inst, i) => {
				if (propType === "Ref") {
					pendingRefs.push({ inst, prop, ref: values[i] as number });
					return;
				}
				inst.props.set(prop, { type: propType, value: values[i] } satisfies Prop);
				if (prop === "Name" && (propType === "String" || propType === "ProtectedString")) inst.name = text(values[i]);
			});
		} else if (name === "PRNT") {
			r.u8();
			const count = r.u32();
			const children = r.referents(count);
			const parentRefs = r.referents(count);
			for (let i = 0; i < count; i++) parents.push([children[i], parentRefs[i]]);
		} else if (name === "SSTR") {
			r.u32();
			const count = r.u32();
			for (let i = 0; i < count; i++) {
				r.bytes(16);
				shared.push(r.string());
			}
		}
		// META and anything newer carry nothing the tree needs.
	}
	if (!ended) throw new RbxError("the file stops before its END chunk");

	for (const { inst, prop, ref } of pendingRefs) {
		inst.props.set(prop, { type: "Ref", value: byRef.get(ref) ?? null });
	}
	const roots: RbxInstance[] = [];
	const parented = new Set<RbxInstance>();
	for (const [childRef, parentRef] of parents) {
		const child = byRef.get(childRef);
		if (!child) continue;
		const parent = byRef.get(parentRef);
		parented.add(child);
		if (parent) {
			child.parent = parent;
			parent.children.push(child);
		} else {
			roots.push(child);
		}
	}
	// An instance PRNT never mentions is still in the file; keep it at the top.
	for (const inst of instances) if (!parented.has(inst)) roots.push(inst);
	return { format: "binary", roots, instances, undecoded };
}
