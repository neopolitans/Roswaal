/**
 * Tables looked up by a name that came from outside: a pack's category or pin
 * type, a graph's node id, a word in a Luau file, a project's file name.
 *
 * An object written `{ ... }` inherits `constructor`, `toString`, `__proto__`
 * and the rest from `Object.prototype`. Looked up by one of those, it finds a
 * function or an object where a colour, a list or a label was expected, and
 * whatever reads it next fails. A pack only has to name a category
 * `constructor` for every picture of its node to throw.
 */

/** `entries` with no prototype, so a name it does not have finds nothing. */
export function ownTable<T>(entries: Readonly<Record<string, T>>): Record<string, T> {
	return Object.assign(Object.create(null) as Record<string, T>, entries);
}

/**
 * `table[name]` when `table` has it as its own, for a table that is not made
 * with `ownTable`: one that is generated, or kept as JSON.
 */
export function own<T>(table: Readonly<Record<string, T>>, name: string): T | undefined {
	return Object.hasOwn(table, name) ? table[name] : undefined;
}
