/**
 * The licences Roswaal carries, and the notices file each build writes.
 *
 * Two failures this guards. A licence that drifts from the file it was copied
 * from -- edited, reformatted, or regenerated from a template -- is a notice that
 * is no longer the holder's. And a bundled package that ships without its
 * notice is the thing `THIRD-PARTY-NOTICES.txt` exists to prevent; the build
 * stops rather than shipping one.
 */

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { licenceModuleIsCurrent } from "../scripts/lib/licenceModule.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { packageDirOf, packageDirsOf, renderNotices } from "../scripts/lib/notices.mjs";
import { CARRIED_LICENCES } from "../src/core/licenceData.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = join(ROOT, "notices", "upstream");

describe("the licences Roswaal keeps by hand", () => {
	/** The same `--check` `npm run build:licences -- --check` makes. */
	it("finds src/core/licenceData.ts current with notices/upstream/", async () => {
		expect(await licenceModuleIsCurrent(ROOT)).toBe(true);
	});

	it("carries each one byte for byte, with the hash of what it carries", () => {
		for (const licence of CARRIED_LICENCES) {
			const onDisk = readFileSync(join(UPSTREAM, licence.file), "utf8");
			expect(licence.text, licence.file).toBe(onDisk);
			const hash = createHash("sha256").update(onDisk, "utf8").digest("hex");
			expect(licence.sha256, licence.file).toBe(hash);
		}
	});

	it("says where every one came from, in sources.json and the folder's README", () => {
		const readme = readFileSync(join(UPSTREAM, "README.md"), "utf8");
		for (const licence of CARRIED_LICENCES) {
			expect(readme, licence.file).toContain(`\`${licence.file}\``);
			expect(licence.url, licence.file).toMatch(/^https:\/\//);
			expect(licence.retrieved, licence.file).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	/** The three added with the notices: each was missing a copy before. */
	it("includes the icons', Lune's and the Creator Documentation's", () => {
		const carried = CARRIED_LICENCES.map((licence) => `${licence.name} ${licence.spdx}`);
		expect(carried).toContain("Material Symbols Apache-2.0");
		expect(carried).toContain("Lune type definitions MPL-2.0");
		expect(carried).toContain("Roblox Creator Documentation CC-BY-4.0");
	});
});

describe("which package a bundled module comes from", () => {
	it("reads plain, scoped, nested and Windows paths", () => {
		const n = (path: string) => path.split("/").join(sep);
		expect(packageDirOf("/r/node_modules/react/index.js")).toBe(n("/r/node_modules/react"));
		expect(packageDirOf("/r/node_modules/@codemirror/view/dist/index.js")).toBe(
			n("/r/node_modules/@codemirror/view"),
		);
		expect(packageDirOf("/r/node_modules/express/node_modules/debug/src/node.js")).toBe(
			n("/r/node_modules/express/node_modules/debug"),
		);
		expect(packageDirOf("C:\\r\\node_modules\\react\\index.js")).toBe(n("C:/r/node_modules/react"));
	});

	it("ignores Roswaal's own code and the bundler's virtual modules", () => {
		expect(packageDirOf("/r/src/app/main.tsx")).toBeNull();
		expect(packageDirOf("\0vite/preload-helper.js")).toBeNull();
	});

	it("drops a query and lists each package once", () => {
		expect(
			packageDirsOf([
				"/r/node_modules/react/index.js",
				"/r/node_modules/react/cjs/react.production.js?commonjs-exports",
			]),
		).toHaveLength(1);
	});
});

describe("THIRD-PARTY-NOTICES.txt", () => {
	const scratch = mkdtempSync(join(tmpdir(), "roswaal-notices-"));
	afterAll(() => rmSync(scratch, { recursive: true, force: true }));

	const fakePackage = (name: string, licence?: string) => {
		const dir = join(scratch, "node_modules", name);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name, version: "1.2.3", license: "MIT" }),
		);
		if (licence) writeFileSync(join(dir, "LICENSE"), licence);
		return dir;
	};

	it("carries Node.js, every kept licence and each package's own file", async () => {
		const dir = fakePackage("left-pad", "MIT License\n\nCopyright (c) Someone\n");
		const text: string = await renderNotices({
			root: ROOT,
			packageDirs: [dir],
			node: { version: "24.0.0", text: "Node.js is licensed for use as follows:\n" },
		});
		expect(text).toContain("Node.js 24.0.0");
		expect(text).toContain("Node.js is licensed for use as follows:");
		for (const licence of CARRIED_LICENCES) expect(text, licence.name).toContain(licence.sha256);
		expect(text).toContain("left-pad 1.2.3 · MIT");
		expect(text).toContain("Copyright (c) Someone");
		expect(text).toContain("1 open-source package\n");
	});

	it("refuses a bundled package with no licence file to carry", async () => {
		const dir = fakePackage("no-licence");
		await expect(renderNotices({ root: ROOT, packageDirs: [dir] })).rejects.toThrow(
			/no-licence@1.2.3 is bundled but has no licence file/,
		);
	});
});
