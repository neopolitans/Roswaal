/**
 * Roswaal's version numbers, read and compared.
 *
 * Semver, with one kind of prerelease: a canary build. `1.1.0` is a stable
 * release; `1.1.0-canary.3` is the third canary build on the way to it, and
 * sorts before it. Every surface that orders, groups or links versions goes
 * through here, so `1.1.0-canary.10` cannot be read as `1.1.0` by one of them
 * and as a later release by another.
 */

export interface Version {
	major: number;
	minor: number;
	patch: number;
	/** The canary build's number; absent on a stable release. */
	canary?: number;
}

const FORM = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-canary\.([1-9]\d*))?$/;

/** The version a string names, or undefined when it is not one of Roswaal's. */
export function parseVersion(text: string): Version | undefined {
	const m = FORM.exec(text);
	if (!m) return undefined;
	const version: Version = { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
	if (m[4] !== undefined) version.canary = Number(m[4]);
	return version;
}

function mustParse(text: string): Version {
	const version = parseVersion(text);
	if (!version) throw new Error(`"${text}" is not a version: expected 1.2.3 or 1.2.3-canary.4.`);
	return version;
}

/**
 * Negative when `a` came first, positive when `b` did, zero when they are the
 * same. A canary build comes before the release it leads to.
 */
export function compareVersions(a: string, b: string): number {
	const x = mustParse(a);
	const y = mustParse(b);
	return (
		x.major - y.major ||
		x.minor - y.minor ||
		x.patch - y.patch ||
		(x.canary ?? Number.POSITIVE_INFINITY) - (y.canary ?? Number.POSITIVE_INFINITY) ||
		0
	);
}

/** True when `a` is a later version than `b`. */
export function isNewer(a: string, b: string): boolean {
	return compareVersions(a, b) > 0;
}

/** `1.1` for 1.1.0, 1.1.2 and 1.1.0-canary.3: the minor version a release belongs to. */
export function minorOf(version: string): string {
	const { major, minor } = mustParse(version);
	return `${major}.${minor}`;
}

/** Whether a version is a canary build rather than a stable release. */
export function isCanary(version: string): boolean {
	return mustParse(version).canary !== undefined;
}

/** The stable release a version is, or leads to: `1.1.0` for 1.1.0-canary.3. */
export function releaseOf(version: string): string {
	const { major, minor, patch } = mustParse(version);
	return `${major}.${minor}.${patch}`;
}
