/**
 * What changes between two texts, line by line, for showing a person.
 *
 * Shown before Roswaal overwrites a file it did not write, so the answer to
 * "what will this do to my file?" is on screen before the file is gone. A
 * longest-common-subsequence diff: exact, and small enough to read, for files
 * of the size scripts are. Past a size where the table would be too large to
 * hold, it gives up on matching and shows the whole file going and coming.
 */

export interface DiffLine {
	kind: "same" | "add" | "del";
	text: string;
}

/** A line of the shortened view: a change, its context, or a run left out. */
export type ShownLine = DiffLine | { kind: "gap"; count: number };

/** Lines per side above which the table would be too large to build. */
const MAX_CELLS = 16_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.replace(/\r\n?/g, "\n").split("\n");
	const b = after.replace(/\r\n?/g, "\n").split("\n");
	if (a.length * b.length > MAX_CELLS) {
		return [
			...a.map((text) => ({ kind: "del" as const, text })),
			...b.map((text) => ({ kind: "add" as const, text })),
		];
	}
	// lcs[i][j]: the longest common run of a[i..] and b[j..], in one flat array.
	const width = b.length + 1;
	const lcs = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i * width + j] =
				a[i] === b[j]
					? lcs[(i + 1) * width + j + 1] + 1
					: Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			out.push({ kind: "same", text: a[i] });
			i++;
			j++;
		} else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
			out.push({ kind: "del", text: a[i++] });
		} else {
			out.push({ kind: "add", text: b[j++] });
		}
	}
	while (i < a.length) out.push({ kind: "del", text: a[i++] });
	while (j < b.length) out.push({ kind: "add", text: b[j++] });
	return out;
}

/** The changes with `context` unchanged lines either side; longer runs fold to a count. */
export function shownLines(diff: readonly DiffLine[], context = 2): ShownLine[] {
	const near = diff.map((_, i) =>
		diff.slice(Math.max(0, i - context), i + context + 1).some((d) => d.kind !== "same"),
	);
	const out: ShownLine[] = [];
	let folded = 0;
	diff.forEach((line, i) => {
		if (line.kind !== "same" || near[i]) {
			if (folded > 0) out.push({ kind: "gap", count: folded });
			folded = 0;
			out.push(line);
		} else {
			folded++;
		}
	});
	if (folded > 0) out.push({ kind: "gap", count: folded });
	return out;
}
