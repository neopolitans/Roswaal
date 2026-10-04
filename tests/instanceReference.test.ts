/**
 * An instance dragged out of the DataModel into Custom Code, as the Luau that
 * reaches it.
 *
 * Code typed into a node cannot use the service locals the compiler hoists,
 * because they exist only when some node asked for one, so every reference
 * starts from `game:GetService`.
 */

import { describe, expect, it } from "vitest";

import { droppedText } from "../src/app/instanceDrop.js";
import {
	referenceExpression,
	referenceLocal,
	referenceName,
} from "../src/core/luau/instanceReference.js";

describe("the Luau for a dragged instance", () => {
	it("starts from the service and indexes down", () => {
		expect(referenceExpression({ path: ["ReplicatedStorage", "Tank", "Config"] })).toBe(
			'game:GetService("ReplicatedStorage").Tank.Config',
		);
	});

	it("brackets a name Luau would not take as a field", () => {
		expect(referenceExpression({ path: ["Workspace", "Spawn Pad", "end"] })).toBe(
			'game:GetService("Workspace")["Spawn Pad"]["end"]',
		);
	});

	it("reads a property or an attribute when that was dragged", () => {
		const humanoid = ["Workspace", "Rig", "Humanoid"];
		expect(referenceExpression({ path: humanoid, property: "Health" })).toBe(
			'game:GetService("Workspace").Rig.Humanoid.Health',
		);
		expect(referenceExpression({ path: humanoid, attribute: "Team" })).toBe(
			'game:GetService("Workspace").Rig.Humanoid:GetAttribute("Team")',
		);
	});

	it("names its local after what it reaches, made into an identifier", () => {
		expect(referenceName({ path: ["Workspace", "Spawn Pad"] })).toBe("Spawn_Pad");
		expect(referenceName({ path: ["Workspace", "2nd"] })).toBe("_2nd");
		expect(referenceName({ path: ["Workspace", "Rig"], property: "Name" })).toBe("Name");
		expect(referenceLocal({ path: ["ReplicatedStorage", "Tank"] })).toBe(
			'local Tank = game:GetService("ReplicatedStorage").Tank',
		);
	});
});

describe("where a drop lands", () => {
	const ref = { path: ["ReplicatedStorage", "Tank"] };

	it("writes a whole local on a blank line of Custom Code, after its indent", () => {
		const line = { from: 10, to: 12, text: "\t\t" };
		expect(droppedText(ref, "block", line, 11)).toEqual({
			from: 12,
			insert: 'local Tank = game:GetService("ReplicatedStorage").Tank',
		});
	});

	it("writes the expression alone inside a line, or in a box that holds one value", () => {
		const line = { from: 0, to: 9, text: "print() " };
		expect(droppedText(ref, "block", line, 6).insert).toBe(
			'game:GetService("ReplicatedStorage").Tank',
		);
		expect(droppedText(ref, "expression", { from: 0, to: 0, text: "" }, 0).insert).toBe(
			'game:GetService("ReplicatedStorage").Tank',
		);
	});
});
