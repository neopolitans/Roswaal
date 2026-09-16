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

/** A folder somebody has opened before, as it is stored. */
export interface StoredFolder {
	/** Stable, and what a card and a forget both refer to. */
	id: string;
	/** `handle.name` at the time it was stored: the leaf, never a path. */
	name: string;
	handle: FileSystemDirectoryHandle;
	/** When it was last opened, so the newest is offered first. */
	at: number;
}

/** Short, sortable enough, and unique for the handful this ever holds. */
const freshId = (): string =>
	`f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const isHandle = (value: unknown): value is FileSystemDirectoryHandle =>
	typeof (value as FileSystemDirectoryHandle | undefined)?.queryPermission === "function";

/**
 * What the store's raw contents mean, newest first.
 *
 * Apart from the reading of them because this is where the risk is, and none
 * of it is about IndexedDB: two shapes have to be understood at once. Before
 * this there was a single bare handle under a fixed key, and somebody
 * upgrading must not lose the folder they were working in to a change about
 * being able to keep more than one.
 *
 * Anything that is neither shape is from a version this one does not know.
 * Leaving it out is the safe reading — the alternative is offering a card that
 * cannot be opened.
 */
export function foldersFrom(keys: readonly IDBValidKey[], values: readonly unknown[]): StoredFolder[] {
	const out: StoredFolder[] = [];
	values.forEach((value, index) => {
		const key = String(keys[index] ?? index);
		// The old shape: a bare handle, stored as itself.
		if (isHandle(value)) {
			out.push({ id: key, name: value.name, handle: value, at: 0 });
			return;
		}
		// Guarded: one unreadable record must not take the rest with it. This
		// runs inside a `try` that answers "no folders at all", so a single
		// `null` left by a crashed write would have hidden every folder
		// somebody had.
		if (value === null || typeof value !== "object") return;
		const record = value as Partial<StoredFolder>;
		if (isHandle(record.handle)) {
			out.push({
				id: record.id ?? key,
				name: record.name ?? record.handle.name,
				handle: record.handle,
				at: typeof record.at === "number" ? record.at : 0,
			});
		}
	});
	// Newest first: the one to carry on in is the one left most recently.
	return out.sort((a, b) => b.at - a.at);
}

/**
 * Everything stored, newest first.
 *
 * Never throws: a private window, blocked site data, or a database from a
 * future version all mean the same thing here — there are no folders to offer,
 * and the editor opens the playground instead.
 *
 * Reads the old shape as well as the new one. Before this there was a single
 * handle under a fixed key, and somebody upgrading should not lose the folder
 * they were working in to a change about being able to keep more than one.
 */
export async function rememberedFolders(): Promise<StoredFolder[]> {
	try {
		const keys = await transact<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
		const values = await transact<unknown[]>("readonly", (store) => store.getAll());

		return foldersFrom(keys, values);
	} catch {
		return [];
	}
}

/** The newest, for the startup path that reopens what you were last in. */
export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
	return (await rememberedFolders())[0]?.handle ?? null;
}

/**
 * Stores a folder, or moves one already stored to the front.
 *
 * Matched with `isSameEntry` rather than by name: two folders called `src` are
 * two folders, and storing a second entry for one somebody reopened would fill
 * the list with the same project.
 */
export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
	try {
		const existing = await rememberedFolders();

		let id: string | null = null;
		for (const one of existing) {
			if (await one.handle.isSameEntry(handle).catch(() => false)) {
				id = one.id;
				break;
			}
		}
		// The first folder takes the key the single-folder version used, so an
		// upgrade finds what it stored where it left it.
		id ??= existing.length === 0 ? KEY : freshId();

		const record: StoredFolder = { id, name: handle.name, handle, at: Date.now() };
		await transact("readwrite", (store) => store.put(record, id));
	} catch {
		// Failing to remember is not a reason to fail to open. The developer is
		// already in their project; they will simply be asked again next time.
	}
}

/** Forgets one folder, or all of them when nothing is named. */
export async function forgetFolder(id?: string): Promise<void> {
	if (id === undefined) {
		await transact("readwrite", (store) => store.clear()).catch(() => {});
		return;
	}
	await transact("readwrite", (store) => store.delete(id)).catch(() => {});
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
