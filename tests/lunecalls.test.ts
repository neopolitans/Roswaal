/**
 * Lune's standard library, as two nodes.
 *
 * The same arrangement `serviceCalls.ts` uses for Roblox methods, so the same
 * things are worth holding: that the pins come from the real signature, that
 * the pure/step split is Lune's own decision rather than one made here, and
 * that a type Roswaal's pins cannot express is admitted rather than narrowed.
 *
 * And one that is specific to this: **the node does not write its own
 * require**. `@lune/fs` is Lune's own and always available, which is the
 * strongest case anybody could make for an exception, and it is still not one.
 * A file that quietly gained a require because somebody dropped a node is a
 * file whose dependencies are not what its author can see.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import {
	argumentPins, callLabel, isValueCall, luneFunction, luneMenuItems, lunePins,
	pinTypeFor, resultPin, LUNE_CALL, LUNE_VALUE,
} from "../src/core/luneCalls.js";
import { emptyScript, type NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

describe("the two nodes", () => {
	it("are both in the registry, and both Lune only", () => {
		for (const id of [LUNE_CALL, LUNE_VALUE]) {
			const def = registry.get(id);
			expect(def, id).toBeDefined();
			expect(def?.category, id).toBe("Lune");
		}
	});

	it("gives a Roblox graph neither of them", () => {
		const offered = [...registry.values()]
			.filter((def) => !def.targets || def.targets.includes("roblox"))
			.map((def) => def.id);
		expect(offered).not.toContain(LUNE_CALL);
		expect(offered).not.toContain(LUNE_VALUE);
	});
});

describe("pins from the real signature", () => {
	it("names and types an argument as Lune does", () => {
		const pins = argumentPins(luneFunction("fs", "writeFile")!);
		expect(pins.map((pin) => pin.name)).toEqual(["path", "contents"]);
		expect(pins[0]).toMatchObject({ id: "a0", type: "string" });
		// `buffer | string` is not a pin type, so the pin takes anything and
		// says what it really wants. Narrowing it to `string` would refuse a
		// buffer the runtime accepts.
		expect(pins[1].type).toBe("any");
		expect(pins[1].description).toContain("buffer | string");
	});

	it("marks an optional argument optional", () => {
		const pins = argumentPins(luneFunction("task", "wait")!);
		expect(pins[0]).toMatchObject({ name: "duration", type: "number", optional: true });
	});

	it("gives a typed field a starting value and everything else none", () => {
		const pins = argumentPins(luneFunction("fs", "writeFile")!);
		expect(pins[0].default).toEqual({ t: "string", v: "" });
		expect(pins[1].default).toBeUndefined();
	});

	it("types the result, and has none when there is nothing to give", () => {
		expect(resultPin(luneFunction("fs", "readFile")!)).toMatchObject({ type: "string" });
		expect(resultPin(luneFunction("fs", "writeFile")!)).toBeNull();
	});

	it("reads a list as a table", () => {
		expect(pinTypeFor("{ string }")).toBe("table");
		expect(resultPin(luneFunction("fs", "readDir")!)?.type).toBe("table");
	});

	it("keeps a Lune type as itself", () => {
		expect(pinTypeFor("DateTime")).toBe("DateTime");
		expect(pinTypeFor("buffer")).toBe("buffer");
	});

	/** A node nobody has configured still has to draw. */
	it("draws before a call is picked", () => {
		expect(lunePins({}, false).inputs.map((pin) => pin.id)).toEqual(["in"]);
		expect(lunePins({}, true).outputs).toHaveLength(1);
	});

	it("says which call it is under the header", () => {
		expect(callLabel({ module: "fs", call: "readFile" })).toBe("fs.readFile");
		expect(callLabel({ module: "fs" })).toBeUndefined();
	});
});

/**
 * Lune tags a function `must_use` when the point of the call is the value, and
 * that is the same line Roswaal draws between a pure node and a step. Deciding
 * it here instead would be a second opinion about sixty-one functions.
 */
describe("which node a function lands on", () => {
	it("follows Lune's own must_use", () => {
		expect(isValueCall(luneFunction("fs", "readFile")!)).toBe(true);
		expect(isValueCall(luneFunction("fs", "writeFile")!)).toBe(false);
	});

	it("lists every function in the palette", () => {
		const items = luneMenuItems();
		expect(items.length).toBeGreaterThan(50);
		const read = items.find((one) => one.label === "fs.readFile");
		expect(read).toMatchObject({ def: LUNE_VALUE, module: "fs", call: "readFile" });
		expect(items.find((one) => one.label === "fs.writeFile")?.def).toBe(LUNE_CALL);
	});
});

describe("compiling one", () => {
	const graph = (modules: NodeScript["modules"]): NodeScript => ({
		...emptyScript("Demo", "demo"),
		target: "lune",
		modules,
		nodes: [
			{ id: "begin", def: "script.begin", x: 0, y: 0 },
			{
				id: "read", def: LUNE_VALUE, x: 200, y: 120,
				config: { module: "fs", call: "readFile" },
				literals: { a0: { t: "string", v: "notes.txt" } },
			},
			{ id: "print", def: "debug.print", x: 400, y: 0 },
		],
		links: [
			{ id: "l1", from: { node: "begin", pin: "then" }, to: { node: "print", pin: "in" } },
			{ id: "l2", from: { node: "read", pin: "result" }, to: { node: "print", pin: "value" } },
		],
	});

	/**
	 * The one that matters. `@lune/fs` is Lune's own and always there, so if
	 * any require were going to be added quietly it would be this one.
	 */
	it("refuses to write a require nobody asked for", () => {
		const result = compile(graph([]), registry);
		const error = result.diagnostics.find((one) => one.severity === "error");
		expect(error?.message).toContain("@lune/fs");
		// And it says what to do, naming the specifier that fixes it.
		expect(error?.message).toContain("Variables panel");
		expect(result.code).not.toContain("require(\"@lune/fs\")");
	});

	it("calls it through the local the declaration bound", () => {
		const result = compile(graph([{ id: "m1", name: "fs", specifier: "@lune/fs" }]), registry);
		expect(result.diagnostics.filter((one) => one.severity === "error")).toEqual([]);
		expect(result.code).toContain('local fs = require("@lune/fs")');
		expect(result.code).toContain('print(fs.readFile("notes.txt"))');
	});

	/** The name is the declaration's, not the module's. */
	it("uses the name the developer chose", () => {
		const result = compile(
			graph([{ id: "m1", name: "disk", specifier: "@lune/fs" }]), registry,
		);
		expect(result.code).toContain('local disk = require("@lune/fs")');
		expect(result.code).toContain('disk.readFile("notes.txt")');
	});

	/**
	 * A trailing optional nobody filled in is left off rather than passed as
	 * nil, which is the difference between a call a runtime accepts and one it
	 * rejects.
	 */
	it("leaves an unfilled trailing optional off the call", () => {
		const script: NodeScript = {
			...emptyScript("Wait", "wait"),
			target: "lune",
			modules: [{ id: "m1", name: "task", specifier: "@lune/task" }],
			nodes: [
				{ id: "begin", def: "script.begin", x: 0, y: 0 },
				{ id: "wait", def: LUNE_CALL, x: 200, y: 0, config: { module: "task", call: "wait" } },
			],
			links: [
				{ id: "l1", from: { node: "begin", pin: "then" }, to: { node: "wait", pin: "in" } },
			],
		};
		expect(compile(script, registry).code).toContain("task.wait()");
	});

	it("says so when no call has been chosen", () => {
		const script: NodeScript = {
			...emptyScript("Blank", "blank"),
			target: "lune",
			modules: [{ id: "m1", name: "fs", specifier: "@lune/fs" }],
			nodes: [
				{ id: "begin", def: "script.begin", x: 0, y: 0 },
				{ id: "call", def: LUNE_CALL, x: 200, y: 0, config: { module: "fs" } },
			],
			links: [
				{ id: "l1", from: { node: "begin", pin: "then" }, to: { node: "call", pin: "in" } },
			],
		};
		const error = compile(script, registry).diagnostics.find((d) => d.severity === "error");
		expect(error?.message).toContain("no call chosen");
	});
});
