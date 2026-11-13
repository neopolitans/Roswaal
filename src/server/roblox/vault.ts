/**
 * Where Sign in with Roblox keeps what lasts beyond one start: the refresh
 * token and the Roblox user id it belongs to. The access token, which lasts
 * fifteen minutes, is never written down; the daemon holds it in memory.
 *
 * `~/.roswaal/roblox-signin`, beside the daemon's key and made the same way:
 * 0600 in a 0700 folder, removed and made afresh with `wx` so the mode is the
 * one it is made with (see `token.ts`). On Windows the contents are also
 * encrypted for the signed-in Windows account with DPAPI, through Windows
 * PowerShell started by its full path, the text going through stdin and
 * stdout so it is never in a command line another process could read.
 *
 * Never in a project folder, never in the editor tab, never in a log (CASA
 * 6.5, 6.7). See the Privacy Policy's Sign in with Roblox section.
 */

import { spawn } from "node:child_process";
import nodeFs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

import { windowsProgram } from "../programs.js";

/** What is kept: the refresh token and whose it is. */
export interface KeptSignIn {
	refreshToken: string;
	/** The Roblox user id (`sub`), the only thing `openid` says about anyone. */
	userId: string;
}

/** Reads, writes and forgets the kept sign-in. */
export interface SignInVault {
	read(): Promise<KeptSignIn | null>;
	write(kept: KeptSignIn): Promise<void>;
	forget(): Promise<void>;
}

/** Turns text into what is written, and back: DPAPI on Windows, nothing elsewhere. */
interface Sealer {
	seal(text: string): Promise<string>;
	open(sealed: string): Promise<string>;
}

const PLAIN: Sealer = {
	seal: async (text) => text,
	open: async (sealed) => sealed,
};

/** PowerShell that reads stdin and writes stdout, protecting or unprotecting it for this account. */
function dpapiScript(protect: boolean): string {
	const body = protect
		? "$b=[Text.Encoding]::UTF8.GetBytes($in);" +
			"[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'))"
		: "$b=[Convert]::FromBase64String($in.Trim());" +
			"[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";
	return `Add-Type -AssemblyName System.Security;$in=[Console]::In.ReadToEnd();${body}`;
}

function runPowerShell(script: string, input: string): Promise<string> {
	const powershell = windowsProgram("System32", "WindowsPowerShell", "v1.0", "powershell.exe");
	return new Promise((resolve, reject) => {
		const child = spawn(
			powershell,
			["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
			{ shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
		);
		let out = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			out += chunk;
		});
		// What PowerShell says on failure is not repeated: it could hold the input.
		child.stderr.resume();
		child.on("error", () => reject(new Error("Windows could not protect the sign-in.")));
		child.on("close", (code) => {
			if (code === 0) resolve(out.replace(/\r?\n$/, ""));
			else reject(new Error("Windows could not protect the sign-in."));
		});
		child.stdin.end(input);
	});
}

const DPAPI: Sealer = {
	seal: (text) => runPowerShell(dpapiScript(true), text),
	open: (sealed) => runPowerShell(dpapiScript(false), sealed),
};

/** Where the sign-in is kept. */
export function signInFile(home = os.homedir()): string {
	return nodePath.join(home, ".roswaal", "roblox-signin");
}

function isKept(value: unknown): value is KeptSignIn {
	const v = value as KeptSignIn;
	return (
		typeof v?.refreshToken === "string" &&
		v.refreshToken !== "" &&
		typeof v.userId === "string" &&
		/^\d+$/.test(v.userId)
	);
}

/**
 * The vault in `file`. DPAPI on Windows unless told otherwise, which is how
 * the tests on every system read the plain file.
 */
export function fileVault(
	file = signInFile(),
	sealer: Sealer = process.platform === "win32" ? DPAPI : PLAIN,
): SignInVault {
	return {
		async read() {
			let sealed: string;
			try {
				sealed = await nodeFs.promises.readFile(file, "utf8");
			} catch {
				return null;
			}
			try {
				const kept = JSON.parse(await sealer.open(sealed)) as unknown;
				return isKept(kept) ? kept : null;
			} catch {
				// Unreadable -- another account's DPAPI, or damaged: as good as none.
				return null;
			}
		},
		async write(kept) {
			const sealed = await sealer.seal(JSON.stringify(kept));
			await nodeFs.promises.mkdir(nodePath.dirname(file), { recursive: true, mode: 0o700 });
			await nodeFs.promises.rm(file, { force: true });
			await nodeFs.promises.writeFile(file, sealed, { mode: 0o600, flag: "wx" });
		},
		async forget() {
			await nodeFs.promises.rm(file, { force: true });
		},
	};
}

/** For tests: a vault that keeps the sign-in in memory. */
export function memoryVault(start: KeptSignIn | null = null): SignInVault & {
	kept: KeptSignIn | null;
} {
	const vault = {
		kept: start,
		read: async () => vault.kept,
		write: async (kept: KeptSignIn) => {
			vault.kept = kept;
		},
		forget: async () => {
			vault.kept = null;
		},
	};
	return vault;
}
