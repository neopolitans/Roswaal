/**
 * Reading a zip: the other half of `zip.ts`.
 *
 * `zip.ts` only ever writes what Roswaal made, so it stores. A zip coming in
 * was made by Finder, Explorer, a phone's Files app or `zip -r`, and those
 * compress -- so this reads both, stored and deflated, which between them are
 * every archive those tools make.
 *
 * Deflate is the browser's own, through `DecompressionStream`: no library, and
 * the same call on iPadOS as on a computer. What this does not read is said
 * rather than guessed at: an encrypted entry, a ZIP64 archive, or a method
 * other than those two is refused with a reason.
 *
 * The central directory is the index, not the local headers: a streaming
 * writer puts the sizes after the data, so only the directory at the end knows
 * how long each entry is.
 */

/** One file out of an archive: its path as the archive names it, and its bytes. */
export interface ZipEntry {
	path: string;
	bytes: Uint8Array;
}

/** An entry that was not read, and why. */
export interface ZipSkip {
	path: string;
	reason: string;
}

export interface Unzipped {
	files: ZipEntry[];
	/** Directories the archive lists, including empty ones. */
	dirs: string[];
	skipped: ZipSkip[];
}

/**
 * Whether an entry's path stays inside wherever the archive is unpacked.
 *
 * A zip can name an entry `../../roswaal.json`, `/etc/x` or `C:/x`, and every
 * caller joins the path onto a folder of its own. Those entries are skipped
 * here, for all of them, rather than trusted to each.
 */
export function isSafeEntry(path: string): boolean {
	if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
	return !path.split("/").includes("..");
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** Larger than any project file; an entry past it is left in the archive. */
export const LARGEST_ENTRY = 8 * 1024 * 1024;

/**
 * The most one archive may unpack to, all its entries together.
 *
 * Sixteen of the largest entries. A project is text, a few MiB at most, and so
 * is a Wally package; even a whole GitHub repository's code is well under
 * this. Everything read is held at once, and the browser copies it again on
 * the way to the worker, so the limit is set by what an iPad's tab can hold
 * rather than by what a computer can.
 */
export const LARGEST_ARCHIVE = 16 * LARGEST_ENTRY;

/** What `unzip` throws for an archive it cannot read: not a zip, ZIP64, or damaged. */
export class ZipError extends Error {}

/**
 * A deflated entry, inflated into exactly the size the archive's index gives.
 *
 * Read a piece at a time and counted as it comes, so an entry that inflates to
 * more than it said stops at that size rather than after all of it has been
 * made, and one that inflates to less is not taken as whole either.
 */
async function inflate(bytes: Uint8Array, size: number, path: string): Promise<Uint8Array> {
	const damaged = (why: string) =>
		new ZipError(`This zip is damaged at ${path}: ${why}. Make the zip again and use that one.`);
	const reader = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream("deflate-raw"))
		.getReader();
	const out = new Uint8Array(size);
	let length = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (length + value.length > size) throw damaged("it unpacks to more than its index says");
			out.set(value, length);
			length += value.length;
		}
	} catch (err) {
		if (err instanceof ZipError) throw err;
		throw damaged("its compressed data cannot be read");
	} finally {
		// Stops the rest being inflated when it was given up on part way.
		reader.cancel().catch(() => undefined);
	}
	if (length !== size) throw damaged("it unpacks to less than its index says");
	return out;
}

/**
 * The entries in an archive.
 *
 * `keep` is asked about each file before it is decompressed, so a folder the
 * caller does not want -- `.git`, `node_modules` -- costs nothing to skip.
 */
export async function unzip(
	data: ArrayBuffer | Uint8Array,
	keep: (path: string) => boolean = () => true,
): Promise<Unzipped> {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const names = new TextDecoder();

	// The end record is the last thing in the file, before a comment of up to
	// 64 KiB. Searched for backwards, so a comment that happens to contain the
	// signature is not mistaken for it.
	let end = -1;
	for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
		if (view.getUint32(at, true) === END_OF_DIRECTORY) {
			end = at;
			break;
		}
	}
	if (end < 0) throw new ZipError("This is not a zip file.");

	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	if (count === 0xffff || at === 0xffffffff) {
		throw new ZipError(
			"This zip is in the ZIP64 format, which is for archives far larger than a project.",
		);
	}

	const out: Unzipped = { files: [], dirs: [], skipped: [] };
	// Each local header belongs to one entry: two directory entries pointing at
	// the same one would read the same data twice over.
	const locals = new Set<number>();
	const wanted: { path: string; method: number; size: number; body: Uint8Array }[] = [];
	let total = 0;
	for (let i = 0; i < count; i++) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== DIRECTORY_ENTRY) {
			throw new ZipError("This zip's index is damaged.");
		}
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const compressed = view.getUint32(at + 20, true);
		const size = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const local = view.getUint32(at + 42, true);
		// Windows tools have been known to write backslashes.
		const path = names.decode(bytes.subarray(at + 46, at + 46 + nameLength)).replace(/\\/g, "/");
		at += 46 + nameLength + extraLength + commentLength;

		if (path.endsWith("/")) {
			out.dirs.push(path.slice(0, -1));
			continue;
		}
		if (!isSafeEntry(path)) {
			out.skipped.push({ path, reason: "outside the archive" });
			continue;
		}
		if (!keep(path)) continue;
		if (flags & 1) {
			out.skipped.push({ path, reason: "encrypted" });
			continue;
		}
		if (size > LARGEST_ENTRY) {
			out.skipped.push({ path, reason: "too large" });
			continue;
		}
		if (method !== 0 && method !== 8) {
			out.skipped.push({ path, reason: "compressed in a way this cannot read" });
			continue;
		}

		if (
			local + 30 > bytes.length ||
			view.getUint32(local, true) !== LOCAL_HEADER ||
			locals.has(local)
		) {
			throw new ZipError(`This zip is damaged at ${path}.`);
		}
		locals.add(local);
		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		if (start + compressed > bytes.length || (method === 0 && compressed !== size)) {
			throw new ZipError(`This zip is damaged at ${path}.`);
		}
		total += size;
		wanted.push({ path, method, size, body: bytes.subarray(start, start + compressed) });
	}

	// Counted before anything is unpacked: every entry is held at once, and
	// `inflate` makes no more than the size counted here.
	if (total > LARGEST_ARCHIVE) {
		throw new ZipError(
			`This zip unpacks to more than ${LARGEST_ARCHIVE / 1024 / 1024} MiB, far more than a project or a package. Zip only the folder that is wanted.`,
		);
	}
	for (const { path, method, size, body } of wanted) {
		out.files.push({ path, bytes: method === 0 ? body.slice() : await inflate(body, size, path) });
	}
	return out;
}
