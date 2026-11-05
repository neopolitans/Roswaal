/**
 * Doc comments: a comment box that writes Moonwave for the declaration it holds.
 *
 * Moonwave refuses a comment with an undocumented parameter, a @param naming
 * none, or some returns written and not others, and requires @within on
 * anything but a class. These hold the written comment to those rules, from
 * the function's own signature, and check the text form reads back into the
 * same record.
 */

import { describe, expect, it } from "vitest";
import { commentRows } from "../src/app/NodeMenu.js";
import { analyse } from "../src/app/SelectionPreview.js";
import { compile, serialiseScript } from "../src/core/compiler/index.js";
import {
	docBlockText,
	docProblems,
	docSubject,
	docText,
	readDocText,
	realmWords,
	sameDocText,
	undescribed,
} from "../src/core/docComments.js";
import { docCommentBefore } from "../src/core/luau/docComment.js";
import { nodeBounds } from "../src/core/nodeBox.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { Comment, DocTags, NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

/** A box around the given nodes, as the editor draws one around a selection. */
function around(script: NodeScript, ids: string[], doc: DocTags, text = ""): Comment {
	const boxes = script.nodes.filter((n) => ids.includes(n.id)).map((n) => nodeBounds(n, registry));
	const x = Math.min(...boxes.map((b) => b.x)) - 24;
	const y = Math.min(...boxes.map((b) => b.y)) - 52;
	const right = Math.max(...boxes.map((b) => b.x + b.w)) + 24;
	const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + 24;
	return { id: "doc", x, y, w: right - x, h: bottom - y, text, doc, style: "docBlock" };
}

/** Rig's `need`: three parameters, one return. */
function need(doc: DocTags = {}, text = "Finds the child of `parent` called `name`.") {
	const b = new Builder();
	const begin = b.node("script.begin");
	const fn = b.node("function.declareHere", {
		config: {
			name: "need",
			params: [
				{ name: "parent", type: "Instance" },
				{ name: "name", type: "string" },
				{ name: "className", type: "ClassName" },
			],
			returns: [{ name: "child", type: "Instance" }],
		},
		x: 300,
		y: 400,
	});
	b.link(begin, "then", fn, "in");
	const script: NodeScript = { ...b.build(), name: "Rig" };
	script.comments = [around(script, [fn], doc, text)];
	return script;
}

const out = (script: NodeScript, comments = true) =>
	body(compile(script, registry, { comments }).code);

describe("a doc comment around a Declare Function", () => {
	it("writes a Moonwave block above the function, with @within the module", () => {
		const code = out(need());
		const block = code.slice(code.indexOf("--[=["), code.indexOf("local function need"));
		expect(block).toContain("Finds the child of `parent` called `name`.");
		expect(block).toContain("@within Rig");
		expect(block.trimEnd().endsWith("]=]")).toBe(true);
	});

	/** Moonwave finds parameters itself; a @param list is all of them or none. */
	it("writes no @param until one has words, then every one with its type", () => {
		expect(out(need())).not.toContain("@param");
		const code = out(need({ params: { name: "The child's name." } }));
		expect(code).toContain("@param parent Instance");
		expect(code).toContain("@param name string -- The child's name.");
		// Roswaal's ClassName is written as Luau's string, as the annotation is.
		expect(code).toContain("@param className string");
		expect(code).toContain("className: string");
		expect(code.match(/@param/g)).toHaveLength(3);
	});

	it("has no blank first line when there is no description yet", () => {
		const code = out(need({}, ""));
		expect(code).toContain("--[=[\n\t@within Rig");
	});

	it("writes every return once one has words", () => {
		expect(out(need({ returns: ["The child."] }))).toContain("@return Instance -- The child.");
	});

	it("drops the words of a parameter the function no longer has", () => {
		const code = out(need({ params: { gone: "Was here.", parent: "Where to look." } }));
		expect(code).not.toContain("gone");
		expect(code).toContain("@param parent Instance -- Where to look.");
	});

	it("writes errors, yields, usage, realms, visibility and tags", () => {
		const code = out(
			need({
				errors: [{ type: '"Missing"', description: "No such child." }],
				yields: true,
				since: "0.4.0",
				deprecated: { version: "0.9.0", reason: "Use find." },
				realms: ["client", "server"],
				private: true,
				tags: ["Player"],
			}),
		);
		for (const line of [
			'@error "Missing" -- No such child.',
			"@yields",
			"@since 0.4.0",
			"@deprecated 0.9.0 -- Use find.",
			"@server",
			"@client",
			"@private",
			"@tag Player",
		]) {
			expect(code).toContain(line);
		}
		// Realms in Moonwave's order, whatever order they were switched on in.
		expect(code.indexOf("@server")).toBeLessThan(code.indexOf("@client"));
	});

	/** The point of writing it: the hover in every script that requires this one reads it. */
	it("is read by Roswaal's own hover as the function's documentation", () => {
		const code = compile(
			need({ params: { parent: "Where to look." }, returns: ["The child."], yields: true }),
			registry,
		).code;
		const doc = docCommentBefore(code, code.indexOf("local function need"));
		expect(doc?.text).toContain("Finds the child of `parent` called `name`.");
		expect(doc?.params.find((p) => p.name === "parent")?.description).toBe("Where to look.");
		expect(doc?.returns[0]).toMatchObject({ type: "Instance", description: "The child." });
		expect(doc?.yields).toBe(true);
		expect(doc?.within).toBe("Rig");
	});

	it("is written with the comments setting off, as documentation", () => {
		expect(out(need(), false)).toContain("@within Rig");
	});

	it("writes --- lines when asked", () => {
		const script = need();
		script.comments[0].style = "doc";
		expect(out(script)).toContain("--- @within Rig");
	});

	it("is kept with its tags when the graph is saved", () => {
		const saved = JSON.parse(serialiseScript(need({ since: "0.4.0", realms: ["server"] })));
		expect(saved.comments[0].doc).toEqual({ realms: ["server"], since: "0.4.0" });
	});

	it("marks what is still to describe", () => {
		const script = need({ params: { parent: "Where." } });
		const subject = docSubject(script, registry, script.comments[0]);
		expect(undescribed(script.comments[0], subject)).toEqual({
			params: ["name", "className"],
			returns: [0],
		});
	});
});

describe("what a doc comment documents", () => {
	it("is a problem in Script analysis around nothing", () => {
		const script = need();
		script.comments[0] = { ...script.comments[0], x: -2000, y: -2000 };
		const messages = compile(script, registry).diagnostics.map((d) => d.message);
		expect(messages.some((m) => m.startsWith("This doc comment documents nothing"))).toBe(true);
	});

	it("is a class around Module Exports", () => {
		const b = new Builder();
		const exportsNode = b.node("module.exports", { x: 300, y: 400 });
		const script: NodeScript = { ...b.build(), name: "Rig", scriptClass: "ModuleScript" };
		const comment = around(script, [exportsNode], {}, "A tank's parts.");
		const subject = docSubject(script, registry, comment);
		expect(subject.kind).toBe("class");
		const text = docText(comment, subject, "Rig");
		expect(text).toContain("@class Rig");
		expect(text).not.toContain("@within");
	});

	it("is an interface around Declare Type with fields, each field from the type", () => {
		const b = new Builder();
		const type = b.node("type.declareTop", {
			config: { name: "Tank", shape: "fields", fields: [{ name: "hull", type: "BasePart" }] },
			x: 300,
			y: 400,
		});
		const script: NodeScript = { ...b.build(), name: "Rig" };
		const comment = around(script, [type], { fields: { hull: "What the tracks carry." } });
		const text = docText(comment, docSubject(script, registry, comment), "Rig");
		expect(text).toContain("@interface Tank");
		expect(text).toContain("@within Rig");
		expect(text).toContain(".hull BasePart -- What the tracks carry.");
	});
});

describe("the text form", () => {
	/** What the Inspector's text view writes, read back, is the same record. */
	it("reads back what it writes", () => {
		const doc: DocTags = {
			params: { parent: "Where to look." },
			returns: ["The child."],
			errors: [{ type: '"Missing"', description: "No such child." }],
			realms: ["server", "client"],
			since: "0.4.0",
			yields: true,
			tags: ["Player"],
			within: "Tank",
		};
		const script = need(doc, "Finds the child.\n\nThen checks it.");
		const comment = script.comments[0];
		const text = docText(comment, docSubject(script, registry, comment), "Rig");
		const read = readDocText(text);
		expect(read.description).toBe("Finds the child.\n\nThen checks it.");
		expect(read.doc.params).toEqual({ parent: "Where to look." });
		expect(read.doc.returns).toEqual(["The child."]);
		expect(read.doc.errors).toEqual(doc.errors);
		expect(read.doc.realms).toEqual(["server", "client"]);
		expect(read.doc).toMatchObject({
			since: "0.4.0",
			yields: true,
			tags: ["Player"],
			within: "Tank",
		});
	});

	it("takes a comment pasted with its delimiters", () => {
		const read = readDocText(
			"--[=[\n\tAdds one.\n\n\t@param n number -- The number.\n\t@client\n]=]",
		);
		expect(read.description).toBe("Adds one.");
		expect(read.doc.params).toEqual({ n: "The number." });
		expect(read.doc.realms).toEqual(["client"]);
	});

	it("says the realms in words", () => {
		expect(realmWords(undefined)).toBe("Anywhere");
		expect(realmWords(["server"])).toBe("Server only");
		expect(realmWords(["client", "server"])).toBe("Server and client");
		expect(realmWords(["server", "client", "plugin"])).toBe("Server, client and plugin");
	});
});

/**
 * What is said about a comment beyond what it holds: a tag half-filled, which
 * is left out of the file, and a class nothing declares.
 */
describe("the checks beyond Moonwave's own rules", () => {
	const problems = (script: NodeScript) =>
		docProblems(
			script,
			registry,
			script.comments[0],
			docSubject(script, registry, script.comments[0]),
		);

	it("says a half-filled tag is left out, and leaves it out", () => {
		const script = need({ since: " ", deprecated: { version: "" }, tags: [""], within: "Tank" });
		const said = problems(script);
		expect(said.some((p) => p.startsWith("Since needs"))).toBe(true);
		expect(said.some((p) => p.startsWith("Deprecated needs"))).toBe(true);
		expect(said.some((p) => p.startsWith("A tag needs"))).toBe(true);
		const code = out(script);
		expect(code).not.toContain("@since");
		expect(code).not.toContain("@deprecated");
		expect(code).not.toContain("@tag");
	});

	it("says a function filed under the module's class needs that class declared", () => {
		expect(problems(need()).some((p) => p.includes("@class Rig, which nothing declares"))).toBe(
			true,
		);
		expect(problems(need({ within: "Tank" }))).toEqual([]);
	});

	it("is quiet once Module Exports has a doc comment of its own", () => {
		const script = need();
		const b = new Builder();
		const exportsNode = b.node("module.exports", { id: "exports", x: 300, y: 1400 });
		const built = b.build();
		script.nodes.push(...built.nodes);
		script.comments.push({ ...around({ ...built, name: "Rig" }, [exportsNode], {}), id: "class" });
		expect(problems(script)).toEqual([]);
	});

	it("is said in Script analysis", () => {
		const messages = compile(need({ since: "" }), registry).diagnostics.map((d) => d.message);
		expect(messages.some((m) => m.startsWith("Since needs"))).toBe(true);
	});
});

/** The Code panel's tab waits for its typing to come back by meaning, not by characters. */
describe("the Moonwave text in the Code panel", () => {
	it("is the comment with its delimiters, as the file holds it", () => {
		const script = need({ params: { parent: "Where." } });
		const comment = script.comments[0];
		const text = docBlockText(comment, docSubject(script, registry, comment), "Rig");
		expect(text.startsWith("--[=[")).toBe(true);
		expect(text.endsWith("]=]")).toBe(true);
		expect(out(script)).toContain(text);
	});

	it("is the same text when it says the same thing", () => {
		const written =
			"--[=[\n\tAdds one.\n\n\t@param n number -- The number.\n\t@client\n\t@within Maths\n]=]";
		const typed = "Adds one.\n@within Maths\n@client\n@param n -- The number.";
		expect(sameDocText(written, typed)).toBe(true);
		expect(sameDocText(written, typed.replace("one", "two"))).toBe(false);
	});
});

describe("adding one from a menu", () => {
	it("offers both comments with nothing typed, and the doc comment by its other names", () => {
		expect(commentRows("")).toEqual({ plain: true, doc: true });
		expect(commentRows("moon").doc).toBe(true);
		expect(commentRows("docs").doc).toBe(true);
		expect(commentRows("comm")).toEqual({ plain: true, doc: false });
		expect(commentRows("print")).toEqual({ plain: false, doc: false });
	});
});

/** `P` with the box selected lights what it wrote, as it does for a node. */
describe("previewing a selected doc comment", () => {
	it("lights every line of the Moonwave block", () => {
		const script = need({ params: { parent: "Where." } });
		const result = compile(script, registry);
		const preview = analyse({
			script,
			registry,
			selection: new Set(["doc"]),
			code: result.code,
			sourceMap: result.sourceMap,
			onClose: () => {},
		});
		const lit = preview.rows.filter((r) => r.mine).map((r) => r.tokens.map((t) => t.text).join(""));
		expect(lit[0]).toContain("--[=[");
		expect(lit.some((line) => line.includes("@param parent Instance -- Where."))).toBe(true);
		expect(lit[lit.length - 1]).toContain("]=]");
		expect(lit.some((line) => line.includes("local function need"))).toBe(false);
	});
});
