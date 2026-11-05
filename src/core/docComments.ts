/**
 * Doc comments: a comment box that writes Moonwave documentation for the one
 * declaration it holds.
 *
 * A doc comment is an ordinary `Comment` with a `doc` record. Its `text` is the
 * description; `doc` holds the tags. What it documents is read off the canvas
 * the way every comment's contents are -- geometrically, by `commentHolds` --
 * and never stored, so a function dragged out of the box is simply no longer
 * documented by it.
 *
 * ## What the graph says, and what the comment says
 *
 * Moonwave refuses some comments outright, and the node is built so it can
 * never write one of them:
 *
 * - **Parameters and returns come from the function.** An undocumented
 *   parameter, or a `@param` naming no parameter, is an error to Moonwave, and
 *   one `@return` discards every return it would have found. So the comment
 *   stores only what each one is *for*, keyed by name or by position, and the
 *   names, types and count are the function's own when it is written. Rename a
 *   parameter and its words go with the old name; the row asks again.
 * - **`@within` is always written** for anything but a class, since Moonwave
 *   requires it there. It is the comment's own, or the module's name.
 * - **A box documents one declaration.** Around nothing, or around two, it is
 *   reported rather than guessed at.
 *
 * The text form (`docText`, `readDocText`) is the same record written out and
 * read back, so a developer can type the comment as Moonwave and have it read
 * into the fields, and switch between the two without losing anything.
 */

import { commentHolds } from "./comments.js";
import { luauType } from "./compiler/emitDeclarations.js";
import { viewOf } from "./functionGraph.js";
import { signatureOf, typeDeclarationOf } from "./nodes/flow.js";
import type { Registry } from "./nodes/index.js";
import type { Comment, DocTags, DocRealm, GraphNode, NodeScript } from "./schema.js";

export type { DocRealm, DocTags } from "./schema.js";

/** The realms, in the order Moonwave lists them and the switch draws them. */
export const DOC_REALMS: readonly DocRealm[] = ["server", "client", "plugin"];

/** Whether a comment is a doc comment. */
export function isDocComment(comment: Comment): boolean {
	return comment.doc !== undefined;
}

/** What a doc comment documents, read from what its box holds. */
export type DocSubject =
	| {
			kind: "function";
			node: GraphNode;
			name: string;
			/** A method's receiver is not among them: Moonwave does not list it. */
			params: { name: string; type?: string }[];
			returns: { name: string; type?: string }[];
	  }
	| { kind: "class"; node: GraphNode; name: string }
	| {
			kind: "interface";
			node: GraphNode;
			name: string;
			fields: { name: string; type: string }[];
	  }
	| { kind: "type"; node: GraphNode; name: string; definition: string }
	| { kind: "none" }
	| { kind: "several"; count: number };

/** Node definitions a doc comment can document. */
const DOCUMENTED = new Set([
	"function.declareHere",
	"module.exports",
	"type.declareTop",
	"type.declareHere",
]);

/**
 * The declaration a doc comment's box holds, if it holds exactly one.
 *
 * Only declarations count: a Declare Function's body drawn inside the box too
 * is still one function. `moduleName` names the class a Module Exports
 * declares, the file's own name.
 */
export function docSubject(
	script: NodeScript,
	registry: Registry,
	comment: Comment,
	moduleName = script.name,
): DocSubject {
	const view = viewOf(script, comment.graph ?? null);
	const holds = commentHolds(view, registry, comment);
	const found = view.nodes.filter((node) => holds.has(node.id) && DOCUMENTED.has(node.def));
	if (found.length === 0) return { kind: "none" };
	if (found.length > 1) return { kind: "several", count: found.length };
	const node = found[0];
	if (node.def === "function.declareHere") {
		const sig = signatureOf(node.config);
		return {
			kind: "function",
			node,
			name: sig.name || node.label || "",
			params: sig.params ?? [],
			returns: sig.returns ?? [],
		};
	}
	if (node.def === "module.exports") return { kind: "class", node, name: moduleName };
	const declaration = typeDeclarationOf(node.def, node.config);
	if (declaration.shape === "fields" && declaration.fields.length > 0) {
		return { kind: "interface", node, name: declaration.name, fields: declaration.fields };
	}
	return { kind: "type", node, name: declaration.name, definition: declaration.definition };
}

/** The class a member belongs to: the comment's own, or the module's name. */
export function docWithin(doc: DocTags, moduleName: string): string {
	return doc.within?.trim() || moduleName;
}

const tag = (name: string, ...parts: (string | undefined)[]) =>
	[`@${name}`, ...parts.filter((p): p is string => p !== undefined && p !== "")].join(" ");
const said = (text: string | undefined) => (text?.trim() ? `-- ${text.trim()}` : undefined);

/**
 * The comment as Moonwave text, without its delimiters: the description, a
 * blank line, then the tags.
 *
 * Parameters are written only once one of them has words, and then all of
 * them -- the rule Moonwave holds a comment to. Returns the same. A subject the
 * box cannot name (nothing, or several) writes the description and the tags
 * that need no subject.
 */
export function docText(comment: Comment, subject: DocSubject, moduleName: string): string {
	const doc = comment.doc ?? {};
	const tags: string[] = [];
	if (subject.kind === "class") tags.push(tag("class", subject.name));
	if (subject.kind === "interface") tags.push(tag("interface", subject.name));
	if (subject.kind === "type") tags.push(tag("type", subject.name, subject.definition || undefined));
	if (subject.kind !== "class") tags.push(tag("within", docWithin(doc, moduleName)));
	if (subject.kind === "interface") {
		for (const field of subject.fields) {
			tags.push([`.${field.name}`, field.type, said(doc.fields?.[field.name])].filter(Boolean).join(" "));
		}
	}
	if (subject.kind === "function") {
		const params = doc.params ?? {};
		// Each type as the function's own annotation is written, so the two
		// agree: Roswaal's ClassName is Luau's string.
		if (subject.params.some((p) => params[p.name]?.trim())) {
			for (const p of subject.params) {
				tags.push(tag("param", p.name || "arg", p.type ? luauType(p.type) : undefined, said(params[p.name])));
			}
		}
		const returns = doc.returns ?? [];
		if (subject.returns.some((_, i) => returns[i]?.trim())) {
			subject.returns.forEach((r, i) => tags.push(tag("return", luauType(r.type), said(returns[i]))));
		}
		for (const error of doc.errors ?? []) {
			if (error.type.trim()) tags.push(tag("error", error.type.trim(), said(error.description)));
		}
		if (doc.yields) tags.push(tag("yields"));
	}
	if (doc.since?.trim()) tags.push(tag("since", doc.since.trim()));
	if (doc.deprecated?.version.trim()) {
		tags.push(tag("deprecated", doc.deprecated.version.trim(), said(doc.deprecated.reason)));
	}
	if (doc.unreleased) tags.push(tag("unreleased"));
	for (const realm of DOC_REALMS) if (doc.realms?.includes(realm)) tags.push(tag(realm));
	if (doc.private) tags.push(tag("private"));
	if (doc.ignore) tags.push(tag("ignore"));
	for (const name of doc.tags ?? []) if (name.trim()) tags.push(tag("tag", name.trim()));

	const description = comment.text.replace(/\r\n?/g, "\n").trim();
	if (description === "") return tags.join("\n");
	return tags.length ? [description, "", ...tags].join("\n") : description;
}

/** Words after a `--`, trimmed; undefined when there are none. */
function afterDashes(rest: string): { head: string; words?: string } {
	const at = rest.indexOf("--");
	if (at < 0) return { head: rest.trim() };
	const words = rest.slice(at + 2).trim();
	return { head: rest.slice(0, at).trim(), ...(words ? { words } : {}) };
}

/**
 * Moonwave text read into a description and the record the fields edit: what
 * a developer types in the text form, or pastes from a file.
 *
 * Its delimiters may be included and are dropped. What the graph decides --
 * `@class`, `@interface`, `@type`, a parameter's type -- is read past rather
 * than kept, since it is written from the graph each time. A parameter's words
 * are kept by name, a return's and a field's by position and name.
 */
export function readDocText(text: string): { description: string; doc: DocTags } {
	const lines = text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.filter((line) => !/^\s*--\[=*\[\s*$/.test(line) && !/^\s*\]=*\]\s*$/.test(line))
		.map((line) => line.replace(/^\s*---?\s?/, "").trim());
	const doc: DocTags = {};
	const description: string[] = [];
	const params: Record<string, string> = {};
	const fields: Record<string, string> = {};
	const returns: string[] = [];
	for (const line of lines) {
		const field = /^\.([A-Za-z_][\w]*)\s*(.*)$/.exec(line);
		if (field) {
			const { words } = afterDashes(field[2]);
			if (words) fields[field[1]] = words;
			continue;
		}
		const m = /^@([A-Za-z_]+)\s*(.*)$/.exec(line);
		if (!m) {
			description.push(line);
			continue;
		}
		const [, name, rest] = m;
		const { head, words } = afterDashes(rest);
		switch (name) {
			case "param": {
				const param = head.split(/\s+/)[0];
				if (param && words) params[param] = words;
				break;
			}
			case "return":
				returns.push(words ?? "");
				break;
			case "error":
				if (head) (doc.errors ??= []).push({ type: head, ...(words ? { description: words } : {}) });
				break;
			case "yields":
			case "unreleased":
			case "private":
			case "ignore":
				doc[name] = true;
				break;
			case "server":
			case "client":
			case "plugin":
				if (!doc.realms?.includes(name)) (doc.realms ??= []).push(name);
				break;
			case "since":
				if (head) doc.since = head;
				break;
			case "deprecated":
				doc.deprecated = { version: head, ...(words ? { reason: words } : {}) };
				break;
			case "tag":
				if (head) (doc.tags ??= []).push(head);
				break;
			case "within":
				if (head) doc.within = head;
				break;
			default:
				// @class, @interface, @type, @function, @method, @prop: the graph's.
				break;
		}
	}
	if (Object.keys(params).length) doc.params = params;
	if (Object.keys(fields).length) doc.fields = fields;
	if (returns.some((r) => r !== "")) doc.returns = returns;
	if (doc.realms) doc.realms = DOC_REALMS.filter((r) => doc.realms?.includes(r));
	// Blank lines kept inside the description, trimmed off its ends.
	while (description[0] === "") description.shift();
	while (description[description.length - 1] === "") description.pop();
	return { description: description.join("\n"), doc };
}

/** The result of the realm switch, in words. */
export function realmWords(realms: readonly DocRealm[] | undefined): string {
	const on = DOC_REALMS.filter((r) => realms?.includes(r));
	if (on.length === 0) return "Anywhere";
	const sentence = (words: string) => words[0].toUpperCase() + words.slice(1);
	if (on.length === 1) return `${sentence(on[0])} only`;
	return sentence(`${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}`);
}

/**
 * What is wrong with a doc comment as the canvas has it, for Script analysis:
 * a box that documents nothing, or more than one thing.
 */
export function docProblem(subject: DocSubject): string | undefined {
	if (subject.kind === "none") {
		return "This doc comment documents nothing. Draw it around a Declare Function, Module Exports or Declare Type.";
	}
	if (subject.kind === "several") {
		return `A doc comment documents one declaration, and this one holds ${subject.count}. Draw it around one of them.`;
	}
	return undefined;
}

/**
 * The parameters, and returns by position, that have no words yet: what the
 * box and the Inspector mark as still to describe.
 */
export function undescribed(comment: Comment, subject: DocSubject): { params: string[]; returns: number[] } {
	if (subject.kind !== "function") return { params: [], returns: [] };
	const doc = comment.doc ?? {};
	return {
		params: subject.params.map((p) => p.name).filter((name) => !doc.params?.[name]?.trim()),
		returns: subject.returns.map((_, i) => i).filter((i) => !doc.returns?.[i]?.trim()),
	};
}
