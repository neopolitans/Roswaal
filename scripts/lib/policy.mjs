/**
 * The site's Content-Security-Policy, put into every page under a folder.
 *
 * GitHub Pages sends no headers, so a `<meta>` tag is the one way a page there
 * can say it. `build-pages.mjs` runs this over the website as it assembles it,
 * `build-spec.mjs` over the specification, and the specification's workflow
 * once more over the finished tree, archived drafts included, through
 * `build-policy.mjs`. A page that has the policy already is left as it is, so
 * running it twice changes nothing.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withCspMeta } from "../../src/core/csp.ts";

/**
 * Every `.html` file under `dir`, at any depth, given the policy.
 *
 * @param {string} dir
 * @returns {Promise<number>} How many pages there are.
 */
export async function withPolicyThroughout(dir) {
	const pages = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".html"));
	for (const file of pages) {
		const at = join(dir, file);
		await writeFile(at, withCspMeta(await readFile(at, "utf8")), "utf8");
	}
	return pages.length;
}
