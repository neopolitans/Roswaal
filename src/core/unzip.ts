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

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** Larger than any project file; an entry past it is left in the archive. */
export const LARGEST_ENTRY = 8 * 1024 * 1024;

class ZipError extends Error {}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
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
		throw new ZipError("This zip is in the ZIP64 format, which is for archives far larger than a project.");
	}

	const out: Unzipped = { files: [], dirs: [], skipped: [] };
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

		if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL_HEADER) {
			throw new ZipError(`This zip is damaged at ${path}.`);
		}
		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		const body = bytes.subarray(start, start + compressed);
		out.files.push({ path, bytes: method === 0 ? body.slice() : await inflate(body) });
	}
	return out;
}
