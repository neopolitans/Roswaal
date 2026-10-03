/**
 * The build scripts: their own instructions, and the checks they make.
 *
 * A script that imports TypeScript fails under plain `node`, so the command
 * its header gives has to be one that runs it through tsx. The demo layout it
 * folds back is TypeScript a node id of any shape has to survive. And the
 * checks a script makes before it writes — a generated file current, a built
 * editor the right version — are run here, where something runs them.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";

import { DEMO_LAYOUT } from "../src/core/docs/demoLayout.js";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { demoLayoutSource } from "../scripts/lib/demoLayoutSource.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { bundleHasVersion } from "../scripts/lib/distVersion.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { themeModuleIsCurrent } from "../scripts/lib/themeModule.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "scripts");
const PACKAGE = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
	scripts: Record<string, string>;
};

/** The scripts that import a `.ts` module, directly. */
function importsTypeScript(): string[] {
	return readdirSync(SCRIPTS)
		.filter((name) => name.endsWith(".mjs"))
		.filter((name) => /from "[^"]+\.tsx?"/.test(readFileSync(join(SCRIPTS, name), "utf8")));
}

describe("the scripts' commands", () => {
	it("finds scripts that import TypeScript", () => {
		expect(importsTypeScript()).toContain("fold-demo-layout.mjs");
	});

	it("never tells you to run a TypeScript-importing script with plain node", () => {
		for (const name of importsTypeScript()) {
			const text = readFileSync(join(SCRIPTS, name), "utf8");
			expect(text, name).not.toMatch(new RegExp(`node (--[\\w-]+ )*scripts/${name}`));
		}
	});

	it("gives every one of them an npm script that runs it through tsx", () => {
		const commands = Object.values(PACKAGE.scripts);
		for (const name of importsTypeScript()) {
			expect(commands.some((c) => c.includes(`tsx scripts/${name}`)), name).toBe(true);
		}
	});
});

describe("where the scripts write, and what they embed", () => {
	/** The same `--check` `npm run build:themes -- --check` makes. */
	it("finds src/core/themeData.ts current with themes/", async () => {
		expect(await themeModuleIsCurrent(ROOT)).toBe(true);
	});

	it("resolves every output from the repository, never the shell's folder", () => {
		for (const name of readdirSync(SCRIPTS).filter((n) => /\.m?[jt]s$/.test(n))) {
			expect(readFileSync(join(SCRIPTS, name), "utf8"), name).not.toContain("process.cwd()");
		}
	});

	it("reads the release version from version.json, as everything else does", () => {
		const binary = readFileSync(join(SCRIPTS, "build-binary.mjs"), "utf8");
		expect(binary).toContain('join(root, "version.json")');
		expect(binary).not.toContain('join(root, "package.json")');
	});

	it("tells a built editor of this version from one of another", () => {
		const built = "var a=[{version:`0.117.0`,date:`2026-10-03`}];";
		expect(bundleHasVersion([built], "0.117.0")).toBe(true);
		expect(bundleHasVersion(['x={"version":"0.117.0"}'], "0.117.0")).toBe(true);
		expect(bundleHasVersion([built], "0.118.0")).toBe(false);
		// A version named in prose is not a build of it.
		expect(bundleHasVersion(["see 0.118.0 for more"], "0.118.0")).toBe(false);
	});
});

describe("the folded demo layout", () => {
	it("is TypeScript whatever the node ids look like", () => {
		const source: string = demoLayoutSource({
			"count-characters": {
				n0: { x: 0, y: 0 },
				"3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f": { x: 10, y: -20 },
			},
		});
		expect(() => transformSync(source, { loader: "ts" })).not.toThrow();
		expect(source).toContain('"3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f": { x: 10, y: -20 },');
		expect(source).toContain("\t\tn0: { x: 0, y: 0 },");
	});

	it("writes back the committed module from its own data", () => {
		const committed = readFileSync(join(ROOT, "src/core/docs/demoLayout.ts"), "utf8")
			.replace(/\r\n/g, "\n");
		expect(demoLayoutSource(DEMO_LAYOUT)).toBe(committed);
	});
});
