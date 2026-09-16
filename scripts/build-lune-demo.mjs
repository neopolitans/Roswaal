/**
 * Writes `examples/lune-demo` from the graphs the demos page draws.
 *
 * The four programmes exist twice by necessity: as pictures on
 * [Lune demos](lune-demos), and as a project somebody can actually open. Typing
 * them out a second time would be two sources for one thing, and the copy
 * nobody is looking at is the one that goes stale — so the project is generated
 * from `DEMOS`, which is what the page draws.
 *
 * Only the graphs and the project file. The Luau under `src/` is written by
 * `roswaal compile`, the same as it would be for anybody else's project: a
 * generated file that this script wrote by hand would carry a hash Roswaal did
 * not produce, and the editor would then refuse to overwrite its own demo.
 *
 *     node scripts/build-lune-demo.mjs
 *     roswaal compile            # from inside examples/lune-demo
 *
 * `tests/lunedemo.test.ts` checks the graphs on disk still match the ones the
 * page draws, so a demo edited in one place and not the other fails the build
 * rather than quietly disagreeing.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEMOS } from "../src/core/docs/demos.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEMO_ROOT = join(root, "examples", "lune-demo");

/** The project file. No `rojoProject`: a Lune program has nothing to sync. */
const PROJECT = {
	schemaVersion: 1,
	target: "lune",
	sourceDir: ".roswaal/scripts",
	outDir: "src",
	compileMode: "hot",
	nodePaths: [".roswaal/nodes"],
	format: true,
};

const README = `# Lune demos

Four small programmes, one graph each. They are the same four drawn on the
**Lune demos** page in Roswaal's documentation — this project is generated from
them, so what you open here is what that page shows.

\`\`\`sh
roswaal serve      # the editor
lune run greet -- world
\`\`\`

Or compile once without the editor:

\`\`\`sh
roswaal compile
\`\`\`

## What is here

${DEMOS.map((d) => `**\`${d.slug}\`** — ${d.what}`).join("\n\n")}

## What they are not

Starting points. None of them checks whether the file was there, whether the
request came back, or whether the JSON had the field — which a real version
would, and which would have doubled the size of every one.
`;

async function write(relPath, contents) {
	const full = join(DEMO_ROOT, relPath);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, contents, "utf8");
	return relPath;
}

export async function buildLuneDemo() {
	const written = [];
	written.push(await write("roswaal.json", `${JSON.stringify(PROJECT, null, 2)}\n`));
	written.push(await write("README.md", README));
	written.push(await write(".gitignore", "node_modules/\n"));

	for (const demo of DEMOS) {
		const script = demo.script();
		written.push(await write(
			`.roswaal/scripts/${demo.slug}.nodescript`,
			`${JSON.stringify(script, null, 2)}\n`,
		));
	}
	return written;
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, "/")
	|| process.argv[1]?.endsWith("build-lune-demo.mjs")) {
	const written = await buildLuneDemo();
	console.log(`lune demo: ${written.length} files -> examples/lune-demo/`);
	console.log("now run `roswaal compile` inside it to write src/");
}
