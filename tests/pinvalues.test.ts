/**
 * Derived pins that can be typed into.
 *
 * A Return's value pins and a Module Exports' pins are built from the node's
 * own config rather than written in the library, and they were built without a
 * default. The canvas picks a node's inline editor from the literal on the pin,
 * so no default meant no editor at all: the only way to give a Return a value
 * was to wire a node in for it, even for a number.
 *
 * The other half matters as much. A pin whose type has no literal to offer --
 * an Instance, an untyped `any` -- still gets nothing, because the compiler
 * reports an unwired pin with no default as a value it needs, and inventing a
 * `nil` for it would trade that error for a silent `nil` in the file.
 */

import { describe, expect, it } from "vitest";

import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeConfig, PinDef } from "../src/core/schema.js";

const registry = createRegistry();

function dataPins(id: string, config: NodeConfig): PinDef[] {
	const def = registry.get(id)!;
	return resolveNodePins(def, config).inputs.filter((pin) => pin.kind === "data");
}

const returns = (list: { name: string; type?: string }[]) =>
	dataPins("function.return", { returns: list });

const exports = (list: { name: string; type?: string }[]) =>
	dataPins("module.exports", { exports: list });

describe("a Return's values", () => {
	it("carry the literal their type starts from", () => {
		const [count, label, ok, rows] = returns([
			{ name: "count", type: "number" },
			{ name: "label", type: "string" },
			{ name: "ok", type: "boolean" },
			{ name: "rows", type: "{ number }" },
		]);
		expect(count.default).toEqual({ t: "number", v: 0 });
		expect(label.default).toEqual({ t: "string", v: "" });
		expect(ok.default).toEqual({ t: "boolean", v: false });
		expect(rows.default).toEqual({ t: "raw", v: "{}" });
	});

	it("carry nothing when the type has nothing to offer", () => {
		const [untyped, part] = returns([{ name: "value" }, { name: "part", type: "BasePart" }]);
		expect(untyped.default).toBeUndefined();
		expect(part.default).toBeUndefined();
	});

	it("keep the name and type they were given", () => {
		const [pin] = returns([{ name: "speed", type: "number" }]);
		expect(pin.name).toBe("speed");
		expect(pin.type).toBe("number");
	});
});

describe("Module Exports' pins", () => {
	it("carry the same literals, for the same reason", () => {
		const [n, s] = exports([{ name: "count", type: "number" }, { name: "id", type: "string" }]);
		expect(n.default).toEqual({ t: "number", v: 0 });
		expect(s.default).toEqual({ t: "string", v: "" });
	});

	/** Its one unconfigured pin is `any`, and stays wire-only. */
	it("leave the unnamed default export without one", () => {
		expect(exports([{ name: "value" }])[0].default).toBeUndefined();
	});
});
