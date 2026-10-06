/**
 * Downloads from other people's servers -- the Wally registry and GitHub --
 * read to a limit.
 *
 * A response is read into memory whole before anything is done with it, so
 * each has a size past which it is not read at all: refused at once when its
 * `Content-Length` says so, and otherwise counted as it arrives and dropped
 * the moment it passes, since a length is not always given and is not always
 * true.
 */

import { LARGEST_ARCHIVE } from "../core/unzip.js";
import { HttpError } from "./errors.js";

/**
 * The most an archive -- a package's, or a repository's -- may be. A zip is
 * not larger than what it unpacks to, give or take its index, and `unzip`
 * refuses an archive that unpacks to more than this, so nothing larger could
 * be installed anyway.
 */
export const LARGEST_DOWNLOAD = LARGEST_ARCHIVE;

/**
 * The most a registry answer that is not an archive may be: a package's list
 * of versions, which is a few KiB even for a package with hundreds of them.
 */
export const LARGEST_METADATA = 4 * 1024 * 1024;

/**
 * `response`'s body, refused with a 502 once it is past `limit` bytes. `what`
 * names it for the message, and `advice` says what to do instead.
 */
export async function readLimited(
	response: Response,
	limit: number,
	what: string,
	advice = "",
): Promise<Uint8Array> {
	const tooLarge = () =>
		new HttpError(
			502,
			`${what} is larger than ${limit / 1024 / 1024} MiB, more than Roswaal will download.${advice ? ` ${advice}` : ""}`,
		);
	const stated = Number(response.headers.get("content-length") ?? 0);
	if (stated > limit) {
		await response.body?.cancel().catch(() => undefined);
		throw tooLarge();
	}
	if (!response.body) return new Uint8Array(0);

	const reader = response.body.getReader();
	const parts: Uint8Array[] = [];
	let length = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.length;
		if (length > limit) {
			await reader.cancel().catch(() => undefined);
			throw tooLarge();
		}
		parts.push(value);
	}
	const out = new Uint8Array(length);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/**
 * GitHub's archive of a repository: `ref` is a branch, tag or commit, and none
 * is the default branch. A web page cannot make this download -- the API
 * redirects to codeload, and codeload refuses other sites' pages -- so it is
 * the daemon's alone.
 */
export async function githubZipball(owner: string, repo: string, ref: string): Promise<Uint8Array> {
	const at = ref ? `/${encodeURIComponent(ref)}` : "";
	const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/zipball${at}`, {
		headers: { "User-Agent": "Roswaal", Accept: "application/vnd.github+json" },
	});
	const named = `${owner}/${repo}${ref ? `@${ref}` : ""}`;
	if (!response.ok) throw new HttpError(502, `GitHub answered ${response.status} for ${named}.`);
	return readLimited(
		response,
		LARGEST_DOWNLOAD,
		`The archive of ${named}`,
		"Download the folder that is wanted from it and insert that as a zip.",
	);
}
