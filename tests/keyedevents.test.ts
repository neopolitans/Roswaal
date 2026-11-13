/**
 * The daemon's event stream as the editor reads it with `fetch`: the parser
 * frames events the way `EventSource` would, however the text arrives.
 */

import { describe, expect, it } from "vitest";

import { eventStreamParser, type StreamEvent } from "../src/app/keyedEvents.js";

function parse(...chunks: string[]) {
	const events: StreamEvent[] = [];
	const retries: number[] = [];
	const feed = eventStreamParser(
		(event) => events.push(event),
		(ms) => retries.push(ms),
	);
	for (const chunk of chunks) feed(chunk);
	return { events, retries };
}

describe("reading the event stream", () => {
	it("frames named events, as the daemon writes them", () => {
		expect(
			parse('event: ready\ndata: {"hot":true}\n\nevent: hot\ndata: {"path":"a"}\n\n').events,
		).toEqual([
			{ type: "ready", data: '{"hot":true}' },
			{ type: "hot", data: '{"path":"a"}' },
		]);
	});

	it("is the same however the text is split", () => {
		const whole = 'event: compile\ndata: {"n":1}\n\n';
		const split = [...whole].map((c) => c);
		expect(parse(...split).events).toEqual(parse(whole).events);
	});

	it("passes over the daemon's pings, and joins data lines", () => {
		expect(parse(": ping\n\ndata: one\ndata: two\n\n").events).toEqual([
			{ type: "message", data: "one\ntwo" },
		]);
	});

	it("takes CRLF line ends, and a retry", () => {
		expect(parse("retry: 500\r\nevent: x\r\ndata: y\r\n\r\n")).toEqual({
			events: [{ type: "x", data: "y" }],
			retries: [500],
		});
	});

	it("dispatches nothing for an event not yet ended", () => {
		expect(parse("event: hot\ndata: {}\n").events).toEqual([]);
	});
});
