/**
 * Joining class names.
 *
 * Every element whose classes depend on state builds its `className` here, so
 * a modifier is one argument -- `cx("node", selected && "node--selected")` --
 * rather than a hand-placed leading space inside a template literal, which is
 * the space that goes missing and glues two classes into one.
 *
 * A modifier is prefixed with its block (`node--selected`, never a bare
 * `selected`): a bare one inherits every rule written for that word anywhere
 * in the stylesheet. See STYLE.md §8.
 */

/** What a class argument may be: a name, or a falsy value that adds nothing. */
export type ClassArg = string | false | null | undefined | 0;

/** The truthy arguments, joined with single spaces. */
export function cx(...parts: ClassArg[]): string {
	let out = "";
	for (const part of parts) {
		if (!part) continue;
		out = out === "" ? part : `${out} ${part}`;
	}
	return out;
}
