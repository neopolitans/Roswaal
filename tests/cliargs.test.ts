/**
 * Reading the command line before anything runs.
 *
 * `roswaal --version` printed the help, `roswaal init --help` initialised the
 * folder it was typed in, and `roswaal serve --help` started a daemon: the
 * flags were read as flags, and the command ran. These pin which command a
 * command line asks for, and that `init` makes the project every host makes.
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseInvocation } from "../src/cli/args.js";
import { helpLines } from "../src/cli/help.js";
import { initProject, openProject } from "../src/server/project.js";

describe("which command a command line asks for", () => {
	it("prints the version for --version, wherever it is", () => {
		expect(parseInvocation(["--version"]).command).toBe("version");
		expect(parseInvocation(["version"]).command).toBe("version");
		expect(parseInvocation(["compile", "--version"]).command).toBe("version");
	});

	it("prints a command's help rather than running it", () => {
		expect(parseInvocation(["serve", "--help"])).toMatchObject({ command: "help", topic: "serve" });
		expect(parseInvocation(["init", "-h"])).toMatchObject({ command: "help", topic: "init" });
		expect(parseInvocation(["help", "compile"])).toMatchObject({ command: "help", topic: "compile" });
		expect(parseInvocation(["--help", "serve"])).toMatchObject({ command: "help", topic: "serve" });
	});

	it("prints the whole help with nothing asked, or --help on its own", () => {
		expect(parseInvocation([])).toMatchObject({ command: "help" });
		expect(parseInvocation([]).topic).toBeUndefined();
		expect(parseInvocation(["--help"]).topic).toBeUndefined();
	});

	it("runs anything else, with its flags", () => {
		const run = parseInvocation(["compile", "--force", "Main.nodescript", "--port", "5000"]);
		expect(run.command).toBe("compile");
		expect(run.args.positional).toEqual(["compile", "Main.nodescript"]);
		expect(run.args.flags).toEqual({ force: true, port: "5000" });
	});
});

describe("a command's help", () => {
	it("describes that command and the options it takes", () => {
		const text = helpLines("serve").join("\n");
		expect(text).toContain("roswaal serve");
		expect(text).toContain("--no-open");
		expect(text).toContain("--root");
		expect(text).not.toContain("--yes");
	});

	it("falls back to the whole list for a command there is not", () => {
		expect(helpLines("nonsense").join("\n")).toContain("COMMANDS");
	});
});

describe("initialising a folder", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("makes a project, and says what it made", async () => {
		root = await mkdtemp(join(tmpdir(), "roswaal-init-"));
		const { steps } = await initProject(root, { examplePack: "return {}" });
		expect(steps.map((s) => [s.path, s.created])).toEqual([
			["roswaal.json", true],
			[".roswaal/scripts", true],
			[".roswaal/nodes", true],
			[".roswaal/nodes/example.nodedef.luau", true],
		]);
		expect((await openProject(root)).initialised).toBe(true);
	});

	it("keeps a config that is there, and makes the folders it names", async () => {
		root = await mkdtemp(join(tmpdir(), "roswaal-init-"));
		const config = JSON.stringify({ sourceDir: "graphs", nodePaths: ["packs"] });
		await writeFile(join(root, "roswaal.json"), config);
		const { steps } = await initProject(root);
		expect(steps.map((s) => [s.path, s.created])).toEqual([
			["roswaal.json", false],
			["graphs", true],
			["packs", true],
		]);
		expect(await readFile(join(root, "roswaal.json"), "utf8")).toBe(config);
		expect(await readdir(root)).not.toContain(".roswaal");
	});

	it("is what a folder with no roswaal.json is not", async () => {
		root = await mkdtemp(join(tmpdir(), "roswaal-init-"));
		await mkdir(join(root, "src"));
		expect((await openProject(root)).initialised).toBe(false);
	});
});
