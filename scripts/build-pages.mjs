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

import { faviconHref, logoMarkup } from "../src/app/logo.tsx";

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

/**
 * The page in front of everything, until there is a landing page.
 *
 * Deliberately small and deliberately honest: it says what Roswaal is, admits
 * the browser copy is a preview of something still in testing, and gives the
 * three doors. A holding page that oversells is worse than no holding page,
 * because the people following this link first are the ones who will report
 * what is wrong with it.
 */
function holdingPage() {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Roswaal</title>
<link rel="icon" href="${faviconHref()}" />
<meta name="description" content="Visual scripting for Roblox Luau and Lune Luau. Graphs compile to plain Luau that Rojo syncs." />
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #14161c; color: #d6dae4; padding: 24px;
    font: 15px/1.6 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  }
  main { max-width: 34rem; }
  .mark { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; color: #e8ecf4; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
  .version { font-size: 12px; color: #6f7686; }
  p { color: #9aa2b4; }
  code { background: #1c1f28; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
  .doors { display: flex; flex-wrap: wrap; gap: 10px; margin: 26px 0 0; padding: 0; list-style: none; }
  a.door {
    display: inline-block; padding: 9px 15px; border-radius: 7px;
    border: 1px solid #2c313d; background: #1c1f28; color: #d6dae4; text-decoration: none;
  }
  a.door:hover { border-color: #3d63c4; color: #fff; }
  a.door.first { background: #3d63c4; border-color: #3d63c4; color: #fff; }
  .note { margin-top: 30px; font-size: 13px; color: #6f7686; border-top: 1px solid #23262f; padding-top: 16px; }
  .note a { color: #8fa6dd; }
</style>
</head>
<body>
<main>
  <div class="mark">${logoMarkup(26)}<h1>Roswaal</h1><span class="version">${version}</span></div>
  <p>
    Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk as
    <code>.nodescript</code> files and compile to plain <code>.luau</code> that
    Rojo syncs like any other source file.
  </p>
  <p>
    The copy below runs entirely in this tab — the same editor and the same
    compiler as the tool you install, over a project held in memory instead of a
    disk. Nothing you do in it leaves your browser, and nothing is kept when you
    close it.
  </p>
  <ul class="doors">
    <li><a class="door first" href="try.html">Try it in the browser</a></li>
    <li><a class="door" href="docs/">Documentation</a></li>
    <li><a class="door" href="https://github.com/neopolitans/roswaal-feedback/issues/new">Report something</a></li>
  </ul>
  <p class="note">
    A preview, ahead of the first release. It is complete enough to build real
    graphs with, and it will have rough edges — please
    <a href="https://github.com/neopolitans/roswaal-feedback/issues/new">say what they are</a>.
  </p>
</main>
</body>
</html>
`;
}

/** Sent for any path with nothing behind it, so GitHub's own 404 never shows. */
function notFoundPage(base) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Not here — Roswaal</title>
<link rel="icon" href="${faviconHref()}" />
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #14161c; color: #d6dae4; padding: 24px; text-align: center;
    font: 15px/1.6 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #9aa2b4; margin: 0 0 20px; }
  a { color: #8fa6dd; }
</style>
</head>
<body>
<main>
  <h1>There is nothing at this address.</h1>
  <p>It may have moved, or never existed.</p>
  <p><a href="${base}">Back to Roswaal</a> &middot; <a href="${base}docs/">the documentation</a></p>
</main>
</body>
</html>
`;
}

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

	await writeFile(join(out, "index.html"), holdingPage(), "utf8");
	await writeFile(join(out, "404.html"), notFoundPage(base), "utf8");

	// Tells Pages not to run the files through Jekyll, which would drop every
	// directory whose name begins with an underscore.
	await writeFile(join(out, ".nojekyll"), "", "utf8");

	const pages = (await readdir(join(out, "docs", "node")).catch(() => [])).length;
	console.log(`site: ${base} -> dist-pages/ (editor, ${pages} node pages, docs)`);
}

await main();
