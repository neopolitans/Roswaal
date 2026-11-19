/**
 * The node map's Graph layout: a column a level, leaves one under another,
 * each parent level with the middle of its children.
 */

import { describe, expect, it } from "vitest";

import { placeRows, type Row } from "../src/app/MapEditor.jsx";

const row = (key: string, depth: number, parent = false): Row => ({
	key,
	depth,
	parent,
	pick: { kind: "node", id: key },
});

describe("the map as a graph", () => {
	// M103's Tank map, as the list draws it.
	const rows = [
		row("dm", 0, true),
		row("rs", 1, true),
		row("tank", 2),
		row("sss", 1),
		row("sp", 1, true),
		row("sps", 2),
	];

	it("puts each level in a column of its own", () => {
		const laid = placeRows(rows);
		const [dm] = laid.roots;
		const [rs, sss, sp] = dm.children;
		expect(rs.x).toBeGreaterThan(dm.x);
		expect(sss.x).toBe(rs.x);
		expect(sp.x).toBe(rs.x);
		expect(rs.children[0].x).toBeGreaterThan(rs.x);
	});

	it("stacks the leaves and centres each parent on its children", () => {
		const laid = placeRows(rows);
		const [dm] = laid.roots;
		const [rs, sss, sp] = dm.children;
		const tank = rs.children[0];
		const sps = sp.children[0];
		expect(sss.y).toBeGreaterThan(tank.y);
		expect(sps.y).toBeGreaterThan(sss.y);
		expect(rs.y).toBe(tank.y);
		expect(dm.y).toBe((rs.y + sp.y) / 2);
	});

	it("is as big as what it draws", () => {
		const laid = placeRows(rows);
		const deepest = laid.roots[0].children[0].children[0];
		expect(laid.width).toBeGreaterThan(deepest.x);
		expect(laid.height).toBeGreaterThan(laid.roots[0].children[2].children[0].y);
	});
});
