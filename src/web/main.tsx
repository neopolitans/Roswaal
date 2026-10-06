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

import { useTransport } from "../app/api.js";
import { bootEditor } from "../app/boot.jsx";
import {
	type DirectoryPick,
	type PlacePreview,
	type RememberedFolder,
	setRememberedFolders,
	useDirectoryOpener,
	useFolderForgetter,
	usePlaceImporter,
	useZipImporter,
	type ZipPreview,
} from "../app/host.js";
import { IS_BACKUP } from "../app/pages.js";
import { unzip } from "../app/unzip.js";
import { readRbx } from "../core/rbx/index.js";
import { planImport, surveyPlace } from "../core/rbx/placeImport.js";

import { canOpenDirectory } from "./directoryFs.js";
import { keepEntry, projectFromZip, projectName } from "./importZip.js";
import {
	askPermissionFor,
	forgetFolder,
	permissionFor,
	rememberedFolders,
	rememberFolder,
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
/**
 * A project from a zip: read here, handed to the worker only once the editor
 * has said yes, so a zip that is picked and then declined replaces nothing.
 */
async function readProjectZip(file: File): Promise<ZipPreview> {
	const project = projectFromZip(file.name, await unzip(await file.arrayBuffer(), keepEntry));
	const count = Object.keys(project.files).length;
	if (count === 0) throw new Error("There is no project in this zip: it has no text files in it.");

	const send = (initialise?: boolean) =>
		transport.importProject(
			project.name,
			project.files,
			project.dirs,
			initialise,
			project.binaries,
		);
	return {
		name: project.name,
		files: count,
		open: async () => {
			const opened = await send();
			const pick: DirectoryPick =
				"root" in opened
					? opened
					: {
							notAProject: opened.notAProject,
							initialise: async () => {
								const made = await send(true);
								if (!("root" in made)) throw new Error("It could not be set up.");
								return made;
							},
						};
			return { pick, skipped: project.skipped };
		},
	};
}

/**
 * A project from a place: read and surveyed here, so the menu can show what is
 * in it, and handed to the worker only once the choices are made.
 */
async function readProjectPlace(file: File): Promise<PlacePreview> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const survey = surveyPlace(readRbx(bytes));
	const ext = /\.rbxlx$/i.test(file.name) ? ".rbxlx" : ".rbxl";
	const stem = file.name.replace(/\.[^.]*$/, "");
	return {
		file: file.name,
		name: projectName(stem),
		scripts: survey.scripts.length,
		rojo: survey.rojo,
		placeOnly: survey.placeOnly,
		placeOnlyDistinct: survey.placeOnlyDistinct,
		open: async (choice) => {
			const name = projectName(choice.name);
			const placeFile = `${projectName(stem)}${ext}`;
			const plan = planImport(survey, {
				scope: choice.scope,
				dedupe: choice.dedupe,
				outDir: "src",
				placeFile,
				name,
			});
			const { root } = await transport.importPlace(name, plan.files, placeFile, bytes);
			return { root, leftInPlace: plan.skipped.length };
		},
	};
}

async function start(): Promise<void> {
	useZipImporter(readProjectZip);
	usePlaceImporter(readProjectPlace);
	// The backup copy lives on neopolitans.github.io, and browser storage
	// belongs to the origin, not the path: every other Pages site on that
	// account could open the folders it remembered, and write to any still
	// allowed. So it opens no folders, and forgets the ones it kept; the
	// banner sends people to roswaal.app, which has an origin of its own.
	if (IS_BACKUP) await forgetFolder();
	if (IS_BACKUP || !canOpenDirectory()) {
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

	useFolderForgetter(() => forgetFolder());

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
	const stored = await rememberedFolders();
	if (stored.length === 0) {
		bootEditor();
		return;
	}

	/** Every folder still worth offering, with what it would take to open it. */
	const offer: RememberedFolder[] = [];
	/** The newest one whose permission outlived the session, if any. */
	let carryOn: FileSystemDirectoryHandle | null = null;

	for (const one of stored) {
		const permission = await permissionFor(one.handle);
		// Denied is not "ask again later": the developer said no to this folder,
		// and offering it every session would be asking them to say it again.
		if (permission === "denied") {
			await forgetFolder(one.id);
			continue;
		}
		if (permission === "granted" && carryOn === null) carryOn = one.handle;

		offer.push({
			id: one.id,
			name: one.name,
			granted: permission === "granted",
			open: async () => {
				if (
					(await permissionFor(one.handle)) !== "granted" &&
					(await askPermissionFor(one.handle)) !== "granted"
				) {
					return null;
				}
				return openFolder(one.handle);
			},
			forget: async () => {
				await forgetFolder(one.id);
				setRememberedFolders(offer.filter((other) => other.id !== one.id));
			},
		});
	}
	setRememberedFolders(offer);

	if (carryOn) {
		// A folder that has since been deleted or moved fails here rather than
		// leaving the editor half-open on something that is not there.
		const opened = await openFolder(carryOn).catch(() => null);
		if (!opened || !("root" in opened)) {
			const lost = stored.find((one) => one.handle === carryOn);
			if (lost) await forgetFolder(lost.id);
		}
	}

	bootEditor();
}

void start();
