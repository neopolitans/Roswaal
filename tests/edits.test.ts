/**
 * Graph edits that are more than a field assignment.
 *
 * Everything in edits.ts is a pure function of the document, which is what
 * makes undo a stack of snapshots — so these tests take a script in and assert
 * on the script that comes out, with no editor involved.
 */

import { describe, expect, it } from "vitest";

import { createRegistry, literalOnlyPins } from "../src/core/nodes/index.js";
import {
	canConnect, canPromoteToVariable, connect, promoteToVariable, setLiteral,
} from "../src/app/edits.js";
import { pinPosition } from "../src/app/geometry.js";
import type { NodeScript, PinDef } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

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
