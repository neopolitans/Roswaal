/**
 * One shell for every modal window: the Dialog's head, its fields as Settings
 * rows, the shared look in theme.css, and the docs' drawings of them.
 */

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog, type DialogRequest } from "../src/app/Dialog.jsx";
import { ICONS, VIEW_BOX } from "../src/app/icons.jsx";
import { logoMarkup } from "../src/app/logo.js";
import { EXPORT_PANEL, type ToolbarArt, toolbarHtml } from "../src/core/docs/toolbars.js";

const render = (request: DialogRequest) =>
	renderToStaticMarkup(createElement(Dialog, { request, resolve: () => {} }));

describe("the Dialog", () => {
	it("says where or what under its title, and leaves an empty message out", () => {
		const html = render({
			kind: "confirm",
			title: "Delete Remotes?",
			subtitle: "Roswaal cannot undo this.",
			message: "",
			items: [".roswaal/scripts/ReplicatedStorage/Tank/Remotes.nodescript"],
			danger: true,
		});
		expect(html).toContain('<span class="dialog-sub">Roswaal cannot undo this.</span>');
		expect(html).not.toContain("<p></p>");
		// The name in front, where it is behind.
		expect(html).toContain('<span class="dialog-item-name">Remotes.nodescript</span>');
		expect(html).toContain(
			'<span class="dialog-item-dir">.roswaal/scripts/ReplicatedStorage/Tank</span>',
		);
	});

	it("draws a form's fields as Settings rows: few choices segmented, more as rows, checks as switches", () => {
		const html = render({
			kind: "form",
			title: "New graph",
			message: "",
			fields: [
				{ id: "name", kind: "text", label: "Name", value: "Untitled" },
				{
					id: "class",
					kind: "choice",
					label: "Starts as",
					value: "ModuleScript",
					options: [
						{ value: "ModuleScript", label: "ModuleScript", script: "module" },
						{ value: "Script", label: "Script", script: "server" },
					],
				},
				{
					id: "many",
					kind: "choice",
					label: "Many",
					value: "a",
					options: ["a", "b", "c", "d"].map((v) => ({ value: v, label: v })),
				},
				{ id: "keep", kind: "check", label: "Keep", value: true, help: "Kept for next time." },
			],
		});
		expect(html).toContain('class="settings-box dialog-fields"');
		expect(html).toContain('<span class="segmented" role="radiogroup" aria-label="Starts as">');
		expect(html).toContain("script-icon");
		expect(html).toContain('class="setting dialog-choices"');
		expect(html).toContain('class="settings-toggle"');
		expect(html).toContain("Kept for next time.");
	});

	it("draws a check that is not on offer as a disabled switch, and says why", () => {
		const html = render({
			kind: "form",
			title: "Import",
			message: "Import it.",
			fields: [
				{
					id: "scope",
					kind: "select",
					label: "Scope",
					value: "file",
					options: [{ value: "file", label: "File" }],
				},
				{
					id: "edit",
					kind: "check",
					label: "Edit",
					value: true,
					when: { id: "scope", value: "whole" },
				},
			],
		});
		expect(html).toContain('class="settings-toggle is-disabled"');
		expect(html).toContain("Not offered with what is chosen above.");
	});
});

describe("the modal shell", () => {
	const css = readFileSync("src/app/theme.css", "utf8");

	it("gives every modal window one corner, border, shadow and entrance", () => {
		const rule = /\.dialog,\s*\.docs,\s*\.settings-sheet,[^{]*\{[^}]*\}/.exec(css)?.[0] ?? "";
		for (const cls of [
			".code-modal",
			".value-picker",
			".docs-palette",
			".pack-import",
			".attr-dialog",
			".intro-panel",
		])
			expect(rule, cls).toContain(cls);
		expect(rule).toContain("border-radius: var(--modal-radius)");
		expect(rule).toContain("animation: modal-in");
		expect(css).toContain("--modal-radius: 14px;");
	});

	it("puts every modal's backdrop on one scrim with a blur, and keeps Export's popover clear", () => {
		const rule =
			/\.dialog-backdrop:not\(\.export-menu-backdrop\),[^{]*\{[^}]*\}/.exec(css)?.[0] ?? "";
		for (const cls of [
			".docs-backdrop",
			".picker-backdrop",
			".docs-palette-backdrop",
			".intro-backdrop",
		])
			expect(rule, cls).toContain(cls);
		expect(rule).toContain("backdrop-filter: blur(var(--modal-blur))");
	});

	it("draws switches and segmented controls the Settings way in every modal", () => {
		expect(css).toContain(":is(.settings-sheet, .dialog, .modal-shell) .settings-toggle input {");
		expect(css).toContain(":is(.settings-sheet, .dialog, .modal-shell) .segmented button.on {");
	});

	it("stops moving for a reader who asks for less motion", () => {
		expect(css).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{\s*\.dialog,[^{]*\{\s*animation: none;/,
		);
	});
});

describe("the docs' Export panel", () => {
	const art: ToolbarArt = {
		viewBox: VIEW_BOX,
		paths: ICONS,
		mark: logoMarkup(15),
		version: "test",
	};
	const html = toolbarHtml(EXPORT_PANEL, art);

	it("is drawn as the editor draws it: the shared head, a switch, the keys", () => {
		expect(html).toContain(
			'<span class="dialog-sub">34 files and place.rbxl · the project is not changed</span>',
		);
		expect(html).toContain('class="settings-toggle"');
		expect(html).toContain("<kbd>Enter</kbd> exports");
		expect(html).toContain("Settings › Compiling › Exporting");
		expect(html).not.toContain("→");
	});
});
