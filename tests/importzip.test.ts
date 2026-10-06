/**
 * Opening a project from a zip: reading the archive, and deciding what in it
 * is the project.
 *
 * The archives here are built the two ways real ones are. `zip.ts` stores,
 * which is what `Download` makes; Finder, Explorer and `zip -r` deflate, and
 * `deflated()` below writes one of those by hand with Node's own deflate, so
 * the path a Mac's zip takes is tested without a Mac's zip in the repository.
 */

import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";
import { LARGEST_ENTRY, unzip, ZipError } from "../src/app/unzip.js";
import { zip } from "../src/app/zip.js";
import { keepEntry, projectFromZip, projectName } from "../src/web/importZip.js";
import { persistence, type SnapshotStore } from "../src/web/persist.js";

/** One entry of a hand-made archive: its body as stored, and the size its index gives. */
interface Entry {
	name: string;
	body: Uint8Array;
	method: number;
	size: number;
	/** The index of an earlier entry whose local header this one's index points at. */
	sharing?: number;
	/** The compressed length its index gives, when that is not the body's. */
	stated?: number;
}

/** An archive whose files are deflated, with a data descriptor like a streaming writer's. */
function deflated(files: Record<string, string>, dirs: string[] = []): Uint8Array {
	const encoder = new TextEncoder();
	return archive([
		...dirs.map((dir) => ({ name: `${dir}/`, body: new Uint8Array(0), method: 0, size: 0 })),
		...Object.entries(files).map(([name, text]) => {
			const raw = encoder.encode(text);
			return { name, body: new Uint8Array(deflateRawSync(raw)), method: 8, size: raw.length };
		}),
	]);
}

/** An archive of exactly the entries given, sizes and all, whether they are true or not. */
function archive(entries: Entry[]): Uint8Array {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	const offsets: number[] = [];
	let offset = 0;

	for (const { name, body, method, size, sharing, stated } of entries) {
		const nameBytes = encoder.encode(name);
		const local = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(6, 0x0808, true); // sizes follow the data; names are UTF-8
		lv.setUint16(8, method, true);
		lv.setUint16(26, nameBytes.length, true);
		local.set(nameBytes, 30);

		const record = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(record.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(8, 0x0808, true);
		cv.setUint16(10, method, true);
		cv.setUint32(20, stated ?? body.length, true);
		cv.setUint32(24, size, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint32(42, sharing === undefined ? offset : (offsets[sharing] ?? offset), true);
		record.set(nameBytes, 46);

		offsets.push(offset);
		locals.push(local, body);
		central.push(record);
		offset += local.length + body.length;
	}

	const directorySize = central.reduce((sum, part) => sum + part.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, central.length, true);
	ev.setUint16(10, central.length, true);
	ev.setUint32(12, directorySize, true);
	ev.setUint32(16, offset, true);

	const parts = [...locals, ...central, end];
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("reading a zip", () => {
	it("reads what Download writes", async () => {
		const blob = zip({ "tank/roswaal.json": "{}", "tank/src/Main.luau": "print(1)" });
		const read = await unzip(await blob.arrayBuffer());
		expect(read.files.map((f) => [f.path, text(f.bytes)])).toEqual([
			["tank/roswaal.json", "{}"],
			["tank/src/Main.luau", "print(1)"],
		]);
	});

	it("reads what Finder and Explorer write, deflated", async () => {
		const long = "local x = 1\n".repeat(500);
		const read = await unzip(deflated({ "tank/src/Main.luau": long }, ["tank", "tank/src"]));
		expect(text(read.files[0]!.bytes)).toBe(long);
		expect(read.dirs).toEqual(["tank", "tank/src"]);
	});

	it("does not decompress what the caller does not want", async () => {
		const read = await unzip(
			deflated({ "tank/.git/HEAD": "ref", "tank/roswaal.json": "{}" }),
			keepEntry,
		);
		expect(read.files.map((f) => f.path)).toEqual(["tank/roswaal.json"]);
	});

	it("says so when a file is not a zip", async () => {
		await expect(
			unzip(new TextEncoder().encode("not a zip at all, just words")),
		).rejects.toBeInstanceOf(ZipError);
		await expect(unzip(new TextEncoder().encode("not a zip at all, just words"))).rejects.toThrow(
			"not a zip",
		);
	});
});

describe("a zip that is not what its index says", () => {
	const squeezed = (bytes: Uint8Array) => new Uint8Array(deflateRawSync(bytes));
	const deflatedEntry = (name: string, raw: Uint8Array, size = raw.length): Entry => ({
		name,
		body: squeezed(raw),
		method: 8,
		size,
	});

	it("stops an entry that unpacks to more than its index says", async () => {
		const zeros = new Uint8Array(16 * 1024 * 1024);
		// The lengths read, not the bytes: sixteen MiB of them would not print.
		const outcome = await unzip(archive([deflatedEntry("tank/Main.luau", zeros, 100)])).then(
			(read) => read.files.map((f) => f.bytes.length),
			(err: unknown) => err,
		);
		expect(outcome).toBeInstanceOf(ZipError);
		expect(String(outcome)).toContain("unpacks to more than its index says");
	});

	it("refuses an entry that unpacks to less than its index says", async () => {
		const raw = new TextEncoder().encode("print(1)");
		await expect(unzip(archive([deflatedEntry("tank/Main.luau", raw, 1000)]))).rejects.toThrow(
			"unpacks to less than its index says",
		);
	});

	it("refuses compressed data that does not inflate, as a damaged zip", async () => {
		const junk = {
			name: "tank/Main.luau",
			body: new Uint8Array([0xff, 0xff, 0xff]),
			method: 8,
			size: 3,
		};
		await expect(unzip(archive([junk]))).rejects.toBeInstanceOf(ZipError);
	});

	it("refuses two entries that point at the same data", async () => {
		const raw = new TextEncoder().encode("print(1)");
		const zipped = archive([
			deflatedEntry("tank/A.luau", raw),
			{ ...deflatedEntry("tank/B.luau", raw), sharing: 0 },
		]);
		await expect(unzip(zipped)).rejects.toThrow("damaged at tank/B.luau");
	});

	it("refuses a stored entry that runs past the end of the file", async () => {
		// The index says the body is far longer than the file has room for.
		const long = {
			name: "tank/Main.luau",
			body: new Uint8Array(4),
			method: 0,
			size: 1 << 20,
			stated: 1 << 20,
		};
		await expect(unzip(archive([long]))).rejects.toThrow("damaged at tank/Main.luau");
	});

	it("refuses an archive that adds up to more than 128 MiB, before unpacking any of it", async () => {
		// Seventeen entries each just within the 8 MiB an entry may be.
		const one = new TextEncoder().encode("x");
		const entries = Array.from({ length: 17 }, (_, i) =>
			deflatedEntry(`tank/${i}.luau`, one, LARGEST_ENTRY),
		);
		await expect(unzip(archive(entries))).rejects.toThrow("unpacks to more than 128 MiB");
	});
});

describe("what counts as the project", () => {
	const project = async (name: string, files: Record<string, string>, dirs: string[] = []) =>
		projectFromZip(name, await unzip(deflated(files, dirs)));

	it("unwraps the folder around it, and takes its name", async () => {
		const got = await project(
			"Archive.zip",
			{
				"tank-game/roswaal.json": "{}",
				"tank-game/.roswaal/scripts/Main.nodescript": "{}",
			},
			["tank-game", "tank-game/src"],
		);
		expect(got.name).toBe("tank-game");
		expect(Object.keys(got.files).sort()).toEqual([
			".roswaal/scripts/Main.nodescript",
			"roswaal.json",
		]);
		expect(got.dirs).toEqual(["src"]);
		expect(got.isProject).toBe(true);
	});

	it("unwraps more than one folder when that is where the project is", async () => {
		const got = await project("backup.zip", {
			"games/tank/roswaal.json": "{}",
			"games/tank/src/a.luau": "",
		});
		expect(got.name).toBe("tank");
		expect(Object.keys(got.files).sort()).toEqual(["roswaal.json", "src/a.luau"]);
	});

	it("takes the archive's name when the files are at its root", async () => {
		const got = await project("My Game.zip", { "roswaal.json": "{}", "src/a.luau": "" });
		expect(got.name).toBe("My Game");
	});

	it("leaves the clutter of a Mac, Windows and a repository behind", async () => {
		const got = await project("tank.zip", {
			"tank/roswaal.json": "{}",
			"tank/.DS_Store": "x",
			"__MACOSX/tank/._roswaal.json": "x",
			"tank/node_modules/a/index.js": "x",
			"tank/Thumbs.db": "x",
		});
		expect(Object.keys(got.files)).toEqual(["roswaal.json"]);
	});

	it("brings in text and places, and lists what it is not", async () => {
		const place = new Uint8Array([0x3c, 0x72, 0x6f, 0x00, 0xff]);
		const got = projectFromZip("tank.zip", {
			files: [
				{ path: "tank/roswaal.json", bytes: new TextEncoder().encode("{}") },
				{ path: "tank/place.rbxl", bytes: place },
				{ path: "tank/logo.png", bytes: new Uint8Array([0x89, 0x50, 0x00, 0xff]) },
			],
			dirs: [],
			skipped: [],
		});
		expect(Object.keys(got.files)).toEqual(["roswaal.json"]);
		expect(got.binaries).toEqual({ "place.rbxl": place });
		expect(got.skipped).toEqual([{ path: "tank/logo.png", reason: "not text" }]);
	});

	it("zips a place as its bytes, and reads it back the same", async () => {
		const place = Uint8Array.of(0, 1, 2, 255, 254);
		const blob = zip({ "tank/roswaal.json": "{}", "tank/place.rbxl": place });
		const back = projectFromZip("tank.zip", await unzip(await blob.arrayBuffer()));
		expect(Array.from(back.binaries["place.rbxl"])).toEqual([0, 1, 2, 255, 254]);
	});

	it("never lets a path leave the project", () => {
		expect(keepEntry("../../evil.luau")).toBe(false);
		expect(keepEntry("tank/../../evil.luau")).toBe(false);
		expect(keepEntry("/etc/passwd")).toBe(false);
		expect(keepEntry("tank/src/Main.luau")).toBe(true);
	});

	it("says when there is no roswaal.json, so the editor can ask", async () => {
		const got = await project("rojo-game.zip", { "rojo-game/default.project.json": "{}" });
		expect(got.isProject).toBe(false);
	});

	it("makes a name that is one path segment", () => {
		expect(projectName("tank/../game.zip")).toBe("tank-..-game");
		expect(projectName("..hidden")).toBe("hidden");
		expect(projectName("")).toBe("project");
		expect(projectName("Tank Game (2).zip")).toBe("Tank Game -2-");
	});
});

describe("the browser's project, remembered with its name", () => {
	function memory(): SnapshotStore & { text: string | null } {
		const store = {
			text: null as string | null,
			read: async () => store.text,
			write: async (next: string) => {
				store.text = next;
			},
			clear: async () => {
				store.text = null;
			},
		};
		return store;
	}

	it("comes back at the root it was imported at", async () => {
		const store = memory();
		const kept = persistence(store, "test");
		kept.touch(() => ({ files: { "/tank/roswaal.json": "{}" }, dirs: ["/tank"], root: "/tank" }));
		await kept.flush();
		expect((await persistence(store, "test").restore())?.root).toBe("/tank");
	});

	it("is the demo's when the stored project predates import", async () => {
		const store = memory();
		store.text = JSON.stringify({
			format: 1,
			version: "0.72.0",
			files: { "/demo/roswaal.json": "{}" },
		});
		expect((await persistence(store, "test").restore())?.root).toBeUndefined();
	});
});
