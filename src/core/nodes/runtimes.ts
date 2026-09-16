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

import { ENGINE_TYPES, type NodeDef, type Target } from "../schema.js";
import { LUNE_ROBLOX_DATATYPES } from "../luneApi.js";

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
	/**
	 * The one Lune category, and the first `lune` entry in this table.
	 *
	 * Its nodes call `@lune/fs` and the rest, which the Roblox engine does not
	 * have — so a Roblox graph should never be offered one, which is what this
	 * line does.
	 */
	"Lune": "lune",

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

/**
 * What each runtime is called where a person reads it.
 *
 * "Luau" rather than "both" or "any": the claim is about the language, not
 * about coverage, and a node that is base Luau stays base Luau on the day a
 * third runtime appears.
 */
export const RUNTIME_LABEL: Record<Runtime, string> = {
	luau: "Luau",
	roblox: "Roblox",
	lune: "Lune",
};

/** One line on what each means, for a tooltip and for the documentation. */
export const RUNTIME_SUMMARY: Record<Runtime, string> = {
	luau: "The language and its standard library. Works in both runtimes.",
	roblox: "Needs the Roblox engine — its datatypes, its DataModel or its scheduler.",
	lune: "Needs Lune, the standalone Luau runtime.",
};

/** Which order they are offered in: the portable one first. */
export const RUNTIMES: readonly Runtime[] = ["luau", "roblox", "lune"];

/**
 * What a node runs on, read off the node itself.
 *
 * The counterpart to {@link runtimeOf}, which answers from the tables for a
 * built-in. This one answers for **any** node including a project's own pack,
 * whose runtime is the project's to declare and is on the definition or
 * nowhere. Targeting both runtimes explicitly is the same claim as targeting
 * neither, so both come back as base Luau.
 */
/**
 * The module a node needs to work in the runtime that is not its own.
 *
 * `Vector3` is Roblox's datatype and Lune implements it, so the node works in
 * both — but not for the same reason, and not for free. `@lune/roblox` has to
 * be required for it, which is a thing to say rather than a thing to average
 * out.
 *
 * `undefined` for every other node, which is nearly all of them.
 */
export function crossRuntimeModule(
	def: Pick<NodeDef, "category"> & { subcategory?: string },
): string | undefined {
	if (def.category !== ENGINE_TYPES) return undefined;
	if (!def.subcategory || !LUNE_ROBLOX_DATATYPES.includes(def.subcategory)) return undefined;
	return "@lune/roblox";
}

/**
 * What a node is tagged as, for the runtime the reader is in.
 *
 * `classify` answers "which of the three is this" and maps a node that works in
 * both to `luau` — which is right for the nodes that *are* Luau and wrong for
 * the handful that are Roblox's and borrowed. Tagging `Vector3` as Luau says
 * the base language has it, and the base language does not.
 *
 * So a cross-runtime node takes the tag of the graph asking. In a Roblox graph
 * it is Roblox's datatype, because it is. In a Lune graph it is Lune's, because
 * that is the module it arrives through — and the label says which module.
 */
export function classifyFor(
	def: Pick<NodeDef, "category" | "targets"> & { subcategory?: string },
	target: Target | undefined,
): Runtime {
	if (target !== undefined && crossRuntimeModule(def) !== undefined) return target;
	return classify(def);
}

/** What a tag reads, for the runtime a node is being shown in. */
export function runtimeLabelFor(
	def: Pick<NodeDef, "category" | "targets"> & { subcategory?: string },
	target: Target | undefined,
): string {
	const via = crossRuntimeModule(def);
	const runtime = classifyFor(def, target);
	/**
	 * The borrowed side is tagged with the **require string itself**.
	 *
	 * `Lune: @lune/roblox` said the runtime and then the module, and the
	 * runtime was the part carrying no information — you are reading this in a
	 * Lune graph. The specifier is the whole answer: it is what has to be
	 * declared, and it is the text that goes in the field to declare it.
	 *
	 * In its own runtime the node is simply that runtime's, and
	 * `Roblox: @lune/roblox` would be nonsense.
	 */
	return via !== undefined && runtime === "lune" ? via : RUNTIME_LABEL[runtime];
}

export function classify(def: { targets?: readonly string[] }): Runtime {
	const targets = def.targets;
	if (!targets || targets.length === 0) return "luau";
	if (targets.includes("roblox") && targets.includes("lune")) return "luau";
	return targets.includes("lune") ? "lune" : "roblox";
}

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
export function runtimeOf(
	def: Pick<NodeDef, "id" | "category"> & { subcategory?: string },
): Runtime | undefined {
	const named = NODE_RUNTIME[def.id];
	if (named !== undefined) return named;

	/**
	 * A Roblox datatype `@lune/roblox` implements works in both.
	 *
	 * The category is Roblox's, and for most of it that is the whole answer.
	 * But `Vector3` is not the engine — it is a table with a `new`, and Lune
	 * ships an implementation of it. A Lune program that requires
	 * `@lune/roblox` genuinely has `Vector3.new(0, 10, 0)`, so hiding the node
	 * from a Lune graph hid something that works.
	 *
	 * Which datatypes is generated from the module's own source, so this
	 * follows a Lune release rather than a list somebody kept up. `TweenInfo`
	 * is a Roblox datatype Lune does not implement, and stays Roblox-only.
	 *
	 * The node is *offered*, not silently made to work: it still needs the
	 * module declared, and says so. Same arrangement as a Lune call, for the
	 * same reason — a require happens because somebody asked.
	 */
	if (def.category === ENGINE_TYPES && def.subcategory &&
		LUNE_ROBLOX_DATATYPES.includes(def.subcategory)) {
		return "luau";
	}

	return CATEGORY_RUNTIME[def.category];
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
