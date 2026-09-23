/**
 * The call the cursor is inside, and which parameter it is on — found from the
 * tokens before the cursor, so it works while the call is still being typed.
 */

import { describe, expect, it } from "vitest";

import { signatureAt } from "../src/core/luau/signature.js";

/** `label(a, [b])` with the active parameter bracketed, at `|`. */
function at(source: string, roblox = true): string | null {
	const pos = source.indexOf("|");
	const s = signatureAt(source.replace("|", ""), pos, roblox);
	if (!s) return null;
	const params = s.params.map((p, i) => (i === s.active ? `[${p.name}]` : p.name));
	return `${s.label}(${params.join(", ")})${s.returns ? ` -> ${s.returns}` : ""}`;
}

describe("signatureAt", () => {
	it("shows Instance.new's first parameter as soon as the bracket opens", () => {
		expect(at("Instance.new(|")).toBe("Instance.new([className], parent)");
	});

	it("moves to the next parameter after a comma", () => {
		expect(at('Instance.new("Part", |')).toBe("Instance.new(className, [parent])");
	});

	it("does not count the commas of a call nested inside", () => {
		expect(at("Vector3.new(f(1, 2), |")).toBe("Vector3.new(x, [y], z)");
	});

	it("reads a service's method on a local that holds the service", () => {
		expect(at('local players = game:GetService("Players")\nplayers:GetPlayerByUserId(|'))
			.toBe("players:GetPlayerByUserId([userId]) -> Player");
	});

	it("shows nothing for a call it does not know, or inside a table", () => {
		expect(at("print(|")).toBeNull();
		expect(at("Vector3.new({1, |")).toBeNull();
	});

	it("shows nothing once the bracket is closed", () => {
		expect(at("Instance.new('Part')|")).toBeNull();
	});

	it("shows nothing Roblox's in a Lune graph", () => {
		expect(at("Instance.new(|", false)).toBeNull();
	});
});
