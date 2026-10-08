/**
 * The `casting` page of the documentation. `buildSite` places it.
 */

import type { Registry } from "../../nodes/index.js";
import type { Block, DocPage, PageContext } from "../site.js";
import { code, previews } from "./blocks.js";

/**
 * Luau's types, where a graph meets them.
 *
 * A page of its own rather than a section of *Roswaal types*: a type can be
 * declared in three shapes, a local and a variable can carry one, a required
 * module's types can be named, and a type that is more than a name is written
 * into the file as itself. That is a page, not a footnote.
 */
export function castingPage({ registry }: PageContext): DocPage {
	return {
		slug: "casting",
		title: "Casting and annotations",
		summary:
			"Where a pin's type ends and Luau's begins: casts, declared types, and what gets written.",
		narrow: true,
		blocks: castingBlocks(registry),
	};
}

/**
 * Its blocks, which need the registry: the pictures are drawn from the live
 * definitions, so a node that changes shape changes here too.
 */
function castingBlocks(registry: Registry): Block[] {
	return [
		{
			t: "p",
			text:
				"There are two type systems here and they are not the same size. A **pin type** is " +
				"Roswaal's: one name, used to decide what may be wired to what and what colour to " +
				"draw it. A **Luau type** is whatever Luau can say — unions, optionals, table " +
				"types, functions, generics. Everything on this page is one of the places the " +
				"second one reaches the file.",
		},

		{ t: "h", level: 2, text: "Casting" },
		{
			t: "p",
			text:
				"**Cast** takes any Luau type expression verbatim, so an intersection, a union or a " +
				"table type all work — its Type pin is typed in rather than wired, because the text " +
				"becomes part of the generated code. Its picker lists this graph's own types first, " +
				"then those a required module exports.",
		},
		{
			t: "p",
			text:
				"Off a value, type the type's name into the node menu: `Motor6D` offers **Cast to " +
				"Motor6D**, already wired and set.",
		},
		{
			t: "p",
			text:
				"All three are drawn as **pills**, the shape the comparisons, the arithmetic and " +
				"**and** / **or** use: the value and the type down the left, the symbol in the middle, the result on " +
				"the right. A cast *is* an operator, and the shape is the point — a claim made " +
				"without a check is worth spotting at a glance rather than after reading a header.",
		},
		{
			t: "p",
			text:
				"**Shows**, in the Inspector, swaps the `::` for the node's name where that reads " +
				"better — `::` is Luau's own and is the one symbol here nobody arrives already " +
				"knowing. It is stored on the node, because it sets the pill's width; **New cast " +
				"nodes** in Settings decides what a cast you drop today starts as.",
		},
		{
			t: "p",
			text:
				"The Type pin is a **list you pick from**: Luau's own types, then Roblox's " +
				"datatypes, then every Instance class, grouped as the class picker groups them. " +
				"Still only a suggestion — whatever you type is committed, which is how an " +
				"intersection like `Model & { Humanoid: Humanoid }` is written.",
		},
		...previews(
			registry,
			["cast.as", "cast.array", "cast.any"],
			"The three of them. The type is picked from the list or typed, and either way it " +
				"becomes text in the generated file rather than a value at runtime.",
		),
		{
			t: "code",
			lang: "luau",
			text: "local humanoid = (character :: Model & { Humanoid: Humanoid }).Humanoid",
		},
		{
			t: "table",
			head: ["Node", "Writes", "For"],
			rows: [
				[
					"**Cast**",
					"`(value :: T)`",
					"Saying what a value is, when you know and the typechecker does not.",
				],
				[
					"**Cast Array**",
					"`(value :: { T })`",
					"A collection you know more about than its type says — Get Descendants is `{ Instance }`.",
				],
				[
					"**Cast Through Any**",
					"`((value :: any) :: T)`",
					"Two types Luau will not convert between directly. The `any` in the middle is the claim being made twice.",
				],
			],
		},
		{
			t: "note",
			kind: "warn",
			text:
				"`::` is a **claim, not a check** — nothing tests it at runtime. Ask with **Is A** " +
				"first, which narrows the type for its branch.",
		},
		...previews(
			registry,
			["instance.isA"],
			"Is A asks the question a cast assumes the answer to. Branch on it, and cast inside " +
				"the arm where it is true.",
		),

		{ t: "h", level: 2, text: "Where the cast is written" },
		{
			t: "p",
			text:
				"A cast is the one value node whose *line* can be the point. **Cast** in the " +
				"Inspector chooses which of three:",
		},
		{
			t: "table",
			head: ["Cast", "Writes", "For"],
			rows: [
				[
					"**Automatic**",
					"A line once two things read it",
					"The default, and the rule every pure node follows. One reader gets it spliced; two get `local part = value :: BasePart` and then read `part`.",
				],
				[
					"**Explicit**",
					"Always a line",
					"Several statements below read it and you would rather see the claim written once, above them, than repeated at each use.",
				],
				[
					"**Implicit**",
					"Never a line",
					"The assertion is spliced where it is used — and dropped entirely where Luau has already narrowed the value itself.",
				],
			],
		},
		{
			t: "h",
			level: 3,
			text: "An implicit cast inside an Is A branch disappears",
		},
		{
			t: "p",
			text:
				"Luau narrows a value for the length of the arm that tested it. Inside " +
				'`if part:IsA("BasePart") then`, `part` **is** a BasePart as far as the ' +
				"typechecker is concerned, and a cast there tells it nothing it does not know. An " +
				"implicit Cast in that arm therefore writes nothing at all and hands the value " +
				"through, which is what the hand-written Luau does too.",
		},
		{
			t: "code",
			lang: "luau",
			text: code`
				for _, part in character:GetDescendants() do
					if part:IsA("BasePart") then
						-- an implicit Cast to BasePart here writes nothing
						part.Transparency = 1
					elseif part:IsA("Decal") or part:IsA("Texture") then
						-- and here, a cast to \`Decal | Texture\` writes nothing either
						part.Transparency = 1
					end
				end
				`,
		},
		{
			t: "p",
			text:
				"Two classes tested with **Or** narrow the value to *either* of them, so the claim " +
				"that matches is the union — `Decal | Texture` — and that is the one that " +
				"disappears. A cast to only one half stays, because the Or did not prove it. **And** " +
				"narrows everything both sides tested, since both hold.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"The match must be **exact**: the branch's classes and the cast's must be the same " +
				"set, or the cast is written. **Settings → Compiling → Casts proved by a subclass** also " +
				'leaves one out when the branch proved a derived class — `IsA("Part")` for a ' +
				"cast to `BasePart`.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"The narrowing applies only in the **True arm**. In the False arm, or after the " +
				"`end`, the cast is written out.",
		},

		{ t: "h", level: 2, text: "Casting a call's result" },
		{
			t: "p",
			text:
				"A call node's **Cast result**, in the Inspector, writes the cast after the call: " +
				'`local hull = need(model, "Hull", "BasePart") :: BasePart`. Its result pin and ' +
				"its named local take that type, so nothing after it needs a Cast node. It is offered " +
				"on any call with one result: click **No cast** to pick a type, and × to remove it. " +
				"The result pin shows the cast as `:: BasePart`.",
		},

		{ t: "h", level: 2, text: "Declaring a type" },
		{
			t: "p",
			text:
				"**Declare Type at Top** writes above everything else; **Declare Type** writes where " +
				"the node sits, which is what a type built from `typeof` needs, because Luau reads a " +
				"file in order. Both take three shapes:",
		},
		...previews(
			registry,
			["type.declareTop", "type.declareHere"],
			"The hoisted one has no pins at all — it declares rather than runs. The in-flow one " +
				"sits in the execution chain, and shows a Value pin only for the typeof shape.",
		),
		{
			t: "table",
			head: ["Shape", "Writes", "When"],
			rows: [
				[
					"**Table of Fields**",
					"`{ walkSpeed: number, weld: WeldConstraint? }`",
					"A record. The fields are rows in the Inspector, so a brace cannot go missing. **Layout** writes it on one line or one field to a line, as Make Dictionary does.",
				],
				[
					"**Custom Luau**",
					"What you write in the Code panel, checked as a type",
					"A union, a function type, a generic — everything the row editor cannot say.",
				],
				[
					"**Type of a Value**",
					"`typeof(Tuning)`",
					"The type of something the file already has. Declare Type only, since a hoisted type is written above every value there is.",
				],
			],
		},
		{
			t: "note",
			kind: "info",
			text:
				"A declared type is **exported** unless you untick it, so other graphs can name it. " +
				"Exported inside a branch, loop or function, it is refused: `export type` is " +
				"top-level only.",
		},

		{ t: "h", level: 2, text: "Reading what a type holds" },
		{
			t: "p",
			text:
				"**Get Member** reads a field off a value whose type declares one: wire the value " +
				"in and its type's fields are the list. The result is typed as the field is, so " +
				"`aim` on the type above gives a Vector3 pin and the wire from it is a Vector3's " +
				"colour.",
		},
		{
			t: "p",
			text:
				"It is one line — the access it writes, one input, one output — and which member " +
				"it reads is chosen in the **Inspector**. Type `input.` into either node search " +
				"and the members of everything the graph names are there: picking one places the " +
				"getter and the Get Member on it, wired.",
		},
		{
			t: "p",
			text:
				"**Drag a wire out of a typed pin** and that type's members are in the menu under " +
				"their own heading — a Part's properties, a declared type's fields. Picking one " +
				"places a Get Member already wired to the pin you dragged.",
		},
		...previews(
			registry,
			["value.member", "value.field"],
			"Get Member offers what the type declares; Get Field reads any key you name.",
		),
		{
			t: "table",
			head: ["Where the members come from", "When"],
			rows: [
				[
					"**A type this graph declares**",
					"A Declare Type of either kind, entered as fields or written as a table.",
				],
				[
					"**A type a required module exports**",
					"`Config.Tuning`, read from the graph that declares it.",
				],
				[
					"**A Roblox class**",
					"`BasePart.Position`, `Humanoid.WalkSpeed`. Roblox graphs only — a Lune program has no instances.",
				],
			],
		},
		{
			t: "p",
			text:
				"**A node that names a class hands back that class.** New Instance set to `Part` " +
				"gives a Part, not an Instance, and so do Get Service and the Find First Child " +
				"and Ancestor nodes that take a Class Name. That is what puts a class's own " +
				"properties in Get Member's list without a Cast first. The Find First nodes can " +
				"find nothing, so in Nonstrict and Strict the file casts to `Part?`. A Class Name " +
				"wired from a **String** keeps its class; from anything else, it is an `Instance`.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"**Use Get Field for a table whose keys come and go.** A type without fixed fields " +
				"offers no members, and a member this graph's own type lacks is refused.",
		},

		{ t: "h", level: 2, text: "What Roswaal writes for you" },
		{
			t: "p",
			text:
				"Annotations follow the graph's **typechecking mode**, in the Inspector with nothing selected. " +
				"*Default* writes no mode line and no annotations; *Nonstrict* and *Strict* write " +
				"both. So a type you set is a type that appears — in the two modes that asked for " +
				"types at all.",
		},
		...previews(
			registry,
			["local.declare", "local.get"],
			"Declare Local carries the type, and shows it under its title once set. Get Local " +
				"reads the value by name, with its pin taking the type's own colour.",
		),
		{
			t: "table",
			head: ["Set on", "Comes out as"],
			rows: [
				["A variable, in the Variables panel", "`local health: number = 100`"],
				["A variable set to **const**", "`const health: number = 100`"],
				["A **Declare Local**, in the Inspector", "`local restores: { [Model]: Restore } = {}`"],
				["A function's parameters and returns", "`local function read(tank: Model): Config`"],
				["A node that produces a value", "`local part: BasePart = ...`"],
			],
		},
		{
			t: "p",
			text:
				"**A type that is more than a name is written as itself.** `{ [Model]: Restore }`, " +
				"`Model?` and `(number) -> string` used to come out as `any` with nothing said about " +
				"it; they are written as typed now, and a mistake in one is Luau's to report with a " +
				"line number. Text that is plainly not a type — two words, an unclosed brace — still " +
				"becomes `any`, because writing it would break the file rather than the line.",
		},

		{ t: "h", level: 2, text: "Choosing one" },
		{
			t: "p",
			text:
				"Everywhere a type is chosen — a variable, a parameter, a local, a field of a " +
				"declared type — the control is the **picker**: the same window the Class Name " +
				"pins and the casts open. Search at the top, everything under it, grouped by " +
				"where each type comes from.",
		},
		{
			t: "p",
			text:
				"The headings are ordered by how close to hand they are: **this graph's own** " +
				"declared types first, then the types **a required module exports**, written as " +
				"you would write them (`Config.Tuning`), then Luau's own, then Roblox's values — " +
				"and after those the instance classes, grouped the way the engine groups them.",
		},
		{
			t: "p",
			text:
				"**Whatever you type is taken**, listed or not, which is how a type the list " +
				"could never hold is set: `{ [Model]: Restore }`, `Model?`, `(number) -> string`. " +
				"Clearing it means `any`.",
		},
		{
			t: "note",
			kind: "info",
			text:
				"**Declare a long type once, then pick it by name:** **Custom Luau** on a Declare " +
				"Type for a union or function type, or **Type of a Value** for `typeof(Tuning)`. It " +
				"appears under *This graph* in every picker.",
		},
		{
			t: "p",
			text:
				"The Variables panel lists those same types under **Types**. Drag one onto the " +
				"canvas for a **Declare Local** of that type, or hold Ctrl for a **Cast** to it — " +
				"the same Get-or-Set convention a variable follows.",
		},

		{ t: "h", level: 2, text: "What a pin type still decides" },
		{
			t: "p",
			text:
				"A wire is allowed when the two pins agree, when either is `any` or `wildcard`, " +
				"between `number` and `string` because Luau converts those itself, and from an " +
				"**instance class to an** `Instance` **pin** — a `Model` goes anywhere an `Instance` is " +
				"wanted. The editor and the compiler ask the same question, so a wire the canvas " +
				"accepts is never one the compile complains about.",
		},
		{
			t: "note",
			kind: "warn",
			text:
				"The other direction needs a **Cast**. Drop an `Instance` wire on a `Model` pin and " +
				"one is placed for you, so the claim shows in the graph. Two unrelated classes are " +
				"refused, with the reason.",
		},
	];
}
