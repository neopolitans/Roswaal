/**
 * Release notes for 0.80.0 to 0.89.x, newest first.
 *
 * One of the files `../releases.ts` puts together, a tenth of the minor
 * versions each, so the newest notes are not at the top of a very long file.
 */

import type { Release } from "../releases.js";

export const RELEASES_0_80: Release[] = [
	{
		version: "0.89.0",
		date: "2026-09-23",
		headline: "Completion knows Roblox's datatypes and classes.",
		affects: ["editor"],
		added: [
			"**After a datatype's name and a dot**, the code editor offers its constructors and constants with their signatures: `Instance.new`, `Vector3.zero`, `CFrame.lookAt`, `Color3.fromRGB`. Read from Roblox's creator-docs, with `npm run build:statics` to refresh.",
			"**Class names complete inside the string they are given as**: `Instance.new(\"Pa`, `:IsA(\"`, the Find First … Of Class and Which Is A calls, and services in `:GetService(\"`.",
			"**Types complete** after an annotation's colon and after `::`: Luau's own, and Roblox's classes and datatypes.",
			"All of it only in a graph that compiles for Roblox; a Lune graph is offered Luau's own.",
		],
		fixed: [
			"A table type written as Custom Luau with a function-typed field, `{ onHit: (Part) -> (), damage: number }`, offers every field to Get Member. The `->` used to swallow the field after it.",
			"Four Lune functions had their parameters run together the same way: `roblox.implementProperty`'s setter, and the arguments of `task.spawn`, `task.defer` and `task.delay`. Each now has its own pin.",
		],
	},
	{
		version: "0.88.0",
		date: "2026-09-23",
		headline: "Completion knows the scope of the code you are typing.",
		affects: ["editor", "docs"],
		added: [
			"**Completion offers what the code itself has in scope at the cursor**: its own locals, the parameters of a function you are inside, and the variables of a loop you are inside — ahead of the graph's names, and read correctly while a block is still missing its `end`.",
		],
		fixed: [
			"A local declared inside an `if`, a loop or a function in one Custom Code block is **no longer offered** to the blocks after it. Only what the block leaves in scope is.",
		],
	},
	{
		version: "0.87.2",
		date: "2026-09-23",
		headline: "Bringing a node into view moves the camera, not the page.",
		affects: ["editor", "designer"],
		fixed: [
			"**A node scrolled into view** — by tabbing onto one of its fields, find-in-page, a screen reader, or an agent driving the editor — pans the camera to it. The browser used to scroll the canvas itself, which slid the nodes away from the grid and broke panning until a reload.",
		],
	},
	{
		version: "0.87.1",
		date: "2026-09-23",
		headline: "The code editor's cursor shows on every theme.",
		affects: ["editor"],
		fixed: [
			"**The text cursor in the code editors** takes the theme's text colour — light on a dark theme, dark on a light one. It was black on every theme.",
			"**Removing a stale generated file** also removes the folders it leaves empty, up to the out directory, so Rojo is not left syncing empty Folders.",
		],
	},
	{
		version: "0.87.0",
		date: "2026-09-23",
		headline: "A type written as Luau opens in the code editor.",
		affects: ["editor", "docs"],
		added: [
			"**A Declare Type written as Custom Luau is edited in the code editor**, checked as a type while you write. Click the Definition in the Inspector to open it.",
			"**The Inspector shows the definition highlighted**, with its first mistake underneath — a table type missing a comma is marked there, before the build.",
		],
	},
	{
		version: "0.86.0",
		date: "2026-09-23",
		headline: "Hand-written Luau is parsed before the file is written.",
		affects: ["editor", "docs"],
		added: [
			"**Custom Code is parsed as statements**, and a **Luau Expression** — or code typed into any other pin — as one value. A syntax mistake stops the build, against the node, with its line: \"Expected \\\"end\\\" to close the for loop, but found the end of the code.\"",
			"**The code editor marks the same mistakes as you type**, from the same parser, so the editor and the build cannot disagree.",
		],
		changed: [
			"A statement in a Luau Expression is an **error** rather than a warning: `\"local\" starts a statement, and this is a value.`",
			"A written Declare Type, and a type typed into a picker, are parsed as types.",
		],
		fixed: [
			"Interpolated strings with braces in them, and long strings like `[==[ … ]==]`, are no longer reported as unbalanced.",
		],
	},
	{
		version: "0.85.4",
		date: "2026-09-23",
		headline: "A refused wire's types are in bold.",
		affects: ["editor"],
		changed: [
			"The types in a refused wire's message are **bold**: \"**Humanoid** cannot be cast to **Model** due to incompatible classes.\"",
		],
	},
	{
		version: "0.85.3",
		date: "2026-09-23",
		headline: "A refused cast names both classes.",
		affects: ["editor"],
		changed: [
			"A wire refused between two unrelated classes now reads **\"Humanoid cannot be cast to Model due to incompatible classes.\"**",
		],
	},
	{
		version: "0.85.2",
		date: "2026-09-23",
		headline: "The Players nodes say what they hand back.",
		affects: ["editor"],
		fixed: [
			"**Local Player** and **Get Player From Character** hand back a `Player`, and **Local Character** a `Model`, rather than an `Instance` — so a Get Member on them offers UserId, Character, PrimaryPart and the rest.",
		],
	},
	{
		version: "0.85.1",
		date: "2026-09-23",
		headline: "The second half of a Luau parser: the grammar, types included.",
		added: [
			"**A Luau parser** on the lexer: statements, expressions with Luau's own precedence, `::`, if-expressions, interpolated strings, attributes, and the whole type language — unions, optionals, table types with indexers, function types, generics and packs, `typeof`. Every node knows where it is in the source, and a mistake is reported where it is and read past, so one does not hide the next. Nothing uses it yet.",
		],
	},
	{
		version: "0.85.0",
		date: "2026-09-23",
		headline: "The first half of a Luau parser: a lexer.",
		added: [
			"**A Luau lexer** that every later reader of hand-written code will share: every token Luau has — long brackets at any level, interpolated strings with holes, `0b` and `_` numbers, `//=` and `::` — with nothing lost, so the tokens give back the source byte for byte. Nothing uses it yet.",
		],
	},
	{
		version: "0.84.3",
		date: "2026-09-23",
		headline: "A project can leave out casts a subclass already proved.",
		affects: ["editor", "docs"],
		added: [
			"**Casts proved by a subclass**, in Settings → Project: off by default. On, an Implicit Cast inside an Is A branch is left out when the branch proved a class derived from the one it casts to — `IsA(\"Part\")` covering a cast to `BasePart`. Stored in `roswaal.json` as `castsByHierarchy`.",
		],
	},
	{
		version: "0.84.2",
		date: "2026-09-23",
		headline: "Dropping a wire on a narrower class places the Cast.",
		affects: ["editor", "docs"],
		added: [
			"**A wire dropped on a pin that wants a narrower class** — an `Instance` on a `Model` pin — goes in through a new **Cast** to that class, placed between the two. Pins that take a wire this way light up while it is dragged.",
			"**A wire a pin refuses says why**, at the foot of the graph: two unrelated classes, or types no Cast can turn into each other.",
		],
	},
	{
		version: "0.84.1",
		date: "2026-09-23",
		headline: "A result wired into a Declare Local is one local, not two.",
		affects: ["editor", "docs"],
		changed: [
			"**A result read only by a Declare Local, Set Local, Set Variable or table field** is written straight into it — `local named = parent:FindFirstChild(name)` — even with a Result name. The Result name is used once something else reads the value too.",
			"**A step's result folds the same way** when that reader runs straight after it, so the call still runs where it did.",
		],
	},
	{
		version: "0.84.0",
		date: "2026-09-23",
		headline: "A Find First node's class reaches the file.",
		affects: ["editor", "docs"],
		changed: [
			"**Find First Child Of Class, Which Is A, and the two Find First Ancestor nodes** cast their result to the class or `nil` — `(x:FindFirstChildOfClass(\"Humanoid\") :: Humanoid?)` — in Nonstrict and Strict. Default writes no cast.",
		],
		fixed: [
			"A **Class Name wired in** no longer keeps the class last typed into the pin. Wired from a String node, directly or through reroute knots, the output takes that class; from anything else, it is an `Instance`.",
		],
	},
	{
		version: "0.83.2",
		date: "2026-09-23",
		headline: "Notes say what kind they are, and say it briefly.",
		affects: ["docs"],
		changed: [
			"**Notes carry a heading**: Info, Tip, Warning or Danger, with an icon, in a box tinted the theme's colour for that kind.",
			"**Every note on the guide pages is shorter** — about half the words, the claim and what to do about it.",
			"**Drawn panels and Inspectors are centred** in their frames, and the list under them runs flush to the frame's edges.",
		],
		fixed: [
			"Members and fields no longer promises that a Roblox property or another module's type is checked before the file is written — only a type the file declares is.",
			"Casting and annotations no longer says Roswaal does not know Roblox's class hierarchy.",
			"Roswaal types says an optional pin left empty before one that is set is written as `nil`.",
			"Variables and locals says a local cannot be read after its block ends, as well as from a sibling block.",
		],
	},
	{
		version: "0.83.1",
		date: "2026-09-22",
		headline: "The concatenation control, named for what it picks.",
		affects: ["editor"],
		changed: [
			"**Concatenation Type** is what a Concatenate's control is called, and its options are **String Joining: a..b** and **Interpolation: {a} {b}** — each showing the form it writes rather than describing it.",
		],
	},
	{
		version: "0.83.0",
		date: "2026-09-22",
		headline: "Concatenate can write an interpolated string.",
		affects: ["editor", "docs"],
		added: [
			"**Concatenation Type**, in a Concatenate's Inspector: **String Joining** with `..`, or **Interpolation** — a part typed into the node is text, a part wired in is a hole in braces. The same string either way, and both are Luau.",
			"**New concatenate nodes** in Settings decides which one a new Concatenate starts as. Stored on the node, as a pill's brackets are, so the graph reads the same on everybody's machine.",
		],
		changed: [
			"**A plain string literal wired into an interpolated Concatenate is written as text**, rather than as a hole with a constant in it. A backtick or a brace in what you typed is escaped.",
		],
	},
	{
		version: "0.82.3",
		date: "2026-09-22",
		headline: "A field's type is picked, not spelt.",
		affects: ["editor"],
		changed: [
			"**A field of a declared type uses the type picker**, as a variable, a parameter and a cast do: this graph's own types first, then a required module's, then Luau's and Roblox's. It was a text field with a dozen suggestions behind it, which could not offer a type declared four nodes away. Whatever you type is still taken.",
		],
	},
	{
		version: "0.82.2",
		date: "2026-09-22",
		headline: "The drawn Inspector, finished.",
		affects: ["docs"],
		fixed: [
			"**A drawn Inspector's values are boxes**, as the editor's are, its list heading is the small one a list editor has, and it no longer scrolls sideways. A definition too long for the box is cut with an ellipsis where the panel would cut it.",
		],
	},
	{
		version: "0.82.1",
		date: "2026-09-22",
		headline: "Pictures worth the screen they are on.",
		affects: ["docs"],
		fixed: [
			"**A drawn Inspector looks like the Inspector**: the label above its box, a type's fields two across with the button that removes them, and the export tick. It was drawing generic toolbar controls, so a label and its value ran together and each field stacked.",
			"**A drawn graph uses the width a wide screen has.** It was held to the prose measure — 78 characters — which is narrower than any graph worth drawing; it now steps outside the column, centred, and gets the height to match.",
		],
	},
	{
		version: "0.82.0",
		date: "2026-09-22",
		headline: "Two graphs in one frame.",
		affects: ["editor", "docs"],
		added: [
			"**A documentation example can hold several graphs**, a tab each, as the editor holds two open documents. *Members and fields* uses it to show `Tank.Config` and the graph that requires it side by side.",
			"**The Inspector is drawn beside each type example**, since which shape a Declare Type is — rows or typed-out Luau — is decided in the panel and cannot be seen on the canvas.",
		],
		fixed: [
			"**A member pill is as wide as the member it reads.** `.Magnitude` reserved room for a value nobody edits there, so it was half again as wide as its own word whether or not anything was wired in.",
			"**The type examples compile to what is printed under them.** They declared a local and never gave it a value, so the line below read a field off `nil`.",
		],
	},
	{
		version: "0.81.0",
		date: "2026-09-22",
		headline: "A member read looks like one.",
		affects: ["editor", "docs"],
		changed: [
			"**A node whose whole job is reading one member is a pill**, showing the access it writes: **Magnitude** is `.Magnitude`, and so are **Unit**, the Vector2 pair, **CFrame Position**, **Rotation**, **Look**, **Right** and **Up Vector**, and **Tween Completed**. A node that does more than read a member — Distance, which is `(a - b).Magnitude` — is unchanged.",
			"**Members and fields shows the kinds of declaration in tabs**, a small graph each, rather than one picture wide enough to need panning.",
		],
	},
	{
		version: "0.80.1",
		date: "2026-09-22",
		headline: "Members from a module, and Enter that places both nodes.",
		affects: ["editor", "docs"],
		changed: [
			"**Members and fields** says what makes a type's fields knowable — rows, a table written as Luau, and the shapes that have no fixed fields — and adds a worked example of a type a required module exports, where Get Field takes the module's key and Get Member reads the type's field.",
		],
		fixed: [
			"**Pressing Enter on a member entry places both nodes.** Picking `input.throttle` with the mouse placed the getter and the Get Member on it; Enter placed the getter alone.",
		],
	},
	{
		version: "0.80.0",
		date: "2026-09-22",
		headline: "A page about members, and Returns that keep up.",
		affects: ["editor", "docs"],
		added: [
			"**Members and fields**, a documentation page after *Variables and locals*: reading a field off a declared type and off a Roblox instance, each with a graph and the Luau it compiles to, and what to reach for when nothing can promise what a table holds.",
			"**Previous and next links** at the foot of every documentation page, each naming the page it goes to. Above the review line, in the editor's docs window as well as on the website.",
		],
		fixed: [
			"**A Return placed inside a function arrives with that function's returns** as its pins. It used to arrive bare, and the only way to fill it in was to retype the signature.",
			"**Every Return in a function follows its signature**, including one not yet wired into the flow. The sync walked execution wires, so a Return you had placed but not connected kept the pins it was born with.",
		],
	},
];
