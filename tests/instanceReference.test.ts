/**
 * An instance dragged out of the DataModel into Custom Code, as the Luau that
 * reaches it.
 *
 * With no name in scope to start from, a reference starts from
 * `game:GetService`, or `workspace`; since 0.151.0 it starts from the nearest
 * local that already holds part of the way.
 */

import { describe, expect, it } from "vitest";

import { droppedText } from "../src/app/instanceDrop.js";
import { graphInstanceLocals } from "../src/app/luauCompletions.js";
import {
	referenceExpression,
	referenceLocal,
	referenceName,
} from "../src/core/luau/instanceReference.js";
import { instanceLocalsAt } from "../src/core/luau/instances.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { emptyScript } from "../src/core/schema.js";

describe("the Luau for a dragged instance", () => {
	it("starts from the service and indexes down", () => {
		expect(referenceExpression({ path: ["ReplicatedStorage", "Tank", "Config"] })).toBe(
			'game:GetService("ReplicatedStorage").Tank.Config',
		);
	});

	it("brackets a name Luau would not take as a field", () => {
		expect(referenceExpression({ path: ["Workspace", "Spawn Pad", "end"] })).toBe(
			'workspace["Spawn Pad"]["end"]',
		);
	});

	it("reads a property or an attribute when that was dragged", () => {
		const humanoid = ["Workspace", "Rig", "Humanoid"];
		expect(referenceExpression({ path: humanoid, property: "Health" })).toBe(
			"workspace.Rig.Humanoid.Health",
		);
		expect(referenceExpression({ path: humanoid, attribute: "Team" })).toBe(
			'workspace.Rig.Humanoid:GetAttribute("Team")',
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

/**
 * A drop that knows what is in scope, since 0.151.0: it starts from the
 * nearest name that already holds part of the path, and does not declare a
 * second local for an instance one already holds.
 */
describe("a drop that knows the names in scope", () => {
	const config = { path: ["ReplicatedStorage", "Shared", "Config"] };

	it("starts from the local that holds the most of the way", () => {
		const known = [
			{ name: "ReplicatedStorage", path: ["ReplicatedStorage"] },
			{ name: "Shared", path: ["ReplicatedStorage", "Shared"] },
		];
		expect(referenceExpression(config, known)).toBe("Shared.Config");
		expect(referenceExpression(config, known.slice(0, 1))).toBe("ReplicatedStorage.Shared.Config");
		expect(referenceLocal(config, known)).toBe("local Config = Shared.Config");
	});

	it("gives the name of a local that holds the instance already, not a second one", () => {
		const known = [{ name: "Config", path: config.path }];
		expect(referenceLocal(config, known)).toBe("Config");
		expect(referenceExpression(config, known)).toBe("Config");
		// A property of it is still read off it.
		expect(referenceLocal({ ...config, property: "Name" }, known)).toBe("local Name = Config.Name");
	});

	it("takes the nearest of two that hold as much", () => {
		const known = [
			{ name: "Here", path: ["ReplicatedStorage"] },
			{ name: "Further", path: ["ReplicatedStorage"] },
		];
		expect(referenceExpression(config, known)).toBe("Here.Shared.Config");
	});

	it("ignores a local that holds somewhere else", () => {
		const known = [{ name: "Tools", path: ["ServerStorage", "Tools"] }];
		expect(referenceExpression(config, known)).toBe(
			'game:GetService("ReplicatedStorage").Shared.Config',
		);
	});

	it("passes what it knows from the drop to the line it writes", () => {
		const known = [{ name: "Shared", path: ["ReplicatedStorage", "Shared"] }];
		expect(droppedText(config, "block", { from: 0, to: 1, text: "\t" }, 1, known).insert).toBe(
			"local Config = Shared.Config",
		);
		expect(droppedText(config, "block", { from: 0, to: 7, text: "print()" }, 6, known).insert).toBe(
			"Shared.Config",
		);
	});
});

describe("the locals code declares that hold instances", () => {
	const src = [
		'local RS = game:GetService("ReplicatedStorage")',
		"local Shared = RS.Shared",
		'local Config = Shared:WaitForChild("Config")',
		"local count = 5",
		"",
	].join("\n");

	it("are read off the code, nearest first, through other locals", () => {
		const locals = instanceLocalsAt(src, src.length);
		expect(locals.map((l) => `${l.name}=${l.path.join(".")}`)).toEqual([
			"Config=ReplicatedStorage.Shared.Config",
			"Shared=ReplicatedStorage.Shared",
			"RS=ReplicatedStorage",
		]);
	});

	it("are only those in scope where the code is dropped", () => {
		const at = src.indexOf("local Shared");
		expect(instanceLocalsAt(src, at).map((l) => l.name)).toEqual(["RS"]);
	});
});

describe("the graph's names that hold instances", () => {
	it("include the services its Get Service nodes hoist", () => {
		const script = {
			...emptyScript("Doors", "doors"),
			nodes: [
				{
					id: "rs",
					def: "roblox.getService",
					x: 0,
					y: 0,
					literals: { service: { t: "string" as const, v: "ReplicatedStorage" } },
				},
				{ id: "code", def: "code.custom", x: 200, y: 0 },
			],
		};
		expect(graphInstanceLocals(script, createRegistry(), "code")).toEqual([
			{ name: "ReplicatedStorage", path: ["ReplicatedStorage"] },
		]);
	});
});
