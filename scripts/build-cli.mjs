/**
 * Bundles the CLI and daemon into one self-contained ESM file.
 *
 * Self-contained matters: the launcher shims run `node dist-cli/roswaal.mjs`
 * from wherever the user happens to be, and a bundle means that works without
 * node_modules resolving from the right place, and without a global install.
 */

import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist-cli", { recursive: true });

const result = await build({
	entryPoints: ["src/cli/index.ts"],
	outfile: "dist-cli/roswaal.mjs",
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	// Express and chokidar both reach for CommonJS globals that an ESM bundle
	// does not have; this hands them back rather than shipping a broken bundle.
	banner: {
		js: [
			"import { createRequire as __createRequire } from 'node:module';",
			"import { fileURLToPath as __fileURLToPath } from 'node:url';",
			"import { dirname as __dirname_of } from 'node:path';",
			"const require = __createRequire(import.meta.url);",
			"const __filename = __fileURLToPath(import.meta.url);",
			"const __dirname = __dirname_of(__filename);",
		].join("\n"),
	},
	logLevel: "info",
	metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
await writeFile("dist-cli/.gitignore", "*\n", "utf8");
console.log(`roswaal CLI bundled: ${(bytes / 1024).toFixed(0)} kB`);
