/**
 * Coming from Blueprints.
 *
 * The page this project exists to make possible. Roswaal is for onboarding
 * Unreal developers onto Roblox, and the fastest way to make somebody
 * productive in an unfamiliar tool is to tell them what the thing they already
 * know is called here — and, just as importantly, what is not here at all.
 *
 * Kept as data rather than prose for two reasons. The node ids are checked
 * against the registry by a test, so an entry cannot quietly start pointing at
 * a node that was renamed or removed. And the same table can be searched from
 * the editor: typing "Make Vector" into the node menu should eventually find
 * Vector3, because that is the name in the reader's head.
 *
 * The honesty rule for this file: **an entry with no Roswaal equivalent is more
 * useful than a missing entry.** A developer who is told up front that
 * Construction Scripts have no counterpart stays; one who spends forty minutes
 * looking for them does not.
 */

/** One Blueprint concept and what it corresponds to here. */
export interface Mapping {
	/** What Unreal calls it. */
	unreal: string;
	/** What Roswaal calls it, or null when there is no equivalent. */
	roswaal: string | null;
	/** Node ids this maps onto. Verified against the registry by a test. */
	nodes?: string[];
	/** The part a table cannot carry: why they differ, or why one is absent. */
	note?: string;
}

export interface MappingSection {
	title: string;
	blurb: string;
	entries: Mapping[];
}

export const BLUEPRINT_MAP: MappingSection[] = [
	{
		title: "The shape of a project",
		blurb:
			"The biggest adjustment is not the nodes. A Blueprint is an asset inside the engine; " +
			"a Roswaal graph is a file on disk that compiles to a Luau file next to it. Rojo syncs " +
			"that into Studio. Nothing about Roswaal runs inside the engine, and the generated code " +
			"is meant to be read.",
		entries: [
			{
				unreal: "Blueprint class",
				roswaal: "A .nodescript file",
				note:
					"One graph compiles to one Script, LocalScript or ModuleScript. There is no class " +
					"hierarchy: Roblox composes instances rather than subclassing them.",
			},
			{
				unreal: "Event Graph",
				roswaal: "The graph itself",
				note: "A nodescript has one canvas. Functions live on it too, as their own entry nodes.",
			},
			{
				unreal: "Construction Script",
				roswaal: null,
				note:
					"No equivalent, and not an oversight. Roblox has no edit-time construction pass — " +
					"instances are built by Rojo from files, or at runtime by your own code. Put what " +
					"you would have put in a Construction Script into a node map, or into Script Start.",
			},
			{
				unreal: "Blueprint Function Library",
				roswaal: "A node pack",
				note:
					"A .nodedef.json or .nodedef.luau file. Packs are data and are never executed, so " +
					"depending on someone else's pack cannot run their code at author time.",
			},
			{
				unreal: "Level Blueprint",
				roswaal: "A Script under ServerScriptService",
				note: "There is no per-place graph; a place is a DataModel, described by a node map.",
			},
			{
				unreal: "Content Browser",
				roswaal: "The project tree, and Beako",
				note:
					"The tree shows graphs and generated files side by side. Beako is the sibling tool " +
					"for browsing the rest of a Roblox project.",
			},
		],
	},
	{
		title: "Wiring",
		blurb:
			"This part transfers almost unchanged. White execution wires, coloured data wires, pure " +
			"nodes with no execution pins. The pin colours are deliberately close to Unreal's where " +
			"the types line up.",
		entries: [
			{
				unreal: "Exec pins",
				roswaal: "Execution pins",
				note: "Same idea, same white arrow, same rule that a node is either in the line or pure.",
			},
			{
				unreal: "Pure node (green)",
				roswaal: "Pure node (green left edge)",
				note:
					"Same meaning: no execution wire, evaluated where it is used. Roswaal inlines a pure " +
					"value with one consumer and binds it to a local with two, so it is evaluated once.",
			},
			{
				unreal: "Reroute node",
				roswaal: "Reroute",
				nodes: ["flow.reroute", "flow.rerouteExec"],
				note: "Double-click a wire. Compiles to nothing at all.",
			},
			{
				unreal: "Split Struct Pin",
				roswaal: "Split Struct Pin",
				note:
					"Right-click a Vector2, Vector3, CFrame, Color3, UDim or UDim2 pin. Same wording, " +
					"same behaviour. CFrame offers three decompositions rather than one.",
			},
			{
				unreal: "Make / Break (Vector, Rotator…)",
				roswaal: "Split Struct Pin, or a constructor node",
				nodes: ["roblox.vector3", "cframe.new", "roblox.color3"],
				note:
					"Splitting a pin replaces Make and Break for most uses. The constructor nodes are " +
					"there for when you want the value as its own node.",
			},
			{
				unreal: "Promote to Variable",
				roswaal: "Promote to Variable",
				note:
					"Right-click an unwired input. The variable takes the value already typed into the " +
					"pin, as it does in Unreal.",
			},
			{
				unreal: "Cast To <Class>",
				roswaal: "Is A, then Cast",
				nodes: ["instance.isA", "cast.as", "cast.array"],
				note:
					"Luau's `::` is a compile-time claim with no runtime branch, so there is no Cast " +
					"Failed pin to wire. **Is A** is the runtime half. See *Getting at the world* below " +
					"for the full picture.",
			},
			{
				unreal: "Add pin +",
				roswaal: "The + in a node's header",
				nodes: ["math.add", "flow.sequence", "call.function"],
				note: "Or drop a wire on the node body and it grows a pin to catch it.",
			},
		],
	},
	{
		title: "Flow control",
		blurb: "Near enough one-to-one, with the Luau names where they differ.",
		entries: [
			{ unreal: "Branch", roswaal: "Branch", nodes: ["flow.branch"] },
			{ unreal: "Sequence", roswaal: "Sequence", nodes: ["flow.sequence"] },
			{
				unreal: "For Loop",
				roswaal: "For Range",
				nodes: ["flow.forRange"],
				note: "Roblox's numeric `for`. First and Last are inclusive, as in Luau.",
			},
			{
				unreal: "For Each Loop",
				roswaal: "For Each",
				nodes: ["flow.forEach", "flow.forIndex"],
				note: "For Each walks values; For Index walks index and value, Luau's `ipairs`.",
			},
			{ unreal: "While Loop", roswaal: "While Loop", nodes: ["flow.while"] },
			{ unreal: "Break / Continue", roswaal: "Break / Continue", nodes: ["flow.break", "flow.continue"] },
			{
				unreal: "Return Node",
				roswaal: "Return",
				nodes: ["function.return"],
				note:
					"Luau requires a return to be the last statement in its block, so a Sequence output " +
					"that returns cannot be followed by another. Roswaal reports that rather than " +
					"emitting a file that will not parse.",
			},
			{
				unreal: "Delay",
				roswaal: "Wait",
				nodes: ["task.wait"],
				note: "Yields the thread. Marked latent, and never inlined.",
			},
			{
				unreal: "Gate / MultiGate / DoOnce / FlipFlop",
				roswaal: null,
				note:
					"No equivalents. Each is a small piece of state Unreal hides inside the node; here " +
					"you would hold it in a script variable and branch on it, which is what the " +
					"generated Luau would have said anyway.",
			},
			{
				unreal: "Timeline",
				roswaal: null,
				note: "No equivalent. Use TweenService, or drive a value from RunService per frame.",
			},
		],
	},
	{
		title: "Data and state",
		blurb:
			"Blueprints has one kind of variable. Roswaal has two, and the distinction is worth " +
			"learning early because it is the one thing that is genuinely different rather than " +
			"merely renamed. For the value types themselves — where FVector, FRotator and TArray " +
			"land — see **Types** at the end of this page.",
		entries: [
			{
				unreal: "Blueprint variable",
				roswaal: "Script variable",
				nodes: ["variable.get", "variable.set"],
				note:
					"Declared in the Variables panel, read and written anywhere in the graph. Compiles " +
					"to a file-level local. Drag one onto the canvas for a Get, Ctrl-drag for a Set.",
			},
			{
				unreal: "Local variable (function-scoped)",
				roswaal: "Declare Local",
				nodes: ["local.declare", "local.get", "local.set"],
				note:
					"Binds a value mid-flow and only exists inside the block that declared it. Wire its " +
					"output, or drag it from the Locals list for a Get Local. Reading one outside its " +
					"block is an error, not silently broken code.",
			},
			{
				unreal: "Struct",
				roswaal: "A table, or a Roblox type",
				note:
					"Luau has no struct declaration. Vector3, CFrame, Color3 and friends are the built-in " +
					"value types, and anything else is a table.",
			},
			{
				unreal: "Enum",
				roswaal: "Roblox Enums, as values",
				note: "There is no user-defined enum. A string with a dropdown is the usual stand-in.",
			},
			{
				unreal: "Array / Map / Set",
				roswaal: "Table",
				nodes: ["table.get", "table.getKey", "table.insert"],
				note:
					"One type for all three, as in Lua. There is no separate array node set, because " +
					"there is no separate array.",
			},
		],
	},
	{
		title: "Functions and events",
		blurb: "Same concepts; Roblox's event model is signals rather than delegates.",
		entries: [
			{
				unreal: "Function",
				roswaal: "Function",
				nodes: ["function.entry", "function.return"],
				note: "Its own entry node on the same canvas, with the signature in the node's subtitle.",
			},
			{
				unreal: "Call Function",
				roswaal: "Call Function",
				nodes: ["call.function", "call.method"],
				note: "Call Method is the colon form, for calling a method on an instance or module.",
			},
			{
				unreal: "Custom Event",
				roswaal: "A BindableEvent",
				nodes: ["bindable.fire", "bindable.event"],
				note:
					"An instance you create, fired with **Fire Bindable** and listened to through its " +
					"**Event** signal. In-process only — crossing between client and server is a " +
					"remote, and deliberately a different thing to write.",
			},
			{
				unreal: "Event Dispatcher / Bind Event",
				roswaal: "Connect Event, Connect Once",
				nodes: ["event.connect", "event.once", "roblox.getEvent"],
				note:
					"Get Event reads a signal off an instance; Connect Event runs a body when it fires " +
					"and hands the connection back. **Connect Once** unbinds itself after one fire.",
			},
			{
				unreal: "Unbind Event",
				roswaal: "Disconnect",
				nodes: ["connection.disconnect", "connection.isConnected"],
				note:
					"Roblox will not do this for you. A connection you never disconnect keeps its " +
					"handler — and everything the handler captured — alive for as long as the signal " +
					"is, which is the most common leak in a Roblox game.",
			},
			{
				unreal: "Replicated function / RPC",
				roswaal: "RemoteEvent and RemoteFunction",
				nodes: [
					"remote.fireServer", "remote.fireClient", "remote.fireAllClients",
					"remote.invokeServer", "remote.onServerInvoke",
				],
				note:
					"Unreal marks a function `Server` or `Client` and the engine routes it. Roblox makes " +
					"the channel an **instance** you create and reference from both sides. A RemoteEvent " +
					"is one-way and does not wait; a RemoteFunction waits for an answer and **raises the " +
					"other side's error on the caller**. There is an UnreliableRemoteEvent for data you " +
					"can afford to lose — same calls, weaker guarantees — and no unreliable equivalent " +
					"for RemoteFunction, because waiting for an answer needs the answer to arrive.",
			},
			{
				unreal: "BeginPlay",
				roswaal: "Script Start",
				nodes: ["script.begin"],
				note: "A Roblox script runs when it loads; there is no separate begin-play phase.",
			},
			{
				unreal: "Tick",
				roswaal: "RunService, connected",
				note:
					"No Tick node. Connect to RunService.Heartbeat or RenderStepped — being explicit " +
					"about which is the point, since they are not interchangeable.",
			},
			{
				unreal: "Interface",
				roswaal: null,
				note: "No equivalent. A ModuleScript exporting the expected functions is the idiom.",
			},
		],
	},
	{
		title: "Getting at the world",
		blurb:
			"Unreal reaches actors through references and Get All Actors Of Class. Roblox reaches " +
			"instances by path through the DataModel, which is closer to a filesystem.",
		entries: [
			{
				unreal: "Get Player Character / Controller",
				roswaal: "Local Player, Local Character",
				nodes: ["players.localPlayer", "players.localCharacter", "players.fromCharacter"],
				note:
					"Both reach the Players service themselves, so the common case needs no Get " +
					"Service wired in. **Client-only**: on the server they are nil, and Roswaal warns " +
					"if the graph is not a LocalScript. There is no controller — a Player and its " +
					"Character are separate instances, and Get Player From Character goes back.",
			},
			{
				unreal: "Actor Tags",
				roswaal: "Add Tag, Remove Tag, Has Tag, Get Tags",
				nodes: ["instance.addTag", "instance.removeTag", "instance.hasTag", "instance.getTags"],
				note:
					"The methods on Instance rather than the CollectionService calls they forward to, " +
					"so no service has to be hoisted. Roblox tags are strings and carry no data — the " +
					"data goes in attributes.",
			},
			{
				unreal: "Actor / Component variables set from the details panel",
				roswaal: "Attributes",
				nodes: ["instance.getAttribute", "instance.setAttribute"],
				note:
					"Per-instance values set in Studio and read at runtime, which is the closest thing " +
					"to an exposed Blueprint variable. Get Attribute returns nil when unset, and that " +
					"is how you test for one.",
			},
			{
				unreal: "Get Components By Class / Get All Child Actors",
				roswaal: "Get Children, Get Descendants, Find First Child Which Is A",
				nodes: [
					"instance.getChildren", "instance.getDescendants", "instance.findFirstChildWhichIsA",
					"roblox.findFirstChild",
				],
				note:
					"Which Is A matches derived classes; Of Class is exact. Find First Child with " +
					"Recursive set searches the whole subtree by name, which is slower than a path — " +
					"reach for Instance when you already know where it lives.",
			},
			{
				unreal: "Get Component / Get Child Actor",
				roswaal: "Instance path, Find First Child",
				nodes: ["roblox.instancePath", "roblox.findFirstChild", "roblox.waitForChild"],
				note:
					"Instance takes a dotted path and compiles to plain indexing. Wait For Child yields " +
					"until it exists, which has no Blueprint counterpart because Unreal has no " +
					"replication-order problem of that shape.",
			},
			{
				unreal: "Spawn Actor From Class",
				roswaal: "New Instance, then Set Parent",
				nodes: ["roblox.instanceNew", "roblox.setParent"],
				note: "Parenting is what makes an instance live. Nothing exists until it has a parent.",
			},
			{
				unreal: "Destroy Actor",
				roswaal: "Destroy",
				nodes: ["roblox.destroy"],
			},
			{
				unreal: "Get / Set property",
				roswaal: "Get Property, Set Property",
				nodes: ["roblox.getProperty", "roblox.setProperty"],
				note:
					"The property name is typed in and pasted into the generated source, so it cannot be " +
					"wired from a value. The pin says so.",
			},
			{
				unreal: "Cast To <Class>, to reach members",
				roswaal: "Is A to ask, Cast to assert",
				nodes: ["instance.isA", "cast.as"],
				note:
					"These are two halves of what Cast To does in one node, and keeping them apart is " +
					"the important part. **Is A** is the runtime question and gives you a boolean to " +
					"branch on — that is Cast To's execution pins. **Cast** is Luau's `::`, which tells " +
					"the typechecker what you know and emits nothing; there is no runtime check, so " +
					"being wrong is silent. Ask with Is A, then assert with Cast.",
			},
			{
				unreal: "Cast an array of actors to a subclass",
				roswaal: "Cast Array",
				nodes: ["cast.array"],
				note:
					"Get Descendants and friends are typed `{ Instance }` even when you know every " +
					"element is a BasePart. This is how you say so, and it is a step Unreal does not " +
					"make you take because its containers are already typed.",
			},
		],
	},
	{
		title: "Escape hatches",
		blurb:
			"Unreal's answer is to drop to C++. Roswaal's is to drop to Luau, in the same graph, " +
			"and there are exactly two nodes that do it.",
		entries: [
			{
				unreal: "C++ function exposed to Blueprint",
				roswaal: "A node pack",
				note: "Declarative templates, no compilation step, and nothing executes at author time.",
			},
			{
				unreal: "Inline C++ (there is none)",
				roswaal: "Custom Code, Luau Expression",
				nodes: ["code.custom", "value.expression"],
				note:
					"The only two places hand-written Luau can enter a graph. Every other pin that " +
					"defaults to something like Vector3.zero shows that constant and will not accept " +
					"typed code — so these two node titles are a complete list of where to look.",
			},
		],
	},
];

/** Every node id the mapping claims exists. Checked against the registry. */
export function referencedNodeIds(): string[] {
	const out = new Set<string>();
	for (const section of BLUEPRINT_MAP) {
		for (const entry of section.entries) {
			for (const id of entry.nodes ?? []) out.add(id);
		}
	}
	return [...out].sort();
}
