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

/** Terse graph construction, so an example reads like the graph it describes. */
class G {
	readonly script: NodeScript;
	private n = 0;

	constructor(patch: Partial<NodeScript> = {}) {
		this.script = { ...emptyScript("Example", "docs-example"), ...patch };
	}

	node(def: string, opts: { config?: NodeConfig; literals?: Record<string, Literal> } = {}): string {
		const id = `n${this.n++}`;
		// 200 used to be arbitrary: nothing drew these graphs, so the only thing
		// the coordinates had to do was exist. They are drawn now — a node page
		// shows the scene above the Luau it compiled to — and at 200 the nodes
		// overlapped, because a node is 216 wide. Wide enough to leave a gap.
		this.script.nodes.push({ id, def, x: this.n * 280, y: 0, ...opts });
		return id;
	}

	/** A Luau Expression standing in for a value the reader would supply. */
	stand(text: string): string {
		return this.node("value.expression", { literals: { code: { t: "raw", v: text } } });
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

const str = (v: string): Literal => ({ t: "string", v });
const num = (v: number): Literal => ({ t: "number", v });

/** A Print wired to run after `from`'s named exec pin. */
function printAfter(g: G, from: string, pin: string, text: string): string {
	const p = g.node("debug.print", { literals: { value: str(text) } });
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
		printAfter(g, branch, "true", "Still going");
		printAfter(g, branch, "false", "Gone");
		return g.out();
	},

	"flow.sequence": () => {
		const g = new G();
		const begin = g.node("script.begin");
		const seq = g.node("flow.sequence");
		g.link(begin, "then", seq, "in");
		printAfter(g, seq, "s0", "First");
		printAfter(g, seq, "s1", "Second");
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
		const stop = g.node("flow.break");
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
		const next = g.node("flow.continue");
		g.link(branch, "true", next, "in");
		printAfter(g, branch, "false", "Handled");
		return g.out();
	},

	"function.entry": () => {
		const g = new G();
		const fn = g.node("function.entry", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const p = g.node("debug.print");
		g.link(fn, "then", p, "in").link(fn, "p0", p, "value");
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
		return g.out();
	},

	"function.get": () => {
		const g = new G();
		const fn = g.node("function.entry", { config: { name: "onHit", params: [], returns: [] } });
		printAfter(g, fn, "then", "Hit");
		const begin = g.node("script.begin");
		const ref = g.node("function.get", { config: { function: fn, name: "onHit" } });
		const p = g.node("debug.print");
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

		const exports = g.node("module.exports", { config: { exports: [{ name: "greet" }] } });
		g.link(fn, "self", exports, "e0");
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
		printAfter(g, fn, "then", "Hello");

		const begin = g.node("script.begin");
		const ref = g.node("function.get", { config: { function: fn, name: "greet" } });
		const call = g.node("call.function", { config: { args: 1 }, literals: { a0: str("world") } });
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
