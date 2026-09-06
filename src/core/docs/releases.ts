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
}

/** Newest first. */
export const RELEASES: Release[] = [
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
