/**
 * Whether a built editor is the version being released.
 *
 * `build-binary.mjs` embeds `dist/` as it finds it. A `dist/` left from an
 * earlier build would ship last release's editor inside this release's
 * binary, under this release's name, and nothing about the binary would say
 * so. The bundle carries the version it was built at — `version.json` is
 * imported into it, and so are the release notes, newest first — so the
 * question can be asked of the bytes.
 */

/**
 * True when some script in the bundle holds `version` as a string literal, in
 * any of the quotes a minifier writes. An older build cannot hold a version
 * that did not exist when it was made.
 *
 * @param {string[]} scripts The text of each `.js` file in `dist/`.
 * @param {string} version
 * @returns {boolean}
 */
export function bundleHasVersion(scripts, version) {
	const quoted = ['"', "'", "`"].map((q) => `${q}${version}${q}`);
	return scripts.some((text) => quoted.some((literal) => text.includes(literal)));
}
