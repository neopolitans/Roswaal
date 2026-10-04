/**
 * An instance's events, as On Event and Connect Event read them.
 */

import { describe, expect, it } from "vitest";

import { eventOf, eventsOf, luauTypeOf } from "../src/core/robloxEvents.js";

describe("an instance's events", () => {
	/** A Part fires Touched because BasePart declares it. */
	it("includes what its ancestors declare", () => {
		const names = eventsOf("Part").map((e) => e.name);
		expect(names).toContain("Touched");
		expect(names).toContain("ChildAdded");
		expect(eventOf("Part", "Touched")?.owner).toBe("BasePart");
	});

	it("lists its own before its ancestors', once each", () => {
		const events = eventsOf("Part");
		expect(events.findIndex((e) => e.name === "Touched")).toBeLessThan(
			events.findIndex((e) => e.name === "ChildAdded"),
		);
		expect(new Set(events.map((e) => e.name)).size).toBe(events.length);
	});

	it("leaves deprecated ones out", () => {
		expect(eventsOf("BasePart").map((e) => e.name)).not.toContain("LocalSimulationTouched");
	});

	it("types the handler's parameters as Luau writes them", () => {
		expect(eventOf("Part", "Touched")?.params).toEqual([{ name: "otherPart", type: "BasePart" }]);
		expect(eventOf("Players", "PlayerAdded")?.params).toEqual([{ name: "player", type: "Player" }]);
	});

	it("has nothing for a class it does not know", () => {
		expect(eventsOf("NotAClass")).toEqual([]);
		expect(eventsOf(undefined)).toEqual([]);
		expect(eventOf("Part", "NotAnEvent")).toBeUndefined();
	});
});

describe("an engine type as Luau", () => {
	it("maps the documentation's names", () => {
		expect(luauTypeOf("int")).toBe("number");
		expect(luauTypeOf("float")).toBe("number");
		expect(luauTypeOf("bool")).toBe("boolean");
		expect(luauTypeOf("Content")).toBe("string");
		expect(luauTypeOf("Array")).toBe("{ any }");
		expect(luauTypeOf("Dictionary")).toBe("{ [any]: any }");
		expect(luauTypeOf("UserInputState")).toBe("Enum.UserInputState");
		expect(luauTypeOf("Vector3")).toBe("Vector3");
		expect(luauTypeOf("Player")).toBe("Player");
	});

	it("keeps an optional value optional, and calls the unknown any", () => {
		expect(luauTypeOf("string?")).toBe("string?");
		expect(luauTypeOf("Variant")).toBe("any");
		expect(luauTypeOf("Tuple")).toBe("any");
		expect(luauTypeOf("SomethingNew")).toBe("any");
	});
});
