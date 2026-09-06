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
