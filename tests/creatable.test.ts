/**
 * What Instance.new can make, since 0.154.0.
 *
 * Abstract classes and services are in the class list because everything else
 * that names a class wants them -- `x:IsA("BasePart")` is the commonest check
 * there is -- but `Instance.new("BasePart")` fails when it runs. So Instance.new
 * alone offers the rest, and is an error for a class known not to be made.
 */

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { luauCompletionSource } from "../src/app/luauCompletions.js";
import { compile } from "../src/core/compiler/index.js";
import {
	CREATABLE_CLASS_OPTIONS,
	creatableInstead,
	isCreatable,
	UNCREATABLE,
} from "../src/core/creatable.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { CLASS_OPTIONS } from "../src/core/roblox.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

describe("the classes Instance.new can make", () => {
	it("leave out the abstract ones and the services", () => {
		for (const name of ["Instance", "BasePart", "GuiObject", "Workspace", "Players", "Terrain"])
			expect(isCreatable(name), name).toBe(false);
		for (const name of ["Part", "MeshPart", "Model", "Folder", "Frame", "Sound", "Attachment"])
			expect(isCreatable(name), name).toBe(true);
	});

	/** A class shipped after this build's data is typed in, and works. */
	it("take a name the data does not know", () => {
		expect(isCreatable("SomeClassFromNextMonth")).toBe(true);
	});

	it("are the class list, in its order, less those", () => {
		expect(CREATABLE_CLASS_OPTIONS).toEqual(CLASS_OPTIONS.filter((n) => !UNCREATABLE.has(n)));
		expect(CREATABLE_CLASS_OPTIONS).not.toContain("BasePart");
	});

	it("suggest what derives from one that cannot be made", () => {
		expect(creatableInstead("BasePart")).toContain("Part");
		expect(creatableInstead("BasePart").every(isCreatable)).toBe(true);
	});
});

describe("New Instance", () => {
	function making(className: string) {
		const b = new Builder();
		const start = b.node("script.begin");
		const make = b.node("roblox.instanceNew");
		b.lit(make, "className", { t: "string", v: className });
		const print = b.node("debug.print");
		b.link(start, "then", make, "in");
		b.link(make, "then", print, "in");
		b.link(make, "result", print, "value");
		return compile(b.build(), registry).diagnostics.filter((d) => d.severity === "error");
	}

	it("is an error for a class it cannot make, naming what can be", () => {
		const [error] = making("BasePart");
		expect(error).toMatchObject({ pin: "className" });
		expect(error?.message).toMatch(/cannot make a BasePart/);
		expect(error?.message).toMatch(/Part/);
	});

	it("points a service at Get Service", () => {
		expect(making("Workspace")[0]?.message).toMatch(/Get Service/);
	});

	it("is fine for one it can, and for one it does not know", () => {
		expect(making("Part")).toEqual([]);
		expect(making("SomeClassFromNextMonth")).toEqual([]);
	});
});

describe("completing a class name in Code Block", () => {
	function offered(source: string): string[] {
		const pos = source.indexOf("|");
		const doc = source.replace("|", "");
		const context = new CompletionContext(EditorState.create({ doc }), pos, false);
		const result = luauCompletionSource(() => [])(context);
		return result ? result.options.map((o) => o.label) : [];
	}

	it("offers Instance.new only what it can make", () => {
		const made = offered('local p = Instance.new("|');
		expect(made).toContain("Part");
		expect(made).not.toContain("BasePart");
		expect(made).not.toContain("Workspace");
	});

	it("offers IsA every class, the abstract ones above all", () => {
		expect(offered('if x:IsA("|')).toContain("BasePart");
	});
});
