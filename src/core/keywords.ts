/**
 * Luau spelt in the search box.
 *
 * Somebody who has written Luau types `and`, `not`, `==`, `#`. The palette was
 * matching those against node *titles*, which works for And and fails for
 * everything else: `==` is the Equal node and the word "equal" appears in six
 * titles; `not` matched Not Equal before Not, because both start with the
 * letters and Not Equal happens to be declared first.
 *
 * So the keyword is answered directly. Each entry names the nodes that write
 * that piece of Luau, in the order somebody typing it means them — and the
 * palette ranks those above everything else, because a query that *is* Luau has
 * an exact answer and a list of near-misses is not it.
 *
 * Only what the language actually spells. This is not a synonym list: "loop"
 * and "check" and "compare" are words about code rather than code, and a
 * keyword table that starts taking those is a table nobody can predict.
 */

/** Node ids for a piece of Luau, best first. */
export const LUAU_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
	// Logic, which is where this started: the pills say what they write.
	"and": ["logic.and"],
	"or": ["logic.or"],
	"not": ["logic.not"],
	"==": ["compare.eq"],
	"~=": ["compare.neq"],
	"!=": ["compare.neq"],
	"<": ["compare.lt"],
	"<=": ["compare.lte"],
	">": ["compare.gt"],
	">=": ["compare.gte"],
	"nil": ["value.nil"],
	// Both nodes that ask a value what it is: the call, and the name it
	// answers with, which is what the call is nearly always compared against.
	"typeof": ["value.typeof", "value.typeName"],
	"true": ["value.boolean"],
	"false": ["value.boolean"],

	// Flow. `if` is Branch, and `elseif` and `else` are Branch too — the node
	// chains, so the answer to all three is the same node.
	"if": ["flow.branch"],
	"then": ["flow.branch"],
	"else": ["flow.branch"],
	"elseif": ["flow.branch"],
	"for": ["flow.forRange", "flow.forEach", "flow.forIndex"],
	"ipairs": ["flow.forIndex"],
	"pairs": ["flow.forEach"],
	"while": ["flow.while"],
	"repeat": ["flow.while"],
	"break": ["flow.break"],
	"continue": ["flow.continue"],
	"return": ["function.return"],
	"function": ["function.entry", "function.declareHere"],
	"local": ["local.declare"],

	// Indexing. Both nodes write it: one for a member a type declares, one for
	// a key named on the spot.
	".": ["value.member", "value.field"],

	// Operators that are not logic, where the symbol is the whole question.
	"..": ["string.concat"],
	"#": ["table.length"],
	"+": ["math.add"],
	"-": ["math.sub"],
	"*": ["math.mul"],
	"/": ["math.div"],
	// No floor-divide node: `//` is Divide with a Floor over it, and naming
	// Divide is a better answer than naming nothing.
	"//": ["math.div", "math.floor"],
	"%": ["math.mod"],
	"^": ["math.pow"],
	"::": ["cast.as", "cast.array", "cast.any"],

	// The two that are a call rather than syntax, and are typed as often.
	"require": ["module.requirePath"],
	"print": ["debug.print"],
};

/**
 * The nodes a query names outright, in the order they should be offered.
 *
 * Empty for anything that is not a keyword, which is nearly every query — the
 * caller falls through to its own ranking, unchanged.
 */
export function keywordNodes(query: string): readonly string[] {
	return LUAU_KEYWORDS[query.trim().toLowerCase()] ?? [];
}
