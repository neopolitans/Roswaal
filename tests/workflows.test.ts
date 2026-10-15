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

/**
 * Each job's lines, by name, and the workflow's own lines before `jobs:` as
 * `top`.
 */
function jobsOf(text: string): Map<string, string[]> {
	const jobs = new Map<string, string[]>([["top", []]]);
	let inJobs = false;
	let job = "top";
	for (const line of text.split("\n")) {
		if (/^\S/.test(line) && !line.startsWith("#")) {
			inJobs = /^jobs:\s*$/.test(line);
			if (!inJobs) job = "top";
		}
		const key = /^ {2}([\w-]+):\s*$/.exec(line);
		if (inJobs && key) {
			job = key[1];
			jobs.set(job, []);
		}
		jobs.get(job)?.push(line);
	}
	return jobs;
}

describe("the right to write to the repository", () => {
	const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

	it("is never the workflow's as a whole", () => {
		for (const file of files) {
			const top = jobsOf(workflow(file)).get("top") ?? [];
			expect(
				top.filter((line) => /^\s*contents:\s*write\b/.test(line)),
				file,
			).toEqual([]);
		}
	});

	it("is held only by jobs that install and run nothing from npm", () => {
		for (const file of files) {
			for (const [job, lines] of jobsOf(workflow(file))) {
				if (!lines.some((line) => /^\s*contents:\s*write\b/.test(line))) continue;
				const npm = lines.filter((line) => /\bnpm\b|\bnpx\b|setup-node@/.test(line));
				expect(npm, `${file}: ${job}`).toEqual([]);
			}
		}
	});

	it("is still given to the release's two jobs", () => {
		const jobs = jobsOf(workflow("release.yml"));
		const writes = [...jobs]
			.filter(([, lines]) => lines.some((line) => /^\s*contents:\s*write\b/.test(line)))
			.map(([job]) => job);
		expect(writes).toEqual(["release", "attach"]);
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
