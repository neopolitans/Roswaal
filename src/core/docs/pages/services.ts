/**
 * The `services` page of the documentation. `buildSite` places it.
 */

import { GUIDE_SCENES } from "../examples.js";
import type { DocPage, PageContext } from "../site.js";
import { code, previews } from "./blocks.js";

/**
 * Services and the methods on them.
 *
 * The answer to "how do I call `RunService:IsServer()`" — a catalogue, two
 * nodes and a picker — is not one a reader would guess from the palette.
 */
export function servicesPage({ registry }: PageContext): DocPage {
	return {
		slug: "services",
		title: "Services and their methods",
		summary: "Get Service, the two Service Function nodes, and the catalogue they read.",
		narrow: true,
		blocks: [
			{
				t: "p",
				text:
					"A Roblox script reaches the engine through **services**: `Players`, `RunService`, " +
					"`TweenService`. **Get Service** hands you one, and every node that asks for the " +
					"same service shares a single `local` at the top of the file — which is how a " +
					"hand-written module does it.",
			},
			{
				t: "p",
				text:
					"Calling a *method* on one is the other half. **Service Function** does something " +
					"— `Debris:AddItem`, `TweenService:Create` — and sits in the execution chain. " +
					"**Service Function (Value)** asks something — `RunService:IsServer`, " +
					"`Players:GetPlayers` — and has no execution pins, so it wires straight into the " +
					"Branch or the loop that wanted the answer.",
			},
			...previews(
				registry,
				["roblox.getService", "roblox.serviceValue", "roblox.serviceCall"],
				"Both Service Function nodes arrive blank. Pick the call in the Inspector, or " +
					"search the palette for the method by name and the node comes configured.",
			),
			{
				t: "graph",
				script: GUIDE_SCENES.serviceCall(),
				caption:
					"RunService:IsServer() as a value: no execution wire, and no Get Service node " +
					"either — the service is hoisted for it.",
			},
			{
				t: "code",
				lang: "luau",
				text: code`
					local RunService = game:GetService("RunService")

					if RunService:IsServer() then
						print("On the server")
					else
						print("On the client")
					end
					`,
			},

			{ t: "h", level: 2, text: "Asking a service what it can do" },
			{
				t: "p",
				text:
					"**Drag a wire off a service and drop it on empty canvas.** The menu opens on " +
					"that service's own methods, under its name — `GetPlayers`, `GetPlayerByUserId`, " +
					"`BanAsync` — and picking one places the node with the wire already landed on it. " +
					"Everything else the graph could do with an Instance is still underneath, where " +
					"it always is.",
			},
			{
				t: "p",
				text:
					"That wire lands on the node's first pin, which is the service the call is made " +
					"*on*. Left unwired it is nothing at all: the service is reached and hoisted the " +
					"way Get Service reaches it, and the node draws as the call. Wired, the value on " +
					"it is what the method runs against — which is what makes the gesture honest " +
					"rather than a shortcut that throws your wire away.",
			},

			{ t: "h", level: 2, text: "Picking the call" },
			{
				t: "p",
				text:
					"**Call** in the Inspector opens the picker — every method of every service, " +
					"grouped by service, searchable, with the signature under the highlighted row. " +
					"The palette knows them too: type `IsServer` into the node menu and the entry is " +
					"there, and picking it places the node already set to that call.",
			},
			{
				t: "p",
				text:
					"The service itself is in there by name as well: typing `ReplicatedStorage` " +
					"offers **Get Service** with the name filled in, and any other class name — " +
					"`Part`, `ProximityPrompt` — offers **New Instance** the same way.",
			},
			{
				t: "p",
				text:
					"Arguments arrive from the method's own signature: named, typed, and marked " +
					"optional where the engine documents a default. An optional argument nothing " +
					"set is **not passed at all** rather than passed as nil, which is the difference " +
					"between a call the engine accepts and one it rejects.",
			},
			{
				t: "ul",
				items: [
					"An **enum** argument is typed as its member name — `E`, `Begin` — and written " +
						"out in full as `Enum.KeyCode.E`. Wire one instead and the wire wins.",
					"A method that **returns nothing** has no Result pin, because a pin that can " +
						"only be nil is one somebody will try to use.",
					"A method that **yields** says so in the Inspector. Those are never offered as " +
						"the value node: a call that stops the thread belongs in the chain.",
				],
			},

			{ t: "h", level: 2, text: "Where the list comes from" },
			{
				t: "p",
				text:
					"The catalogue is built from Roblox's own documentation repository and shipped " +
					"with Roswaal, so nothing here talks to the network. It holds what a game script " +
					"may call: methods behind a security context are not offered, and neither are " +
					"deprecated ones. Methods a service inherits are included down to `Instance`, " +
					"which is where they stop — `Find First Child` and `Destroy` have nodes of their " +
					"own.",
			},
			{
				t: "note",
				kind: "info",
				text:
					"The list is a **snapshot, not a gate**: the picker takes whatever you type, so a " +
					"newer method compiles. Set its argument count in the Inspector.",
			},
			{
				t: "table",
				head: ["When", "Node"],
				rows: [
					["A method on a service, in the chain", "**Service Function**"],
					["A method on a service, as a value", "**Service Function (Value)**"],
					["A method on anything else — a part, a Humanoid, a module's table", "**Call Method**"],
					["The service itself, to wire somewhere", "**Get Service**"],
				],
			},
			{
				t: "p",
				text:
					"**Call Method** is the general one and is not going anywhere: it takes the object " +
					"as a wire, so it reaches anything a graph can hold. Service Function is worth " +
					"the second node because the signature is known — the arguments are named and " +
					"typed rather than a row of `any` you count yourself.",
			},
		],
	};
}
