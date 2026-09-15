/**
 * A zip file, written by hand, without compression.
 *
 * So that a project built in a browser tab can leave it. Everything the hosted
 * editor holds lives in memory and goes when the tab does; this is the way out
 * until the volume is backed by something that survives a reload.
 *
 * **Stored, not deflated.** A compressor is the part of zip worth taking a
 * dependency for, and it is the part not worth having here: a Roswaal project
 * is a few dozen kilobytes of JSON and Luau, and a download that is three times
 * smaller and arrives in the same instant has bought nothing. What is left is
 * two headers, a directory and a CRC — small enough to read, and it keeps a
 * tool that compiles other people's code free of a dependency in the path
 * between somebody's work and getting it back.
 *
 * Every entry is stored with the UTF-8 name flag set, so a graph called
 * `Café.nodescript` unpacks under that name rather than mojibake.
 */

/** The standard CRC-32 table, built once. */
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what a zip entry carries. */
function dosStamp(when: Date): { time: number; date: number } {
	return {
		time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
		// Years count from 1980, and a file older than that is not our problem.
		date: ((Math.max(when.getFullYear(), 1980) - 1980) << 9)
			| ((when.getMonth() + 1) << 5) | when.getDate(),
	};
}

interface Entry {
	name: Uint8Array;
	body: Uint8Array;
	crc: number;
	offset: number;
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** Bit 11: the name is UTF-8 rather than the ancient code page. */
const UTF8_NAME = 0x0800;

/**
 * A zip of these files, as a Blob.
 *
 * Paths are used exactly as given, so the caller decides whether the archive
 * has a folder at its root. It should: unpacking a project directly into
 * somebody's Downloads folder is rude.
 */
export function zip(files: Record<string, string>, when = new Date()): Blob {
	const encoder = new TextEncoder();
	const { time, date } = dosStamp(when);

	const names = Object.keys(files).sort();
	const entries: Entry[] = [];
	const parts: Uint8Array[] = [];
	let offset = 0;

	for (const path of names) {
		const name = encoder.encode(path);
		const body = encoder.encode(files[path]);
		const crc = crc32(body);

		const header = new Uint8Array(LOCAL_HEADER + name.length);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x04034b50, true);
		view.setUint16(4, 20, true);          // version needed
		view.setUint16(6, UTF8_NAME, true);
		view.setUint16(8, 0, true);           // stored
		view.setUint16(10, time, true);
		view.setUint16(12, date, true);
		view.setUint32(14, crc, true);
		view.setUint32(18, body.length, true); // compressed == uncompressed
		view.setUint32(22, body.length, true);
		view.setUint16(26, name.length, true);
		view.setUint16(28, 0, true);          // no extra field
		header.set(name, LOCAL_HEADER);

		entries.push({ name, body, crc, offset });
		parts.push(header, body);
		offset += header.length + body.length;
	}

	const directoryStart = offset;

	for (const entry of entries) {
		const record = new Uint8Array(CENTRAL_HEADER + entry.name.length);
		const view = new DataView(record.buffer);
		view.setUint32(0, 0x02014b50, true);
		view.setUint16(4, 20, true);           // version made by
		view.setUint16(6, 20, true);           // version needed
		view.setUint16(8, UTF8_NAME, true);
		view.setUint16(10, 0, true);           // stored
		view.setUint16(12, time, true);
		view.setUint16(14, date, true);
		view.setUint32(16, entry.crc, true);
		view.setUint32(20, entry.body.length, true);
		view.setUint32(24, entry.body.length, true);
		view.setUint16(28, entry.name.length, true);
		view.setUint16(30, 0, true);           // extra
		view.setUint16(32, 0, true);           // comment
		view.setUint16(34, 0, true);           // disk
		view.setUint16(36, 0, true);           // internal attributes
		view.setUint32(38, 0, true);           // external attributes
		view.setUint32(42, entry.offset, true);
		record.set(entry.name, CENTRAL_HEADER);

		parts.push(record);
		offset += record.length;
	}

	const end = new Uint8Array(END_RECORD);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(4, 0, true);                       // this disk
	endView.setUint16(6, 0, true);                       // disk the directory starts on
	endView.setUint16(8, entries.length, true);
	endView.setUint16(10, entries.length, true);
	endView.setUint32(12, offset - directoryStart, true);
	endView.setUint32(16, directoryStart, true);
	endView.setUint16(20, 0, true);                      // no comment
	parts.push(end);

	return new Blob(parts as BlobPart[], { type: "application/zip" });
}

/**
 * Hands a blob to the browser as a download.
 *
 * The object URL is revoked on the next turn of the event loop rather than
 * immediately: the click has to have been processed first, and revoking in the
 * same tick cancels the download in some browsers.
 */
export function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
