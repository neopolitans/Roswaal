/**
 * A read-only survey of a binary `.rbxm` / `.rbxl` — what is in this model, and
 * what joins to what — without opening Studio.
 *
 * ```
 * node scripts/read-rbxm.mjs examples/m103/M103_Model.rbxm --tree --joints
 * node scripts/read-rbxm.mjs examples/m103/place.rbxl --props Turret.Gun
 * ```
 *
 * Written twice before it was kept. The M103 survey in `examples/m103/NOTES.md`
 * needed it on 6 September and checking the author's Studio pass needed it again
 * on the 8th, by which point the first copy was gone — and week 3 checks the rig
 * after every change to it. Nothing else in the repository imports this; it is a
 * tool for reading the demo's assets, not part of Roswaal.
 *
 * ## What it is not
 *
 * **Not a general reader, and not a writer.** It knows the property types the
 * tank happens to use. An unknown type ends *that one* `PROP` chunk and nothing
 * else — chunk lengths are in the file, so the parse walks on and the skipped
 * property is counted in the output rather than swallowed (`--skipped` names
 * them). `Tags`, `Capabilities` and the mesh blobs come out that way and none of
 * them matter here.
 *
 * ## The format, briefly
 *
 * A 32-byte header, then chunks: `META`, `SSTR`, one `INST` per class, one
 * `PROP` per property of a class, `PRNT`, `END`. Chunk payloads are **LZ4 in
 * models and zstd in places** — the same Studio, different defaults — so both
 * are tried on the payload's own magic rather than on the file extension.
 *
 * Two things account for most of the code. Arrays of 4-byte values are stored
 * **transposed**, all the first bytes then all the second, which compresses far
 * better and means nothing can be read with a single `readUInt32`. And within
 * that, integers are zigzagged, floats have their sign bit rotated to the
 * bottom, and referents are delta-encoded against the one before.
 */

import { readFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

function lz4(src, destLen) {
	const dst = Buffer.alloc(destLen);
	let s = 0;
	let d = 0;
	while (s < src.length && d < destLen) {
		const token = src[s++];
		let lit = token >> 4;
		if (lit === 15) {
			let b;
			do {
				b = src[s++];
				lit += b;
			} while (b === 255);
		}
		src.copy(dst, d, s, s + lit);
		s += lit;
		d += lit;
		if (s >= src.length) break;
		const offset = src[s] | (src[s + 1] << 8);
		s += 2;
		let match = token & 15;
		if (match === 15) {
			let b;
			do {
				b = src[s++];
				match += b;
			} while (b === 255);
		}
		match += 4;
		let p = d - offset;
		for (let i = 0; i < match; i++) dst[d++] = dst[p++];
	}
	return dst;
}

class Reader {
	constructor(buf) {
		this.b = buf;
		this.o = 0;
	}
	u8() {
		return this.b[this.o++];
	}
	u32() {
		const v = this.b.readUInt32LE(this.o);
		this.o += 4;
		return v;
	}
	i32() {
		const v = this.b.readInt32LE(this.o);
		this.o += 4;
		return v;
	}
	f64() {
		const v = this.b.readDoubleLE(this.o);
		this.o += 8;
		return v;
	}
	str() {
		const n = this.u32();
		const v = this.b.toString("utf8", this.o, this.o + n);
		this.o += n;
		return v;
	}
	/** Transposed 4-byte values, big-endian within each value. */
	interleaved(count) {
		const out = new Array(count);
		const o = this.o;
		for (let i = 0; i < count; i++) {
			out[i] =
				((this.b[o + i] << 24) |
					(this.b[o + count + i] << 16) |
					(this.b[o + 2 * count + i] << 8) |
					this.b[o + 3 * count + i]) >>>
				0;
		}
		this.o += count * 4;
		return out;
	}
}

const unzig = (v) => (v >>> 1) ^ -(v & 1);
const unrotate = (v) => {
	const bits = ((v >>> 1) | ((v & 1) << 31)) >>> 0;
	const b = Buffer.alloc(4);
	b.writeUInt32LE(bits);
	return b.readFloatLE(0);
};

function f32Array(r, count) {
	return r.interleaved(count).map(unrotate);
}

/** The 24 axis-aligned rotations Roblox stores as a single byte. */
function orientation(id) {
	const axis = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
		[-1, 0, 0],
		[0, -1, 0],
		[0, 0, -1],
	];
	const r0 = axis[Math.floor((id - 1) / 6)];
	const r1 = axis[(id - 1) % 6];
	const r2 = [
		r0[1] * r1[2] - r0[2] * r1[1],
		r0[2] * r1[0] - r0[0] * r1[2],
		r0[0] * r1[1] - r0[1] * r1[0],
	];
	return [r0[0], r1[0], r2[0], r0[1], r1[1], r2[1], r0[2], r1[2], r2[2]];
}

const TYPES = {
	1: "String",
	2: "Bool",
	3: "Int32",
	4: "Float32",
	5: "Float64",
	6: "UDim",
	7: "UDim2",
	8: "Ray",
	9: "Faces",
	10: "Axes",
	11: "BrickColor",
	12: "Color3",
	13: "Vector2",
	14: "Vector3",
	16: "CFrame",
	18: "Enum",
	19: "Ref",
	20: "Vector3int16",
	21: "NumberSequence",
	22: "ColorSequence",
	23: "NumberRange",
	24: "Rect",
	25: "PhysicalProperties",
	26: "Color3uint8",
	27: "Int64",
	28: "SharedString",
	30: "OptionalCFrame",
	31: "UniqueId",
	32: "Font",
};

/** Returns an array of `count` values, or throws for a type we do not read. */
function readValues(r, type, count) {
	switch (type) {
		case 1: {
			const out = [];
			for (let i = 0; i < count; i++) out.push(r.str());
			return out;
		}
		case 2: {
			const out = [];
			for (let i = 0; i < count; i++) out.push(r.u8() !== 0);
			return out;
		}
		case 3:
			return r.interleaved(count).map(unzig);
		case 4:
			return f32Array(r, count);
		case 5: {
			const out = [];
			for (let i = 0; i < count; i++) out.push(r.f64());
			return out;
		}
		case 11:
		case 18:
			return r.interleaved(count);
		case 12: {
			const [x, y, z] = [f32Array(r, count), f32Array(r, count), f32Array(r, count)];
			return x.map((_, i) => [x[i], y[i], z[i]]);
		}
		case 14: {
			const [x, y, z] = [f32Array(r, count), f32Array(r, count), f32Array(r, count)];
			return x.map((_, i) => [x[i], y[i], z[i]]);
		}
		case 16: {
			const rots = [];
			for (let i = 0; i < count; i++) {
				const id = r.u8();
				if (id === 0) {
					const m = [];
					for (let j = 0; j < 9; j++) {
						m.push(r.b.readFloatLE(r.o));
						r.o += 4;
					}
					rots.push(m);
				} else {
					rots.push(orientation(id));
				}
			}
			const [x, y, z] = [f32Array(r, count), f32Array(r, count), f32Array(r, count)];
			return rots.map((m, i) => ({ pos: [x[i], y[i], z[i]], rot: m }));
		}
		case 19: {
			const raw = r.interleaved(count).map(unzig);
			const out = [];
			let acc = 0;
			for (const v of raw) {
				acc += v;
				out.push(acc);
			}
			return out;
		}
		case 26: {
			const out = [];
			for (let i = 0; i < count; i++) {
				out.push([r.b[r.o + i], r.b[r.o + count + i], r.b[r.o + 2 * count + i]]);
			}
			r.o += count * 3;
			return out;
		}
		case 31: {
			r.o += count * 16;
			return new Array(count).fill("<uniqueid>");
		}
		default:
			throw new Error(`type ${type} (${TYPES[type] ?? "?"})`);
	}
}

export function parse(path) {
	const buf = readFileSync(path);
	const classes = new Map(); // classIndex -> { name, referents }
	const inst = new Map(); // referent -> { class, props }
	const parent = new Map(); // referent -> parent referent
	const skipped = [];
	const refProps = new Set(); // property names that hold a referent

	let o = 32;
	while (o + 16 <= buf.length) {
		const name = buf.toString("ascii", o, o + 4);
		const clen = buf.readUInt32LE(o + 4);
		const ulen = buf.readUInt32LE(o + 8);
		o += 16;
		const raw = buf.subarray(o, o + (clen === 0 ? ulen : clen));
		o += clen === 0 ? ulen : clen;
		if (name === "END\0") break;
		// Places written by recent Studio use zstd per chunk; models still use LZ4.
		const zstd = raw.length >= 4 && raw.readUInt32LE(0) === 0xfd2fb528;
		const data = clen === 0 ? raw : zstd ? zstdDecompressSync(raw) : lz4(raw, ulen);
		const r = new Reader(data);

		if (name === "INST") {
			const idx = r.u32();
			const className = r.str();
			r.u8(); // isService — the services chunk that follows is only in places
			const count = r.u32();
			const raws = r.interleaved(count).map(unzig);
			const refs = [];
			let acc = 0;
			for (const v of raws) {
				acc += v;
				refs.push(acc);
			}
			classes.set(idx, { name: className, refs });
			for (const ref of refs) inst.set(ref, { class: className, props: {} });
		} else if (name === "PROP") {
			const idx = r.u32();
			const prop = r.str();
			const type = r.u8();
			const cls = classes.get(idx);
			if (!cls) continue;
			try {
				const values = readValues(r, type, cls.refs.length);
				// Remembered by name so the printers can turn `PrimaryPart = 75`
				// into a path. The value stays a plain referent, because that is
				// what `--joints` compares against.
				if (type === 19) refProps.add(prop);
				cls.refs.forEach((ref, i) => {
					inst.get(ref).props[prop] = values[i];
				});
			} catch (err) {
				skipped.push(`${cls.name}.${prop}: ${err.message}`);
			}
		} else if (name === "PRNT") {
			r.u8();
			const count = r.u32();
			const child = readValues(r, 19, count);
			const par = readValues(r, 19, count);
			for (let i = 0; i < count; i++) parent.set(child[i], par[i]);
		}
	}
	return { inst, parent, skipped, refProps };
}

function fullName({ inst, parent }, ref) {
	const parts = [];
	let cur = ref;
	while (cur !== undefined && cur !== -1 && inst.has(cur)) {
		parts.unshift(inst.get(cur).props.Name ?? inst.get(cur).class);
		cur = parent.get(cur);
	}
	return parts.join(".");
}

const num = (v) => (Math.abs(v) < 1e-4 ? 0 : Math.round(v * 1000) / 1000);

function main() {
	const [file, ...flags] = process.argv.slice(2);
	if (!file) {
		console.error("usage: node scripts/read-rbxm.mjs <file.rbxm|.rbxl> [--tree] [--joints] [--props [name]] [--skipped]");
		process.exit(2);
	}
	const doc = parse(file);
	const { inst, parent } = doc;
	const want = new Set(flags);

	console.log(`# ${file}`);
	console.log(`${inst.size} instances`);
	// One line, because a place skips three hundred of these and the list would
	// bury the survey. `--skipped` prints them when one is actually in question.
	if (doc.skipped.length) {
		console.log(
			want.has("--skipped")
				? `unread properties: ${doc.skipped.join(", ")}`
				: `${doc.skipped.length} properties of types this does not read (--skipped to list)`,
		);
	}

	const byClass = new Map();
	for (const [, i] of inst) byClass.set(i.class, (byClass.get(i.class) ?? 0) + 1);
	console.log(
		"\n## classes\n" +
			[...byClass].sort().map(([c, n]) => `${n.toString().padStart(4)}  ${c}`).join("\n"),
	);

	if (want.has("--tree")) {
		const kids = new Map();
		for (const [c, p] of parent) {
			if (!kids.has(p)) kids.set(p, []);
			kids.get(p).push(c);
		}
		const line = (ref, depth) => {
			const i = inst.get(ref);
			const extra = [];
			if (i.props.Anchored === true) extra.push("ANCHORED");
			console.log(
				`${"  ".repeat(depth)}${i.props.Name ?? "?"}  [${i.class}]${extra.length ? "  " + extra.join(" ") : ""}`,
			);
			for (const k of (kids.get(ref) ?? []).sort((a, b) =>
				(inst.get(a).props.Name ?? "").localeCompare(inst.get(b).props.Name ?? ""),
			)) {
				line(k, depth + 1);
			}
		};
		console.log("\n## tree");
		for (const [ref] of inst) if (!inst.has(parent.get(ref))) line(ref, 0);
	}

	if (want.has("--joints")) {
		console.log("\n## joints");
		const rows = [];
		for (const [ref, i] of inst) {
			if (!/Motor6D|Weld|WeldConstraint|HingeConstraint|Motor$/.test(i.class)) continue;
			const p0 = i.props.Part0;
			const p1 = i.props.Part1;
			const c0 = i.props.C0;
			const c1 = i.props.C1;
			rows.push({
				name: fullName(doc, ref),
				class: i.class,
				part0: p0 !== undefined && inst.has(p0) ? fullName(doc, p0) : String(p0),
				part1: p1 !== undefined && inst.has(p1) ? fullName(doc, p1) : String(p1),
				c0: c0 ? `${c0.pos.map(num).join(", ")}` : "-",
				c0rot: c0 ? c0.rot.map(num).join(" ") : "-",
				c1: c1 ? `${c1.pos.map(num).join(", ")}` : "-",
			});
		}
		rows.sort((a, b) => a.name.localeCompare(b.name));
		for (const r of rows) {
			console.log(`${r.name}  [${r.class}]`);
			console.log(`    Part0 = ${r.part0}`);
			console.log(`    Part1 = ${r.part1}`);
			console.log(`    C0    = (${r.c0})  rot [${r.c0rot}]`);
			console.log(`    C1    = (${r.c1})`);
		}
	}

	if (want.has("--props")) {
		// Anything after --props narrows by name, so `--props Turret.Gun` is one
		// part rather than four hundred lines.
		const filter = flags[flags.indexOf("--props") + 1];
		console.log("\n## properties");
		for (const [ref, i] of inst) {
			const name = fullName(doc, ref);
			if (filter && !filter.startsWith("--") && !name.includes(filter)) continue;
			console.log(`${name}  [${i.class}]`);
			for (const [k, v] of Object.entries(i.props)) {
				if (k === "Name") continue;
				const shown = doc.refProps.has(k)
					? inst.has(v)
						? fullName(doc, v)
						: "nil"
					: Array.isArray(v)
					? `(${v.map(num).join(", ")})`
					: typeof v === "object" && v?.pos
						? `(${v.pos.map(num).join(", ")})`
						: typeof v === "number"
							? num(v)
							: String(v).replace(/[^\x20-\x7e]/g, ".").slice(0, 80);
				console.log(`    ${k} = ${shown}`);
			}
		}
	}
}

main();
