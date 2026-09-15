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
import { useDirectoryOpener } from "../app/host.js";

import { canOpenDirectory } from "./directoryFs.js";
import { workerTransport } from "./transport.js";

const worker = new Worker(new URL("./worker.js", import.meta.url), {
	type: "module",
	name: "roswaal-project",
});

const transport = workerTransport(worker);
useTransport(transport);

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
if (canOpenDirectory()) {
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
		return transport.mount(handle);
	});
}

bootEditor();
