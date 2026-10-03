/**
 * What the daemon tells the editor about node definitions.
 *
 * The editor bundles the built-ins itself. It has to: a definition's pin
 * derivation, its subtitle and its default label are *functions*, and a
 * function does not survive a round trip through JSON. So the only thing the
 * daemon should send is what the project's own node packs contributed.
 *
 * **It sent 215 built-ins for months.** The route filtered the project registry
 * for definitions that were not builtin-handled and had no pin derivation —
 * which describes most of the built-in library — and `createRegistry` loads
 * what it is given *last*, so those copies shadowed the real definitions.
 * Everything about them was correct except that every function field was gone.
 *
 * The symptom, when it finally surfaced, was a node ignoring a subtitle it
 * plainly had in the source, in the bundle the browser had loaded. Nothing was
 * wrong with any of the code being read; the object had been replaced.
 *
 * This opens the demo project, which carries two real packs, and asserts the
 * daemon hands over those two and nothing else.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { BUILTIN_NODES, createRegistry, parseNodePack } from "../src/core/nodes/index.js";
import { openProject } from "../src/server/project.js";
import { Builder } from "./helpers.js";

const DEMO = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"examples",
	"demo",
);

describe("what counts as a node pack", () => {
	it("hands over the project's own packs and nothing else", async () => {
		const project = await openProject(DEMO);
		const builtinIds = new Set(BUILTIN_NODES.map((def) => def.id));
		const leaked = project.packs.filter((def) => builtinIds.has(def.id));

		expect(leaked.map((def) => def.id)).toEqual([]);
	});

	/** The demo has two packs, so a zero here would mean the check proves nothing. */
	it("finds the packs that are actually there", async () => {
		const project = await openProject(DEMO);
		expect(project.packs.length).toBeGreaterThan(0);
		expect(project.packs.length).toBe(project.packCount);
	});

	/**
	 * The registry the *server* compiles against is a different thing: it holds
	 * built-ins and packs together, with their functions intact, because it was
	 * never serialised.
	 */
	it("still has every built-in in the registry it compiles with", async () => {
		const project = await openProject(DEMO);
		for (const id of ["roblox.findFirstChild", "flow.branch", "table.dictionary"]) {
			expect(project.registry.get(id), id).toBeDefined();
		}
	});
});

/**
 * The fields that vanish when a definition is sent as JSON. If a built-in ever
 * reaches the editor through the wire again, these are what stop working — and
 * they stop working silently, which is why they are worth naming.
 */
describe("definitions carry code the wire cannot", () => {
	it("has built-ins whose display depends on a function", () => {
		const withFunctions = BUILTIN_NODES.filter(
			(def) => def.subtitle || def.defaultLabel || def.derivePins,
		);
		expect(withFunctions.length).toBeGreaterThan(10);
	});

	it("keeps the result-name subtitle on a node that returns a value", () => {
		const clone = BUILTIN_NODES.find((def) => def.id === "instance.clone");
		expect(clone?.subtitle?.({ resultName: "value" })).toBe("value");
		expect(clone?.subtitle?.({})).toBeUndefined();
	});

	/** A JSON round trip is exactly what the daemon used to do to these. */
	it("loses that subtitle through JSON, which is the whole reason for the rule", () => {
		const clone = BUILTIN_NODES.find((def) => def.id === "instance.clone")!;
		const throughTheWire = JSON.parse(JSON.stringify(clone));
		expect(throughTheWire.subtitle).toBeUndefined();
	});
});

/**
 * A pack pin left empty behaves as a built-in pin does: with no wire, no
 * literal and no default there is no value to pass, and the compile says so
 * rather than writing `nil` into the call.
 */
describe("a pack pin with nothing on it", () => {
	const pack = (required?: boolean) => parseNodePack({
		nodes: [{
			id: "combat.hit",
			title: "Hit",
			inputs: [
				{ id: "in", kind: "exec" },
				{ id: "target", name: "Target", kind: "data", type: "Instance", ...(required === undefined ? {} : { required }) },
			],
			outputs: [{ id: "then", kind: "exec" }],
			compilesTo: { kind: "statement", template: "$in.target:Destroy()" },
		}],
	}, "pack").defs;

	const compiled = (required?: boolean) => {
		const b = new Builder();
		const start = b.node("script.begin");
		const hit = b.node("combat.hit");
		b.link(start, "then", hit, "in");
		return compile(b.build(), createRegistry(pack(required)));
	};

	it("is an error naming the pin", () => {
		const errors = compiled().diagnostics.filter((d) => d.severity === "error");
		expect(errors.map((d) => d.message).join(" ")).toContain('needs a value on "Target"');
	});

	it("is an error when the pack says it must be wired", () => {
		expect(compiled(true).ok).toBe(false);
	});

	/** `required: false` is the pack saying an empty pin is fine. */
	it("is passed as nil when the pack says it may be empty", () => {
		const result = compiled(false);
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(result.code).toContain("(nil):Destroy()");
	});

	it("keeps the pack's word on the definition", () => {
		expect(pack()[0].inputs[1].required).toBeUndefined();
		expect(pack(true)[0].inputs[1].required).toBe(true);
		expect(pack(false)[0].inputs[1].required).toBe(false);
	});
});
