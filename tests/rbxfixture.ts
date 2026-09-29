/**
 * Small binary places, built in the test that reads them.
 *
 * Real places are private and never enter this repository, so the reader is
 * tested against files made here: the same chunk layout, the same transposed
 * and zigzagged arrays, stored, LZ4- or zstd-compressed. Only the property
 * types the tests need are written.
 */

import { zstdCompressSync } from "node:zlib";

export interface FixtureProp {
	/** The binary format's type id: 1 String, 2 Bool, 18 Enum, 31 UniqueId... */
	type: number;
	value: unknown;
}

export interface FixtureInstance {
	className: string;
	name: string;
	service?: boolean;
	props?: Record<string, FixtureProp>;
	children?: FixtureInstance[];
}

export type Compression = "none" | "lz4" | "zstd";

const utf8 = new TextEncoder();

class Writer {
	private parts: number[] = [];
	u8(v: number) {
		this.parts.push(v & 255);
	}
	u32(v: number) {
		for (let i = 0; i < 4; i++) this.parts.push((v >>> (8 * i)) & 255);
	}
	bytes(b: Uint8Array) {
		for (const x of b) this.parts.push(x);
	}
	string(s: string | Uint8Array) {
		const b = typeof s === "string" ? utf8.encode(s) : s;
		this.u32(b.length);
		this.bytes(b);
	}
	interleaved(values: number[]) {
		const n = values.length;
		const out = new Uint8Array(n * 4);
		values.forEach((v, i) => {
			out[i] = (v >>> 24) & 255;
			out[n + i] = (v >>> 16) & 255;
			out[2 * n + i] = (v >>> 8) & 255;
			out[3 * n + i] = v & 255;
		});
		this.bytes(out);
	}
	done(): Uint8Array {
		return Uint8Array.from(this.parts);
	}
}

const zigzag = (v: number) => ((v << 1) ^ (v >> 31)) >>> 0;
const rotate = (f: number) => {
	const view = new DataView(new ArrayBuffer(4));
	view.setFloat32(0, f);
	const bits = view.getUint32(0);
	return ((bits << 1) | (bits >>> 31)) >>> 0;
};
const deltas = (refs: number[]) => refs.map((r, i) => zigzag(i === 0 ? r : r - refs[i - 1]));

/** A literal-only LZ4 block: valid, if not small. */
function lz4Literal(data: Uint8Array): Uint8Array {
	const out: number[] = [];
	const n = data.length;
	out.push((Math.min(n, 15) << 4) & 0xff);
	if (n >= 15) {
		let rest = n - 15;
		while (rest >= 255) {
			out.push(255);
			rest -= 255;
		}
		out.push(rest);
	}
	for (const b of data) out.push(b);
	return Uint8Array.from(out);
}

function chunk(name: string, data: Uint8Array, compression: Compression): Uint8Array {
	const w = new Writer();
	w.bytes(utf8.encode(name.padEnd(4, "\0")));
	if (compression === "none" || name === "END") {
		w.u32(0);
		w.u32(data.length);
		w.u32(0);
		w.bytes(data);
	} else {
		const packed = compression === "lz4" ? lz4Literal(data) : new Uint8Array(zstdCompressSync(data));
		w.u32(packed.length);
		w.u32(data.length);
		w.u32(0);
		w.bytes(packed);
	}
	return w.done();
}

function defaultFor(type: number): unknown {
	switch (type) {
		case 1: return "";
		case 2: return false;
		case 31: return "00".repeat(16);
		case 21: return [];
		default: return 0;
	}
}

function writeValues(w: Writer, type: number, values: unknown[]): void {
	switch (type) {
		case 1:
			for (const v of values) w.string(v as string | Uint8Array);
			return;
		case 2:
			for (const v of values) w.u8(v ? 1 : 0);
			return;
		case 3:
			w.interleaved(values.map((v) => zigzag(v as number)));
			return;
		case 4:
			w.interleaved(values.map((v) => rotate(v as number)));
			return;
		case 18:
			w.interleaved(values as number[]);
			return;
		case 21:
			// NumberSequence: a count, then time/value/envelope floats, per value.
			for (const v of values) {
				const keys = v as number[][];
				w.u32(keys.length);
				for (const k of keys) {
					const b = new DataView(new ArrayBuffer(12));
					k.forEach((x, i) => b.setFloat32(i * 4, x, true));
					w.bytes(new Uint8Array(b.buffer));
				}
			}
			return;
		case 31: {
			const n = values.length;
			const out = new Uint8Array(n * 16);
			values.forEach((v, i) => {
				const hex = v as string;
				for (let k = 0; k < 16; k++) out[k * n + i] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
			});
			w.bytes(out);
			return;
		}
		default:
			throw new Error(`the fixture writer does not write type ${type}`);
	}
}

/** A binary place holding `roots`, every chunk compressed as asked. */
export function buildPlace(roots: FixtureInstance[], compression: Compression = "none"): Uint8Array {
	const all: { inst: FixtureInstance; ref: number; parent: number }[] = [];
	const visit = (inst: FixtureInstance, parent: number) => {
		const ref = all.length;
		all.push({ inst, ref, parent });
		for (const c of inst.children ?? []) visit(c, ref);
	};
	for (const r of roots) visit(r, -1);

	const classes = new Map<string, typeof all>();
	for (const entry of all) {
		const list = classes.get(entry.inst.className) ?? [];
		list.push(entry);
		classes.set(entry.inst.className, list);
	}

	const header = new Writer();
	header.bytes(utf8.encode("<roblox!"));
	header.bytes(Uint8Array.of(0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a));
	header.u8(0);
	header.u8(0);
	header.u32(classes.size);
	header.u32(all.length);
	header.u32(0);
	header.u32(0);

	const chunks: Uint8Array[] = [header.done()];
	let id = 0;
	const ids = new Map<string, number>();
	for (const [className, list] of classes) {
		const w = new Writer();
		ids.set(className, id);
		w.u32(id++);
		w.string(className);
		const service = list.some((e) => e.inst.service);
		w.u8(service ? 1 : 0);
		w.u32(list.length);
		w.interleaved(deltas(list.map((e) => e.ref)));
		if (service) for (let i = 0; i < list.length; i++) w.u8(1);
		chunks.push(chunk("INST", w.done(), compression));
	}
	for (const [className, list] of classes) {
		const props = new Map<string, number>([["Name", 1]]);
		for (const e of list) for (const [k, p] of Object.entries(e.inst.props ?? {})) props.set(k, p.type);
		for (const [prop, type] of props) {
			const w = new Writer();
			w.u32(ids.get(className)!);
			w.string(prop);
			w.u8(type);
			writeValues(
				w,
				type,
				list.map((e) => (prop === "Name" ? e.inst.name : (e.inst.props?.[prop]?.value ?? defaultFor(type)))),
			);
			chunks.push(chunk("PROP", w.done(), compression));
		}
	}
	const prnt = new Writer();
	prnt.u8(0);
	prnt.u32(all.length);
	prnt.interleaved(deltas(all.map((e) => e.ref)));
	prnt.interleaved(deltas(all.map((e) => e.parent)));
	chunks.push(chunk("PRNT", prnt.done(), compression));
	chunks.push(chunk("END", utf8.encode("</roblox>"), "none"));

	const total = chunks.reduce((n, c) => n + c.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

export const script = (className: string, name: string, source: string, extra: Record<string, FixtureProp> = {}, children: FixtureInstance[] = []): FixtureInstance => ({
	className,
	name,
	props: { Source: { type: 1, value: source }, ...extra },
	children,
});

export const folder = (name: string, children: FixtureInstance[] = [], className = "Folder"): FixtureInstance => ({
	className,
	name,
	children,
});

export const service = (name: string, children: FixtureInstance[] = []): FixtureInstance => ({
	className: name,
	name,
	service: true,
	children,
});
