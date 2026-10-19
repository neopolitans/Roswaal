/**
 * Properties a script can read and not set: which they are, the lock the menus
 * draw on them, Set Property's picker leaving them out, and the warning when a
 * graph sets one anyway.
 */

import { describe, expect, it } from "vitest";
import { memberPresets } from "../src/app/memberPresets.js";
import { buildPresets, libraryItems, memberItems } from "../src/app/menuSearch.js";
import { propertyMatches, readOnlyNote } from "../src/app/PropertyField.jsx";
import { validate } from "../src/core/compiler/validate.js";
import { membersOfType } from "../src/core/members.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { readOnlyToScripts } from "../src/core/robloxEngine.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

describe("which properties are read-only to a script", () => {
	it("is what the engine marks read-only", () => {
		expect(readOnlyToScripts("BasePart", "AssemblyMass")).toBe(true);
		expect(readOnlyToScripts("BasePart", "Mass")).toBe(true);
		expect(readOnlyToScripts("Part", "ClassName")).toBe(true);
	});

	it("is not a hidden one a script sets every day", () => {
		expect(readOnlyToScripts("BasePart", "Position")).toBe(false);
		expect(readOnlyToScripts("BasePart", "Orientation")).toBe(false);
		expect(readOnlyToScripts("BasePart", "Anchored")).toBe(false);
	});

	it("is not a name the catalogue does not have, in any case", () => {
		expect(readOnlyToScripts("BasePart", "Nope")).toBe(false);
		expect(readOnlyToScripts("BasePart", "assemblymass")).toBe(false);
	});
});

/** A local `mantlet` holding a BasePart, and Set Property on it. */
function setOn(property: string, wired = true) {
	const b = new Builder();
	const start = b.node("script.begin");
	const local = b.node("local.declare", { config: { type: "BasePart" } });
	b.lit(local, "name", { t: "string", v: "mantlet" });
	const set = b.node("roblox.setProperty");
	b.lit(set, "property", { t: "string", v: property });
	b.link(start, "then", local, "in").link(local, "then", set, "in");
	if (wired) b.link(local, "ref", set, "instance");
	return { script: b.build(), set };
}

describe("the menus", () => {
	it("mark a read-only member, and only that", () => {
		const fields = membersOfType({ script: setOn("Name").script, registry }, "BasePart");
		expect(fields.find((f) => f.name === "AssemblyMass")?.readOnly).toBe(true);
		expect(fields.find((f) => f.name === "Position")?.readOnly).toBeUndefined();
	});

	it("carry the mark onto a local's member entries", () => {
		const { script } = setOn("Name");
		const base = buildPresets(script, null, registry);
		const items = libraryItems(registry, "roblox", memberPresets(base, script, registry, []));
		expect(items.find((i) => i.title === "mantlet.AssemblyMass")?.readOnly).toBe(true);
		expect(items.find((i) => i.title === "mantlet.Anchored")?.readOnly).toBeUndefined();
	});

	it("carry it onto the members of a dragged value", () => {
		const { script } = setOn("Name");
		const from = {
			ref: { node: "x", pin: "ref" },
			side: "out" as const,
			pin: { id: "ref", name: "", kind: "data" as const, type: "BasePart" },
		};
		const items = memberItems({ script, registry }, from);
		expect(items.find((i) => i.title === "Mass")?.readOnly).toBe(true);
	});
});

describe("Set Property's picker", () => {
	it("offers what a script can set, and names the read-only ones it matched", () => {
		const { settable, readOnly } = propertyMatches("BasePart", "Mas");
		expect(settable.map((p) => p.name)).toContain("Massless");
		expect(settable.map((p) => p.name)).not.toContain("Mass");
		expect(readOnly).toEqual(expect.arrayContaining(["Mass", "AssemblyMass"]));
	});

	it("puts names that start with the query first", () => {
		const names = propertyMatches("BasePart", "mass").readOnly;
		expect(names[0]).toBe("Mass");
	});

	it("says what was left out", () => {
		expect(readOnlyNote(["Mass", "AssemblyMass"], true)).toBe(
			"Mass and AssemblyMass are read-only.",
		);
		expect(readOnlyNote(["A", "B", "C", "D"], true)).toBe("A, B and 2 more are read-only.");
		expect(readOnlyNote(["A", "B", "C"], false)).toBe("3 read-only properties are left out.");
		expect(readOnlyNote([], true)).toBeNull();
	});
});

describe("Script analysis", () => {
	const warnings = (script: ReturnType<typeof setOn>["script"]) =>
		validate(script, registry).filter((d) => d.message.includes("read-only"));

	it("warns when a graph sets a read-only property", () => {
		const { script, set } = setOn("AssemblyMass");
		const found = warnings(script);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			severity: "warning",
			node: set,
			pin: "property",
			attention: true,
			message: '"AssemblyMass" is read-only on BasePart: Set Property cannot change it.',
		});
	});

	it("says nothing of one a script can set", () => {
		expect(warnings(setOn("Position").script)).toEqual([]);
	});

	it("says nothing when the wire does not say which class it is", () => {
		expect(warnings(setOn("AssemblyMass", false).script)).toEqual([]);
	});
});
