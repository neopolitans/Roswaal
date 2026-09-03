--!strict
--[[
	A Roswaal node pack, written in Luau.

	Roswaal PARSES this file; it never runs it. Only literal values are allowed
	— strings, numbers, booleans, nil and tables — so bringing a pack into a
	project can never execute somebody else's code. If you write a function
	call or a concatenation here, you get a parse error with a line number.

	Every node is pins plus a `compilesTo` template saying how it becomes Luau.
	Placeholders inside a template:

		$in.<pin>          the wired input, or the value typed into the pin
		$out.<pin>         the local this output was bound to
		$in.<pin>!ident    the pin's literal, sanitised into an identifier
		$in.<pin>!raw      the pin's literal, inserted verbatim

	Three template kinds:

		expr        pure, no exec pins, one expression per output pin
		call        impure, one value: emits `local x = <template>`
		statement   impure, any outputs: emits the template as statements
]]

return {
	nodes = {
		{
			id = "inventory.give",
			title = "Give Item",
			category = "Inventory",
			summary = "Adds an item to a player's backpack.",
			inputs = {
				{ id = "in", kind = "exec" },
				{ id = "player", name = "Player", kind = "data", type = "Instance" },
				-- A default can be written plainly; no need to tag its type.
				{ id = "item", name = "Item", kind = "data", type = "string", default = "Sword" },
				{ id = "count", name = "Count", kind = "data", type = "number", default = 1 },
			},
			outputs = {
				{ id = "then", kind = "exec" },
			},
			compilesTo = {
				kind = "statement",
				template = "Inventory.give($in.player, $in.item, $in.count)",
			},
		},

		{
			id = "inventory.count",
			title = "Item Count",
			category = "Inventory",
			summary = "How many of an item a player is carrying.",
			inputs = {
				{ id = "player", name = "Player", kind = "data", type = "Instance" },
				{ id = "item", name = "Item", kind = "data", type = "string", default = "Sword" },
			},
			outputs = {
				{ id = "count", name = "", kind = "data", type = "number" },
			},
			compilesTo = {
				kind = "expr",
				outputs = {
					count = "Inventory.countOf($in.player, $in.item)",
				},
			},
		},

		{
			id = "inventory.equipped",
			title = "Equipped Tool",
			category = "Inventory",
			summary = "The tool the player currently has out, or nil.",
			inputs = {
				{ id = "in", kind = "exec" },
				{ id = "character", name = "Character", kind = "data", type = "Instance" },
			},
			outputs = {
				{ id = "then", kind = "exec" },
				{ id = "tool", name = "Tool", kind = "data", type = "Instance" },
			},
			compilesTo = {
				kind = "call",
				result = "tool",
				template = "$in.character:FindFirstChildOfClass(\"Tool\")",
			},
		},
	},
}
