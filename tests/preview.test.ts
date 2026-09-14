/**
 * Node previews, held against the canvas.
 *
 * A picture of a node is only worth having if it is the node. The risk this
 * file exists for is drift: somebody widens a row, or gives a node a subtitle,
 * and the canvas moves while the documentation goes on confidently showing the
 * old shape. Nobody notices, because a preview that is wrong still looks like a
 * node.
 *
 * So the size and the row centres are asserted against `nodeBounds` and
 * `pinPosition` — the functions the editor itself uses to place a node and
 * attach a wire — for every node in the library, rather than against a fixture
 * that would have to be updated by the same hand that broke it.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import {
	graphSvg, placeGraph, placedPinAnchor, previewOf, previewRowY, previewSize, previewSvg,
	describe as describePreview, type PreviewOptions,
} from "../src/core/docs/preview.js";
import { buildSite } from "../src/core/docs/site.js";
import { documentRegistry } from "../src/core/docs/nodeReference.js";
import { CURATED } from "../src/core/docs/examples.js";
import { renderPage } from "../src/core/docs/html.js";
import { nodeBounds, pinPosition, wirePath } from "../src/app/geometry.js";
import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import { emptyScript, type GraphNode, type NodeDef, type NodeScript } from "../src/core/schema.js";

const registry = createRegistry();
const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));
const options: PreviewOptions = { geometry: NODE, nodeColor, pinColor };

/** The graph node the canvas would draw, for the same definition. */
function placed(def: NodeDef): GraphNode {
	return { id: "n", def: def.id, x: 0, y: 0 };
}

describe("preview geometry", () => {
	it("is the size the canvas draws the node at", () => {
		for (const def of BUILTIN_NODES) {
			const box = nodeBounds(placed(def), registry);
			const size = previewSize(previewOf(def), NODE);
			expect(size, def.id).toEqual({ width: box.w, height: box.h });
		}
	});

	/**
	 * And at the width the reader asked for.
	 *
	 * Widening is the one look that moves *pins*, so the picture and the canvas
	 * have to agree about it as well. Each computes the header's width itself —
	 * `nodeWidth` here, `headerWidth` there — and two estimates a fraction of a
	 * pixel apart would put every wide node's wires out of step with its own
	 * drawing. They are held to one constant on `NODE`, and this is what says so.
	 */
	it("is that size when nodes are widened too", () => {
		const wide = { ...NODE, wideNodes: true };
		for (const def of BUILTIN_NODES) {
			const box = nodeBounds(placed(def), registry, true);
			const size = previewSize(previewOf(def), wide);
			expect(size, def.id).toEqual({ width: box.w, height: box.h });
		}
	});

	/** A node whose header fits is left exactly as wide as it always was. */
	it("widens only the nodes that need it", () => {
		const short = registry.get("debug.print")!;
		expect(nodeBounds(placed(short), registry, true).w).toBe(NODE.width);

		// A Declare Local showing a long name is the case the option exists for.
		const declare = registry.get("local.declare")!;
		const named = {
			id: "n", def: declare.id, x: 0, y: 0,
			literals: { name: { t: "string", v: "restoresByCharacterModel" } },
		} as const;
		expect(nodeBounds(named, registry, true).w).toBeGreaterThan(NODE.width);
		expect(nodeBounds(named, registry, false).w).toBe(NODE.width);
	});

	it("puts every pin row where a wire would attach to it", () => {
		for (const def of BUILTIN_NODES) {
			// A capsule, a knot and a pill put their pins somewhere other than a
			// row, and are covered by their own cases below.
			if (def.display === "compact" || def.display === "reroute" || def.display === "operator") {
				continue;
			}

			const preview = previewOf(def);
			const node = placed(def);

			for (const [side, pins] of [
				["in", preview.inputs] as const,
				["out", preview.outputs] as const,
			]) {
				pins.forEach((pin, i) => {
					const onCanvas = pinPosition(node, registry, pin.id, side);
					expect(onCanvas, `${def.id} ${side}:${pin.id}`).not.toBeNull();
					expect(previewRowY(preview, NODE, i), `${def.id} ${side}:${pin.id}`)
						.toBe(onCanvas!.y);
				});
			}
		}
	});

	/**
	 * Pins moved onto the node's edge in 0.35.0, and this is what says so.
	 *
	 * The point of the change is that a pin is now where its wire ends: a data
	 * pin's centre *is* `pinPosition`. Before, the dot sat 14px inside the border
	 * and the wire stopped at the border, and nothing caught that because both
	 * halves were separately correct.
	 */
	it("draws a data pin centred on the edge its wire attaches to", () => {
		for (const def of BUILTIN_NODES) {
			if ((def.display ?? "normal") !== "normal") continue;
			const preview = previewOf(def);
			const { width } = previewSize(preview, NODE);
			const svg = previewSvg(preview, options);
			for (const match of svg.matchAll(/<circle cx="(-?[\d.]+)"/g)) {
				expect([0, width], `${def.id} pin at x=${match[1]}`).toContain(Number(match[1]));
			}
		}
	});

	/** An execution pin clears the border entirely, on whichever side it is on. */
	it("hangs an execution pin outside the node", () => {
		const def = BUILTIN_NODES.find(
			(d) =>
				(d.display ?? "normal") === "normal" &&
				d.inputs.some((p) => p.kind === "exec") &&
				d.outputs.some((p) => p.kind === "exec"),
		);
		expect(def, "the library still has a step node").toBeDefined();

		const preview = previewOf(def!);
		const { width } = previewSize(preview, NODE);
		const svg = previewSvg(preview, options);
		const xs = [...svg.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));

		expect(Math.min(...xs), "the input triangle is left of the node").toBeLessThan(0);
		expect(Math.max(...xs), "the output triangle is right of it").toBeGreaterThan(width);

		// And the picture is cropped wide enough to hold both, or the reader sees
		// two half pins.
		const box = svg.match(/viewBox="(-?[\d.]+) 0 ([\d.]+)/);
		expect(box).not.toBeNull();
		expect(Number(box![1])).toBeLessThanOrEqual(Math.min(...xs));
		expect(Number(box![1]) + Number(box![2])).toBeGreaterThanOrEqual(Math.max(...xs));
	});

	/**
	 * Paint order, which only matters because a pin is on the edge now.
	 *
	 * The DOM gets this for free: `.node` paints its border, and a pin is a
	 * child, so it lands on top. The SVG has to be told, and was not — the
	 * border rect was the last thing drawn, so in the documentation a stroke ran
	 * straight through the middle of every pin while the canvas beside it looked
	 * fine.
	 */
	it("draws the node's border under its pins, as the canvas does", () => {
		for (const def of BUILTIN_NODES) {
			if ((def.display ?? "normal") !== "normal") continue;
			const svg = previewSvg(previewOf(def), options);
			const border = svg.indexOf('stroke="var(--node-border');
			const pin = svg.search(/<circle |<path d="M-?[\d.]+ [\d.]+L/);
			if (pin === -1) continue;
			expect(border, `${def.id} draws its border`).toBeGreaterThan(-1);
			expect(border, `${def.id} draws the border before its pins`).toBeLessThan(pin);
		}
	});

	it("gives a capsule getter the capsule's width", () => {
		const def = BUILTIN_NODES.find((d) => d.display === "compact");
		expect(def, "the library still has a capsule getter").toBeDefined();
		const size = previewSize(previewOf(def!), NODE);
		expect(size.height).toBe(NODE.compactHeight);
		expect(size.width).toBe(nodeBounds(placed(def!), registry).w);
	});

	/**
	 * A pill's result is level with the middle of the pill rather than with a
	 * row, so its anchor cannot be checked by row index like the others.
	 */
	it("meets a pill's pins where the canvas meets them", () => {
		const pills = BUILTIN_NODES.filter((d) => d.display === "operator");
		expect(pills.length, "the library still has operator pills").toBeGreaterThan(0);

		for (const def of pills) {
			const node = placed(def);
			const preview = previewOf(def);
			const entry = { node, preview, x: 0, y: 0, ...previewSize(preview, NODE) };

			for (const [side, pins] of [
				["in", preview.inputs] as const,
				["out", preview.outputs] as const,
			]) {
				for (const pin of pins) {
					expect(placedPinAnchor(entry, pin.id, side, NODE), `${def.id} ${side}:${pin.id}`)
						.toEqual(pinPosition(node, registry, pin.id, side));
				}
			}
		}
	});

	it("draws a knot at the knot's size", () => {
		const def = BUILTIN_NODES.find((d) => d.display === "reroute");
		if (!def) return;
		expect(previewSize(previewOf(def), NODE)).toEqual({
			width: NODE.rerouteSize,
			height: NODE.rerouteSize,
		});
	});

	it("takes the pin lists from the registry, not from the definition", () => {
		// `resolveNodePins` is where variadic arity and struct splitting are
		// applied. A preview built from `def.inputs` would show an Add node with
		// no operands at all.
		const add = registry.get("math.add")!;
		const preview = previewOf(add);
		expect(preview.inputs.length).toBe(add.variadic!.min);
	});
});

describe("preview drawing", () => {
	it("draws every node in the library without throwing", () => {
		for (const def of BUILTIN_NODES) {
			const svg = previewSvg(previewOf(def), options);
			expect(svg.startsWith("<svg "), def.id).toBe(true);
			expect(svg.endsWith("</svg>"), def.id).toBe(true);
		}
	});

	it("colours the header the way the canvas does", () => {
		const print = registry.get("debug.print")!;
		expect(previewSvg(previewOf(print), options)).toContain(nodeColor(print));
	});

	it("escapes anything a node pack could put in a title", () => {
		const hostile: NodeDef = {
			id: "pack.hostile",
			title: `</svg><script>alert("x")</script>`,
			category: "Custom",
			inputs: [{ id: "a", name: "<b>&", kind: "data", type: "string" }],
			outputs: [],
			compilesTo: { kind: "statement", template: "-- nothing" },
		};
		const svg = previewSvg(previewOf(hostile), options);
		expect(svg).not.toContain("<script>");
		// One closing tag, at the end: the title's did not become a second one.
		expect(svg.split("</svg>").length - 1).toBe(1);
		expect(svg).toContain("&amp;");
	});

	it("shows a raw default as a constant rather than an editable field", () => {
		// The security line from 0.3.0, restated as a picture: an ordinary pin
		// with a Luau constant must not be drawn as somewhere to type code.
		const withRaw = BUILTIN_NODES.find((d) =>
			d.inputs.some((p) => p.default?.t === "raw" && !p.code),
		);
		expect(withRaw, "the library still has a raw-defaulted pin").toBeDefined();
		const pin = previewOf(withRaw!).inputs.find((p) => p.value?.shape === "constant");
		expect(pin).toBeDefined();
	});

	it("leaves a pin that must be wired empty", () => {
		const required = BUILTIN_NODES.find((d) =>
			d.inputs.some((p) => p.kind === "data" && p.required === true),
		);
		if (!required) return;
		const preview = previewOf(required);
		for (const pin of preview.inputs) {
			const def = required.inputs.find((p) => p.id === pin.id);
			if (def?.required === true) expect(pin.value, `${required.id}/${pin.id}`).toBeUndefined();
		}
	});

	it("describes itself in words for a screen reader", () => {
		const print = registry.get("debug.print")!;
		expect(describePreview(previewOf(print))).toMatch(/^The Print node with /);
	});
});

describe("previews in the documentation", () => {
	const site = buildSite(registry, builtinIds);

	it("opens every node page with the node", () => {
		const docs = documentRegistry(registry, builtinIds);
		const pages = site.sections.flatMap((s) => s.pages).filter((p) => p.nodeId);
		expect(pages.length).toBe(docs.length);

		for (const page of pages) {
			const first = page.blocks[0];
			expect(first.t, page.slug).toBe("preview");
			if (first.t !== "preview") continue;
			expect(first.nodes.map((n) => n.id)).toEqual([page.nodeId]);
		}
	});

	it("shows the two escape hatches side by side", () => {
		const page = site.sections
			.flatMap((s) => s.pages)
			.find((p) => p.slug === "hand-written-luau")!;
		const block = page.blocks.find((b) => b.t === "preview");
		expect(block?.t === "preview" && block.nodes.map((n) => n.id))
			.toEqual(["code.custom", "value.expression"]);
	});

	it("omits previews rather than inventing sizes when none are configured", () => {
		const page = site.sections.flatMap((s) => s.pages).find((p) => p.nodeId)!;
		const without = renderPage(site, page, { version: "test" });
		expect(without).not.toContain("docs-preview");

		const with_ = renderPage(site, page, { version: "test", preview: options });
		expect(with_).toContain("docs-preview");
		expect(with_).toContain("<svg class=\"node-preview\"");
	});
});

/**
 * Graph previews, held against the canvas the same way.
 *
 * A graph picture has two more chances to drift than a node picture: where each
 * node sits, and where a wire meets it. Both are asserted against the editor's
 * own `nodeBounds` and `pinPosition`, and the curve against `wirePath`, so a
 * change to any of the three fails here rather than quietly redrawing the
 * documentation wrong.
 */
describe("graph preview geometry", () => {
	const graphOptions: PreviewOptions = { ...options, wirePath };

	/** Every curated scene the node pages draw, which is the real exposure. */
	const scenes = Object.entries(CURATED).map(([id, build]) => [id, build()] as const);

	it("has scenes to check", () => {
		expect(scenes.length).toBeGreaterThan(0);
	});

	it("places every node where the canvas would place it", () => {
		for (const [id, script] of scenes) {
			for (const entry of placeGraph(script, registry, graphOptions)) {
				const bounds = nodeBounds(entry.node, registry);
				expect([id, entry.node.def, "x"]).toBeDefined();
				expect(entry.x, `${id}/${entry.node.def} x`).toBe(bounds.x);
				expect(entry.y, `${id}/${entry.node.def} y`).toBe(bounds.y);
				expect(entry.width, `${id}/${entry.node.def} width`).toBe(bounds.w);
				expect(entry.height, `${id}/${entry.node.def} height`).toBe(bounds.h);
			}
		}
	});

	it("meets every wire where the canvas meets it", () => {
		let checked = 0;
		for (const [id, script] of scenes) {
			const placedNodes = placeGraph(script, registry, graphOptions);
			const byId = new Map(placedNodes.map((p) => [p.node.id, p]));

			for (const link of script.links) {
				const from = byId.get(link.from.node);
				const to = byId.get(link.to.node);
				if (!from || !to) continue;

				const a = placedPinAnchor(from, link.from.pin, "out", NODE);
				const b = placedPinAnchor(to, link.to.pin, "in", NODE);
				const canvasA = pinPosition(from.node, registry, link.from.pin, "out");
				const canvasB = pinPosition(to.node, registry, link.to.pin, "in");
				if (!canvasA || !canvasB) continue;

				expect(a, `${id} ${link.from.pin}`).toEqual(canvasA);
				expect(b, `${id} ${link.to.pin}`).toEqual(canvasB);
				checked++;
			}
		}
		// A pass that checked nothing is not a pass.
		expect(checked).toBeGreaterThan(0);
	});

	/**
	 * Nodes must not overlap. Their coordinates were arbitrary while nothing
	 * drew them, and at a 200px step against a 216px node they overlapped —
	 * which looked exactly like a bug in the renderer.
	 */
	it("draws scenes whose nodes do not overlap", () => {
		for (const [id, script] of scenes) {
			const placedNodes = placeGraph(script, registry, graphOptions);
			for (let i = 0; i < placedNodes.length; i++) {
				for (let j = i + 1; j < placedNodes.length; j++) {
					const a = placedNodes[i], b = placedNodes[j];
					const overlaps =
						a.x < b.x + b.width && a.x + a.width > b.x &&
						a.y < b.y + b.height && a.y + a.height > b.y;
					expect(overlaps, `${id}: ${a.node.def} overlaps ${b.node.def}`).toBe(false);
				}
			}
		}
	});

	it("draws no wires at all rather than invented ones", () => {
		// Without `wirePath` the curve would be this file's own opinion, so the
		// nodes are drawn and the lines are left out.
		const scene = scenes.find(([, s]) => s.links.length > 0)!;
		const withoutWires = graphSvg(scene[1], registry, options);
		const withWires = graphSvg(scene[1], registry, graphOptions);
		expect(withoutWires).not.toContain("<path d=\"M ");
		expect(withWires).toContain("<path d=\"M ");
	});

	/**
	 * `graphSvg` adds one surface the node previews do not have: an aria-label
	 * built from the node titles. A pack can title a node anything at all.
	 */
	it("escapes a hostile node title in the label it builds", () => {
		const hostile: NodeDef = {
			id: "pack.evil",
			title: '</text><script>alert(1)</script>',
			category: "Debug",
			inputs: [],
			outputs: [],
			compilesTo: { kind: "expression", template: "nil" },
		} as unknown as NodeDef;

		const withPack = createRegistry([hostile]);
		const script: NodeScript = {
			...emptyScript("Hostile", "hostile"),
			nodes: [{ id: "n0", def: "pack.evil", x: 0, y: 0 }],
		};

		const svg = graphSvg(script, withPack, graphOptions);
		expect(svg).not.toContain("<script>");
		expect(svg).toContain("&lt;");
	});
});
