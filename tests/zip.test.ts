/**
 * The zip a project leaves the browser in.
 *
 * Hand-written, and a format nothing in the repository can read back — so the
 * check is against Node's own `zlib`, which unpacks a real zip's entries, and
 * against the bytes the specification asks for. A zip that is almost a zip
 * opens in one tool and not the next, and the person finding that out is
 * somebody who has just lost the only copy of their work to a closed tab.
 */

import { inflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { zip } from "../src/app/zip.js";

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

async function bytesOf(blob: Blob): Promise<Buffer> {
	return Buffer.from(await blob.arrayBuffer());
}

/**
 * The archive's central directory, read the way an unpacker reads it: from the
 * end record backwards, never by trusting the order entries were written in.
 */
function readDirectory(buf: Buffer) {
	const end = buf.length - 22;
	expect(buf.readUInt32LE(end)).toBe(END);

	const count = buf.readUInt16LE(end + 10);
	const size = buf.readUInt32LE(end + 12);
	const start = buf.readUInt32LE(end + 16);
	expect(start + size).toBe(end);

	const entries: { name: string; crc: number; size: number; offset: number; method: number }[] = [];
	let at = start;
	for (let i = 0; i < count; i++) {
		expect(buf.readUInt32LE(at)).toBe(CENTRAL);
		const nameLength = buf.readUInt16LE(at + 28);
		entries.push({
			method: buf.readUInt16LE(at + 10),
			crc: buf.readUInt32LE(at + 16),
			size: buf.readUInt32LE(at + 24),
			offset: buf.readUInt32LE(at + 42),
			name: buf.subarray(at + 46, at + 46 + nameLength).toString("utf8"),
		});
		at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
	}
	return entries;
}

/** One entry's bytes, found through its local header the way an unpacker would. */
function readEntry(buf: Buffer, offset: number): { name: string; body: Buffer } {
	expect(buf.readUInt32LE(offset)).toBe(LOCAL);
	const nameLength = buf.readUInt16LE(offset + 26);
	const extraLength = buf.readUInt16LE(offset + 28);
	const size = buf.readUInt32LE(offset + 22);
	const start = offset + 30 + nameLength + extraLength;
	return {
		name: buf.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"),
		body: buf.subarray(start, start + size),
	};
}

const PROJECT = {
	"demo/roswaal.json": '{\n  "target": "roblox"\n}\n',
	"demo/.roswaal/scripts/Greeter.nodescript": '{"nodes":[],"links":[]}',
	"demo/src/Greeter.luau": "-- roswaal-output: abc\nreturn {}\n",
};

describe("the archive a project is handed over in", () => {
	it("is a zip an unpacker can walk", async () => {
		const buf = await bytesOf(zip(PROJECT));
		const entries = readDirectory(buf);

		expect(entries.map((e) => e.name)).toEqual(Object.keys(PROJECT).sort());
		// Stored, not deflated: the whole reason there is no dependency here.
		expect(entries.every((e) => e.method === 0)).toBe(true);
	});

	it("gives back exactly what it was given", async () => {
		const buf = await bytesOf(zip(PROJECT));

		for (const entry of readDirectory(buf)) {
			const found = readEntry(buf, entry.offset);
			expect([entry.name, found.name]).toEqual([entry.name, entry.name]);
			expect([entry.name, found.body.toString("utf8")])
				.toEqual([entry.name, PROJECT[entry.name as keyof typeof PROJECT]]);
		}
	});

	/**
	 * The CRC is the field an unpacker checks before it trusts the bytes, and
	 * the one most easily got wrong by a table with an off-by-one in it. Checked
	 * against zlib's, which is the same polynomial.
	 */
	it("stamps a CRC that matches the contents", async () => {
		const { crc32 } = await import("node:zlib");
		const buf = await bytesOf(zip(PROJECT));

		for (const entry of readDirectory(buf)) {
			const body = readEntry(buf, entry.offset).body;
			expect([entry.name, entry.crc]).toEqual([entry.name, crc32(body)]);
			expect([entry.name, entry.size]).toEqual([entry.name, body.length]);
		}
	});

	/** A name outside ASCII has to survive, which is what the UTF-8 flag is for. */
	it("keeps a name that is not ASCII", async () => {
		const buf = await bytesOf(zip({ "demo/Café.nodescript": "{}" }));
		const [entry] = readDirectory(buf);

		expect(entry.name).toBe("demo/Café.nodescript");
		// Bit 11 of the general-purpose flags, read off the central record.
		const end = buf.length - 22;
		const start = buf.readUInt32LE(end + 16);
		expect(buf.readUInt16LE(start + 8) & 0x0800).toBe(0x0800);
	});

	it("writes an empty archive rather than a broken one", async () => {
		const buf = await bytesOf(zip({}));
		expect(buf.length).toBe(22);
		expect(readDirectory(buf)).toEqual([]);
	});

	/**
	 * Store-only means the bytes are the file. `inflateRawSync` on stored data
	 * is nonsense, and proving it *is* nonsense is the point: an entry claiming
	 * method 0 while holding deflated bytes is the failure this rules out.
	 */
	it("stores rather than deflates", async () => {
		const buf = await bytesOf(zip({ "a.txt": "x".repeat(2000) }));
		const [entry] = readDirectory(buf);
		const body = readEntry(buf, entry.offset).body;

		expect(entry.size).toBe(2000);
		expect(body.toString("utf8")).toBe("x".repeat(2000));
		expect(() => inflateRawSync(body)).toThrow();
	});
});
