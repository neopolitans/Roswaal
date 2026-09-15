/**
 * The modules the build makes up, which have no file for TypeScript to read.
 */

/** The demo project's files, keyed by path relative to its root. */
declare module "virtual:roswaal-seed" {
	const files: Record<string, string>;
	export default files;
}
