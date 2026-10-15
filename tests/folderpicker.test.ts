/**
 * The Windows folder picker is Explorer's, asked for with the script encoded
 * and the starting folder as data; and a second ask while one is open says so.
 *
 * Nothing here opens a dialog: `spawn` is replaced, and so is the daemon.
 */

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawned: { command: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];

vi.mock("node:child_process", () => ({
	spawn: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
		spawned.push({ command, args, env: options.env });
		const child = Object.assign(new EventEmitter(), {
			stdout: new EventEmitter(),
			stderr: new EventEmitter(),
		});
		// Cancelled: nothing on stdout, a clean exit.
		setTimeout(() => child.emit("close", 0));
		return child;
	},
}));

const toasts: { title: string; tone?: string }[] = [];
vi.mock("../src/app/Toast.jsx", () => ({
	showToast: (toast: { title: string; tone?: string }) => toasts.push(toast),
}));

/** The asks the daemon has not answered yet, oldest first. */
const pending: ((value: { path: string | null }) => void)[] = [];
const answer = () => pending.shift()?.({ path: null });
vi.mock("../src/app/api.js", () => ({
	api: {
		browseForProject: () =>
			new Promise<{ path: string | null }>((resolve) => {
				pending.push(resolve);
			}),
	},
}));

const { chooseDirectory, encodeCommand } = await import("../src/server/browse.js");
const { chooseFolder } = await import("../src/app/folderDialog.js");

const platform = process.platform;
let start = "";

beforeEach(async () => {
	spawned.length = 0;
	toasts.length = 0;
	start = await mkdtemp(path.join(os.tmpdir(), "roswaal-picker-"));
	Object.defineProperty(process, "platform", { value: "win32" });
});

afterEach(async () => {
	Object.defineProperty(process, "platform", { value: platform });
	await rm(start, { recursive: true, force: true });
});

/** The script PowerShell was given, decoded. */
const scriptOf = (args: string[]) =>
	Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");

describe("the Windows folder picker", () => {
	it("is Explorer's, with the old dialog only if that cannot load", async () => {
		expect(await chooseDirectory(start)).toBeNull();
		expect(spawned).toHaveLength(1);
		const script = scriptOf(spawned[0].args);
		expect(script).toContain("[RoswaalFolderPicker]::Pick(");
		expect(script).toMatch(/catch \{ \$modern = \$false \}/);
		expect(script).toContain("FolderBrowserDialog");
		expect(spawned[0].env.ROSWAAL_PICKER_SOURCE).toContain("PICK_FOLDERS");
	});

	it("gets its starting folder as data, never in the script", async () => {
		await chooseDirectory(start);
		expect(spawned[0].env.ROSWAAL_BROWSE_START).toBe(path.resolve(start));
		expect(scriptOf(spawned[0].args)).not.toContain(start);
		expect(spawned[0].args).not.toContain("-Command");
	});

	it("is encoded as PowerShell reads it", () => {
		expect(Buffer.from(encodeCommand("Write-Output 'é'"), "base64").toString("utf16le")).toBe(
			"Write-Output 'é'",
		);
	});
});

describe("asking for the folder dialog twice", () => {
	it("says the first is open, and both get its answer", async () => {
		const first = chooseFolder();
		expect(toasts).toEqual([]);
		const second = chooseFolder();
		expect(toasts).toEqual([
			expect.objectContaining({ title: "The folder dialog is already open", tone: "warn" }),
		]);
		answer();
		answer();
		await Promise.all([first, second]);
		// Answered, so the next ask is a first one again.
		toasts.length = 0;
		const third = chooseFolder();
		expect(toasts).toEqual([]);
		answer();
		await third;
	});
});
