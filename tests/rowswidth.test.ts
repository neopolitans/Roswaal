/**
 * A node as wide as its pin rows need: the widest input side beside the widest
 * output side, since every row shares one output column. The needs below are
 * what the canvas measured for these nodes with their defaults, before they
 * grew to fit.
 */

import { describe, expect, it } from "vitest";

import { nodeWidth, rowsWidth } from "../src/core/nodeBox.js";
import { NODE } from "../src/core/nodeMetrics.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();
const titled = (title: string) => {
	const def = [...registry.values()].find((d) => d.title === title);
	if (!def) throw new Error(`no node called ${title}`);
	return def;
};
const placed = (title: string) => ({ id: "n", def: titled(title).id, x: 0, y: 0 });

describe("a node as wide as its rows", () => {
	it.each([
		["New Instance", 258],
		["TweenInfo", 264],
		["Find First Child Of Class", 243],
		["Color3 To HSV", 240],
	])("gives %s the %ipx its rows took on the canvas", (title, measured) => {
		expect(nodeWidth(titled(title), placed(title))).toBeGreaterThanOrEqual(measured);
	});

	it("leaves a node its rows fit at the width every node has", () => {
		expect(nodeWidth(titled("Branch"), placed("Branch"))).toBe(NODE.width);
		expect(rowsWidth(titled("Branch"), {})).toBeLessThanOrEqual(NODE.width);
	});

	it("keeps its width whether or not an input is wired", () => {
		// Counted from the pin, not from what is drawn: a value field hides when
		// a wire arrives, and the node does not jump narrower.
		const def = titled("New Instance");
		expect(rowsWidth(def, {})).toBe(rowsWidth(def, { literals: {} }));
	});
});
