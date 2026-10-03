/** Reading a zip: moved to core, where the daemon can use it too. Named here so a reader sees what it offers. */
export {
	isSafeEntry,
	LARGEST_ENTRY,
	type Unzipped,
	unzip,
	type ZipEntry,
	ZipError,
	type ZipSkip,
} from "../core/unzip.js";
