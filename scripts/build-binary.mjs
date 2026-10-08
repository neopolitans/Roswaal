/**
 * A single-file `roswaal` executable, for toolchain managers.
 *
 * Rokit, Aftman and Foreman all install a tool the same way: fetch a release
 * asset, extract it, and run what comes out as a binary. None of them can run a
 * script that needs an interpreter on the PATH, which is what `bin/roswaal` is
 * — so a project that pins its tools cannot pin this one without something like
 * this.
 *
 * ## What is in it, and what is not
 *
 * The CLI: `init`, `check`, `compile`, `watch`, `prune`, and the daemon's API.
 * Those are self-contained and are what a pinned toolchain is for — compiling
 * in CI, and compiling the same way on everybody's machine.
 *
 * **The editor too.** It is four files and under two megabytes — one bundle,
 * one stylesheet, the theme script and the page naming them — so they travel
 * inside the binary as assets and are served from memory. `serve` gives the
 * whole localhost editor, and the documentation with it, from an executable
 * with nothing beside it.
 *
 * Not the *published* documentation site, which is a different thing: thirteen
 * megabytes of pre-rendered pages for a static host. The editor draws those
 * same pages itself from the node registry, which is why `/docs` needs nothing
 * extra here.
 *
 * ## Why `bin/roswaal` is still a script
 *
 * Deliberately, and this does not change it. Windows Smart App Control blocks
 * unsigned binaries it has not seen before, so a packaged `roswaal.exe` can be
 * blocked afresh on every rebuild — which is exactly what an npm install must
 * never do. This exists *beside* that for people who asked for it, and the two
 * answer different questions.
 *
 *     node scripts/build-binary.mjs
 *
 * Node's own single-executable support, which cannot cross-compile: each
 * platform's binary is built on that platform, which is what a release
 * workflow's matrix is for.
 */

import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { bundleHasVersion } from "./lib/distVersion.mjs";
import { packageDirsOf, renderNotices } from "./lib/notices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-binary");

/** What the asset is called, which is how a toolchain manager picks it. */
function assetName(version) {
	const os =
		{ win32: "windows", darwin: "macos", linux: "linux" }[process.platform] ?? process.platform;
	const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch] ?? process.arch;
	return `roswaal-${version}-${os}-${arch}`;
}

// `version.json`, as the CLI, the daemon and the editor read it.
const { version } = JSON.parse(readFileSync(join(root, "version.json"), "utf8"));
const exe = process.platform === "win32" ? ".exe" : "";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/**
 * CommonJS, because Node's single-executable support takes one CJS file.
 *
 * `import.meta.url` does not survive that, and esbuild says so. What reads it
 * is the lookup for `dist/` and for the demo projects — both of which are
 * asking "what is beside me on disk", and the answer in a packaged build is
 * "nothing". They already handle not finding anything.
 */
const bundle = join(out, "roswaal.cjs");
const cli = await build({
	entryPoints: [join(root, "src", "cli", "index.ts")],
	outfile: bundle,
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	// Loaded at run time only when a project asks for formatting, and it ships
	// its own platform binaries — bundling it would defeat that.
	external: ["esbuild"],
	// Stripped here and carried whole beside the binary instead: see notices below.
	legalComments: "none",
	metafile: true,
	// So the metafile's paths are the repository's, whatever folder ran this.
	absWorkingDir: root,
});

/**
 * The editor, carried inside the binary.
 *
 * Four files and under two megabytes -- one bundle, one stylesheet, the script
 * that paints the theme before first paint, and the page that names them. That
 * is what makes this worth doing: `serve` gives the whole localhost editor and
 * the documentation with it, from an executable with nothing beside it.
 *
 * Keyed by the path a browser will ask for, so the server looks up the request
 * and nothing has to translate between the two.
 */
function editorAssets() {
	const dist = join(root, "dist");
	if (!existsSync(join(dist, "index.html"))) {
		console.error("roswaal: dist/ has not been built, so the binary would have no editor.");
		console.error("  Run:  npm run build:web");
		process.exit(1);
	}

	const assets = {};
	const walk = (at) => {
		for (const entry of readdirSync(at, { withFileTypes: true })) {
			const abs = join(at, entry.name);
			if (entry.isDirectory()) {
				walk(abs);
				continue;
			}
			const name = relative(dist, abs).split(sep).join("/");
			// The editor build's own records, not something a browser asks for.
			if (name.startsWith(".vite/")) continue;
			// Forward slashes: this is a URL path, not a path on this machine.
			assets[name] = abs;
		}
	};
	walk(dist);

	const scripts = Object.values(assets)
		.filter((abs) => abs.endsWith(".js"))
		.map((abs) => readFileSync(abs, "utf8"));
	if (!bundleHasVersion(scripts, version)) {
		console.error(
			`roswaal: dist/ was not built at ${version}, so the binary would carry another editor.`,
		);
		console.error("  Run:  npm run build:web");
		process.exit(1);
	}
	return assets;
}

const assets = editorAssets();

/**
 * Node.js's own LICENSE, which the binary carries because it is Node.
 *
 * Every official build puts it at the top of the install: beside `node.exe` on
 * Windows, one folder up from `bin/node` elsewhere. A Node without it -- some
 * package managers' -- cannot build a binary that says what it carries.
 */
function nodeLicence() {
	const candidates = [
		join(dirname(process.execPath), "LICENSE"),
		join(dirname(process.execPath), "..", "LICENSE"),
	];
	const found = candidates.find((path) => existsSync(path));
	if (!found) {
		console.error("roswaal: this Node has no LICENSE beside it, so the binary could not carry it.");
		console.error("  Build with an official Node from nodejs.org, as the release workflow does.");
		process.exit(1);
	}
	return {
		version: process.versions.node,
		text: readFileSync(found, "utf8").replace(/\r\n/g, "\n"),
	};
}

/**
 * The binary's notices: Node.js, the CLI's packages and the editor's.
 *
 * Written beside the binary, where the release zips it, and served by the
 * binary itself in place of the editor-only copy in `dist/`, so the editor's
 * licence page shows what this build really carries.
 */
const editorPackagesFile = join(root, "dist", ".vite", "notices-packages.json");
if (!existsSync(editorPackagesFile)) {
	console.error("roswaal: dist/ has no list of the packages it bundles.");
	console.error("  Run:  npm run build:web");
	process.exit(1);
}
const editorPackages = JSON.parse(readFileSync(editorPackagesFile, "utf8")).map((dir) =>
	join(root, ...dir.split("/")),
);
const notices = join(out, "THIRD-PARTY-NOTICES.txt");
writeFileSync(
	notices,
	await renderNotices({
		root,
		packageDirs: [
			...new Set([
				...packageDirsOf(Object.keys(cli.metafile.inputs).map((input) => join(root, input))),
				...editorPackages,
			]),
		],
		node: nodeLicence(),
	}),
	"utf8",
);
assets["THIRD-PARTY-NOTICES.txt"] = notices;

const config = join(out, "sea-config.json");
writeFileSync(
	config,
	`${JSON.stringify(
		{
			main: bundle,
			output: join(out, "roswaal.blob"),
			disableExperimentalSEAWarning: true,
			assets,
		},
		null,
		2,
	)}\n`,
	"utf8",
);

const blob = spawnSync(process.execPath, ["--experimental-sea-config", config], {
	stdio: "inherit",
});
if (blob.status !== 0) process.exit(blob.status ?? 1);

const binary = join(out, `roswaal${exe}`);
copyFileSync(process.execPath, binary);

/**
 * macOS needs two things the other platforms do not.
 *
 * The copied `node` carries Node's own signature, which the injection breaks —
 * and Apple Silicon kills an executable whose signature does not match before
 * it runs a single instruction. So the old signature comes off first and an
 * ad-hoc one goes on after: enough for the kernel, and for anybody who built it
 * themselves. A download still meets Gatekeeper, which wants a Developer ID and
 * notarisation, and that is a release workflow's business rather than this
 * script's.
 *
 * And Node looks for the blob in a Mach-O segment of its own name, not the
 * `__POSTJECT` one postject writes by default; injected there, the binary
 * starts as a plain `node`.
 */
const macos = process.platform === "darwin";

function codesign(...args) {
	const signed = spawnSync("codesign", [...args, binary], { stdio: "inherit" });
	if (signed.status !== 0) {
		console.error("roswaal: codesign failed; it comes with Xcode's command line tools.");
		console.error("  Run:  xcode-select --install");
		process.exit(signed.status ?? 1);
	}
}

if (macos) codesign("--remove-signature");

// A devDependency, pinned, so every machine injects with the same one.
const postject = join(root, "node_modules", "postject", "dist", "cli.js");
if (!existsSync(postject)) {
	console.error("roswaal: postject, which builds the binary, is not installed.");
	console.error("  Run:  npm ci");
	process.exit(1);
}

/**
 * The fuse is Node's own sentinel, and has to match the runtime that is being
 * injected into. It is a published constant rather than a secret.
 */
const inject = spawnSync(
	process.execPath,
	[
		postject,
		binary,
		"NODE_SEA_BLOB",
		join(out, "roswaal.blob"),
		"--sentinel-fuse",
		"NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
		...(macos ? ["--macho-segment-name", "NODE_SEA"] : []),
	],
	{ stdio: "inherit" },
);
if (inject.status !== 0) process.exit(inject.status ?? 1);

if (macos) codesign("--sign", "-");

const megabytes = (statSync(binary).size / 1024 / 1024).toFixed(0);
console.log(
	`roswaal binary: ${megabytes} MB -> dist-binary/roswaal${exe}` +
		` (editor: ${Object.keys(assets).length} files)`,
);
console.log(`  release asset name: ${assetName(version)}.zip`);
console.log("  notices: dist-binary/THIRD-PARTY-NOTICES.txt, zipped beside it");
