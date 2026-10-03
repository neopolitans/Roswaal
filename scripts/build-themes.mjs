/**
 * Compiles `themes/*.json` into `src/core/themeData.ts`.
 *
 * ## Why a generated module rather than reading the files
 *
 * The editor is a browser bundle and cannot open a directory; the documentation
 * site is static and has no daemon behind it; the CLI is one esbuild bundle
 * with no `themes/` beside it. Three consumers, none of which can read the
 * source of truth at the moment it needs it — so the source of truth is
 * compiled in, exactly as Beako compiles its palettes into a plugin that cannot
 * open a file either.
 *
 * ## Generated *and* committed
 *
 * So a fresh clone can `npm run build` without knowing a generator exists. That
 * makes it a generated file that can rot, so `--check` fails when it has
 * drifted from `themes/`, and `tests/theme.test.ts` runs the same check.
 *
 * Usage:
 *   tsx scripts/build-themes.mjs           write the module
 *   tsx scripts/build-themes.mjs --check   fail if it would change
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	loadThemes,
	renderThemeModule,
	ThemeProblems,
	themeModuleIsCurrent,
	themeModulePath,
} from "./lib/themeModule.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = themeModulePath(root);

const loaded = await loadThemes(root).catch((err) => {
	console.error(err instanceof ThemeProblems ? err.problems.join("\n") : String(err));
	process.exit(1);
});

const themes = loaded.themes;
const current = await themeModuleIsCurrent(root);

if (process.argv.includes("--check")) {
	if (!current) {
		console.error("src/core/themeData.ts has drifted from themes/. Run `npm run build:themes`.");
		process.exit(1);
	}
	console.log(`themes: ${themes.length} schemes, generated file is current`);
} else if (current) {
	console.log(`themes: ${themes.length} schemes, already current`);
} else {
	await writeFile(target, renderThemeModule(loaded), "utf8");
	console.log(`themes: wrote ${themes.length} schemes to src/core/themeData.ts`);
}
