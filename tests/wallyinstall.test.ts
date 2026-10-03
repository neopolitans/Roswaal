/**
 * Adding packages: from the Wally registry -- faked here, so the tests never
 * ask the real one -- and from zips, a Wally package's and anything else's.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { zip } from "../src/app/zip.js";
import { pickVersion, withDependency } from "../src/core/wally.js";
import { openProject } from "../src/server/project.js";
import { addFromWally, installGithub, installZip, removePackage } from "../src/server/wally.js";

const zipped = async (files: Record<string, string>) => new Uint8Array(await zip(files).arrayBuffer());

describe("wally.toml and versions", () => {
	it("picks the newest version a requirement allows", () => {
		const versions = ["1.0.0", "1.4.2", "2.0.0", "2.1.3", "0.3.1", "0.3.9", "0.4.0"];
		expect(pickVersion(versions)).toBe("2.1.3");
		expect(pickVersion(versions, "1.2.0")).toBe("1.4.2");
		expect(pickVersion(versions, "^2.0.0")).toBe("2.1.3");
		expect(pickVersion(versions, "0.3.0")).toBe("0.3.9");
		expect(pickVersion(versions, "=2.0.0")).toBe("2.0.0");
		expect(pickVersion(versions, "3.0.0")).toBeUndefined();
	});

	it("adds a line to a table, replaces one, and adds the table", () => {
		const toml = '[package]\nname = "a/b"\n\n[dependencies]\nSignal = "x/signal@1.0.0"\n\n[dev-dependencies]\n';
		expect(withDependency(toml, "shared", "Flux", "x/flux@^0.2.0")).toContain('Signal = "x/signal@1.0.0"\nFlux = "x/flux@^0.2.0"\n');
		expect(withDependency(toml, "shared", "Signal", "x/signal@2.0.0")).toContain('Signal = "x/signal@2.0.0"');
		expect(withDependency(toml, "server", "Store", "x/store@1.0.0")).toMatch(/\[server-dependencies\]\nStore = "x\/store@1\.0\.0"\n$/);
	});
});

describe("adding from the registry", () => {
	let root = "";
	let asked: string[] = [];
	beforeEach(() => {
		asked = [];
	});
	afterEach(async () => {
		vi.unstubAllGlobals();
		if (root) await rm(root, { recursive: true, force: true });
	});

	/** A registry with `orchard/basket`, which depends on `orchard/handle`. */
	async function registry(fail?: string) {
		const basket = await zipped({ "init.luau": "return { handle = require(script.Parent.Handle) }\n", "wally.toml": '[package]\nname = "orchard/basket"\nversion = "1.2.0"\n' });
		const handle = await zipped({ "init.luau": "return {}\n" });
		vi.stubGlobal("fetch", async (url: string) => {
			asked.push(url);
			if (fail && url.includes(fail)) return new Response("no", { status: 503 });
			const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
			if (url.endsWith("/package-metadata/orchard/basket")) {
				return json({ versions: [
					{ package: { version: "1.0.0" }, dependencies: {} },
					{ package: { version: "1.2.0" }, dependencies: { Handle: "orchard/handle@^0.1.0" } },
				] });
			}
			if (url.endsWith("/package-metadata/orchard/handle")) return json({ versions: [{ package: { version: "0.1.4" }, dependencies: {} }] });
			if (url.endsWith("/package-contents/orchard/basket/1.2.0")) return new Response(basket);
			if (url.endsWith("/package-contents/orchard/handle/0.1.4")) return new Response(handle);
			return new Response("?", { status: 404 });
		});
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-wallyadd-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await writeFile(path.join(root, "wally.toml"), '[package]\nname = "me/game"\nversion = "0.1.0"\n\n[dependencies]\n');
		return openProject(root);
	}

	const read = (rel: string) => readFile(path.join(root, rel), "utf8");

	it("writes the line, the thunks and the packages, with what they depend on", async () => {
		const out = await addFromWally(await registry(), "orchard/basket");
		expect(out).toMatchObject({ line: { alias: "Basket", spec: "orchard/basket@^1.2.0" }, installed: ["orchard_basket@1.2.0", "orchard_handle@0.1.4"], requests: 4 });
		expect(await read("wally.toml")).toContain('Basket = "orchard/basket@^1.2.0"');
		expect(await read("Packages/Basket.lua")).toBe('return require(script.Parent._Index["orchard_basket@1.2.0"]["basket"])\n');
		expect(await read("Packages/_Index/orchard_basket@1.2.0/Handle.lua")).toBe('return require(script.Parent.Parent["orchard_handle@0.1.4"]["handle"])\n');
		expect(await read("Packages/_Index/orchard_handle@0.1.4/handle/init.luau")).toBe("return {}\n");
	});

	it("asks nothing for a version already installed", async () => {
		const project = await registry();
		await addFromWally(project, "orchard/basket");
		asked = [];
		const again = await addFromWally(project, "orchard/basket@1.2.0");
		expect(again.installed).toEqual([]);
		expect(asked).toEqual(["https://api.wally.run/v1/package-metadata/orchard/basket"]);
	});

	it("keeps the line when the download fails, and says so", async () => {
		const out = await addFromWally(await registry("package-contents/orchard/basket"), "orchard/basket@1.2.0");
		expect(out.problem).toContain("503");
		expect(out.installed).toEqual([]);
		expect(await read("wally.toml")).toContain('Basket = "orchard/basket@1.2.0"');
	});

	it("removes a package with what only it needed, and says what still requires it", async () => {
		const project = await registry();
		await addFromWally(project, "orchard/basket");
		// Something else reaches Handle too, and an old folder nothing reaches.
		await writeFile(path.join(root, "Packages/Other.lua"), 'return require(script.Parent._Index["orchard_handle@0.1.4"]["handle"])\n');
		await mkdir(path.join(root, "Packages/_Index/someone_old@1.0.0"), { recursive: true });
		await mkdir(path.join(root, "src"), { recursive: true });
		await writeFile(path.join(root, "src/uses.server.luau"), "local Basket = require(game.ReplicatedStorage.Packages.Basket)\n");

		const out = await removePackage(project, "Basket");
		expect(out).toEqual({ removed: ["orchard_basket@1.2.0"], uses: ["src/uses.server.luau"] });
		expect(await read("wally.toml")).not.toContain("Basket");
		const exists = (rel: string) => stat(path.join(root, rel)).then(() => true, () => false);
		expect(await exists("Packages/Basket.lua")).toBe(false);
		expect(await exists("Packages/_Index/orchard_handle@0.1.4")).toBe(true);
		expect(await exists("Packages/_Index/someone_old@1.0.0")).toBe(true);

		// With Other gone too, Handle goes with the next removal that frees it.
		await rm(path.join(root, "Packages/Other.lua"));
		await addFromWally(project, "orchard/basket");
		expect((await removePackage(project, "Basket")).removed).toEqual(["orchard_basket@1.2.0", "orchard_handle@0.1.4"]);
	});

	it("leaves code vendored over a thunk, and says so", async () => {
		const project = await registry();
		await writeFile(path.join(root, "wally.toml"), '[dependencies]\nSignal = "x/signal@1.0.0"\n');
		await mkdir(path.join(root, "Packages"), { recursive: true });
		await writeFile(path.join(root, "Packages/Signal.lua"), '-- return require(script.Parent._Index["x_signal@1.0.0"]["signal"])\nreturn {}\n');
		const out = await removePackage(project, "Signal");
		expect(out.kept).toBe("Packages/Signal.lua");
		expect(await read("Packages/Signal.lua")).toContain("return {}");
		expect(await read("wally.toml")).not.toContain("Signal");
	});

	it("refuses something that is not scope/name", async () => {
		await expect(addFromWally(await registry(), "just a name")).rejects.toThrow(/scope\/name/);
	});
});

describe("inserting a zip", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function project() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-wallyzip-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		return openProject(root);
	}
	const read = (rel: string) => readFile(path.join(root, rel), "utf8");

	it("installs a Wally package where wally install would, and says what it lacks", async () => {
		const bytes = await zipped({
			"init.luau": "return {}\n",
			"wally.toml": '[package]\nname = "orchard/crate"\nversion = "0.3.0"\n\n[dependencies]\nLid = "orchard/lid@1.0.0"\n',
		});
		const out = await installZip(await project(), bytes, { alias: "Crate" });
		expect(out).toMatchObject({ line: { alias: "Crate", spec: "orchard/crate@0.3.0" }, installed: ["orchard_crate@0.3.0"] });
		expect(out.problem).toContain("Lid");
		expect(await read("Packages/Crate.lua")).toContain('_Index["orchard_crate@0.3.0"]["crate"]');
		expect(await read("wally.toml")).toContain('Crate = "orchard/crate@0.3.0"');
	});

	it("vendors a repository's module through its own project file", async () => {
		// Shaped as GitHub's archive is: one folder at the top.
		const bytes = await zipped({
			"someone-crate-abc123/default.project.json": '{ "name": "crate", "tree": { "$path": "lib" } }',
			"someone-crate-abc123/lib/init.luau": "return {}\n",
			"someone-crate-abc123/lib/Part.luau": "return 1\n",
			"someone-crate-abc123/README.md": "hello",
			"someone-crate-abc123/tests/init.spec.luau": "-- not copied",
		});
		const out = await installGithub(await project(), "someone/crate", async () => bytes);
		expect(out.installed).toEqual(["Packages/Crate"]);
		expect(await read("Packages/Crate/init.luau")).toBe("return {}\n");
		expect(await read("Packages/Crate/Part.luau")).toBe("return 1\n");
		await expect(read("Packages/Crate/tests/init.spec.luau")).rejects.toThrow();
	});

	it("will not vendor over a name Packages already has", async () => {
		const opened = await project();
		const bytes = await zipped({ "init.luau": "return {}\n" });
		await installZip(opened, bytes, { alias: "Crate", vendor: true });
		await expect(installZip(opened, bytes, { alias: "Crate", vendor: true })).rejects.toThrow(/already has Crate/);
	});

	/** A package could name an entry `../../roswaal.json` and land on top of it. */
	it("writes nothing outside the package's own folder", async () => {
		const opened = await project();
		const before = await read("roswaal.json");
		const bytes = await zipped({
			"init.luau": "return {}\n",
			"wally.toml": '[package]\nname = "orchard/crate"\nversion = "0.3.0"\n',
			"../../../roswaal.json": "{}",
			"../../escaped.luau": "return 0\n",
		});
		await installZip(opened, bytes, { alias: "Crate" });
		expect(await read("roswaal.json")).toBe(before);
		await expect(read("escaped.luau")).rejects.toThrow();
		await expect(read("Packages/escaped.luau")).rejects.toThrow();
	});

	it("refuses a package whose version is not a version", async () => {
		const bytes = await zipped({
			"init.luau": "return {}\n",
			"wally.toml": '[package]\nname = "orchard/crate"\nversion = "0.3.0/../../../x"\n',
		});
		await expect(installZip(await project(), bytes, { alias: "Crate" })).rejects.toThrow(/not a version/);
	});

	it("refuses an alias that is not a plain name", async () => {
		const opened = await project();
		await expect(installZip(opened, await zipped({ "init.luau": "return {}\n" }), { alias: "../Crate", vendor: true }))
			.rejects.toThrow(/package alias/);
		await expect(removePackage(opened, "../../roswaal")).rejects.toThrow(/package alias/);
	});

	it("says when a zip has no module to vendor", async () => {
		await expect(installZip(await project(), await zipped({ "notes.txt": "hi" }), { fileName: "Notes.zip" })).rejects.toThrow(/no module/);
	});
});
