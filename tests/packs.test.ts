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

import { BUILTIN_NODES } from "../src/core/nodes/index.js";
import { openProject } from "../src/server/project.js";

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
		const find = BUILTIN_NODES.find((def) => def.id === "roblox.findFirstChild");
		expect(find?.subtitle?.({ resultName: "value" })).toBe("value");
		expect(find?.subtitle?.({})).toBeUndefined();
	});

	/** A JSON round trip is exactly what the daemon used to do to these. */
	it("loses that subtitle through JSON, which is the whole reason for the rule", () => {
		const find = BUILTIN_NODES.find((def) => def.id === "roblox.findFirstChild")!;
		const throughTheWire = JSON.parse(JSON.stringify(find));
		expect(throughTheWire.subtitle).toBeUndefined();
	});
});
