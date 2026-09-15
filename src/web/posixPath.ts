/**
 * `node:path`, posix-only, for the volume the hosted editor runs on.
 *
 * Not a general-purpose polyfill and not trying to be one: it implements the
 * members `src/server/filesystem.ts` declares, to the behaviour `project.ts`
 * relies on, and it is checked against Node's own answers in
 * `tests/volume.test.ts` rather than against a reading of the documentation.
 *
 * Posix throughout, because a volume in a browser tab has no platform to
 * differ from. That makes `path.sep` a forward slash and `toPosix` in
 * `project.ts` the identity function — the platform/posix distinction that
 * file is careful about collapses on the web, correctly, rather than being
 * papered over.
 *
 * Absolute paths resolve against `/` where Node would use the process's
 * working directory. There is no such thing here, and the hosted editor mounts
 * its project at an absolute path anyway, so the case does not arise in
 * practice; answering `/` rather than throwing keeps a stray relative path a
 * path instead of an exception three layers down.
 */

import type { ProjectPath } from "../server/filesystem.js";

export const sep = "/";

/** Collapses `.` and `..`, the shared middle of `normalize` and `resolve`. */
function collapse(parts: string[], allowAboveRoot: boolean): string[] {
	const out: string[] = [];
	for (const part of parts) {
		if (part === "" || part === ".") continue;
		if (part !== "..") {
			out.push(part);
			continue;
		}
		if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
		else if (allowAboveRoot) out.push("..");
	}
	return out;
}

export function normalize(target: string): string {
	if (target === "") return ".";
	const absolute = target.startsWith("/");
	const trailing = target.length > 1 && target.endsWith("/");
	const parts = collapse(target.split("/"), !absolute);

	let joined = parts.join("/");
	if (joined === "") return absolute ? "/" : trailing ? "./" : ".";
	if (trailing) joined += "/";
	return absolute ? "/" + joined : joined;
}

export function join(...parts: string[]): string {
	const joined = parts.filter((part) => part !== "").join("/");
	return joined === "" ? "." : normalize(joined);
}

export function resolve(...parts: string[]): string {
	let resolved = "";
	let absolute = false;

	for (let i = parts.length - 1; i >= 0 && !absolute; i--) {
		const part = parts[i];
		if (part === "") continue;
		resolved = resolved === "" ? part : `${part}/${resolved}`;
		absolute = part.startsWith("/");
	}

	const collapsed = collapse(resolved.split("/"), false).join("/");
	return collapsed === "" ? "/" : "/" + collapsed;
}

export function relative(from: string, to: string): string {
	const a = resolve(from).split("/").filter((part) => part !== "");
	const b = resolve(to).split("/").filter((part) => part !== "");

	let shared = 0;
	while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;

	const up: string[] = [];
	for (let i = shared; i < a.length; i++) up.push("..");
	return [...up, ...b.slice(shared)].join("/");
}

export function dirname(target: string): string {
	if (target === "/") return "/";
	const trimmed = target.replace(/\/+$/, "");
	const at = trimmed.lastIndexOf("/");
	if (at === -1) return ".";
	if (at === 0) return "/";
	return trimmed.slice(0, at);
}

/**
 * The last segment, optionally without a suffix.
 *
 * The suffix rule is Node's, which is stranger than it looks and is copied
 * rather than tidied. Node compares the suffix against **the whole path**, not
 * against the last segment: `basename(".nodescript", ".nodescript")` is `""`,
 * while `basename("a/b/.nodescript", ".nodescript")` keeps the name whole. A
 * segment that is entirely the suffix otherwise strips to nothing, and
 * `graphNameFor` reads an empty answer as "this file name is punctuation all
 * the way down, keep the name the graph already has" — so being clever here
 * would rename somebody's graph on the web and not on their machine.
 */
export function basename(target: string, suffix?: string): string {
	if (target === "/") return "";
	const trimmed = target.replace(/\/+$/, "");
	const name = trimmed.slice(trimmed.lastIndexOf("/") + 1);

	if (suffix === undefined || suffix === "" || suffix.length > target.length) return name;
	if (suffix === target) return "";
	if (name === suffix) return name;
	return name.endsWith(suffix) ? name.slice(0, name.length - suffix.length) : name;
}

export function isAbsolute(target: string): boolean {
	return target.startsWith("/");
}

/**
 * `path.posix` points back at this module, which is the truthful answer here:
 * on a posix-only volume the platform rules and the posix rules are one set of
 * rules, so the two spellings `project.ts` uses cannot disagree.
 */
export const posixPath: ProjectPath = {
	sep,
	normalize,
	join,
	resolve,
	relative,
	dirname,
	basename,
	isAbsolute,
	get posix() {
		return posixPath;
	},
};
