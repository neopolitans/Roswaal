/**
 * The Upkeep workflow's check on npm-check-updates: a dependency it moved to a
 * range above the version the package's maintainer marks `latest` goes back to
 * the range it had. `--target minor` takes the highest version in a major, and
 * a registry can hold a stray one there that was never meant to be installed:
 * codemirror's 6.65.7, published in 2022, while `latest` is still 6.0.2.
 *
 * Run between npm-check-updates and npm install. Changes package.json's text
 * only where it puts a range back, and prints what it held back. No
 * dependencies.
 *
 *     node scripts/upkeep/hold-to-latest.mjs <package.json as it was>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { aboveLatest } from "./versions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = join(ROOT, "package.json");
const GROUPS = ["dependencies", "devDependencies", "optionalDependencies"];

const before = JSON.parse(readFileSync(process.argv[2], "utf8"));
let text = readFileSync(FILE, "utf8");
const after = JSON.parse(text);

async function latest(name) {
	const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
		headers: { Accept: "application/vnd.npm.install-v1+json" },
	});
	if (!response.ok) throw new Error(`${name}: npm answered ${response.status}`);
	return (await response.json())["dist-tags"]?.latest;
}

let held = 0;
for (const group of GROUPS) {
	for (const [name, range] of Object.entries(after[group] ?? {})) {
		const was = before[group]?.[name];
		if (was === undefined || was === range) continue;
		const tagged = await latest(name);
		if (!tagged || !aboveLatest(range, tagged)) continue;
		const quoted = (s) => JSON.stringify(s);
		const from = `${quoted(name)}: ${quoted(range)}`;
		if (!text.includes(from)) throw new Error(`${name}: cannot find ${from} in package.json`);
		text = text.replace(from, `${quoted(name)}: ${quoted(was)}`);
		console.log(`Held back: ${name} ${range} is above latest ${tagged}; kept ${was}.`);
		held++;
	}
}
if (held > 0) writeFileSync(FILE, text);
else console.log("Nothing above a latest tag.");
