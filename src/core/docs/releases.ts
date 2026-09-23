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

/**
 * A part of the tool a release can say it touched.
 *
 * Here rather than beside the other tags in `site.ts` because `site.ts` imports
 * this file and not the other way round — a type-only cycle compiles and is
 * still a cycle to read.
 */
export type ReleaseSurface = "editor" | "designer" | "docs";

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
	 * Slugs of documentation pages marked Reviewed or Verified in this release,
	 * listed under their own headings as links. Slugs rather than titles so a
	 * renamed page cannot leave an entry naming something that is gone; a test
	 * holds each one against `REVIEWS`.
	 */
	reviewed?: string[];
	verified?: string[];
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
	/**
	 * Which surfaces this release touched: the editor, Node Design, the
	 * documentation.
	 *
	 * Stated rather than derived, because no shape of a release note says which
	 * part of the tool changed. Absent means *not stated*, not *not affected* —
	 * releases before 0.39.0 predate the field.
	 *
	 * The point of it is a reader scanning for one thing. Somebody who only
	 * writes graphs does not need to read a Designer release, and somebody
	 * keeping a fork's documentation in step needs exactly the Docs ones.
	 */
	affects?: ReleaseSurface[];
}

/**
 * What this version is about, in one line.
 *
 * The front page's footer used to say "the first public release", which was
 * true once and then quietly stopped being — a hand-written line about a moment
 * cannot describe the version beside it for long. Every release already writes
 * a `headline`, which is the same sentence for the same purpose, so the footer
 * reads that instead of carrying its own copy.
 *
 * Falls back to nothing rather than to a guess: a version with no entry is a
 * build from between releases, and a footer that named the previous release's
 * headline beside this one's number would be worse than a footer that says
 * only the number.
 */
export function taglineFor(version: string): string | undefined {
	return RELEASES.find((release) => release.version === version)?.headline;
}

/** Newest first. */
export const RELEASES: Release[] = [
	{
		version: "0.95.0",
		date: "2026-09-23",
		headline: "The whole engine, from its documentation, credited.",
		added: [
			"**The engine catalogue**: every class with its properties, methods, events and callbacks — types, parameters, security, thread safety, capabilities — every enum and its items, every datatype, and the globals and libraries, read from Roblox's Creator Documentation. `npm run build:engine` refreshes it; it replaces `build:statics`.",
			"**Events and enums in the code editor**: a dot after an instance offers its events with its properties, `Enum.` offers the enums and `Enum.Material.` their items, and hovering any of them describes it with a link to its page.",
		],
		fixed: [
			"**Documentation text Roswaal carries is credited**, and marked as under its own licence rather than 0BSD: summaries from Roblox's Creator Documentation (CC BY 4.0), and parameter descriptions from Lune's type definitions (MPL-2.0). On the Attributions page, in ATTRIBUTIONS.md, in the README and in the generated files.",
		],
	},
	{
		version: "0.94.0",
		date: "2026-09-23",
		headline: "A hover gives a name's type, and methods are known.",
		affects: ["editor"],
		added: [
			"**A hover gives the name and its type** — `INPUT2: string`, `event: (name: string) -> (RemoteEvent)` — with what kind of name it is under it, quieter: local, local function, parameter, method, property, class.",
			"**Methods are known for every class**: hovering `existing:IsA` gives `Object:IsA(className: string) → boolean` with a link to where Roblox documents it, a colon after a local offers its class's methods, inherited ones included, and a method's parameters show while its call is typed.",
			"A local's type comes from its value when none is written: a string, a number, a comparison, a function's signature, and `FindFirstChild` as an `Instance?`. A service reached by its name, `RunService:`, is known as that service.",
			"`npm run build:statics` also fetches each class's own methods.",
		],
	},
	{
		version: "0.93.0",
		date: "2026-09-23",
		headline: "A .luau file shows what its names are, and follows the cursor.",
		affects: ["editor"],
		added: [
			"**Hovering a name** in a `.luau` file — generated or hand-written — says what it is and links to its Roblox docs page, as the code editor does. A file that requires `@lune/` is read as Lune code.",
		],
		fixed: [
			"**The text cursor shows** in a `.luau` file, and the highlighted line follows it with the arrow keys, Page Up/Down and Home/End — not only where the file was clicked. The file stays read-only.",
		],
	},
	{
		version: "0.92.0",
		date: "2026-09-23",
		headline: "The call being typed shows its parameters.",
		affects: ["editor"],
		added: [
			"**Inside a call's brackets, its parameters show above the cursor**, with the one being typed picked out: `Instance.new(className: string, parent: Instance?)`, moving to `parent` after the comma. For a datatype's constructors and functions, and a service's methods on a local the code says holds that service.",
		],
		changed: [
			"**The hover's signature is highlighted** as Luau — the call, its parameter types and what it returns — and set a size larger than the sentence under it.",
		],
	},
	{
		version: "0.91.0",
		date: "2026-09-23",
		headline: "Keys complete in brackets as well as after a dot.",
		affects: ["editor"],
		added: [
			"**A key in brackets completes**: `tbl[\"A` offers the table's keys inside the string, and `tbl[` offers them quoted. Brackets reach every string key — `[\"two words\"]` included — where a dot offers only the ones that are names. A class's properties complete the same way.",
		],
	},
	{
		version: "0.90.1",
		date: "2026-09-23",
		headline: "The hover's signature reads as code.",
		affects: ["editor"],
		changed: [
			"**The hover's signature** is set in the code editor's own face, bold, on a band a shade darker than the text under it.",
			"Its link reads **Part - Roblox Creator Docs**.",
		],
	},
	{
		version: "0.90.0",
		date: "2026-09-23",
		headline: "The code editor says what a name is, and what a local holds.",
		affects: ["editor"],
		added: [
			"**Hovering a name in the code editor** says what it is: `Instance.new(\"Part\")` returns a Part, with a sentence on what a Part is and a link to its Roblox docs page. The same for a class written as a string or a type, a datatype and its constants, a local, and a property read off one.",
			"**A local's members are offered after a dot** when its declaration says what it holds: `local part: Part`, `= Instance.new(\"Part\")`, `= game:GetService(\"Players\")` and `:: Model` offer that class's properties, and a table written out offers its keys.",
			"`npm run build:statics` also fetches a one-line summary of every class and datatype for the hover.",
		],
		fixed: [
			"`local Temp : Part`, with a space before the colon, is read as a type position.",
			"Class names complete from all 625 classes, not the 54 common ones.",
		],
	},
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
	{
		version: "0.79.0",
		date: "2026-09-22",
		headline: "Asking what a value is.",
		affects: ["editor", "docs"],
		added: [
			"**Not Equal to Self**, a pill: `x ~= x`, which is true of NaN and nothing else. Luau has no `isnan`, and a value compared against itself reads as a mistake until you know the trick.",
			"**Type as String** writes the name `typeof` answers — `\"Vector3\"` — picked from a list rather than typed into a String node, where a misspelling is a check that never matches. The list is what `typeof` can answer: Luau's own names, Roblox's datatypes and `Instance`.",
		],
		changed: [
			"**Type Of is a pill**, showing the `typeof` it writes.",
			"**A value a node reads twice is worked out once.** `x ~= x` on a call bound a local and compared it to itself; it used to make the call twice. A name, a number or a field read is still read where it is used.",
		],
	},
	{
		version: "0.78.0",
		date: "2026-09-22",
		headline: "Members where the wire comes from.",
		affects: ["editor", "docs"],
		added: [
			"**Drag a wire out of a typed pin and the node menu offers that type's members**, under their own heading: a Part's properties, a declared type's fields, a required module's type's. Picking one places a **Get Member** already wired to the pin you dragged.",
		],
	},
	{
		version: "0.77.0",
		date: "2026-09-22",
		headline: "Members on one line, and a class that stays a class.",
		affects: ["editor", "docs"],
		added: [
			"**Members are in both node searches.** Type `input.` and every member of what the graph names is there — variables, locals and parameters. Picking one places the getter and a Get Member on it, wired.",
		],
		changed: [
			"**Get Member is one line**: the access it writes, one input, one output. Which member it reads is chosen in the Inspector rather than on the node.",
			"**A node that names a class hands back that class.** New Instance set to `Part` gives a Part, Get Service gives the service's own class, and the Find First Child and Ancestor nodes follow their Class Name. Their members are then in Get Member's list without a Cast first.",
			"**An instance class's pin is an Instance's blue.** A pin typed `Part` was drawn as an untyped `any`, and a wire from it faded on the way into an Instance pin.",
			"**A cast hands back the type it asserts.** `packet :: Input` gives an Input rather than an `any`, so Get Member offers that type's fields straight off the cast.",
			"**A type is found wherever it is declared in the file**, so a Get Member inside a function sees a type declared beside the function.",
		],
		watch: [
			"**A Get Member from 0.76.0 is moved to the new shape** when its graph is opened, and its member is kept.",
			"**A generated annotation names the class**: `local weld: WeldConstraint = Instance.new(\"WeldConstraint\")` where it used to say `Instance`. Recompiling rewrites those lines.",
		],
	},
	{
		version: "0.76.0",
		date: "2026-09-22",
		headline: "Reading the members a type declares.",
		affects: ["editor", "docs"],
		added: [
			"**Get Member** reads a field off a value whose type declares one, as a pill: wire the value in and pick from what its type holds. The result takes that field's type, so a Vector3 field gives a Vector3 pin.",
			"**Its list comes from the type**: a Declare Type in this graph, entered as fields or written as a table; a type a required module exports; or a Roblox class's properties, in a Roblox graph.",
			"**A member this graph's own type does not have is refused** before the file is written, with the type's fields listed.",
		],
		changed: [
			"**Get Field is unchanged** and is still the node for a table whose keys come and go while the program runs.",
		],
	},
	{
		version: "0.75.1",
		date: "2026-09-22",
		headline: "UDim arithmetic drawn as pills.",
		affects: ["editor", "docs"],
		changed: [
			"**UDim +**, **UDim −**, **UDim2 +** and **UDim2 −** are drawn as pills, as the rest of the arithmetic is. They are every operator the engine gives the two: neither takes a unary minus or a multiplication.",
		],
	},
	{
		version: "0.75.0",
		date: "2026-09-22",
		headline: "Arithmetic drawn as pills.",
		affects: ["editor", "designer", "docs"],
		changed: [
			"**Arithmetic is drawn as pills**, as the comparisons and **and** / **or** are: Add, Subtract, Multiply, Divide, Modulo, Power and Negate, the Vector3 and Vector2 operators, **CFrame ×** and **CFrame + Vector3**. Each shows the Luau it writes: `+`, `-`, `*`, `/`, `%`, `^`.",
			"**Brackets**, in the Inspector, and **New logic nodes** in Settings apply to arithmetic pills too.",
		],
		fixed: [
			"**A Cast's type picker lists this graph's own types**, and those a required module exports, as the Inspector's type fields do.",
			"**A pill with one input keeps its width** when a value of another kind is typed on it.",
		],
		watch: [
			"**Arithmetic nodes already in a graph are drawn as pills** from this version, and are narrower than they were. Their wires and the code they write are unchanged.",
		],
	},
	{
		version: "0.74.5",
		date: "2026-09-22",
		headline: "Nodes dragged out of the node picker look like nodes.",
		affects: ["editor"],
		fixed: [
			"**A node dragged out of the node picker is drawn as the node**, above your finger or pointer. On a touch screen it showed the row's text.",
		],
	},
	{
		version: "0.74.4",
		date: "2026-09-22",
		headline: "Comments around a Declare Function in its own graph.",
		affects: ["editor"],
		fixed: [
			"**A comment made around a Declare Function inside its own graph goes around it.** It was placed where the node sits in the graph outside.",
		],
	},
	{
		version: "0.74.3",
		date: "2026-09-22",
		headline: "The node picker by touch, and unknown and never.",
		affects: ["editor", "docs"],
		added: [
			"**Spawn node**, under the node picker's preview, places the node shown.",
			"**Drag a node out of the node picker** onto the graph to place it there. Hold it first on a touch screen.",
			"**unknown** and **never** are in the type picker's Luau types. A pin of either takes any wire.",
		],
		changed: [
			"**On a touch screen, tapping a node in the node picker previews it.** Double tap it, tap **Spawn node** or drag it out to place it. A mouse click still places it.",
			"**The node picker's footer shows touch controls on a touch screen.**",
		],
		fixed: [
			"**A parameter's or a return's type has its padding** in the Inspector.",
			"**Name and type share a parameter row 60/40** as the Inspector is resized. The type stayed 90px wide.",
		],
	},
	{
		version: "0.74.2",
		date: "2026-09-22",
		headline: "Delete locals and functions from the Variables panel.",
		affects: ["editor", "docs"],
		added: [
			"**×** on a local or a function in the Variables panel deletes it, after asking. A function's graph goes with it, as it does from the canvas. Nodes that read it stay, and report an error until repointed or removed.",
		],
	},
	{
		version: "0.74.1",
		date: "2026-09-22",
		headline: "Binding fills its row.",
		affects: ["editor"],
		fixed: [
			"**A variable's Binding, local or const, fills its row** in the Variables panel, as the fields above and below it do.",
		],
	},
	{
		version: "0.74.0",
		date: "2026-09-22",
		headline: "Nodes by other names, and the node picker by touch.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**Nodes have other names in both node searches.** `Define Function` finds Function and Declare Function, `Define Type` finds Declare Type, `Sleep` finds Wait, `Log` finds Print. A node actually called what you typed still comes first.",
			"**Press and hold with two fingers, then lift**, on a tablet or a phone, opens the node picker where you held, as `Ctrl` + right-click does. One finger still opens the node menu.",
		],
		fixed: [
			"**A function dragged from the Variables panel lands on the graph** as a Get Function. The canvas had always refused the drop.",
		],
	},
	{
		version: "0.73.2",
		date: "2026-09-22",
		headline: "Table types, one field to a line.",
		affects: ["editor", "docs"],
		added: [
			"**Declare Type has a Layout setting for Table of Fields**: *Inline*, or *One per line*, as Make Dictionary has. One per line writes each field on its own line with a trailing comma.",
		],
	},
	{
		version: "0.73.1",
		date: "2026-09-18",
		headline: "Steps you can walk through.",
		affects: ["docs"],
		verified: ["getting-started"],
		added: [
			"**Walkthroughs**: steps done on screen, shown one at a time. A drawing of the screen at each step rings the control to press, and the list under it lights the step you are on and marks the ones done. Move with **Back** and **Next**, by tapping a step, or by tapping the ringed control.",
			"**Getting started opens a project as a walkthrough** on each tab: the start page on a computer, the **Project** menu in the web app, and **Open .zip…** on a tablet or a phone.",
		],
	},
	{
		version: "0.73.0",
		date: "2026-09-18",
		headline: "Open a project from a zip.",
		affects: ["editor", "docs"],
		added: [
			"**Project → Open .zip…** in the web app's projects panel opens a project from a zip, in every browser — on an iPad, from the Files app. It replaces the project kept in the browser, after asking, and takes the name of the folder the zip wraps it in. **Download** makes a zip it opens.",
			"**What does not come in is listed.** A zip's `.git`, `node_modules` and the files a Mac or Windows adds are left out, and so is anything that is not text, such as a place file.",
			"**A zip without roswaal.json** can be set up as a project, as a folder can.",
		],
		changed: [
			"**The projects panel's footer is Home, Project, Node Design and Docs.** Open folder, Open .zip, Download and Start again are in the **Project** menu.",
			"**Getting started opens a project in steps** on each tab: `roswaal serve` and the start page on a computer, the projects panel's **Project** menu in the web app, and a zip carried from a computer to a tablet or a phone.",
			"**On a phone, the graph's script type reads Script, Local or Module** on its folded button, so the tools keep one row. The list inside names them in full.",
		],
	},
	{
		version: "0.72.0",
		date: "2026-09-18",
		headline: "A map of the editor and Node Design.",
		affects: ["editor", "docs"],
		verified: ["the-interface", "getting-started", "toolbars"],
		added: [
			"**The Interface**, a new page under Getting started, before Controls. It draws the editor and Node Design as their parts — each numbered, with a line on what it is for — on a computer and, in a second tab, on a phone or a tablet, where the panels slide out and the action row is. Hover or tap a part to light its line. See [The Interface](the-interface).",
			"**Toolbars draws each bar on a computer, a tablet and a phone**, under tabs named as the rest of the documentation names them, with the two bars only a touch screen has — the action row, and Node Design's bar over a node — at the end. A tablet's and a phone's bar is drawn at that screen's width, with every control on it listed.",
			"**Documentation pages open on the tab for your screen** — Desktop, Tablet or Phone — and mark it as this device. A tab you pick is kept for the rest of the visit, on every page.",
			"**Settings → Editor → Action row** draws the action row as separate buttons, as it was, or as one bar like the graph's own tools.",
		],
		fixed: [
			"**Home in the web app's project picker goes to the front page**, rather than back to the editor's start.",
			"**The top bar and the graph's tools keep to one row on an iPad in portrait.** Where they are short of room, Compile project, Straighten and Compile script show only their icons, and the Compile caption goes; each keeps its name as its tooltip.",
			"**The documentation's Roswaal mark lights when the pointer is over it**, and when it is pressed, like every other button in its header.",
			"**Node Design's node tools fold on a phone too.** Details and Save are their icons; the types to drag on, the pin counts, and the node's kind each sit behind a button, and a type still drags from its panel onto the node. Docs in its header is its icon, so Settings keeps the row.",
			"**The compile target reads Lune, with a warning triangle after it**, rather than Lune (experimental); the dropdown lists just the targets.",
			"**The Interface draws a phone as well as a tablet**, each under its own tab.",
			"**Node Design's logic graph shows its Luau when asked**, from a preview button on its tools, as the editor's graph does, rather than beside the graph all the time.",
			"**The graph's tools fit one row on a phone.** The script's type and mode, and the compile target, each sit behind a button that says what is chosen and opens the dropdowns under it.",
			"**The action row's icons have room around them.** Each button is 46 pixels square; the icon sat two pixels from its edge.",
		],
		changed: [
			"**The editor's top bar shows which build it is as the colour of the Roswaal mark**: blue for the browser preview, yellow for the canary, plain for an installed build. The preview chip is gone from the bar, and the version beside the mark steps aside when the bar is short of room; it is in the mark's tooltip either way.",
			"**Node Design, the documentation, the projects panel, the project picker and the front page wear the same colour** on their Roswaal mark, beside the version where there is one. Node Design's preview chip is gone with the editor's.",
			"**Toolbars says Node Design reaches Settings with its gear**, as it does. Neither its Settings nor the documentation window's has a Project tab.",
			"**Getting started opens with the three ways in** — installed on a computer, in a browser on a computer, and on a tablet or a phone — each under its own tab.",
			"**Toolbars says the three windows share one tab on a phone or a tablet**, rather than that none of them replaces the one you are on.",
			"**Toolbars heads the action row and Node Design's touch bar each with its name**, under Only on a touch screen.",
			"**The front page says where Roswaal runs**, locally on a computer or online on a computer, tablet or phone, in two short lines under its buttons, with Roblox marked stable beside Lune's experimental.",
		],
	},
	{
		version: "0.71.0",
		date: "2026-09-18",
		headline: "Trackpads, touch screens and phones.",
		affects: ["editor", "docs"],
		added: [
			"**Two fingers on a trackpad pan the graph on a Mac or an iPad**, and pinching zooms, in Safari as well as Chrome. Scrolling still zooms elsewhere; **Settings → Editor → Scrolling the graph** picks Pan or Zoom on any machine.",
			"**The graph works by touch.** One finger pans, two pinch and pan, and a tap on empty space clears the selection. Press and hold empty space, then drag, to draw a marquee; lift instead for the node menu. A long press opens the menu a right-click would, and a double tap is a double-click — opening a graph from the tree, adding a reroute knot. Both work everywhere in the editor, and with an Apple Pencil. See [Controls](controls).",
			"**Drag by touch.** Press and hold a variable, a local, a file or a tab until it lifts, then drag it — onto the graph, into a folder — as with a mouse. Held and lifted without moving, it opens its menu instead. The drawer it came from slides away as the drag starts.",
			"**Undo, Redo, Align, Copy, Cut, Duplicate, Delete and Paste are buttons under the graph** on a phone or a tablet — Undo and Redo always, the rest while there is something for them to act on. Node Design's logic graph has the same bar. They are icons, or words with **Settings → Editor → Action buttons**.",
			"**Node Design shows the node or its logic, not both, on a phone or a tablet**, switched with Preview and Logic in the bar above it, which also holds Luau and Nodes. The logic graph gets the whole editor, with the Luau it compiles to beneath it.",
			"**Graphs drawn in the documentation move the way the canvas does**: scrolling pans or zooms as Settings says, pinching zooms on a trackpad or with two fingers, and a double tap fits the graph back in its frame.",
			"**Node Design follows Scrolling the graph too**, and on a phone or a tablet its node list slides over the node editor from a bar above it.",
			"**On a phone or a tablet, the panels slide over the graph.** Project, Variables and Inspector each have a button under it and come out one at a time, with the whole height to themselves; opening a graph from the tree puts the tree away again.",
			"**The documentation reads on a phone or a tablet**: the contents slide out from a Contents button in the header, and the page takes the width. Tap beside them to put them away. The search button beside it opens the search Ctrl+K does.",
		],
		changed: [
			"**The mark on a documentation page opens your projects** — the editor with its projects panel up — rather than the documentation's front page, which is the first entry in the contents.",
			"**The Controls page has a tab each for Desktop and Mobile (Webapp)**, in place of the one Keyboard table. See [Controls](controls).",
			"**Settings stacks on a narrow screen**: the sections run along the top and each control sits under its label.",
		],
		fixed: [
			"**The documentation's outline no longer squeezes the page below 1100px wide.** It was meant to hide there and did not, so on an iPad or a phone in landscape it wrapped under the contents and both halved in height.",
			"**A tapped button no longer stays grey on an iPad or an iPhone.** Safari kept the last button tapped in its hover state — the Variables button, after its drawer was closed by tapping the graph.",
			"**A node map's project file keeps its height** when the Inspector beside it scrolls. On a shorter screen it was squeezed to a single line.",
			"**The arrows above an iPad's keyboard stay in the documentation's search.** They moved the cursor to a field behind it, out of sight, with the keyboard still up.",
			"**Node Design, the editor and the documentation open in the same tab on an iPad or an iPhone**, and the back button returns. The second time Node Design was opened it loaded in a tab of its own that Safari did not bring forward, so the button seemed to do nothing. Edits waiting to be saved are written first, and Node Design asks before leaving a node with unsaved changes. On a computer each still has its own tab.",
			"**The project tree scrolls within its own panel**, so a long tree no longer runs down over the Variables panel beneath it.",
			"**A wire dragged by touch lands on the pin it is dropped on.** It reported the drop to the pin it started from.",
			"**Tapping a control in a toolbar, Variables or node map picture no longer flickers.** The tap lit the new one, went back to the old one, then lit the new one again.",
			"**The docks keep their sizes after a phone is turned round.** Squeezed to fit a narrow screen, they stayed squeezed when it widened.",
			"**Focusing a field on an iPhone no longer zooms the whole editor or documentation page in.**",
			"**Dropdowns look the same in every browser**, and the same as the pictures of them in the docs. In Safari on a Mac they were the system's own control, a different height from the buttons beside them.",
			"**A documentation page could lay out with its contents in the reading column** after an update, until the browser's copy of the stylesheet expired. Each build's pages now name the exact stylesheet and script they were built with.",
		],
	},
	{
		version: "0.70.1",
		date: "2026-09-16",
		headline: "The guides split into four, and a pill fits what is on it.",
		affects: ["editor", "docs"],
		added: [
			"**A demo graph shows what it declares, beside it.** The Variables panel — the real widget, given the graph’s own modules rather than example rows — sits to the left of each picture on [Lune demos](lune-demos). A drawn graph shows `fs.readFile` and not where `fs` came from, and where it came from is the rule the whole library rests on.",
		],
		changed: [
			"**The demos are drawn as they were arranged.** The placement rule that builds them gets every node into a sensible column and leaves wires crossing; the layout is authored in the editor now and folded back, so the page draws the arrangement somebody actually made.",
			"**The guides are four shelves rather than one list of sixteen** — Writing graphs, For Roblox, For Lune, The tool. Three of the sixteen titles began “Compiling and nodemaps”, and a list that long is one you read line by line looking for a word. Somebody who only has Lune now finds their four pages together.",
		],
		fixed: [
			"**A loose Look At node has been taken out of the demo’s Main graph.** It was wired to nothing and had been sitting there since 0.18.x. Recompiling the demo also refreshed generated files that predated comment headers, so the one above the player-joined handler is in the file now.",
			"**A folder opened from your machine appears on the recent list by name**, rather than as the mount point it was given. A browser is never told where a picked folder is — only its own name — so the path on that list meant nothing next session and the card it drew could not be opened.",
			"**A project on the recent list that will not open is said so on its own card**, with a cross to take it off. The list is roots from previous sessions and a root can stop being one between them — deleted, renamed, on a drive that is not plugged in, or thrown away with the browser’s volume. It used to close the panel over a dialog saying only what went wrong, leaving nothing to do about it.",
			"**The folder picker opens in front of the browser, not behind it.** Its owner window was constructed and never shown, so there was nothing for Windows to raise and the dialog appeared behind whatever had focus — which is the browser, every time, because the click that asked for it happened there. Clicking Browse again now waits for that dialog instead of refusing: somebody pressing it twice cannot see the first one, and being told a picker is already open reads as the button being broken.",
			"**More than one folder is remembered**, and each is offered by name. The browser build kept a single handle, so working across two real projects made the older one unreachable — you had to find it in the picker again, which is what remembering it was for.",
			"**A folder with nothing in it no longer disappears on reload.** The browser build stored the project as files keyed by path, and a directory somebody had made and not put anything in yet is not implied by any of them — so it came back as nothing, and whatever remembered where it was said “Not a directory”. Directories are stored alongside the files now, and a project stored before this reads exactly as it did.",
			"**A dialog raised while the panel was open rendered behind it** — invisible, modal, and holding the focus. The panel now sits under anything that speaks.",
			"**An operator’s value field no longer hangs off the side of it.** A pill’s width came from its pins’ defaults while what is drawn on a row comes from the pin’s default *or the value on that node*. For most of them the two agree by accident; `compare.eq` takes `any` with no default, so it was measured with no room for a field and then drawn with one.",
		],
		watch: [
			"The width still does not change when a wire lands, which is what the old rule was protecting: a value stays on the node, so the field stops being drawn and the column simply stays empty.",
		],
	},
	{
		version: "0.70.0",
		date: "2026-09-16",
		headline: "The Roswaal mark opens the way in, from any window.",
		affects: ["editor", "docs"],
		added: [
			"**An introduction panel on the Roswaal mark**, in the editor, Node Design and the documentation alike. The projects you were in, the projects that shipped, and the way to the other two windows — one panel, because the question somebody has when they reach for the mark is the same one in all three.",
			"**The demos are offered by name, with the runtime they compile for.** A Roblox demo and a Lune one, each with its chip, so arriving at Lune support no longer means opening a Roblox project and being told the rest transfers.",
			"**A Lune project to open**, at `examples/lune-demo`: the four programmes from [Lune demos](lune-demos), generated from the same graphs the page draws.",
		],
		changed: [
			"**The editor's project menu is gone**, and what it did is in the panel. It was the only surface where the mark did anything, and what it did was not what the other two needed.",
			"Which projects you have opened before is now read by all three windows rather than by the editor alone.",
		],
		fixed: [
			"**A demo is taken as a copy, not opened where it lies.** The demos ship beside the tool, so opening one put the editor straight onto the files every other user of that install would get — and in a checkout, editing one turned up as a change to Roswaal rather than as somebody’s own work. A card copies it somewhere of your choosing and opens that; a second copy is `lune-demo-2` rather than an overwrite.",
			"The panel’s recent shelf kept its gutter until it was scrolled, and then lost it. A snap aligns a card to the scrollport rather than to the padding, so the first card slid flush against the edge while the shelf below it, still at zero, kept its sixteen pixels.",
			"Showing the shelf’s scrollbar on hover changed the scrollport’s height, so the cards shifted as the pointer arrived and back again as it left.",
			"The wordmark lost its weight when the mark became a button: `font: inherit` resets more than the family.",
			"**Four graphs the documentation builds shared one id**, which was invisible while they were pictures and destructive as a project: the compiler keys generated files by graph id, so each compile deleted the file before it. All four wrote and one survived.",
		],
		watch: [
			"The panel asks the host which demos it has rather than assuming. A daemon has them on disk beside itself; an install that packed the CLI without the examples has none, and the panel then offers none rather than paths that are not there.",
		],
	},
	{
		version: "0.69.0",
		date: "2026-09-16",
		headline: "Four Lune programmes, drawn and compiled.",
		affects: ["docs"],
		added: [
			"**Four small Lune programmes**, at [Lune demos](lune-demos): read a file, fetch JSON and read a field, walk a directory, take a command-line argument. Each one is a graph, drawn, with the Luau it compiles to underneath it.",
			"They are compiled rather than transcribed: the file shown is what the emitter writes from the graph above it, so the picture and the code cannot describe different programmes and a demo that stopped compiling fails the build.",
		],
		watch: [
			"**The process arguments have no node of their own.** `process.args` is a property of the module rather than a function, and the catalogue Roswaal reads from Lune's typedefs holds functions and classes. The command-line demo reaches it with a Luau Expression through the local the module bound, which works and is what the page shows.",
			"**Reading a field off one of Lune's named types warns.** Roswaal knows the pin is a `FetchResponse`, because Lune's signature says so, and reads the library's type names without their shapes — so it cannot tell that one is a table. The wire is right and the file runs; the demo shows it rather than avoiding it.",
		],
	},
	{
		version: "0.68.0",
		date: "2026-09-16",
		headline: "The map pages open with the map editor, working.",
		affects: ["docs"],
		added: [
			"**The map editor itself, at the top of both map pages.** Not a picture of it — the real panel, with the tree, the Inspector and the project file where the editor puts them. Select a row and the Inspector fills with that instance's fields while the project file scrolls to the lines that row writes.",
			"**Every part of the panel is named beside it**, and pointing at a name lights the control while everything else steps back. The same device the toolbar figures use, for the same reason: chrome is unreadable on the first day, and counting down a column to match a name is not reading.",
			"A row lights **its own** lines and not its children's. What the figure answers is *what did this row do*, and a row that appeared to produce its children's output would be one you expect to delete without losing them.",
		],
		changed: [
			"**Both map pages now say which target they are about in their first line**, and each carries the whole of compiling for that target. [Compiling and nodemaps for Lune](compiling-for-lune) no longer sends a Lune developer to the Roblox page for the half that happens to be shared — what triggers a compile, what the generated header is for, what `prune` does.",
			"[Compiling and nodemaps for Roblox](building-and-rojo) drops its Lune asides and says what each script kind becomes in Studio, which is the question the file ending was standing in for.",
			"The figure is **wider than the page's reading measure**. A tree, an Inspector and a project file do not fit in the width that suits a sentence.",
			"Both pages open with a **Nodemap basics** section, which is the panel and its legend. The Roblox page's later section is **Building a node map**, because two sections called some arrangement of the same two words is not an outline.",
		],
		fixed: [
			"The article's typography was reaching inside drawn panels, so the Inspector's section headings came out at body size and their hints came out as paragraphs — which between them ate most of the height the figure had.",
			"A figure's caption was being laid out as a column of the figure rather than underneath it.",
			"**Reading the panel no longer dims the panel.** Hovering a row to watch its lines light was dimming the project file those lines are in. The tree and the output light when asked about, but only their headers — the map's bar, and *Project file* — ask; being inside one is reading it, not pointing at it.",
			"The highlight ring was being painted underneath the tree's own header bar and under the next field along, so it looked clipped or missing. It is drawn over the top now.",
		],
		watch: [
			"The buttons in the drawn panel are dimmed because they do nothing: there is no project behind the figure to add a folder to. The fields are live — they follow the selected row — so they are not dimmed.",
			"The project file in the figure is printed from the map by the same rules the compiler uses, and the two are checked against each other for every map the documentation draws. A page cannot show a project file Roswaal would not write.",
		],
	},
	{
		version: "0.67.4",
		date: "2026-09-16",
		headline: "The grid stops being drawn over the graph.",
		affects: ["editor", "docs"],
		fixed: [
			"**The canvas grid was painted on top of every node**, in the graph editor and in Node Design's logic canvas. The layer everything in the graph is drawn inside carried no stacking order of its own, and an element without one sits below every neighbour that has one — which the grid and the graph's name both do. At 5% to 14% alpha it read as texture rather than as a mistake, and it had been there since the first version. Node previews were never affected.",
			"**The confirm button on a delete no longer prints its text in its own colour.** The filled destructive button took its fill from one rule and its text from another, and both resolved to the same red: the word *Delete* was still in the button, in exactly the colour of the button. Reaching for it also turned it accent-blue, because the hover rule outranked the one giving it a red fill.",
		],
		watch: [
			"The documentation has two renderers — one writes the published site, the other draws the same pages in the editor — and a change reaching only one of them has now shipped twice. They are checked against each other on every run.",
		],
	},
	{
		version: "0.67.3",
		date: "2026-09-16",
		headline: "Vector3 works in Lune, and says what it needs.",
		affects: ["editor", "docs"],
		added: [
			"**Roblox's datatypes are offered to a Lune graph** — 101 of the 108 Engine Types nodes, which is every one `@lune/roblox` implements. A datatype is not the engine: `Vector3` is a table with a `new` on it, and hiding the node hid something that works.",
			"**A datatype node says what it needs, and the Inspector gives it.** One press declares `@lune/roblox` and pulls the datatype off it, which are the two things that have to be true.",
			"**A page about compiling for Lune**, at [Compiling and nodemaps for Lune](compiling-for-lune): what a filesystem map is for, what it checks, and where a Lune program's dependencies come from.",
		],
		changed: [
			"**Building, and node maps** is now [Compiling and nodemaps for Roblox](building-and-rojo) — it was only unambiguous while there was one runtime. Its address has not moved.",
			"**A borrowed datatype carries two tags**, not one averaged one: `Roblox`, because it is Roblox's, and `@lune/roblox`, because that is the require Lune needs for it. A single `Luau` tag said the base language has `Vector3`, and it does not. The second tag is the specifier itself — it is what has to be declared, and the text that declares it. In the node menu the tag is the one the graph you are in needs.",
		],
		fixed: [
			"**A Roblox datatype in a Lune graph no longer compiles to something that fails at run time.** It wrote `Vector3.new(...)` with no require, and in Lune that indexes nil. It is an error now, naming the module and the member that fix it.",
		],
		watch: [
			"`TweenInfo` and `Tween` stay out of a Lune graph. Lune does not implement them, and the list is read from the module's own source rather than kept by hand.",
		],
	},
	{
		version: "0.67.0",
		date: "2026-09-16",
		headline: "A map can describe a filesystem.",
		affects: ["editor"],
		added: [
			"**A map says which runtime it describes.** A DataModel map is what one has always been: services, and a `default.project.json` for Rojo. A **filesystem map** is directories and files, which is what a Lune program actually has. A new map starts as the kind the project needs.",
			"**A filesystem map is checked against Luau's own require rules.** A file beside a directory of the same name is an error, because `require(\"./foo\")` cannot mean both `foo.luau` and `foo/init.luau` and the language refuses an ambiguous path rather than picking one. Two files differing only by extension are the same collision one step along.",
			"**A file's name carries no extension.** Typing one is a warning saying so, and what to call it instead — the extension follows from the node being a file, and writing it into the name is how you get `main.luau.luau`.",
		],
		changed: [
			"A filesystem map writes **no project file**. Rojo's answers a question a Lune program does not ask, so what compiling one does is check that the layout holds together — the part Rojo was doing incidentally, and the only part that transfers.",
			"Every map written before this is a DataModel map and stays one without being touched.",
		],
		fixed: [
			"A stylesheet check was reading a glob in a placeholder as the start of a comment, and swallowing the markup after it — so it could report a live rule as dead. It reads string literals as strings now.",
		],
	},
	{
		version: "0.66.2",
		date: "2026-09-16",
		headline: "Aliases suggest themselves, and Roblox types tell the truth in Lune.",
		affects: ["editor"],
		added: [
			"**A specifier field offers what the project defines.** Every alias a `.luaurc` above the graph declares, then the runtime's own prefixes — `@lune/*` for a Lune graph, `@self/` and `@game/` for a Roblox one — then `./` and `../`. A suggestion rather than a gate: anything else is still typed, because the set of things a require can name is still moving.",
			"Which aliases are offered depends on **where the graph is**, since a `.luaurc` in `src/ui` defines aliases for `src/ui` and below. It asks the same function the compiler resolves by, so a field cannot offer a name the compiler would then refuse.",
		],
		fixed: [
			"**A Lune graph is no longer offered Roblox datatypes** `@lune/roblox` **cannot make.** The module implements 27 of them and `TweenInfo` is not one, so offering the whole group was offering a constructor the runtime has not got. The list is read from the module's own source rather than assumed from the Roblox side.",
		],
	},
	{
		version: "0.66.1",
		date: "2026-09-16",
		headline: "A node says when it needs attention.",
		affects: ["editor"],
		added: [
			"**A yellow mark in a node's corner** when something about it needs looking at — a Lune call whose module nothing requires, where the Inspector has the button that fixes it. The corner the error count already uses, and never both at once: an error is the more urgent of the two and says how many.",
			"**An unwired Lune call says so too.** The compiler refuses an undeclared module, but only for a node it reaches — so one dropped on the canvas and not yet wired said nothing, while the Inspector was already saying it.",
		],
		watch: [
			"A warning marks the node only when it is **about the node**. Most are about where a node sits — \"not connected to anything that runs\" is true of every node the moment you drop it — and marking those would put a pip on each one while you were still building the graph.",
		],
	},
	{
		version: "0.66.0",
		date: "2026-09-16",
		headline: "Lune's standard library, callable.",
		affects: ["editor", "docs"],
		added: [
			"**Files, networking, processes and the rest.** All 61 functions of Lune's standard library, as two nodes: `Lune Function` for a call that does something, `Lune Function (Value)` for one that answers something. The palette lists every function by name — type `readFile` and what you get is a node already set to `fs.readFile`, with its arguments named and typed from Lune's own signature.",
			"**A page about it**, at [Lune's standard library](lune-library): what is in each module, how arguments and results are typed, and which Lune the signatures come from.",
			"**The Inspector offers the require.** A call whose module is not declared says so and gives you a button that declares it — said and offered, never done.",
		],
		changed: [
			"**The type picker knows which runtime it is picking for.** A Lune graph is offered Lune's own types — `DateTime`, `Regex`, `WebSocket` — instead of Roblox's datatypes and Instance classes. Roblox's come back the moment the graph requires `@lune/roblox`, because that module genuinely provides them and a require you wrote is the only thing that should make them appear.",
			"`buffer`, `thread` and `nil` are offered as types in both runtimes. All three are Luau's and none was on a list written by hand.",
			"**The Roblox categories say Roblox again**, rather than `Engine` and `Engine Types`. Unambiguous was easy while there was one engine; a graph compiles for one of two runtimes now. Roblox Corporation owns the name and Roswaal claims no rights in it — see [Attributions](attributions).",
		],
		watch: [
			"**A Lune Function node never writes its own require.** `@lune/fs` is Lune's own and always available, which is the strongest case there is for an exception, and it is still not one: a file that quietly gained a require because you dropped a node is a file whose dependencies are not what its author can see.",
			"Signatures come from Lune 0.10.5, read out of the type definitions that ship with it. Moving to a new Lune is one command and the diff is the API change.",
		],
	},
	{
		version: "0.65.3",
		date: "2026-09-16",
		headline: "Realign no longer stacks a fan-out's arms.",
		affects: ["editor", "docs"],
		fixed: [
			"**Realign put a Branch's two arms on top of each other.** It aligns a node onto the pin that feeds it, which is right for a chain and wrong for a fan-out: two execution pins are one pin row apart and a node is at least 64px tall. The topmost arm keeps its straight wire now and the rest move down to clear it.",
			"**Six drawn graphs had a pair of nodes in the same place** for that reason — Branch, Sequence, Continue, and the scenes under [Wires and pins](wires-and-pins), [Variables and locals](variables-and-locals) and [Services and their methods](services), where the two Prints overlapped exactly and read as one node.",
		],
		changed: [
			"**Verified**: [Services and their methods](services).",
		],
	},
	{
		version: "0.65.2",
		date: "2026-09-16",
		headline: "Aliases is Reviewed, and asking for a Lune developer.",
		affects: ["docs"],
		changed: [
			"**Reviewed**: [Aliases and .luaurc](aliases). Read against the RFC and against the editor — which is not the same as a project that resolves its requires through an alias map every day, so the page says what it still wants checked and [Contributing](contributing) asks for it too.",
		],
	},
	{
		version: "0.65.1",
		date: "2026-09-16",
		headline: "Backticks that were printing themselves.",
		affects: ["docs"],
		fixed: [
			"**Code written inside bold or italics rendered as its own backticks** rather than as code. 48 strings across the guides and these notes had it — `.luaurc` on the new Aliases page, and others that shipped long before it.",
		],
		changed: [
			"Where a term inside an emphasised phrase needs monospace, the emphasis is now **split around it** rather than one of the two being dropped. Inside a quotation the backticks go instead: a word in somebody else's sentence is not ours to restyle.",
		],
	},
	{
		version: "0.65.0",
		date: "2026-09-16",
		headline: "Roswaal reads your `.luaurc`, and lets you write one.",
		affects: ["editor", "docs"],
		added: [
			"**A** `.luaurc` **is a file in the project tree**, under Graph content beside your graphs — Roswaal reads it rather than writing it. Double-click one to open the alias editor: what that file defines, where each alias lands once its chain is followed, and underneath, what it inherits from the files above it.",
			"**Aliases are checked against the project.** A specifier naming an alias no `.luaurc` defines is an error where the project uses alias maps, and a warning where it has none at all — the second may be generating one at build time, and refusing to compile that would be refusing a project that builds.",
			"**A page about all of it**, at [Aliases and .luaurc](aliases): where the file goes, what a nearer one inherits from its parents, where a relative path lands, chains and cycles, and what each runtime resolves.",
		],
		changed: [
			"An alias map is resolved the way [the RFC](https://rfcs.luau.org/require-by-string-aliases.html) specifies, checked against it rather than remembered. A nearer `.luaurc` **inherits** what it does not say instead of replacing the map, and a relative path resolves against the file that **defined** it rather than the file requiring — both of which look correct in any project with one `.luaurc` at the root.",
			"Names are case-insensitive, so `@Roact` and `@roact` are one alias. Defining both in one file is reported rather than written.",
			"A chain of aliases is followed, and a ring is reported as the ring it walked — `a → b → c → a` rather than \"cycle detected\".",
			"Editing a `.luaurc` **splices its aliases** and leaves the rest of the file exactly as it was. A file with comments inside its `aliases` is refused with the reason instead of rewritten: an edit reorders the entries, and a note about why a package is vendored cannot survive that.",
			"Roblox's position on aliases is now linked rather than only quoted, so the claim can be checked instead of taken on trust.",
		],
		watch: [
			"**Roblox does not resolve aliases yet**, so a `.luaurc` in a Roblox project is a file Rojo will sync and the engine will ignore. Roswaal warns rather than refusing — that is code written against something that is coming, not code that is wrong.",
		],
	},
	{
		version: "0.64.8",
		date: "2026-09-16",
		headline: "The published pages get the palette and a gear of their own.",
		affects: ["docs"],
		added: [
			"`Ctrl` **+** `K` **opens the search palette on the published site**, the way it does in the editor and in Node Design. It used to put the cursor in the sidebar's field instead. That field is still there and still filters the tree.",
			"**Settings on a published page**, from the gear at the end of the header: your theme and the face these pages are set in. The icon alone rather than a labelled button — a page gives its width to what you came to read.",
		],
		changed: [
			"**Verified**: the [Functions](functions) guide, rewritten in 0.64.2 and read against the editor.",
			"The drawn bars on [Toolbars](toolbars) show the gear Node Design and the published pages gained, and say why it is a gear on those and a button in the documentation window.",
			"The site's palette takes the sidebar's index and the sidebar's ranking rather than a second copy of either, so the two searches cannot disagree about the best answer.",
		],
	},
	{
		version: "0.64.7",
		date: "2026-09-16",
		headline: "Settings in Node Design, and no more flash of the wrong scheme.",
		affects: ["editor", "docs"],
		added: [
			"**Settings in Node Design**, from the gear beside Open Editor. The same panel the docs window opens, without the Project tab — `roswaal.json` describes a project and stays the editor's to change. It is where node corners and wire style live, which is the window that draws nodes all day.",
		],
		fixed: [
			"**The app no longer opens in the wrong colours.** A module script runs after the page is parsed, so the stylesheet painted first and the scheme you picked arrived a frame later — a flash on every load, worst when your scheme disagrees with your operating system, which is the whole reason for picking one. The scheme is now applied before the first paint. Measured on the built site: ready 38ms before the page painted.",
			"**The Not Found page takes your theme.** It kept the colours it was written with, and now uses them only as the fallback for a reader whose stylesheet did not arrive.",
		],
	},
	{
		version: "0.64.6",
		date: "2026-09-16",
		headline: "The landing page follows your scheme too.",
		affects: ["docs"],
		fixed: [
			"**The site's front page takes your theme.** It is drawn from the same tokens everything else is, so it was one page away from the fix that reached the documentation — and it is the first page anyone sees.",
		],
	},
	{
		version: "0.64.5",
		date: "2026-09-16",
		headline: "Your colour scheme reaches every window, and the documentation site.",
		affects: ["editor", "docs"],
		fixed: [
			"**The published documentation follows your theme.** It shipped the editor's stylesheet and nothing else, so it followed the operating system — a scheme picked in the editor stopped at the Docs button. It now reads the same preference the editor writes, before the page paints, along with your node corners and reading face.",
			"**Node Design follows a theme picked in the editor.** It took the scheme it opened in and kept it, because it has no settings panel of its own and nothing was telling it.",
			"**The editor follows a theme picked in the docs window.** The docs have their own settings panel, and the editor was the one window not listening.",
		],
		changed: [
			"The three windows share one listener rather than a copy each. A theme is stored in `localStorage`, which is exactly so that every window on the origin — including the static site — can be told when it moves.",
		],
		watch: [
			"A node picture on the site follows your scheme too. It is drawn with the same tokens the canvas uses — `var(--node-body)` and the rest — so only a node's **category colour** and its **pin type colours** stay put, and those are fixed in every theme by design, in the editor as much as here.",
		],
	},
	{
		version: "0.64.4",
		date: "2026-09-16",
		headline: "A gesture reads as one input, and a migration nobody can have needed is gone.",
		affects: ["docs"],
		changed: [
			"`Ctrl` **+** `right-click` on [Functions](functions) marks the whole gesture, rather than highlighting the key and leaving the click as prose.",
		],
		fixed: [
			"The **Functions** guide no longer explains what happens to a graph made before 0.33.0. Roswaal has been public since 0.59.1, so no reader has one.",
		],
	},
	{
		version: "0.64.3",
		date: "2026-09-16",
		headline: "A drawn panel holds something, and says which part the page is about.",
		affects: ["docs"],
		added: [
			"**Every section of the drawn Variables panel has rows in it** — two variables, two modules, two locals and two functions, with the `const` badge, a module's specifier and a function's `hoisted` or `here` all shown. A section drawn empty said the section held nothing.",
			"**The section a page is about keeps the light, and the rest dim** — a scrim with a cutout. [Modules](modules) lights Modules, [Functions](functions) lights Functions, and [Variables and locals](variables-and-locals) lights both of its own.",
		],
		changed: [
			"Hovering a dimmed section's explanation lights that section in the picture, scrim and all. A highlight that leaves the thing it points at unreadable is pointing at nothing.",
		],
	},
	{
		version: "0.64.2",
		date: "2026-09-16",
		headline: "The Functions guide, caught up with the editor.",
		affects: ["docs"],
		added: [
			"**How to call one**, which the page never said: Get Function for the value, Call Function for a call that does something, Call For Value for a call that asks something — and why a Get Function above a Declare Function is an error where a hoisted Function has no order to get wrong.",
			"**The signature**: what the Name, Parameters and Return values fields do, that a type there is free text, and what renaming, reordering and removing a parameter each do to the nodes reading it.",
			"**Returning**, with the Return node drawn. Return values configured on the function become named, typed pins on every Return in it.",
			"**Reading a parameter**, with Get Parameter drawn, the `Get ‹parameter›` search entry, and where a parameter is offered.",
			"**Finding one**: the Variables panel, the *This graph* filter in the node menu, and the node picker on `Ctrl` + right-click.",
			"**Previewing the function you are in** with `P`, rather than the whole script.",
			"**The Variables panel is drawn on the Functions page**, with functions explained there and the other sections pointing at their own pages.",
		],
		changed: [
			"**Which locals a function can see** now says which declaration it is talking about: a Declare Function closes over the file's locals, and a hoisted Function is written above them and cannot.",
			"The **Functions** section of the drawn panel points at [Functions](functions) from the pages that are not about functions, the way Modules and Variables already did.",
		],
	},
	{
		version: "0.64.1",
		date: "2026-09-16",
		headline: "A drawn panel's headings, and each section explained where it belongs.",
		affects: ["docs"],
		added: [
			"**The Variables panel is drawn on its own page too**, at [Variables and locals](variables-and-locals), with variables, locals and functions explained in full there.",
		],
		changed: [
			"A section of the drawn panel is explained on the page that is about it, and points there from the others. [Modules](modules) explains modules and links out for the rest; [Variables and locals](variables-and-locals) does the reverse. Same drawing, different words.",
		],
		fixed: [
			"The **Modules**, **Locals** and **Functions** headings in a drawn panel took the article's heading style instead of the editor's, so they came out large and dark where the panel shows small grey caps.",
		],
	},
	{
		version: "0.64.0",
		date: "2026-09-16",
		headline: "Modules, documented — and panels can be drawn now.",
		affects: ["docs"],
		added: [
			"**A page about requiring**, at [Modules](modules): how to declare one, what each runtime resolves, why the name is yours to choose, and what `@lune/roblox` members make possible. Requiring is the one subject where Roblox and Lune genuinely differ, and there was nowhere to look.",
			"**A table of what resolves where** — `./` and `../` anywhere, `@self/` and `@game/` under Roblox, `@lune/*` under Lune, and `.luaurc` aliases under Lune with Roblox still to come.",
			"**The Variables panel is drawn**, the way the toolbars are: hover a section to light its explanation, and hover an explanation to light the section.",
		],
		changed: [
			"The machinery behind a drawn toolbar now draws a **panel** too. It was never about bars — a spec, the editor's own class names, a legend from the same spec, and the pointing between them. One more shape rather than a second copy, so the pointing, the layout traps and the fixes that took three attempts are paid for once.",
			"A drawn row takes its swatch from the palette the canvas uses, so a `number` in a picture is the `number` on your screen. Without a palette it falls back to the ring a module gets, rather than inventing a colour.",
		],
	},
	{
		version: "0.63.0",
		date: "2026-09-16",
		headline: "A script says which modules it requires.",
		affects: ["editor"],
		added: [
			"**Modules are declared, in the Variables panel.** A name, what to require, and optionally what to pull off it. The generated file gets one `require` per declaration, at the top and below the GetService calls — so four uses of one module write one `require`.",
			"**Get Module**, the pill for a declared module. Drag one out of the panel, the way you drag a variable. It reads the local the require was bound to rather than requiring again.",
			"**Require at Top**, for declaring one on the canvas instead. It takes the specifier verbatim, so it works for both runtimes and for forms neither has shipped yet.",
			"**Members**: names pulled off a module into locals of their own. Lune's own idiom — `local roblox = require(\"@lune/roblox\")` and then `local Vector3 = roblox.Vector3` — and what lets the Vector3 and CFrame nodes compile unchanged in a Lune graph.",
			"**Specifiers are checked against the runtime you compile for.** `@self/` and `@game/` are Roblox's; `@lune/*` is Lune's; `./` and `../` work anywhere; and an unprefixed path is refused, because that is now an error in Luau itself rather than a fallback.",
		],
		changed: [
			"**The name a module binds to is yours.** Two modules can genuinely want to be called `util`, so the name is chosen rather than derived — and a name you choose is taken exactly, never quietly turned into `util2`. Two declarations wanting one name is an error naming both, since only you can pick which one renames.",
			"A name that shadows something Luau provides is a warning rather than a refusal. Binding `Vector3` is the whole point of the `@lune/roblox` case; naming a module `table` is probably not what you meant.",
		],
		watch: [
			"**A declaration is the only thing that writes a** `require`. Nothing is inferred and nothing is hoisted behind you: if the file imports something, it is because the panel or the canvas says so. That is deliberate, and it is why the datatype nodes will never quietly add an import of their own.",
			"A `.luaurc` alias in a Roblox graph is a warning, not an error. Roblox says alias maps are coming; they do not resolve today.",
			"Deleting a module leaves the pills that read it in place, reporting an error. The same as deleting a variable, and for the same reason: an error you can see beats nodes disappearing.",
		],
	},
	{
		version: "0.62.6",
		date: "2026-09-16",
		headline: "A node's page is tagged with the runtime it needs.",
		affects: ["docs"],
		added: [
			"**Every node page carries its runtime as a tag beside the title** — the same word and the same colour the node menu puts on a row, so a badge in the editor and a badge in the documentation are one vocabulary rather than two.",
			"**Base Luau is tagged too**, which is where the documentation differs from the menu. A list is scanned, so an absence reads; a page is arrived at one at a time, and a page that says nothing has not answered.",
		],
		changed: [
			"The line under the title says what the runtime *means* rather than naming it again — *needs the Roblox engine, its datatypes, its DataModel or its scheduler*. The tag is the thing to scan; the line is the thing to read.",
			"A guide carries no tag. It is about an idea rather than about something that runs, and tagging *Controls* with a runtime would answer a question nobody asked of it.",
		],
	},
	{
		version: "0.62.5",
		date: "2026-09-16",
		headline: "The visual search finds what you named, not just what we shipped.",
		affects: ["editor"],
		added: [
			"`Ctrl` **+ right-click now searches the graph's own declarations too** — its variables, locals, functions and the parameters of the body you are in, beside the built-in library. The one search that shows you what a node *looks* like could not find the node you named yourself.",
			"They come first in the list. A name you chose is likelier to be the one you are after than a built-in that happens to read similarly.",
			"The **This graph** filter works here as well, so the picker can be narrowed to what this graph declares and nothing else.",
		],
		changed: [
			"**The preview draws the entry you are about to place.** A graph's own entry is a node plus the configuration that makes it that one, so Get Accumulator is drawn as Get Accumulator rather than as the nameless capsule underneath it — otherwise every variable in a graph previews identically.",
			"A search matches on the entry's own name. Typing *accumulator* finds **Get Accumulator**, whose definition is called Get Variable and would never have matched.",
		],
		watch: [
			"Both searches take the same list, built once, so they cannot disagree about what is in scope — including which of a function's parameters belong to the body you are looking at.",
		],
	},
	{
		version: "0.62.4",
		date: "2026-09-16",
		headline: "Search only what this graph declares.",
		affects: ["editor"],
		added: [
			"**A This graph filter in the node menu**, beside the runtimes: the variables, locals, functions and parameters this graph declares, with the library set aside. The thing you are looking for when you know you named it.",
			"Those entries carry a quiet badge in the unfiltered list too, so **Get Accumulator** is told apart from the **Get Variable** it sits next to under the same heading.",
		],
		changed: [
			"The filter is one control with four answers rather than two controls. Three of them say which runtime a node needs; This graph says it is not a library node at all. They are different kinds of claim, and a reader opening a search box is asking one question — narrow this — not two.",
		],
		watch: [
			"**In a function's own graph, This graph includes that function's parameters** — and only its own. A parameter exists where its body runs, so the file's graph offers none and a sibling function's are never listed. That was already how the menu worked; the filter inherits it rather than deciding again.",
			"The node picker lists the built-in library only, so it has nothing of the graph's to offer and does not show the chip. The preference is shared, and falls back to showing everything there rather than to an empty list.",
		],
	},
	{
		version: "0.62.3",
		date: "2026-09-16",
		headline: "The front page says what this version is about.",
		affects: ["editor", "docs"],
		changed: [
			"**The front page's footer names the release rather than the moment.** It read *the first public release*, which was true once and then quietly stopped being — a line about a day cannot go on describing the version beside it. It takes the release's own headline now, so it is right for every version without anybody remembering to change it.",
			"The footer's links sit at the other end of the row, so a tagline has room to be a sentence.",
		],
		fixed: [
			"The runtime filter had no room under it, so the chips sat directly on the search box and the two read as one control stuck to another.",
		],
	},
	{
		version: "0.62.2",
		date: "2026-09-16",
		headline: "The runtime badges line up, and a Lune graph says what it is.",
		affects: ["editor"],
		fixed: [
			"**A row carrying both** `pure` **and a runtime badge put the** `pure` **in a different place on every row.** Both were pushed right independently, so they split the space between them rather than travelling together — the column stopped being a column.",
			"**The badge sat two pixels low.** A menu row aligns on the baseline, which is right for a swatch and a title and wrong for a bordered chip: its border hangs below the line its neighbour sits on. Every trailing chip centres now.",
		],
		changed: [
			"**A graph with only one runtime available says so** rather than showing nothing where the filter goes. Every node a Lune graph can compile is base Luau today, so there was nothing to choose between — and an empty space read as the filter being broken instead of as there being one answer.",
		],
		watch: [
			"There are no Lune-only nodes yet, which is why a Lune graph offers base Luau and nothing else. They arrive with the Lune standard library — `@lune/fs`, `@lune/net`, `@lune/process` and the rest — which is a later release in this sequence.",
		],
	},
	{
		version: "0.62.1",
		date: "2026-09-16",
		headline: "Switching a tab no longer leaves you on a blank page.",
		affects: ["docs"],
		fixed: [
			"**Clicking a tab on a documentation page could scroll the window to an empty part of the document.** The switch hides its radio buttons by positioning them absolutely, and with no positioned ancestor they were measured against the page itself — so on [Toolbars](toolbars) two of them sat two thousand pixels below anything that renders and stretched the document to three times its height. Clicking the label focused one, the browser scrolled it into view, and you landed on nothing at all. Nothing threw, so there was nothing in the console either.",
		],
		watch: [
			"It only ever happened to a real pointer. Focus is what moved the window, and a scripted click does not focus — which is why it survived three attempts to reproduce it.",
		],
	},
	{
		version: "0.62.0",
		date: "2026-09-16",
		headline: "Search nodes by the runtime they work for.",
		affects: ["editor", "docs"],
		added: [
			"**A runtime filter in the node menu and the node picker** — All, Luau, Roblox — remembered between openings. It narrows what the graph's target already allows rather than replacing it, so a Lune graph never gains a Roblox node by picking a chip.",
			"**Luau** is the useful one: it answers \"which of these still works if I move this graph to the other runtime\".",
			"**A badge on a node that needs something.** Base Luau is unmarked — badging four rows in five would be noise, and the absence is the claim: this one runs anywhere.",
			"**Every node's page says which runtime it is for**, base Luau included. Said nowhere, \"works in both\" and \"nobody has decided\" look identical, and for 237 nodes they were the same thing until 0.61.0.",
		],
		changed: [
			"The filter offers only the runtimes actually present. A Lune graph has no Roblox nodes left to narrow to, so the chip is not there — a filter that can only return nothing is worse than no filter — and with one runtime present the row goes entirely.",
		],
		fixed: [
			"Bringing a lit toolbar control into view measured from the wrong element on the [Toolbars](toolbars) page, so on a page with anything positioned above it the bar scrolled to a meaningless offset.",
		],
	},
	{
		version: "0.61.0",
		date: "2026-09-16",
		headline: "Every node says which runtime it is for.",
		affects: ["editor"],
		added: [
			"**All 283 built-in nodes now declare their runtime.** 46 did before, so a Lune graph was offered every Vector3, every Instance method and the whole remote system as though they would compile. A Lune graph now sees 95 nodes — the language and what Roswaal builds out of it — and a Roblox graph still sees all of them.",
			"Every category has to be classified, so a new one cannot be added without somebody saying what it runs on. That is exactly how 237 nodes came to say nothing.",
		],
		changed: [
			"The Engine Types, Instances, Engine, Events, Networking, Players, Time and Z-Up Conversions nodes are **Roblox only**. Lune carries its own `Vector3` and friends behind `@lune/roblox`, so the datatypes become available there once there is a node that can require one — not before, because a node that appears and then always errors is worse than one that does not appear.",
			"The `task` nodes are Roblox only. Lune's scheduler is not a global: it is `require(\"@lune/task\")`, so `task.wait(1)` in a Lune file indexes nil.",
		],
		fixed: [
			"`Resume Coroutine` **and** `Yield` **were hidden from Lune graphs.** `coroutine` is Luau's own primitive and works in both runtimes — six of its eight nodes were offered and these two were not, because the helper that built them filled in a Roblox tag on every node it made. A node's runtime is no longer a property of how its definition happened to be written.",
		],
		watch: [
			"If you have a Lune graph using a node that is now Roblox only, it keeps working and keeps compiling — nothing was removed. The node menu stops offering it for new work, and compiling already told you it was an error.",
			"A node pack's nodes are untouched. What they run on is the project's to declare, and guessing on its behalf is not ours to do.",
		],
	},
	{
		version: "0.60.4",
		date: "2026-09-16",
		headline: "The canvas behind the graph toolbars reaches its own edges.",
		affects: ["docs"],
		fixed: [
			"**The grid behind the drawn graph toolbars stopped level with the tools**, leaving a bare band above and below it inside the frame. 0.60.3 put the canvas on the right element and the gap around the tools on the wrong one: a margin, which collapsed straight back out through the element painting the canvas, so the pane ended up exactly as tall as its contents. The gap is padding now, inside the thing that paints.",
		],
	},
	{
		version: "0.60.3",
		date: "2026-09-16",
		headline: "The graph toolbars float over a canvas again.",
		affects: ["docs"],
		verified: ["toolbars"],
		changed: [
			"**The drawn graph toolbars sit on a full pane of canvas**, grid and all, rather than on a strip that stopped where the tools stopped. The whole point of that picture is that the three groups float over a view which carries on past them, and a canvas cut to the size of its contents said the opposite.",
		],
	},
	{
		version: "0.60.2",
		date: "2026-09-16",
		headline: "A drawn toolbar sits on the page rather than in the list.",
		affects: ["docs"],
		changed: [
			"**The drawn bars are inset from their frames** on [Toolbars](toolbars), with their own corners and a little of the app's background around them. Flush against the list underneath, a bar read as that list's top row rather than as the thing the list is about — and a control nobody reads as a control is not one they think to hover.",
		],
	},
	{
		version: "0.60.1",
		date: "2026-09-16",
		headline: "A canary build says so, on every page.",
		affects: ["editor", "designer", "docs"],
		added: [
			"**The canary channel.** Roswaal now builds from two lines: the stable one, and a canary where work lands first. A canary build wears a yellow *canary* mark beside the version, on the editor, on Node Design and on the documentation — and carries a banner above them saying what that means, with a link to the stable build.",
			"The documentation's canary says something sharper than the editor's: these pages describe a build that is not out, so what they say may not be in the version you have.",
			"Canary pages are marked `noindex`, so the unreleased copy of the documentation does not compete with the real one in search results.",
		],
		changed: [
			"The build mark is one rule with two variants rather than one mark with an exception. A build wears *canary* or *preview*, never both: an unfinished build is unfinished whether it is in a browser tab or on your own machine.",
			"The front page's first button carries whichever mark the site was built from, and the sentence under it agrees with it.",
		],
		fixed: [
			"**The test suite read which build it was being run for.** The site workflow sets the channel for the whole job, so the two tests that asked the front page what it looked like got the canary's answer and failed — on the canary only, after passing on every machine. They state which build they mean now, and the suite pins the channel so nothing can read it by accident again.",
			"**The canary mark was drawn in the preview's colour.** The chip read *canary* and was painted accent blue, because the rule that colours it in a toolbar is more specific than the rule that says which colour a canary is. The colour is chosen on the chip itself now, so no amount of chrome around it can overrule what it is claiming.",
		],
		watch: [
			"Nothing changes for the stable build: it carries no canary mark, no banner and no `noindex`. If you are reading this anywhere but the canary site, none of it is on your screen.",
			"The site workflow now takes its base path from the repository's own name rather than a hard-coded one, so both repositories publish correctly from the same file.",
		],
	},
	{
		version: "0.60.0",
		date: "2026-09-16",
		headline: "Every toolbar is drawn, with its buttons named.",
		affects: ["docs", "editor", "designer"],
		added: [
			"A new page under Getting started, [Toolbars](toolbars). Five bars drawn as they appear — the editor's top bar, the three floating groups over a graph, a node map's row, Node Design's header and this window's — each with every control named underneath it.",
			"**Docs, Node Design and Settings are named and placed.** They are the last three icons on the editor's top bar, in that order, and the page says so in words as well as in the picture.",
			"A table of how to get from any of the three windows to the other two.",
			"**The drawn bars point at their own documentation.** Hover a control and its row in the list lights; hover a row and the control lights. Tapping one keeps it lit, and brings it into view if the bar has scrolled sideways.",
			"**Both editors are drawn.** The editor's top bar, Node Design's header and the documentation's own header each carry a switch between the build the daemon serves and the one that runs in a browser tab.",
			"**Every window of the browser preview now says it is one.** The *preview* chip sits beside the version in the editor and in Node Design, and the links into it — the front page's first button, and *Try it in your browser* in the documentation's header — carry it too. If you can see the chip, your project is kept in that browser rather than in your repository.",
		],
		changed: [
			"The front page says what the browser preview is, under the button that opens it. Its own tag is still the version: Roswaal is not a preview, the thing behind that one button is.",
			"Getting started and [Controls](controls) point at the new page. Controls is the keyboard and the mouse; the buttons are on Toolbars.",
			"*Creating custom nodes* names the button that opens Node Design rather than saying it is on the toolbar.",
		],
		fixed: [
			"**Node Design in the browser preview did not say it was the preview.** It is a whole window of that build and carried nothing; the chip was a one-off in the editor's toolbar rather than a rule. It is one component now, and every surface of that build renders it.",
			"**In the browser preview, the Docs button said it would show this project's packs.** It opens the published documentation, which is a static site with no registry behind it and documents the built-in library only. The tooltip now says so; the button is unchanged, and a project's own packs are still documented in the editor the daemon serves.",
		],
		watch: [
			"The bars are drawn in your own theme, at your own window width, rather than photographed — so a bar wider than the reading column scrolls sideways. The position of each control is written out in the list beneath it as well, which is what the page falls back on with no pointer and no script.",
			"Nothing in a drawn bar does anything when you click it. It is a picture of a control, not the control.",
		],
	},
	{
		version: "0.59.2",
		date: "2026-09-15",
		headline: "A published documentation page leads somewhere.",
		affects: ["docs"],
		added: [
			"**The header of every documentation page** carries *Try it in your browser* and *Source*. The mark still goes to the documentation's own index.",
		],
	},
	{
		version: "0.59.1",
		date: "2026-09-15",
		headline: "The source is public.",
		affects: ["docs"],
		added: [
			"**Roswaal is open source** — [github.com/neopolitans/Roswaal](https://github.com/neopolitans/Roswaal), under 0BSD. Read it, fork it, take what you want from it.",
			"The front page links the repository, beside the documentation.",
		],
		changed: [
			"The front page no longer calls itself a preview. It carries the version instead.",
			"Reports still go to [roswaal-feedback](https://github.com/neopolitans/roswaal-feedback/issues/new) — the source repository is for reading.",
		],
	},
	{
		version: "0.59.0",
		date: "2026-09-15",
		headline: "The front page says what is planned, and what it runs on.",
		affects: ["docs"],
		added: [
			"**A list of what is planned** — Wally packages, importing Luau you already have, a real Luau parser, reading a Rojo project as a node map, runtime errors that point at a node, and overriding a built-in node. Plans rather than promises: none of it is in the version you can try today, and any of it may change or be dropped.",
		],
		changed: [
			"The front page says it compiles for **Roblox** and **Lune**, and marks Lune experimental — Roswaal is built and checked against Roblox.",
		],
	},
	{
		version: "0.58.1",
		date: "2026-09-15",
		headline: "The front page says custom nodes once, and points at the edit button.",
		affects: ["docs"],
		changed: [
			"Designing a node and writing a pack were two points saying most of the same thing, and are now one. The room went to the **Suggest an edit** pencil that every documentation page already carries, which nothing on the site mentioned.",
		],
	},
	{
		version: "0.58.0",
		date: "2026-09-15",
		headline: "An execution wire no longer runs behind the nodes feeding it.",
		affects: ["docs"],
		changed: [
			"**A drawn graph moves its value nodes off the execution wire's lane.** A flow wire often runs a long way — from the start of a script to the node that handles an event, past everything working out its arguments — and a pure node sitting on that line had the wire pass behind it, which reads as a wire going into it. Fifteen of the thirty-nine drawn graphs had one; two remain, where the node carries flow of its own and belongs there.",
		],
	},
	{
		version: "0.57.0",
		date: "2026-09-15",
		headline: "Ctrl+K opens the documentation from Node Design too.",
		affects: ["designer", "docs"],
		added: [
			"**Ctrl+K searches the documentation from Node Design**, the way it already did from the graph. Designing a node is where the reference for the one you are copying is most wanted, and it was the one place the shortcut did nothing.",
		],
		changed: [
			"The front page says what the editor is actually like to use: the two ways to search for a node, the two ways to write one in Node Design, and the colour schemes.",
		],
	},
	{
		version: "0.56.0",
		date: "2026-09-15",
		headline: "Drawn graphs line their wires up.",
		affects: ["docs", "editor"],
		changed: [
			"**A drawn graph nudges its nodes so the wires between them run level**, on the documentation site, in the editor's docs window, and on the front page. Only vertically, and only a node that something feeds — the columns stay where they were, so the shape of the graph is unchanged. An execution wire wins over a value one, since that is the wire the graph is about.",
			"**The front page leads with what Roswaal is and what it costs**, and says what you own: the graphs, the generated Luau, and a 0BSD licence with nothing to ask permission for.",
		],
	},
	{
		version: "0.55.0",
		date: "2026-09-15",
		headline: "Roswaal has a front page.",
		affects: ["docs"],
		added: [
			"**A landing page**, showing a graph and the Luau compiled from it. Both halves are built from the same `.nodescript` by the same compiler the editor runs, so the picture cannot show a wiring the code does not have — and it says what is there beyond the nodes: the two escape hatches, node packs of your own, and a reference page for every node.",
		],
		fixed: [
			"**Luau is coloured wherever it is shown.** The palette was scoped to a list of containers and a new one had not been added to it, so a code block could be correct, classed, and entirely grey.",
		],
	},
	{
		version: "0.54.0",
		date: "2026-09-15",
		headline: "The browser version remembers your folder, and can set one up.",
		affects: ["editor"],
		added: [
			"**A folder you opened in the browser is opened again next time.** Where the permission has lapsed — which it does between sessions — the project menu offers it by name, and the click that accepts is the click that asks for permission back.",
			"**A folder with no** `roswaal.json` **can be set up from the browser**, so trying Roswaal on your own project no longer means installing it first. It asks before writing, and writes what `roswaal init` writes: `roswaal.json`, `.roswaal/scripts` and `.roswaal/nodes`. Nothing else in the folder is touched.",
		],
		changed: [
			"**Start again from the demo** also forgets the folder it was remembering.",
		],
	},
	{
		version: "0.53.2",
		date: "2026-09-15",
		headline: "Drawn graphs fit their frames again on the documentation site.",
		affects: ["docs"],
		fixed: [
			"**Every drawn graph on the published documentation was rendering at its natural size and overflowing its box**, and could not be panned or zoomed. The site's one script was throwing on its first line of every page, which took the search box with it.",
			"**The documentation's script and stylesheet carry the version in their address**, so a release is not served to a returning reader alongside the previous one's script. A published site cannot set its own cache headers, and the two are cached for ten minutes under names that never change.",
		],
	},
	{
		version: "0.53.0",
		date: "2026-09-15",
		headline: "The browser version can open a project on your own computer.",
		affects: ["editor"],
		added: [
			"**Open a folder on your computer**, from the browser version's project menu, with nothing installed. Roswaal reads and writes that folder directly, so compiled Luau lands where Rojo is already watching for it. **Chrome and Edge only** — the browser has to be able to hand a folder over, and where it cannot, the option is not offered.",
		],
		watch: [
			"A folder with no `roswaal.json` is refused rather than opened as an empty project. Run `roswaal init` in it first.",
			"Nothing watches the folder while it is open in a browser: a change made outside Roswaal — a branch switch, a pull, another editor — is not noticed until you reopen it. The daemon on your machine does watch.",
		],
	},
	{
		version: "0.52.0",
		date: "2026-09-15",
		headline: "The browser version keeps what you were working on.",
		affects: ["editor"],
		added: [
			"**Roswaal in a browser keeps your project between visits.** It is stored in that browser and nowhere else — not on a server, and not on your disk — so it does not follow you to another machine, and clearing your browser's site data takes it with everything else. Download it as a zip for anything you would mind losing.",
			"**Start again from the demo**, in the project menu of the browser version, for when you want the project you started with back.",
		],
	},
	{
		version: "0.51.0",
		date: "2026-09-15",
		headline: "The editor asks what it is running on, and offers only that.",
		affects: ["editor", "designer"],
		added: [
			"**Download as a zip**, in the project menu: every graph, node map, node pack, config file and generated Luau, in one archive named after the project.",
		],
		changed: [
			"**A control that needs something this copy of Roswaal does not have is no longer offered.** Showing a file in a file manager and handing one to an editor are shown but disabled, with a tooltip saying where they work; opening another project, the recent list and copying a node pack between projects are hidden, since there is nothing behind them to do. On a machine with a filesystem nothing changes — on one without a folder dialog, the Browse button is gone rather than failing when pressed.",
			"**A host that is not answering says so**, instead of showing the screen that asks you to choose a project folder.",
		],
	},
	{
		version: "0.50.4",
		date: "2026-09-15",
		headline: "A path means the same thing on every platform.",
		affects: ["editor"],
		fixed: [
			"**A path written with backslashes is read the same way on Linux and macOS as it is on Windows.** The separator was only stripped when it was the one the daemon's own machine uses, so a graph at `scripts\Shared\Greeter.nodescript` compiled to `Greeter.luau` on Windows and to `scriptsSharedGreeter.luau` elsewhere. Renaming, moving, and the checks that keep a path inside its project read the same paths and were wrong in the same way.",
		],
	},
	{
		version: "0.50.3",
		date: "2026-09-15",
		headline: "The dock and undock buttons sit on the row they belong to.",
		affects: ["editor"],
		fixed: [
			"**The buttons that move a panel between a dock and a window are centred on the heading they sit over.** On the diagnostics panel, whose heading is the errors-and-warnings bar rather than a title, the button sat six pixels low and hung out of the bottom of the bar; on every other panel it sat four pixels low.",
		],
	},
	{
		version: "0.50.2",
		date: "2026-09-15",
		headline: "A window resizes from either corner, and draws what it holds.",
		affects: ["editor", "docs"],
		added: [
			"**A window resizes from its top-left corner as well as its bottom-right**, moving as it shrinks so the far corner stays where it is — the same pair of handles a comment has.",
		],
		fixed: [
			"**A panel in a window lays out as it does in a dock.** The project tree drew its outline and its tree as two halves of the window with a screen of nothing between them: the window was stretching every element a panel rendered, rather than the panel.",
			"**One scroll container per window**, round the panel, which is the job a dock does for the panels in it.",
		],
	},
	{
		version: "0.50.1",
		date: "2026-09-15",
		headline: "Drag a panel onto the graph.",
		affects: ["editor", "docs"],
		added: [
			"**Dragging a panel out of its dock and onto the graph makes it a window**, where you dropped it. The gesture did nothing before: the only drop targets were the three edges, so a drop in the middle read as a miss.",
			"**A ⇥ button on every docked panel** does the same without the drag — the mirror of the ⇤ that puts a window back.",
		],
		fixed: [
			"**Both buttons are the size of the heading they sit in**, rather than the toolbar's 28px icons, and sit level with the panel's own Add button.",
		],
	},
	{
		version: "0.50.0",
		date: "2026-09-15",
		headline: "A picker that draws the node, and constants in the Variables list.",
		affects: ["editor", "docs"],
		added: [
			"`Ctrl` **+ right-click opens the node picker**: the same nodes as the menu, with each one **drawn** as you walk the list, in your own wire style and node corners. For when you remember what a node looks like rather than what it is called. Listed under *Advanced shortcuts* on the Controls page.",
			"`Ctrl` **+** `K` **in the editor jumps to a documentation page.** Pick one and the docs window opens on it — the same search the docs window has, from wherever you are in a graph.",
			"**A variable can be a** `const`, set per variable in its own row: declared once at the top of the file with its starting value, and never assigned again. **Set Variable** and **Initialize Variable** on one are refused before the file is written.",
			"**Constants are marked in the Variables list**, variables and locals alike, with the keyword they write.",
		],
		fixed: [
			"**A dock stops resizing when you let go**, wherever you let go. Releasing the splitter away from it left the drag running, so the next time the pointer passed over it the dock carried on growing.",
		],
	},
	{
		version: "0.49.0",
		date: "2026-09-15",
		headline: "A local can be a constant.",
		affects: ["editor", "docs"],
		added: [
			"**Declare Local can bind with** `const` — *Binding*, in the Inspector. Luau's constant is the same binding with one guarantee: the name cannot be reassigned after it is set. It is the binding that is fixed and not the value, so a const table is still a table you can write into.",
			"**A Set Local wired to a constant is refused before the file is written**, naming the local that made the promise. The runtime would catch it; the graph knows which node to point at.",
		],
		watch: [
			"`const` is a recent addition to Luau. A graph that uses it needs a runtime that has it — an older one refuses the file at parse time — so it is a choice per local rather than something Roswaal writes for you.",
		],
	},
	{
		version: "0.48.0",
		date: "2026-09-15",
		headline: "One picker for every type.",
		affects: ["editor", "docs"],
		changed: [
			"**Choosing a type opens the picker** — the one the Class Name pins and the casts use — wherever a type is chosen: a variable, a local, a parameter, a return, a field of a declared type. It was a dropdown of forty names with **Other…** at the bottom opening a text field, which is three controls for one question.",
			"**The headings lead with what is closest to hand**: this graph's own types, then a required module's, then Luau's own and Roblox's values, and the instance classes after them grouped the way the engine groups them. Groups were ordered by size, which put `any` and `number` below six hundred classes.",
		],
		watch: [
			"Whatever you type is still committed, listed or not — `Model?`, `(number) -> string`, `{ [Model]: Restore }` — and clearing it still means `any`. **Other…** is gone because the search box is the field it used to open.",
		],
	},
	{
		version: "0.47.0",
		date: "2026-09-15",
		headline: "Angular is a diagonal.",
		affects: ["editor", "docs"],
		fixed: [
			"**The Angular wire style draws what its name says**: out of the pin level, one straight run to the other end, in level. It has been drawing a right angle with its corners cut since it shipped, which is a different shape and not the one anybody picked it for.",
		],
		changed: [
			"**A backwards wire keeps the lane.** There is no straight line from a pin to something behind it that does not cross its own node, so angular borrows Rigid's route out and back, with its corners cut — which is the one place the old shape earns its keep.",
		],
	},
	{
		version: "0.46.0",
		date: "2026-09-15",
		headline: "Variables in a window, if you would rather.",
		affects: ["editor", "docs"],
		added: [
			"**Variables can leave its dock for a window over the graph** — Settings → **Variables** → *Window*. Drag it by its own heading, resize it from the bottom-right corner, and put it back with the **⇤** button. Where you left it is remembered.",
			"**A dock is a column and a window is not**, which is the point: a dock takes width from the canvas for as long as it is open, and a window is exactly as big as you drag it and covers the graph rather than narrowing it.",
		],
		watch: [
			"Dropping the window into a dock docks it, the same as dragging a docked panel between edges. A window put back with **⇤** returns to the dock it came from, not to whichever dock is first.",
		],
	},
	{
		version: "0.45.1",
		date: "2026-09-15",
		headline: "Best match, then Related — and the kinds are coloured.",
		affects: ["docs"],
		changed: [
			"**The search palette splits its results.** *Best match* is the pages called what you typed; *Related* is the ones that mention it somewhere. The arrows still walk both top to bottom.",
			"**Node and Article are coloured** — yellow for a node's reference page, blue for an article — so the two kinds separate before you have read either.",
		],
	},
	{
		version: "0.45.0",
		date: "2026-09-15",
		headline: "Ctrl+K in the docs, and Luau typed into the node search.",
		affects: ["editor", "docs"],
		added: [
			"**Ctrl+K opens a search palette over the documentation**: the whole width of the window, a line of each page's own summary under its title, the section it belongs to, and a mark saying whether it is an article or a node. Arrows move, Enter opens, Escape closes; with nothing typed it lists the pages you have been reading. The sidebar's field says the shortcut, and on the published site Ctrl+K puts the cursor in it.",
			"**Luau typed into the node search finds the node that writes it.** `not` is Not rather than Not Equal, `==` is Equal, `..` is Concatenate, `if` is Branch, `for` is the three loops in the order you mean them. The pill's own symbol is searchable too.",
		],
		fixed: [
			"**The node menu's categories are ordered by their best match while you search**, instead of always by the library's own order. The scores were right and nothing was reading them: a Flow node matching on a word in its summary was drawn above the Logic pill the query named outright, so typing `not` offered Branch.",
		],
	},
	{
		version: "0.44.0",
		date: "2026-09-15",
		headline: "A service or a class, by its own name.",
		affects: ["editor", "docs"],
		added: [
			"**Typing a service name into the node menu offers that service.** `ReplicatedStorage` gives you Get Service with the name already in it, the way a variable's name gives you its Get.",
			"**Any other class name offers New Instance**, filled in: `Part`, `ProximityPrompt`, `Motor6D`. Services are left out of that half — `Instance.new(\"Players\")` is an error the engine raises at runtime, and the service entry is the one that means anything.",
		],
	},
	{
		version: "0.43.1",
		date: "2026-09-15",
		headline: "Shows fills its row, and the documentation's casts were checked.",
		affects: ["editor", "docs"],
		fixed: [
			"**A segmented control in the Inspector fills its field**, the way the dropdowns and text fields beside it do. **Shows** was sitting in the corner of a full-width box with the rest of the row empty.",
		],
		changed: [
			"**The casts' pictures in the documentation are held to the canvas's** by a test of their own: the pill, its symbol, the field in the column reserved for it, and the width of a cast set to show its name. The pages draw with their own renderer, so a stylesheet fix on the canvas said nothing about them.",
		],
		verified: ["attributions"],
	},
	{
		version: "0.43.0",
		date: "2026-09-15",
		headline: "The pill's field sits where the pill reserved room for it.",
		affects: ["editor", "docs"],
		fixed: [
			"**A pill's inline field no longer sits on top of its symbol and its result pin.** Every pill reserves a column for the field between the pins and the symbol, and the stylesheet was pushing it to the right-hand edge instead — which put a cast's type over the `::` and under the output.",
		],
		added: [
			"**A cast's Type is a list you pick from**: Luau's own types, then Roblox's datatypes, then every Instance class, grouped as the class picker groups them. Whatever you type is still committed, so an intersection like `Model & { Humanoid: Humanoid }` is written the way it always was.",
			"**Shows**, in the Inspector, swaps a cast's `::` for the node's name — `Cast`, `Cast Array`, `Cast Through Any` — for anybody who would rather read the word. Stored on the node, because it sets the pill's width; **New cast nodes** in Settings decides what a new one starts as.",
			"**Wait For Child (Value)** is the same call with no execution wire, for the line that reads `local remote = ReplicatedStorage:WaitForChild(\"Remote\")`. It still yields, and still says so with the clock — reach for the original when the waiting is the step.",
		],
	},
	{
		version: "0.42.0",
		date: "2026-09-15",
		headline: "A cast is shaped like a cast.",
		affects: ["editor", "docs"],
		changed: [
			"**Cast, Cast Array and Cast Through Any are drawn as pills**, the shape the comparisons and **and** / **or** already use: the value and the type down the left, the symbol in the middle — `::`, `:: { }`, `:: any ::` — and the result on the right. Same pins, same generated line; a cast now reads as the operator it is instead of as a box with a header saying what the symbol says.",
		],
		watch: [
			"A pill has no header, so a **name typed into Label** on a cast is no longer drawn on the node — it still names the local the cast binds, and is still shown in the Inspector and on hover. Every other pill has always worked this way.",
			"**Brackets** is not offered for a cast. A cast already writes `(value :: T)`, and the toggle would add a second pair.",
		],
	},
	{
		version: "0.41.0",
		date: "2026-09-15",
		headline: "Ask a service what it can do.",
		affects: ["editor", "docs"],
		added: [
			"**Drag a wire off a service and drop it on empty canvas**, and the menu opens on that service's own methods, under its name. Picking one places the Service Function already set to that call, with the wire landed on it. Everything else that could take an Instance is still listed underneath.",
			"**Service Function's first pin is the service the call is made on.** Wired, the value on it is what the method runs against. Left alone it is nothing at all: the service is reached and hoisted the way Get Service reaches it, which is what the node did before this pin existed.",
		],
		changed: [
			"**A wire carrying a class the method does not belong to is now a warning** — a Humanoid on a `Debris:AddItem` — rather than silence. Only where the pin names a class: an `Instance` claims nothing and is refused nothing.",
		],
	},
	{
		version: "0.40.0",
		date: "2026-09-15",
		headline: "Every method a service has, without a node each.",
		affects: ["editor", "docs"],
		added: [
			"**Service Function** and **Service Function (Value)** call a method on a Roblox service. Pick the call in the Inspector — `RunService:IsServer`, `Debris:AddItem`, `TweenService:Create` — and the arguments arrive named and typed from the method's own signature, with the result pin typed to what it returns. The value node has no execution pins, so it wires straight into the Branch or the loop that wanted the answer.",
			"**The node palette lists every method by name.** Searching `IsServer` finds `RunService:IsServer`, and picking it places the node already set to that call. They appear once you have typed something rather than in the browsing list, which is three hundred entries long.",
			"**The service is hoisted**, exactly as Get Service hoists it: one `local RunService = game:GetService(\"RunService\")` at the top of the file, shared with every node that asked for the same service.",
			"**A catalogue of 322 methods across 36 services**, built from Roblox's documentation and shipped with Roswaal — no network at build time or run time. Methods behind a security context and deprecated ones are not offered; methods a service inherits are, down to `Instance`, whose own methods have nodes already.",
			"**An enum argument is typed as its member name** — `E`, `Begin` — and written out as `Enum.KeyCode.E`. An optional argument nothing set is left out of the call rather than passed as nil.",
			"**A new guide**, [Services and their methods](services), on Get Service, the two nodes, and what the catalogue holds.",
		],
		watch: [
			"The method list is a **snapshot of Roblox's documentation at this build**. A method newer than it is not on the list and still compiles: type it into the picker and set Arguments in the Inspector.",
		],
	},
	{
		version: "0.39.2",
		date: "2026-09-15",
		headline: "Comments resize from either corner, and long headers print as blocks.",
		affects: ["editor", "docs"],
		added: [
			"**Comments resize from the top-left corner as well as the bottom-right.** The top-left drag moves the box as it shrinks it, so the bottom-right corner stays where it is — a comment can be grown upwards over a node above it without being dragged back afterwards.",
		],
		changed: [
			"**A comment header of more than one line is written as a** `--[[ ]]` **block**, with its lines indented inside it, rather than a run of `--` lines. One line is still written `-- like this`. A header containing `]]` takes a `--[=[` block, or as many `=` as it needs.",
		],
	},
	{
		version: "0.39.1",
		date: "2026-09-15",
		headline: "The Docs tag is a tag again.",
		affects: ["docs"],
		fixed: [
			"**The Docs tag no longer renders as a full-width box on its own line.** Its class was `docs`, and `.docs` is the documentation panel — a bordered, full-height grid — so the tag took the panel's styling.",
			"**Tag rows are one line tall again.** They are a flex row, so the one stretched tag pulled every other tag on the release up to its height — which is what turned 0.37.x's tags into columns.",
		],
		watch: [
			"**A tag's class is** `tag-feature`, `tag-docs` **and so on now**, rather than the bare name. Only a fork styling the documentation itself would notice.",
		],
	},
	{
		version: "0.39.0",
		date: "2026-09-15",
		headline: "A comment you wrote once is read twice.",
		affects: ["editor", "docs"],
		added: [
			"**A comment's header is written into the generated Luau**, above the code of the nodes it is drawn around — once per block, indented with it, and keeping the lines you wrote it on.",
			"**Comment headers**, in Settings: on by default. Off keeps comments in the editor, which is what other visual scripting tools do; **Coming from Blueprints** says so where that habit comes from.",
			"**Docs, Editor and Designer tags** on a release, saying which part of the tool it touched. The releases of 0.36 onwards carry them; anything earlier predates the field, so an absent tag means *not stated* rather than *not affected*.",
		],
		watch: [
			"**A comment holding no nodes writes nothing**, and neither does one with a blank header — a note about nothing in particular is a fair thing to write on a canvas and has no block to head.",
			"**A node inside two comments takes the smaller one.** Two headings over one statement is one heading too many, and the inner comment is the more specific thing said about it.",
			"**Turning it on changes every generated file.** The code is the same; the diffs are not small.",
		],
	},
	{
		version: "0.38.1",
		affects: ["docs"],
		date: "2026-09-15",
		headline: "Attributions says what Roswaal is designed for.",
		added: [
			"**What Roswaal is designed for**, on Attributions and in `ATTRIBUTIONS.md`: **Luau**, **Roblox** and **Lune**, with what each one is and where it reaches the output.",
			"**Non-affiliation said outright for each**, rather than left to be inferred from a licence column.",
		],
		changed: [
			"**Luau moved there from \"What Roswaal is built on\".** No Luau ships inside Roswaal — Roswaal writes it — and listing it beside the libraries that do overstated the relationship. The attribution its README asks for is unchanged and is still on the page, with the quote.",
		],
		watch: [
			"**Nothing about the tool changed.** This is what the project says about itself, which is the sort of thing that goes stale quietly — Lune had been a compile target for eight releases and was named nowhere.",
		],
	},
	{
		version: "0.38.0",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A picker for six hundred classes.",
		added: [
			"**A class picker**, in the shape Studio's Insert Object uses: search at the top, everything below it in columns. Click the Class Name on any node that takes one.",
			"**Grouped by the engine's own inheritance** — every constraint under Constraint, every UI element under GuiBase — rather than by categories invented here.",
			"**The chain under the highlighted class**: `Part › BasePart › PVInstance › Instance › Object`, which answers what a class *is* while you browse.",
			"**Type to search, arrows to move, Enter to take it.** A name the list does not hold is still taken on Enter, because a class newer than your build has to be reachable.",
			"**Roswaal knows the class hierarchy**: 624 superclass links, from the same Creator Hub export.",
		],
		changed: [
			"**A class fits a pin typed as anything it derives from.** A `Part` reaches a `BasePart` pin, a `TextButton` a `GuiObject` one. Only `Instance` was known before, so every narrower version of the same fact wanted a Cast asserting something already true.",
		],
		watch: [
			"**The other direction is still refused.** An `Instance` into a `Part` pin is a claim about what the value is rather than a fact about its type, and Cast is the node that makes that claim out loud.",
		],
	},
	{
		version: "0.37.0",
		affects: ["editor", "designer", "docs"],
		date: "2026-09-15",
		headline: "A Class Name is a list you pick from.",
		added: [
			"**Class Name is a dropdown** on Is A, New Instance, Find First Child Of Class, Find First Child Which Is A, and both Find First Ancestor nodes. Every Instance class the engine has, with the everyday ones first — and a field you type into, so a class newer than your build still works.",
			"**Roswaal knows the engine's vocabulary**: 625 classes, 507 enums, 48 datatypes, the libraries, and both sets of globals. Generated from the Creator Hub by `npm run build:roblox`, and only names — no prose.",
			"**Choices on a pin, in Node Design.** A pack's pin can offer a dropdown of its own; `.nodedef.json` has taken `options` all along and there was no way to set one from the editor that builds them.",
			"**A node's reference page says which pins offer a list**, naming the values when there are few enough to read and counting them when there are not.",
		],
		changed: [
			"**Every Instance class fits an** `Instance` **pin.** It used to be a hand-kept list of fifty-odd, so a `Decal` wanted a Cast to assert something that was already true.",
			"**Other… in the type picker searches every class and datatype**, not the shortlist.",
			"**Custom Code's autocomplete offers the engine's real globals and libraries.** The hand-kept list knew `buffer` and not `bit32`.",
		],
		fixed: [
			"`ScriptSignal` **is gone from the type list.** There is no such class — the signal type is `RBXScriptSignal`, which is a datatype and was already offered as one.",
		],
	},
	{
		version: "0.36.7",
		affects: ["editor", "designer", "docs"],
		date: "2026-09-15",
		headline: "A knot hears its source change its mind.",
		fixed: [
			"**A reroute knot follows its source being retyped**, without the wire having to be redrawn. Give a Declare Local a type, type a loop's Value, retype a function's parameter or a variable — the knots downstream take the new type, and so do the knots after those.",
			"**A wire dragged from an output connects to a knot.** A knot's two pins are stacked at its centre, so the drop landed on the output whatever you aimed at, the two ends were both outputs, and nothing happened. Dragging from an *input* always worked, which is why knots looked like they sometimes took wires and sometimes did not.",
		],
		changed: [
			"**A knot in a drawn graph on these pages is coloured by what it carries too.** The picture under Reroute knots drew two grey dots beside a paragraph saying otherwise.",
		],
		watch: [
			"**A knot was only retyped when a wire was added or removed.** If one has been sitting on the wrong type, it corrects itself the next time you touch the graph.",
			"**Node Design's logic canvas does the same**, as it does for everything else the canvas can do.",
		],
	},
	{
		version: "0.36.6",
		affects: ["editor", "designer", "docs"],
		date: "2026-09-15",
		headline: "A graph's coordinates are its own.",
		fixed: [
			"**A comment takes only what is in its own graph.** Every graph of a file starts at the same origin, so a comment in the nodescript's graph and a function's nodes can sit at the same numbers — and a comment copied from one was coming back with nodes from the other.",
			"**Dragging a comment no longer moves nodes in a graph you are not looking at.** The same question, asked by the drag since function graphs existed.",
			"**Paste lands at the pointer for anything copied inside a function's graph.** It was testing whether a thing had been copied from the nodescript's own graph, which is no for everything copied while a function is open — so the pointer was ignored in exactly the graphs most of the work happens in.",
		],
		added: [
			"**Copy, cut, paste and duplicate in Node Design's logic canvas**, on the same terms as a graph. They live in the graph editor's shell, which the designer page does not have, so they had never been there. Node Inputs and Node Outputs are left out of all four — there is one of each and they are already present.",
		],
		watch: [
			"**A copied function still keeps its body's layout.** Only its declaration lands at the pointer; the nodes inside it stay where they are in the copy's own graph.",
		],
	},
	{
		version: "0.36.5",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A copied comment brings what it is drawn around.",
		fixed: [
			"**Copying a comment copies the nodes inside it**, and the wires between them. It used to copy the rectangle alone — so pasting gave an empty box, which then landed over whatever was already there and enclosed that instead.",
			"**A comment inside a copied comment comes too**, with everything in it.",
		],
		changed: [
			"**Cut takes away exactly what it took a copy of.** Cutting a comment removes the nodes it encloses, so the paste is the group rather than a second set of it.",
		],
		watch: [
			"**Delete is unchanged.** Removing a comment removes the note and leaves the nodes, as it always has — a key that quietly took eleven nodes with it is not one to find out about by accident.",
			"**A node does not bring its comment.** Copying something that happens to sit inside a comment copies the node, exactly as dragging it does.",
		],
	},
	{
		version: "0.36.4",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A paste lands where you are pointing.",
		changed: [
			"**Paste and Duplicate put the clipping's top-left corner at the pointer**, instead of beside what it was copied from. The corner is the furthest up and left of everything in the clipping, comments included.",
			"**Ctrl+D goes to the pointer too**, because a duplicate is a paste with a different source and had the same problem.",
		],
		fixed: [
			"**A copied comment no longer encloses the originals as well as the copies.** Membership is worked out from the geometry when a drag starts, so a comment dropped on top of what it was copied from really did contain both — and dragging it afterwards took all of them.",
		],
		watch: [
			"**With the pointer off the canvas, a paste still offsets from the original**, which is what it always did. A keystroke does not say where the mouse is, and a mouse in a panel is not a place you chose.",
			"**A node inside a pasted function does not move.** It keeps its position in that function's own graph, which is not the graph you are pointing at; only the declaration lands at the pointer.",
		],
	},
	{
		version: "0.36.3",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A loop says what it is looping over.",
		added: [
			"**Key type and Value type on For Each**, in the Inspector, and **Value type** on For Each (Array). Luau takes an annotation on a `for` binding, so it is written where the variable is introduced: `for part: BasePart, transparency: number in pairs(parts) do`.",
			"**The types reach the pins too.** A Value typed `BasePart` gives a `BasePart` pin — coloured as one, and wired to things that want one — whether or not the annotation is written.",
		],
		watch: [
			"**An array's index is not offered a type.** `ipairs` hands back a number, and writing `i: number` says what the loop already said.",
			"**The annotation follows the graph's typecheck mode**, as every other one does: Strict and Nonstrict write it, Default does not. The pin is typed either way.",
			"**Blank means no annotation**, not `any`, so a loop nobody has typed compiles to exactly the line it always did.",
		],
	},
	{
		version: "0.36.2",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A field read twice is written twice.",
		changed: [
			"**A plain access path read more than once is written again rather than hoisted into a local.** `restore.weld` at both use sites, not `local weld = restore.weld` beside them — which is what hand-written Luau does, and what `Occupancy.VALUE_NAME` was already doing everywhere except through Get Key.",
			"**A path reached through a call still gets its local**, because the call would otherwise run twice. So does an expression, and anything else that is work rather than a name.",
		],
		fixed: [
			"**A field read twice now really is read twice.** The local was a snapshot: a Set Index between the two reads never reached it, so the graph said \"read this field here\" and the file did not.",
		],
		watch: [
			"**Naming the result still asks for the local**, and is now the way to say \"read this once and keep it\" — worth it for an instance property read several times in a row, where each read crosses into the engine.",
			"**Recompiling will drop these locals from generated files.** Every graph that read a field or a constant twice loses a line and reads the path at each use instead.",
		],
	},
	{
		version: "0.36.1",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "The node search asks the same scope question the panel does.",
		fixed: [
			"**The node search offers only the locals the graph on screen can reach.** Searching `restore` in `show`'s graph offered `Get restore` for a local that `hide` declares, and picking it gave a Get Local the compiler then refused. The Variables panel was scoped in 0.36.0; the search was not, and both now read one rule.",
			"**A parameter is offered only inside the body it belongs to.** A function's in its own graph, a Connect or Once handler's where its node is drawn.",
		],
		watch: [
			"**Script variables and functions are still listed everywhere.** A variable is readable from anywhere by construction, and the list of a file's functions is how you move between them — neither is scoped, and neither is an oversight.",
		],
	},
	{
		version: "0.36.0",
		affects: ["editor", "docs"],
		date: "2026-09-15",
		headline: "A name lasts as long as its block, and a chain of conditions is one chain.",
		added: [
			"**Key name and Value name** on For Each and For Each (Array), in the Inspector. Left blank they are `key` and `value`, as before.",
			"**Cast, in the Inspector**: **Automatic** is the old rule, **Explicit** always writes `local part = value :: BasePart`, and **Implicit** never writes a line.",
			"**An implicit Cast inside the True arm of a Branch on Is A writes nothing at all.** Luau has already narrowed the value there. Two classes tested with **Or** narrow to the union, so a cast to `Decal | Texture` disappears in that arm and a cast to either half stays.",
			"**Brackets**, on And, Or, Not and the comparison pills: wrap the result in `( )`, or leave it to Luau's precedence.",
			"**New logic nodes**, in Settings, chooses which of those a pill you drop starts as.",
			"**Indent with**, in Settings: a tab, or 2, 3, 4 or 8 spaces. Written to `roswaal.json` as `indentStyle` and `indentWidth`, and handed to stylua as well.",
			"**Get ‹parameter›** in the node search, one per parameter of every function and handler in the graph, with Get Parameter's From and Parameter already filled in.",
			"**A comment's colour**, in the Inspector: eight swatches, or a hex typed in.",
			"**Drag a tab to reorder the row**, and a list at the end of the row naming every open graph.",
		],
		changed: [
			"**A Branch wired into a Branch's False pin compiles to** `elseif`. A chain of conditions is one `if` statement at one level of indentation, ending in one `end`, instead of a nested `if` per condition. A condition that has to work something out first still gets its own `else` block, because `elseif` has nowhere to put the line.",
			"**Parentheses are written where Luau's precedence needs them and nowhere else.** `not humanoid or not root` rather than `(not humanoid) or (not root)`.",
			"**A local's name is taken for as long as its block, not for the whole file.** Two functions can both call a parameter `character`, and two loops can both call their value `part`; a name an *enclosing* block holds is still avoided, so nothing shadows.",
		],
		fixed: [
			"**A graph whose own tab was closed while one of its function tabs stayed open can be opened again.** It was still loaded, so opening it took the \"already open\" path and found no tab to go to; double-clicking it in the tree did nothing until the function's tab was closed. Its tab now comes back in front of its functions', keeping the history and any unsaved edits.",
			"**The Variables panel lists the locals and types the graph on screen can actually reach.** A local declared inside `hide` was listed while `show` was open, and dragging it out gave a Get Local the compiler then refused. A file's own locals still show inside a Declare Function, which closes over them — but not inside a hoisted Function, which is written above them.",
		],
		watch: [
			"**Recompiling a graph will reformat parts of the generated file.** The parentheses, the `elseif` chains and any name that had picked up a `2` all change at once. The programs are the same; the diffs are not small.",
		],
	},
	{
		version: "0.35.0",
		date: "2026-09-14",
		headline: "Pins sit on the edge they wire to.",
		changed: [
			"**An execution pin is an equilateral triangle**, pointing right, hung just outside the node's border instead of drawn inside it.",
			"**Every other pin is balanced halfway over the border**, which is where its wire ends. Pin names and inline value fields have not moved.",
			"**An unwired pin sits in a dark well** rather than taking the colour of whatever is behind it.",
			"**Node pictures in the docs show the same pins**, and a worked example's stand-in value sits below the execution line rather than across it.",
			"`NOTICE.md` **is now** `ATTRIBUTIONS.md`, and mirrors the Attributions page as tables.",
			"**Attributions names two more inspirations**: Unity Visual Scripting (Bolt) and Blender.",
		],
	},
	{
		version: "0.34.0",
		date: "2026-09-13",
		headline: "Design a node by building it.",
		added: [
			"**Node Design is a visual editor.** It opens on the project's packs and the built-in library, as cards or a list.",
			"**Pack actions**: New pack, Import from a project, Duplicate, Copy to another project, Copy JSON, Show in file manager and Delete. A Luau pack opens read-only, with Save as JSON pack.",
			"**A node is built on a canvas of its own.** Drag a pin type onto either side, click a pin to edit it, type the title on the header, and draw a pure node with no inputs and one output as a pill.",
			"**Logic in Luau, or built from nodes.** The Nodes tab builds a node's logic between Node Inputs and Node Outputs, and compiles it to Luau as you go.",
			"**A pack can require other packs**, whose nodes its logic can use. A required pack the project does not have is marked.",
			"**Runs on**, in a node's details: Roblox, Lune, or both. Logic built from nodes narrows it, and a node that would run on nothing cannot be saved.",
			"**Name in the graph tools**, in Settings, shows the graph's name at the start of the tools over the canvas.",
			"**Creating custom nodes has Node Design - Visual and Node Design - Luau tabs**, with worked examples of each kind of template.",
		],
		changed: [
			"**The graph's tools float over the canvas** in three groups, instead of taking a row above it.",
			"**The node designer is called Node Design**, and its header has help and Docs buttons. Both headers say Open Editor.",
			"**A node pack can draw a pure node as a pill**, with `\"display\": \"compact\"`.",
		],
		watch: [
			"**A step node with no execution input loads with a warning**: nothing can run it.",
			"**The designer form is gone.** Nodes are made in Node Design's editor.",
		],
	},
	{
		version: "0.33.1",
		date: "2026-09-13",
		headline: "Preview the function you are in.",
		fixed: [
			"`P` **in a function's tab with nothing selected previews that function**, not the whole script. The nodescript's own graph still previews the whole script.",
		],
	},
	{
		version: "0.33.0",
		date: "2026-09-13",
		headline: "Every function opens in its own graph.",
		added: [
			"**Function graphs.** A function's nodes are in a graph of its own, in a tab marked **ƒ** and named for the function and its script: `hide (Occupancy)`.",
			"**Functions in the project tree.** A graph with functions has an arrow that lists them. Double-click one to open its graph.",
			"**Double-click a Declare Function** to open its graph, or use the **ƒ** on its header.",
			"**Shorten function tabs**, in Settings: **None**, **Function name** or **Script name**.",
			"**Coming from Blueprints has a Macro row**: no counterpart, and the Luau that does the job instead.",
			"**A Functions guide**: the two declarations, a function's graph, and what can reach inside one.",
			"`P` **with nothing selected previews the whole script.** The preview button is in the bar whether or not anything is selected.",
			"**Contributing says Lune comes first.** Where possible and feasible, Lune bugfixes and features are prioritized. Roblox Studio fixes and features are still considered.",
		],
		changed: [
			"**A hoisted Function is drawn only in its own graph**, which opens when you add one.",
			"**Declare Function is drawn in two graphs.** In the flow it has In, Then, On Table and Function; in its own graph it is the entry, with Body and its parameters.",
			"**Select all, marquee select, Realign and align act on the graph on screen.**",
			"**Deleting a function deletes its graph**, and asks first when there are nodes in it. Copying a function copies its graph.",
			"**Clicking a function in the Variables panel opens its graph.** Clicking a local, a type or a diagnostic goes to the graph its node is in.",
			"**A Lune graph has no script class.** Its bar has no class picker, and a Module Exports node is what makes it a module.",
			"**Get Parameter lists the function it is inside first.**",
			"**Function and Declare Function's descriptions** say which graph each is drawn in.",
		],
		watch: [
			"**A graph with functions is split into function graphs when it is opened.** The Luau it compiles to does not change. A wire between two graphs is an error.",
			"**A Lune graph with Module Exports now returns its exports**, whatever class it had. One without is a plain script.",
		],
	},
	{
		version: "0.32.0",
		date: "2026-09-12",
		headline: "Read a parameter where you use it.",
		added: [
			"**Get Parameter**: a function's parameter as a value, read by name rather than by a wire back to the declaration. In a function of any size those wires cross the whole body — this is the trade Get Local already makes against wiring a Declare Local everywhere. The pins are still there.",
			"**It works in an event handler too.** Connect binds its handler's parameters exactly as a function does, so a Get Parameter inside one reads them the same way.",
			"**Functions in the Variables panel**, beside Locals and Types. Click one to select its declaration — useful when it is somewhere off screen in a large graph — or drag it onto the canvas for a Get Function.",
		],
		changed: [
			"**Renaming a parameter carries its readers with it.** Reordering leaves them alone, because a Get Parameter holds the name rather than the position. Removing one leaves the node saying which parameter is gone, rather than quietly reading whichever took its place.",
		],
		watch: [
			"A Get Parameter only resolves **inside the body it belongs to** — that is what a parameter is. Outside one it reports that it is not inside the function, naming both.",
		],
		verified: ["variables-and-locals"],
	},
	{
		version: "0.31.6",
		date: "2026-09-12",
		headline: "A comment about nothing in particular.",
		changed: [
			"`C` **no longer needs a selection.** With nodes picked it still draws a comment around them; with nothing picked you get an empty one, placed where the canvas is looking rather than at the far corner of the graph.",
		],
		added: [
			"**The Controls page says how to make a comment** — by key and by right-click — which it never did.",
		],
		verified: ["controls"],
	},
	{
		version: "0.31.5",
		date: "2026-09-12",
		headline: "Hot reload is Dynamic compiling.",
		changed: [
			"**Compile is Manual or Dynamic.** Roswaal compiles a graph and Rojo syncs it — nothing is reloaded — and *Dynamic* reads as the opposite of *Manual* in a way the old name never did.",
			"**The toolbar names what the buttons set**, reading Compile: Manual | Dynamic rather than leaving it to a hover title. Settings says the same two words, where it used to say Manually and On every change.",
		],
		watch: [
			"`roswaal.json` **is untouched.** The setting is still stored as `compileMode: \"hot\"`, so every existing project keeps working and an older Roswaal can still read a file this one writes. The settings page names both, for anyone editing that file by hand.",
		],
	},
	{
		version: "0.31.4",
		date: "2026-09-12",
		headline: "A local says its name, and a node can be as wide as its header.",
		added: [
			"**Long names**, in Settings. Keep cutting a header short when it does not fit — what nodes have always done — or widen the node to it instead. Widening moves pins, so wires and the pictures in the documentation are drawn from the same width.",
		],
		changed: [
			"**Declare Local shows the local's name** beside its title: `Declare Local (restores)`, with the declared type still underneath. One you have not named reads as it did.",
			"**Casting and annotations describes the type picker**: the grouped list, the field **Other…** opens, and when to declare a type once instead of typing it into three pickers.",
		],
		verified: ["casting", "settings"],
	},
	{
		version: "0.31.3",
		date: "2026-09-12",
		headline: "A dictionary's row is a pair you can split.",
		changed: [
			"**Make Dictionary's rows are Key Value Pairs.** A row is one pin: split it for the Key and Value you type into, or leave it whole and wire a pair in. Rows arrive split, so a placed node reads as it always did.",
			"**A pair dropped on the node takes a whole row**, instead of landing on a Value pin beside a Key it would not use.",
			"**The + and − call them pairs**, and add one row rather than two pins.",
		],
		watch: [
			"An existing Make Dictionary opens with its rows split, keeping every key, value and wire. A row that was fed by a Key Value Pair stays whole, with the wire on the row itself.",
		],
	},
	{
		version: "0.31.2",
		date: "2026-09-12",
		headline: "A result keeps the name you gave it.",
		added: [
			"**Naming a result**, on Variables and locals: what Result name does, and why naming a result *and* declaring a local gives you two locals.",
			"**Every node that returns a value says so on its page**, with the same note.",
		],
		changed: [
			"**A pure node binds under the name you typed.** Result name was read only on nodes with an execution wire, so a Find First Child named `value` came out as `local Child`.",
			"**A result name binds even where one place reads it.** It used to take two readers before the name was used at all.",
			"**Result name is offered on pure nodes** in the Inspector, and shows under the node's header.",
			"**Find First Child is in Instances**, beside the other questions. Its id is unchanged, so saved graphs open as they did.",
			"**A Return's and a Module Exports' pins can be typed into** where the type has a value to type: number, string, boolean, table. An untyped pin still asks for a wire.",
		],
		fixed: [
			"An operator pill's corners scaled with its height, so a three-input pill was an ellipse with its pins outside it.",
			"The error count on a pill or a capsule sat off the shape rather than on its corner.",
		],
	},
	{
		version: "0.31.1",
		date: "2026-09-11",
		headline: "A question is pure, and a page you can edit in place.",
		added: [
			"**Pictures in a proposal**: add a node picture from the palette, or a graph picture from a script in the open project, and the proposal carries it as source.",
		],
		changed: [
			"**Suggest an edit is the pencil** beside a page's title, and edits the page where it stands — every block stays rendered, and clicking one opens that block's editor. Blocks can be added, moved and removed.",
			"**Find First Child is pure**, like the other questions in Engine. Wire Child into Declare Local and the result is one line.",
			"**Recursive is optional** on Find First Child and Find First Child Which Is A. Leave it empty and Roswaal writes the call without it.",
		],
		watch: [
			"An existing Find First Child opens without its execution wires, which are joined past it, and without its Result name. The local now comes from a Declare Local wired to Child; before, the node wrote one itself and a Declare Local after it wrote a second.",
		],
	},
	{
		version: "0.31.0",
		date: "2026-09-11",
		headline: "A form over a node, and a toolbar that says less.",
		added: [
			"**The node designer**: a form over a node definition, with the node drawn beside it as you fill it in. From the toolbar, or at `/designer`.",
			"**The designer saves into a pack you choose** — an existing one or a new one — and reopens the project, so the node is in the palette straight away. It also copies the node as JSON or as Luau.",
			"**Creating custom nodes**, a page that switches between the three routes to one: the designer, a Luau pack, and Roswaal's own library.",
			"**Command line**, a page listing every command and option, built from the same list `roswaal help` prints.",
			"**Casting and annotations**, its own page: the three cast nodes, declaring a type in three shapes, what Roswaal writes into the file, and where types are offered.",
			"**Suggest an edit**, at the foot of every documentation page. Rewrite the page and it opens as an issue with the page and version filled in.",
			"`roswaal version` is in `roswaal help`. It has always worked and appeared in no list.",
			"**The daemon prints the documentation's address** under the editor's.",
		],
		changed: [
			"**The toolbar is icons**, with the label as the tooltip. Compile keeps its words in both bars, and so do the controls that show a setting rather than doing something.",
			"**The README is a front door**: install, start, where the documentation is, and the licence. Everything else it described is in the documentation, which stays in step with the code.",
			"**Casting moved off Roswaal types** onto the new page, with the type features added since it was written.",
			"**The daemon's hint says Ctrl+Click** to open the editor URL, which is what PowerShell and cmd.exe need and neither says.",
		],
	},
	{
		version: "0.30.0",
		date: "2026-09-11",
		headline: "Reach a local by name, and key a table by anything.",
		added: [
			"**Get Local** reads a Declare Local's value wherever it is in scope — inside a function declared further down, without a wire back across the graph.",
			"**The Variables panel lists this graph's locals and types.** Drag a local out for a Get Local; drag a type out for a local of that type, or a Cast with Ctrl held.",
			"**Set Key and Get Key** take a name, or any key wired in — `restores[character]`. Set Index and Get Index take a number.",
			"**Key Value Pair**, one entry for Make Dictionary with its key and value wired in together.",
			"**Declare Type takes a table of fields, or Luau written out**, as well as the type of a wired value.",
			"**Declare Local takes a type**, written after the name: `local restores: { [Model]: Restore } = {}`.",
			"**Types are coloured as types** in Custom Code and Luau Expression — annotations, casts and type declarations — and every theme carries a colour for them.",
			"**Comment headers hold several lines** and grow to fit what they say.",
			"**Custom Code is offered the locals a Declare Local made** and the parameters of the function it sits in. A Luau Expression is offered the scope of wherever it is read.",
			"**The types a required module exports** are offered wherever a type is chosen, as `Config.Tuning`.",
		],
		changed: [
			"**Comparisons, And, Or, Not and Nil are drawn as pills**, with the Luau operator in the middle rather than a header above two pins.",
			"**A type that is more than a name is written as itself.** `{ [Model]: Restore }` on a parameter or a local used to come out `any`.",
			"**Escape in a comment header saves.** Enter adds a line; clicking anywhere else saves too.",
		],
		fixed: [
			"**A pin lights up while a wire is in flight exactly when it would take the drop.** A number dimmed a string pin it would then accept, and a typed-in-only pin lit up and then refused.",
			"**A Model wired into an Instance pin no longer warns at compile.** The editor allowed it and the compile disagreed.",
			"**Dropping a data wire on a Sequence or a function no longer leaves an empty pin behind** that nothing could connect to.",
			"**The palette no longer offers a node whose only matching pin must be typed in.**",
			"**A node map whose** `$path` **is not on disk is no longer written.** The error was reported and the file went out anyway.",
			"**Ctrl+S with a node map open writes the map**, rather than compiling the graph behind it.",
			"**Moving or renaming a graph keeps its tab pointed at the file.** The next save used to write it back where it had been.",
			"**One file StyLua cannot parse no longer turns formatting off** for every file after it.",
			"**The overwrite link shows only where overwriting would do something** — not on a graph held back by its own errors.",
			"**Files deleted because a graph moved are listed**, in the status panel and on the command line.",
			"`--yes` **is in** `roswaal help`.",
			"**The docs window follows a link back to the page it was opened on.**",
		],
		watch: [
			"A Set Index or Get Index keyed by a name becomes Set Key or Get Key when the graph is opened. The Luau is unchanged; the node's id in the file is not.",
			"A Key Value Pair connects only to Make Dictionary's value pins, `any` included.",
		],
	},
	{
		version: "0.29.1",
		date: "2026-09-11",
		headline: "Know what a target switch breaks, and where the target lives.",
		changed: [
			"**Switching a graph's target lists the nodes that would become errors**, by name and with a count for repeats, before asking.",
			"**The target picker sits beside Compile script**, with the other compilation controls, rather than beside the graph's name.",
			"**A review can credit its reviewers** by GitHub account, linked at the foot of the page, and *Contributing* lists everyone credited.",
			"**Release notes open on the newest minor version**, with the current release inside it and marked **Latest**, instead of showing that release apart from its siblings.",
		],
		fixed: [
			"**The Beako link on Attributions is a link again**, rather than its raw text.",
			"**Five older release notes print their emphasis** instead of stray asterisks.",
		],
		verified: ["controls"],
	},
	{
		version: "0.29.0",
		date: "2026-09-11",
		headline: "Change a graph's target, and a shorter history.",
		added: [
			"**A graph's target can be changed** from the bar above the canvas. Switching to Lune asks first when the graph has Roblox-only nodes, which would become errors.",
			"**Contributing**, a page on building Roswaal, what a change brings with it, and where help is wanted.",
		],
		changed: [
			"**Release notes show the latest release in full** and fold every other one into its minor version — 0.28.x, 0.27.x — to open when wanted.",
			"**Release notes carry no review badge.**",
			"**The README says Lune support is experimental.**",
		],
	},
	{
		version: "0.28.0",
		date: "2026-09-11",
		headline: "The target in view, and five pages verified.",
		added: [
			"**The bar above the canvas shows what the graph compiles for**: Roblox, or Lune.",
			"**Hand-written Luau draws Custom Code and Luau Expression separately**, each with the Luau it compiles to underneath.",
		],
		changed: [
			"**A Roblox-only node in a Lune graph is an error on that node**, and the file is not written. It was a warning, and the file was written anyway.",
			"**Lune support is marked experimental**, in Settings and in the docs. It has not yet been tested by an experienced Lune developer.",
		],
		fixed: [
			"**Settings and the Settings page no longer say the Rojo project file locates files.** Nothing reads it for that; node maps do.",
		],
		watch: [
			"A Lune graph with a Roblox-only node in it no longer compiles. Remove the node, or make the graph a Roblox one.",
		],
		verified: [
			"types", "variables-and-locals", "building-and-rojo", "hand-written-luau", "settings",
		],
	},
	{
		version: "0.27.0",
		date: "2026-09-11",
		headline: "Rotators across, and pictures that stay in their frames.",
		added: [
			"**CFrame from Z-Up Rotator**: pitch, yaw and roll in degrees, from an X-forward, Z-up tool, as a CFrame. The conversion is written into the call it compiles to.",
			"**A reviewed page can say what a verified pass still needs**, under its last-reviewed date.",
		],
		changed: [
			"**Above 100%, a picture in the docs grows past the column** into the room the page has, and a graph fits the larger frame rather than spilling out of it.",
		],
		fixed: [
			"**Rigid and angular wires no longer loop between nodes set close together.** A forward gap shorter than two wire stubs was routed as if the input were behind the output.",
			"**Node pictures at large preview sizes stay inside their frame.**",
		],
	},
	{
		version: "0.26.0",
		date: "2026-09-11",
		headline: "Z-up conversions, and docs pictures that match your editor.",
		added: [
			"**Z-Up Conversions**: Vector3 from Z-Up, CFrame from Z-Up Rotation and CFrame from Z-Up Transform, for coordinates that are X forward, Y right and Z up. Positions divide by Units Per Stud, 28 by default for centimetres. A transform's scale comes out separately, because a CFrame has none. *Coming from Blueprints* links each one from its type.",
			"**Wires and pins has pictures** for the pin menu, values on unwired inputs, and adding and removing pins.",
			"**Settings opens from the Docs window**, and has a **Docs** tab: the font the docs are read in — System, Serif, Wide or Monospace — and a preview size from 50% to 300%.",
		],
		changed: [
			"**The inspiration entry on Attributions carries its owner's trademark notice**, and says what Roswaal takes from it and what it does not. *NOTICE.md* says the same.",
			"**Node pictures in the docs follow your Wires and Node corners settings**, and show **+** and **−** on nodes that take a list and **default** on optional inputs left unset, as the canvas does. The static docs site draws the defaults.",
			"**Summaries, captions and paragraphs in the docs use the full width of the page.**",
			"**Release notes list the articles reviewed and verified in each release.**",
		],
		fixed: [
			"**A link from one docs page to another opens that page**, in the Docs window and on the static site. It opened a new tab at an address that did not exist.",
		],
		verified: ["wires-and-pins"],
	},
	{
		version: "0.25.2",
		date: "2026-09-11",
		headline: "Knots that tidy, and the first reviewed page.",
		changed: [
			"**The reroute knot picture shows knots at work**: two wires rise from nodes lower down, each to a knot, and run flat into the pins they feed.",
		],
		reviewed: ["coming-from-blueprints"],
	},
	{
		version: "0.25.1",
		date: "2026-09-11",
		headline: "Wires and pins, drawn.",
		changed: [
			"**Wires and pins shows its rules as graphs**: execution wires and Sequence, a wire in each pin colour, wires that fade where the type changes, and reroute knots.",
			"**A graph in the docs fades a wire from one colour to the other** where it joins pins of different types, as the canvas does.",
			"**The review badge sits under a page's summary** rather than beside its title.",
			"**The table of engine types moved** from *Roswaal types* to *Coming from Blueprints*. Outside that page and *Attributions*, the docs and the editor no longer name another engine.",
		],
		fixed: [
			"**A graph in the editor's Docs window fits its frame**, instead of opening at full size with its right-hand side cut off. Scroll, drag and double-click work on it again.",
		],
	},
	{
		version: "0.25.0",
		date: "2026-09-11",
		headline: "Review badges on the docs, and Ctrl+C without a prompt.",
		breaking: true,
		added: [
			"**Every documentation page says whether a person has read it.** A badge beside the title reads Pending review, Reviewed or Verified, and the foot of the page says when it was last reviewed. Every page starts as Pending review. `npm run docs:reviews` lists where each one stands.",
			"**Find First Child has Recursive**, an optional input that searches every descendant rather than only the children: `part:FindFirstChild(\"Handle\", true)`. Left unset, the call is unchanged.",
		],
		changed: [
			"**Wires and pins** and **Building, and node maps** are rewritten to match the current editor.",
			"**Declare Function has a red header**, the same as Function.",
		],
		fixed: [
			"**Ctrl+C stops** `roswaal serve` **and** `roswaal watch` **without a** `Terminate batch job (Y/N)?` **prompt** or a `^C` over the last line, when run through `bin/roswaal.cmd`.",
		],
		watch: [
			"**Find First Descendant is removed**, because Roblox has deprecated `FindFirstDescendant`. A graph using it no longer compiles, and the error says to use Find First Child with Recursive set.",
		],
	},
	{
		version: "0.24.3",
		date: "2026-09-09",
		headline: "Room around a function declared in the flow.",
		fixed: [
			"**A Declare Function gets a blank line either side**, the same as a hoisted one. Two run together read as a single block with an end somewhere in the middle of it.",
		],
	},
	{
		version: "0.24.2",
		date: "2026-09-09",
		headline: "Declare Function counts as a function everywhere.",
		fixed: [
			"**A graph with only Declare Function nodes compiles.** Every Get Function was reported as pointing at a function no longer in the graph, because the check only counted the hoisted node.",
			"**Declare Function can be chosen in a Get Function.** The dropdown listed it, took the click and discarded it, so the selection snapped back with nothing said.",
			"**Renaming one updates the references to it**, and it now appears in the palette as Get <name> and in hand-written Luau completions.",
		],
	},
	{
		version: "0.24.1",
		date: "2026-09-09",
		headline: "Declare Function hands its function over.",
		fixed: [
			"**A Declare Function node's function can be wired into a call.** Its `Function` output was reported as out of scope, because passing a function as a value was special-cased to the hoisted node.",
			"**Its header reads** `Declare Function (name)`, with the signature underneath, instead of replacing the node's name with the function's.",
		],
	},
	{
		version: "0.24.0",
		date: "2026-09-09",
		headline: "Declare a function where it belongs, or onto a table.",
		added: [
			"**Declare Function**, which declares a function where the node sits rather than at the top — the other half of Function, the way Declare Type is the other half of Declare Type at Top. Wire a table into **On Table** and it becomes `function TankConfig.read(tank: Model): Config`; leave it unwired for a plain `local function` at that point in the flow.",
		],
		watch: [
			"On Table has to resolve to a name — a variable or a local. Luau has no syntax for attaching a function to an expression, so anything else is refused rather than half-written.",
			"The function is named where it is declared, so a Get Function above it reports that it does not exist yet rather than naming a local that has not been reached.",
		],
	},
	{
		version: "0.23.1",
		date: "2026-09-09",
		headline: "Common types in one click, anything else one click further.",
		changed: [
			"**The type field is a list again, with Other… at the bottom of it.** The list holds this graph's own types, the basic ones, Roblox's values and the instance classes worth a click; Other… opens a field that takes any Luau type, suggesting every class. A type already set to something the list does not hold opens in the field.",
		],
	},
	{
		version: "0.23.0",
		date: "2026-09-09",
		headline: "Say Model, and put a call where a value goes.",
		added: [
			"**Call For Value**, a pure call. It has no execution wire, so a call can sit where a value goes — inside a table, an argument, an expression: `return { movementSpeed = readNumber(hullSettings, \"MovementSpeed\") }`. Call Function still binds its result to a local, which is what you want when the call changes something.",
			"**Any Luau type can be typed into a type field.** The dropdown of twelve is now a list attached to a text field: the same names, the Instance classes under them, and the types this graph declares above them.",
		],
		changed: [
			"**A pin's type is written as itself.** It used to be checked against a list of fifteen names, and anything else became `any` — so a parameter typed `Model` came out `any`, and so did one typed `Config`, a type the same file had just declared.",
			"**An Instance class fits an Instance pin.** A `Model` goes wherever an `Instance` is wanted. The other way round is a claim about the value rather than a fact about its type, so it still wants a Cast.",
		],
		watch: [
			"A graph with a pin typed as something the old list did not know was emitting `any` for it, and now emits the name. If that name is not a real Luau type, Luau will say so — which it could not do while the type was being thrown away.",
		],
	},
	{
		version: "0.22.1",
		date: "2026-09-09",
		headline: "Align reads the wires, and a knot stops keeping a type it lost.",
		added: [
			"**Get Name**, a pure node giving `instance.Name` as a `string`.",
		],
		fixed: [
			"**Align follows the wires out from the anchor** rather than the order you clicked. A chain picked out of order left its last hop bent — with a knot, a Get Full Name and a Concatenate, the first two came out flat and Concatenate did not. A selected node with no wired path to the anchor takes the anchor's top edge.",
			"**A knot takes the type of whatever is wired into it, and** `any` **when nothing is.** Its type was fixed when it was made, so cutting the wire into a string knot left a knot that still refused everything but a string — and the only way to rewire it was to delete it.",
			"**Shift- or ctrl-clicking a knot adds it to the selection.** Its pins cover most of it, so the click landed on a pin and cut the wire instead. Cutting still works on the wire itself, where you can see it.",
			"**A knot is easier to hit.** Its pins took 14 of its 22 pixels, leaving a 4px ring to click for selecting or moving it. The ring is 6px wider all round; starting a wire from the pin is unchanged.",
			"**Docs pages scroll past their last line**, so the end of a page can be read somewhere other than the bottom edge of the screen.",
		],
	},
	{
		version: "0.22.0",
		date: "2026-09-09",
		headline: "Straighten two nodes without relaying the whole graph.",
		added: [
			"**Align**, on `A`. Lines a selection up, walking it in the order you picked it. The first node — the anchor, drawn with a heavier ring — does not move; each one after it lines up on the most recently picked node before it that it is wired to, and failing that on the one immediately before it. Where two nodes are wired the pins line up rather than the boxes, so the wire comes out flat. Nothing moves sideways, and comments do not move.",
			"**A Controls page**, under Getting started: every key and mouse gesture the canvas has.",
			"**Get Class Name**, a pure node giving `instance.ClassName` as a `string`.",
		],
	},
	{
		version: "0.21.2",
		date: "2026-09-09",
		headline: "Declare Type says when a Type Of is one too many.",
		fixed: [
			"**Declare Type with a Type Of wired into it** now reports an error instead of emitting `typeof(typeof(x))`, which compiles and gives the type `string`.",
		],
	},
	{
		version: "0.21.1",
		date: "2026-09-09",
		headline: "Name the value a node gives you, without renaming the node.",
		added: [
			"**Result name**, on every node that returns a value. It is the local the result lands in — a Find First Child with the result name `value` emits `local value = ...` — and it shows under the node's header the way Declare Type shows the type it declares.",
		],
		changed: [
			"**A named node keeps its own name on the canvas.** Setting the result name leaves the header alone and adds the name beneath it; a label still replaces the header, as it always has.",
		],
		watch: [
			"A label on such a node still names the result when no result name is set, so graphs built before this emit exactly what they did.",
		],
	},
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
			"**The project tree is split into Graph content and Compile content.** One half you author and Roswaal reads; the other Roswaal writes and you do not edit. Each collapses, and an empty one says so.",
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
			"**Right-click a folder for New graph here and New map here.** They appear only for folders under the project's source directory — a graph written into the compiled output would be deleted by the next compile.",
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
			"**Installing Roswaal through npm produced a** `roswaal` **command that did not run on Windows.** npm read the `#!/bin/sh` line off the launcher and wrote a wrapper calling `sh`, which a Windows machine has no reason to have — the command failed with \"the term '/bin/sh.exe' is not recognized\". npm now installs a launcher it can wrap on every platform.",
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
			"**Opening a** `.luau` **file containing a** `--[[ ]]` **comment or a** `[[ ]]` **string emptied the whole page.** The syntax highlighter threw, React unmounted, and what was left was a black rectangle with no message. Every `.luau` file opens correctly now, generated or hand-written.",
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
			"**The** `strict` **checkbox is now a typechecking mode**, with three settings. *Default* writes no mode line at all, leaving the generated file to whatever the project says. *Nonstrict Mode* writes `--!nonstrict`, and *Strict Mode* writes `--!strict`.",
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
			"**The project name and the Variables heading had grown to twice their size.** They took their size, case and colour from a rule scoped to the old sidebar, which the dock work renamed out from under them.",
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
			"**Straighten is a preference rather than a stray** `localStorage` **key.** It behaves exactly as before, and is now in the settings panel with everything else.",
			"A **project setting that the daemon refuses now says so.** Writing `roswaal.json` was previously a promise nobody checked.",
		],
		fixed: [
			"**The** `<select>` **popup follows the theme.** Chromium paints that list outside the document, where `var(…)` does not resolve, so its colours were four literals copied out of the built-in schemes and stopped following any other palette.",
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
			"The read-only lock is **only outside dynamic compiling**. On Dynamic a compile follows every autosave, so locking on one would lock the canvas roughly whenever you stopped typing — and that mode exists precisely so that compiling is not something you think about. Outside it a compile is something you asked for and then wait for.",
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
			"The *Coming from Blueprints* page still called cast pins \"planned, not built\" a release after they shipped.",
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
			"The *Coming from Blueprints* page said Cast To maps to \"just index it\", which was wrong. It is two halves of one node: **Is A** asks at runtime and gives you a boolean to branch on, **Cast** asserts to the typechecker and emits nothing. Ask, then assert.",
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
];
