/**
 * Which script in a place each of the project's files belongs to, and what
 * would change if the files were written in.
 *
 * Pure, as `placeImport.ts` is: the project layer gathers the files and the
 * links, this decides, `writer.ts` writes. A script is found by its UniqueId
 * when the link has one, and otherwise by its path -- the same names, from the
 * service down. Anything that cannot be found for certain is reported, never
 * guessed at: two siblings with one name, or a file whose script is not in the
 * place yet.
 */

import { isScript, pathOf, type RbxDocument, type RbxInstance, stringProp } from "./dom.js";
import type { SourceChange } from "./writer.js";

export interface PlaceTarget {
	/** Names from the service down, the script's own last. */
	path: string[];
	id?: string;
}

export interface PlaceEntry {
	/** Project-relative, for the report. */
	file: string;
	text: string;
	/** The class it must be, when known from a link. */
	className?: string;
	/** Whether it is a module, when known from its file name. */
	isModule?: boolean;
	/** Every instance the file stands for: one, or each copy of a merged script. */
	targets: PlaceTarget[];
}

export interface PlaceUpdate {
	changes: SourceChange[];
	/** Files with at least one script to write. */
	updated: string[];
	/** Files whose scripts already say the same. */
	unchanged: string[];
	/** Files with no script in the place. */
	notInPlace: string[];
	/** Files whose path names more than one script. */
	ambiguous: string[];
	/** Files whose script is a different kind: module code into a Script. */
	wrongClass: string[];
}

/** A `PlaceUpdate` as the editor is told it: counts and file names, no instances. */
export type PlaceReport = Omit<PlaceUpdate, "changes"> & { scripts: number };

const key = (path: readonly string[]) => path.join("\u0001");

export function planPlaceUpdate(doc: RbxDocument, entries: readonly PlaceEntry[]): PlaceUpdate {
	const byId = new Map<string, RbxInstance>();
	const byPath = new Map<string, RbxInstance[]>();
	for (const inst of doc.instances) {
		if (!isScript(inst)) continue;
		const id = inst.props.get("UniqueId")?.value;
		if (typeof id === "string") byId.set(id, inst);
		const k = key(pathOf(inst));
		byPath.set(k, [...(byPath.get(k) ?? []), inst]);
	}

	const out: PlaceUpdate = { changes: [], updated: [], unchanged: [], notInPlace: [], ambiguous: [], wrongClass: [] };
	const claimed = new Set<RbxInstance>();

	for (const entry of entries) {
		const found: RbxInstance[] = [];
		let ambiguous = false;
		for (const target of entry.targets) {
			const byIdentity = target.id ? byId.get(target.id) : undefined;
			if (byIdentity) {
				found.push(byIdentity);
				continue;
			}
			const matches = byPath.get(key(target.path)) ?? [];
			if (matches.length === 1) found.push(matches[0]);
			else if (matches.length > 1) ambiguous = true;
		}
		if (found.length === 0) {
			(ambiguous ? out.ambiguous : out.notInPlace).push(entry.file);
			continue;
		}
		const fits = (inst: RbxInstance) =>
			entry.className
				? inst.className === entry.className
				: entry.isModule === undefined || (entry.isModule === (inst.className === "ModuleScript"));
		if (!found.every(fits)) {
			out.wrongClass.push(entry.file);
			continue;
		}
		let changed = false;
		for (const inst of found) {
			if (claimed.has(inst)) continue;
			claimed.add(inst);
			if ((stringProp(inst, "Source") ?? "") === entry.text) continue;
			out.changes.push({ inst, source: entry.text });
			changed = true;
		}
		(changed ? out.updated : out.unchanged).push(entry.file);
	}
	return out;
}

/**
 * What an export did, in two lines: the title a notice or a CLI heading shows,
 * and the files it could not write, by why. Shared, so the editor and
 * `roswaal export` say the same thing.
 */
export function describePlaceReport(file: string, report: PlaceReport): { title: string; detail: string } {
	const s = (n: number) => (n === 1 ? "" : "s");
	const title = report.scripts === 0
		? `${file} already holds the project's scripts`
		: `Wrote ${report.scripts} script${s(report.scripts)} into ${file}`;
	const list = (files: string[]) => {
		const shown = files.slice(0, 4).map((f) => f.split("/").pop());
		return files.length > 4 ? `${shown.join(", ")} and ${files.length - 4} more` : shown.join(", ");
	};
	const lines: string[] = [];
	if (report.notInPlace.length) lines.push(`Not in the place yet: ${list(report.notInPlace)}.`);
	if (report.ambiguous.length) lines.push(`More than one script with that path: ${list(report.ambiguous)}.`);
	if (report.wrongClass.length) lines.push(`A different kind of script in the place: ${list(report.wrongClass)}.`);
	return { title, detail: lines.length ? lines.join(" ") : "Every script the project has a file for is in it." };
}
