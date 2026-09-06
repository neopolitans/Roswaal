/**
 * Showing a file in the operating system's file manager, and handing one to the
 * developer's code editor.
 *
 * The daemon is the only part of Roswaal that can do this — the editor is a web
 * page and cannot reach the shell. Paths are resolved against the project root
 * before anything is spawned, and no argument reaches a shell, so a path from
 * the page cannot become a command.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export async function revealInFileManager(absolutePath: string): Promise<void> {
	const stat = await fs.stat(absolutePath).catch(() => null);
	if (!stat) throw new Error(`${path.basename(absolutePath)} is not on disk.`);

	// Selecting the file itself is nicer than opening its folder, where
	// supported; a directory is opened rather than selected in its parent.
	const isDirectory = stat.isDirectory();

	switch (process.platform) {
		case "win32":
			// explorer.exe returns a non-zero exit code even when it succeeds, so
			// its result is deliberately not checked.
			detach("explorer.exe", isDirectory ? [absolutePath] : ["/select,", absolutePath]);
			return;
		case "darwin":
			detach("open", isDirectory ? [absolutePath] : ["-R", absolutePath]);
			return;
		default:
			// Freedesktop has no "select this file", so open the containing folder.
			detach("xdg-open", [isDirectory ? absolutePath : path.dirname(absolutePath)]);
			return;
	}
}

/**
 * Spawns without a shell and lets the child outlive the request. The file
 * manager is not ours to wait on, and holding the handle would keep the daemon
 * attached to a window the developer may leave open all day.
 */
function detach(command: string, args: string[]): void {
	const child = spawn(command, args, { detached: true, stdio: "ignore", shell: false });
	child.unref();
}

// ---------------------------------------------------------------------------
// Handing a file to VS Code
// ---------------------------------------------------------------------------

/**
 * Opens a file in VS Code, and says which one it found.
 *
 * **Nothing here goes through a shell**, which is the whole reason this is
 * fiddlier than one `spawn` call. A path from the editor is resolved against
 * the project root before it arrives, but the surrounding directories are the
 * developer's and may contain any character at all — a folder called `a & b` is
 * legal on every platform and is a command on Windows. So the executable is
 * located as a real file and spawned directly, with the path as an argument
 * that no parser ever sees.
 *
 * Windows makes that awkward: `code` on PATH is `code.cmd`, a batch file, which
 * `spawn` cannot run without a shell. It sits in `<install>/bin`, next to
 * `<install>/Code.exe`, so the launcher is derived from the script rather than
 * run through one.
 *
 * If VS Code is not installed the failure is reported rather than papered over
 * with some other application. "Show in folder" is right there and already
 * works, and silently opening Notepad would be worse than a clear no.
 */
export async function openInEditor(absolutePath: string): Promise<string> {
	const stat = await fs.stat(absolutePath).catch(() => null);
	if (!stat) throw new Error(`${path.basename(absolutePath)} is not on disk.`);

	const found = await findVsCode();
	if (!found) {
		throw new Error(
			"Could not find VS Code. Install it, or make sure `code` is on your PATH — " +
			"in VS Code that is “Shell Command: Install 'code' command in PATH”.",
		);
	}

	detach(found.command, [...found.args, absolutePath]);
	return found.name;
}

interface Launcher {
	/** For the message the editor shows: "Opened in Visual Studio Code". */
	name: string;
	command: string;
	args: string[];
}

async function findVsCode(): Promise<Launcher | null> {
	if (process.platform === "darwin") {
		for (const app of ["Visual Studio Code", "VSCodium", "Cursor"]) {
			if (await isThere(`/Applications/${app}.app`)) {
				// `open` is a real binary and takes the name as one argument, so
				// nothing is parsed on the way through.
				return { name: app, command: "open", args: ["-a", app] };
			}
		}
		return null;
	}

	if (process.platform === "win32") {
		for (const stem of ["code", "code-insiders", "codium", "cursor"]) {
			const script = await onPath(`${stem}.cmd`);
			if (script) {
				// <install>/bin/code.cmd -> <install>/Code.exe
				const exe = await firstThere(
					path.resolve(path.dirname(script), "..", "Code.exe"),
					path.resolve(path.dirname(script), "..", `${stem}.exe`),
				);
				if (exe) return { name: path.basename(exe, ".exe"), command: exe, args: [] };
			}
			const direct = await onPath(`${stem}.exe`);
			if (direct) return { name: stem, command: direct, args: [] };
		}
		// The default per-user install, which does not put anything on PATH
		// unless you ask it to.
		const local = process.env.LOCALAPPDATA;
		const program = process.env.ProgramFiles;
		const guess = await firstThere(
			...(local ? [path.join(local, "Programs", "Microsoft VS Code", "Code.exe")] : []),
			...(program ? [path.join(program, "Microsoft VS Code", "Code.exe")] : []),
		);
		return guess ? { name: "Code", command: guess, args: [] } : null;
	}

	// Elsewhere `code` is an ELF binary or a script with a shebang, either of
	// which `spawn` runs directly.
	for (const stem of ["code", "code-insiders", "codium", "cursor"]) {
		const found = await onPath(stem);
		if (found) return { name: stem, command: found, args: [] };
	}
	return null;
}

/** Looks up one filename across PATH, without asking a shell to do it. */
async function onPath(filename: string): Promise<string | null> {
	const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
	for (const dir of dirs) {
		const candidate = path.join(dir, filename);
		if (await isThere(candidate)) return candidate;
	}
	return null;
}

async function firstThere(...candidates: string[]): Promise<string | null> {
	for (const candidate of candidates) {
		if (await isThere(candidate)) return candidate;
	}
	return null;
}

async function isThere(target: string): Promise<boolean> {
	return fs.access(target).then(() => true, () => false);
}
