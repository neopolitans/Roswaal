/**
 * Every program Roswaal starts is started by its full path, found on PATH or
 * in the Windows folder, and never from the project or the current folder.
 *
 * Nothing here runs a program: `node:child_process` is replaced, and the
 * "programs" on the made-up PATH are empty files.
 */

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawned: { command: string; cwd?: string }[] = [];

vi.mock("node:child_process", () => ({
	spawnSync: (command: string, _args: string[], options: { cwd?: string; input?: string }) => {
		spawned.push({ command, cwd: options.cwd });
		return { status: 0, stdout: `formatted ${options.input}`, error: undefined };
	},
	spawn: (command: string) => {
		spawned.push({ command });
		const child = Object.assign(new EventEmitter(), {
			stdout: new EventEmitter(),
			stderr: new EventEmitter(),
			unref: () => {
				// Detached children are let go; there is nothing to let go of here.
			},
		});
		setTimeout(() => child.emit("close", 1));
		return child;
	},
}));

const { findOnPath, windowsProgram } = await import("../src/server/programs.js");
const { formatLuau } = await import("../src/server/format.js");
const { chooseDirectory } = await import("../src/server/browse.js");
const { revealInFileManager } = await import("../src/server/reveal.js");

const STYLUA = process.platform === "win32" ? "stylua.exe" : "stylua";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform;
const savedPath = process.env.PATH;

let base = "";

/** An empty file standing in for a program, in a new folder under `base`. */
function program(folder: string, name: string): string {
	const dir = path.join(base, folder);
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, name), "");
	return dir;
}

beforeEach(() => {
	spawned.length = 0;
	base = mkdtempSync(path.join(os.tmpdir(), "roswaal-programs-"));
});

afterEach(() => {
	Object.defineProperty(process, "platform", { value: platform });
	process.env.PATH = savedPath;
	rmSync(base, { recursive: true, force: true });
});

describe("a program on PATH", () => {
	it("is found by its full path", () => {
		const dir = program("tools", "thing.exe");
		expect(findOnPath("thing.exe", { pathVar: dir })).toBe(path.join(dir, "thing.exe"));
	});

	it("is not found through a relative entry, even one that holds it", () => {
		// package.json is in the folder the tests run from.
		expect(findOnPath("package.json", { pathVar: "." })).toBeNull();
		expect(
			findOnPath("package.json", { pathVar: `${path.delimiter}.${path.delimiter}` }),
		).toBeNull();
		expect(findOnPath("roswaal.mjs", { pathVar: "bin" })).toBeNull();
		expect(process.cwd()).toBe(ROOT);
	});

	it("is not found inside the folder it must stay out of", () => {
		const project = path.join(base, "project");
		const inside = program(path.join("project", "node_modules", ".bin"), "thing.exe");
		const elsewhere = program("tools", "thing.exe");
		const pathVar = [inside, elsewhere].join(path.delimiter);
		expect(findOnPath("thing.exe", { pathVar, outside: project })).toBe(
			path.join(elsewhere, "thing.exe"),
		);
		expect(findOnPath("thing.exe", { pathVar: inside, outside: project })).toBeNull();
	});

	it("is a file, not a folder with its name", () => {
		const dir = path.join(base, "tools");
		mkdirSync(path.join(dir, "thing.exe"), { recursive: true });
		expect(findOnPath("thing.exe", { pathVar: dir })).toBeNull();
	});

	it("is found through a quoted entry", () => {
		const dir = program("tools", "thing.exe");
		expect(findOnPath("thing.exe", { pathVar: `"${dir}"` })).toBe(path.join(dir, "thing.exe"));
	});
});

describe("a program that ships with Windows", () => {
	it("is under the Windows folder", () => {
		const program = windowsProgram("System32", "WindowsPowerShell", "v1.0", "powershell.exe");
		expect(path.win32.isAbsolute(program)).toBe(true);
		expect(program.toLowerCase()).toMatch(/\\system32\\windowspowershell\\v1\.0\\powershell\.exe$/);
	});
});

describe("StyLua", () => {
	it("is started by its full path, and not from the project it formats", () => {
		const project = program("project", STYLUA);
		const tools = program("tools", STYLUA);
		process.env.PATH = [project, tools].join(path.delimiter);

		expect(formatLuau(project, "x")).toEqual({ code: "formatted x" });
		expect(spawned).toEqual([{ command: path.join(tools, STYLUA), cwd: project }]);
	});

	it("is not started at all when the project holds the only one", () => {
		const project = program("lonely", STYLUA);
		process.env.PATH = project;

		expect(formatLuau(project, "x")).toEqual({ code: "x" });
		expect(spawned).toEqual([]);
	});

	it("is looked for again for another project", () => {
		const first = program("first", STYLUA);
		const second = program("second", STYLUA);
		process.env.PATH = [first, second].join(path.delimiter);

		formatLuau(first, "x");
		formatLuau(second, "x");
		expect(spawned.map((s) => s.command)).toEqual([
			path.join(second, STYLUA),
			path.join(first, STYLUA),
		]);
	});
});

describe("the folder picker on Windows", () => {
	it("starts Windows PowerShell by its full path", async () => {
		Object.defineProperty(process, "platform", { value: "win32" });
		await chooseDirectory();
		expect(spawned).toHaveLength(1);
		expect(path.win32.isAbsolute(spawned[0].command)).toBe(true);
		expect(spawned[0].command.toLowerCase()).toMatch(
			/\\windowspowershell\\v1\.0\\powershell\.exe$/,
		);
	});
});

describe("the folder picker on macOS", () => {
	it("starts osascript by its full path", async () => {
		Object.defineProperty(process, "platform", { value: "darwin" });
		await chooseDirectory();
		expect(spawned.map((s) => s.command)).toEqual(["/usr/bin/osascript"]);
	});
});

describe("showing a file in the file manager", () => {
	it("starts open by its full path on macOS", async () => {
		Object.defineProperty(process, "platform", { value: "darwin" });
		await revealInFileManager(base);
		expect(spawned.map((s) => s.command)).toEqual(["/usr/bin/open"]);
	});

	it("starts xdg-open by the full path PATH gives it on Linux", async () => {
		Object.defineProperty(process, "platform", { value: "linux" });
		const tools = program("tools", "xdg-open");
		process.env.PATH = tools;
		await revealInFileManager(base);
		expect(spawned.map((s) => s.command)).toEqual([path.join(tools, "xdg-open")]);
	});

	it("starts no xdg-open found only through a relative entry", async () => {
		Object.defineProperty(process, "platform", { value: "linux" });
		const planted = program("project", "xdg-open");
		// A relative entry that holds it, where one can be written: across Windows
		// drives there is no relative path, so `.` and an empty entry stand alone.
		const relative = path.relative(process.cwd(), planted);
		process.env.PATH = [".", ...(path.isAbsolute(relative) ? [] : [relative]), ""].join(
			path.delimiter,
		);
		await expect(revealInFileManager(base)).rejects.toThrow(/xdg-open/);
		expect(spawned).toEqual([]);
	});
});

describe("the macOS and Linux launcher", () => {
	const launcher = readFileSync(path.join(ROOT, "bin", "roswaal"), "utf8");
	const lines = launcher.split(/\r?\n/).filter((line) => line.trim() && !/^\s*#/.test(line));

	it("starts Node by the full path it found on PATH's absolute entries", () => {
		expect(lines.at(-1)).toBe('exec "$ROSWAAL_NODE" "$ENTRY" "$@"');
		expect(lines).toContain("    /*) ;;");
		expect(lines).toContain('    ROSWAAL_NODE="$dir/node"');
	});

	it("starts nothing else by a bare name", () => {
		const bare = lines.filter((line) =>
			/(^|[;&|(`]\s*|\$\(\s*)(node|dirname|which)\b/.test(line.trim()),
		);
		expect(bare).toEqual([]);
	});
});

describe("the Windows launcher", () => {
	const launcher = readFileSync(path.join(ROOT, "bin", "roswaal.cmd"), "utf8");
	const lines = launcher.split(/\r?\n/).filter((line) => line.trim() && !/^\s*rem\b/i.test(line));

	it("starts Node by the full path it found", () => {
		expect(lines.at(-1)).toBe('(goto) 2>nul & "%ROSWAAL_NODE%" "%ROSWAAL_ENTRY%" %*');
	});

	it("asks where.exe by its full path, with the current folder left out", () => {
		expect(lines).toContain('set "NoDefaultCurrentDirectoryInExePath=1"');
		expect(
			lines.some((line) => line.includes('"%SystemRoot%\\System32\\where.exe" node.exe')),
		).toBe(true);
		expect(lines.some((line) => /if \/i not "%%~dpN"=="%ROSWAAL_HERE%"/.test(line))).toBe(true);
	});

	it("starts nothing else by a bare name", () => {
		const bare = lines.filter((line) => /(^|[&(]\s*)(node|where)\b/i.test(line.trim()));
		expect(bare).toEqual([]);
	});
});
