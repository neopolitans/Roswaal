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
 * drifted from `themes/`, and `tests/theme.test.ts` runs that check.
 *
 * Usage:
 *   tsx scripts/build-themes.mjs           write the module
 *   tsx scripts/build-themes.mjs --check   fail if it would change
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { themeSlug, validateTheme } from "../src/core/theme.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "themes");
const notices = join(root, "notices");
const target = join(root, "src", "core", "themeData.ts");

/**
 * Reads and checks every scheme.
 *
 * Every problem across every file is collected before anything is reported,
 * because a palette being written by hand usually has more than one thing wrong
 * with it and finding them one build at a time is a bad afternoon.
 */
export async function loadThemes() {
	const files = (await readdir(source)).filter((f) => f.endsWith(".json")).sort();
	const problems = [];
	const themes = [];

	for (const file of files) {
		let parsed;
		try {
			parsed = JSON.parse(await readFile(join(source, file), "utf8"));
		} catch (err) {
			problems.push(`themes/${file}: not valid JSON — ${err.message}`);
			continue;
		}
		const found = validateTheme(parsed, `themes/${file}`);
		if (found.length > 0) problems.push(...found);
		else themes.push({ file, theme: parsed });
	}

	// Two files claiming one menu entry, or one identity.
	const byName = new Map();
	const bySlug = new Map();
	for (const { file, theme } of themes) {
		const name = theme.name.toLowerCase();
		if (byName.has(name)) problems.push(`themes/${file} and themes/${byName.get(name)} both define a theme named "${theme.name}"`);
		else byName.set(name, file);

		const slug = themeSlug(theme.name);
		if (bySlug.has(slug)) problems.push(`themes/${file} and themes/${bySlug.get(slug)} both resolve to the slug "${slug}"`);
		else bySlug.set(slug, file);

		// The file name is not the identity — the slug of the name is — but a
		// file whose name disagrees with its contents is a trap for whoever
		// next goes looking for "the Nord one".
		const expected = `${slug}.json`;
		if (file !== expected) {
			problems.push(`themes/${file} defines "${theme.name}", so it should be named ${expected}`);
		}
	}

	/**
	 * The licence a borrowed scheme travels under, read from the vendored file.
	 *
	 * Inlined into the generated module rather than left as a path, because the
	 * three places that have to show it — the settings panel, the documentation
	 * site, and a plain `dist/` with no daemon behind it — can none of them open
	 * `notices/`. A licence a user cannot read is not an attribution.
	 *
	 * A missing file fails the build. MIT requires the notice to travel with the
	 * work, so shipping a scheme whose terms resolve to nothing is the one
	 * failure here that is not merely untidy.
	 */
	const texts = {};
	for (const { file, theme } of themes) {
		if (theme.licence === undefined) continue;
		const rel = theme.licence.textFile;
		if (texts[rel] !== undefined) continue;
		try {
			texts[rel] = await readFile(join(notices, rel), "utf8");
		} catch {
			problems.push(`themes/${file}: licence.textFile "notices/${rel}" does not exist`);
		}
	}

	if (problems.length > 0) {
		const error = new Error(`${problems.length} problem(s) in themes/`);
		error.problems = problems;
		throw error;
	}

	themes.sort((a, b) => a.theme.order - b.theme.order || a.theme.name.localeCompare(b.theme.name));
	return { themes: themes.map((t) => t.theme), texts };
}

function render({ themes, texts }) {
	return [
		"/**",
		" * The built-in colour schemes. GENERATED — do not edit.",
		" *",
		" * Source: `themes/*.json`, and the vendored licences under `notices/` that",
		" * the borrowed ones name. Regenerate with `npm run build:themes`, which is",
		" * also what `npm run build` does. `tests/theme.test.ts` fails when this file",
		" * has drifted from either.",
		" *",
		" * Committed deliberately, so a fresh clone builds without knowing the",
		" * generator exists.",
		" */",
		"",
		'import type { Theme } from "./theme.js";',
		"",
		`export const BUILTIN_THEMES: Theme[] = ${JSON.stringify(themes, null, "\t")};`,
		"",
		"/**",
		" * Upstream licence texts, byte for byte, keyed by `licence.textFile`.",
		" *",
		" * Not written by hand and not rendered from a template: three MIT licences",
		" * in this repository are headed three different ways and one carries an",
		" * email address, so a template would produce something that is *nearly* each",
		" * author's licence. Nearly is the one thing an attribution may not be.",
		" */",
		`export const LICENCE_TEXTS: Record<string, string> = ${JSON.stringify(texts, null, "\t")};`,
		"",
	].join("\n");
}

const loaded = await loadThemes().catch((err) => {
	console.error(err.problems ? err.problems.join("\n") : err.message);
	process.exit(1);
});

const output = render(loaded);
const themes = loaded.themes;
const existing = await readFile(target, "utf8").catch(() => null);

if (process.argv.includes("--check")) {
	if (existing !== output) {
		console.error(
			"src/core/themeData.ts has drifted from themes/. Run `npm run build:themes`.",
		);
		process.exit(1);
	}
	console.log(`themes: ${themes.length} schemes, generated file is current`);
} else if (existing === output) {
	console.log(`themes: ${themes.length} schemes, already current`);
} else {
	await writeFile(target, output, "utf8");
	console.log(`themes: wrote ${themes.length} schemes to src/core/themeData.ts`);
}
