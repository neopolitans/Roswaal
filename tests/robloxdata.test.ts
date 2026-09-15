/**
 * The engine's vocabulary, and the lists built on it.
 *
 * `robloxData.ts` is generated from a local export of the Creator Hub, so what
 * is worth asserting is not its contents — that is Roblox's to decide — but the
 * shape of it and the rules the editor layers on top. A generated file that
 * quietly came back half empty would otherwise turn a dropdown into a text box
 * and nothing would fail.
 */

import { describe, expect, it } from "vitest";

import {
	CLASSES, DATATYPES, ENUMS, LIBRARIES, LUAU_GLOBALS, ROBLOX_GLOBALS,
} from "../src/core/robloxData.js";
import {
	CLASS_OPTIONS, classChain, classGroup, INSTANCE_CLASSES, isInstanceClass, isSubclassOf,
} from "../src/core/roblox.js";
import { typesCompatible } from "../src/core/compiler/validate.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { searchTypes } from "../src/app/TypePicker.jsx";
import { defOf, draftOf, newDraft, type DraftPin } from "../src/app/designer/draft.js";

const registry = createRegistry();

describe("the generated vocabulary", () => {
	const lists = { CLASSES, ENUMS, DATATYPES, LIBRARIES, LUAU_GLOBALS, ROBLOX_GLOBALS };

	for (const [name, list] of Object.entries(lists)) {
		it(`${name} is there and is not a stub`, () => {
			expect(list.length, name).toBeGreaterThan(10);
			expect(new Set(list).size, `${name} has no duplicates`).toBe(list.length);
		});

		it(`${name} holds names and nothing else`, () => {
			for (const entry of list) expect(entry, name).toMatch(/^[A-Za-z][A-Za-z0-9_.]*$/);
		});
	}

	/** The page furniture that got through the first time it was extracted. */
	it("keeps the documentation's own markup out of the globals", () => {
		for (const global of [...LUAU_GLOBALS, ...ROBLOX_GLOBALS]) {
			expect(global, global).not.toMatch(/_/);
		}
		expect(ROBLOX_GLOBALS).not.toContain("reference");
	});

	it("holds the names anyone would check for", () => {
		expect(CLASSES).toContain("BasePart");
		expect(CLASSES).toContain("Decal");
		expect(ENUMS).toContain("Material");
		expect(ENUMS).toContain("HumanoidDisplayDistanceType");
		expect(DATATYPES).toContain("CFrame");
		expect(LIBRARIES).toContain("bit32");
		expect(LUAU_GLOBALS).toContain("pcall");
		expect(ROBLOX_GLOBALS).toContain("workspace");
	});
});

describe("the class list a pin offers", () => {
	it("puts the common ones first and the rest after", () => {
		expect(CLASS_OPTIONS.slice(0, INSTANCE_CLASSES.length)).toEqual(INSTANCE_CLASSES);
		expect(CLASS_OPTIONS.length).toBeGreaterThan(CLASSES.length - 1);
	});

	it("names nothing twice", () => {
		expect(new Set(CLASS_OPTIONS).size).toBe(CLASS_OPTIONS.length);
	});

	/** The shortlist is editorial, so it must stay a subset of what exists. */
	it("offers nothing the engine does not have", () => {
		const every = new Set(CLASSES);
		// A name on the shortlist and not in the export is a class Roblox has
		// removed, or a typo — either way it should not be offered.
		for (const name of INSTANCE_CLASSES) expect(every.has(name), name).toBe(true);
	});
});

describe("what fits an Instance pin", () => {
	/** It was the shortlist, so a Decal wanted a Cast to reach an Instance pin. */
	it("is every class, not the shortlist", () => {
		expect(isInstanceClass("Decal")).toBe(true);
		expect(isInstanceClass("AudioEmitter")).toBe(true);
		expect(isInstanceClass("Model")).toBe(true);
	});

	it("is still not anything at all", () => {
		expect(isInstanceClass("Tuning")).toBe(false);
		expect(isInstanceClass("number")).toBe(false);
		expect(isInstanceClass(undefined)).toBe(false);
	});
});

describe("every node that names a class", () => {
	const nodes = [
		"roblox.instanceNew",
		"instance.isA",
		"instance.findFirstChildOfClass",
		"instance.findFirstChildWhichIsA",
		"instance.findFirstAncestorOfClass",
		"instance.findFirstAncestorWhichIsA",
	];

	for (const id of nodes) {
		it(`${id} offers the class list on its Class Name pin`, () => {
			const def = registry.get(id);
			expect(def, id).toBeDefined();
			const pin = resolveNodePins(def!, {}).inputs.find((p) => p.id === "className");
			expect(pin, `${id} has a className pin`).toBeDefined();
			expect(pin!.options).toBe(CLASS_OPTIONS);
			// Still a string underneath: the list is what you pick from, not what
			// you are held to.
			expect(pin!.type).toBe("string");
			expect(pin!.default?.t).toBe("string");
		});
	}

	/** Every default has to be a real class, or the node opens on a typo. */
	it("defaults to a class that exists", () => {
		for (const id of nodes) {
			const pin = resolveNodePins(registry.get(id)!, {}).inputs.find((p) => p.id === "className");
			const value = (pin!.default as { v: string }).v;
			expect(CLASSES, `${id} defaults to ${value}`).toContain(value);
		}
	});
});

describe("the type search behind Other…", () => {
	it("knows every class and every datatype", () => {
		const found = new Set(searchTypes(undefined));
		expect(found.has("AudioEmitter")).toBe(true);
		expect(found.has("ColorSequence")).toBe(true);
		expect(found.has("number")).toBe(true);
	});
});

/**
 * Node Design: a pack's pin can be given a dropdown too. The loader has taken
 * `options` from a `.nodedef.json` all along and there was no way to set one in
 * the editor that builds them.
 */
describe("a pin's choices in Node Design", () => {
	const pin = (over: Partial<DraftPin> = {}): DraftPin => ({
		id: "className", name: "Class Name", kind: "data", type: "string",
		default: { t: "string", v: "Part" }, ...over,
	});

	it("survives a round trip through the pack and back", () => {
		const draft = newDraft("combat", []);
		draft.inputs = [pin({ options: ["Part", "MeshPart"] })];
		const back = draftOf(defOf(draft));
		expect(back.inputs[0].options).toEqual(["Part", "MeshPart"]);
	});

	it("is left off the pack entirely when there are none", () => {
		const draft = newDraft("combat", []);
		draft.inputs = [pin()];
		expect(defOf(draft).inputs[0]).not.toHaveProperty("options");
	});

	/** An output has no value to set, so a dropdown on one means nothing. */
	it("is not written onto an output", () => {
		const draft = newDraft("combat", []);
		draft.outputs = [pin({ id: "result", options: ["Part"] })];
		expect(defOf(draft).outputs[0]).not.toHaveProperty("options");
	});
});

/**
 * The hierarchy, which is what makes a list of six hundred browsable and what
 * lets a `Part` reach a `BasePart` pin without asserting something already true.
 */
describe("the class hierarchy", () => {
	it("reads a chain from a class to the root", () => {
		expect(classChain("Part")).toEqual(["Part", "FormFactorPart", "BasePart", "PVInstance", "Instance", "Object"]);
	});

	it("gives an unknown name back on its own", () => {
		expect(classChain("Tuning")).toEqual(["Tuning"]);
		expect(classChain(undefined)).toEqual([]);
	});

	it("answers IsA the way Luau would", () => {
		expect(isSubclassOf("Part", "BasePart")).toBe(true);
		expect(isSubclassOf("MeshPart", "Instance")).toBe(true);
		expect(isSubclassOf("TextButton", "GuiObject")).toBe(true);
		expect(isSubclassOf("Part", "Part")).toBe(true);
	});

	/** The other way round is a claim about the value, which is Cast's job. */
	it("does not answer it backwards", () => {
		expect(isSubclassOf("BasePart", "Part")).toBe(false);
		expect(isSubclassOf("Instance", "Model")).toBe(false);
		expect(isSubclassOf("Part", "Decal")).toBe(false);
		expect(isSubclassOf(undefined, "Part")).toBe(false);
	});

	it("groups a class under the engine's own taxonomy", () => {
		expect(classGroup("AlignPosition")).toBe("Constraint");
		expect(classGroup("HingeConstraint")).toBe("Constraint");
		expect(classGroup("Part")).toBe("PVInstance");
		expect(classGroup("Instance")).toBe("Instance");
	});

	it("puts every class somewhere", () => {
		for (const name of CLASSES) expect(classGroup(name), name).toBeTruthy();
	});

	/** A cycle in generated data must not hang the editor. */
	it("survives a chain that never ends", () => {
		expect(classChain("Part").length).toBeLessThan(33);
	});
});

describe("a wire between two classes", () => {
	it("lands on a pin typed as something it derives from", () => {
		expect(typesCompatible("Part", "BasePart")).toBe(true);
		expect(typesCompatible("Model", "Instance")).toBe(true);
		expect(typesCompatible("TextButton", "GuiObject")).toBe(true);
	});

	it("does not land on a narrower one", () => {
		expect(typesCompatible("BasePart", "Part")).toBe(false);
		expect(typesCompatible("Instance", "Humanoid")).toBe(false);
	});

	it("leaves everything that was already true alone", () => {
		expect(typesCompatible("number", "string")).toBe(true);
		expect(typesCompatible("any", "Part")).toBe(true);
		expect(typesCompatible("Part", "Color3")).toBe(false);
	});
});
