/**
 * Roswaal keeps to the project it has open, on disk as well as on paper.
 *
 * `safeJoin` keeps a path inside its project by its spelling. These are the
 * ways a project's own contents could still lead out of it: a symbolic link
 * committed in a repository, a `roswaal.json` naming folders elsewhere, and a
 * Wally thunk naming a folder above `_Index`.
 *
 * The link tests need a machine that can make links: Windows only lets a
 * process do so with Developer Mode on, so there they skip rather than fail.
 */

import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig } from "../src/server/config.js";
import { fs } from "../src/server/host.js";
import { safeJoin, staysInside } from "../src/server/paths.js";
import { openProject } from "../src/server/project.js";
import { removePackage } from "../src/server/wally.js";

let base = "";
let project = "";
let outside = "";

beforeEach(async () => {
	base = await mkdtemp(path.join(os.tmpdir(), "roswaal-bounds-"));
	project = path.join(base, "project");
	outside = path.join(base, "outside");
	await mkdir(path.join(project, "src"), { recursive: true });
	await mkdir(outside, { recursive: true });
	await writeFile(path.join(project, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	await writeFile(path.join(outside, "secret.txt"), "not the project's\n");
});

afterEach(async () => {
	await rm(base, { recursive: true, force: true });
});

/** Makes a link, or says the machine cannot. */
async function link(target: string, at: string, type?: "dir" | "file"): Promise<boolean> {
	try {
		await symlink(target, at, type);
		return true;
	} catch {
		return false;
	}
}

const exists = (abs: string) =>
	stat(abs).then(
		() => true,
		() => false,
	);

describe("a link that leads out of the project", () => {
	it("is not read through", async (ctx) => {
		const leak = safeJoin(project, "src/Leak.luau");
		if (!(await link(path.join(outside, "secret.txt"), leak))) return ctx.skip();
		await expect(fs.readFile(leak, "utf8")).rejects.toThrow(/leads outside the project/);
	});

	it("is not written through, even when it leads to nothing yet", async (ctx) => {
		const out = safeJoin(project, "src/Main.server.luau");
		const planted = path.join(outside, "planted.luau");
		if (!(await link(planted, out))) return ctx.skip();
		await expect(fs.writeFile(out, "print(1)", "utf8")).rejects.toThrow(/not there/);
		expect(await exists(planted)).toBe(false);
	});

	it("is not written into when it is a folder", async (ctx) => {
		if (!(await link(outside, safeJoin(project, "src/Shared"), "dir"))) return ctx.skip();
		const into = safeJoin(project, "src/Shared/Module.luau");
		await expect(fs.writeFile(into, "return {}", "utf8")).rejects.toThrow(/outside the project/);
		await expect(
			fs.mkdir(safeJoin(project, "src/Shared/deeper"), { recursive: true }),
		).rejects.toThrow();
		expect(await exists(path.join(outside, "Module.luau"))).toBe(false);
	});

	it("is not deleted through, though the link itself may go", async (ctx) => {
		const shared = safeJoin(project, "src/Shared");
		if (!(await link(outside, shared, "dir"))) return ctx.skip();
		await expect(fs.rm(path.join(shared, "secret.txt"), { force: true })).rejects.toThrow();
		await fs.rm(shared, { recursive: true, force: true });
		expect(await exists(shared)).toBe(false);
		expect(await readFile(path.join(outside, "secret.txt"), "utf8")).toBe("not the project's\n");
	});

	it("is listed but not opened by a walk of the tree", async (ctx) => {
		if (!(await link(outside, safeJoin(project, "src/Shared"), "dir"))) return ctx.skip();
		await expect(fs.readdir(safeJoin(project, "src/Shared"))).rejects.toThrow();
		const names = await fs.readdir(safeJoin(project, "src"));
		expect(names).toContain("Shared");
	});
});

describe("what is not a way out", () => {
	it("a link that stays inside the project is followed as before", async (ctx) => {
		await writeFile(path.join(project, "src", "Real.luau"), "return 1\n");
		const alias = safeJoin(project, "src/Alias.luau");
		if (!(await link(path.join(project, "src", "Real.luau"), alias))) return ctx.skip();
		expect(await fs.readFile(alias, "utf8")).toBe("return 1\n");
	});

	it("a project reached through a link of its own -- macOS's /tmp, a synced folder -- works", async (ctx) => {
		const viaLink = path.join(base, "shortcut");
		if (!(await link(project, viaLink, "dir"))) return ctx.skip();
		const file = safeJoin(viaLink, "src/Through.luau");
		await fs.writeFile(file, "return 2\n", "utf8");
		expect(await fs.readFile(file, "utf8")).toBe("return 2\n");
	});

	it("plain files are read, written and removed as ever", async () => {
		const file = safeJoin(project, "src/Plain.luau");
		await fs.writeFile(file, "return 3\n", "utf8");
		expect(await fs.readFile(file, "utf8")).toBe("return 3\n");
		await fs.rm(file, { force: true });
		expect(await exists(file)).toBe(false);
	});
});

describe("folders named in roswaal.json", () => {
	it("stay inside the project", () => {
		for (const ok of ["src", ".roswaal/scripts", "./out", "src/../src", "."]) {
			expect(staysInside(ok), ok).toBe(true);
		}
		for (const out of [
			"..",
			"../shared",
			"src/../../x",
			"/etc",
			"\\\\server\\share",
			"C:\\Users",
			"c:/x",
		]) {
			expect(staysInside(out), out).toBe(false);
		}
	});

	it("that lead elsewhere are refused when the project is read", () => {
		const config = (extra: Record<string, unknown>) => ({ schemaVersion: 1, ...extra });
		expect(() => parseConfig(config({ outDir: "../elsewhere" }))).toThrow(/outDir/);
		expect(() => parseConfig(config({ sourceDir: "/etc" }))).toThrow(/sourceDir/);
		expect(() => parseConfig(config({ nodePaths: [".roswaal/nodes", "../../packs"] }))).toThrow(
			/nodePaths/,
		);
		expect(() => parseConfig(config({ outDir: "src" }))).not.toThrow();
	});
});

describe("removing a Wally package", () => {
	it("deletes nothing above _Index, whatever a thunk names", async () => {
		const packages = path.join(project, "Packages");
		const real = path.join(packages, "_Index", "real_pkg@1.0.0");
		await mkdir(real, { recursive: true });
		await writeFile(
			path.join(project, "wally.toml"),
			'[package]\nname = "me/game"\nversion = "0.1.0"\n\n[dependencies]\nTrap = "x/trap@1.0.0"\n',
		);
		// The package removed reaches one whose own thunk names the folder
		// above `_Index`'s parent: the project. Nothing else reaches either, so
		// both are "unreached" once it goes.
		await writeFile(
			path.join(packages, "Trap.lua"),
			'return require(script.Parent._Index["real_pkg@1.0.0"]["x"])\n',
		);
		await writeFile(
			path.join(real, "Up.lua"),
			'return require(script.Parent.Parent["../.."]["x"])\n',
		);
		const opened = await openProject(project);
		const out = await removePackage(opened, "Trap");
		expect(out.removed).toEqual(["real_pkg@1.0.0"]);
		expect(await exists(path.join(project, "roswaal.json"))).toBe(true);
		expect(await exists(path.join(packages, "_Index"))).toBe(true);
		expect(await exists(real)).toBe(false);
	});
});
