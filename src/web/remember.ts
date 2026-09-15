/**
 * Remembering the folder somebody was working in.
 *
 * Without this, evaluating Roswaal against a real project means picking the
 * folder again on every reload — and evaluating it is the whole point of the
 * hosted editor. Somebody deciding whether this fits their game does it over
 * days, in the gaps, not in one sitting.
 *
 * A directory handle is storable in IndexedDB and comes back as the same
 * handle — which is the only reason this is possible at all; there is no path
 * to write down, and there is deliberately no way to turn a handle into one.
 *
 * **Permission does not come back with it.** A handle restored in a new session
 * is a handle the page cannot read until the developer says so again, and the
 * asking needs a click of theirs. That is the browser being careful on their
 * behalf and is not worth working around: the most this can do is notice that
 * permission is *still* granted, and otherwise offer a button that asks.
 *
 * IndexedDB rather than the origin private filesystem, which holds the
 * playground's own project: a handle is not a file and does not belong in a
 * filesystem. They are separate stores because they answer different questions
 * — "what was I working on" and "what is the playground holding".
 */

const DATABASE = "roswaal";
const STORE = "folders";
const KEY = "last";

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB refused to open."));
	});
}

/** One transaction, wrapped so a caller sees a promise rather than four events. */
async function transact<T>(
	mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const database = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = run(database.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error("The store refused."));
		});
	} finally {
		database.close();
	}
}

/**
 * The folder from last time, or `null`.
 *
 * Never throws: a private window, blocked site data, or a database from a
 * future version all mean the same thing here — there is no folder to offer,
 * and the editor opens the playground instead.
 */
export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
	try {
		const found = await transact<FileSystemDirectoryHandle | undefined>(
			"readonly", (store) => store.get(KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>,
		);
		// A stored value that is not a handle is from a shape this version does
		// not know. Treating it as nothing is the safe reading.
		return found && typeof found.queryPermission === "function" ? found : null;
	} catch {
		return null;
	}
}

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
	// Failing to remember is not a reason to fail to open. The developer is
	// already in their project; they will simply be asked again next time.
	await transact("readwrite", (store) => store.put(handle, KEY)).catch(() => {});
}

export async function forgetFolder(): Promise<void> {
	await transact("readwrite", (store) => store.delete(KEY)).catch(() => {});
}

/**
 * Whether the page may still read and write this folder without asking.
 *
 * `granted` means a previous session's permission survived and the folder can
 * be reopened with no interruption at all. `prompt` means it can be asked for,
 * but only from a click. `denied` means it cannot.
 */
export async function permissionFor(
	handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
	try {
		return await handle.queryPermission({ mode: "readwrite" });
	} catch {
		return "denied";
	}
}

/**
 * Asks for permission. **Must be called from a click**, or the browser refuses
 * on principle rather than showing anything.
 */
export async function askPermissionFor(
	handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
	try {
		return await handle.requestPermission({ mode: "readwrite" });
	} catch {
		return "denied";
	}
}
