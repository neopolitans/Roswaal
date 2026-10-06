/**
 * Release notes for 0.0.0 to 0.9.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_0: Release[] = [
	{
		version: "0.9.1",
		date: "2026-09-06",
		headline: "Custom Code versus Luau Expression, answered properly.",
		added: [
			"A warning when a **Luau Expression** is given a statement. It is substituted where a value goes, so `local x = 1` in one emits `print(local x = 1)` — raw text, nothing to rewrite it.",
		],
		changed: [
			"**Hand-written Luau** is rewritten. The difference between the two nodes is *where the code lands* — Custom Code where a statement goes, Luau Expression where a value goes — and not how long it is. Everything else about them follows from that, and the page led with the wrong thing.",
			"A release entry now shows its version bold on the left and its date quietly on the right.",
			"Prose pages set their measure once, so the rules, notes and paragraphs share one right edge instead of three.",
		],
	},
	{
		version: "0.9.0",
		date: "2026-09-06",
		headline: "Signals you can let go of, and networking.",
		added: [
			"**Disconnect** and **Is Connected**. Connect was the only signal node, so a graph could take a connection out and had no way to put it back — the most common leak in a Roblox game had no node for its cure.",
			"**Connect Once**, which unbinds itself after one fire, and **Wait For Signal**, which yields until one arrives.",
			"**Networking**: Fire Server, Fire Client, Fire All Clients, On Server Event, On Client Event, Invoke Server, Invoke Client, and the two On-Invoke assignments.",
			"**BindableEvent** and **BindableFunction** — the in-process pair, for one script to signal another.",
		],
		changed: [
			"One set of remote nodes covers **RemoteEvent and UnreliableRemoteEvent** both: the methods are identical, and the difference is a decision made when you create the instance rather than a different call to write. There is no unreliable RemoteFunction, because waiting for an answer needs the answer to arrive.",
			"The *Coming from Blueprints* page gains rows for Custom Event, Unbind Event and RPCs — three places it previously had to say there was no equivalent, or said too little.",
		],
	},
	{
		version: "0.8.1",
		date: "2026-09-06",
		headline: "A type table for newcomers, and one fewer click in the nav.",
		added: [
			"**A table of engine types and their Luau counterparts**, now on the *Coming from Blueprints* page — `FVector` to `Vector3`, `TArray<T>` to a plain table, and the ones with no counterpart at all: no `FRotator`, no `FQuat`, no typed containers. It also flags the two conventions that catch people out: Roblox is **Y-up** and in studs, and a `CFrame` carries **no scale**.",
		],
		changed: [
			"A nav section holding one page — Release notes, Events — is now that page's link rather than a drawer you have to open to find the single thing inside it.",
		],
	},
	{
		version: "0.8.0",
		date: "2026-09-06",
		headline: "A static documentation site, a luau pin type, and Error.",
		added: [
			"`npm run build:docs` writes the whole site to `dist-docs/` — 167 pages, syntax highlighted at build time, with client-side search. No daemon, and **no JavaScript needed to read a page**.",
			"**Error**, **Assert** and **Traceback** in Debug.",
			"**Cast Through Any**, because Luau refuses a cast between unrelated types and going through `any` is the documented way round it.",
			"**Roswaal types** — a guide to what a pin's type means, what connects to what, and where it differs from Luau's own.",
		],
		changed: [
			"Code pins are typed `luau` rather than `string`. They hold code, not text, and a type says that more plainly than the yellow warning badge they used to carry did.",
			"That badge is gone. Neither a code pin nor a literal-only pin is a problem, so neither is coloured like one — they read **code editor** and **literal** now.",
			"Release notes are their own nav section rather than the fifth page under Guides.",
			"**Cast** already accepted any Luau type expression — intersections, unions, table types — and nothing said so. `Model & { Humanoid: Humanoid }` works, and the docs now show it.",
		],
	},
	{
		version: "0.7.1",
		date: "2026-09-06",
		headline: "The documentation reads like the editor does.",
		changed: [
			"Code in the docs is **syntax highlighted by the editor's own tokeniser**, in the editor's own colours — the same Luau should not look like two different languages one panel apart.",
			"Pin lists are bordered rows in the shape Roblox's reference uses for properties: `Name : type`, with the default, badges for what is unusual, and the detail underneath rather than in a column that was empty on most rows.",
			"Pages are centred and given room to grow, closer to how Roblox's Creator Hub sets its own.",
		],
		fixed: [
			"An *On this page* link sent you back to Getting Started. The hash names the page, so a heading anchor was being read as a page slug that does not exist.",
			'The *Coming from Blueprints* page still called cast pins "planned, not built" a release after they shipped.',
		],
	},
	{
		version: "0.7.0",
		date: "2026-09-06",
		headline: "Query Descendants, and the documentation reads like documentation.",
		added: [
			"**Query Descendants** — `ClassName` matches by `IsA`, `.Tag` by CollectionService tag, `#Name` by name, `[Property = value]` and `[$Attribute = value]` by value, combined and negated with `:not(...)`. It returns `{ Instance }`, so it pairs with Cast Array.",
			"**Is Ancestor Of**, the other half of Is Descendant Of.",
			"**Release notes** — this page.",
			"Code blocks carry their language and a **Copy** button, and every page longer than a screen gets an *On this page* outline.",
		],
		changed: [
			"The node reference is split into **Built-in nodes** and **Project nodes** in the nav, so a pack's node is recognisable before you click into it rather than after.",
			"`Get Tags` is documented as returning `{ any }`, which is what Roblox types it as — not `{ string }`, as it said before.",
		],
	},
	{
		version: "0.6.0",
		date: "2026-09-06",
		headline: "Instances, tags, attributes, players and casts — 124 nodes to 152.",
		added: [
			"**Instances**: finders, ancestors, `GetChildren`, `GetDescendants`, `QueryDescendants`, `IsA`, `IsDescendantOf`, `GetFullName`, `Clone`, and the changed-signal getters.",
			"**Tags and attributes**, as the methods on Instance rather than the CollectionService calls they forward to — so no service has to be hoisted for them.",
			"**Local Player** and **Local Character**, which reach the Players service themselves. Client-only, and the compiler says so if the graph is not a LocalScript.",
			"**Cast** and **Cast Array** — Luau's `::`. `Get Descendants` is `{ Instance }` however much you know about it, and Cast Array is how you say what is really in there.",
		],
		changed: [
			'The *Coming from Blueprints* page said Cast To maps to "just index it", which was wrong. It is two halves of one node: **Is A** asks at runtime and gives you a boolean to branch on, **Cast** asserts to the typechecker and emits nothing. Ask, then assert.',
		],
	},
	{
		version: "0.5.0",
		date: "2026-09-06",
		headline: "The documentation, in its own window.",
		added: [
			"**Docs** replaces Help, and opens at `/docs` as a separate window — put it beside the editor rather than over it.",
			"A reference page for every node, with search, guides, and the *Coming from Blueprints* mapping.",
			"Your **own node packs are documented too**, with their real compiled output, because the reference is generated from the live registry rather than at build time.",
		],
		fixed: [
			"A capsule getter — Get Variable, Get Function — showed no selection highlight. Its own styling was quietly overriding the ring.",
			'Every output pin claimed "must be wired". Only an input can be required.',
		],
	},
	{
		version: "0.4.0",
		date: "2026-09-06",
		headline: "Every node carries a worked example, compiled by the real emitter.",
		added: [
			"A compiled example on all 124 node pages. Where a node cannot be shown honestly on its own, the page says why instead of going quiet.",
		],
		fixed: [
			"A Branch whose false arm compiled to nothing left a bare `else` before the `end`. Valid Luau that nobody writes.",
		],
	},
	{
		version: "0.3.0",
		date: "2026-09-06",
		headline: "Split struct pins, and the Vector and CFrame libraries.",
		added: [
			"**Split Struct Pin** and **Recombine Struct Pin** on `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` and `UDim2`. `CFrame` offers three decompositions.",
			"**Promote to Variable**, which takes the value already typed into the pin rather than resetting it.",
			"Vectors, CFrames and DateTime — 40 nodes.",
			"Realign can **straighten the execution spine**, placing each node where its incoming exec wire comes out flat.",
			"Splitting works on **custom pack nodes** too, without the pack knowing splitting exists.",
		],
		changed: [
			"Execution pins are larger, and empty-versus-wired is drawn as an outline rather than a fade — an unwired exec pin is now as easy to find as a wired one.",
		],
		watch: [
			"A pin whose text is pasted into the generated source — a property name, a cast's type — can no longer be wired. The editor refuses the connection during the drag rather than letting the compile fail.",
			"An ordinary pin that defaults to a Luau constant like `Vector3.zero` **no longer opens a code editor**. Only Custom Code and Luau Expression accept typed Luau, which makes those two node titles a complete list of where hand-written code can enter a graph. Wire a node in, or split the pin, to change a constant.",
		],
	},
	{
		version: "0.2.0",
		date: "2026-09-03",
		headline: "The roswaal command, node maps, and variables you declare once and use anywhere.",
		added: [
			"The `roswaal` command: `init`, `serve`, `stop`, `restart`, `status`, `compile`, `watch`, `prune` and `check`. `roswaal serve` runs the daemon and the built editor together on one port, 4471. It is a pair of shell scripts in `bin/` that you put on your PATH after `npm run build`.",
			"**Variables**, declared once in a list, then read and written with **Get Variable** and **Set Variable** anywhere in the graph, functions included. Drag one onto the canvas for a Get, or hold Ctrl for a Set. The palette lists variables and functions by name: *Get health*, *Set health*, *Get greet*.",
			"**Get Function** and **Call Function**, so calling a function no longer needs a wire from where it is declared. **Get Event**, typed as a signal so it wires straight into Connect Event. **Get Field**, which reads a field off any value.",
			"**Instance** and **Require Module** take a root and a dotted path, so a chain of Find First Child nodes is no longer needed. A name that is not an identifier, like `Main Menu`, is bracketed. A module is required once, however many nodes ask for it. Dragging a file from the project tree onto the canvas offers either node with the path already filled in.",
			"**Node maps**. A `.nodemap` says where each script lives in the DataModel and compiles to the Rojo project file. It is edited as a tree, with the generated JSON beside it. A path that does not exist on disk, or that sits inside another mapping, gets a warning. Ignore paths are set on the instance they belong to.",
			"**Folders** in the project tree. Its right-click menu adds New Folder, Rename, Delete and Show in file manager.",
			"**Node packs written in Luau**, as `.nodedef.luau`. Roswaal reads the file and never runs it. Only literal values are accepted, and anything else is an error with a line number.",
			"**A code editor for Custom Code and Luau Expression**, with Luau highlighting, line numbers, and a check for unclosed brackets, strings, comments and blocks. The check runs as you type and on every compile. Completion offers Luau's globals and libraries, and the names the graph puts in scope: its variables, functions, services and required modules, and locals declared by an earlier Custom Code block.",
			"**Operators take any number of inputs.** Add, Multiply, Min, Concatenate and the rest have + and − in the header, and dropping a data wire on one adds a pin. Return, Module Exports, Sequence and the call nodes grow the same way.",
			"**Reroute knots**: double-click a wire. A knot compiles to nothing.",
			"**Realign** (`Ctrl+Shift+L`) lays the graph out in columns. With several nodes selected, only those move.",
			"Shift-click a pin to disconnect everything on it, and Shift-drag a node to snap it to the grid.",
			"A wire between pins of different types is drawn as a gradient from one colour to the other, and names the conversion on hover.",
			"`roswaal prune` lists generated files whose graph has moved or gone, and deletes them only with `--yes`. The editor offers the same after a project compile. A file is only removed if it still says it was generated.",
			"**Help** in the toolbar.",
		],
		changed: [
			"**Get Service** is pure, and picks from a list of services, with *Other...* for a name the list does not have. However many nodes ask for a service, it becomes one local at the top of the file.",
			"**Call Method** takes as many arguments as the inspector says, rather than exactly one.",
			"**Require** is now **Require (Dynamic)**, for a module reached by a wire. Require Module covers a fixed path.",
			"Getters are drawn as compact capsules, pure nodes have a green edge, and each pin type has a colour of its own. A Function node shows its signature under its name.",
			"A wire starts only from a pin's dot, so the rest of the row drags the node. While a wire is being dragged, every pin is easier to drop on.",
			"Creating, renaming or moving anything inside the output folder is refused, with the reason.",
			"Prompts and confirmations are the editor's own dialogs rather than the browser's.",
		],
		fixed: [
			"A Return, Break or Continue on one output of a **Sequence** was followed by the next output's statements, which is not valid Luau. The outputs after it are now reported as unreachable.",
		],
		watch: [
			"**Declare Variable** and **Set Variable** are now **Declare Local** and **Set Local**. *Variable* now means the graph-wide kind. A graph saved by 0.1.0 is migrated when it is opened, and what changed is listed once.",
			"A Get Service node from 0.1.0 sat on the execution wire. It is taken off when the graph is opened, and the wires on either side are joined.",
		],
	},
	{
		version: "0.1.0",
		date: "2026-09-03",
		headline: "Graphs that compile to Luau, and an editor to draw them in.",
		added: [
			"**Graphs as files.** A `.nodescript` is one Script, LocalScript or ModuleScript, kept under `.roswaal/scripts`. It compiles to plain Luau in your source tree for Rojo to sync, as `Name.luau`, `Name.server.luau` or `Name.client.luau` depending on the script class.",
			"**An editor in the browser.** `npm run dev` in a clone starts it on port 4470, with the daemon that writes the files on 4471. **Initialise** creates `roswaal.json` and `.roswaal/` in a project that has neither. There is a working example in `examples/demo`.",
			"**Execution wires and data wires**, and 74 nodes: flow and loops, functions, Module Exports, Connect Event, values, maths, logic, strings, tables, Roblox instances and properties, Require, Call Method, Wait, Print and Warn.",
			"**Custom Code** and **Luau Expression**, which put hand-written Luau into a graph exactly as typed.",
			"**Custom node packs**: `.nodedef.json` files in `.roswaal/nodes/`, made of data only, with `expr`, `call` and `statement` templates. Loading a pack never runs code.",
			"Diagnostics update as you wire, because the editor runs the same compiler the daemon does. Reading a loop's variable from outside the loop is reported rather than compiled.",
			"A value used by more than one node is bound to a local and evaluated once. A value used by one node is written where it is used.",
			"**A generated file edited by hand is not overwritten.** The compile refuses and offers the overwrite. Moving nodes around does not change the generated file.",
			"Output goes through **StyLua** when it is installed.",
			"Two compile modes. **Manual** compiles the open graph with `Ctrl+S`, or the whole project. **Hot reload** recompiles a graph whenever its file changes, including changes made outside Roswaal: switching branch, pulling, or editing in another tool.",
			"An **inspector** for a function's signature, a module's exports and a connection's parameters. Changing a function's returns updates its Return nodes.",
			"The node palette on right-click, or when a wire is dropped on empty canvas. Marquee and Shift/Ctrl selection, comments (`C`), undo and redo.",
			"Copy, cut, paste and duplicate. A copy keeps only the wires with both ends in the selection. It stays inside the editor and does not go to the system clipboard.",
		],
	},
];
