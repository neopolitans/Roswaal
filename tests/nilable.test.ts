/**
 * What can be `nil` says so: `Player.Character` is a `Model?`.
 *
 * Roblox's Creator Documentation types these as the class alone, so the list
 * is kept by hand in `robloxNilable.ts`. The pin stays the class — it wires,
 * colours and offers members as one — and carries the `?` beside it.
 */

import { describe, expect, it } from "vitest";

import { membersFor, membersOfType } from "../src/core/members.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { pinTypeText } from "../src/core/nodes/variables.js";
import { NILABLE_PROPERTIES, nilableProperty } from "../src/core/robloxNilable.js";
import { propertiesOf } from "../src/core/robloxProperties.js";
import { isInstanceClass } from "../src/core/roblox.js";
import { hoverAt } from "../src/core/luau/hover.js";
import { pinColor } from "../src/app/palette.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

function outputOf(def: string, pin: string, config?: Record<string, unknown>) {
	const found = registry.get(def)!;
	return resolveNodePins(found, config).outputs.find((p) => p.id === pin)!;
}

describe("the nil-able properties", () => {
	it("are each a class-typed property the class really has", () => {
		for (const [className, names] of Object.entries(NILABLE_PROPERTIES)) {
			for (const name of names) {
				const property = propertiesOf(className).find((p) => p.name === name);
				expect(property, `${className}.${name}`).toBeDefined();
				expect(isInstanceClass(property!.type), `${className}.${name}: ${property!.type}`).toBe(true);
			}
		}
	});

	it("are found from a derived class", () => {
		expect(nilableProperty("Player", "Character")).toBe(true);
		expect(nilableProperty("Part", "Parent")).toBe(true);
		expect(nilableProperty("Weld", "Part0")).toBe(true);
		expect(nilableProperty("Part", "Anchored")).toBe(false);
		expect(nilableProperty("Workspace", "CurrentCamera")).toBe(false);
	});
});

describe("Player.Character", () => {
	it("is offered to Get Member as a Model?", () => {
		const character = membersOfType({ script: { nodes: [], links: [], target: "roblox" }, registry }, "Player")
			.find((m) => m.name === "Character");
		expect(character?.type).toBe("Model?");
	});

	it("gives a Model pin that says it can be nil", () => {
		const pin = outputOf("value.member", "result", { member: "Character", type: "Model?" });
		expect(pin.type).toBe("Model");
		expect(pinTypeText(pin)).toBe("Model?");
		expect(pinTypeText(outputOf("value.member", "result", { member: "UserId", type: "number" }))).toBe("number");
	});

	it("still offers a Model's members", () => {
		const b = new Builder();
		const player = b.node("players.localPlayer");
		const character = b.node("value.member", { config: { member: "Character", type: "Model?" } });
		const read = b.node("value.member");
		b.link(player, "player", character, "object");
		b.link(character, "result", read, "object");
		expect(membersFor({ script: b.build(), registry }, read).map((m) => m.name)).toContain("PrimaryPart");
	});

	it("is a Model? on hover", () => {
		const src = "local player: Player = game.Players.LocalPlayer\nprint(player.Character)";
		expect(hoverAt(src, src.indexOf("Character") + 2)?.code).toBe("Player.Character: Model?");
	});

	it("is drawn in a Model's colour", () => {
		expect(pinColor("Model?", "data")).toBe(pinColor("Model", "data"));
	});
});

describe("the nodes that can hand back nil", () => {
	it("say so on their pins", () => {
		expect(pinTypeText(outputOf("players.localCharacter", "character"))).toBe("Model?");
		expect(pinTypeText(outputOf("players.fromCharacter", "result"))).toBe("Player?");
		expect(pinTypeText(outputOf("roblox.findFirstChild", "result"))).toBe("Instance?");
		expect(pinTypeText(outputOf("instance.findFirstAncestor", "result"))).toBe("Instance?");
		expect(pinTypeText(outputOf("instance.findFirstChildOfClass", "result"))).toBe("Humanoid?");
	});

	it("do not say it where the value is always there", () => {
		expect(pinTypeText(outputOf("players.localPlayer", "player"))).toBe("Player");
	});
});
