/**
 * The `variables-and-locals` page of the documentation. `buildSite` places it.
 */

import { GUIDE_SCENES } from "../examples.js";
import type { DocPage } from "../site.js";
import { VARIABLES_PAGE_PANEL } from "../toolbars.js";
import { code } from "./blocks.js";

export function variablesAndLocalsPage(): DocPage {
	return {
		slug: "variables-and-locals",
		narrow: true,
		title: "Variables and locals",
		summary:
			"Two different things, deliberately named apart — and what the code editor can see of each.",
		blocks: [
			{
				t: "p",
				text:
					"Roswaal has two ways to hold a value, and they are named apart because they behave " +
					"differently. The short version: a **variable** is yours to name and reach from " +
					"anywhere; a **local** exists for the length of a block and is reached by wire.",
			},
			{ t: "toolbar", bar: VARIABLES_PAGE_PANEL, hint: true },

			{ t: "h", level: 2, text: "Variables" },
			{
				t: "p",
				text:
					"Declared once in the **Variables panel** — a name, a type and a starting value — " +
					"and read or written by Get and Set nodes anywhere in the graph. A variable " +
					"compiles to a **file-level local**, so the main flow and " +
					"every function in the graph see the same one.",
			},
			{
				t: "ul",
				items: [
					"Drag one from the panel onto the canvas for a **Get**; hold **Ctrl** while you drop " +
						"for a **Set**.",
					"Right-click any unwired input pin and choose **Promote to Variable**. The new " +
						"variable takes the pin's type and whatever value was already typed into it, and " +
						"a Get is wired in where the literal was — so promoting never loses the value you " +
						"had.",
					"Renaming a variable in the panel renames every Get and Set of it at once. They " +
						"carry its id, not its name.",
					"The panel also lists this graph's **Locals**, **Functions** and **Types**. Click a " +
						"function to open its graph, or drag it out for a **Get Function**. Clicking a " +
						"local or a type goes to the graph its node is in.",
					"**×** on a local or a function deletes the node that declares it, and a function's " +
						"graph with it. The nodes that read it stay, and report an error until repointed.",
				],
			},
			{
				t: "note",
				kind: "info",
				text:
					"**A variable being read from is never hoisted.** It happens where it is used, so a Set between " +
					"two Gets is seen by the second.",
			},

			{
				t: "p",
				text:
					"**Binding**, in a variable's row, makes it a `const` — declared once at the top " +
					"of the file with the starting value you gave it, and never assigned again. A " +
					"**Set Variable** wired to one is refused, and so is **Initialize Variable**, " +
					"because a constant is given its value where it is declared. The row says `const` " +
					"beside the name, and so does a local's.",
			},

			{ t: "h", level: 2, text: "Locals" },
			{
				t: "p",
				text:
					"**Declare Local** binds a value mid-flow. It exists only inside the block that " +
					"declared it — which is the whole difference: a variable is reachable from anywhere, " +
					"a local only from inside its block. Wire its output onward, or drag it from the " +
					"**Locals** list in the Variables panel as a **Get Local**. Give it a type in the " +
					"Inspector and it is written after the name: `local restores: { [Model]: Restore } = {}`.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A local exists only inside the block that declared it, and blocks nested in it. " +
					"Reading it from a **sibling block** — the other arm of a Branch, another loop " +
					"body — or after its block ends is an error.",
			},
			{
				t: "p",
				text:
					"**Binding**, in the Inspector, makes it a `const` instead. A constant is the same " +
					"binding with one guarantee — the name cannot be reassigned after it is set — and " +
					"Roswaal refuses a **Set Local** wired to one rather than leaving it to the " +
					"runtime, naming the local that made the promise.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					const tuning = Config.Tuning
					tuning.turnRate = 60 -- fine: the table is not frozen
					tuning = {}          -- error: the name is
					`,
			},
			{
				t: "note",
				kind: "info",
				text:
					"The **binding** is fixed, not the value — `table.freeze` does that. `const` is new " +
					"to Luau; an older runtime refuses the file.",
			},

			{ t: "h", level: 2, text: "Parameters" },
			{
				t: "p",
				text:
					"A function's parameters are output pins on its entry node, in its " +
					"[graph](functions), and wiring one to whatever reads it works. In a function of any size those wires cross the whole " +
					"body — so **Get Parameter** reads one by name instead, the way Get Local reads a " +
					"local rather than wiring the Declare Local's output everywhere. Pick the function " +
					"and the parameter in the Inspector. The pins are still there; this is the other way.",
			},
			{
				t: "p",
				text:
					"It works inside an **event handler** as well as a function: Connect binds its " +
					"handler's parameters in the same way, so a Get Parameter in the handler's body " +
					"reads them just as it would a function's.",
			},
			{
				t: "note",
				kind: "warn",
				text:
					"A **Get Parameter** outside its function's body creates an error pointing to both — " +
					"the same scope rule as a local.",
			},
			{
				t: "p",
				text:
					"Renaming a parameter carries every node reading it along. **Reordering** them " +
					"leaves those nodes alone, because a Get Parameter holds the parameter's name and " +
					"not its position. **Removing** one leaves the node saying which parameter is " +
					"gone, rather than quietly reading whichever moved into its place.",
			},

			{ t: "h", level: 2, text: "Naming a result" },
			{
				t: "p",
				text:
					"A node that hands back a value has a **Result name** in the Inspector: the local " +
					"its result lands in. A Find First Child named `value` emits " +
					"`local value = parent:FindFirstChild(name)`. The name shows under the node's " +
					"header rather than replacing it, so the node goes on saying what it does.",
			},
			{
				t: "p",
				text:
					"Leave it blank and the name comes from the output pin. A **pure** node read in " +
					"one place is spliced into that place instead, binding nothing at all, and a step " +
					"nothing reads is written as a bare call. **Naming the result asks for the local " +
					'either way**: `local turretModel = need(model, "Turret", "Model")`.',
			},
			{
				t: "p",
				text:
					"**A step's named result is a local like any other.** It is listed under Locals in " +
					"the Variables panel, the node search offers **Get turretModel**, and Get Local " +
					"reads it wherever it is in scope, with no wire back to the call.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"**Wired only into a Declare Local, a setter or a table field, a result goes straight " +
					"in:** `local named = parent:FindFirstChild(name)`. Its Result name is used once " +
					"something else reads it too. A step folds only when that reader runs right after it.",
			},

			{ t: "h", level: 2, text: "What the code editor can see" },
			{
				t: "p",
				text:
					"Open a **Custom Code** or **Luau Expression** pin and the completion list is not " +
					"just Luau's globals. It is what the *generated file* will actually have in scope at " +
					"that point, worked out from the graph:",
			},
			{
				t: "table",
				head: ["Offered", "Because the emitter makes it"],
				rows: [
					["Your variables", "a file-level local, visible everywhere"],
					["Your functions", "a named local, visible after it is declared"],
					["Get Service and Require Module results", "hoisted to the top of the file"],
					[
						"Locals declared by **earlier Custom Code**",
						"real `local` statements in the same block, still alive when this one runs",
					],
				],
			},
			{
				t: "p",
				text:
					"That last row is the interesting one, and it follows the block structure rather " +
					"than the drawing order. A local from an earlier **Sequence** output *is* offered, " +
					"because those outputs run into the same block. One declared inside a loop body, a " +
					"connect handler, or the other arm of a Branch is *not* — it has died at its `end` " +
					"before this node runs. An outer local is still visible from inside a handler, " +
					"which is the direction that does work.",
			},
			{
				t: "graph",
				script: GUIDE_SCENES.localScope(),
				caption:
					"Sibling arms. The `local total` on the True side has gone out of scope by the time " +
					"the False side runs, so completion offers it in neither.",
			},
			{
				t: "note",
				kind: "good",
				text:
					"**The list follows Luau's scope**: a local declared inside an `if` or a loop in " +
					"Custom Code is offered inside it, and not after it closes.",
			},
			{
				t: "p",
				text:
					"A `require` in the code is followed from the file the graph compiles to, so its " +
					"members complete and hover with their docs. See [Reading your Luau](reading-luau).",
			},
			{
				t: "p",
				text:
					"Custom Code has no output pin, so it cannot hand a value onward by wire. To get " +
					"one out, write to a variable — or put **Declare Local** before it and assign to " +
					"that local in the code, which the completion list will offer by name. See " +
					"[Hand-written Luau](hand-written-luau) for what each of the two code nodes emits.",
			},
		],
	};
}
