/**
 * The filesystem the project layer talks to, as an interface rather than an
 * import.
 *
 * `project.ts` used to reach for `node:fs/promises` directly, which is the
 * obvious thing to do for a daemon that owns a directory on disk. It also
 * pinned the whole of the project layer — opening, the tree, packs, the
 * hand-edit guard, compiling — to a machine with a disk on it. The hosted
 * editor has no disk and needs every one of those.
 *
 * So the project layer imports `./host.js`, and this is the shape `host.js`
 * has to supply. There are two bindings: `src/server/host.ts` binds it to Node,
 * and `src/web/host.ts` binds it to a volume held in memory. Nothing in
 * `project.ts` knows which one it got, which is the whole point — the rules
 * about what Roswaal owns and what it refuses to overwrite are the same rules
 * in both, because they are the same code.
 *
 * Deliberately the *subset* the project layer actually calls, spelled the way
 * `node:fs/promises` spells it, so the Node binding is the module itself rather
 * than a wrapper around it. A method missing here is one nothing calls, and
 * adding one means implementing it for the memory volume too — which is the
 * point again: reaching for a new filesystem primitive should be visible.
 */

import type { RoswaalConfig } from "../core/schema.js";

/** What `stat` answers. The two questions the project layer asks of a path. */
export interface FileStat {
	isDirectory(): boolean;
	isFile(): boolean;
}

/** One entry from `readdir(dir, { withFileTypes: true })`. */
export interface DirEntry {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
}

export interface ProjectFs {
	stat(target: string): Promise<FileStat>;
	readFile(target: string, encoding: "utf8"): Promise<string>;
	writeFile(target: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(target: string, options: { recursive: boolean }): Promise<string | undefined>;
	readdir(target: string): Promise<string[]>;
	readdir(target: string, options: { withFileTypes: true }): Promise<DirEntry[]>;
	rm(target: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
	access(target: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	copyFile(from: string, to: string): Promise<void>;
}

/**
 * The path arithmetic the project layer does.
 *
 * Both `sep`-flavoured and posix members, because `project.ts` uses both
 * deliberately: paths going to and from disk are the platform's, and paths
 * going into a graph, a node map or a reply to the editor are posix. The memory
 * volume is posix throughout, so on the web the two are the same set of rules
 * and `toPosix` becomes the identity — which is correct rather than lucky, a
 * volume in a browser tab having no platform to differ from.
 */
export interface PosixPath {
	join(...parts: string[]): string;
	dirname(target: string): string;
	basename(target: string, suffix?: string): string;
	normalize(target: string): string;
}

export interface ProjectPath extends PosixPath {
	readonly sep: string;
	resolve(...parts: string[]): string;
	relative(from: string, to: string): string;
	isAbsolute(target: string): boolean;
	readonly posix: PosixPath;
}

/**
 * Runs the project's formatter over generated code, or returns it unchanged.
 *
 * Returning the code is a real answer, not a failure: stylua is optional on
 * disk and impossible in a browser tab, and generated Luau that nobody
 * pretty-printed is still generated Luau that compiles.
 */
export type Formatter = (
	cwd: string,
	code: string,
	config?: Pick<RoswaalConfig, "indentStyle" | "indentWidth">,
) => string;
