/**
 * The node designer's model: a node being built by handling its pins.
 *
 * The rules worth pinning are the ones a visual editor could get quietly wrong
 * — a rename that leaves a template reading a pin that is gone, a node that is
 * pure because of what its pins are rather than a setting somebody forgot, and
 * a shape the loader would refuse.
 */

import { describe, expect, it } from "vitest";

import {
	addPin, defOf, draftOf, movePin, newDraft, pillShape, pinIdFor, problemsOf, purityOf,
	removePin, renamePin, retypePin, setPinDefault, setResult, shapeOfDraft, targetsOf, targetsText,
} from "../src/app/designer/draft.js";
import { compileLogic, defaultLogic } from "../src/core/compiler/logic.js";
import { createRegistry, parseNodePack } from "../src/core/nodes/index.js";
import { LOGIC_NODES } from "../src/core/nodes/logic.js";
import type { NodeDef } from "../src/core/schema.js";

describe("a new node", () => {
	it("is an empty header with one execution pin each side", () => {
		const draft = newDraft("combat", []);
		expect(draft.title).toBe("");
		expect(draft.inputs.map((p) => p.id)).toEqual(["in"]);
		expect(draft.outputs.map((p) => p.id)).toEqual(["then"]);
		expect(purityOf(draft)).toBe("impure");
	});

	it("takes an id the pack does not already have", () => {
		expect(newDraft("combat", ["combat.newNode"]).id).toBe("combat.newNode2");
	});
});

describe("pure, by its pins", () => {
	it("is pure once both execution pins are gone", () => {
		let draft = newDraft("combat", []);
		draft = removePin(draft, "in", 0);
		expect(purityOf(draft)).toBe("unrunnable");
		draft = removePin(draft, "out", 0);
		expect(purityOf(draft)).toBe("pure");
	});

	it("refuses an execution output with no input, saying why", () => {
		const draft = removePin(newDraft("combat", []), "in", 0);
		expect(problemsOf({ ...draft, title: "T", template: "x()" })).toContain(
			"An execution output needs an execution input: nothing could run this node.",
		);
	});

	it("allows a step that ends the flow: an input and no output", () => {
		const draft = removePin({ ...newDraft("combat", []), title: "Stop", template: "stop()" }, "out", 0);
		expect(purityOf(draft)).toBe("impure");
		expect(problemsOf(draft)).toEqual([]);
	});

	it("keeps the template when a node goes pure and comes back", () => {
		let draft = { ...newDraft("combat", []), template: "shove($in.force)" };
		draft = removePin(removePin(draft, "in", 0), "out", 0);
		draft = addPin(addPin(draft, "in", "exec"), "out", "exec");
		expect(draft.template).toBe("shove($in.force)");
	});

	it("compiles to the kind its pins make it", () => {
		const statement = { ...newDraft("combat", []), title: "T", template: "x()" };
		expect(defOf(statement).compilesTo.kind).toBe("statement");

		const call = setResult(addPin(statement, "out", "number", "Hits"), "hits");
		expect(defOf(call).compilesTo).toEqual({ kind: "call", template: "x()", result: "hits" });

		let pure = removePin(removePin(addPin(statement, "out", "number", "Hits"), "in", 0), "out", 0);
		pure = { ...pure, expressions: { hits: "3" } };
		expect(defOf(pure).compilesTo).toEqual({ kind: "expr", outputs: { hits: "3" } });
	});
});

describe("pins", () => {
	it("take their ids from their names", () => {
		expect(pinIdFor("Hit Part", [])).toBe("hitPart");
		expect(pinIdFor("Force", ["force"])).toBe("force2");
		expect(pinIdFor("then", [])).toBe("then2");
		expect(pinIdFor("", [])).toBe("value");
	});

	it("have one execution pin a side, first", () => {
		let draft = addPin(newDraft("combat", []), "in", "Vector3");
		draft = addPin(draft, "in", "exec");
		expect(draft.inputs.map((p) => p.kind)).toEqual(["exec", "data"]);
	});

	/** The rename a visual editor gets wrong without noticing. */
	it("carry a rename into the template that reads them", () => {
		let draft = addPin(newDraft("combat", []), "in", "Vector3", "Force");
		draft = { ...draft, template: "root:ApplyImpulse($in.force) -- $in.forceful stays" };
		draft = renamePin(draft, "in", 1, "Impulse");
		expect(draft.inputs[1].id).toBe("impulse");
		expect(draft.template).toBe("root:ApplyImpulse($in.impulse) -- $in.forceful stays");
	});

	it("carry an output rename into its expression and the result", () => {
		let draft = setResult(addPin(newDraft("combat", []), "out", "number", "Hits"), "hits");
		draft = { ...draft, template: "$out.hits" };
		draft = renamePin(draft, "out", 1, "Count");
		expect(draft.result).toBe("count");
		expect(draft.template).toBe("$out.count");
	});

	it("keep execution pins in front when moved", () => {
		let draft = addPin(addPin(newDraft("combat", []), "in", "number", "A"), "in", "number", "B");
		draft = movePin(draft, "in", 1, -1);
		expect(draft.inputs.map((p) => p.id)).toEqual(["in", "a", "b"]);
		draft = movePin(draft, "in", 2, -1);
		expect(draft.inputs.map((p) => p.id)).toEqual(["in", "b", "a"]);
	});

	it("drop a default that no longer fits the type", () => {
		let draft = setPinDefault(addPin(newDraft("combat", []), "in", "number", "N"), 1, { t: "number", v: 3 });
		expect(retypePin(draft, "in", 1, "any").inputs[1].default).toEqual({ t: "number", v: 3 });
		draft = retypePin(draft, "in", 1, "string");
		expect(draft.inputs[1].default).toBeUndefined();
	});

	it("say when a template reads a pin that is not there", () => {
		const draft = { ...newDraft("combat", []), title: "T", template: "go($in.missing)" };
		expect(problemsOf(draft)).toContain("It reads $in.missing, and there is no input called missing.");
	});
});

describe("the pill", () => {
	it("is offered only in the getter shape", () => {
		let draft = removePin(removePin(newDraft("combat", []), "in", 0), "out", 0);
		draft = addPin(draft, "out", "number", "Health");
		expect(pillShape(draft).ok).toBe(true);
		expect(pillShape(addPin(draft, "in", "Instance")).ok).toBe(false);
		expect(pillShape(newDraft("combat", [])).ok).toBe(false);
	});

	it("is written as compact, and the loader takes it", () => {
		let draft = removePin(removePin(newDraft("combat", []), "in", 0), "out", 0);
		draft = { ...addPin(draft, "out", "number", "Health"), title: "Health", display: "compact" as const };
		draft = { ...draft, expressions: { health: "humanoid.Health" } };
		expect(problemsOf(draft)).toEqual([]);
		const parsed = parseNodePack({ nodes: [defOf(draft)] }, "pack");
		expect(parsed.defs[0].display).toBe("compact");
	});
});

describe("the loader's new rules", () => {
	// Pins as a pack file writes them, which is looser than `PinDef`.
	const statement = (inputs: { id: string; kind: string }[], display?: string) => ({
		id: "p.n", title: "N", inputs, outputs: [{ id: "v", kind: "data", type: "number" }],
		compilesTo: display ? { kind: "expr", outputs: { v: "1" } } : { kind: "statement", template: "x()" },
		...(display ? { display } : {}),
	});

	/** A pack that loaded before the check has to go on loading. */
	it("loads a step with no execution input, and warns that it never runs", () => {
		const parsed = parseNodePack({ nodes: [statement([])] }, "pack");
		expect(parsed.defs).toHaveLength(1);
		expect(parsed.errors).toEqual([]);
		expect(parsed.warnings[0]).toMatch(/never run/);
	});

	it("refuses a pill that is not in the getter shape", () => {
		const parsed = parseNodePack({ nodes: [statement([{ id: "a", kind: "data" }], "compact")] }, "pack");
		expect(parsed.defs).toEqual([]);
		expect(parsed.errors[0]).toMatch(/pill/);
	});
});

/**
 * Logic built from nodes. The compiler's own rules are in `logic.test.ts`;
 * these are about the draft carrying the result.
 */
describe("logic built from nodes", () => {
	const registry = createRegistry(LOGIC_NODES);

	function withLogic() {
		let draft = { ...newDraft("combat", []), title: "Say" };
		draft = addPin(draft, "in", "string", "Message");
		const shape = shapeOfDraft(draft);
		const logic = defaultLogic(shape);
		// Node Inputs → Print → Node Outputs, with Message into Print.
		logic.nodes.push({ id: "print", def: "debug.print", x: 300, y: 120 });
		logic.links = [
			{ id: "a", from: { node: "logic-inputs", pin: "then" }, to: { node: "print", pin: "in" } },
			{ id: "b", from: { node: "print", pin: "then" }, to: { node: "logic-outputs", pin: "in" } },
			{ id: "c", from: { node: "logic-inputs", pin: "message" }, to: { node: "print", pin: "value" } },
		];
		return { ...draft, logicMode: "nodes" as const, logic };
	}

	it("saves what the nodes compiled to, and the graph beside it", () => {
		const draft = withLogic();
		const compiled = compileLogic(draft.logic, shapeOfDraft(draft), registry);
		const def = defOf(draft, compiled);
		expect(def.compilesTo).toEqual({ kind: "statement", template: "print($in.message)" });
		expect(def.logic).toBe(draft.logic);
		expect(problemsOf(draft, [], compiled)).toEqual([]);
	});

	it("reads a saved node's logic back as a node built from nodes", () => {
		const draft = withLogic();
		const def = defOf(draft, compileLogic(draft.logic, shapeOfDraft(draft), registry));
		expect(draftOf(def).logicMode).toBe("nodes");
	});

	it("shows the compiler's errors as the node's problems", () => {
		const draft = withLogic();
		draft.logic.nodes.push({ id: "start", def: "script.begin", x: 0, y: 0 });
		const compiled = compileLogic(draft.logic, shapeOfDraft(draft), registry);
		expect(problemsOf(draft, [], compiled).join("\n")).toMatch(/^Logic: Script Start cannot be/m);
	});

	/** Switching a working Luau node to Nodes starts from an empty graph. */
	it("will not save a step whose logic does nothing", () => {
		const base = { ...newDraft("combat", []), title: "Push", template: "push()" };
		const logic = defaultLogic(shapeOfDraft(base));
		const draft = { ...base, logicMode: "nodes" as const, logic };
		const compiled = compileLogic(logic, shapeOfDraft(draft), registry);
		expect(problemsOf(draft, [], compiled)).toContain(
			"The logic does nothing yet. Build it from Node Inputs, or switch back to Luau.",
		);
	});

	it("leaves a node written in Luau with no logic key at all", () => {
		const draft = { ...newDraft("combat", []), title: "T", template: "x()" };
		expect("logic" in defOf(draft)).toBe(false);
	});
});

/**
 * Where a node runs. What it declares, narrowed by what its logic is built
 * from — an intersection, because either side can rule a target out.
 */
describe("targets", () => {
	const registry = createRegistry(LOGIC_NODES);

	/** A node whose logic reads Players through Get Service, which is Roblox-only. */
	function usingGetService(declared?: ("roblox" | "lune")[]) {
		let draft = removePin(removePin({ ...newDraft("combat", []), title: "Players" }, "in", 0), "out", 0);
		draft = addPin(draft, "out", "Instance", "Players");
		const shape = shapeOfDraft(draft);
		const logic = defaultLogic(shape);
		logic.nodes.push({ id: "svc", def: "roblox.getService", x: 300, y: 120, literals: { service: { t: "string", v: "Players" } } });
		logic.links.push({ id: "l", from: { node: "svc", pin: "service" }, to: { node: "logic-outputs", pin: "players" } });
		const full = { ...draft, logicMode: "nodes" as const, logic, ...(declared ? { targets: declared } : {}) };
		return { draft: full, compiled: compileLogic(logic, shape, registry) };
	}

	it("declares nothing, so runs on both, when written in Luau", () => {
		expect(targetsOf({ ...newDraft("combat", []), title: "T", template: "x()" })).toBeNull();
	});

	it("takes what its logic uses when it declares nothing", () => {
		const { draft, compiled } = usingGetService();
		expect(targetsOf(draft, compiled)).toEqual(["roblox"]);
		expect(defOf(draft, compiled).targets).toEqual(["roblox"]);
	});

	/** "A Lune node built from Get Service is a Roblox node whatever it says." */
	it("refuses a node declared for a target its logic cannot run on", () => {
		const { draft, compiled } = usingGetService(["lune"]);
		expect(targetsOf(draft, compiled)).toEqual([]);
		expect(problemsOf(draft, [], compiled)).toContain(
			"It runs on nothing: it says Lune only, and its logic uses nodes that run on Roblox only.",
		);
	});

	it("keeps a declared target its logic allows", () => {
		const draft = { ...newDraft("combat", []), title: "T", template: "x()", targets: ["roblox" as const] };
		expect(defOf(draft).targets).toEqual(["roblox"]);
		expect(problemsOf(draft)).toEqual([]);
	});

	it("says a set of targets the way a problem reads", () => {
		expect(targetsText(null)).toBe("Roblox and Lune");
		expect(targetsText(["lune"])).toBe("Lune only");
		expect(targetsText([])).toBe("nothing");
	});
});

describe("round trip", () => {
	it("gives back the node it was made from", () => {
		const def: NodeDef = {
			id: "inventory.give", title: "Give Item", category: "Inventory", summary: "Adds an item.",
			inputs: [
				{ id: "in", name: "", kind: "exec" },
				{ id: "item", name: "Item", kind: "data", type: "string", default: { t: "string", v: "Sword" } },
			],
			outputs: [{ id: "then", name: "", kind: "exec" }],
			compilesTo: { kind: "statement", template: "give($in.item)" },
		};
		expect(defOf(draftOf(def))).toEqual(def);
	});
});
