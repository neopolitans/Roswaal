/**
 * Graph edits that are more than a field assignment.
 *
 * Everything in edits.ts is a pure function of the document, which is what
 * makes undo a stack of snapshots — so these tests take a script in and assert
 * on the script that comes out, with no editor involved.
 */

import { describe, expect, it } from "vitest";

import { createRegistry, literalOnlyPins } from "../src/core/nodes/index.js";
import { compile } from "../src/core/compiler/index.js";
import {
	canConnect, canPromoteToVariable, connect, promoteToVariable, recombinePin,
	setLiteral, splitCost, splitModesFor, splitPin, splitValueWarning,
} from "../src/app/edits.js";
import { pinPosition } from "../src/app/geometry.js";
import type { NodeScript, PinDef } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function inputPin(defId: string, pinId: string): PinDef {
	return registry.get(defId)!.inputs.find((p) => p.id === pinId)!;
}

function outputPin(defId: string, pinId: string): PinDef {
	return registry.get(defId)!.outputs.find((p) => p.id === pinId)!;
}

describe("literal-only pins", () => {
	it("finds the pins a template pastes rather than evaluates", () => {
		expect([...literalOnlyPins(registry.get("roblox.getProperty")!)]).toEqual(["property"]);
		expect(literalOnlyPins(registry.get("flow.branch")!).size).toBe(0);
	});

	/**
	 * The emitter already refused a wired one, but only at compile time — you had
	 * to make the mistake before being told. Refusing the connection means the
	 * pin dims during a wire drag instead, which is where the answer belongs.
	 */
	it("cannot be wired", () => {
		const b = new Builder();
		const variable = b.variable("label", "string", { t: "string", v: "" });
		const getter = b.node("variable.get", {
			config: { variable, name: "label", type: "string" },
		});
		const get = b.node("roblox.getProperty");
		const script = b.build();

		const check = canConnect(
			script, registry,
			{ node: getter, pin: "value" },
			{ node: get, pin: "property" },
		);
		expect(check.ok).toBe(false);
		expect(check.ok === false && check.reason).toContain("typed in directly");

		// And `connect` is a no-op rather than making a wire the compiler rejects.
		const after = connect(
			script, registry,
			{ node: getter, pin: "value" },
			{ node: get, pin: "property" },
		);
		expect(after.links).toHaveLength(0);
	});
});

describe("splitting and recombining a pin", () => {
	it("offers a mode per decomposition the type has", () => {
		const from = inputPin("cframe.lookAt", "from");
		expect(splitModesFor(from).map((m) => m.id)).toEqual(["xyz"]);

		const cf = inputPin("cframe.mul", "a");
		expect(splitModesFor(cf).map((m) => m.id)).toEqual(["transform", "axes", "components"]);

		// Not every type comes apart.
		expect(splitModesFor(inputPin("debug.print", "value"))).toEqual([]);
	});

	it("records the split against the side as well as the pin", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt");

		const after = splitPin(b.build(), registry, look, "in", "from", "xyz");
		const node = after.nodes.find((n) => n.id === look)!;
		expect(node.config).toEqual({ split: { "in:from": "xyz" } });
	});

	/** The whole pin is gone, so a wire to it has nowhere to land. */
	it("drops the wire that was on the pin being split", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt");
		const zero = b.node("vector3.zero");
		b.link(zero, "result", look, "from");

		const script = b.build();
		expect(splitCost(script, registry, look, "in", "from")).toBe(1);

		const after = splitPin(script, registry, look, "in", "from", "xyz");
		expect(after.links).toHaveLength(0);
	});

	it("drops the components' wires when putting a pin back together", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt", { config: { split: { "in:from": "xyz" } } });
		const a = b.node("math.add");
		const c = b.node("math.add");
		b.link(a, "result", look, "from.x");
		b.link(c, "result", look, "from.z");

		const script = b.build();
		expect(splitCost(script, registry, look, "in", "from")).toBe(2);

		const after = recombinePin(script, registry, look, "in", "from");
		expect(after.links).toHaveLength(0);
		expect(after.nodes.find((n) => n.id === look)!.config?.split).toBeUndefined();
	});

	/**
	 * Splitting again should bring the numbers straight back, so the values are
	 * kept even though the pins holding them have gone. They cost nothing to
	 * carry and losing them is the annoying half of a mis-click.
	 */
	it("keeps the values typed into the components", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt", { config: { split: { "in:from": "xyz" } } });
		b.lit(look, "from.y", { t: "number", v: 7 });

		const script = b.build();
		const back = splitPin(
			recombinePin(script, registry, look, "in", "from"),
			registry, look, "in", "from", "xyz",
		);
		expect(back.nodes.find((n) => n.id === look)!.literals).toMatchObject({
			"from.y": { t: "number", v: 7 },
		});
	});

	/**
	 * Reported from the editor: split a Vector3, set it to (0, 12, -4),
	 * recombine, and the code went back to `Vector3.zero`. The values were being
	 * kept but never folded onto the pin that came back.
	 */
	it("folds the components' values onto the pin it rebuilds", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt", { config: { split: { "in:from": "xyz" } } });
		b.lit(look, "from.y", { t: "number", v: 12 });
		b.lit(look, "from.z", { t: "number", v: -4 });

		const after = recombinePin(b.build(), registry, look, "in", "from");
		expect(after.nodes.find((n) => n.id === look)!.literals!["from"]).toEqual({
			t: "raw",
			v: "Vector3.new(0, 12, -4)",
		});
	});

	it("folds a CFrame back through the mode it was split in", () => {
		const b = new Builder();
		const place = b.node("cframe.mul", { config: { split: { "in:a": "transform" } } });
		b.lit(place, "a.position", { t: "raw", v: "Vector3.new(1, 2, 3)" });

		const after = recombinePin(b.build(), registry, place, "in", "a");
		expect(after.nodes.find((n) => n.id === place)!.literals!["a"]).toEqual({
			t: "raw",
			v: "(CFrame.identity + Vector3.new(1, 2, 3))",
		});
	});

	/** An untouched pin should come back reading Vector3.zero, not (0, 0, 0). */
	it("writes nothing when no component was touched", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt", { config: { split: { "in:from": "xyz" } } });

		const after = recombinePin(b.build(), registry, look, "in", "from");
		expect(after.nodes.find((n) => n.id === look)!.literals?.["from"]).toBeUndefined();
	});

	/**
	 * Recombining changes how a value is presented, never what it compiles to.
	 *
	 * The *body* is compared, not the whole file: the header carries a hash of
	 * the graph, and the graph genuinely did change.
	 */
	it("compiles to the same Luau either side of a recombine", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const look = b.node("cframe.lookAt", { config: { split: { "in:from": "xyz" } } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(look, "result", print, "value");
		b.lit(look, "from.y", { t: "number", v: 12 });
		b.lit(look, "from.z", { t: "number", v: -4 });

		const split = b.build();
		const whole = recombinePin(split, registry, look, "in", "from");

		expect(body(compile(whole, registry).code)).toBe(body(compile(split, registry).code));
	});

	/**
	 * Reported from the editor, the other half of the recombine bug: splitting a
	 * pin holding (0, 12, -4) started emitting (0, 0, 0), because the components
	 * came up at their defaults. Splitting shows a value differently; it must
	 * never change it.
	 */
	it("carries a decomposable value into the components", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt");
		b.lit(look, "from", { t: "raw", v: "Vector3.new(0, 12, -4)" });

		const after = splitPin(b.build(), registry, look, "in", "from", "xyz");
		expect(after.nodes.find((n) => n.id === look)!.literals).toMatchObject({
			"from.x": { t: "number", v: 0 },
			"from.y": { t: "number", v: 12 },
			"from.z": { t: "number", v: -4 },
		});
	});

	it("round-trips a value through a split and back", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const look = b.node("cframe.lookAt");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(look, "result", print, "value");
		b.lit(look, "from", { t: "raw", v: "Vector3.new(3, 4, 5)" });

		const original = b.build();
		const split = splitPin(original, registry, look, "in", "from", "xyz");
		const back = recombinePin(split, registry, look, "in", "from");

		const emitted = (s: typeof original) => body(compile(s, registry).code);
		expect(emitted(split)).toBe(emitted(original));
		expect(emitted(back)).toBe(emitted(original));
	});

	/**
	 * The honest limit. An expression cannot be taken apart without evaluating
	 * it, so rather than guess, splitting reports what it would lose and the
	 * caller asks first.
	 */
	it("reports a value it cannot take apart, and stays quiet otherwise", () => {
		const b = new Builder();
		const look = b.node("cframe.lookAt");
		b.lit(look, "from", { t: "raw", v: "workspace.Origin.Position" });
		const opaque = b.build();

		expect(splitValueWarning(opaque, registry, look, "in", "from", "xyz")).toBe(
			"workspace.Origin.Position",
		);

		// A pin still holding what its node declared loses nothing: the
		// components' defaults were chosen to mean the same thing.
		const untouched = new Builder();
		const plain = untouched.node("cframe.lookAt");
		expect(
			splitValueWarning(untouched.build(), registry, plain, "in", "from", "xyz"),
		).toBeNull();
	});

	it("leaves the other side alone when both sides share a pin id", () => {
		const b = new Builder();
		const service = b.node("roblox.getService");

		// Get Service takes a `service` and gives one back; splitting is keyed by
		// side so touching one cannot disturb the other.
		const after = splitPin(b.build(), registry, service, "out", "service", "xyz");
		expect(after.nodes.find((n) => n.id === service)!.config).toEqual({
			split: { "out:service": "xyz" },
		});
	});
});

describe("promote to variable", () => {
	function branchGraph(): { script: NodeScript; branch: string } {
		const b = new Builder();
		const branch = b.node("flow.branch");
		return { script: b.build(), branch };
	}

	it("names the variable after the pin and takes its type", () => {
		const { script, branch } = branchGraph();
		const result = promoteToVariable(script, registry, branch, inputPin("flow.branch", "condition"))!;

		expect(result).not.toBeNull();
		expect(result.script.variables).toHaveLength(1);
		expect(result.script.variables[0].name).toBe("condition");
		expect(result.script.variables[0].type).toBe("boolean");
	});

	/**
	 * The point of the whole feature. Promoting a value you have been tuning
	 * must not reset it — if it did, you would type it in again every time.
	 */
	it("carries the value already typed into the pin", () => {
		const { script, branch } = branchGraph();
		const edited = setLiteral(script, branch, "condition", { t: "boolean", v: false });

		const result = promoteToVariable(edited, registry, branch, inputPin("flow.branch", "condition"))!;

		expect(result.script.variables[0].default).toEqual({ t: "boolean", v: false });
	});

	it("wires the getter into the pin it was promoted from", () => {
		const { script, branch } = branchGraph();
		const result = promoteToVariable(script, registry, branch, inputPin("flow.branch", "condition"))!;

		const link = result.script.links.find((l) => l.to.node === branch && l.to.pin === "condition");
		expect(link).toBeDefined();
		expect(link!.from).toEqual({ node: result.node, pin: "value" });

		const getter = result.script.nodes.find((n) => n.id === result.node)!;
		expect(getter.def).toBe("variable.get");
		expect(getter.config).toMatchObject({ variable: result.variable, name: "condition" });
	});

	/** Placed so the wire it creates comes out flat, not dumped at the pointer. */
	it("places the getter level with the pin, and to its left", () => {
		const { script, branch } = branchGraph();
		const result = promoteToVariable(script, registry, branch, inputPin("flow.branch", "condition"))!;

		const getter = result.script.nodes.find((n) => n.id === result.node)!;
		const target = result.script.nodes.find((n) => n.id === branch)!;

		const from = pinPosition(getter, registry, "value", "out")!;
		const to = pinPosition(target, registry, "condition", "in")!;

		expect(from.y).toBe(to.y);
		expect(from.x).toBeLessThan(to.x);
	});

	it("makes a second promotion of the same pin name unique", () => {
		const b = new Builder();
		const branch = b.node("flow.branch");
		const other = b.node("flow.branch");

		const first = promoteToVariable(
			b.build(), registry, branch, inputPin("flow.branch", "condition"),
		)!;
		const second = promoteToVariable(
			first.script, registry, other, inputPin("flow.branch", "condition"),
		)!;

		expect(second.script.variables.map((v) => v.name)).toEqual(["condition", "condition2"]);
	});

	describe("refuses what it cannot do without surprising anyone", () => {
		it("refuses an execution pin", () => {
			const { script, branch } = branchGraph();
			const pin = inputPin("flow.branch", "in");
			expect(canPromoteToVariable(script, registry, branch, pin, "in")).toBe(false);
			expect(promoteToVariable(script, registry, branch, pin)).toBeNull();
		});

		it("refuses an output", () => {
			const { script, branch } = branchGraph();
			const pin = outputPin("flow.branch", "true");
			expect(canPromoteToVariable(script, registry, branch, pin, "out")).toBe(false);
		});

		/**
		 * Get Property compiles to `$in.instance.$in.property!ident` — the
		 * property name is pasted into the source, not evaluated. Promoting it
		 * would produce a graph that cannot compile, so the entry is not offered.
		 * Found by promoting exactly this pin and watching the compiler reject it.
		 */
		it("refuses a pin whose text is pasted into the generated source", () => {
			const b = new Builder();
			const get = b.node("roblox.getProperty");
			const script = b.build();

			const pin = inputPin("roblox.getProperty", "property");
			expect(canPromoteToVariable(script, registry, get, pin, "in")).toBe(false);
			expect(promoteToVariable(script, registry, get, pin)).toBeNull();
		});

		/** Promoting a wired pin would silently drop the wire. */
		it("refuses a pin that already has a wire", () => {
			const b = new Builder();
			const branch = b.node("flow.branch");
			const source = b.node("logic.not");
			b.link(source, "result", branch, "condition");

			const script = b.build();
			const pin = inputPin("flow.branch", "condition");
			expect(canPromoteToVariable(script, registry, branch, pin, "in")).toBe(false);
			expect(promoteToVariable(script, registry, branch, pin)).toBeNull();
		});
	});
});
