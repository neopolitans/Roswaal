/**
 * Worked examples for the nodes that cannot document themselves.
 *
 * Most nodes are shown by dropping one on a canvas and compiling: the shape is
 * obvious and generating it costs nothing. Control flow is different. A Branch
 * with nothing inside it emits an empty `if`, which shows less than it hides,
 * and a Function with no body is a name and a nil. These need a *scene* — a
 * loop with something in it, a function that returns something.
 *
 * So the graphs here are hand-authored. **They are still compiled**, by the same
 * emitter, and a test asserts every one of them produces output with no errors.
 * That is the line this file walks: the framing is a judgement call, the code
 * shown is not, and a curated example that stopped compiling would fail the
 * build rather than sit there being wrong.
 *
 * Keep them small. The reader is looking up one node, not reading a program.
 */

import type { NodeScript, Literal, NodeConfig } from "../schema.js";
import { emptyScript } from "../schema.js";
import { partPinId } from "../structs.js";

/** Terse graph construction, so an example reads like the graph it describes. */
/**
 * Where a node sits in the drawn scene.
 *
 * Columns run left to right with execution; rows are the arms of a fan-out. A
 * Branch's two consumers on one row look like a sequence — the reader cannot
 * tell which Print belongs to True — so a scene that splits says so by putting
 * the arms on different rows, which is what a person would do on the canvas.
 */
const COLUMN = 280;
const ROW = 150;

interface Place {
	/** Left to right. Defaults to the order nodes were created in. */
	column?: number;
	/** Which arm of a fan-out. 0 unless the scene branches. */
	row?: number;
	/**
	 * Pixels down from the top of the row. A reroute knot is a 22px dot, and
	 * 31 puts its centre level with a node's first pin row beside it, 55 with
	 * its second.
	 */
	dy?: number;
	/** Pixels right of the column, for a knot that belongs between two. */
	dx?: number;
}

/**
 * Spacing for a scene that has to fit a guide's narrow column without being
 * zoomed below readable: 24px between columns and 125 between rows, which is
 * still room for a three-input node and the wire leaving it.
 */
const TIGHT = { column: 240, row: 125 };

/**
 * How far a stand-in value sits below its row's execution line.
 *
 * A one-row node is 64px tall and the exec line runs 42px down, so anything
 * under 62 still crosses it. 68 clears it with a little air and still leaves the
 * node inside its own row band, including the tight spacing above.
 */
const STAND_DROP = 68;

/**
 * Exported for `demos.ts`, which builds whole programmes rather than scenes.
 *
 * The two files want the same construction and different things from it —
 * a scene is one node's worth of context, a demo is a program somebody could
 * have written — so they share the builder and nothing else.
 */
export class G {
	readonly script: NodeScript;
	private n = 0;
	/** Each node's column, so a consumer can be placed one to the right of it. */
	private columns = new Map<string, number>();

	constructor(
		patch: Partial<NodeScript> = {},
		private readonly spacing: { column: number; row: number } = { column: COLUMN, row: ROW },
	) {
		this.script = { ...emptyScript("Example", "docs-example"), ...patch };
	}

	node(
		def: string,
		// `label` because a node's label names the local it binds: `part`
		// rather than `Instance2` in the Luau under the picture.
		opts: { config?: NodeConfig; literals?: Record<string, Literal>; label?: string } & Place = {},
	): string {
		const { column, row, dy, dx, ...rest } = opts;
		const id = `n${this.n++}`;
		const at = column ?? this.n;
		this.columns.set(id, at);
		// These coordinates used to be arbitrary, because nothing drew them. They
		// are drawn now — a node page shows the scene above the Luau it compiled
		// to — so a column has to clear a 216px node, and an arm has to clear the
		// node above it.
		this.script.nodes.push({
			id, def,
			x: at * this.spacing.column + (dx ?? 0),
			y: (row ?? 0) * this.spacing.row + (dy ?? 0),
			...rest,
		});
		return id;
	}

	/**
	 * Draws these nodes in a function's own graph, where the editor puts a
	 * function's body. A Function is in its own graph already.
	 */
	inside(fn: string, ...ids: string[]): this {
		for (const node of this.script.nodes) if (ids.includes(node.id)) node.graph = fn;
		return this;
	}

	/** The column just right of a node, for placing what it feeds. */
	rightOf(id: string): number {
		return (this.columns.get(id) ?? 0) + 1;
	}

	/**
	 * A Luau Expression standing in for a value the reader would supply.
	 *
	 * Dropped below the execution line by default. A stand-in sits between two
	 * step nodes in the column order, so on the line it lands square across the
	 * exec wire running past it — and since 0.35.0 that wire ends in a triangle
	 * hung outside the node it feeds, close enough to the stand-in's own output
	 * to read as one pin. Below it, the exec wire runs clear overhead and the
	 * value climbs into the pin it feeds, which is how a person would place it.
	 */
	stand(text: string, place: Place = {}): string {
		return this.node("value.expression", {
			literals: { code: { t: "raw", v: text } },
			dy: STAND_DROP,
			...place,
		});
	}

	link(from: string, fromPin: string, to: string, toPin: string): this {
		this.script.links.push({
			id: `l${this.script.links.length}`,
			from: { node: from, pin: fromPin },
			to: { node: to, pin: toPin },
		});
		return this;
	}

	variable(name: string, type: string, value: Literal): string {
		const id = `v_${name}`;
		this.script.variables.push({ id, name, type, default: value });
		return id;
	}

	out(): NodeScript {
		return this.script;
	}
}

export const str = (v: string): Literal => ({ t: "string", v });
export const num = (v: number): Literal => ({ t: "number", v });

/**
 * A Print wired to run after `from`'s named exec pin.
 *
 * `row` is what makes a fan-out readable: both consumers of a Branch sit one
 * column right of it, on different rows, so the True and False wires visibly
 * separate instead of running along one line past each other.
 */
function printAfter(g: G, from: string, pin: string, text: string, row = 0): string {
	const p = g.node("debug.print", {
		literals: { value: str(text) },
		column: g.rightOf(from),
		row,
	});
	g.link(from, pin, p, "in");
	return p;
}

// ---------------------------------------------------------------------------

export const CURATED: Record<string, () => NodeScript> = {
	"script.begin": () => {
		const g = new G();
		const begin = g.node("script.begin");
		printAfter(g, begin, "then", "Hello");
		return g.out();
	},

	"script.end": () => {
		// Shown linearly, and the point is what is absent from the output: Script
		// End emits nothing, because falling off the end of a script does the same
		// thing. An earlier draft put it in a Branch's false arm to show an early
		// exit, which produced a bare `else` and taught the reader something
		// untrue about the node. It did get the emitter to stop emitting that.
		const g = new G();
		const begin = g.node("script.begin");
		const p = printAfter(g, begin, "then", "Done");
		const stop = g.node("script.end");
		g.link(p, "then", stop, "in");
		return g.out();
	},

	"flow.branch": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const alive = g.stand("isAlive");
		const branch = g.node("flow.branch");
		g.link(begin, "then", branch, "in").link(alive, "result", branch, "condition");
		printAfter(g, branch, "true", "Still going", 0);
		printAfter(g, branch, "false", "Gone", 1);
		return g.out();
	},

	"flow.sequence": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const seq = g.node("flow.sequence");
		g.link(begin, "then", seq, "in");
		printAfter(g, seq, "s0", "First", 0);
		printAfter(g, seq, "s1", "Second", 1);
		return g.out();
	},

	"flow.forRange": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const loop = g.node("flow.forRange", { literals: { first: num(1), last: num(3), step: num(1) } });
		g.link(begin, "then", loop, "in");
		const p = g.node("debug.print");
		g.link(loop, "body", p, "in").link(loop, "index", p, "value");
		return g.out();
	},

	"flow.forEach": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const items = g.stand("scores");
		const loop = g.node("flow.forEach");
		g.link(begin, "then", loop, "in").link(items, "result", loop, "table");
		const p = g.node("debug.print");
		g.link(loop, "body", p, "in").link(loop, "value", p, "value");
		return g.out();
	},

	"flow.forIndex": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const items = g.stand("players");
		const loop = g.node("flow.forIndex");
		g.link(begin, "then", loop, "in").link(items, "result", loop, "table");
		const p = g.node("debug.print");
		g.link(loop, "body", p, "in").link(loop, "value", p, "value");
		return g.out();
	},

	"flow.while": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const running = g.stand("running");
		const loop = g.node("flow.while");
		g.link(begin, "then", loop, "in").link(running, "result", loop, "condition");
		printAfter(g, loop, "body", "Tick");
		return g.out();
	},

	"flow.break": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const loop = g.node("flow.forRange", { literals: { first: num(1), last: num(10), step: num(1) } });
		g.link(begin, "then", loop, "in");
		const found = g.stand("found");
		const branch = g.node("flow.branch");
		g.link(loop, "body", branch, "in").link(found, "result", branch, "condition");
		const stop = g.node("flow.break", { column: g.rightOf(branch), row: 0 });
		g.link(branch, "true", stop, "in");
		return g.out();
	},

	"flow.continue": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const loop = g.node("flow.forRange", { literals: { first: num(1), last: num(10), step: num(1) } });
		g.link(begin, "then", loop, "in");
		const skip = g.stand("shouldSkip");
		const branch = g.node("flow.branch");
		g.link(loop, "body", branch, "in").link(skip, "result", branch, "condition");
		const next = g.node("flow.continue", { column: g.rightOf(branch), row: 0 });
		g.link(branch, "true", next, "in");
		printAfter(g, branch, "false", "Handled", 1);
		return g.out();
	},

	"function.entry": () => {
		const g = new G();
		const fn = g.node("function.entry", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const p = g.node("debug.print");
		g.link(fn, "then", p, "in").link(fn, "p0", p, "value");
		g.inside(fn, p);
		return g.out();
	},

	"function.return": () => {
		const g = new G();
		const fn = g.node("function.entry", {
			config: {
				name: "double",
				params: [{ name: "n", type: "number" }],
				returns: [{ name: "result", type: "number" }],
			},
		});
		const times = g.node("math.mul", { config: { args: 2 }, literals: { a1: num(2) } });
		g.link(fn, "p0", times, "a0");
		const ret = g.node("function.return", {
			config: { returns: [{ name: "result", type: "number" }] },
		});
		g.link(fn, "then", ret, "in").link(times, "result", ret, "r0");
		g.inside(fn, times, ret);
		return g.out();
	},

	"function.get": () => {
		const g = new G();
		const fn = g.node("function.entry", { config: { name: "onHit", params: [], returns: [] } });
		g.inside(fn, printAfter(g, fn, "then", "Hit"));
		const begin = g.node("script.begin", { column: 0 });
		const ref = g.node("function.get", { config: { function: fn, name: "onHit" }, column: 1, row: 1 });
		const p = g.node("debug.print", { column: 2 });
		g.link(begin, "then", p, "in").link(ref, "fn", p, "value");
		return g.out();
	},

	"module.exports": () => {
		const g = new G({ scriptClass: "ModuleScript" });
		const fn = g.node("function.entry", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const p = g.node("debug.print");
		g.link(fn, "then", p, "in").link(fn, "p0", p, "value");
		g.inside(fn, p);

		// A Function is in its own graph, so the module's graph reaches it as
		// the editor does: a Get Function, wired into the export.
		const ref = g.node("function.get", { config: { function: fn, name: "greet" }, column: 0 });
		const exports = g.node("module.exports", { config: { exports: [{ name: "greet" }] }, column: 1 });
		g.link(ref, "fn", exports, "e0");
		return g.out();
	},

	"event.connect": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const players = g.node("roblox.getService", { literals: { service: str("Players") } });
		const signal = g.node("roblox.getEvent", { literals: { event: str("PlayerAdded") } });
		g.link(players, "service", signal, "instance");

		const connect = g.node("event.connect", {
			config: { params: [{ name: "player", type: "Instance" }] },
		});
		g.link(begin, "then", connect, "in").link(signal, "result", connect, "signal");
		const p = g.node("debug.print");
		g.link(connect, "body", p, "in").link(connect, "p0", p, "value");
		return g.out();
	},

	"event.once": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const players = g.node("roblox.getService", { literals: { service: str("Players") } });
		const signal = g.node("roblox.getEvent", { literals: { event: str("PlayerAdded") } });
		g.link(players, "service", signal, "instance");

		const once = g.node("event.once", {
			config: { params: [{ name: "player", type: "Instance" }] },
		});
		g.link(begin, "then", once, "in").link(signal, "result", once, "signal");
		printAfter(g, once, "body", "First player is in");
		return g.out();
	},

	"call.function": () => {
		const g = new G();
		const fn = g.node("function.entry", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		g.inside(fn, printAfter(g, fn, "then", "Hello"));

		const begin = g.node("script.begin", { column: 0 });
		const ref = g.node("function.get", { config: { function: fn, name: "greet" }, column: 1, row: 1 });
		const call = g.node("call.function", { config: { args: 1 }, literals: { a0: str("world") }, column: 2 });
		g.link(begin, "then", call, "in").link(ref, "fn", call, "fn");
		return g.out();
	},

	"call.method": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const sound = g.stand("sound");
		const call = g.node("call.method", {
			config: { args: 0 },
			literals: { method: str("Play") },
		});
		g.link(begin, "then", call, "in").link(sound, "result", call, "object");
		return g.out();
	},

	/**
	 * Get Member reads a field the type declares, so the example has to
	 * declare one: the node is about the type as much as about the value.
	 */
	"value.member": () => {
		const g = new G();
		const begin = g.node("script.begin");
		g.node("type.declareTop", {
			config: {
				name: "Input",
				fields: [{ name: "throttle", type: "number" }, { name: "aim", type: "Vector3" }],
			},
		});
		const declare = g.node("local.declare", {
			config: { type: "Input" },
			literals: { name: str("input") },
		});
		const get = g.node("local.get", { config: { local: declare, name: "input", type: "Input" } });
		const read = g.node("value.member", { config: { member: "throttle", type: "number" } });
		g.link(get, "value", read, "object");
		const p = g.node("debug.print");
		g.link(begin, "then", declare, "in").link(declare, "then", p, "in");
		g.link(read, "result", p, "value");
		return g.out();
	},

	"module.requirePath": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const mod = g.node("module.requirePath", {
			literals: { root: str("ReplicatedStorage"), path: str("Shared.Greeter"), as: str("") },
		});
		const field = g.node("value.field", { literals: { field: str("greet") } });
		g.link(mod, "exports", field, "object");
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(field, "result", p, "value");
		return g.out();
	},

	// A LocalScript, because these are client-only and compiling the example in a
	// Script would attach the very warning the node exists to avoid.
	"players.localPlayer": () => {
		const g = new G({ scriptClass: "LocalScript" });
		const begin = g.node("script.begin");
		const me = g.node("players.localPlayer");
		const name = g.node("roblox.getProperty", { literals: { property: str("Name") } });
		g.link(me, "player", name, "instance");
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(name, "result", p, "value");
		return g.out();
	},

	"players.localCharacter": () => {
		const g = new G({ scriptClass: "LocalScript" });
		const begin = g.node("script.begin");
		const character = g.node("players.localCharacter");
		const humanoid = g.node("instance.findFirstChildOfClass", {
			literals: { className: str("Humanoid") },
		});
		g.link(character, "character", humanoid, "instance");
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(humanoid, "result", p, "value");
		return g.out();
	},

	"roblox.getService": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const players = g.node("roblox.getService", { literals: { service: str("Players") } });
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(players, "service", p, "value");
		return g.out();
	},

	"roblox.instancePath": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const path = g.node("roblox.instancePath", {
			literals: { root: str("ReplicatedStorage"), path: str("Modules.Combat") },
		});
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(path, "instance", p, "value");
		return g.out();
	},

	"variable.set": () => {
		const g = new G();
		const score = g.variable("score", "number", num(0));
		const begin = g.node("script.begin");
		const set = g.node("variable.set", {
			config: { variable: score, name: "score", type: "number" },
			literals: { value: num(10) },
		});
		g.link(begin, "then", set, "in");
		return g.out();
	},

	"variable.get": () => {
		const g = new G();
		const score = g.variable("score", "number", num(7));
		const begin = g.node("script.begin");
		const get = g.node("variable.get", {
			config: { variable: score, name: "score", type: "number" },
		});
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(get, "value", p, "value");
		return g.out();
	},

	"local.get": () => {
		const g = new G();
		const begin = g.node("script.begin", { column: 0 });
		const declare = g.node("local.declare", {
			column: 1, literals: { name: str("greeting"), value: str("Hello") },
		});
		const get = g.node("local.get", {
			column: 1, row: 1, config: { local: declare, name: "greeting" },
		});
		const p = g.node("debug.print", { column: 2 });
		g.link(begin, "then", declare, "in").link(declare, "then", p, "in").link(get, "value", p, "value");
		return g.out();
	},

	// The pair's key names the entry, so the row it lands on needs none.
	"table.pair": () => {
		const g = new G();
		const begin = g.node("script.begin", { column: 0 });
		const pair = g.node("table.pair", {
			column: 0, row: 1, literals: { key: str("walkSpeed"), value: num(16) },
		});
		// The first row split, so it shows a key typed in beside one arriving as
		// a pair; the second left whole, which is the pin the pair lands on.
		const dict = g.node("table.dictionary", {
			column: 1, row: 1, config: { args: 2, split: { "in:p0": "keyValue" } },
			literals: { "p0.key": str("jumpHeight"), "p0.value": num(7.2) },
		});
		const p = g.node("debug.print", { column: 2 });
		g.link(pair, "result", dict, "p1");
		g.link(begin, "then", p, "in").link(dict, "result", p, "value");
		return g.out();
	},

	// The two knots exist to show that they leave no trace. The example is the
	// same code you would get without them, which is the whole claim.
	"flow.reroute": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const value = g.stand("health");
		const knot = g.node("flow.reroute", { config: { type: "number" } });
		g.link(value, "result", knot, "in");
		const p = g.node("debug.print");
		g.link(begin, "then", p, "in").link(knot, "out", p, "value");
		return g.out();
	},

	"flow.rerouteExec": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const knot = g.node("flow.rerouteExec");
		g.link(begin, "then", knot, "in");
		printAfter(g, knot, "then", "Away we go");
		return g.out();
	},
};

/** Notes that belong with a curated example rather than with the node itself. */
/**
 * Scenes a guide draws, keyed by nothing in the registry.
 *
 * `CURATED` is keyed by node id because those scenes document a node. These
 * illustrate a *rule*, so they live apart — and they are still real graphs,
 * still compiled by the same emitter when a page asks for their output, so a
 * picture in a guide cannot show a graph that would not build.
 */
export const GUIDE_SCENES: Record<string, () => NodeScript> = {
	/**
	 * A type entered as rows, and one field read off a local of it.
	 *
	 * Four nodes, because the page shows this beside two others and a picture
	 * somebody has to pan is a picture nobody reads: the declaration, the local
	 * that is one, and the member.
	 */
	typeFieldsRows: () => {
		const g = new G({}, TIGHT);
		g.node("type.declareTop", {
			column: 0, row: 0,
			config: {
				name: "Input",
				fields: [
					{ name: "throttle", type: "number" },
					{ name: "steer", type: "number" },
					{ name: "aim", type: "Vector3" },
				],
				layout: "lines",
			},
		});
		// A table written out, so the scene holds everything it reads: the
		// value is the type's three fields, filled in.
		const from = g.node("table.dictionary", {
			column: 0, row: 2,
			config: {
				args: 3,
				split: { "in:p0": "keyValue", "in:p1": "keyValue", "in:p2": "keyValue" },
				layout: "lines",
			},
			literals: {
				"p0.key": str("throttle"), "p0.value": num(1),
				"p1.key": str("steer"), "p1.value": num(0),
				"p2.key": str("aim"), "p2.value": { t: "raw", v: "Vector3.zAxis" },
			},
		});
		const begin = g.node("script.begin", { column: 0, row: 1 });
		const declare = g.node("local.declare", {
			column: 1, row: 1,
			config: { type: "Input" },
			literals: { name: str("input") },
		});
		g.link(begin, "then", declare, "in");
		g.link(from, "result", declare, "value");
		const read = g.node("value.member", {
			column: 2, row: 1, config: { member: "aim", type: "Vector3" },
		});
		const print = g.node("debug.print", { column: 3, row: 1 });
		g.link(declare, "ref", read, "object");
		g.link(declare, "then", print, "in");
		g.link(read, "result", print, "value");
		return g.out();
	},

	/** The same type, typed out as Luau instead of entered as rows. */
	typeFieldsWritten: () => {
		const g = new G({}, TIGHT);
		g.node("type.declareTop", {
			column: 0, row: 0,
			config: {
				name: "Shot",
				shape: "written",
				definition: "{ damage: number, from: Vector3 }",
			},
		});
		const from = g.node("table.dictionary", {
			column: 0, row: 2,
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" } },
			literals: {
				"p0.key": str("damage"), "p0.value": num(25),
				"p1.key": str("from"), "p1.value": { t: "raw", v: "Vector3.zero" },
			},
		});
		const begin = g.node("script.begin", { column: 0, row: 1 });
		const declare = g.node("local.declare", {
			column: 1, row: 1,
			config: { type: "Shot" },
			literals: { name: str("shot") },
		});
		g.link(begin, "then", declare, "in");
		g.link(from, "result", declare, "value");
		const read = g.node("value.member", {
			column: 2, row: 1, config: { member: "damage", type: "number" },
		});
		const print = g.node("debug.print", { column: 3, row: 1 });
		g.link(declare, "ref", read, "object");
		g.link(declare, "then", print, "in");
		g.link(read, "result", print, "value");
		return g.out();
	},

	/** A type with no fixed fields, and the node that reads one anyway. */
	typeFieldsOpen: () => {
		const g = new G({}, TIGHT);
		g.node("type.declareTop", {
			column: 0, row: 0,
			config: { name: "Scores", shape: "written", definition: "{ [string]: number }" },
		});
		const from = g.node("table.dictionary", {
			column: 0, row: 2,
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" } },
			literals: {
				"p0.key": str("alice"), "p0.value": num(12),
				"p1.key": str("bob"), "p1.value": num(9),
			},
		});
		const begin = g.node("script.begin", { column: 0, row: 1 });
		const declare = g.node("local.declare", {
			column: 1, row: 1,
			config: { type: "Scores" },
			literals: { name: str("scores") },
		});
		g.link(begin, "then", declare, "in");
		g.link(from, "result", declare, "value");
		const read = g.node("value.field", {
			column: 2, row: 1, literals: { field: str("alice") },
		});
		const print = g.node("debug.print", { column: 3, row: 1 });
		g.link(declare, "ref", read, "object");
		g.link(declare, "then", print, "in");
		g.link(read, "result", print, "value");
		return g.out();
	},

	/**
	 * The module the next scene requires: `Tank.Config`.
	 *
	 * Here so the pair can be read as the two files they are. It declares the
	 * type *and* returns the table, which is the arrangement that makes
	 * `Config.Tuning` nameable from another graph at all — the type is exported
	 * by the module, and the value is a key on what it returns.
	 */
	tankConfigModule: () => {
		const g = new G({ scriptClass: "ModuleScript" }, TIGHT);
		g.node("type.declareTop", {
			column: 0, row: 0,
			config: {
				name: "Tuning",
				fields: [
					{ name: "turnRate", type: "number" },
					{ name: "accelerationTime", type: "number" },
				],
				layout: "lines",
			},
		});
		const tuning = g.node("table.dictionary", {
			column: 0, row: 1,
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" }, layout: "lines" },
			literals: {
				"p0.key": str("turnRate"),
				"p0.value": num(45),
				"p1.key": str("accelerationTime"),
				"p1.value": num(5),
			},
		});
		const exports = g.node("module.exports", {
			column: 1, row: 1, config: { exports: [{ name: "tuning" }] },
		});
		g.link(tuning, "result", exports, "e0");
		return g.out();
	},

	/**
	 * A type another module exports, on a value taken out of that module.
	 *
	 * Both nodes in one line of Luau, which is the point of the picture: the
	 * module's own table is a value nothing here can describe, so its key is
	 * read by **Get Field** — and what comes back is annotated `Config.Tuning`,
	 * which *is* described, so `turnRate` off it is a **Get Member**.
	 */
	memberOfModule: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 0 });
		const mod = g.node("module.requirePath", {
			column: 0, row: 1,
			literals: { root: str("ReplicatedStorage"), path: str("Tank.Config"), as: str("") },
		});
		const field = g.node("value.field", {
			column: 1, row: 1, literals: { field: str("tuning") },
		});
		const declare = g.node("local.declare", {
			column: 2, row: 0,
			config: { type: "Config.Tuning" },
			literals: { name: str("tuning") },
		});
		const get = g.node("local.get", {
			column: 3, row: 1,
			config: { local: declare, name: "tuning", type: "Config.Tuning" },
		});
		const rate = g.node("value.member", {
			column: 4, row: 1, config: { member: "turnRate", type: "number" },
		});
		const print = g.node("debug.print", { column: 5, row: 0 });
		g.link(mod, "exports", field, "object");
		g.link(field, "result", declare, "value");
		g.link(begin, "then", declare, "in");
		g.link(declare, "then", print, "in");
		g.link(get, "value", rate, "object");
		g.link(rate, "result", print, "value");
		return g.out();
	},

	/** A Roblox instance, whose properties the engine fixes. */
	memberOfInstance: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 0 });
		const made = g.node("roblox.instanceNew", {
			column: 1, row: 0, label: "part", literals: { className: str("Part") },
		});
		const anchored = g.node("value.member", {
			column: 2, row: 0, config: { member: "Anchored", type: "boolean" },
		});
		const branch = g.node("flow.branch", { column: 3, row: 0 });
		g.link(begin, "then", made, "in");
		g.link(made, "result", anchored, "object");
		g.link(made, "then", branch, "in");
		g.link(anchored, "result", branch, "condition");
		return g.out();
	},

	/**
	 * Why a local declared in one branch arm is not visible in the other.
	 *
	 * The two Custom Code nodes are siblings: each is inside its own `if` arm,
	 * so the `local` the first declares has died at the `end` before the second
	 * one runs. Completion knows this — see `precedingLocals` — and offers the
	 * name in neither.
	 */
	localScope: () => {
		const g = new G();
		const begin = g.node("script.begin");
		const ready = g.stand("isReady");
		const branch = g.node("flow.branch");
		g.link(begin, "then", branch, "in").link(ready, "result", branch, "condition");

		const declares = g.node("code.custom", {
			literals: { code: { t: "raw", v: "local total = 1\nprint(total)" } },
			column: g.rightOf(branch),
			row: 0,
		});
		const cannotSee = g.node("code.custom", {
			literals: { code: { t: "raw", v: "-- `total` is not in scope here" } },
			column: g.rightOf(branch),
			row: 1,
		});
		g.link(branch, "true", declares, "in").link(branch, "false", cannotSee, "in");
		return g.out();
	},

	/** One wire out of each execution pin, and Sequence where one step becomes two. */
	wireExecution: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0 });
		const seq = g.node("flow.sequence", { column: 1 });
		g.link(begin, "then", seq, "in");
		printAfter(g, seq, "s0", "First", 0);
		printAfter(g, seq, "s1", "Second", 1);
		return g.out();
	},

	/**
	 * Wires that stay one colour, each between two pins of the same type.
	 *
	 * Every wire here is typed at both ends on purpose: wiring any of these into
	 * Print would fade it into `any`'s grey, which is the next scene's point.
	 */
	wireColours: () => {
		const g = new G({}, TIGHT);
		const at = g.node("roblox.vector3", {
			column: 0, row: 0, literals: { x: num(0), y: num(10), z: num(0) },
		});
		const frame = g.node("cframe.new", { column: 1, row: 0 });
		const position = g.node("cframe.position", { column: 2, row: 0 });
		g.link(at, "result", frame, "position").link(frame, "result", position, "cframe");

		const offset = g.node("roblox.vector3", {
			column: 0, row: 1, literals: { x: num(3), y: num(4), z: num(0) },
		});
		const length = g.node("vector3.magnitude", { column: 1, row: 1 });
		const far = g.node("compare.gt", { column: 2, row: 1, literals: { b: num(5) } });
		g.link(offset, "result", length, "v").link(length, "result", far, "a");

		const workspace = g.node("roblox.getService", {
			column: 0, row: 2, literals: { service: str("Workspace") },
		});
		const name = g.node("instance.getName", { column: 1, row: 2 });
		const loud = g.node("string.upper", { column: 2, row: 2 });
		g.link(workspace, "service", name, "instance").link(name, "result", loud, "value");
		return g.out();
	},

	/** Wires that change colour on the way, because the value changes type. */
	wireFades: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 0 });
		// A row lower than Concatenate, so the wire between them has the length
		// to show its fade rather than a hop across a 24px gap.
		const sum = g.node("math.add", { column: 0, row: 2, literals: { a0: num(2), a1: num(3) } });
		const text = g.node("string.concat", {
			column: 1, row: 1, literals: { a0: str("Score: ") },
		});
		const p = g.node("debug.print", { column: 2, row: 0 });
		g.link(begin, "then", p, "in")
			.link(sum, "result", text, "a1")
			.link(text, "result", p, "value");
		return g.out();
	},

	/**
	 * Knots tidying two wires whose sources sit lower down than what they feed.
	 *
	 * Each wire rises to a knot level with the pin it is going to, then runs
	 * flat into it. The knots are staggered so the execution wire's flat run
	 * passes over the data knot rather than through it.
	 */
	wireKnots: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 1 });
		const health = g.node("value.expression", {
			column: 0, row: 2, literals: { code: { t: "raw", v: "health" } },
		});
		// Level with Print's execution pin, and with its Value pin.
		const turn = g.node("flow.rerouteExec", { column: 1, row: 0, dx: 60, dy: 31 });
		const bend = g.node("flow.reroute", { column: 1, row: 0, dx: 150, dy: 55 });
		const p = g.node("debug.print", { column: 2, row: 0 });
		g.link(begin, "then", turn, "in").link(turn, "then", p, "in");
		g.link(health, "result", bend, "in").link(bend, "out", p, "value");
		return g.out();
	},

	/**
	 * What two pin menu items leave behind: a CFrame whose Position was split,
	 * under one left whole, and a variable promoted from the split pin's Y.
	 */
	pinMenu: () => {
		const g = new G({}, TIGHT);
		const height = g.variable("Height", "number", num(12));
		g.node("cframe.new", { column: 1, row: 0 });
		const split = g.node("cframe.new", {
			column: 1, row: 1, config: { split: { "in:position": "xyz" } },
		});
		// Level with the split node's Y: header 30, one row of 24, half a row.
		const get = g.node("variable.get", {
			column: 0, row: 1, dx: 90, dy: 52,
			config: { variable: height, name: "Height", type: "number" },
		});
		g.link(get, "value", split, partPinId("position", "y"));
		return g.out();
	},

	/** Custom Code as a step: three statements, then whatever is wired after. */
	customCode: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0 });
		const code = g.node("code.custom", {
			column: 1, literals: { code: { t: "raw", v: "local hits = 0\nhits += 1\nprint(hits)" } },
		});
		g.link(begin, "then", code, "in");
		printAfter(g, code, "then", "Done");
		return g.out();
	},

	/** Luau Expression as a value, spliced into the Print that reads it. */
	luauExpression: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 0 });
		const expr = g.node("value.expression", {
			column: 0, row: 1, literals: { code: { t: "raw", v: "os.clock() * 2" } },
		});
		const p = g.node("debug.print", { column: 1, row: 0 });
		g.link(begin, "then", p, "in").link(expr, "result", p, "value");
		return g.out();
	},

	/** Two nodes that take a list, each one past its minimum. */
	/**
	 * Asking a service a question, where the answer is wanted.
	 *
	 * The point is the shape: `RunService:IsServer()` is a value node feeding a
	 * Branch's condition, with no execution wire of its own — and the service it
	 * calls on never appears as a node, because it is hoisted to the top of the
	 * file.
	 */
	serviceCall: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 0 });
		const branch = g.node("flow.branch", { column: 1, row: 0 });
		const isServer = g.node("roblox.serviceValue", {
			column: 0, row: 1, config: { service: "RunService", method: "IsServer" },
		});
		g.link(begin, "then", branch, "in").link(isServer, "result", branch, "condition");
		printAfter(g, branch, "true", "On the server", 0);
		printAfter(g, branch, "false", "On the client", 1);
		return g.out();
	},

	growPins: () => {
		const g = new G({}, TIGHT);
		const begin = g.node("script.begin", { column: 0, row: 0 });
		const seq = g.node("flow.sequence", { column: 1, row: 0, config: { count: 3 } });
		g.link(begin, "then", seq, "in");
		g.node("math.add", {
			column: 0, row: 1, config: { args: 3 },
			literals: { a0: num(1), a1: num(2), a2: num(3) },
		});
		return g.out();
	},
};

export const EXAMPLE_NOTES: Record<string, string> = {
	"flow.reroute":
		"A knot compiles to nothing at all — this is the same code you would get without it.",
	"flow.rerouteExec":
		"A knot compiles to nothing at all — this is the same code you would get without it.",
	"roblox.getService":
		"Note where the service went: hoisted to the top of the file, as a hand-written Roblox script would have it.",
	"players.localPlayer":
		"The Players service is reached for you, and hoisted the same way — no Get Service node needed. Used in a Script rather than a LocalScript, this compiles fine and is nil at runtime, so Roswaal warns instead.",
	"players.localCharacter":
		"Nil until the character has spawned. Connect to CharacterAdded when you need to be sure, rather than reading this at the top of a script.",
	"module.requirePath":
		"Requires hoist alongside services, and asking twice reuses the one local.",
	"script.end":
		"Look at what is not there: Script End emits nothing. Falling off the end of a script does the same thing, so it is optional — it is worth placing only to say out loud that the flow stops here.",
};
