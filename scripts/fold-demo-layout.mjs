/**
 * Folds the demo project's layout back into the module the page draws from.
 *
 * `build-lune-demo.mjs` writes the project from `DEMOS`; this reads one thing
 * back. The two are not fighting, because they carry different halves: the
 * programme — which nodes, wired how, configured how — is authored in
 * `demos.ts`, and the *layout* is authored in the editor, which is better at
 * it than a placement rule is. A graph laid out by column and row is tidy in
 * the way a spreadsheet is tidy; one somebody has nudged is tidy in the way
 * that makes a picture readable.
 *
 * So: open the project, tidy a graph, save, and run this. What it writes is
 * `src/core/docs/demoLayout.ts`, which the page applies over the graphs it
 * builds — so the picture in the documentation is the arrangement somebody
 * actually made.
 *
 *     npm run demo:fold
 *
 * Through tsx, because `demos.ts` is TypeScript. `tests/lunedemo.test.ts`
 * checks the two agree, so a tidy-up that was never folded back fails rather
 * than leaving the page drawing the version before.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEMOS } from "../src/core/docs/demos.ts";
import { demoLayoutSource } from "./lib/demoLayoutSource.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = join(root, "examples", "lune-demo", ".roswaal", "scripts");
const OUT = join(root, "src", "core", "docs", "demoLayout.ts");

/** @type {Record<string, Record<string, { x: number; y: number }>>} */
const layout = {};
for (const demo of DEMOS) {
	const file = join(PROJECT, `${demo.slug}.nodescript`);
	const script = JSON.parse(await readFile(file, "utf8"));
	layout[demo.slug] = Object.fromEntries(
		script.nodes.map((/** @type {{ id: string; x: number; y: number }} */ node) =>
			[node.id, { x: node.x, y: node.y }]),
	);
}

await writeFile(OUT, demoLayoutSource(layout), "utf8");
console.log(`demo layout: ${DEMOS.length} graphs -> src/core/docs/demoLayout.ts`);
