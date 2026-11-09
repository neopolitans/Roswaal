/**
 * Class icons: every engine class has one, every icon draws, and the colours
 * the stylesheet declares are the ones a scheme derives.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ICON_BODIES } from "../src/core/classIconData.js";
import {
	classIconMarkup,
	classIconOf,
	NO_CLASS_ICON,
	PURPOSE_ORDER,
	PURPOSES,
	purposeLabel,
	typeIconOf,
} from "../src/core/classIcons.js";
import { LUAU_PRIMITIVES } from "../src/core/luauTypes.js";
import { TYPE_OPTIONS, typeGroup } from "../src/core/roblox.js";
import { ENGINE } from "../src/core/robloxEngine.js";
import { derivedTokens } from "../src/core/theme.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(ROOT, "src", "app", "theme.css"), "utf8").replace(/\r\n/g, "\n");
const SCRIPTS = new Set(["Script", "LocalScript", "ModuleScript"]);

describe("class icons", () => {
	it("gives every engine class but the scripts an icon", () => {
		const missing = Object.keys(ENGINE.classes).filter((c) => !SCRIPTS.has(c) && !classIconOf(c));
		expect(missing).toEqual([]);
	});

	it("leaves the scripts to the project tree's glyph", () => {
		for (const name of SCRIPTS) expect(classIconOf(name)).toBeUndefined();
	});

	it("knows nothing it was not told", () => {
		expect(classIconOf("NotAClass")).toBeUndefined();
		expect(classIconOf("constructor")).toBeUndefined();
		expect(classIconOf("__proto__")).toBeUndefined();
	});

	it("draws the networked events and functions with the server mark, and the local ones without", () => {
		const cut = (name: string) => ICON_BODIES[classIconOf(name)!.body][0][1] ?? "";
		expect(cut("RemoteEvent")).toContain("<circle");
		expect(cut("UnreliableRemoteEvent")).toContain("<circle");
		expect(cut("RemoteFunction")).toContain("<circle");
		expect(cut("BindableEvent")).toBe("");
		expect(cut("BindableFunction")).toBe("");
	});

	it("tells TextButton from GuiButton, and TextBox from GuiObject", () => {
		const body = (name: string) => classIconOf(name)!.body;
		expect(body("TextButton")).not.toBe(body("GuiButton"));
		expect(body("TextBox")).not.toBe(body("GuiObject"));
	});

	it("gives the common datatypes icons", () => {
		for (const name of ["Vector3", "CFrame", "Color3", "UDim2", "RBXScriptSignal"])
			expect(typeIconOf(name), name).toBeDefined();
	});

	it("puts every icon on Material's grid, with nothing fetched", () => {
		for (const style of ICON_BODIES.flat(2)) {
			// Shapes only: a <text> would be drawn in whatever font the reader has.
			expect(style).not.toMatch(/href|url\(|https?:|<script|<image|<text/i);
		}
	});

	it("gives each cut a mask of its own name", () => {
		const markup = classIconMarkup(classIconOf("RemoteEvent")!.body, "x1");
		expect(markup).toContain('<mask id="x1f"');
		expect(markup).toContain('mask="url(#x1f)"');
		expect(markup).toContain('class="ci-f"');
		expect(markup).toContain('class="ci-o"');
		expect(markup).toContain('<mask id="x1o"');
	});

	it("draws an unknown name with the fallback", () => {
		expect(classIconMarkup(NO_CLASS_ICON.body, "n")).toContain("<");
	});

	it("puts every Luau type under Luau, buffer with the rest", () => {
		for (const name of LUAU_PRIMITIVES) expect(typeGroup(name), name).toBe("Luau");
		expect(TYPE_OPTIONS).toContain("buffer");
	});

	it("labels every purpose", () => {
		for (const id of PURPOSE_ORDER) expect(purposeLabel(id)).toBe(PURPOSES[id][0]);
	});
});

describe("purpose colours", () => {
	it("are derived by every scheme", () => {
		for (const dark of [false, true]) {
			const tokens = derivedTokens(dark);
			for (const id of PURPOSE_ORDER)
				expect(tokens[`--purpose-${id}`]).toBe(PURPOSES[id][dark ? 1 : 2]);
		}
	});

	it("are the same in the stylesheet's own light and dark", () => {
		for (const dark of [false, true]) {
			for (const id of PURPOSE_ORDER) {
				const line = `--purpose-${id}: ${PURPOSES[id][dark ? 1 : 2]};`;
				expect(css, line).toContain(dark ? `\t\t${line}` : `\t${line}`);
			}
		}
	});

	it("are each read by the stylesheet", () => {
		for (const id of PURPOSE_ORDER)
			expect(css).toContain(`[data-purpose="${id}"] { color: var(--purpose-${id}); }`);
	});
});
