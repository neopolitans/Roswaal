/**
 * The daemon, in a worker, with a volume in memory where the disk would be.
 *
 * This is the whole of the hosted editor's back end. It mounts the demo,
 * opens it through `ApiSession` exactly as `roswaal serve <dir>` does, and then
 * answers the same route table over `postMessage` instead of over a socket.
 * Nothing here knows anything about projects — `routes.ts` does that, and
 * `project.ts` under it, both running unmodified.
 *
 * In a worker rather than on the main thread because compiling is the one thing
 * here that can take a while. A whole-project compile walks every graph in the
 * project and the playground is deliberately small, so today it would not
 * matter; it will matter the moment the hosted editor is pointed at somebody's
 * real repository, and moving it afterwards would mean moving this boundary
 * afterwards too.
 *
 * Unlike the rest of `src/web`, this module runs when it is loaded: it is the
 * worker's entry point, and loading it is starting it.
 */

/// <reference lib="webworker" />

import { VERSION } from "../cli/version.js";
import { errorMessage } from "../server/errors.js";
import { createProject } from "../server/newProject.js";
import {
	initProject,
	isInitialised,
	type OpenProject,
	writePlaceImport,
} from "../server/project.js";
import { ApiSession, type ErrorBody, errorResponse } from "../server/routes.js";
import { DirectoryFs, mountFor } from "./directoryFs.js";
import { useFilesystem, usingVolume, volume } from "./host.js";
import { opfsStore, persistence } from "./persist.js";
import type {
	ApiRequestMessage,
	FromWorker,
	ImportMessage,
	ImportPlaceMessage,
	MountMessage,
	NewProjectMessage,
	ToWorker,
} from "./protocol.js";
import { PLAYGROUND_ROOT, playgroundFiles } from "./seed.js";

declare const self: DedicatedWorkerGlobalScope;

/** A reply to a message that asked for one. */
interface Reply {
	status: number;
	payload: unknown;
}

function post(message: FromWorker): void {
	self.postMessage(message);
}

/** A reply's status and payload for an error, as the daemon would give them. */
function answer(err: unknown): Reply {
	const { status, body } = errorResponse(err);
	return { status, payload: body };
}

/**
 * The answer for a folder or archive with no `roswaal.json`: a 409 the editor
 * acts on by asking, carrying the name it asks about.
 */
function notAProject(name: string): Reply {
	const payload: ErrorBody = {
		error: `${name} is not a Roswaal project: it has no roswaal.json.`,
		code: "not-a-project",
		name,
	};
	return { status: 409, payload };
}

/** The answer for a project taken in: what the editor needs to show it. */
function opened(project: OpenProject): Reply {
	return {
		status: 200,
		payload: { root: project.root, config: project.config, packErrors: project.packErrors },
	};
}

const store = persistence(opfsStore(), VERSION);

const session = new ApiSession({
	capabilities: {
		/**
		 * The only thing this host can do that a machine cannot: throw the
		 * project away and start from the demo again.
		 *
		 * A capability rather than something the worker handles on its own,
		 * because the editor has to know whether to offer it — and the daemon
		 * must not, where "start again" would mean deleting somebody's
		 * repository. A host that does not pass it answers 501.
		 */
		reset: async () => {
			await store.forget();
		},
	},
	compileStep: (step) => post({ kind: "event", event: "compile", data: step }),
});

/**
 * Where the browser's own project is on the volume: the demo's root until a
 * zip replaces it, and then the name that zip carried.
 */
let playgroundRoot = PLAYGROUND_ROOT;

/**
 * Mounted and opened before the first request is answered, not before the first
 * one arrives — the editor starts asking as soon as it renders, and making it
 * wait for a handshake would be a second thing to get wrong.
 *
 * The stored project wins over the demo. Somebody returning to a tab they were
 * working in wants what they left; somebody arriving for the first time has
 * nothing stored and gets the demo. Neither needs to be asked.
 */
const ready = (async () => {
	const stored = await store.restore();
	volume.mount(stored ? stored.files : playgroundFiles());
	if (stored) {
		// After the files: a directory with nothing in it is not implied by any
		// of them, and is the whole reason the directories are stored separately.
		volume.mountDirs(stored.dirs);
		// The binaries just mounted are the ones stored, so the first edit does
		// not write them all again.
		store.restoredAt(volume.binaryStamp);
	}
	if (stored?.root) playgroundRoot = stored.root;
	await session.openAt(playgroundRoot);
})();

/** The volume as it now stands, for the store to write when things settle. */
function snapshot() {
	return {
		files: volume.snapshot(playgroundRoot),
		dirs: volume.directories(playgroundRoot),
		root: playgroundRoot,
		binaryStamp: volume.binaryStamp,
	};
}

/**
 * Dynamic compiling, without a file watcher.
 *
 * The daemon watches the directory, because a graph there can change without
 * Roswaal doing it — a branch switch, a pull, another editor. Here there is no
 * directory and nothing else that can touch the volume, so the *only* way a
 * graph changes is a write through this worker. That makes the watcher
 * unnecessary rather than impossible: every event it would have reported passes
 * through the line below.
 *
 * Without this the editor would show Dynamic as on and nothing would
 * recompile: the setting there, saying it was working, and the generated Luau
 * silently no longer matching the graph.
 *
 * Compiled through the route table rather than by calling the compiler, so the
 * refusals a manual compile makes — a hand-edited file, a name collision — are
 * the same ones here.
 */
async function dynamicCompile(method: string, path: string, body: unknown): Promise<void> {
	if (method !== "PUT" || path !== "/script") return;
	if (session.current?.config.compileMode !== "hot") return;

	const relPath = (body as { path?: unknown } | undefined)?.path;
	if (typeof relPath !== "string" || relPath === "") return;

	try {
		const { results } = (await session.handle("POST", "/compile", {
			body: { path: relPath, write: true },
		})) as { results: unknown[] };
		post({
			kind: "event",
			event: "hot",
			data: { type: "compiled", path: relPath, outcome: results[0] },
		});
	} catch (err) {
		// Reported the way the watcher reports one, rather than failing the write
		// that triggered it: the graph is saved either way, and a compile that
		// will not run is news rather than a reason to lose the save.
		post({
			kind: "event",
			event: "hot",
			data: { type: "error", path: relPath, message: errorMessage(err) },
		});
	}
}

/** One route, answered as the daemon would answer it. */
async function request(message: ApiRequestMessage): Promise<void> {
	try {
		await ready;
		const payload = await session.handle(message.method, message.path, {
			query: message.query,
			body: message.body,
		});
		post({ kind: "response", id: message.id, status: 200, payload });
	} catch (err) {
		// The same mapping `app.ts` makes for Express, so a failure reads the same
		// whichever host answered it.
		post({ kind: "response", id: message.id, ...answer(err) });
		return;
	}
	// After the reply, so the save is confirmed before the compile it causes
	// starts reporting on itself.
	await dynamicCompile(message.method, message.path, message.body);
	// Anything that is not a read may have changed the volume, and the
	// compile above writes too. Debounced, so a burst costs one write.
	if (message.method !== "GET" && usingVolume()) store.touch(snapshot);
}

/**
 * A folder the developer picked, taking the place of the volume.
 *
 * From here on the project layer reads and writes their disk, so the
 * generated Luau lands where Rojo is already watching. The stored copy is
 * left alone rather than deleted — it is the playground project, and coming
 * back to it is a reload away.
 *
 * A folder is not a project just because somebody picked it. Any folder opens
 * -- with the default settings -- so one with no `roswaal.json` is reported
 * rather than adopted, and the next compile does not write `src/*.luau` into
 * somebody's holiday photos. The editor asks and comes back with
 * `initialise`, so setting up their folder is always a yes they gave.
 */
async function mountFolder(message: MountMessage): Promise<Reply> {
	await ready;
	const mount = mountFor(message.handle);
	try {
		useFilesystem(new DirectoryFs(message.handle, mount));
		// A new project, named after the folder: refused there unless it is empty.
		if (message.create) {
			await createProject(mount, { name: message.handle.name, ...message.create });
			await store.flush();
			return opened(await session.openAt(mount));
		}
		const initialised = await isInitialised(mount);
		if (!initialised && !message.initialise) {
			useFilesystem(volume);
			return notAProject(message.handle.name);
		}
		// The same `roswaal init` the command line runs, over the folder they
		// just handed over: `roswaal.json`, the graphs directory and the node
		// path, and nothing else.
		if (!initialised) await initProject(mount);
		// Stops the playground's project being overwritten by the one that
		// replaced it: the disk is its own persistence now.
		await store.flush();
		return opened(await session.openAt(mount));
	} catch (err) {
		// Back to the volume, so a folder that will not open leaves the editor
		// with the project it had rather than with nothing.
		useFilesystem(volume);
		// Reopening what was open already: if even that fails, the error
		// worth reporting is still the one above.
		await session.openAt(playgroundRoot).catch(() => undefined);
		return answer(err);
	}
}

/**
 * Puts a new project where the browser's own was, at `/<name>`, or puts the
 * old one back if anything in `write` fails.
 *
 * Replaced rather than added beside: the browser holds one project, the way
 * the daemon serves one. Mounted at its own name, so the editor, the window
 * title and the next Download all call it what its owner does.
 */
async function replaceProject(
	name: string,
	write: (root: string) => Promise<void>,
): Promise<OpenProject> {
	const before = snapshot();
	const next = `/${name}`;
	try {
		// From a folder on disk, if one was open: the new project replaces the
		// browser's, and that is what the editor shows next.
		useFilesystem(volume);
		await volume.rm(playgroundRoot, { recursive: true, force: true });
		await volume.rm(next, { recursive: true, force: true });
		await write(next);
		playgroundRoot = next;
		const project = await session.openAt(next);
		store.touch(snapshot);
		await store.flush();
		return project;
	} catch (err) {
		// Back to what the browser held, so a project that would not open costs
		// nothing. Each step is best done; the error to report is `err`.
		await volume.rm(next, { recursive: true, force: true }).catch(() => undefined);
		volume.mount(before.files);
		volume.mountDirs(before.dirs);
		playgroundRoot = before.root;
		await session.openAt(playgroundRoot).catch(() => undefined);
		throw err;
	}
}

/** A project from a zip, in place of the one the browser was holding. */
async function importZip(message: ImportMessage): Promise<Reply> {
	await ready;
	const hasConfig = "roswaal.json" in message.files;
	if (!hasConfig && !message.initialise) return notAProject(message.name);
	try {
		return opened(
			await replaceProject(message.name, async (root) => {
				volume.mount(
					Object.fromEntries(
						Object.entries({ ...message.files, ...message.binaries }).map(([rel, contents]) => [
							`${root}/${rel}`,
							contents,
						]),
					),
				);
				volume.mountDirs([root, ...message.dirs.map((dir) => `${root}/${dir}`)]);
				if (!hasConfig) await initProject(root);
			}),
		);
	} catch (err) {
		return answer(err);
	}
}

/**
 * A project made from a place, in place of the one the browser holds.
 *
 * The same replacement as a zip, and the same way back if it fails. The
 * place goes in first, as bytes; `writePlaceImport` writes the rest.
 */
async function importPlace(message: ImportPlaceMessage): Promise<Reply> {
	await ready;
	try {
		const project = await replaceProject(message.name, async (root) => {
			await volume.mkdir(root, { recursive: true });
			await volume.writeFile(`${root}/${message.placeFile}`, message.place);
			const map = await writePlaceImport(root, message.files, message.placeFile);
			if (!map.written) throw new Error(map.skipped ?? "Its Rojo project could not be written.");
		});
		return { status: 200, payload: { root: project.root } };
	} catch (err) {
		return answer(err);
	}
}

/** A project from nothing, in place of the one the browser holds. */
async function newProject(message: NewProjectMessage): Promise<Reply> {
	await ready;
	try {
		const project = await replaceProject(message.name, async (root) => {
			await createProject(root, {
				name: message.name,
				target: message.target,
				place: message.place,
			});
		});
		return { status: 200, payload: { root: project.root } };
	} catch (err) {
		return answer(err);
	}
}

/** One message, handled. Requests answer themselves; the rest answer here. */
async function receive(message: ToWorker): Promise<void> {
	switch (message.kind) {
		case "request":
			return request(message);
		case "mount":
			return post({ kind: "response", id: message.id, ...(await mountFolder(message)) });
		case "import":
			return post({ kind: "response", id: message.id, ...(await importZip(message)) });
		case "importPlace":
			return post({ kind: "response", id: message.id, ...(await importPlace(message)) });
		case "newProject":
			return post({ kind: "response", id: message.id, ...(await newProject(message)) });
		case "flush":
			return store.flush();
	}
}

/**
 * Messages are handled one at a time, in the order they came.
 *
 * Handled as they arrived, a request could be half-way through the project
 * when a mount swapped the filesystem under it, or a zip replaced the project
 * it was reading -- and answer from a mixture of the two.
 */
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToWorker>) => {
	const message = event.data;
	if (!message || typeof message !== "object") return;
	// The tab is going away, or has at least stopped being looked at.
	//
	// Not queued: it may be the last thing the tab gets to do, and waiting
	// behind a long compile would lose the change made in the last four hundred
	// milliseconds -- the one somebody is most likely to notice. Writing what has
	// settled so far is safe beside a request, which only ever adds to it.
	if (message.kind === "flush") {
		void store.flush();
		return;
	}
	// Every handler answers its own errors; this catch is for a bug in one,
	// which must not stop the queue for every message after it.
	queue = queue
		.then(() => receive(message))
		.catch((err: unknown) => {
			console.error("Roswaal worker:", err);
		});
};
