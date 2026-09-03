import { describe, expect, it } from "vitest";
import { createRegistry } from "../src/core/nodes/index.js";
import { precedingLocals } from "../src/app/luauCompletions.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** A Custom Code node declaring one local. */
function block(b: Builder, name: string): string {
	const id = b.node("code.custom");
	b.lit(id, "code", { t: "raw", v: `local ${name} = 1` });
	return id;
}

function offered(script: Parameters<typeof precedingLocals>[0], nodeId: string): string[] {
	return precedingLocals(script, registry, nodeId).map((c) => c.label);
}

describe("which locals a Custom Code block can see", () => {
	it("sees one declared earlier in the same chain", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = block(b, "alpha");
		const second = block(b, "beta");
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");

		expect(offered(b.build(), second)).toEqual(["alpha"]);
	});

	it("does not see one declared later", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = block(b, "alpha");
		const second = block(b, "beta");
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");

		expect(offered(b.build(), first)).toEqual([]);
	});

	it("sees one from an earlier Sequence output, which shares the block", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const early = block(b, "alpha");
		const late = block(b, "beta");
		b.link(start, "then", seq, "in");
		b.link(seq, "s0", early, "in");
		b.link(seq, "s1", late, "in");

		expect(offered(b.build(), late)).toEqual(["alpha"]);
	});

	/**
	 * The case worth getting right: a local inside a Connect handler dies at the
	 * closing `end)`, so a later Sequence output must not be offered it.
	 */
	it("does not see one declared inside a connect handler off an earlier output", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const connect = b.node("event.connect", { config: { params: [] } });
		const inBody = block(b, "insideHandler");
		const afterConnect = block(b, "afterConnect");
		const late = block(b, "beta");

		b.link(start, "then", seq, "in");
		b.link(seq, "s0", connect, "in");
		b.link(connect, "body", inBody, "in");
		b.link(connect, "then", afterConnect, "in");
		b.link(seq, "s1", late, "in");

		// afterConnect is in the same block as the Sequence; insideHandler is not.
		expect(offered(b.build(), late)).toEqual(["afterConnect"]);
	});

	it("does not see one declared inside a loop body off an earlier output", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const loop = b.node("flow.forRange");
		const inBody = block(b, "insideLoop");
		const done = block(b, "afterLoop");
		const late = block(b, "beta");

		b.link(start, "then", seq, "in");
		b.link(seq, "s0", loop, "in");
		b.link(loop, "body", inBody, "in");
		b.link(loop, "completed", done, "in");
		b.link(seq, "s1", late, "in");

		expect(offered(b.build(), late)).toEqual(["afterLoop"]);
	});

	it("does not see one declared inside a branch arm off an earlier output", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const seq = b.node("flow.sequence", { config: { count: 2 } });
		const branch = b.node("flow.branch");
		const inArm = block(b, "insideArm");
		const late = block(b, "beta");

		b.link(start, "then", seq, "in");
		b.link(seq, "s0", branch, "in");
		b.link(branch, "true", inArm, "in");
		b.link(seq, "s1", late, "in");

		expect(offered(b.build(), late)).toEqual([]);
	});

	/** The other direction: an outer local is an upvalue inside the handler. */
	it("sees an outer local from inside a connect handler", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const outer = block(b, "outer");
		const connect = b.node("event.connect", { config: { params: [] } });
		const inBody = block(b, "inner");

		b.link(start, "then", outer, "in");
		b.link(outer, "then", connect, "in");
		b.link(connect, "body", inBody, "in");

		expect(offered(b.build(), inBody)).toEqual(["outer"]);
	});

	it("does not see a sibling branch arm's local", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const yes = block(b, "onlyWhenTrue");
		const no = block(b, "onlyWhenFalse");

		b.link(start, "then", branch, "in");
		b.link(branch, "true", yes, "in");
		b.link(branch, "false", no, "in");

		expect(offered(b.build(), no)).toEqual([]);
	});
});
