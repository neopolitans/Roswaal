/**
 * Release notes.
 *
 * Hand-written, because "what changed and why it matters to you" is a judgement
 * a generator cannot make — a commit log is a record of work, not a record of
 * consequences. But the newest entry's version is checked against
 * `version.json` by a test, so the notes cannot silently fall a release behind
 * the thing they claim to describe.
 *
 * The rule for writing one: **an entry earns its place by changing what a
 * reader would do.** A refactor with no visible effect does not go here. A
 * behaviour that used to be one thing and is now another always does, even when
 * the change was a fix, because somebody has built a habit on the old one.
 *
 * And an entry **describes the change, it does not argue for it**. Saying a
 * behaviour is intentional is fair when a reader would otherwise report it as a
 * bug; explaining why it was chosen, what the alternative was, or what the
 * trade-off cost is not. That reasoning lives in `NOTES.md`, which is where
 * somebody goes when they want it — rather than being put in front of everyone
 * who opened a changelog to find out what is different.
 */

export interface Release {
	version: string;
	/** ISO date. Absolute, so it still means something in six months. */
	date: string;
	/** One line: what this release is about. */
	headline: string;
	added?: string[];
	changed?: string[];
	fixed?: string[];
	/** Behaviour somebody may have relied on that now works differently. */
	watch?: string[];
	/**
	 * Set when upgrading can break working code, which is the one thing the tags
	 * on a release cannot work out for themselves: Feature, Change and Bugfix
	 * follow from whether `added`, `changed` and `fixed` have entries, but
	 * whether a change breaks somebody is a judgement about *their* code.
	 *
	 * Not the same as `watch`, which is often just worth knowing. This is for
	 * "something that worked will stop".
	 */
	breaking?: boolean;
}

/** Newest first. */
export const RELEASES: Release[] = [
	{
		version: "0.21.0",
		date: "2026-09-09",
		headline: "Conditions take any value, the way Luau does.",
		changed: [
			"**Not, And, Or, Branch and While take any value, not just a boolean.** Luau has no boolean-only operators: `nil` and `false` are false and everything else is true, so `if not part then` on an `Instance?` is ordinary code and could not be built before.",
			"**And and Or hand back a value rather than a boolean**, which is what they do in Luau: `value or fallback` is the value when there is one. Typing the result `boolean` also annotated it as one in Strict Mode, which does not compile.",
		],
		fixed: [
			"Promote to Variable takes its type from the value sitting in the pin when the pin itself accepts anything, so promoting a Branch condition still gives a boolean.",
		],
		watch: [
			"A node that returns a value names the local it lands in after the node's **Label** — labelling a Find First Child `value` gives `local value = ...` with no second local to rename it. That always worked; the field says so now.",
		],
	},
	{
		version: "0.20.3",
		date: "2026-09-08",
		headline: "Tables can be written one key to a line.",
		added: [
			"**Make Dictionary has a Layout setting**: *Inline*, or *One per line*. Inline is right for two or three keys and unreadable for ten, which is the length a settings table actually is.",
		],
		watch: [
			"stylua breaks a long table for you, but only when it is installed. What the generated file looks like should not depend on whether an optional tool is on PATH, so this does not.",
		],
	},
	{
		version: "0.20.2",
		date: "2026-09-08",
		headline: "Node descriptions in the panel are short, with the rest a click away.",
		changed: [
			"**The Node panel shows the opening of a description rather than all of it**, and ends it with a *See docs page* link to that node's reference entry. Summaries are written for the reference, where a paragraph is right; beside the graph it was a wall.",
			"**Make Dictionary, Get Index and Set Index** call their key styles *Property-like — t.name* and *Bracketed — t[\"name\"]*.",
		],
		watch: [
			"It takes sentences until it has said something rather than exactly one, because plenty of nodes open with a label — *Escape hatch.*, *if / else.* — and one of those alone says less than nothing.",
		],
	},
	{
		version: "0.20.1",
		date: "2026-09-08",
		headline: "The export checkbox says what it is on its own line.",
		fixed: [
			"**Declare Type at Top's export control read as two settings.** It had a heading, *Is Export Type*, and then a checkbox labelled *other modules can use it* — two ways of saying one thing, stacked. It is one line now: the box, and *Is Export Type* beside it. What it means is on hover.",
		],
	},
	{
		version: "0.20.0",
		date: "2026-09-08",
		headline: "String keys are written the way you would write them.",
		changed: [
			"**A string key that is a valid Luau name is now written plainly**: `TankConfig.tuning = TUNING` and `{ turnRate = 45 }`, where before it was always `TankConfig[\"tuning\"]` and `{ [\"turnRate\"] = 45 }`. Both are the same access and Luau takes either, but only one of them is what anybody writes — and generated files are meant to be read beside hand-written ones.",
			"**Make Dictionary, Get Index and Set Index carry a String keys setting** with the other behaviour kept: *Always brackets*. Which reads better depends on the table, so it is a setting rather than a rule.",
			"Declare Type at Top's shape is called **Table of Fields** or **Custom Luau**.",
		],
		watch: [
			"Anything that cannot be written plainly still is not: a computed key, a number, a name with a space in it, and a reserved word like `end`. Those stay bracketed whatever the setting says, because the short form would not compile.",
			"**Recompiling an existing project will rewrite dictionaries and index assignments.** The generated Luau is equivalent, and the diff is one line per key.",
		],
	},
	{
		version: "0.19.5",
		date: "2026-09-08",
		headline: "Build a table type from a list of fields.",
		added: [
			"**Declare Type at Top can be a list of fields** instead of typed-out Luau — a name and a type per row, giving `{ movementSpeed: number, hp: number }`. Field types are free text with suggestions, because a closed list could not offer `Instance?` or `{ Player }` or a type declared in the same file.",
			"**Written out as Luau** is still there, as the other half of a Shape dropdown. It is what says the things a list of pairs cannot — a union, a function type, a generic.",
		],
		fixed: [
			"**The Export checkbox sat under its own heading with its explanation orphaned below it.** The checkbox and the words that explain it are one line now, and it reads *Is Export Type*.",
		],
	},
	{
		version: "0.19.4",
		date: "2026-09-08",
		headline: "Declare a type after the value it describes.",
		added: [
			"**Declare Type** sits in the execution flow and names the type of a value wired into it: `export type Tuning = typeof(Tuning)`. It goes where you put it, which is the point — a type built from `typeof` has to come *after* the thing it is the type of, and Luau reads a file in order. The identifier comes from the wire, so renaming the value later cannot leave the type pointing at a name that is gone.",
		],
		changed: [
			"**The node that hoists is now Declare Type at Top**, and still writes its definition out as Luau. Graphs using the older one are converted to it when they open.",
		],
		watch: [
			"`export type` is only legal at the top level of a module, so an exported Declare Type inside a branch, loop or function is refused. A plain one — Export unticked — is fine there and stays scoped to that block.",
			"Both nodes share one set of type names; declaring the same name twice is an error whichever pair of nodes did it.",
		],
	},
	{
		version: "0.19.3",
		date: "2026-09-08",
		headline: "Define Type is called Declare Type.",
		changed: [
			"**Define Type is now Declare Type**, which is what the node beside it — Declare Local — is called, and what people go looking for. Graphs using the old one are converted when they open.",
		],
	},
	{
		version: "0.19.2",
		date: "2026-09-08",
		headline: "Declare Luau types, and make a variable without leaving the node.",
		added: [
			"**Define Type.** Writes `export type Name = …` at the top of the generated file, above the variables. Untick Export and it stays inside the module. The definition is written as Luau — a type is not built out of values, so `{ speed: number }` describes something no wire can carry.",
			"**Type Of**, Roblox's `typeof`. A `Vector3` answers `\"Vector3\"` where Lua's `type` only says `\"userdata\"`. For `typeof(x)` *inside* a type, write it in a Define Type definition — that one is a type expression, not a call.",
			"**New…** beside the variable picker on Get, Set and Initialize Variable. Initialize Variable could not be used at all until you had been to the Variables panel and made one first.",
		],
		fixed: [
			"**Renaming a variable left an Initialize Variable node showing the old name**, the usage count did not include those nodes, and deleting a variable only used by one gave no warning. Every node that points at a variable is now counted the same way.",
		],
		watch: [
			"A type name is reserved against variables and locals. Luau keeps types and values in separate namespaces and would allow both; a reader would not thank you for it.",
		],
	},
	{
		version: "0.19.1",
		date: "2026-09-08",
		headline: "Declare a variable where you build its value.",
		added: [
			"**Initialize Variable.** Gives a script variable its first value *and* is its declaration, so there is no empty one above it — `local Tuning = { … }` rather than `local Tuning = {}` followed by an assignment. For a starting value that has to be built from nodes rather than typed into the variables panel.",
			"**Declare Local has a Name.** An optional input on the node face; leave it blank and one is chosen. The Inspector's Label did this already and was findable only by guessing that a cosmetic field was load-bearing.",
		],
		changed: [
			"**Make Dictionary goes up to 24 pairs**, from 8. A settings table of ten entries is ordinary, and there is no way to say \"a table with ten keys\" by adding more nodes.",
		],
		watch: [
			"Initialize Variable has to sit in the main flow. Inside a branch, a loop or a function the declaration would go out of scope and every later mention would read as an empty global, so it is refused with an error naming Set Variable as the alternative. Reading the variable before the node that declares it is refused for the same reason.",
			"Declare Local's Name is typed in, not wired. It becomes an identifier in the generated file, which is decided before anything runs.",
		],
	},
	{
		version: "0.19.0",
		date: "2026-09-08",
		headline: "A moved graph takes its generated file with it, and the tree says which half is which.",
		fixed: [
			"**Renaming, moving or reclassing a graph left its old generated file behind** and wrote a new one beside it. Rojo went on syncing both, so the game ended up with two copies of the module and nothing maintaining one of them. The file a graph used to write is now removed when it writes a different one, and the compile report names what went.",
			"The count of stale generated files was only refreshed by a compile, so renaming or deleting a graph left it describing whatever the last compile saw. It updates whenever the tree does.",
		],
		added: [
			"**The project tree is split into *Graph content* and *Compile content*.** One half you author and Roswaal reads; the other Roswaal writes and you do not edit. Each collapses, and an empty one says so.",
		],
		watch: [
			"Only a file whose own header names the graph that just moved is removed. A generated file with no graph behind it at all is still reported rather than deleted — that is the *stale* line in the compile panel, and it still asks first.",
		],
	},
	{
		version: "0.18.5",
		date: "2026-09-08",
		headline: "Make a graph in the folder you are looking at.",
		added: [
			"**Right-click a folder for *New graph here* and *New map here*.** They appear only for folders under the project's source directory — a graph written into the compiled output would be deleted by the next compile.",
		],
		changed: [
			"**New graph and New map use the folder you last clicked in the tree**, rather than always the top of the source directory. A folder counts as itself, a file counts as the folder it is in, and the folder is marked in the tree.",
			"Both dialogs name the folder the document will be created in.",
		],
		fixed: [
			"Creating a graph or a map that fails now says so, instead of leaving the tree unchanged with no explanation.",
		],
	},
	{
		version: "0.18.4",
		date: "2026-09-08",
		headline: "`npm link` puts roswaal on your PATH.",
		fixed: [
			"**Installing Roswaal through npm produced a `roswaal` command that did not run on Windows.** npm read the `#!/bin/sh` line off the launcher and wrote a wrapper calling `sh`, which a Windows machine has no reason to have — the command failed with \"the term '/bin/sh.exe' is not recognized\". npm now installs a launcher it can wrap on every platform.",
		],
		changed: [
			"The install instructions offer `npm link` first. It is one command, it works in the terminal you are already in rather than the next one you open, and `npm unlink -g roswaal` undoes it. Putting `bin/` on your PATH still works and is still documented.",
		],
	},
	{
		version: "0.18.3",
		date: "2026-09-08",
		headline: "Opening a Luau file with a block comment no longer blanks the editor.",
		fixed: [
			"**Opening a `.luau` file containing a `--[[ ]]` comment or a `[[ ]]` string emptied the whole page.** The syntax highlighter threw, React unmounted, and what was left was a black rectangle with no message. Every `.luau` file opens correctly now, generated or hand-written.",
			"**A number's exponent was split in two.** `1e-9` was coloured as `1e`, an operator, and `9`; hex and binary literals were read a character at a time and could come apart the same way.",
		],
		added: [
			"**A crash screen.** If something does throw, the editor now says what and offers the error to copy, rather than leaving an empty page. Nothing is lost by reloading — every graph is on disk.",
		],
		watch: [
			"The highlighter had been doing this since it was written. It went unnoticed because the only Luau anyone opened was Roswaal's own generated output, which contains no block comments.",
		],
	},
	{
		version: "0.18.2",
		date: "2026-09-08",
		headline: "Switch projects from the toolbar.",
		added: [
			"**The Roswaal mark in the toolbar opens a project menu.** It names the project you have open, lists the ones you opened before, and offers the folder dialog for anything else. Changing project no longer means restarting the daemon.",
			"A project in the recent list can be removed from it. The project itself is untouched.",
			"Choosing a directory that is not a Roswaal project yet offers to initialise it, on the same terms the first-run screen does — a `roswaal.json` is written and nothing else.",
		],
		changed: [
			"**Every open graph is written to disk before the project changes**, and a write that fails cancels the switch rather than closing the tab it failed on.",
		],
	},
	{
		version: "0.18.1",
		date: "2026-09-08",
		headline: "Three typechecking modes, and a second way to cut a wire.",
		added: [
			"**Shift-click a wire to disconnect it.** Alt-click already did, and still does.",
		],
		changed: [
			"**The `strict` checkbox is now a typechecking mode**, with three settings. *Default* writes no mode line at all, leaving the generated file to whatever the project says. *Nonstrict Mode* writes `--!nonstrict`, and *Strict Mode* writes `--!strict`.",
			"**Both checked modes annotate the types** of generated locals and function parameters. *Default* leaves them off, which is what an unticked `strict` did.",
			"`.nodescript` files record `typecheck` where they recorded `strict`. Older graphs convert on open — a ticked box becomes *Strict Mode* and an unticked one becomes *Default* — and the old key is dropped on the next save.",
		],
		watch: [
			"A graph naming a mode this build does not know, which means one written by a later Roswaal, opens as *Default* rather than keeping a setting it cannot honour.",
		],
	},
	{
		version: "0.18.0",
		date: "2026-09-08",
		headline: "Panels you can move, and more than one graph open.",
		added: [
			"**Several graphs open at once, in tabs.** Each keeps its own undo history, its own selection and its own viewport, so switching between them lands you where you left off rather than at the top of the file. Middle-click a tab to close it.",
			"**The sidebars resize.** Drag the divider beside a dock; double-click it to collapse the dock, and again to bring it back.",
			"**Panels can be moved between the three docks.** Drag a panel by its heading — the project name, *Variables*, *Node*, the diagnostics bar — and drop it on the left, right or bottom edge. A rectangle shows where it will land, and releasing over the middle leaves it where it was.",
			"**The layout is remembered**, alongside the theme and wire style. Dock sizes and which panel sits where; not which documents were open.",
		],
		fixed: [
			"**The project name and the *Variables* heading had grown to twice their size.** They took their size, case and colour from a rule scoped to the old sidebar, which the dock work renamed out from under them.",
			"The compiler's line-to-node source map had been off by one since it was written, so anything reading it — currently the selection preview — pointed one line late.",
		],
		watch: [
			"A layout is remembered per browser, not per project. Dock sizes restored on a smaller screen are brought back inside it, so a layout arranged on a wide monitor cannot leave the graph with no room.",
			"Renaming a graph keeps its tab, its history and its viewport. Deleting one closes its tab and leaves the others alone.",
			"A dock holds its panels stacked rather than tabbed. Two panels side by side within one dock, and two graphs side by side in the centre, are not built yet.",
		],
	},
	{
		version: "0.17.2",
		date: "2026-09-08",
		headline: "Worth-knowing notes are a list.",
		changed: [
			"**\"Worth knowing before you upgrade\" is bulleted**, one point per bullet. It was one run-on paragraph, so telling its separate claims apart meant reading the whole thing.",
			"A few entries that carried two claims have been split into two.",
		],
	},
	{
		version: "0.17.1",
		date: "2026-09-08",
		headline: "The selection preview is syntax highlighted.",
		fixed: [
			"**The selection preview showed Luau in plain body text.** It was running the highlighter and emitting the right classes all along; the colours were scoped to the documentation and applied nowhere else, so keywords, strings, comments and numbers all came out the same colour as everything around them.",
		],
		changed: [
			"The Luau token colours now apply in every place Luau is shown as text, rather than in the documentation alone. The editor, the docs and the preview were already meant to share one palette.",
		],
	},
	{
		version: "0.17.0",
		date: "2026-09-08",
		headline: "See what a selection compiles to, and the source map finally works.",
		added: [
			"**Selection preview.** Select some nodes and press `P`, or use the **Preview** button that appears on the toolbar when something is selected. It shows the Luau those nodes produced, picked out of the real generated file with a few lines of context either side, syntax highlighted.",
			"A **Whole file** switch in its header swaps between the extract and the complete output.",
			"**A pure node is handled too.** A pure value with one consumer has no line of its own, so the preview names it and highlights the statement its value ends up in.",
		],
		fixed: [
			"**The compiler's line-to-node source map was off by one, and always had been.** Every entry pointed one line late: the first statement at the line below it, the last node at the blank line ending the file.",
		],
		watch: [
			"`P` opens the preview when nodes are selected, with no modifier — the same shape as `C` for a comment.",
			"The preview works while a compile has the graph locked.",
			"The source map is what a future Studio integration would use to point a runtime error back at a node.",
			"Anything already built against the map was reading lines one out.",
		],
	},
	{
		version: "0.16.0",
		date: "2026-09-08",
		headline: "Arguments you can leave out, and a wire that finishes the thought.",
		added: [
			"**Optional input pins.** A pin marked optional and left alone is *not passed at all*, rather than passed as a default Roswaal picked.",
			"`TweenInfo` now compiles to `TweenInfo.new(1, style, direction)` instead of six arguments, three of which were the engine's own defaults handed back to it. `Look At` and both `Fuzzy Equals` nodes lost their trailing argument the same way.",
			"On the canvas an untouched optional pin reads **default** in a dashed box; click it to set a value, and the **×** beside a set one puts it back. Setting it and clearing it again leaves the graph byte for byte as it was.",
			"**Dragging a wire into empty space and picking a node now connects it.** The palette narrows to nodes that can take the wire, names the pin it is holding, and joins the two up when you pick.",
			"**Make Dictionary**, a table of key/value pairs in one pure node. A one-property tween used to be New Table, Set Index and an execution wire to say `{ x = 1 }`.",
		],
		fixed: [
			"**A statement node with several outputs assigned the unwired ones to globals.** The emitter declared only the outputs something read, leaving the rest as bare names on the left of an assignment — which in Luau creates a global, silently, visible to every other script. No built-in node did this; the machinery is now correct for one that does.",
		],
		watch: [
			"An optional pin's **default is still there** and is what you get when you click to set it. What changed is that leaving it alone no longer emits it.",
			"An unset optional pin with a set one *after* it is passed as `nil`. Only trailing ones disappear.",
			"The palette **filters** rather than reorders when a wire is in flight, so a node with no compatible pin is not offered. Opening the palette any other way still lists everything.",
			"`table.remove`'s index is not optional, and was left as it was: `table.remove(t)` removes the *last* element where `table.remove(t, 1)` removes the first, so changing it would alter what existing graphs do.",
		],
	},
	{
		version: "0.15.0",
		date: "2026-09-08",
		headline: "Every Roblox datatype, in one place, with a lot more of them.",
		added: [
			"**A category called Engine types**, holding every Roblox datatype with a subcategory per type: Vector3, Vector2, CFrame, Color3, BrickColor, UDim, UDim2, TweenInfo and Tween. The node menu groups two levels deep now, and the documentation gives each type its own nav section.",
			"**Vector3 gained the rest of its API** — divide, component-wise multiply, negate, Angle, Max, Min, Abs, Ceil, Floor, Sign, FuzzyEq and a Break node — and **Vector2 now has all of it too**, where before it had only a constructor.",
			"**Color3 converts both ways between all four forms**: RGB 0–255, RGB float 0–1, HSV, and hex. `Color3 To RGB` rounds to whole channels; `Color3 To RGB Float` gives you what the engine stores.",
			"**BrickColor** — by name, from a Color3, from float channels, by palette index, or random, plus `.Color`, `.Name` and `.Number` to get back out.",
			"**UDim and UDim2**, with construction from scale or offset, arithmetic, Lerp, and the X / Y / Width / Height accessors.",
			"**Tweening, end to end.** A TweenInfo with easing style and direction as dropdowns, Create Tween, Play, Pause and Cancel, and the Completed signal to wait on.",
			"**Tween Property**, a one-property shorthand. For several at once, wire in a table.",
			"**Break nodes** for Vector3, Vector2, UDim and CFrame's Euler angles.",
		],
		changed: [
			"**Vectors and CFrames are no longer top-level categories**, and the two datatype nodes that sat under Engine have moved out of it. Everything is under Engine types, grouped by the type it belongs to.",
			"**Nodes are coloured by their datatype now**, not by the category. Vector3 and CFrame nodes keep exactly the colours they had.",
			"`BrickColor`, `TweenInfo` and `Tween` are pin types of their own, with their own colours. BrickColor's is not near Color3's.",
		],
		watch: [
			"**No node changed its id, so no graph moved.** `roblox.vector3` and `roblox.color3` kept theirs even though both were retitled — the latter is now `Color3 from RGB`.",
			"`Color3 To HSV` and `To Euler Angles XYZ` call the underlying method **once per output you wire**. Wiring one component costs one call; wiring all three costs three.",
			"A `BrickColor` is not a `Color3` and the two are not interchangeable. Read `.Color` for the Color3 behind the name.",
			"BrickColor's float constructor takes channels from **0 to 1**, not 0 to 255.",
			"The easing and BrickColor dropdowns are **suggestions, not closed lists** — anything not offered can still be typed.",
		],
	},
	{
		version: "0.14.0",
		date: "2026-09-08",
		headline: "Settings you can find, and seven colour schemes.",
		added: [
			"**A settings panel**, from the toolbar. It covers everything in `roswaal.json` — target, where graphs live, where Luau is written, compile mode, node pack directories, formatting, the Rojo project file — none of which could previously be changed without opening the file by hand.",
			"It **says where each setting is stored**. Project settings are committed and shared by everyone on the repository; preferences are yours, live in your browser, and never appear in a diff.",
			"**Seven colour schemes**: Roswaal Light and Dark, Tokyo Night and Tokyo Night Storm, Catppuccin Mocha, Nord, and Aquatic. Each is one JSON file in `themes/`, in the same format [Beako](https://github.com/neopolitans/Beako) uses, so a theme written for one tool reads in the other.",
			"**Follow the system** is still the default, and is the *absence* of a theme rather than an eighth scheme: it removes the palette, so the app goes on changing with your OS.",
			"The theme applies to **the docs window too**, before anything renders rather than a frame later.",
			"**Settings → Licences** shows the full text of the three borrowed schemes' licences, compiled in from files copied byte for byte out of each upstream project.",
			"Two preferences that were previously not settings at all: **how long after your last edit a graph is written**, and **whether Roswaal reopens the last project** or starts at the picker.",
			"**Three wire styles.** *Curved* is the bezier you have, and stays the default. *Rigid* bends at right angles and nowhere else. *Angular* is the same route with each corner cut to a 45-degree slope.",
			"**Square node corners.** Capsule getters and reroute knots keep their shapes either way.",
		],
		changed: [
			"**Straighten is a preference rather than a stray `localStorage` key.** It behaves exactly as before, and is now in the settings panel with everything else.",
			"A **project setting that the daemon refuses now says so.** Writing `roswaal.json` was previously a promise nobody checked.",
		],
		fixed: [
			"**The `<select>` popup follows the theme.** Chromium paints that list outside the document, where `var(…)` does not resolve, so its colours were four literals copied out of the built-in schemes and stopped following any other palette.",
		],
		watch: [
			"**A theme cannot recolour a pin or a node category.** Red is a boolean, green is a number, gold is a vector, whatever scheme you are on.",
			"The rigid wire router has **no obstacle avoidance**: a wire may cross a node rather than route around it.",
			"Hover, the grid, the watermark and the node shadow are **derived from whether a scheme is dark**, not authored, so a theme file does not set them.",
			"Preferences live in this browser and do not follow you to another machine.",
		],
	},
	{
		version: "0.13.0",
		date: "2026-09-07",
		headline: "You can watch a compile happen.",
		// The daemon now refuses cross-origin requests it used to answer. Nothing
		// in the editor or the CLI changes, but a script driving the API from a
		// page on another origin stops working, which is the definition.
		breaking: true,
		added: [
			"**Compiling a project now shows the walk rather than its result.** A notification in the bottom-right corner of the graph names the file being compiled and its place in the queue — *628 of 1202* — and fills as it goes. A slow project used to look exactly like a stuck one; the difference is now the thing on screen.",
			"It **stays out of the script analysis panel**, which answers a different question — what is wrong with the graph you have open. A thousand rows of good news in there buries the one diagnostic you opened it for. The notification takes itself away a few seconds after the compile finishes, or when you click it.",
			"**Browse…** on the opening screen, beside Open, which opens your operating system's own folder dialog rather than asking you to type an absolute path. It fills the field rather than opening the project, because choosing a folder and opening it are two decisions and the *Open versus Initialise* check belongs between them. The dialog runs on the machine the daemon is on — a browser cannot produce a filesystem path — so on a daemon with no desktop the button is replaced by the reason.",
			"A compile started in **one window is narrated in every open window**, because it is something happening to the project rather than to the tab that asked for it.",
			"**The graph is read-only while it is being compiled**, framed and labelled so it is obvious why. An edit made during the walk landed in the written file or did not, depending on where the walk had got to when you made it — and the file then disagreed with the graph, with nothing to say so.",
		],
		changed: [
			"**The node category called \"Roblox\" is now called \"Engine\".** It holds Get Service, New Instance, Find First Child, Destroy and the rest — engine and DataModel work — and *Engine* says what they do, where the old name said only which platform they were for. The nodes and their ids are unchanged, so nothing in your graphs moves; only the drawer they sit in is labelled differently.",
			"The toolbar, the opening screen and the docs window carry **the Roswaal mark** — a file, a wire leaving it, and an empty pin. It takes the colour of the text beside it, so it works in both themes, and it is the tab's icon as well; the browser tab was still showing a default.",
		],
		fixed: [
			"**Renaming a graph renames the file it compiles to.** A graph carries its own name, and that name — not the file's — is what the compiler writes out. Renaming `Greeter.nodescript` to `Hello.nodescript` used to leave the graph still called Greeter, so it went on producing `Greeter.luau` with nothing anywhere saying so. Renaming now keeps the two in step, and creating and renaming run the name through the same function so they cannot drift apart again.",
			"**Two graphs with the same name no longer overwrite each other silently.** They compile to one file, and the second used to win and report *wrote* for both — a project of 1202 graphs cheerfully said \"1202 of 1202 written\" when 1200 of them were the same file. The second is now refused, naming the graph that got there first and telling you to rename one.",
			"**Generated files stop being reported as hand-edited on Windows.** The hash in a generated file's header is what tells Roswaal you have edited it. Roswaal writes LF; Git on Windows checks the same file out as CRLF, so after a clone the hash no longer described the bytes on disk and every generated file was refused as edited by hand — files nobody had touched. A line ending applied by version control is not somebody changing the code, and the hash now says so.",
			"A compile that skipped a script **miscounted the summary**, subtracting it from the number of *node maps* written: a run that wrote two files could report \"0 of 5 written\". Rare before, because skipping was rare.",
			"**The daemon no longer answers other websites.** It listens on 127.0.0.1, which keeps the network out — but not the browser already running beside it, and it used to tell every origin that asked that it was welcome to read the reply. Any page you had open could therefore point Roswaal at a directory and read files out of it. It now refuses a request whose `Origin` is not local, and one whose `Host` is not local either, which is the same attack wearing a DNS answer instead. Nothing you do changes: the editor is served by the daemon itself, and `roswaal` on the command line was never a browser.",
			"**The canvas no longer slows down when a large folder is open in the tree.** Panning, zooming and dragging a node all re-rendered the whole project tree, once per frame, for no reason — nothing in the tree depends on the graph you are editing or on where the canvas is looking. With 1200 graphs showing, a frame took 20ms instead of 4ms and dragging visibly stuttered. It is now the same speed with the folder open as with it closed.",
			"**A tab is told again when the daemon changes project.** The mechanism has been broken since it was introduced in 0.12.0: the list of listening editors was read by the sender and written by nobody, so every daemon-wide message went out to an empty room. Nothing failed and nothing was logged, which is why it survived a release. Compile progress travels the same channel and would have been just as silent.",
		],
		watch: [
			"If you had scripts driving the daemon's HTTP API **from a web page on some other origin**, they stop working, and that is the point of the change. From a terminal — curl, a shell script, anything that is not a browser — nothing is different.",
			"The read-only lock is **only outside hot reload**. In hot mode a compile follows every autosave, so locking on one would lock the canvas roughly whenever you stopped typing — and that mode exists precisely so that compiling is not something you think about. Outside it a compile is something you asked for and then wait for.",
			"If you have been on 0.12.x with two editor windows open on the same daemon, **the second window was never actually following a project switch**. It kept editing the project it was opened on, which is what the 0.12.0 guard then refused to save — so the symptom was a save that would not go through rather than a graph in the wrong repository. Both halves work now.",
		],
	},
	{
		version: "0.12.1",
		date: "2026-09-06",
		headline: "The toolbar says what each control acts on.",
		changed: [
			"The top bar is **two rows now, split by what a control acts on**. Everything on the first is about the project — Refresh, New graph, New map, the compile mode, Compile project, Docs. Everything on the second is about the document you have open: its name, its script class, `strict`, the tools that only mean anything while it is open, and Compile script.",
			"The document row is **absent when nothing is open**, so the empty editor is one clean bar rather than twelve controls that mostly do not apply.",
		],
	},
	{
		version: "0.12.0",
		date: "2026-09-06",
		headline: "The project shell, and Luau you can read.",
		added: [
			"**Recent projects** on the opening screen, and one button that says the right thing: the path is checked before it is opened, so a Roswaal project offers *Open*, a plain directory offers *Initialise*, and a typo is reported as a typo.",
			"A `.luau` file opens in a **read-only code view** with the editor's own highlighting and line numbers, rather than as unstyled text. It says whether Roswaal wrote the file or you did, because that changes what to do with it.",
			"**Open in VS Code** on a hand-written file, and *Open the graph* on a generated one — both dead ends before.",
		],
		fixed: [
			"**Pointing the daemon at another project no longer writes your open graph into it.** Every request that writes now carries the project it believes is open, and the daemon refuses a mismatch instead of obeying it. An editor tab is also told when the daemon moves, and closes what it was holding rather than saving it somewhere it does not belong.",
			"A dropdown's list opened in the wrong colours — pale text on a pale background until you hovered a row. Giving a select's options their colours explicitly settles it; the browser was choosing them, and choosing badly.",
		],
		watch: [
			"A `.luau` file is **read-only in Roswaal**, and that is deliberate. An editable pane would need a save path, a story for conflicting with the file watcher, and an answer for what happens when a compile overwrites what you typed. Handing the file to the editor you already use is a better answer than a second-rate one built in here.",
		],
	},
	{
		version: "0.11.1",
		date: "2026-09-06",
		headline: "A node called what you named it, and Wait in the right drawer.",
		changed: [
			"**A Function node shows its function's name.** Naming a function `greet` and still reading “Function” on the canvas made a graph with four functions in it four identical headers, with the answer only in the inspector. The name is now the label unless you type one over it, and the signature stays on the line underneath.",
			"**Wait has moved from Time to Threads.** It is `task.wait` — the scheduler, next to Spawn, Defer and Delay — and Time is about dates and durations. It was in the wrong drawer, and Wait now leads the Threads category because it is where the rest of it becomes relevant.",
			"Every place that shows a node's name asks one function: the header, the capsule, the inspector's placeholder and the diagnostics. A warning about an unreachable node calls it what the canvas calls it.",
		],
		watch: [
			"The label field's placeholder is now **what the node is already called** rather than always the definition's title, so an empty field reads as “this is fine” instead of as a nudge to type the name a second time. Typing a label still wins over everything.",
		],
	},
	{
		version: "0.11.0",
		date: "2026-09-06",
		headline: "Every node page opens with a picture of the node.",
		added: [
			"A **node preview** at the top of all 189 reference pages — the node drawn exactly as the canvas draws it, with its header colour, its rows, its pin colours and the values it starts with. Recognising the node you are looking for is now a glance rather than a read.",
			"Previews in the guides too, where the useful thing is a comparison: **Custom Code beside Luau Expression** on *Hand-written Luau*, and an impure node beside a pure one on *Wires and pins*.",
		],
		changed: [
			"Previews are drawn from the canvas's own geometry and palette rather than from a second set of numbers, and a test holds their size and every pin row against `nodeBounds` and `pinPosition`. A change to how a node is laid out that the previews do not follow fails the build instead of quietly misinforming a reader.",
			"They follow your theme, and need no JavaScript — they are SVG in the page, in the static site as much as in the editor.",
		],
		watch: [
			"**A preview shows the node, not the editor.** The −/+ buttons on a variadic node, the error badge and the selection ring are left out on purpose: they appear when you interact with a node, and a picture of them would be a picture of something you cannot do on a page.",
		],
	},
	{
		version: "0.10.0",
		date: "2026-09-06",
		headline: "The task and coroutine libraries — 189 nodes.",
		added: [
			"**Threads**: Spawn, Defer, Delay and Cancel Thread from Roblox's `task` scheduler, plus Synchronize and Desynchronize for parallel Luau.",
			"The **coroutine** library underneath it — Create, Wrap, Resume, Yield, Status, Running, Is Yieldable and Close.",
			"A `thread` pin type, with its own colour.",
		],
		changed: [
			"`Wait` now says what it is: the replacement for the deprecated `wait()` global, and it hands back how long it actually took.",
		],
		watch: [
			"**Resume Coroutine captures only the first return value.** A coroutine that yields several needs Custom Code to catch the rest — the node says so rather than quietly dropping them.",
		],
	},
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
			"**BindableEvent** and **BindableFunction** — the in-process pair, and the closest thing Roblox has to Unreal's Custom Event.",
		],
		changed: [
			"One set of remote nodes covers **RemoteEvent and UnreliableRemoteEvent** both: the methods are identical, and the difference is a decision made when you create the instance rather than a different call to write. There is no unreliable RemoteFunction, because waiting for an answer needs the answer to arrive.",
			"The *Coming from Blueprints* page gains rows for Custom Event, Unbind Event and RPCs — three places it previously had to say there was no equivalent, or said too little.",
		],
	},
	{
		version: "0.8.1",
		date: "2026-09-06",
		headline: "An Unreal-to-Luau type table, and one fewer click in the nav.",
		added: [
			"**If you know Unreal's types** on the *Roswaal types* page — `FVector` to `Vector3`, `TArray<T>` to a plain table, and the ones with no counterpart at all: no `FRotator`, no `FQuat`, no typed containers. It also flags the two conventions that catch people out: Roblox is **Y-up** and in studs, and a `CFrame` carries **no scale**.",
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
			"**`npm run build:docs`** writes the whole site to `dist-docs/` — 167 pages, syntax highlighted at build time, with client-side search. No daemon, and **no JavaScript needed to read a page**.",
			"**Error**, **Assert** and **Traceback** in Debug.",
			"**Cast Through Any**, because Luau refuses a cast between unrelated types and going through `any` is the documented way round it.",
			"**Roswaal types** — a guide to what a pin's type means, what connects to what, and where it differs from Luau's own.",
		],
		changed: [
			"Code pins are typed **`luau`** rather than `string`. They hold code, not text, and a type says that more plainly than the yellow warning badge they used to carry did.",
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
			"Pages are centred and given room to grow, closer to how Unreal and Roblox set theirs.",
		],
		fixed: [
			"An *On this page* link sent you back to Getting Started. The hash names the page, so a heading anchor was being read as a page slug that does not exist.",
			"The Blueprints page still called cast pins \"planned, not built\" a release after they shipped.",
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
			"The *Coming from Blueprints* page said Cast To maps to \"just index it\", which was wrong. It is two halves of one Unreal node: **Is A** asks at runtime and gives you a boolean to branch on, **Cast** asserts to the typechecker and emits nothing. Ask, then assert.",
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
			"Every output pin claimed \"must be wired\". Only an input can be required.",
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
			"**Split Struct Pin** and **Recombine Struct Pin** on `Vector2`, `Vector3`, `CFrame`, `Color3`, `UDim` and `UDim2`, with Unreal's wording. `CFrame` offers three decompositions.",
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
];
