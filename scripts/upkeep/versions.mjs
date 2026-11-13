/**
 * Release versions compared as release watchers write them: `v1.2.3` and
 * `1.2.3` alike, a missing part as 0, and anything after the numbers (a
 * pre-release, build metadata) not counted.
 */

/** A version's numbers. */
function parts(version) {
	return String(version)
		.replace(/^v/i, "")
		.split(/[.+-]/)
		.map((p) => Number.parseInt(p, 10))
		.filter((n) => Number.isFinite(n));
}

/** Whether release `a` is later than release `b`. */
export function newer(a, b) {
	const x = parts(a);
	const y = parts(b);
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const d = (x[i] ?? 0) - (y[i] ?? 0);
		if (d !== 0) return d > 0;
	}
	return false;
}
