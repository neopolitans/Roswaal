/**
 * The Code panel, since 0.155.0: Luau fields open as tabs in a panel of the
 * workspace -- along the foot of the graph by default -- rather than in a
 * dialog that shut the rest of the editor away.
 *
 * The editor itself is CodeMirror and is exercised in a browser. What is held
 * here is what can be said without one: where the panel goes and how full
 * view rearranges it, what a tab reads and is called, and what a row dragged
 * from the Variables panel writes into code.
 */

import { describe, expect, it } from "vitest";

import {
	CODE_MARKS,
	type CodeTab,
	codeTabKey,
	codeTabLabel,
	codeTabLabels,
	codeValue,
} from "../src/app/CodePanel.jsx";
import { droppedName } from "../src/app/nameDrop.js";
import {
	cardsIn,
	DEFAULT_LAYOUT,
	dropCard,
	fullFootLayout,
	isFoot,
	readLayout,
	reopenPanel,
} from "../src/app/panels.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

describe("where the Code panel goes", () => {
	it("is shut until a field is opened, and opens along the foot", () => {
		expect(DEFAULT_LAYOUT.panels.code).toMatchObject({ dock: "bottom", open: false });
		const opened = reopenPanel(DEFAULT_LAYOUT, "code");
		expect(isFoot(opened, "code")).toBe(true);
		// Script analysis stays the status pill, not the foot.
		expect(isFoot(opened, "analysis")).toBe(false);
	});

	it("is not the foot once moved to a side, or floated", () => {
		const opened = reopenPanel(DEFAULT_LAYOUT, "code");
		const right = dropCard(opened, "code", { kind: "dock", side: "right" });
		expect(isFoot(right, "code")).toBe(false);
		expect(cardsIn(right, "right", () => true).some((card) => card.tabs.includes("code"))).toBe(
			true,
		);
		const floated = dropCard(opened, "code", { kind: "float", frame: opened.panels.code.frame });
		expect(isFoot(floated, "code")).toBe(false);
	});

	/** Full view is drawn, not stored: the panel goes back where it was. */
	it("is drawn along the foot in full view, from wherever it is", () => {
		const opened = reopenPanel(DEFAULT_LAYOUT, "code");
		const tabbed = dropCard(opened, "code", { kind: "tab", host: "inspector" });
		expect(tabbed.panels.code.tabOf).toBe("inspector");
		const full = fullFootLayout(tabbed);
		expect(isFoot(full, "code")).toBe(true);
		// The Inspector stays on the right, without it.
		expect(full.panels.inspector.dock).toBe("right");
		expect(full.panels.code.tabOf).toBeUndefined();
		// And the stored layout is untouched.
		expect(tabbed.panels.code.tabOf).toBe("inspector");
	});

	it("reads an older layout's untouched foot height as no choice made", () => {
		const stored = { docks: { bottom: { size: 190, open: true } } };
		expect(readLayout(stored).docks.bottom.size).toBe(DEFAULT_LAYOUT.docks.bottom.size);
		expect(readLayout({ docks: { bottom: { size: 420, open: true } } }).docks.bottom.size).toBe(
			420,
		);
	});

	it("comes back shut from a layout written before it existed", () => {
		const older = { panels: { tree: { dock: "left", open: true, order: 0 } } };
		expect(readLayout(older).panels.code.open).toBe(false);
	});
});

describe("a tab", () => {
	function graph() {
		const b = new Builder("Main");
		const custom = b.node("code.custom", { label: "Greet player" });
		b.lit(custom, "code", { t: "raw", v: "print(1)" });
		const expression = b.node("value.expression");
		const type = b.node("type.declareTop", {
			config: { name: "Tuning", definition: "{ speed: number }" },
		});
		return { script: b.build(), custom, expression, type };
	}

	it("is one per field, however often the field is opened", () => {
		expect(codeTabKey("n1", "code")).toBe(codeTabKey("n1", "code"));
		expect(codeTabKey("n1", undefined, "definition")).not.toBe(codeTabKey("n1", "code"));
	});

	it("reads the field as the graph holds it now", () => {
		const { script, custom, expression, type } = graph();
		const tab = (nodeId: string, pin?: string, field?: "definition"): CodeTab => ({
			key: codeTabKey(nodeId, pin, field),
			nodeId,
			...(pin ? { pin } : {}),
			...(field ? { field } : {}),
		});
		expect(codeValue(script, registry, tab(custom, "code"))).toBe("print(1)");
		// A pin never typed into reads as its default.
		expect(codeValue(script, registry, tab(expression, "code"))).toBe("0");
		expect(codeValue(script, registry, tab(type, undefined, "definition"))).toBe(
			"{ speed: number }",
		);
		// A node that has gone takes its tab with it.
		expect(codeValue(script, registry, tab("gone", "code"))).toBeUndefined();
	});

	it("is called by its kind, its node's label if it has one, and its graph", () => {
		const { script, custom, expression, type } = graph();
		expect(codeTabLabel(script, registry, { key: "k", nodeId: custom, pin: "code" })).toEqual({
			kind: "block",
			title: "Greet player",
			label: "Greet player",
			where: "Main",
		});
		// No label: the kind says what its title would.
		expect(codeTabLabel(script, registry, { key: "k", nodeId: expression, pin: "code" })).toEqual({
			kind: "expression",
			title: "Luau Expression",
			where: "Main",
		});
		expect(
			codeTabLabel(script, registry, { key: "k", nodeId: type, field: "definition" }),
		).toMatchObject({ kind: "type", title: "type Tuning", label: "Tuning" });
	});

	it("marks each kind of code apart", () => {
		expect(CODE_MARKS.block?.mark).toBe("{ }");
		expect(CODE_MARKS.expression?.mark).toBe("ƒx");
		expect(CODE_MARKS.type?.mark).toBe("<T>");
		expect(new Set(Object.values(CODE_MARKS).map((m) => m.mark)).size).toBe(3);
	});
});

describe("what the tabs read", () => {
	it("is the mark and the graph for a node with no label, a first line telling two apart", () => {
		const b = new Builder("Main");
		const one = b.node("code.custom");
		b.lit(one, "code", { t: "raw", v: "\n  print(1)\n" });
		const two = b.node("code.custom");
		b.lit(two, "code", { t: "raw", v: "newPart.Material = Enum.Material.Neon" });
		const labelled = b.node("code.custom", { label: "Greet player" });
		const value = b.node("value.expression");
		const tabs: CodeTab[] = [one, two, labelled, value].map((nodeId) => ({
			key: codeTabKey(nodeId, "code"),
			nodeId,
			pin: "code",
		}));
		const labels = codeTabLabels(b.build(), registry, tabs);
		expect(labels.get(tabs[0]!.key)).toMatchObject({
			kind: "block",
			name: "Main",
			detail: "print(1)",
		});
		expect(labels.get(tabs[1]!.key)?.detail).toBe("newPart.Material = Enum.Mat…");
		// A label is the name, with the graph beside it.
		expect(labels.get(tabs[2]!.key)).toMatchObject({ name: "Greet player", detail: "Main" });
		// An expression alone in its graph is its mark and the graph, nothing more.
		expect(labels.get(tabs[3]!.key)).toEqual({
			kind: "expression",
			name: "Main",
			full: "Luau Expression · Main",
		});
	});
});

describe("a name dragged in from the Variables panel", () => {
	const b = new Builder("Main");
	b.variable("playersJoined", "number", { t: "number", v: 0 });
	const declare = b.node("local.declare");
	b.lit(declare, "name", { t: "string", v: "door" });
	const fn = b.node("function.entry", { config: { name: "greet", params: [], returns: [] } });
	const script = b.build({
		modules: [{ id: "m1", name: "Greeter", specifier: "ReplicatedStorage.Shared.Greeter" }],
	});

	it("writes what the generated file calls it", () => {
		const name = (kind: Parameters<typeof droppedName>[2], payload: unknown) =>
			droppedName(script, registry, kind, payload);
		expect(name("application/x-roswaal-variable", { id: "v_playersJoined" })).toBe("playersJoined");
		expect(name("application/x-roswaal-service", { service: "Players" })).toBe("Players");
		expect(name("application/x-roswaal-module", { id: "m1" })).toBe("Greeter");
		expect(name("application/x-roswaal-local", { id: declare })).toBe("door");
		expect(name("application/x-roswaal-function", { id: fn })).toBe("greet");
		expect(name("application/x-roswaal-type", { type: "Tuning" })).toBe("Tuning");
	});

	it("writes nothing for something that has gone", () => {
		expect(
			droppedName(script, registry, "application/x-roswaal-variable", { id: "gone" }),
		).toBeUndefined();
		expect(
			droppedName(script, registry, "application/x-roswaal-local", "not json"),
		).toBeUndefined();
	});
});
