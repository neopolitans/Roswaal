/**
 * What Script analysis lists, in its two scopes: the open graph, and the
 * project -- every graph as the last project compile or Check saw it, and the
 * project's own files.
 *
 * Pure, so what is counted where is tested without drawing the panel: a
 * problem counted in one scope and listed in the other is the panel telling
 * two stories.
 */

import type { Diagnostic } from "../core/compiler/index.js";
import { unformattedGroups, unformattedMessage } from "../core/unformatted.js";
import type { CompileOutcome, MapOutcome } from "./api.js";

export type AnalysisScope = "script" | "project";

export interface Counts {
	errors: number;
	warnings: number;
}

/** A line about the project rather than one graph: a file, a folder, a pack. */
export interface FileLine {
	key: string;
	severity: "error" | "warning";
	/** The word it starts with: `stale`, `unsynced`, `pack`, `unformatted`, `skipped`. */
	label: string;
	text: string;
	/** Stale files can be removed from the line itself. */
	action?: "remove";
}

/** One graph with something to say. */
export interface GraphGroup {
	path: string;
	name: string;
	problems: Diagnostic[];
	/** The graph's compile, when it wrote nothing: skipped or failed. */
	held?: CompileOutcome;
	/** Saved since the check: what is listed is older than the graph. */
	edited: boolean;
	counts: Counts;
}

export interface ProjectAnalysis {
	files: FileLine[];
	graphs: GraphGroup[];
	/** Graphs checked and found clean, by name. */
	clean: string[];
	counts: Counts;
}

export interface ProjectInput {
	outcomes: readonly CompileOutcome[];
	mapOutcomes: readonly MapOutcome[];
	orphans: readonly string[];
	unsynced: readonly { graph: string; folder: string }[];
	packErrors: readonly string[];
	edited: ReadonlySet<string>;
}

export function countOf(diagnostics: readonly { severity: string }[]): Counts {
	let errors = 0;
	let warnings = 0;
	for (const d of diagnostics) {
		if (d.severity === "error") errors++;
		else if (d.severity === "warning") warnings++;
	}
	return { errors, warnings };
}

export const addCounts = (a: Counts, b: Counts): Counts => ({
	errors: a.errors + b.errors,
	warnings: a.warnings + b.warnings,
});

/** "Rig", from `.roswaal/scripts/ReplicatedStorage/Tank/Rig.nodescript`. */
export function graphLabel(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.nodescript$/, "");
}

/** The project scope: the files first, then each graph with something to say. */
export function analyseProject(input: ProjectInput): ProjectAnalysis {
	const files: FileLine[] = [];
	if (input.orphans.length > 0) {
		const n = input.orphans.length;
		files.push({
			key: "stale",
			severity: "warning",
			label: "stale",
			text: `${n} generated file${n === 1 ? "" : "s"} with no graph behind ${n === 1 ? "it" : "them"}: ${input.orphans.join(", ")}`,
			action: "remove",
		});
	}
	for (const { graph, folder } of input.unsynced) {
		files.push({
			key: `unsynced:${graph}`,
			severity: "warning",
			label: "unsynced",
			text: `${graphLabel(graph)} compiles to ${folder}, which no node map syncs.`,
		});
	}
	input.packErrors.forEach((message, i) => {
		files.push({ key: `pack:${i}`, severity: "error", label: "pack", text: message });
	});
	for (const group of unformattedGroups(input.outcomes)) {
		files.push({
			key: `unformatted:${group.reason}`,
			severity: "warning",
			label: "unformatted",
			text: unformattedMessage(group),
		});
	}
	for (const map of input.mapOutcomes) {
		if (map.skipped) {
			files.push({
				key: `map:${map.mapPath}`,
				severity: "warning",
				label: "skipped",
				text: map.skipped,
			});
		}
		for (const d of map.diagnostics) {
			if (d.severity !== "error" && d.severity !== "warning") continue;
			files.push({
				key: `map:${map.mapPath}:${d.message}`,
				severity: d.severity,
				label: d.severity,
				text: `${graphLabel(map.mapPath).replace(/\.nodemap$/, "")}: ${d.message}`,
			});
		}
	}

	const graphs: GraphGroup[] = [];
	const clean: string[] = [];
	for (const outcome of input.outcomes) {
		const problems = outcome.diagnostics.filter(
			(d) => d.severity === "error" || d.severity === "warning",
		);
		// Skipped without an error of its own -- a hand edit -- is still
		// something to act on, and counted as one.
		const held = outcome.skipped ? outcome : undefined;
		const counts = countOf(problems);
		if (held && counts.errors === 0) counts.warnings++;
		if (problems.length === 0 && !held) {
			clean.push(graphLabel(outcome.scriptPath));
			continue;
		}
		graphs.push({
			path: outcome.scriptPath,
			name: graphLabel(outcome.scriptPath),
			problems,
			...(held ? { held } : {}),
			edited: input.edited.has(outcome.scriptPath),
			counts,
		});
	}

	const counts = graphs.reduce((sum, g) => addCounts(sum, g.counts), countOf(files));
	return { files, graphs, clean, counts };
}

/**
 * The outcomes after one more compile: a graph compiled on its own replaces
 * its entry, so the project scope stays as fresh as the last thing that ran.
 */
export function mergeOutcomes(
	checked: readonly CompileOutcome[],
	fresh: readonly CompileOutcome[],
): CompileOutcome[] {
	const byPath = new Map(fresh.map((o) => [o.scriptPath, o]));
	const merged = checked.map((o) => byPath.get(o.scriptPath) ?? o);
	for (const o of fresh) if (!checked.some((c) => c.scriptPath === o.scriptPath)) merged.push(o);
	return merged;
}

/** "just now", "4 min ago", "2 h ago": how long since the check. */
export function sinceCheck(at: number, now: number): string {
	const minutes = Math.floor((now - at) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	return `${Math.floor(minutes / 60)} h ago`;
}
