/**
 * The build scripts' own instructions, and what they write.
 *
 * A script that imports TypeScript fails under plain `node`, so the command
 * its header gives has to be one that runs it through tsx. And the demo layout
 * it folds back is TypeScript a node id of any shape has to survive.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";

import { DEMO_LAYOUT } from "../src/core/docs/demoLayout.js";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { demoLayoutSource } from "../scripts/lib/demoLayoutSource.mjs";

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
