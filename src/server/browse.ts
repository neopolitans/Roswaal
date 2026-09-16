/**
 * The operating system's own "choose a folder" dialog.
 *
 * The daemon has to do this, and not because it is convenient. A browser cannot
 * hand back a filesystem path at all: `<input type="file" webkitdirectory>`
 * gives file *contents* under a relative name, and `showDirectoryPicker()`
 * gives an opaque handle. Roswaal needs an absolute path, because the daemon is
 * what opens the project. So the picker runs where the paths are real.
 *
 * **Nothing here goes through a shell, and no caller-supplied string is ever
 * concatenated into a script.** The starting directory comes from a text field
 * in the editor, so it is arbitrary; it is passed as an environment variable on
 * Windows and as an argument vector on macOS, both of which the interpreter
 * reads as data. Building the script with the path spliced in would make a
 * folder called `'; rm -rf ~; '` into a command, and such a folder is legal.
 *
 * Every platform's dialog is modal on the developer's machine and blocks until
 * they answer, so the HTTP request that asked for it stays open for as long as
 * the dialog is up. That is the correct behaviour and the reason for the
 * single-dialog guard below: without it, an impatient second click would put a
 * second dialog behind the first.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * True while a dialog is on screen.
 *
 * Module-level because the dialog is a property of the machine rather than of a
 * request: two browser tabs share one desktop, and stacked modal dialogs are a
 * good way to make a developer think the daemon has hung.
 */
let inFlight: Promise<string | null> | null = null;

export class NoPickerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NoPickerError";
	}
}

/**
 * Opens the folder picker and resolves with the chosen absolute path, or `null`
 * if the developer cancelled — cancelling is an ordinary answer, not an error.
 *
 * Throws `NoPickerError` when the machine has no dialog to show: a daemon over
 * SSH, a container, a Linux box with neither zenity nor kdialog. The editor
 * turns that into "type the path instead" rather than a stack trace, because
 * the text field beside the button already works.
 */
export async function chooseDirectory(startIn?: string): Promise<string | null> {
	/**
	 * A second ask joins the first rather than being refused.
	 *
	 * This used to throw, and the message went to the one person it could not
	 * help: somebody clicks Browse, the dialog opens somewhere they cannot see
	 * it, so they click Browse again — and are told a picker is already open,
	 * which reads as the button being broken. Handing back the same promise
	 * makes the second click wait for the answer to the first, which is what
	 * they meant by it.
	 */
	if (inFlight) return inFlight;

	// Only offered as a starting point, so a path that has gone stale should
	// open the dialog somewhere sensible rather than fail it.
	const start = startIn && (await isDirectory(startIn)) ? path.resolve(startIn) : undefined;

	const pick = (async () => {
		switch (process.platform) {
			case "win32":
				return await windowsPicker(start);
			case "darwin":
				return await macPicker(start);
			default:
				return await linuxPicker(start);
		}
	})();

	inFlight = pick;
	try {
		return await pick;
	} finally {
		inFlight = null;
	}
}

/**
 * Windows PowerShell's `FolderBrowserDialog`.
 *
 * `-STA` because the dialog is a COM component and will not open on an MTA
 * thread. `-NoProfile` because a developer's profile can print a banner, and
 * anything on stdout would be read here as part of the path.
 *
 * The starting directory arrives as `ROSWAAL_BROWSE_START` in the environment
 * rather than inside the script text — see the note at the top of this file.
 */
async function windowsPicker(start?: string): Promise<string | null> {
	const script = [
		"Add-Type -AssemblyName System.Windows.Forms",
		// `System.Drawing` for the owner's Point and Size; not loaded by default.
		"Add-Type -AssemblyName System.Drawing",
		"$d = New-Object System.Windows.Forms.FolderBrowserDialog",
		"$d.Description = 'Choose a folder to open as a Roswaal project'",
		"$d.ShowNewFolderButton = $true",
		"if ($env:ROSWAAL_BROWSE_START) { $d.SelectedPath = $env:ROSWAAL_BROWSE_START }",
		// A top-most owner, so the dialog opens in front of the browser rather
		// than behind it where nobody finds it.
		//
		// **Shown and activated**, which is the part that was missing. A form
		// that is only constructed is not a window yet: `ShowDialog` took it as
		// an owner and Windows had nothing to raise, so the dialog appeared
		// behind whatever had focus — which is the browser, every time, because
		// the click that asked for it happened there.
		//
		// Off-screen and out of the taskbar so the thing being raised is never
		// actually seen. One pixel, because a zero-sized form is not shown at
		// all on some versions.
		"$owner = New-Object System.Windows.Forms.Form",
		"$owner.TopMost = $true",
		"$owner.ShowInTaskbar = $false",
		"$owner.FormBorderStyle = 'None'",
		"$owner.StartPosition = 'Manual'",
		"$owner.Location = New-Object System.Drawing.Point(-32000, -32000)",
		"$owner.Size = New-Object System.Drawing.Size(1, 1)",
		"$owner.Show()",
		"$owner.Activate()",
		"if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {",
		"  [Console]::Out.Write($d.SelectedPath)",
		"}",
		"$owner.Close()",
		"$owner.Dispose()",
	].join("\n");

	return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], {
		...process.env,
		...(start ? { ROSWAAL_BROWSE_START: start } : {}),
	});
}

/**
 * AppleScript's `choose folder`.
 *
 * The script reads its starting directory from `argv` rather than having it
 * spliced in. Cancelling exits non-zero with "User canceled", which `run`
 * reports as `null` like every other cancel.
 */
async function macPicker(start?: string): Promise<string | null> {
	const script = [
		"on run argv",
		"  if (count of argv) > 0 then",
		"    set f to (choose folder with prompt \"Choose a Roswaal project folder\"" +
			" default location (POSIX file (item 1 of argv)))",
		"  else",
		"    set f to (choose folder with prompt \"Choose a Roswaal project folder\")",
		"  end if",
		"  return POSIX path of f",
		"end run",
	].join("\n");

	const args = ["-e", script, ...(start ? ["--", start] : [])];
	return run("osascript", args, process.env);
}

/**
 * Freedesktop has no single answer, so whichever of the two usual dialogs is
 * installed. Neither is guaranteed — a daemon on a headless box has no dialog
 * at all, and that is a `NoPickerError` rather than a hang.
 */
async function linuxPicker(start?: string): Promise<string | null> {
	if (await onPath("zenity")) {
		return run(
			"zenity",
			[
				"--file-selection",
				"--directory",
				"--title=Choose a Roswaal project folder",
				...(start ? [`--filename=${start}${path.sep}`] : []),
			],
			process.env,
		);
	}
	if (await onPath("kdialog")) {
		return run(
			"kdialog",
			["--getexistingdirectory", start ?? process.env.HOME ?? "."],
			process.env,
		);
	}
	throw new NoPickerError(
		"No folder picker is installed on the machine running the daemon. " +
			"Install zenity or kdialog, or type the path instead.",
	);
}

/**
 * Runs a picker and reads the path off stdout.
 *
 * A non-zero exit is a cancel, not a failure: every one of these reports "the
 * developer pressed Cancel" that way, and there is no separate signal for it.
 * Empty output means the same thing.
 */
function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string | null> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { shell: false, env, stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		let err = "";

		child.stdout.on("data", (chunk) => (out += chunk));
		child.stderr.on("data", (chunk) => (err += chunk));

		child.on("error", (cause) => {
			reject(
				new NoPickerError(
					`Could not open a folder picker (${command}: ${cause.message}). ` +
						"Type the path instead.",
				),
			);
		});

		child.on("close", (code) => {
			const chosen = out.trim();
			if (chosen) return resolve(chosen);
			if (code === 0) return resolve(null);
			// A cancel and a broken dialog both land here; only the second has
			// anything to say, and saying it is more useful than guessing.
			if (err.trim() && !/cancel/i.test(err)) {
				return reject(new NoPickerError(`The folder picker failed: ${err.trim()}`));
			}
			resolve(null);
		});
	});
}

async function isDirectory(target: string): Promise<boolean> {
	return fs.stat(target).then((s) => s.isDirectory(), () => false);
}

/** Looks up one command across PATH without asking a shell to do it. */
async function onPath(filename: string): Promise<boolean> {
	for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
		if (await fs.access(path.join(dir, filename)).then(() => true, () => false)) return true;
	}
	return false;
}
