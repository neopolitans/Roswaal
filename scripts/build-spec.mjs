/**
 * Builds the technical specification as a site of its own into `dist-spec/`:
 * what spec.roswaal.app serves, and the canary's preview at `/technical/`.
 *
 * The same pages as the Docs panel's, from `src/core/docs/technical`, drawn by
 * the same block renderer and the same node pictures, around chrome of their
 * own (`src/spec/`). The tree holds the latest draft at its root and a copy of
 * it at `/<draft>/`, the address a citation of this draft keeps once a newer
 * one is the latest. Drafts that have been superseded are not rebuilt here --
 * their source has moved on -- but kept, as published, in the roswaal-spec
 * repository, and named in `ROSWAAL_SPEC_DRAFTS` so the switcher lists them.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { wirePath } from "../src/app/geometry.ts";
import { highlightLuau } from "../src/app/highlight.ts";
import { NODE } from "../src/app/layers.ts";
import { faviconHref, logoMarkup } from "../src/app/logo.tsx";
import { nodeColor, pinColor } from "../src/app/palette.ts";
import { VERSION } from "../src/cli/version.ts";
import { escapeHtml } from "../src/core/docs/html.ts";
import { GROUPS } from "../src/core/docs/site.ts";
import { technicalSections } from "../src/core/docs/technical/index.ts";
import { SPEC_DRAFT } from "../src/core/docs/technical/spec.ts";
import { renderSpecSite } from "../src/core/docs/technical/specSite.ts";
import { createRegistry } from "../src/core/nodes/index.ts";
import { themeTokens } from "../src/core/theme.ts";
import { BUILTIN_THEMES } from "../src/core/themeData.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-spec");

/** Luau to HTML, with the token classes `spec.css` colours. */
function highlight(code) {
	return highlightLuau(code)
		.map((tokens) =>
			tokens
				.map((t) =>
					t.cls === "" ? escapeHtml(t.text) : `<span class="${t.cls}">${escapeHtml(t.text)}</span>`,
				)
				.join(""),
		)
		.join("\n");
}

/**
 * Roswaal's light and dark themes as custom properties: light by default, dark
 * where the reader's system asks for it. Read from the themes the editor ships,
 * so the specification is drawn in the editor's own colours.
 */
function tokensCss() {
	const light = BUILTIN_THEMES.find((t) => !t.dark);
	const dark = BUILTIN_THEMES.find((t) => t.dark);
	const block = (theme, extra) =>
		Object.entries({ ...themeTokens(theme), ...extra })
			.filter(([name]) => name.startsWith("--"))
			.map(([name, value]) => `\t${name}: ${value};`)
			.join("\n");
	// The one token the node pictures read that no theme sets: the well a pin
	// sits in, as `theme.css` has it for each scheme.
	return (
		`:root {\n${block(light, { "--pin-well": "#2a2f37" })}\n}\n\n` +
		`@media (prefers-color-scheme: dark) {\n\t:root {\n${block(dark, { "--pin-well": "#06080b" }).replace(/^/gm, "\t")}\n\t}\n}\n`
	);
}

async function main() {
	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });

	const registry = createRegistry();
	const sections = technicalSections(GROUPS.technical, { registry });
	const isCanary = process.env.ROSWAAL_CHANNEL === "canary";
	const archived = (process.env.ROSWAAL_SPEC_DRAFTS ?? "")
		.split(",")
		.map((d) => d.trim())
		.filter(Boolean);
	const drafts = [...new Set([...archived, SPEC_DRAFT])].sort((a, b) =>
		a.localeCompare(b, "en", { numeric: true }),
	);

	const render = {
		highlight,
		pinColor,
		registry,
		preview: { geometry: NODE, nodeColor, pinColor, wirePath },
		logo: { mark: logoMarkup(20), icon: faviconHref() },
		version: VERSION,
	};
	const common = {
		sections,
		render,
		docsBase: isCanary ? "https://canary.roswaal.app/docs/" : "https://roswaal.app/docs/",
		draft: SPEC_DRAFT,
		drafts,
		version: VERSION,
		noindex: isCanary,
	};

	const trees = [
		{ dir: out, latest: true, canonicalBase: "https://spec.roswaal.app/" },
		{
			dir: join(out, SPEC_DRAFT),
			latest: false,
			canonicalBase: `https://spec.roswaal.app/${SPEC_DRAFT}/`,
		},
	];
	const css = tokensCss() + "\n" + (await readFile(join(root, "src/spec/spec.css"), "utf8"));
	const js = await readFile(join(root, "src/spec/spec.js"), "utf8");

	let pages = 0;
	for (const tree of trees) {
		const files = renderSpecSite({
			...common,
			latest: tree.latest,
			canonicalBase: tree.canonicalBase,
		});
		for (const file of files) {
			const target = join(tree.dir, file.path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, file.contents, "utf8");
			if (file.path.endsWith(".html")) pages++;
		}
		await writeFile(join(tree.dir, "spec.css"), css, "utf8");
		await writeFile(join(tree.dir, "spec.js"), js, "utf8");
	}

	console.log(`specification: Draft ${SPEC_DRAFT}, ${pages} pages -> dist-spec/`);
}

await main();
