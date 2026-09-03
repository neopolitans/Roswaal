/**
 * Showing a file in the operating system's file manager.
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
