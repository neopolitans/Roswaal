/**
 * No GET route changes anything on disk.
 *
 * The connection guard lets through a request with no `Origin` and no
 * `Sec-Fetch-Site`, because that is what the CLI, curl and every other
 * program that is not a browser sends (see `refusesConnection`). Nothing a
 * website can make a browser send looks like that for a write, but a page's
 * `<img>` or `<script>` can still make a GET. So the routes stay safe only if
 * every GET only reads. This holds them to it.
 *
 * Every GET in the route table is called with real input, against a project
 * on disk through the daemon's own host, and the whole folder around it,
 * a second project and a file beside them included, is compared before and
 * after, down to each file's bytes and time. The host's abilities that act
 * (the folder dialog, revealing, opening an editor, copying a demo, a
 * download) must not be called either.
 *
 * A GET added to the table fails this test until it has an entry in
 * `SAMPLES`, so a new one cannot be missed.
 */

import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inspectFolder } from "../src/server/app.js";
import { ApiSession, type HostCapabilities } from "../src/server/routes.js";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo");

/** The abilities that do something, each recording that it was asked to. */
const acted: string[] = [];
const refuse =
	(name: string) =>
	async (..._args: unknown[]): Promise<never> => {
		acted.push(name);
		throw new Error(`${name} was called`);
	};
const capabilities: HostCapabilities = {
	// Reads a folder and says what is there; the one ability a GET uses.
	inspect: inspectFolder,
	browse: refuse("browse"),
	reset: refuse("reset"),
	reveal: refuse("reveal"),
	edit: refuse("edit"),
	duplicateDemo: refuse("duplicateDemo"),
	githubDownload: refuse("githubDownload"),
};

type Answers = Record<string, unknown>;

/**
 * Every GET route, in the order called, with the query it is given. A query
 * may be built from earlier answers: the place's stamp, a pack's path.
 */
const SAMPLES: [
	string,
	(answers: Answers, dirs: { root: string; other: string }) => Record<string, string>,
][] = [
	["GET /health", () => ({})],
	["GET /demos", () => ({})],
	["GET /project", () => ({})],
	["GET /project/inspect", (_, { other }) => ({ root: other })],
	["GET /tree", () => ({})],
	["GET /place", () => ({})],
	["GET /place/instance", (a) => ({ stamp: stampOf(a), index: "0" })],
	["GET /place/scene", (a) => ({ stamp: stampOf(a) })],
	["GET /place/services", () => ({})],
	["GET /instances", () => ({})],
	["GET /types", () => ({})],
	[
		"GET /resolve",
		() => ({ path: ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript" }),
	],
	["GET /luaurc", () => ({})],
	["GET /wally/uses", () => ({ alias: "Signal" })],
	["GET /rojo/projects", () => ({})],
	["GET /script", () => ({ path: ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript" })],
	["GET /map", () => ({ path: ".roswaal/scripts/Game.nodemap" })],
	["GET /source", () => ({ path: "src/ReplicatedStorage/Shared/Greeter.luau" })],
	["GET /nodes", () => ({})],
	["GET /packs", () => ({})],
	["GET /packs/read", (a) => ({ path: firstPack(a) })],
	["GET /packs/usage", (a) => ({ path: firstPack(a) })],
	["GET /packs/scan", (_, { other }) => ({ root: other })],
	["GET /orphans", () => ({})],
	["GET /export", () => ({})],
	// With the place written into: the export is built in memory, never saved.
	["GET /export", () => ({ place: "modify", format: "rbxl" })],
	["GET /export", () => ({ place: "modify", format: "rbxlx" })],
];

function stampOf(answers: Answers): string {
	const place = answers["GET /place"] as { stamp?: string };
	if (!place?.stamp) throw new Error("GET /place gave no stamp");
	return place.stamp;
}

function firstPack(answers: Answers): string {
	const { packs } = answers["GET /packs"] as { packs: { path: string }[] };
	if (!packs[0]) throw new Error("GET /packs listed no pack");
	return packs[0].path;
}

/** Every file and folder under `dir`: each file's size, time and hash. */
async function snapshot(dir: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const walk = async (at: string): Promise<void> => {
		for (const entry of await readdir(at, { withFileTypes: true })) {
			const abs = path.join(at, entry.name);
			const rel = path.relative(dir, abs).split(path.sep).join("/");
			const info = await stat(abs);
			if (entry.isDirectory()) {
				out[`${rel}/`] = `folder ${info.mtimeMs}`;
				await walk(abs);
				continue;
			}
			const hash = createHash("sha256")
				.update(await readFile(abs))
				.digest("hex");
			out[rel] = `${info.size} ${info.mtimeMs} ${hash}`;
		}
	};
	await walk(dir);
	return out;
}

let base: string;
let root: string;
let other: string;
const session = new ApiSession({ capabilities, demos: async () => ({}) });

beforeAll(async () => {
	base = await mkdtemp(path.join(tmpdir(), "roswaal-getreadonly-"));
	root = path.join(base, "project");
	other = path.join(base, "other");
	await cp(DEMO, root, { recursive: true });
	await cp(DEMO, other, { recursive: true });
	await writeFile(path.join(base, "beside.txt"), "not part of either project\n");
	await session.openAt(root);
	// A place, so the place routes have one to read. Made before the snapshot.
	await session.handle("POST", "/place/new", { body: {} });
});

afterAll(async () => {
	await rm(base, { recursive: true, force: true });
});

describe("every GET route", () => {
	it("has a sample here, so a new one cannot be missed", () => {
		const gets = Object.keys(session.routes)
			.filter((key) => key.startsWith("GET "))
			.sort();
		expect([...new Set(SAMPLES.map(([key]) => key))].sort()).toEqual(gets);
	});

	it("leaves every file and folder as it was, and acts on nothing", async () => {
		const before = await snapshot(base);
		const answers: Answers = {};
		const failed: string[] = [];
		for (const [key, sample] of SAMPLES) {
			const routePath = key.slice("GET ".length);
			try {
				answers[key] = await session.handle("GET", routePath, {
					query: sample(answers, { root, other }),
				});
			} catch (err) {
				failed.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		// Each route ran to its answer: a refusal would leave its reading untested.
		expect(failed).toEqual([]);
		expect(acted).toEqual([]);
		expect(await snapshot(base)).toEqual(before);
	});
});
