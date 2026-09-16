/**
 * Assembles the website out of the two builds that already exist.
 *
 * `dist-site/` is the editor and Node Design over a volume in memory;
 * `dist-docs/` is the documentation as a static site. Neither knows about the
 * other, and neither should — this puts them in one tree and writes the page
 * that sits in front of them:
 *
 *     index.html      the holding page, until the landing page exists
 *     404.html        so a mistyped path goes somewhere rather than to GitHub
 *     try.html        the editor
 *     designer.html   Node Design
 *     assets/         their shared chunks
 *     docs/           the documentation, 301 pages of it
 *
 * The documentation nests without being rebuilt because every link it writes is
 * relative — `attributions.html` from the root, `../attributions.html` from a
 * node page — which `build-docs.mjs` set out to do so the site could be served
 * from anywhere or read off a disk. It turns out "anywhere" includes a
 * subdirectory of another site.
 *
 * Where the site is mounted is set once, as `ROSWAAL_BASE` on the editor build,
 * and read back out of the built HTML here -- so there is no second place to
 * get it wrong. A base may be passed as an argument, and is checked against the
 * build rather than believed.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { faviconHref } from "../src/app/logo.tsx";
import { landingPage } from "./lib/landing.mjs";
import { notFoundPage } from "./lib/notFound.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-pages");

/**
 * Where the site is mounted, read out of the editor Vite just built.
 *
 * Asked of the build rather than of the caller, because the build is the one
 * that has already committed to an answer: its asset URLs are absolute and
 * carry the base, so a copy built for `/Roswaal/` cannot be published at `/`
 * whatever anybody passes here. Taking it from the artefact means there is one
 * place the base is set — `ROSWAAL_BASE` on the editor build — and no second
 * spelling to disagree with it.
 *
 * A base may still be passed, and is then checked rather than used. Worth
 * keeping: on Windows, Git Bash rewrites an argument that looks like an
 * absolute path, so `ROSWAAL_BASE=/Roswaal/` reaches Vite as
 * `/Program Files/Git/Roswaal/` and the site builds, publishes, and 404s on
 * every asset. Prefix the command with `MSYS_NO_PATHCONV=1`.
 */
function baseOf(entryHtml) {
	const found = /(?:src|href)="([^"]*)\/assets\//.exec(entryHtml);
	if (!found) {
		throw new Error("dist-site/try.html names no assets, so it did not build properly.");
	}
	return found[1] + "/";
}

function checkClaimedBase(base) {
	const claimed = process.argv[2] ?? process.env.ROSWAAL_BASE;
	if (claimed === undefined || claimed === base) return;
	throw new Error(
		`dist-site was built for a base of ${JSON.stringify(base)}, and this was asked for ` +
		`${JSON.stringify(claimed)}. Rebuild the editor, or drop the argument and let the ` +
		"build say where it goes.",
	);
}

const { version } = JSON.parse(await readFile(join(root, "version.json"), "utf8"));

// ---------------------------------------------------------------------------

async function main() {
	const editor = join(root, "dist-site");
	const docs = join(root, "dist-docs");

	for (const [what, where] of [["the editor", editor], ["the documentation", docs]]) {
		const found = await readdir(where).catch(() => null);
		if (!found?.length) {
			throw new Error(
				`${where} is empty, so ${what} has not been built. ` +
				"Run `npm run build:site` and `npm run build:docs` first.",
			);
		}
	}

	const base = baseOf(await readFile(join(editor, "try.html"), "utf8"));
	checkClaimedBase(base);

	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });

	await cp(editor, out, { recursive: true });
	await cp(docs, join(out, "docs"), { recursive: true });

	await writeFile(join(out, "index.html"), landingPage(version), "utf8");
	await writeFile(join(out, "404.html"), notFoundPage(base, version), "utf8");

	// Tells Pages not to run the files through Jekyll, which would drop every
	// directory whose name begins with an underscore.
	await writeFile(join(out, ".nojekyll"), "", "utf8");

	const pages = (await readdir(join(out, "docs", "node")).catch(() => [])).length;
	console.log(`site: ${base} -> dist-pages/ (editor, ${pages} node pages, docs)`);
}

await main();
