/**
 * Writing a project's scripts back into its place: only sources change, every
 * other byte of a binary place is kept, and anything that cannot be matched
 * for certain is reported rather than guessed at.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { isScript, pathOf, readRbx, stringProp } from "../src/core/rbx/index.js";
import { planPlaceUpdate } from "../src/core/rbx/placeExport.js";
import { planImport, surveyPlace } from "../src/core/rbx/placeImport.js";
import { writeSources } from "../src/core/rbx/writer.js";
import { exportPlace, openProject, writePlaceImport } from "../src/server/project.js";
import { ApiSession } from "../src/server/routes.js";
import { buildPlace, type Compression, folder, script, service } from "./rbxfixture.js";

const id = (c: string) => ({ UniqueId: { type: 31, value: c.repeat(32) } });

const tree = () => [
	service("ServerScriptService", [script("Script", "Main", "print('main')", id("a"))]),
	service("ReplicatedStorage", [
		script("ModuleScript", "Util", "return {}", id("b")),
		folder("Twins", [script("ModuleScript", "Same", "return 1"), script("ModuleScript", "Same", "return 2")]),
	]),
	service("Workspace", [{ className: "Part", name: "Coin", props: { Transparency: { type: 4, value: 0.25 } } }]),
];

const sourceOf = (bytes: Uint8Array, name: string) =>
	stringProp(readRbx(bytes).instances.find((i) => isScript(i) && i.name === name)!, "Source");

describe("writing sources into a binary place", () => {
	for (const compression of ["none", "lz4", "zstd"] as Compression[]) {
		it(`changes only the scripts asked for, in a place with ${compression} chunks`, () => {
			const bytes = buildPlace(tree(), compression);
			const doc = readRbx(bytes);
			const main = doc.instances.find((i) => i.name === "Main")!;
			const out = writeSources(bytes, doc, [{ inst: main, source: "print('edited')" }]);
			expect(sourceOf(out, "Main")).toBe("print('edited')");
			expect(sourceOf(out, "Util")).toBe("return {}");
			const back = readRbx(out);
			expect(back.instances.length).toBe(doc.instances.length);
			expect(back.instances.find((i) => i.name === "Coin")!.props.get("Transparency")?.value).toBe(0.25);
		});
	}

	it("keeps every chunk it does not rewrite byte for byte", () => {
		const bytes = buildPlace(tree(), "zstd");
		const doc = readRbx(bytes);
		const out = writeSources(bytes, doc, [{ inst: doc.instances.find((i) => i.name === "Util")!, source: "return 2" }]);
		// The ModuleScript class's Source chunk is the only one that differs.
		const chunks = (b: Uint8Array) => {
			const list: string[] = [];
			const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
			for (let p = 32; p + 16 <= b.length; ) {
				const size = v.getUint32(p + 4, true) || v.getUint32(p + 8, true);
				list.push(Buffer.from(b.subarray(p, p + 16 + size)).toString("hex"));
				p += 16 + size;
			}
			return list;
		};
		const a = chunks(bytes);
		const b = chunks(out);
		expect(b.length).toBe(a.length);
		expect(a.filter((c, i) => c !== b[i])).toHaveLength(1);
	});

	it("returns an unchanged copy when there is nothing to write", () => {
		const bytes = buildPlace(tree());
		expect(Buffer.from(writeSources(bytes, readRbx(bytes), [])).equals(Buffer.from(bytes))).toBe(true);
	});
});

describe("writing sources into an XML place", () => {
	const XML = `<roblox version="4">
	<Item class="ServerScriptService" referent="RBX1">
		<Properties><string name="Name">ServerScriptService</string></Properties>
		<Item class="Script" referent="RBX2">
			<Properties>
				<string name="Name">Main</string>
				<ProtectedString name="Source"><![CDATA[print("old")]]></ProtectedString>
			</Properties>
		</Item>
		<Item class="Script" referent="RBX3">
			<Properties>
				<string name="Name">Other</string>
				<ProtectedString name="Source"><![CDATA[print("kept")]]></ProtectedString>
			</Properties>
		</Item>
	</Item>
</roblox>`;

	it("replaces the source and leaves the rest of the text as it was", () => {
		const bytes = new TextEncoder().encode(XML);
		const doc = readRbx(bytes);
		const main = doc.instances.find((i) => i.name === "Main")!;
		const out = writeSources(bytes, doc, [{ inst: main, source: "local s = 'a]]>b'\nprint(s)" }]);
		expect(sourceOf(out, "Main")).toBe("local s = 'a]]>b'\nprint(s)");
		expect(sourceOf(out, "Other")).toBe('print("kept")');
		const text = new TextDecoder().decode(out);
		expect(text.startsWith('<roblox version="4">\n\t<Item class="ServerScriptService"')).toBe(true);
	});
});

describe("matching files to scripts", () => {
	const doc = readRbx(buildPlace(tree()));

	it("finds a script by its id, then by its path", () => {
		const update = planPlaceUpdate(doc, [
			{ file: "a.luau", text: "print('a')", className: "Script", targets: [{ path: ["Elsewhere"], id: "a".repeat(32) }] },
			{ file: "b.luau", text: "return {}", isModule: true, targets: [{ path: ["ReplicatedStorage", "Util"] }] },
		]);
		expect(update.updated).toEqual(["a.luau"]);
		expect(update.unchanged).toEqual(["b.luau"]);
		expect(pathOf(update.changes[0].inst)).toEqual(["ServerScriptService", "Main"]);
	});

	it("reports what it cannot place for certain", () => {
		const update = planPlaceUpdate(doc, [
			{ file: "new.luau", text: "", isModule: true, targets: [{ path: ["Lighting", "New"] }] },
			{ file: "twin.luau", text: "", isModule: true, targets: [{ path: ["ReplicatedStorage", "Twins", "Same"] }] },
			{ file: "main.luau", text: "", isModule: true, targets: [{ path: ["ServerScriptService", "Main"] }] },
		]);
		expect(update.notInPlace).toEqual(["new.luau"]);
		expect(update.ambiguous).toEqual(["twin.luau"]);
		expect(update.wrongClass).toEqual(["main.luau"]);
		expect(update.changes).toHaveLength(0);
	});
});

describe("exporting a project's place", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("writes edited files, merged copies included, and adds new ones", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-export-"));
		const place = buildPlace([
			service("ServerScriptService", [script("Script", "Main", "print('main')")]),
			service("Workspace", [
				folder("Door1", [script("Script", "Open", "open()")], "Model"),
				folder("Door2", [script("Script", "Open", "open()")], "Model"),
			]),
		], "zstd");
		await writeFile(path.join(root, "Game.rbxl"), place);
		const plan = planImport(surveyPlace(readRbx(place)), {
			scope: "all", dedupe: true, outDir: "src", placeFile: "Game.rbxl", name: "Game",
		});
		await writePlaceImport(root, plan.files, "Game.rbxl");

		await writeFile(path.join(root, "src/ServerScriptService/Main.server.luau"), "print('edited')");
		await writeFile(path.join(root, "place/Shared/Open.server.luau"), "open(true)");
		await writeFile(path.join(root, "src/ServerScriptService/Added.server.luau"), "print('new')");

		const out = (await exportPlace(await openProject(root)))!;
		expect(out.file).toBe("Game.rbxl");
		expect(out.update.updated.sort()).toEqual(["place/Shared/Open.server.luau", "src/ServerScriptService/Main.server.luau"]);
		expect(out.update.addedFiles).toEqual(["src/ServerScriptService/Added.server.luau"]);
		const back = readRbx(out.bytes);
		const sources = back.instances.filter(isScript).map((i) => `${pathOf(i).join(".")}=${stringProp(i, "Source")}`).sort();
		expect(sources).toEqual([
			"ServerScriptService.Added=print('new')",
			"ServerScriptService.Main=print('edited')",
			"Workspace.Door1.Open=open(true)",
			"Workspace.Door2.Open=open(true)",
		]);
		// Nothing on disk changed: the place is only read.
		expect(Buffer.from(await readFile(path.join(root, "Game.rbxl"))).equals(Buffer.from(place))).toBe(true);
	});
});

describe("the export's name", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	/**
	 * The folder's own name, whatever separator its path uses. The route took a
	 * posix basename, and the daemon's root on Windows is a Windows path, so the
	 * name was the whole path -- in Download's zip name, and in the Export menu.
	 */
	it("is the project folder's name, not its path", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-name-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		const session = new ApiSession({});
		await session.openAt(root);
		const exported = await session.handle("GET", "/export", { query: {} }) as { name: string };
		expect(exported.name).toBe(path.basename(root));
		expect(exported.name).not.toMatch(/[\\/]/);
	});
});
