/**
 * A place in the browser's project: kept as bytes in the volume, written the
 * way the CLI writes it, exported with the project, and persisted apart from
 * the text so a reload keeps it without rewriting it on every change.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fromBase64 } from "../src/core/base64.js";
import { readRbx } from "../src/core/rbx/index.js";
import { planImport, surveyPlace } from "../src/core/rbx/placeImport.js";
import { persistence, type SnapshotStore } from "../src/web/persist.js";
import { Volume } from "../src/web/volume.js";
import { buildPlace, script, service } from "./rbxfixture.js";

vi.mock("../src/server/host.js", async () => {
	const { posixPath: path } = await import("../src/web/posixPath.js");
	const { Volume: MemoryVolume } = await import("../src/web/volume.js");
	const volume = new MemoryVolume();
	return { volume, fs: volume, path, formatLuau: (_cwd: string, code: string) => ({ code }) };
});

const { volume } = (await import("../src/server/host.js")) as unknown as { volume: Volume };
const { collectBinaries, collectProject, findPlaceFile, openProject, writePlaceImport } =
	await import("../src/server/project.js");

const PLACE = buildPlace(
	[
		service("ServerScriptService", [script("Script", "Main", "print('hi')")]),
		service("Workspace", [
			{ className: "Part", name: "Coin", children: [script("Script", "Spin", "spin()")] },
		]),
	],
	"zstd",
);

describe("a volume holding bytes", () => {
	it("reads a file back as text or as bytes, as Node does", async () => {
		const v = new Volume();
		await v.mkdir("/p", { recursive: true });
		await v.writeFile("/p/place.rbxl", Uint8Array.of(1, 2, 3));
		await v.writeFile("/p/a.txt", "hé", "utf8");
		expect(Array.from(await v.readFile("/p/place.rbxl"))).toEqual([1, 2, 3]);
		expect(Array.from(await v.readFile("/p/a.txt"))).toEqual([104, 195, 169]);
		expect(await v.readFile("/p/a.txt", "utf8")).toBe("hé");
	});

	it("notes when a binary file changes, and only then", async () => {
		const v = new Volume();
		await v.mkdir("/p", { recursive: true });
		const start = v.binaryStamp;
		await v.writeFile("/p/a.txt", "x", "utf8");
		expect(v.binaryStamp).toBe(start);
		await v.writeFile("/p/place.rbxl", Uint8Array.of(1));
		const written = v.binaryStamp;
		expect(written).toBeGreaterThan(start);
		await v.rename("/p/place.rbxl", "/p/moved.rbxl");
		expect(v.binaryStamp).toBeGreaterThan(written);
	});
});

describe("a place imported in the browser", () => {
	const root = "/Game";

	it("is written as the CLI writes it, with the place kept as bytes", async () => {
		const plan = planImport(surveyPlace(readRbx(PLACE)), {
			scope: "all",
			dedupe: true,
			outDir: "src",
			placeFile: "Game.rbxl",
			name: "Game",
		});
		await volume.mkdir(root, { recursive: true });
		await volume.writeFile(`${root}/Game.rbxl`, PLACE);
		const map = await writePlaceImport(root, plan.files, "Game.rbxl");
		expect(map.written).toBe(true);

		const project = await openProject(root);
		expect(project.config.place).toBe("Game.rbxl");
		expect(await findPlaceFile(root, project.config)).toBe("Game.rbxl");
		expect(await volume.readFile(`${root}/src/ServerScriptService/Main.server.luau`, "utf8")).toBe(
			"print('hi')",
		);
		expect(await volume.readFile(`${root}/place/Workspace/Coin/Spin.server.luau`, "utf8")).toBe(
			"spin()",
		);
		expect(JSON.parse(await volume.readFile(`${root}/default.project.json`, "utf8")).name).toBe(
			"Game",
		);
	});

	it("goes out with the project when it is downloaded", async () => {
		const project = await openProject(root);
		const binaries = await collectBinaries(project);
		expect(Object.keys(binaries)).toEqual(["Game.rbxl"]);
		expect(Buffer.from(fromBase64(binaries["Game.rbxl"])).equals(Buffer.from(PLACE))).toBe(true);
		// The text export is unchanged: the place is not in it as a string.
		expect(Object.keys(await collectProject(project))).not.toContain("Game.rbxl");
	});
});

describe("a property changed in the browser", () => {
	it("is written into the volume's place, after a backup there", async () => {
		const root = "/Changed";
		const place = buildPlace(
			[
				service("Workspace", [
					{ className: "Part", name: "Floor", props: { Anchored: { type: 2, value: false } } },
				]),
			],
			"zstd",
		);
		await volume.mkdir(root, { recursive: true });
		await volume.writeFile(`${root}/roswaal.json`, JSON.stringify({ schemaVersion: 1 }), "utf8");
		await volume.writeFile(`${root}/place.rbxl`, place);
		const { ApiSession } = await import("../src/server/routes.js");
		const session = new ApiSession({});
		await session.openAt(root);
		const tree = (await session.handle("GET", "/place")) as {
			stamp: string;
			outline: { nodes: [number, string, number, number][] };
		};
		const index = tree.outline.nodes.findIndex(([, n]) => n === "Floor");
		const before = volume.binaryStamp;
		const answer = (await session.handle("POST", "/place/property", {
			body: { stamp: tree.stamp, index, property: "Anchored", value: true },
		})) as { backup: string };
		const floor = readRbx(await volume.readFile(`${root}/place.rbxl`)).instances.find(
			(i) => i.name === "Floor",
		);
		expect(floor?.props.get("Anchored")?.value).toBe(true);
		expect(Array.from(await volume.readFile(`${root}/${answer.backup}`))).toEqual(
			Array.from(place),
		);
		expect(volume.binaryStamp).toBeGreaterThan(before);
	});
});

describe("keeping a place across a reload", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function store() {
		let document: string | null = null;
		let binaries: Record<string, Uint8Array> = {};
		const s: SnapshotStore & { binaryWrites: number; document: () => string | null } = {
			binaryWrites: 0,
			document: () => document,
			async read() {
				return document;
			},
			async write(text) {
				document = text;
			},
			async clear() {
				document = null;
				binaries = {};
			},
			async readBinaries() {
				return binaries;
			},
			async writeBinaries(files) {
				s.binaryWrites++;
				binaries = files;
			},
		};
		return s;
	}

	it("keeps the place out of the document and writes it only when it changes", async () => {
		const s = store();
		const kept = persistence(s, "9.9.9");
		const files = { "/Game/roswaal.json": "{}", "/Game/Game.rbxl": PLACE };
		kept.touch(() => ({ files, dirs: ["/Game"], root: "/Game", binaryStamp: 1 }));
		await vi.advanceTimersByTimeAsync(500);
		expect(s.binaryWrites).toBe(1);
		expect(JSON.parse(s.document()!).files).toEqual({ "/Game/roswaal.json": "{}" });

		// A text change with the same stamp does not write the place again.
		kept.touch(() => ({
			files: { ...files, "/Game/roswaal.json": "{ }" },
			dirs: [],
			root: "/Game",
			binaryStamp: 1,
		}));
		await vi.advanceTimersByTimeAsync(500);
		expect(s.binaryWrites).toBe(1);

		const back = await persistence(s, "9.9.9").restore();
		expect(
			Buffer.from(back!.files["/Game/Game.rbxl"] as Uint8Array).equals(Buffer.from(PLACE)),
		).toBe(true);
		expect(back!.files["/Game/roswaal.json"]).toBe("{ }");
	});
});
