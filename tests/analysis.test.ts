/**
 * Script analysis in two scopes: This Script, the open graph alone, and
 * Project, every graph as last checked and the project's own files.
 *
 * Counted and listed by `analysis.ts`, and drawn by `StatusPanel`; the panel
 * is rendered to markup here to hold the two to the same story.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
	analyseProject,
	countOf,
	graphLabel,
	mergeOutcomes,
	type ProjectInput,
	sinceCheck,
} from "../src/app/analysis.js";
import type { CompileOutcome } from "../src/app/api.js";
import { StatusPanel, type StatusPanelProps } from "../src/app/StatusPanel.js";

const RIG = ".roswaal/scripts/ReplicatedStorage/Tank/Rig.nodescript";
const MAIN = ".roswaal/scripts/ServerScriptService/Source/Main.nodescript";
const CONFIG = ".roswaal/scripts/ReplicatedStorage/Tank/Config.nodescript";

const outcome = (scriptPath: string, more: Partial<CompileOutcome> = {}): CompileOutcome => ({
	scriptPath,
	outputPath: scriptPath.replace(".roswaal/scripts", "src").replace(".nodescript", ".luau"),
	written: true,
	diagnostics: [],
	sourceMap: [],
	code: "",
	...more,
});

const input = (more: Partial<ProjectInput> = {}): ProjectInput => ({
	outcomes: [],
	mapOutcomes: [],
	orphans: [],
	unsynced: [],
	packErrors: [],
	edited: new Set(),
	...more,
});

describe("the Project scope", () => {
	const outcomes = [
		outcome(RIG, {
			diagnostics: [
				{
					severity: "error",
					message: '"Offset" is a Vector3, but "Y" expects a number.',
					node: "n1",
				},
				{
					severity: "warning",
					message: '"Get Bounding Box" is not connected to anything that runs.',
				},
			],
		}),
		outcome(CONFIG),
		outcome(MAIN, {
			written: false,
			skipped: "Main.server.luau has been edited by hand since it was generated.",
		}),
	];

	it("lists each graph with something to say, and the rest as clean", () => {
		const project = analyseProject(input({ outcomes }));
		expect(project.graphs.map((g) => g.name)).toEqual(["Rig", "Main"]);
		expect(project.clean).toEqual(["Config"]);
	});

	it("counts a hand-edited graph's skip as a warning, so Overwrite is in reach", () => {
		const main = analyseProject(input({ outcomes })).graphs.find((g) => g.name === "Main");
		expect(main?.held?.skipped).toMatch(/edited by hand/);
		expect(main?.counts).toEqual({ errors: 0, warnings: 1 });
	});

	it("lists the project's own files first, and counts them with the graphs", () => {
		const project = analyseProject(
			input({
				outcomes,
				orphans: ["src/ReplicatedStorage/Tank/Turret.luau"],
				unsynced: [{ graph: RIG, folder: "src/Loose" }],
				packErrors: ["combat.nodedef.json: expected an array of nodes."],
			}),
		);
		expect(project.files.map((f) => f.label)).toEqual(["stale", "unsynced", "pack"]);
		expect(project.files[0].action).toBe("remove");
		// Rig: 1 error, 1 warning; Main: 1 warning; files: 2 warnings, 1 error.
		expect(project.counts).toEqual({ errors: 2, warnings: 4 });
	});

	it("marks a graph saved since the check", () => {
		const project = analyseProject(input({ outcomes, edited: new Set([RIG]) }));
		expect(project.graphs.find((g) => g.name === "Rig")?.edited).toBe(true);
		expect(project.graphs.find((g) => g.name === "Main")?.edited).toBe(false);
	});
});

describe("keeping the Project scope fresh", () => {
	it("replaces a graph compiled on its own, and keeps the rest", () => {
		const checked = [
			outcome(RIG, { diagnostics: [{ severity: "error", message: "old" }] }),
			outcome(MAIN),
		];
		const merged = mergeOutcomes(checked, [outcome(RIG)]);
		expect(merged.map((o) => o.scriptPath)).toEqual([RIG, MAIN]);
		expect(merged[0].diagnostics).toEqual([]);
	});

	it("adds a graph the check had not seen", () => {
		expect(mergeOutcomes([outcome(RIG)], [outcome(CONFIG)]).map((o) => o.scriptPath)).toEqual([
			RIG,
			CONFIG,
		]);
	});

	it("says how long since the check", () => {
		const at = 1_000_000;
		expect(sinceCheck(at, at + 20_000)).toBe("just now");
		expect(sinceCheck(at, at + 4 * 60_000)).toBe("4 min ago");
		expect(sinceCheck(at, at + 125 * 60_000)).toBe("2 h ago");
	});

	it("names a graph by its file", () => {
		expect(graphLabel(RIG)).toBe("Rig");
		expect(countOf([{ severity: "error" }, { severity: "warning" }, { severity: "info" }])).toEqual(
			{
				errors: 1,
				warnings: 1,
			},
		);
	});
});

describe("the panel", () => {
	const project = analyseProject(
		input({
			outcomes: [outcome(RIG, { diagnostics: [{ severity: "error", message: "Rig is wrong." }] })],
			orphans: ["src/Turret.luau"],
		}),
	);
	const props = (more: Partial<StatusPanelProps> = {}): StatusPanelProps => ({
		open: true,
		onToggle: () => undefined,
		scope: "script",
		onScope: () => undefined,
		busy: null,
		graph: "Main",
		graphPath: MAIN,
		diagnostics: [{ severity: "warning", message: "Main has a loose node." }],
		project,
		checkedAt: Date.now(),
		checking: null,
		onCheck: () => undefined,
		onRemoveOrphans: () => undefined,
		onForce: () => undefined,
		onGoTo: () => undefined,
		...more,
	});
	const render = (more: Partial<StatusPanelProps> = {}) =>
		renderToStaticMarkup(createElement(StatusPanel, props(more)));

	it("carries both scopes' counts in the bar", () => {
		const html = render();
		expect(html).toContain("This Script");
		expect(html).toContain('<span class="badge warning" title="1 warning"');
		expect(html).toContain('<span class="badge error" title="1 error, 1 warning"');
	});

	it("keeps the project's lines out of This Script", () => {
		const html = render();
		expect(html).toContain("Main has a loose node.");
		expect(html).not.toContain("Turret");
		expect(html).not.toContain("Rig is wrong.");
		expect(html).not.toContain("status-check");
	});

	it("lists the project's files and graphs under Project, with Check", () => {
		const html = render({ scope: "project" });
		expect(html).toContain("Project files");
		expect(html).toContain("src/Turret.luau");
		expect(html).toContain("Rig is wrong.");
		expect(html).toContain("status-check");
		expect(html).not.toContain("Main has a loose node.");
	});

	it("folds with its own button, not the whole bar", () => {
		const html = render({ open: false });
		expect(html).toContain('class="tb icon-only status-fold-button" aria-expanded="false"');
		expect(html).not.toContain('class="list"');
		expect(html).not.toMatch(/<div class="bar"[^>]*aria-expanded/);
	});

	it("says the project has not been checked, before it has", () => {
		const html = render({
			scope: "project",
			checkedAt: null,
			project: analyseProject(input()),
		});
		expect(html).toContain("Not checked");
		expect(html).toContain('class="badge unknown"');
	});
});
