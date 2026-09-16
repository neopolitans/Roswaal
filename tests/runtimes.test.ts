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
import { allPages, buildSite, findPage } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import {
	CATEGORY_RUNTIME, classify, crossRuntimeModule, NODE_RUNTIME, RUNTIME_LABEL,
	RUNTIME_SUMMARY, RUNTIMES,
	runtimeOf, targetsFor, withRuntimes,
} from "../src/core/nodes/runtimes.js";
import {
	FILTER_LABEL, FILTER_SUMMARY, MENU_FILTERS,
} from "../src/app/preferences.js";
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
		for (const id of ["instance.getName", "datetime.fromIso", "tweeninfo.new", "tween.create"]) {
			expect(lune.has(id), `${id} is offered to a Lune graph`).toBe(false);
		}
	});

	/**
	 * A datatype is not the engine.
	 *
	 * `Vector3` is a table with a `new` on it, and `@lune/roblox` ships an
	 * implementation — so a Lune program that requires it genuinely has
	 * `Vector3.new(0, 10, 0)`, and hiding the node hid something that works.
	 * It is still *offered* rather than silently made to work: the module has
	 * to be declared and the node says so.
	 *
	 * Which datatypes is read from the module's own source, so `TweenInfo` —
	 * a Roblox datatype Lune does not implement — is above, with the engine.
	 */
	it("offers the datatypes @lune/roblox implements, and no others", () => {
		const lune = new Set(forTarget("lune").map((d) => d.id));
		for (const id of ["roblox.vector3", "cframe.new", "color3.new", "udim2.new"]) {
			expect(lune.has(id), `${id} should be offered to a Lune graph`).toBe(true);
		}

		const engine = all.filter((def) => def.category === "Engine Types");
		const offered = engine.filter((def) => lune.has(def.id));
		const held = engine.filter((def) => !lune.has(def.id));
		expect(offered.length).toBeGreaterThan(held.length);
		// The ones held back are exactly the two families Lune has no
		// implementation of, rather than an arbitrary remainder.
		expect([...new Set(held.map((def) => def.subcategory))].sort())
			.toEqual(["Tween", "TweenInfo"]);
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
	 *
	 * Neither target gets everything now. A Roblox graph is offered all of it
	 * bar the `Lune` category, which arrived with 0.66.0 and calls modules the
	 * engine does not have — the same argument in the other direction, and the
	 * first time the exclusion has run that way.
	 */
	it("offers each target most of the library, and neither all of it", () => {
		const lune = forTarget("lune");
		const roblox = forTarget("roblox");

		expect(roblox.length).toBeLessThan(all.length);
		expect(roblox.length).toBeGreaterThan(all.length * 0.9);
		expect(roblox.some((d) => d.category === "Lune")).toBe(false);

		// A Lune graph was offered a third of the library when the datatypes
		// were all held back, and the number is not the point — that it is most
		// of it, and not all of it, is.
		expect(lune.length).toBeLessThan(all.length);
		expect(lune.length).toBeGreaterThan(all.length / 2);
		expect(lune.some((d) => d.category === "Lune")).toBe(true);
		expect(lune.some((d) => d.category === "Instances")).toBe(false);
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
	 * The chips are drawn from what is present, so neither graph is offered a
	 * filter that could only ever return nothing.
	 *
	 * A Lune graph had no Lune chip until 0.66.0, and that was correct at the
	 * time: every node it could see was plain Luau, so a "Lune" filter would
	 * have emptied the list. The standard library is the first thing that makes
	 * the chip mean something.
	 */
	it("offers each graph only the filters it can fill", () => {
		const present = (target: "roblox" | "lune") => {
			const forTarget = all.filter((d) => !d.targets || d.targets.includes(target));
			const seen = new Set(forTarget.map(classify));
			return RUNTIMES.filter((r) => seen.has(r));
		};
		expect(present("roblox")).toEqual(["luau", "roblox"]);
		expect(present("lune")).toEqual(["luau", "lune"]);
	});

	/** Both lists read the same preference, so the answer does not depend on route. */
	it("uses one preference in both the menu and the picker", () => {
		for (const path of ["src/app/NodeMenu.tsx", "src/app/NodePicker.tsx"]) {
			expect(source(path), path).toContain("readPreferences().nodeFilter");
			expect(source(path), path).toContain("nodeFilter: next");
		}
	});

	/**
	 * "This graph" is the fourth option and a different kind of claim: not
	 * which runtime a node needs, but that it is not a library node at all --
	 * a variable you named, a local, a function, one of its parameters.
	 */
	it("names the fourth option and puts what you wrote first", () => {
		expect(MENU_FILTERS[0]).toBe("graph");
		expect(FILTER_LABEL.graph).toBe("This graph");
		expect(FILTER_SUMMARY.graph).toMatch(/variables, locals, functions and parameters/i);
	});

	/**
	 * Both searches offer it, and both get it from the same place.
	 *
	 * The picker listed the library and nothing else until 0.62.5, so the one
	 * search that shows you what a node *looks* like could not find the node
	 * you named yourself. It takes `buildPresets`' output now -- built once in
	 * `App.tsx` and scoped there -- so the two cannot disagree about what this
	 * graph has, or about which of a function's parameters are in scope.
	 */
	it("offers This graph in both searches, from one source", () => {
		expect(source("src/app/NodeMenu.tsx")).toContain('runtime: "graph" as const');
		expect(source("src/app/NodePicker.tsx")).toContain('filter: "graph" as const');
		// One call site, and both surfaces take the result as a prop. (The
		// builder itself lives in NodeMenu.tsx, which is why this asks App
		// rather than asking the components what they do not contain.)
		const app = source("src/app/App.tsx");
		expect(app.match(/buildPresets\(/g)).toHaveLength(1);
		expect(app).toContain("presets={presets}");
		expect(source("src/app/NodePicker.tsx")).toContain("presets = []");
	});

	/**
	 * A preset is a node plus the configuration that makes it that one, and the
	 * picker's whole point is the picture. Drawn without the config, every
	 * variable in a graph previews as the same nameless capsule.
	 */
	it("draws a graph's own entry as the node it will place", () => {
		expect(source("src/app/NodePicker.tsx"))
			.toContain("previewOf(chosen.def, chosen.config)");
	});

	/** Runtimes still cover the library, with `graph` added on top rather than into it. */
	it("keeps the runtimes as they were", () => {
		expect(MENU_FILTERS.filter((f) => f !== "graph")).toEqual([...RUNTIMES]);
	});

	/**
	 * A Lune graph has exactly one runtime in it, so there is nothing to choose
	 * between — and the first version hid the row entirely, which read as the
	 * filter being broken rather than as there being one answer. It says what
	 * the one runtime is instead.
	 */
	it("says which runtime it is when there is only one", () => {
		for (const path of ["src/app/NodeMenu.tsx", "src/app/NodePicker.tsx"]) {
			const text = source(path);
			expect(text, path).toContain("present.length === 1");
			expect(text, path).toContain("Every node here is");
			// And the chips are still hidden in that case: one option is furniture.
			expect(text, path).toContain("present.length > 1");
		}
	});

	/**
	 * Both alignment bugs, held as CSS rules because that is what they were.
	 *
	 * `margin-left: auto` on every hint split the free space between them, so
	 * `pure` landed at a different x on every row that also carried a badge —
	 * 843 on one, 827 on the next. And a bordered badge on a baseline-aligned
	 * row hangs below the baseline its neighbour sits on.
	 */
	it("keeps a row's trailing chips in one column and on one line", () => {
		const css = source("src/app/theme.css");
		const rule = (selector: string) => {
			const at = css.indexOf(selector + " {");
			expect(at, selector).toBeGreaterThan(-1);
			return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
		};
		// Only the first hint pushes; the rest follow at the row's own gap.
		expect(rule(".menu .item .hint ~ .hint")).toContain("margin-left: 0");
		expect(rule(".node-picker-hit .hint ~ .hint")).toContain("margin-left: 0");
		// And every trailing chip centres rather than sitting on the baseline.
		expect(rule(".menu .item .hint")).toContain("align-self: center");
		expect(rule(".node-picker-hit .hint")).toContain("align-self: center");
		expect(rule(".hint.runtime")).toContain("align-self: center");
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

/**
 * The same fact, in the documentation.
 *
 * A node page carries the runtime as a tag beside its title, in the words and
 * the colours the node menu uses — so a badge on a row there and a badge on a
 * page here are one vocabulary rather than two.
 */
describe("the tag on a node's page", () => {
	const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));

	it("gives every node page a runtime and no guide one", () => {
		for (const page of allPages(site)) {
			if (page.nodeId) expect(page.runtime, page.slug).toBeDefined();
			else expect(page.runtime, page.slug).toBeUndefined();
		}
	});

	it("agrees with the node it documents", () => {
		for (const page of allPages(site)) {
			if (!page.nodeId) continue;
			const def = registry.get(page.nodeId)!;
			/**
			 * A borrowed datatype carries two tags rather than one averaged
			 * one: `Roblox`, because it is Roblox's, and `Lune: @lune/roblox`,
			 * because that is how Lune has it. `classify` averages both-runtime
			 * nodes to `luau`, which is right for the ones that *are* Luau and
			 * says the wrong thing about these.
			 */
			if (crossRuntimeModule(def) !== undefined) {
				expect(page.runtime, page.slug).toBe("roblox");
				expect(page.runtimeVia, page.slug).toBe("@lune/roblox");
				continue;
			}
			expect(page.runtime, page.slug).toBe(classify(def));
			expect(page.runtimeVia, page.slug).toBeUndefined();
		}
	});

	/**
	 * The tag a reader sees, which is the part that was wrong.
	 *
	 * `Vector3` tagged `Luau` says the base language has it. The base language
	 * does not: Roblox has it, and Lune has it through a module you require.
	 */
	it("says Roblox and names the module Lune needs", () => {
		const page = renderPage(site, findPage(site, "node/roblox.vector3")!, { version: "test" });
		expect(page).toContain(">Roblox</span>");
		// The require string itself: it is what has to be declared, and the
		// text that goes in the field to declare it.
		expect(page).toContain(">@lune/roblox</span>");
		expect(page).not.toContain(">Luau</span>");
	});

	it("renders it as a badge, on the base-Luau pages too", () => {
		const opts = { version: "test" };
		// Instance work needs the DataModel, which is the thing Lune has not
		// got. `Vector3` used to be the example here and is no longer one: it
		// is Roblox's datatype and Lune implements it, so it reads as both.
		const instance = renderPage(site, findPage(site, "node/instance.getName")!, opts);
		const add = renderPage(site, findPage(site, "node/math.add")!, opts);

		expect(instance).toContain('class="badge runtime roblox"');
		expect(instance).toContain(">Roblox</span>");
		// Stated rather than left off: a page is arrived at one at a time, so an
		// absence has not answered anything.
		expect(add).toContain('class="badge runtime luau"');
		expect(add).toContain(">Luau</span>");
	});

	/** A guide is about an idea, not about something that runs. */
	it("puts no tag on a guide", () => {
		const controls = renderPage(site, findPage(site, "controls")!, { version: "test" });
		expect(controls).not.toContain("badge runtime");
	});

	it("styles all three, scoped to the title", () => {
		const css = source("src/app/theme.css");
		for (const runtime of RUNTIMES) {
			expect(css, runtime).toContain(`.docs-title .badge.runtime.${runtime}`);
		}
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
