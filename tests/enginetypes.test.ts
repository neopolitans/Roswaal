/**
 * The Engine Types category.
 *
 * Two kinds of thing are worth asserting here, and they fail differently.
 *
 * The **structural** ones catch a datatype node added later without a
 * subcategory, or with a subcategory nobody put in the display order — neither
 * of which errors anywhere. The node simply falls to the bottom of the menu
 * under a heading that sorts alphabetically, which looks like a decision.
 *
 * The **id stability** ones are the promise this reorganisation made: a graph
 * stores node ids, so folding Vectors, CFrames and two Engine entries into one
 * category was allowed to change how nodes are *found* and not what they are
 * called. Rename one and every project that already used it breaks on open,
 * with a diagnostic naming a node type nobody removed on purpose.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry, subcategories } from "../src/core/nodes/index.js";
import { ENGINE_TYPES } from "../src/core/schema.js";
import { nodeColor } from "../src/app/palette.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const engineTypes = [...registry.values()].filter((def) => def.category === ENGINE_TYPES);

describe("the category", () => {
	it("puts every datatype node in a subcategory", () => {
		for (const def of engineTypes) {
			expect(def.subcategory, `${def.id} is in ${ENGINE_TYPES} with no subcategory`)
				.toBeTruthy();
		}
	});

	/**
	 * An unlisted subcategory is not an error — it sorts alphabetically after
	 * the known ones — which is exactly why it needs a test. A new datatype
	 * quietly appearing at the bottom of the menu reads as where somebody meant
	 * to put it.
	 */
	it("lists every subcategory in the display order", () => {
		const known = subcategories(registry, ENGINE_TYPES);
		const used = new Set(engineTypes.map((def) => def.subcategory!));
		expect([...used].sort()).toEqual([...known].sort());
		expect(known[0], "vectors come first; almost everything positional starts there")
			.toBe("Vector3");
	});

	/**
	 * Grouping the datatypes together must not make them *look* like one thing.
	 * Vector3 and CFrame keep the colours they had as separate categories, and
	 * a new datatype with no colour of its own would silently share the
	 * category fallback with whatever was added beside it.
	 */
	it("gives every datatype a colour of its own", () => {
		const colours = new Map<string, string>();
		for (const sub of subcategories(registry, ENGINE_TYPES)) {
			const def = engineTypes.find((d) => d.subcategory === sub)!;
			const colour = nodeColor(def);
			expect(colours.has(colour), `${sub} shares a colour with ${colours.get(colour)}`)
				.toBe(false);
			colours.set(colour, sub);
		}
	});
});

/**
 * ## The ids that were already in graphs
 *
 * Listed literally rather than derived, because a test that reads the registry
 * to check the registry would pass after a rename.
 */
describe("node ids that predate the reorganisation", () => {
	const KEPT = [
		// Were in the Engine category, titled plain "Vector3" and "Color3".
		"roblox.vector3", "roblox.color3",
		// Were in Vectors.
		"vector3.zero", "vector3.one", "vector3.axis", "vector3.add", "vector3.sub",
		"vector3.scale", "vector3.dot", "vector3.cross", "vector3.magnitude",
		"vector3.unit", "vector3.lerp", "vector3.distance", "vector2.new",
		// Were in CFrames.
		"cframe.identity", "cframe.new", "cframe.lookAt", "cframe.angles",
		"cframe.fromAxisAngle", "cframe.mul", "cframe.translate", "cframe.inverse",
		"cframe.lerp", "cframe.toWorldSpace", "cframe.toObjectSpace",
		"cframe.pointToWorldSpace", "cframe.pointToObjectSpace",
		"cframe.vectorToWorldSpace", "cframe.position", "cframe.rotation",
		"cframe.lookVector", "cframe.rightVector", "cframe.upVector",
	];

	it("all still resolve", () => {
		for (const id of KEPT) {
			expect(registry.get(id), `${id} was renamed; every graph using it breaks`)
				.toBeDefined();
		}
	});

	it("still emit what they always did", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		const add = b.node("vector3.add");
		b.link(start, "then", print, "in").link(add, "result", print, "value");

		expect(body(compile(b.build(), registry).code)).toContain(
			"print(Vector3.zero + Vector3.zero)",
		);
	});
});

describe("what the new datatypes compile to", () => {
	/** One value into `print`, which is the shortest way to see an expression. */
	function emitted(defId: string, literals: Record<string, { t: "string"; v: string } | { t: "number"; v: number }> = {}): string {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		const node = b.node(defId);
		for (const [pin, value] of Object.entries(literals)) b.lit(node, pin, value);
		b.link(start, "then", print, "in").link(node, "result", print, "value");
		return body(compile(b.build(), registry).code);
	}

	it("builds a colour from every input form", () => {
		expect(emitted("roblox.color3")).toContain("Color3.fromRGB(255, 255, 255)");
		expect(emitted("color3.new")).toContain("Color3.new(1, 1, 1)");
		expect(emitted("color3.fromHSV")).toContain("Color3.fromHSV(0, 1, 1)");
		expect(emitted("color3.fromHex")).toContain('Color3.fromHex("#ffffff")');
	});

	it("rounds when it converts to 0-255 and does not when it does not", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		const rgb = b.node("color3.toRGB");
		b.link(start, "then", print, "in").link(rgb, "r", print, "value");
		expect(body(compile(b.build(), registry).code)).toContain("math.round(");

		const c = new Builder();
		const start2 = c.node("script.begin");
		const print2 = c.node("debug.print");
		const float = c.node("color3.toRGBFloat");
		c.link(start2, "then", print2, "in").link(float, "r", print2, "value");
		expect(body(compile(c.build(), registry).code)).not.toContain("math.round(");
	});

	it("writes the easing enums as enums rather than strings", () => {
		const luau = emitted("tweeninfo.new");
		expect(luau).toContain("Enum.EasingStyle.Quad");
		expect(luau).toContain("Enum.EasingDirection.Out");
		expect(luau, "the style is a name in the source, never a quoted string")
			.not.toContain('"Quad"');
	});

	/**
	 * The whole point of the Tween work: build one, start it, and be able to
	 * wait for it. If any link in that chain does not compile, the feature is
	 * decorative.
	 */
	it("creates, plays and waits on a tween", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const target = b.node("value.expression");
		b.lit(target, "code", { t: "raw", v: "workspace.Part" });
		const goal = b.node("tween.property");
		b.lit(goal, "name", { t: "string", v: "Transparency" });
		b.lit(goal, "value", { t: "number", v: 1 });
		const info = b.node("tweeninfo.new");
		const create = b.node("tween.create");
		const play = b.node("tween.play");
		const signal = b.node("tween.completed");
		const wait = b.node("event.wait");

		b.link(start, "then", create, "in");
		b.link(target, "result", create, "instance");
		b.link(info, "result", create, "info");
		b.link(goal, "result", create, "properties");
		b.link(create, "then", play, "in");
		b.link(create, "result", play, "tween");
		b.link(create, "result", signal, "tween");
		b.link(play, "then", wait, "in");
		b.link(signal, "result", wait, "signal");

		const result = compile(b.build(), registry);
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

		const luau = body(result.code);
		expect(luau).toContain('game:GetService("TweenService"):Create(');
		expect(luau).toContain('["Transparency"] = 1');
		expect(luau).toContain(":Play()");
		expect(luau).toMatch(/\.Completed:Wait\(\)/);
	});

	/**
	 * A pure node is one expression per output, so a component that comes out of
	 * a multiple-return call is written once per output wired. That is a real
	 * cost and the node says so; this pins it down so nobody "fixes" it into an
	 * execution step without meaning to.
	 */
	it("calls ToHSV once per component actually wired", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const hsv = b.node("color3.toHSV");
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(start, "then", first, "in").link(first, "then", second, "in");
		b.link(hsv, "h", first, "value").link(hsv, "s", second, "value");

		const luau = body(compile(b.build(), registry).code);
		expect(luau.match(/ToHSV\(\)/g)).toHaveLength(2);
		expect(luau).toContain("select(1,");
		expect(luau).toContain("select(2,");
	});
});
