/**
 * Several places in a project: one in use, at the root, and the rest waiting
 * in .roswaal/places. A copy, a baseplate or an imported place added while
 * one is in use waits there; Use swaps one in, and is refused while Studio
 * has either open.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig } from "../src/server/config.js";
import { createProject } from "../src/server/newProject.js";
import { ApiSession } from "../src/server/routes.js";

const counter = () => {
	let n = 0;
	return () => `id-${++n}`;
};

describe("places waiting in .roswaal/places", () => {
	let base = "";
	afterEach(async () => {
		if (base) await fs.rm(base, { recursive: true, force: true });
	});

	async function open() {
		base = await fs.mkdtemp(path.join(os.tmpdir(), "roswaal-places-"));
		const root = path.join(base, "Obby");
		await createProject(root, { name: "Obby", target: "roblox", place: true }, counter());
		const session = new ApiSession({});
		await session.openAt(root);
		const post = (route: string, body: unknown = {}) => session.handle("POST", route, { body });
		const there = (rel: string) =>
			fs.stat(path.join(root, rel)).then(
				() => true,
				() => false,
			);
		return { root, post, there };
	}

	it("takes a copy of the place in use, as the file is", async () => {
		const { root, post } = await open();
		const made = (await post("/place/copy")) as { file: string };
		expect(made.file).toBe(".roswaal/places/place copy.rbxl");
		const [a, b] = await Promise.all([
			fs.readFile(path.join(root, "place.rbxl")),
			fs.readFile(path.join(root, made.file)),
		]);
		expect(b.equals(a)).toBe(true);
	});

	it("keeps a baseplate added while a place is in use", async () => {
		const { post } = await open();
		const made = (await post("/place/new")) as { file: string };
		expect(made.file).toBe(".roswaal/places/Baseplate.rbxl");
	});

	it("swaps a waiting place in, and the one in use out, and roswaal.json names it", async () => {
		const { root, post, there } = await open();
		await post("/place/copy");
		const used = (await post("/place/use", { path: ".roswaal/places/place copy.rbxl" })) as {
			file: string;
		};
		expect(used.file).toBe("place copy.rbxl");
		expect(await there("place copy.rbxl")).toBe(true);
		expect(await there(".roswaal/places/place.rbxl")).toBe(true);
		expect(await there("place.rbxl")).toBe(false);
		const config = parseConfig(
			JSON.parse(await fs.readFile(path.join(root, "roswaal.json"), "utf8")),
		);
		expect(config.place).toBe("place copy.rbxl");
	});

	it("swaps in a second place beside the one in use, which waits in .roswaal/places (1.0.1)", async () => {
		const { root, post, there } = await open();
		await fs.copyFile(path.join(root, "place.rbxl"), path.join(root, "Other.rbxl"));
		const used = (await post("/place/use", { path: "Other.rbxl" })) as { file: string };
		expect(used.file).toBe("Other.rbxl");
		expect(await there("Other.rbxl")).toBe(true);
		expect(await there(".roswaal/places/place.rbxl")).toBe(true);
		expect(await there("place.rbxl")).toBe(false);
		const config = parseConfig(
			JSON.parse(await fs.readFile(path.join(root, "roswaal.json"), "utf8")),
		);
		expect(config.place).toBe("Other.rbxl");
		await expect(post("/place/use", { path: "notes.txt" })).rejects.toThrow(/place file/);
	});

	it("is refused while Studio has the place in use open", async () => {
		const { root, post, there } = await open();
		await post("/place/copy");
		await fs.writeFile(path.join(root, "place.rbxl.lock"), "");
		await expect(post("/place/use", { path: ".roswaal/places/place copy.rbxl" })).rejects.toThrow(
			/open in Studio/,
		);
		expect(await there("place.rbxl")).toBe(true);
	});
});
