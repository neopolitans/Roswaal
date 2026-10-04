/**
 * On Event, and Connect Event taking its parameters from the engine.
 */

import { describe, expect, it } from "vitest";

import { connect } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { signatureOf } from "../src/core/nodes/flow.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

function errors(result: { diagnostics: { severity: string; message: string }[] }): string[] {
	return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
}

/** Players, from Get Service, which the graph knows is a Players. */
function playersInto(b: Builder): string {
	const players = b.node("roblox.getService");
	b.lit(players, "service", { t: "string", v: "Players" });
	return players;
}

describe("On Event", () => {
	it("connects to the instance's event by name, with its parameters", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const players = playersInto(b);
		const on = b.node("event.on", {
			config: { event: "PlayerAdded", params: [{ name: "player", type: "Player" }] },
		});
		const print = b.node("debug.print");
		b.link(start, "then", on, "in");
		b.link(players, "service", on, "instance");
		b.link(on, "body", print, "in");
		b.link(on, "p0", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			[
				`local Players = game:GetService("Players")`,
				"",
				"Players.PlayerAdded:Connect(function(player: Player)",
				"\tprint(player)",
				"end)",
			].join("\n"),
		);
	});

	it("gives a pin per parameter, typed", () => {
		const def = registry.get("event.on")!;
		const pins = def.derivePins!({
			event: "Touched",
			params: [{ name: "otherPart", type: "BasePart" }],
		});
		expect(pins.outputs?.map((p) => [p.id, p.type ?? "exec"])).toEqual([
			["then", "exec"],
			["body", "exec"],
			["connection", "RBXScriptConnection"],
			["p0", "BasePart"],
		]);
	});

	it("says so when no event is picked", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const on = b.node("event.on", { config: { params: [] } });
		b.link(start, "then", on, "in");
		b.link(playersInto(b), "service", on, "instance");
		expect(errors(compile(b.build(), registry)).join("\n")).toMatch(/needs an event/);
	});

	it("refuses an event name Luau cannot write after a dot", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const on = b.node("event.on", { config: { event: "Player Added", params: [] } });
		b.link(start, "then", on, "in");
		b.link(playersInto(b), "service", on, "instance");
		expect(errors(compile(b.build(), registry))).not.toEqual([]);
	});
});

describe("Connect Event from Get Event", () => {
	/** A graph with Get Event reading PlayerAdded and an empty Connect beside it. */
	function unwired(
		def: "event.connect" | "event.once",
		params: { name: string; type: string }[] = [],
	) {
		const b = new Builder();
		const players = playersInto(b);
		const signal = b.node("roblox.getEvent");
		b.lit(signal, "event", { t: "string", v: "PlayerAdded" });
		const handler = b.node(def, { config: { params } });
		return { b, players, signal, handler };
	}

	it("takes the event's parameters when its signal is wired", () => {
		for (const def of ["event.connect", "event.once"] as const) {
			const { b, players, signal, handler } = unwired(def);
			b.link(players, "service", signal, "instance");
			const script = connect(
				b.build(),
				registry,
				{ node: signal, pin: "result" },
				{ node: handler, pin: "signal" },
			);
			const node = script.nodes.find((n) => n.id === handler)!;
			expect(signatureOf(node.config).params).toEqual([{ name: "player", type: "Player" }]);
		}
	});

	it("takes them when the instance is wired after the signal", () => {
		const { b, players, signal, handler } = unwired("event.connect");
		b.link(signal, "result", handler, "signal");
		const script = connect(
			b.build(),
			registry,
			{ node: players, pin: "service" },
			{ node: signal, pin: "instance" },
		);
		const node = script.nodes.find((n) => n.id === handler)!;
		expect(signatureOf(node.config).params).toEqual([{ name: "player", type: "Player" }]);
	});

	it("keeps parameters the author already wrote", () => {
		const { b, players, signal, handler } = unwired("event.connect", [
			{ name: "who", type: "any" },
		]);
		b.link(players, "service", signal, "instance");
		const script = connect(
			b.build(),
			registry,
			{ node: signal, pin: "result" },
			{ node: handler, pin: "signal" },
		);
		const node = script.nodes.find((n) => n.id === handler)!;
		expect(signatureOf(node.config).params).toEqual([{ name: "who", type: "any" }]);
	});

	it("leaves them alone when the class is not known", () => {
		const { b, signal, handler } = unwired("event.connect");
		const script = connect(
			b.build(),
			registry,
			{ node: signal, pin: "result" },
			{ node: handler, pin: "signal" },
		);
		const node = script.nodes.find((n) => n.id === handler)!;
		expect(signatureOf(node.config).params).toEqual([]);
	});
});
