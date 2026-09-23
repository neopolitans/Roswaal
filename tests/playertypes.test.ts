/**
 * The Players nodes say what they hand back.
 *
 * Local Player, Local Character and Get Player From Character were typed
 * `Instance`, so a Get Member on them offered what every Instance has and
 * none of a Player's own — no UserId, no Character.
 */

import { describe, expect, it } from "vitest";

import { membersFor } from "../src/core/members.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** What a Get Member wired to `def`'s `pin` offers. */
function offered(def: string, pin: string): string[] {
	const b = new Builder();
	const source = b.node(def);
	const read = b.node("value.member");
	b.link(source, pin, read, "object");
	return membersFor({ script: b.build(), registry }, read).map((m) => m.name);
}

describe("the Players nodes", () => {
	it("hand back a Player from Local Player", () => {
		expect(offered("players.localPlayer", "player")).toEqual(
			expect.arrayContaining(["UserId", "Character", "DisplayName"]),
		);
	});

	it("hand back a Player from Get Player From Character", () => {
		expect(offered("players.fromCharacter", "result")).toContain("UserId");
	});

	it("hand back a Model from Local Character", () => {
		expect(offered("players.localCharacter", "character")).toContain("PrimaryPart");
	});

	it("go on to the member's own class: a Player's Character is a Model", () => {
		const b = new Builder();
		const player = b.node("players.localPlayer");
		const character = b.node("value.member", { config: { member: "Character", type: "Model" } });
		const read = b.node("value.member");
		b.link(player, "player", character, "object");
		b.link(character, "result", read, "object");
		expect(membersFor({ script: b.build(), registry }, read).map((m) => m.name)).toContain("PrimaryPart");
	});
});
