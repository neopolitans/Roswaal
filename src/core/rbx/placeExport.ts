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

import { scriptClassOf } from "../rojoPaths.js";
import type { NewInstance } from "./adder.js";
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
	/** A linked file the project no longer has: its script is reported, never written. */
	gone?: boolean;
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
	/** Instances to create, parents before children: new scripts and their folders. */
	added: NewInstance[];
	/** Files whose script is to be added. */
	addedFiles: string[];
	/** Why nothing could be added, when the place could not take it. */
	addError?: string;
	/**
	 * Linked files the project has removed or renamed whose scripts the place
	 * still has. Left in: taking a script out of a place is not done for you.
	 */
	leftInPlace?: string[];
}

/** A `PlaceUpdate` as the editor is told it: counts and file names, no instances. */
export type PlaceReport = Omit<PlaceUpdate, "changes" | "added"> & {
	scripts: number;
	/** Folders the additions create. */
	folders?: number;
};

const key = (path: readonly string[]) => path.join("\u0001");

/**
 * `onMatch` hears each script a file was found for, whether or not its source
 * changes: the DataModel browser's answer to which file writes which script.
 */
export function planPlaceUpdate(
	doc: RbxDocument,
	entries: readonly PlaceEntry[],
	onMatch?: (inst: RbxInstance, file: string) => void,
): PlaceUpdate {
	const byId = new Map<string, RbxInstance>();
	const byPath = new Map<string, RbxInstance[]>();
	for (const inst of doc.instances) {
		if (!isScript(inst)) continue;
		const id = inst.props.get("UniqueId")?.value;
		if (typeof id === "string") byId.set(id, inst);
		const k = key(pathOf(inst));
		byPath.set(k, [...(byPath.get(k) ?? []), inst]);
	}

	const out: PlaceUpdate = {
		changes: [],
		updated: [],
		unchanged: [],
		notInPlace: [],
		ambiguous: [],
		wrongClass: [],
		added: [],
		addedFiles: [],
	};
	const claimed = new Set<RbxInstance>();
	/** Files whose script is not in the place, for adding once every match is known. */
	const missing: PlaceEntry[] = [];

	for (const entry of entries) {
		if (entry.gone) {
			const still = entry.targets.some((t) => (t.id && byId.has(t.id)) || byPath.has(key(t.path)));
			if (still) (out.leftInPlace ??= []).push(entry.file);
			continue;
		}
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
			if (ambiguous) out.ambiguous.push(entry.file);
			// One instance can be made; copies of a merged script are not guessed at.
			else if (entry.targets.length === 1) missing.push(entry);
			else out.notInPlace.push(entry.file);
			continue;
		}
		const fits = (inst: RbxInstance) =>
			entry.className
				? inst.className === entry.className
				: entry.isModule === undefined || entry.isModule === (inst.className === "ModuleScript");
		if (!found.every(fits)) {
			out.wrongClass.push(entry.file);
			continue;
		}
		let changed = false;
		for (const inst of found) {
			onMatch?.(inst, entry.file);
			if (claimed.has(inst)) continue;
			claimed.add(inst);
			if ((stringProp(inst, "Source") ?? "") === entry.text) continue;
			out.changes.push({ inst, source: entry.text });
			changed = true;
		}
		(changed ? out.updated : out.unchanged).push(entry.file);
	}
	planAdditions(doc, missing, out);
	return out;
}

/**
 * The class a new script is made as: what its link says, or what its file
 * name says. A file the caller knows is not a module is a Script unless its
 * name says client.
 */
function classFor(entry: PlaceEntry): string {
	if (entry.className) return entry.className;
	if (entry.isModule) return "ModuleScript";
	return scriptClassOf(entry.file) === "LocalScript" ? "LocalScript" : "Script";
}

/**
 * New scripts, under the deepest instance of their path the place already has,
 * with a Folder for each name it is missing -- or, where another new script
 * has exactly that path, that script, which is how a script gets children.
 */
function planAdditions(doc: RbxDocument, missing: PlaceEntry[], out: PlaceUpdate): void {
	const byPath = new Map<string, PlaceEntry>();
	for (const entry of missing) byPath.set(key(entry.targets[0].path), entry);
	const made = new Map<RbxInstance | NewInstance, Map<string, NewInstance>>();
	const done = new Set<PlaceEntry>();

	const make = (parent: RbxInstance | NewInstance, name: string, path: string[]): NewInstance => {
		let under = made.get(parent);
		if (!under) made.set(parent, (under = new Map()));
		const known = under.get(name);
		if (known) return known;
		const entry = byPath.get(key(path));
		const inst: NewInstance = entry
			? { className: classFor(entry), name, source: entry.text, parent }
			: { className: "Folder", name, parent };
		if (entry) {
			done.add(entry);
			out.addedFiles.push(entry.file);
		}
		under.set(name, inst);
		out.added.push(inst);
		return inst;
	};

	for (const entry of [...missing].sort(
		(a, b) => a.targets[0].path.length - b.targets[0].path.length,
	)) {
		if (done.has(entry)) continue;
		const path = entry.targets[0].path;
		const services = doc.roots.filter((r) => r.name === path[0]);
		if (services.length !== 1 || path.length < 2) {
			out.notInPlace.push(entry.file);
			continue;
		}
		let cur: RbxInstance | NewInstance = services[0];
		let blocked: "ambiguous" | "taken" | null = null;
		for (let i = 1; i < path.length; i++) {
			const last = i === path.length - 1;
			const existing: RbxInstance[] =
				"children" in cur ? cur.children.filter((c) => c.name === path[i]) : [];
			if (existing.length > 1) {
				blocked = "ambiguous";
				break;
			}
			if (existing.length === 1) {
				// The script's own name held by something that is not a script
				// the match could find: adding a twin beside it is not an answer.
				if (last) {
					blocked = "taken";
					break;
				}
				cur = existing[0];
				continue;
			}
			cur = make(cur, path[i], path.slice(0, i + 1));
		}
		if (blocked === "ambiguous" || blocked === "taken") out.ambiguous.push(entry.file);
	}
}

/**
 * What an export did, in two lines: the title a notice or a CLI heading shows,
 * and the files it could not write, by why. Shared, so the editor and
 * `roswaal export` say the same thing.
 */
export function describePlaceReport(
	file: string,
	report: PlaceReport,
): { title: string; detail: string } {
	const s = (n: number) => (n === 1 ? "" : "s");
	const adds = report.addedFiles.length;
	const title =
		report.scripts === 0 && adds === 0
			? `${file} already holds the project's scripts`
			: report.scripts === 0
				? `Added ${adds} script${s(adds)} to ${file}`
				: `Wrote ${report.scripts} script${s(report.scripts)} into ${file}${adds ? `, and added ${adds}` : ""}`;
	const list = (files: string[]) => {
		const shown = files.slice(0, 4).map((f) => f.split("/").pop());
		return files.length > 4 ? `${shown.join(", ")} and ${files.length - 4} more` : shown.join(", ");
	};
	const lines: string[] = [];
	if (report.addError) lines.push(`Nothing could be added: ${report.addError}.`);
	if (report.notInPlace.length)
		lines.push(`No service in the place for: ${list(report.notInPlace)}.`);
	if (report.ambiguous.length)
		lines.push(`More than one script with that path: ${list(report.ambiguous)}.`);
	if (report.wrongClass.length)
		lines.push(`A different kind of script in the place: ${list(report.wrongClass)}.`);
	if (report.leftInPlace?.length)
		lines.push(`Still in the place, with no file now: ${list(report.leftInPlace)}.`);
	return {
		title,
		detail: lines.length ? lines.join(" ") : "Every script the project has a file for is in it.",
	};
}
