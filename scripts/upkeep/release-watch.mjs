/**
 * The Upkeep workflow's release watch: which of `.github/upkeep/upstream.json`'s
 * sources has a release newer than the one last looked at.
 *
 * Writes the issue body to stdout, Markdown, and `newer=true` or `newer=false`
 * to `$GITHUB_OUTPUT` when there is one. Asks GitHub's API with `GITHUB_TOKEN`
 * when it is set, and npm's registry for npm packages. No dependencies.
 *
 *     node scripts/upkeep/release-watch.mjs
 */

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { newer } from "./versions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIST = ".github/upkeep/upstream.json";
const { sources } = JSON.parse(readFileSync(join(ROOT, LIST), "utf8"));

async function latest(from) {
	const [kind, name] = from.split(/:(.*)/s);
	if (kind === "github") {
		const response = await fetch(`https://api.github.com/repos/${name}/releases/latest`, {
			headers: {
				Accept: "application/vnd.github+json",
				...(process.env.GITHUB_TOKEN
					? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
		});
		if (!response.ok) throw new Error(`${name}: GitHub answered ${response.status}`);
		const release = await response.json();
		return { version: release.tag_name, url: release.html_url, date: release.published_at };
	}
	if (kind === "npm") {
		const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
		if (!response.ok) throw new Error(`${name}: npm answered ${response.status}`);
		const pkg = await response.json();
		return { version: pkg.version, url: `https://www.npmjs.com/package/${name}/v/${pkg.version}` };
	}
	throw new Error(`${from}: not github: or npm:`);
}

const found = [];
const failed = [];
for (const [key, source] of Object.entries(sources)) {
	try {
		const release = await latest(source.from);
		if (newer(release.version, source.seen)) found.push({ key, source, release });
	} catch (error) {
		failed.push(`${key}: ${error.message}`);
	}
}

const lines = [];
if (found.length > 0) {
	lines.push("Newer releases of what Roswaal is built from or written for:", "");
	lines.push("| Source | Seen | Latest | Why it matters |", "| --- | --- | --- | --- |");
	for (const { key, source, release } of found) {
		const date = release.date ? ` (${release.date.slice(0, 10)})` : "";
		lines.push(
			`| ${key} | ${source.seen} | [${release.version}](${release.url})${date} | ${source.why} |`,
		);
	}
	lines.push("", `Once one has been dealt with, raise its \`seen\` in \`${LIST}\`.`);
}
if (failed.length > 0) lines.push("", "Could not ask:", ...failed.map((f) => `- ${f}`));
process.stdout.write(`${lines.join("\n")}\n`);

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(process.env.GITHUB_OUTPUT, `newer=${found.length > 0}\n`);
}
