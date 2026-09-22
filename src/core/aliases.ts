/**
 * Other names a node is looked for by.
 *
 * The keyword table (`keywords.ts`) answers a query that *is* Luau, and says
 * outright that it is not a synonym list. This is the synonym list. It holds
 * the words somebody types when they know what they want and not what Roswaal
 * calls it: "Define Function" for either function node, "Loop" for the loops,
 * "Sleep" for Wait.
 *
 * Where the names come from, in order of how often they are right:
 *
 * - **A name the node used to have.** Declare Type shipped as Define Type; the
 *   author went looking for "Declare Type" then, and somebody will go looking
 *   for "Define Type" now.
 * - **What the other node half is called.** Function is hoisted, Declare
 *   Function is not, and "Declare Function at Top" is what the hoisted one
 *   would be called if it were named the way Declare Type at Top is.
 * - **What another language or visual-scripting tool calls it.** Sleep for
 *   Wait, Log for Print, Throw for Error, Import for Require.
 *
 * An alias ranks below the node's own title and above everything the search
 * matches by accident — a category, an id, a word in a summary. So typing the
 * real name still finds that node first, and typing a synonym finds the node
 * rather than every node whose description happens to mention the word.
 *
 * Only the library node is found by its aliases. A preset built on Get
 * Variable — "Get health" — is a name you chose, and it would be noise for
 * every variable in the graph to answer to "Read Variable".
 */

/** Node id → other names for it, as a person would type them. */
export const NODE_ALIASES: Readonly<Record<string, readonly string[]>> = {
	"function.entry": ["Define Function", "Declare Function at Top", "Hoisted Function"],
	"function.declareHere": ["Define Function", "Local Function"],
	"function.get": ["Function Reference"],
	"function.getParam": ["Argument", "Get Argument"],
	"type.declareTop": ["Define Type at Top", "Export Type", "Type Alias"],
	"type.declareHere": ["Define Type", "Type Alias"],
	"module.exports": ["Return Module", "Export"],

	"script.begin": ["Begin Play", "On Start", "Entry"],
	"flow.branch": ["If Else", "Condition"],
	"flow.forRange": ["Numeric For", "Loop"],
	"flow.forEach": ["Loop Over Table", "Pairs Loop"],
	"flow.forIndex": ["Loop Over Array", "Ipairs Loop"],
	"flow.while": ["Loop While", "Repeat Until"],

	"local.declare": ["Define Local", "Local Variable", "New Local"],
	"variable.init": ["Declare Variable", "Define Variable"],
	"value.string": ["Text"],
	"value.boolean": ["Bool"],
	"value.expression": ["Inline Luau"],
	"code.custom": ["Luau Code", "Raw Luau", "Inline Code"],

	"string.concat": ["Join Strings", "Append String"],
	"convert.tostring": ["Stringify"],
	"table.new": ["Empty Table", "Make Table"],
	"table.dictionary": ["Make Table", "Map"],
	"table.length": ["Count"],
	"table.insert": ["Push", "Append"],

	"roblox.instanceNew": ["Create Instance", "Spawn Instance"],
	"roblox.destroy": ["Delete", "Remove Instance"],
	"module.requirePath": ["Import"],
	"module.requireTop": ["Import at Top"],
	"event.connect": ["Bind Event", "Listen", "On Event"],
	"event.wait": ["Await Event"],

	"task.wait": ["Sleep"],
	"task.spawn": ["Run Async", "New Thread"],
	"debug.print": ["Log"],
	"debug.error": ["Throw"],
};

/**
 * How well `query` matches one of `defId`'s aliases, or 0.
 *
 * The same prefix-beats-substring rule the title follows, one step below each:
 * an exact alias under an exact title, an alias prefix under a title prefix.
 * `query` is expected trimmed and lower-cased, as both searches pass it.
 */
export function aliasScore(defId: string, query: string): number {
	const aliases = NODE_ALIASES[defId];
	if (!aliases || query === "") return 0;
	let best = 0;
	for (const alias of aliases) {
		const name = alias.toLowerCase();
		if (name === query) return 450;
		if (name.startsWith(query)) best = Math.max(best, 90);
		else if (name.includes(query)) best = Math.max(best, 55);
	}
	return best;
}
