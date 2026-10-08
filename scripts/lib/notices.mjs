/**
 * `THIRD-PARTY-NOTICES.txt`: every licence a build carries, in one file.
 *
 * MIT, ISC, BSD and Apache-2.0 each ask for one thing of a copy: that their
 * notice goes with it. A bundle strips the comments a package's own files
 * carry, so the notice has to travel beside the bundle instead -- served next to
 * the editor, and zipped next to the binary.
 *
 * ## Which packages
 *
 * The ones the build actually contains, read from the bundler's own list of
 * modules, not from `package.json`. The two disagree both ways: a declared
 * dependency can go unused, and a package marked as a development dependency
 * can still be bundled because something optional reached for it
 * (`supports-color`, through `debug`). The bundle is the copy, so the bundle
 * decides.
 *
 * ## How each licence is carried
 *
 * Copied from the package's own licence file, unchanged, as `notices/upstream/`
 * is copied by hand. A bundled package with no licence file stops the build:
 * shipping it without its notice is the thing this file exists to prevent.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { loadCarried } from "./licenceModule.mjs";

const RULE = "-".repeat(72);
const LICENCE_FILE = /^(licen[cs]e|copying)(\.|-|$)/i;

/**
 * The package folder a bundled module comes from, or null for Roswaal's own
 * code and the bundler's virtual modules.
 *
 * Bundlers name modules by absolute path, sometimes with a query or a NUL
 * prefix; the innermost `node_modules` is the package that owns the file.
 */
export function packageDirOf(id) {
	const path = id.replace(/^\0/, "").split("?")[0].replace(/\\/g, "/");
	const at = path.lastIndexOf("/node_modules/");
	if (at === -1) return null;
	const rest = path.slice(at + "/node_modules/".length).split("/");
	const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
	if (!name) return null;
	return path
		.slice(0, at + "/node_modules/".length + name.length)
		.split("/")
		.join(sep);
}

/** The package folders behind a list of module ids, each once. */
export function packageDirsOf(ids) {
	const dirs = new Set();
	for (const id of ids) {
		const dir = packageDirOf(id);
		if (dir !== null) dirs.add(dir);
	}
	return [...dirs];
}

/** A package's name, version, licence and the text of its licence file. */
function readPackage(dir) {
	const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	const file = readdirSync(dir).find((name) => LICENCE_FILE.test(name));
	if (!file) {
		throw new Error(
			`${manifest.name}@${manifest.version} is bundled but has no licence file to carry (${dir})`,
		);
	}
	return {
		name: manifest.name,
		version: manifest.version,
		licence: typeof manifest.license === "string" ? manifest.license : "see below",
		file,
		text: readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n"),
	};
}

/**
 * The notices for one build.
 *
 * `packageDirs`: the package folders it bundles. `node`: the Node.js runtime's
 * own LICENSE, for a build that carries the runtime -- the release binaries.
 *
 * @param {{ root: string, packageDirs: string[], node?: { version: string, text: string } }} build
 */
export async function renderNotices({ root, packageDirs, node }) {
	const carried = await loadCarried(root);
	const packages = new Map();
	for (const dir of packageDirs) {
		const pkg = readPackage(dir);
		packages.set(`${pkg.name}@${pkg.version}`, { ...pkg, dir });
	}
	const sorted = [...packages.values()].sort(
		(a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version, "en"),
	);

	const lines = [
		"Roswaal: third-party notices",
		"",
		"Roswaal is 0BSD. Everything below belongs to someone else, and is here because",
		"its licence asks for its notice to go with every copy. Each licence is copied",
		"unchanged from where it was published.",
		"",
		"This build carries:",
	];
	if (node) lines.push(`  the Node.js ${node.version} runtime`);
	lines.push(`  ${carried.length} licences Roswaal keeps in notices/upstream/`);
	lines.push(`  ${sorted.length} open-source package${sorted.length === 1 ? "" : "s"}`);
	lines.push("");
	lines.push("Who made what, and how Roswaal uses it, is on the Attributions page of the");
	lines.push("documentation.");

	const section = (title, about, text) => {
		lines.push("", RULE, title, ...about, "", text.replace(/\n+$/, ""));
	};

	if (node) {
		section(
			`Node.js ${node.version} · MIT, and the licences of what it carries`,
			["The runtime inside this binary, with its own LICENSE file as published."],
			node.text,
		);
	}
	for (const licence of carried) {
		section(
			`${licence.name} · ${licence.spdx}`,
			[
				`${licence.holder}. ${licence.covers}`,
				`Copied from ${licence.source} (${licence.url}) on ${licence.retrieved}.`,
				`SHA-256 ${licence.sha256}`,
			],
			licence.text,
		);
	}
	for (const pkg of sorted) {
		const where = relative(root, join(pkg.dir, pkg.file)).split(sep).join("/");
		section(`${pkg.name} ${pkg.version} · ${pkg.licence}`, [`From ${where}`], pkg.text);
	}
	lines.push("");
	return lines.join("\n");
}

/** The package folders, relative to the repository, for a build's own record. */
export function relativeDirs(root, dirs) {
	return dirs.map((dir) => relative(root, dir).split(sep).join("/")).sort();
}
