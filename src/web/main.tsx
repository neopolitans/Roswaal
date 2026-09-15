/**
 * The editor as a website.
 *
 * The same editor. Its whole back end is the worker started below — the route
 * table from `routes.ts`, the project rules from `project.ts`, and a volume in
 * memory where the disk would be — so what a stranger tries in a browser tab
 * behaves like the tool they would install, rather than like a demonstration of
 * it. What it cannot do, it does not offer: there is no folder to reveal a file
 * in and no editor to hand one to, and those routes answer 501, which the
 * editor already reads as "drop the button".
 *
 * Everything here happens before the first render, because the editor asks for
 * a project as soon as it mounts and a transport installed afterwards would
 * miss it.
 */

import { bootEditor } from "../app/boot.jsx";
import { useTransport } from "../app/api.js";
import {
	setRememberedFolder, useDirectoryOpener, useFolderForgetter, type DirectoryPick,
} from "../app/host.js";

import { canOpenDirectory } from "./directoryFs.js";
import {
	askPermissionFor, forgetFolder, permissionFor, rememberedFolder, rememberFolder,
} from "./remember.js";
import { workerTransport } from "./transport.js";

const worker = new Worker(new URL("./worker.js", import.meta.url), {
	type: "module",
	name: "roswaal-project",
});

const transport = workerTransport(worker);
useTransport(transport);

/**
 * Hands a folder to the worker, and remembers it once it is really open.
 *
 * Remembered only on success, and only after any setting-up: a folder that
 * turned out not to be a project, or that the developer declined to initialise,
 * is not one they were working in.
 */
async function openFolder(handle: FileSystemDirectoryHandle): Promise<DirectoryPick> {
	const opened = await transport.mount(handle);
	if ("root" in opened) {
		await rememberFolder(handle);
		return opened;
	}
	return {
		notAProject: opened.notAProject,
		initialise: async () => {
			const made = await transport.mount(handle, true);
			if (!("root" in made)) throw new Error("It could not be set up.");
			await rememberFolder(handle);
			return made;
		},
	};
}

/**
 * A real folder, in the browser, with nothing installed.
 *
 * Only offered where the browser has the picker at all — Chrome and Edge, at
 * time of writing. Everywhere else the editor simply does not mention it, which
 * is the same rule every other capability follows.
 *
 * The click that opens the picker has to be the developer's own: the API
 * refuses without a gesture, which is what stops a page helping itself to
 * somebody's home directory.
 */
async function start(): Promise<void> {
	if (!canOpenDirectory()) {
		bootEditor();
		return;
	}

	useDirectoryOpener(async () => {
		let handle: FileSystemDirectoryHandle;
		try {
			handle = await window.showDirectoryPicker({ mode: "readwrite" });
		} catch (err) {
			// Cancelling is an answer, not a failure — the same way the daemon's
			// folder dialog reports one.
			if ((err as DOMException)?.name === "AbortError") return null;
			throw err;
		}
		return openFolder(handle);
	});

	useFolderForgetter(forgetFolder);

	/**
	 * The folder from last time.
	 *
	 * Three answers, and they are genuinely different things. **Granted** means
	 * the permission outlived the session, so the folder is opened before
	 * anything renders and the developer simply carries on — awaited rather than
	 * left to settle, because the alternative is a flash of the demo and then a
	 * project appearing underneath them.
	 *
	 * **Prompt** means the handle is still here but the permission is not, and
	 * asking needs a click. So it is offered by name instead, and the click that
	 * accepts is the click that asks.
	 *
	 * **Denied**, or no folder at all, means the playground — which is also what
	 * a first visit gets, and needs no explaining either way.
	 */
	const handle = await rememberedFolder();
	if (!handle) {
		bootEditor();
		return;
	}

	const permission = await permissionFor(handle);
	if (permission === "granted") {
		// A folder that has since been deleted or moved fails here rather than
		// leaving the editor half-open on something that is not there.
		const opened = await openFolder(handle).catch(() => null);
		if (opened && "root" in opened) {
			bootEditor();
			return;
		}
		await forgetFolder();
		bootEditor();
		return;
	}

	if (permission === "prompt") {
		setRememberedFolder({
			name: handle.name,
			open: async () => {
				if (await askPermissionFor(handle) !== "granted") return null;
				const opened = await openFolder(handle);
				setRememberedFolder(null);
				return opened;
			},
		});
	} else {
		await forgetFolder();
	}

	bootEditor();
}

void start();
