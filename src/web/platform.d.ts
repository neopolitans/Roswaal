/**
 * Browser APIs TypeScript's DOM library does not describe yet.
 *
 * `showDirectoryPicker` is the File System Access API's entry point and is the
 * reason the hosted editor can touch a real project at all. It ships in Chrome
 * and Edge; `canOpenDirectory()` in `directoryFs.ts` is what decides whether to
 * offer it, and this only makes the call typed where it is made.
 *
 * Declared as narrowly as it is used. A fuller shim would be a second, worse
 * copy of a specification that the DOM library will carry properly soon enough.
 */

interface Window {
	showDirectoryPicker(options?: {
		/** "readwrite" is what asks for permission to write, which Roswaal needs. */
		mode?: "read" | "readwrite";
		/** Which folder the picker opens in, when the browser remembers one. */
		id?: string;
		startIn?: FileSystemHandle | string;
	}): Promise<FileSystemDirectoryHandle>;
}
