/**
 * The starter node pack `roswaal init` writes.
 *
 * Luau rather than JSON because that is what a Roblox developer already
 * writes, and because it can carry comments explaining itself. Roswaal parses
 * this file; it never runs it.
 */

export const EXAMPLE_PACK = `--!strict
--[[
	A Roswaal node pack.

	This file is PARSED, never executed, so only literal values are allowed:
	strings, numbers, booleans, nil and tables. A function call here is a parse
	error with a line number, which is what makes it safe to bring a pack in
	from anywhere.

	Placeholders inside a template:
		$in.<pin>        the wired input, or the value typed into the pin
		$out.<pin>       the local this output was bound to
		$in.<pin>!ident  the pin's literal, sanitised into an identifier
		$in.<pin>!raw    the pin's literal, inserted verbatim

	Template kinds:
		expr       pure, no exec pins, one expression per output pin
		call       impure, one value: emits \`local x = <template>\`
		statement  impure, any outputs: emits the template as statements
]]

return {
	nodes = {
		{
			id = "example.logWithPrefix",
			title = "Log With Prefix",
			category = "Custom",
			summary = "print(), with a fixed prefix in front.",
			inputs = {
				{ id = "in", kind = "exec" },
				{ id = "prefix", name = "Prefix", kind = "data", type = "string", default = "[game]" },
				{ id = "message", name = "Message", kind = "data", type = "string", default = "hello" },
			},
			outputs = {
				{ id = "then", kind = "exec" },
			},
			compilesTo = {
				kind = "statement",
				template = "print($in.prefix, $in.message)",
			},
		},

		{
			id = "example.doubled",
			title = "Doubled",
			category = "Custom",
			summary = "Twice the number given. A pure node: no execution pins.",
			inputs = {
				{ id = "value", name = "Value", kind = "data", type = "number", default = 1 },
			},
			outputs = {
				{ id = "result", name = "", kind = "data", type = "number" },
			},
			compilesTo = {
				kind = "expr",
				outputs = {
					result = "$in.value * 2",
				},
			},
		},
	},
}
`;
