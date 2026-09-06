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
	previewOf, previewRowY, previewSize, previewSvg, describe as describePreview,
	type PreviewOptions,
} from "../src/core/docs/preview.js";
import { buildSite } from "../src/core/docs/site.js";
import { documentRegistry } from "../src/core/docs/nodeReference.js";
import { renderPage } from "../src/core/docs/html.js";
import { nodeBounds, pinPosition } from "../src/app/geometry.js";
import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import type { GraphNode, NodeDef } from "../src/core/schema.js";

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

	it("puts every pin row where a wire would attach to it", () => {
		for (const def of BUILTIN_NODES) {
			// A capsule and a knot put their pins somewhere other than a row, and
			// are covered by their own cases below.
			if (def.display === "compact" || def.display === "reroute") continue;

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

	it("gives a capsule getter the capsule's width", () => {
		const def = BUILTIN_NODES.find((d) => d.display === "compact");
		expect(def, "the library still has a capsule getter").toBeDefined();
		const size = previewSize(previewOf(def!), NODE);
		expect(size.height).toBe(NODE.compactHeight);
		expect(size.width).toBe(nodeBounds(placed(def!), registry).w);
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
