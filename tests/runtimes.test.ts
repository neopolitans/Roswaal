/**
 * Which runtime each built-in node is for.
 *
 * Roswaal compiles for Roblox and for Lune, and the node menu has always
 * filtered on `NodeDef.targets`. What it had to filter on was 46 nodes out of
 * 283 — so a Lune graph offered every Vector3, every Instance method and the
 * whole remote system as though they would compile.
 *
 * The tests that matter are not "is Vector3 Roblox". They are the two that stop
 * it happening again:
 *
 * - **Nobody is undecided by accident.** Every category has to be classified,
 *   so a new one cannot be added without somebody saying what it runs on. That
 *   is exactly how 237 nodes came to say nothing.
 * - **No constructor decides a runtime.** Two helpers in `library.ts` defaulted
 *   `targets` to `["roblox"]`, which made the answer a property of which helper
 *   an author reached for. It was right ten times and wrong twice, and the two
 *   it got wrong hid plain Luau from every Lune graph.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, categories, createRegistry } from "../src/core/nodes/index.js";
import {
	CATEGORY_RUNTIME, classify, NODE_RUNTIME, RUNTIME_LABEL, RUNTIME_SUMMARY, RUNTIMES,
	runtimeOf, targetsFor, withRuntimes,
} from "../src/core/nodes/runtimes.js";
import type { NodeDef } from "../src/core/schema.js";

const registry = createRegistry();
const all = [...registry.values()];

const source = (path: string) =>
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", path), "utf8");

describe("every node says what it runs on", () => {
	/**
	 * The rule the whole file exists for. A category missing from the table is
	 * a category whose nodes silently mean "works everywhere", which is the
	 * claim that was wrong 237 times.
	 */
	it("classifies every category in the registry", () => {
		for (const category of categories(registry)) {
			expect(CATEGORY_RUNTIME[category], `"${category}" has no runtime`).toBeDefined();
		}
	});

	/** And the table names nothing that has stopped existing. */
	it("names no category that is not in the registry", () => {
		const real = new Set(categories(registry));
		for (const named of Object.keys(CATEGORY_RUNTIME)) {
			expect(real.has(named), `CATEGORY_RUNTIME names "${named}", which is not a category`)
				.toBe(true);
		}
	});

	it("names no node that is not in the registry", () => {
		for (const id of Object.keys(NODE_RUNTIME)) {
			expect(registry.has(id), `NODE_RUNTIME names "${id}", which is not a node`).toBe(true);
		}
	});

	it("leaves no built-in without a deliberate answer", () => {
		for (const def of all) {
			expect(runtimeOf(def), `${def.id} (${def.category})`).toBeDefined();
		}
	});
});

describe("no constructor decides a runtime", () => {
	/**
	 * The exact failure. `variadicStmt` read `targets: opts.targets ?? ["roblox"]`
	 * and `variadicCall` hard-coded `targets: ["roblox"]`, so two `coroutine`
	 * nodes were Roblox because of the shape of their argument list.
	 */
	it("leaves the variadic helpers out of it", () => {
		const library = source("src/core/nodes/library.ts");
		const helpers = library.slice(
			library.indexOf("function variadicStmt("),
			library.indexOf("// -- Debug"),
		);
		expect(helpers).not.toContain('targets: opts.targets ?? ["roblox"]');
		expect(helpers).not.toContain('targets: ["roblox"], latent: opts.latent');
	});

	/**
	 * `coroutine` is Luau's own primitive — the summary on Create Coroutine
	 * says so in as many words — and six of its eight nodes were visible in a
	 * Lune graph while these two were not.
	 */
	it("gives the whole coroutine family the same answer", () => {
		const family = all.filter((d) => d.id.startsWith("coroutine."));
		expect(family.length).toBeGreaterThan(5);
		for (const def of family) {
			expect(def.targets, `${def.id} is not base Luau`).toBeUndefined();
		}
	});

	/**
	 * And `task` gets the other one. Lune's scheduler is not a global: its
	 * changelog records the `task` global being removed in favour of
	 * `require("@lune/task")`, so `task.wait(1)` in a Lune file indexes nil.
	 */
	it("gives the whole task family the same answer", () => {
		const family = all.filter((d) => d.id.startsWith("task."));
		expect(family.length).toBeGreaterThan(5);
		for (const def of family) {
			expect(def.targets, `${def.id}`).toEqual(["roblox"]);
		}
	});
});

describe("what a Lune graph is offered", () => {
	const forTarget = (target: "roblox" | "lune") =>
		all.filter((def) => !def.targets || def.targets.includes(target));

	it("hides the engine from it", () => {
		const lune = new Set(forTarget("lune").map((d) => d.id));
		for (const id of ["roblox.vector3", "cframe.new", "instance.getName", "datetime.fromIso"]) {
			expect(lune.has(id), `${id} is offered to a Lune graph`).toBe(false);
		}
	});

	it("keeps the language in it", () => {
		const lune = new Set(forTarget("lune").map((d) => d.id));
		for (const id of ["math.add", "string.format", "table.insert", "debug.print", "debug.warn",
			"coroutine.create", "flow.branch", "value.number"]) {
			expect(lune.has(id), `${id} is missing from a Lune graph`).toBe(true);
		}
	});

	/**
	 * The number is not the point and will move; that it is *most* of the
	 * library is. Before this, a Lune graph was offered all 283.
	 */
	it("offers a Lune graph a third of what a Roblox graph gets", () => {
		expect(forTarget("roblox")).toHaveLength(all.length);
		expect(forTarget("lune").length).toBeLessThan(all.length / 2);
		expect(forTarget("lune").length).toBeGreaterThan(50);
	});
});

/**
 * 0.62.0: the runtime is something you can see and narrow by.
 *
 * The filter sits on top of the target's own, never instead of it — a Lune
 * graph must not gain a Roblox node because somebody picked a chip.
 */
describe("runtime as an axis", () => {
	it("classifies a node from its own targets, packs included", () => {
		expect(classify({ targets: undefined })).toBe("luau");
		expect(classify({ targets: [] })).toBe("luau");
		expect(classify({ targets: ["roblox"] })).toBe("roblox");
		expect(classify({ targets: ["lune"] })).toBe("lune");
		// Saying both is the same claim as saying neither.
		expect(classify({ targets: ["roblox", "lune"] })).toBe("luau");
	});

	it("agrees with the table for every built-in", () => {
		for (const def of all) {
			expect(classify(def), def.id).toBe(runtimeOf(def));
		}
	});

	it("names every runtime it offers", () => {
		for (const runtime of RUNTIMES) {
			expect(RUNTIME_LABEL[runtime], runtime).toBeTruthy();
			expect(RUNTIME_SUMMARY[runtime], runtime).toBeTruthy();
		}
		// The portable one first: it is the answer to "what can I move".
		expect(RUNTIMES[0]).toBe("luau");
	});

	/**
	 * The chips are drawn from what is present, so a Lune graph is never
	 * offered a Roblox filter that could only ever return nothing.
	 */
	it("offers a Lune graph no Roblox filter", () => {
		const present = (target: "roblox" | "lune") => {
			const forTarget = all.filter((d) => !d.targets || d.targets.includes(target));
			const seen = new Set(forTarget.map(classify));
			return RUNTIMES.filter((r) => seen.has(r));
		};
		expect(present("roblox")).toEqual(["luau", "roblox"]);
		expect(present("lune")).toEqual(["luau"]);
	});

	/** Both lists read the same preference, so the answer does not depend on route. */
	it("uses one preference in both the menu and the picker", () => {
		for (const path of ["src/app/NodeMenu.tsx", "src/app/NodePicker.tsx"]) {
			expect(source(path), path).toContain("readPreferences().nodeRuntime");
			expect(source(path), path).toContain("nodeRuntime: next");
		}
	});

	/** Narrowing must not widen: the target's filter is applied first, always. */
	it("narrows what the target allows rather than replacing it", () => {
		const menu = source("src/app/NodeMenu.tsx");
		// The wire filter and then the runtime filter, both over `allItems`,
		// which is already target-filtered.
		expect(menu).toContain("def.targets.includes(target)");
		expect(menu).toContain("byWire.filter((item) => item.runtime === narrowed)");
	});
});

describe("stamping the runtimes on", () => {
	it("leaves a definition that declares its own alone", () => {
		const declared: NodeDef = {
			id: "x.y", title: "X", category: "Math", targets: ["lune"],
			pure: true, inputs: [], outputs: [],
			compilesTo: { kind: "expr", outputs: { result: "1" } },
		};
		expect(withRuntimes([declared])[0].targets).toEqual(["lune"]);
	});

	it("says base Luau with an absent targets rather than a full one", () => {
		expect(targetsFor("luau")).toBeUndefined();
		expect(targetsFor("roblox")).toEqual(["roblox"]);
	});

	/** Applied where the built-ins are assembled, so nothing can route around it. */
	it("is applied to BUILTIN_NODES itself", () => {
		expect(source("src/core/nodes/index.ts")).toContain("withRuntimes([");
		for (const def of BUILTIN_NODES) {
			expect(runtimeOf(def), def.id).toBeDefined();
		}
	});

	/** A pack's node is the project's to classify; we do not guess for it. */
	it("does not stamp a node pack's nodes", () => {
		const pack: NodeDef = {
			id: "mypack.thing", title: "Thing", category: "Math",
			pure: true, inputs: [], outputs: [],
			compilesTo: { kind: "expr", outputs: { result: "1" } },
		};
		expect(createRegistry([pack]).get("mypack.thing")!.targets).toBeUndefined();
	});
});
