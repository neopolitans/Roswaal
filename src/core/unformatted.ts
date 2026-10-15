/**
 * Files StyLua left as emitted, said once per reason.
 *
 * A StyLua that refuses one file has something to say about that file. One
 * that refuses every file -- a toolchain manager's shim that no project names
 * -- says the same thing about all of them, and a project of 200 graphs does
 * not need it 200 times. So the editor's panel, its notice and the terminal
 * all group by what StyLua said, and word it the same way.
 */

export interface Unformatted {
	reason: string;
	files: string[];
}

/**
 * Files StyLua refused that were written anyway, grouped by what it said, in
 * order. A file that was not written has its own, louder, reason.
 */
export function unformattedGroups(
	outcomes: readonly { outputPath: string; written: boolean; unformatted?: string }[],
): Unformatted[] {
	const groups = new Map<string, string[]>();
	for (const outcome of outcomes) {
		if (!outcome.written || !outcome.unformatted) continue;
		const files = groups.get(outcome.unformatted) ?? [];
		files.push(outcome.outputPath);
		groups.set(outcome.unformatted, files);
	}
	return [...groups].map(([reason, files]) => ({ reason, files }));
}

/** "Rig.luau", or "6 files". */
export function unformattedWhat(group: Unformatted): string {
	return group.files.length === 1
		? (group.files[0].split("/").pop() ?? group.files[0])
		: `${group.files.length} files`;
}

/** "StyLua did not format Rig.luau: …", or "… 6 files: …". */
export function unformattedMessage(group: Unformatted): string {
	return `StyLua did not format ${unformattedWhat(group)}: ${group.reason}`;
}
