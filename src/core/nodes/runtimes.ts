/**
 * Which runtime each built-in node is for.
 *
 * Roswaal compiles for two: **Roblox**, and **Lune**, the standalone Luau
 * runtime. A node that cannot work in the one you are targeting should not be
 * in the menu when you search it, and `NodeDef.targets` has always said so —
 * the node menu and the node picker both filter on it, and have since it
 * existed.
 *
 * What was missing was the data. Of 283 built-in nodes, 46 declared a runtime
 * and 237 said nothing, so a Lune graph offered every Vector3, every Instance
 * method and the whole Roblox event system as though they would compile.
 *
 * ## The runtime is not a property of a constructor
 *
 * Worse than the gaps: the tags that existed were partly an accident. Two of
 * the helpers in `library.ts` — `variadicStmt` and `variadicCall` — *defaulted*
 * `targets` to `["roblox"]`, so a node's runtime was decided by which
 * constructor its author happened to reach for. That was right ten times and
 * wrong twice, which is the dangerous ratio: `coroutine.resume` and
 * `coroutine.yield` are plain Luau and were hidden from every Lune graph,
 * while their six siblings built with other helpers were not.
 *
 * So the defaults are gone and the answer lives here, in one table that can be
 * read in full.
 *
 * ## How a node gets its runtime
 *
 * 1. **The node, if it says so.** An explicit `targets` on the definition wins,
 *    and is for nodes that disagree with the category around them.
 * 2. **{@link NODE_RUNTIME}**, for the same thing said here instead — used when
 *    a whole family disagrees with its category and listing them together is
 *    clearer than seven identical lines in `library.ts`.
 * 3. **{@link CATEGORY_RUNTIME}**, which every category must appear in.
 *
 * That last rule is the point of the file. A category missing from the table
 * fails `tests/runtimes.test.ts`, so a new one cannot be added without somebody
 * deciding what it runs on — which is how 237 nodes came to say nothing in the
 * first place.
 */

import type { NodeDef, Target } from "../schema.js";

/**
 * What a runtime answer can be, before it becomes a `targets` array.
 *
 * `luau` means the node is base Luau and works in both, which is `targets`
 * omitted. It is spelled out rather than left as `undefined` because "works
 * everywhere" and "nobody has said" are different claims and used to look
 * identical.
 */
export type Runtime = "luau" | "roblox" | "lune";

/**
 * Every category, and what its nodes run on.
 *
 * **Roblox** categories are the ones whose nodes reach for something the engine
 * provides and Lune does not:
 *
 * - *Engine Types* — `Vector3`, `CFrame`, `Color3`, `BrickColor`, `UDim2` and
 *   the rest. Lune carries its own implementations behind `@lune/roblox`, so
 *   these become conditional rather than forbidden once there is a node that
 *   can require it. Until then they are Roblox: a node compiling to
 *   `Vector3.new(...)` in a Lune file is a nil index, and offering it is worse
 *   than hiding it.
 * - *Instances*, *Engine*, *Players*, *Events*, *Networking* — the DataModel,
 *   its services, its signals and its remotes. None of it is a Lune idea.
 * - *Time* — `DateTime` is Roblox's. Lune's equivalent is `@lune/datetime` and
 *   is a different API, not the same one somewhere else.
 * - *Z-Up Conversions* — they exist to produce `CFrame` and `Vector3`, so they
 *   are Roblox for the same reason Engine Types are.
 *
 * Everything else is **base Luau**: the language, its standard library, and the
 * shapes Roswaal builds out of them.
 */
export const CATEGORY_RUNTIME: Record<string, Runtime> = {
	// The language, and what Roswaal makes out of it.
	"Flow": "luau",
	"Variables": "luau",
	"Values": "luau",
	"Logic": "luau",
	"Math": "luau",
	"Strings": "luau",
	"Tables": "luau",
	"Modules": "luau",
	// `print`, `warn`, `error`, `assert` and `debug.traceback` are all globals
	// in Lune as well as in Roblox -- `warn` included, which is worth saying
	// because it reads like a Roblox invention. Checked against Lune's own
	// source: it ships `crates/lune-std/src/globals/warn.rs`.
	"Debug": "luau",
	// `coroutine` is Luau's. `task` is not, and is listed in NODE_RUNTIME.
	"Threads": "luau",

	// The engine.
	"Engine Types": "roblox",
	"Instances": "roblox",
	"Engine": "roblox",
	"Events": "roblox",
	"Networking": "roblox",
	"Players": "roblox",
	"Time": "roblox",
	"Z-Up Conversions": "roblox",
};

/**
 * Nodes that disagree with the category they are filed under.
 *
 * Kept here rather than on each definition when a whole family disagrees:
 * `task` is seven nodes in a category that is otherwise Luau's own
 * `coroutine`, and seven scattered `targets: ["roblox"]` lines are seven
 * chances to miss one.
 */
export const NODE_RUNTIME: Record<string, Runtime> = {
	/**
	 * `task` is Roblox's scheduler. Lune has one too and it is **not a global**
	 * — its own changelog records the globals for `fs`, `net`, `process`,
	 * `stdio` and `task` being removed in favour of `require("@lune/task")`.
	 * So `task.wait(1)` in a Lune file indexes nil.
	 *
	 * These become conditional on `@lune/task` when there is a node that can
	 * require it, the same way the datatypes wait on `@lune/roblox`.
	 */
	"task.wait": "roblox",
	"task.spawn": "roblox",
	"task.defer": "roblox",
	"task.delay": "roblox",
	"task.cancel": "roblox",
	"task.synchronize": "roblox",
	"task.desynchronize": "roblox",

	/** Requires a ModuleScript by instance path, which is a DataModel idea. */
	"module.requirePath": "roblox",
};

/** A runtime as the `targets` array a `NodeDef` carries. */
export function targetsFor(runtime: Runtime): Target[] | undefined {
	if (runtime === "luau") return undefined;
	return [runtime];
}

/**
 * What one node runs on, by the three rules above in order.
 *
 * Returns `undefined` for a category nobody has classified, which is what the
 * test looks for — rather than quietly answering "works everywhere", which is
 * the answer that got us here.
 */
export function runtimeOf(def: Pick<NodeDef, "id" | "category">): Runtime | undefined {
	return NODE_RUNTIME[def.id] ?? CATEGORY_RUNTIME[def.category];
}

/**
 * Every built-in node, with its runtime stamped on.
 *
 * A definition that declares `targets` itself keeps it: the table fills in, it
 * does not overrule. Applied once where `BUILTIN_NODES` is assembled, so there
 * is no path into the registry that skips it.
 */
export function withRuntimes(defs: NodeDef[]): NodeDef[] {
	return defs.map((def) => {
		if (def.targets) return def;
		const runtime = runtimeOf(def);
		if (runtime === undefined) return def;
		const targets = targetsFor(runtime);
		return targets ? { ...def, targets } : def;
	});
}
