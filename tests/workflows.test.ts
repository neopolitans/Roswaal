/**
 * The GitHub workflows: who holds which rights, and what every published page
 * goes through.
 *
 * Read as text, line by line, which is enough for the two-space YAML these
 * files are written in and needs no parser among the dependencies.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

function workflow(name: string): string {
	return readFileSync(join(WORKFLOWS, name), "utf8");
}

/**
 * Where each publishing right is granted: `top` for the workflow as a whole,
 * otherwise the name of the job.
 */
function publishingGrants(text: string): { right: string; where: string }[] {
	const grants: { right: string; where: string }[] = [];
	let inJobs = false;
	let job = "";
	for (const line of text.split("\n")) {
		if (/^\S/.test(line) && !line.startsWith("#")) {
			inJobs = /^jobs:\s*$/.test(line);
			job = "";
		}
		const key = /^ {2}([\w-]+):\s*$/.exec(line);
		if (inJobs && key) job = key[1];
		const right = /^\s*(pages|id-token):\s*write\b/.exec(line);
		if (right) grants.push({ right: right[1], where: inJobs ? job : "top" });
	}
	return grants;
}

describe("the workflows' rights", () => {
	const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

	it("give the right to publish to Pages to the deploy job alone", () => {
		for (const file of files) {
			for (const grant of publishingGrants(workflow(file))) {
				expect(`${file}: ${grant.right} in ${grant.where}`).toBe(
					`${file}: ${grant.right} in deploy`,
				);
			}
		}
	});

	it("still give it to each deploy job", () => {
		for (const file of ["pages.yml", "spec.yml"]) {
			expect(publishingGrants(workflow(file))).toEqual([
				{ right: "pages", where: "deploy" },
				{ right: "id-token", where: "deploy" },
			]);
		}
	});
});

describe("the specification's workflow", () => {
	const text = workflow("spec.yml");

	it("puts the policy into every page after the archived drafts are laid in", () => {
		const laidIn = text.indexOf("name: Lay in the archived drafts");
		const policy = text.indexOf("npm run build:policy -- dist-spec");
		const upload = text.indexOf("uses: actions/upload-pages-artifact@");
		expect(laidIn).toBeGreaterThan(-1);
		expect(policy).toBeGreaterThan(laidIn);
		expect(upload).toBeGreaterThan(policy);
	});
});
