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

import { workerTransport } from "./transport.js";

const worker = new Worker(new URL("./worker.js", import.meta.url), {
	type: "module",
	name: "roswaal-project",
});

useTransport(workerTransport(worker));

bootEditor();
