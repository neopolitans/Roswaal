/**
 * Text in a graph file never becomes code the graph does not show.
 *
 * A `.nodescript` is JSON, and anybody can write one: by hand, in a zip, in a
 * repository, or by importing a `.luau`. Whatever text it holds reaches the
 * generated file through one of four doors -- a string, a comment, a name, or
 * a node that is code and shows itself as code -- and the first three must
 * hold whatever is put through them.
 *
 * So every text field of real graphs is given text that would run if it got
 * out -- a line break, a closing bracket, a call -- and the output is read
 * back with Roswaal's own lexer. The payload's call must never be a call.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { bracketLevel, commentLines, oneLine } from "../src/core/comments.js";
import { compile } from "../src/core/compiler/index.js";
import { CURATED, GUIDE_SCENES } from "../src/core/docs/examples.js";
import { importLuau } from "../src/core/import/fromLuau.js";
import { tokenize } from "../src/core/luau/lexer.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();
const MARK = "ESCAPED";

/** Text that would run if it got out of where it was put. */
const PAYLOADS = [
	(v: string) => `${v}\n${MARK}()\n`,
	(v: string) => `${v}\r${MARK}()`,
	(v: string) => `${v}]]${MARK}()--[[`,
	(v: string) => `${v}"..${MARK}().."`,
	(v: string) => `${v}(${MARK}())`,
];

/** Nodes whose text is Luau by design, and drawn as Luau on the node. */
const CODE_NODES = new Set(["code.custom", "value.expression"]);

function graph(file: string): NodeScript {
	return JSON.parse(readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n"));
}

/** A graph from Luau, as Import as graph makes one. */
function imported(): NodeScript {
	const source = [
		"--- The player's score",
		'local Players = game:GetService("Players")',
		"local score: number = 0",
		"local function greet(name: string): string",
		'\treturn "hi " .. name',
		"end",
		"Players.PlayerAdded:Connect(function(player)",
		'\tif player.Name == "x" then print(greet(player.Name)) end',
		"end)",
	].join("\n");
	const result = importLuau(source, {
		name: "Imported",
		scriptClass: "Script",
		target: "roblox",
		idPrefix: "imp",
	});
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

/**
 * One of each way a graph names something in the output: variables and their
 * descriptions, services and paths, a required module, a Lune call, and what
 * the importer writes.
 */
const CORPUS: [string, () => NodeScript][] = [
	[
		"the demo's Main",
		() => graph("examples/demo/.roswaal/scripts/ServerScriptService/Source/Main.nodescript"),
	],
	["a Lune demo", () => graph("examples/lune-demo/.roswaal/scripts/walk-a-directory.nodescript")],
	["Require Module", CURATED["module.requirePath"]],
	["a Service Function", GUIDE_SCENES.serviceCall],
	["an imported .luau", imported],
];

/** The payload ran: its marker is a name, and it is called. */
function escaped(code: string): boolean {
	const tokens = tokenize(code).filter((t) => t.kind !== "whitespace" && t.kind !== "comment");
	return tokens.some((t, i) => t.kind === "name" && t.text === MARK && tokens[i + 1]?.text === "(");
}

/** Every string in a graph, by its path, other than a code node's own config and a raw literal. */
function* textFields(
	value: unknown,
	path: (string | number)[] = [],
): Generator<(string | number)[]> {
	if (typeof value === "string") {
		yield path;
		return;
	}
	if (Array.isArray(value)) {
		for (const [i, item] of value.entries()) yield* textFields(item, [...path, i]);
		return;
	}
	if (value && typeof value === "object") {
		const fields = value as Record<string, unknown>;
		if (fields.t === "raw") return;
		const code = typeof fields.def === "string" && CODE_NODES.has(fields.def);
		for (const [key, item] of Object.entries(fields)) {
			if (code && key === "config") continue;
			yield* textFields(item, [...path, key]);
		}
	}
}

function withText(script: NodeScript, path: (string | number)[], text: string): NodeScript {
	const copy = structuredClone(script) as unknown as Record<string | number, unknown>;
	let at = copy;
	for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
	at[path[path.length - 1]] = text;
	return copy as unknown as NodeScript;
}

function textAt(script: NodeScript, path: (string | number)[]): string {
	return path.reduce<unknown>(
		(at, key) => (at as Record<string | number, unknown>)[key],
		script,
	) as string;
}

describe.each(CORPUS)("text in %s", (_name, make) => {
	it("never becomes code, whatever field it is put in", () => {
		const script = make();
		expect(escaped(compile(script, registry, { comments: true }).code)).toBe(false);
		const out: string[] = [];
		for (const path of textFields(script)) {
			for (const payload of PAYLOADS) {
				const changed = withText(script, path, payload(textAt(script, path)));
				let result: ReturnType<typeof compile>;
				try {
					result = compile(changed, registry, { comments: true });
				} catch {
					continue;
				}
				// A graph that does not compile writes nothing.
				if (result.ok && escaped(result.code))
					out.push(`${path.join(".")} ← ${JSON.stringify(payload(""))}`);
			}
		}
		expect(out).toEqual([]);
	});
});

describe("the doors themselves", () => {
	it("keeps a line break in a variable's description inside the comment", () => {
		const script = graph(
			"examples/demo/.roswaal/scripts/ServerScriptService/Source/Main.nodescript",
		);
		script.variables[0].description = `Players so far\n${MARK}()`;
		const code = compile(script, registry, {}).code;
		expect(escaped(code)).toBe(false);
		expect(code).toContain("Players so far");
	});

	it("finds a bracket level past sixteen when the text holds every one below it", () => {
		const closers = Array.from({ length: 17 }, (_, level) => `]${"=".repeat(level)}]`).join(" ");
		expect(bracketLevel(closers)).toBe(17);
		const lines = commentLines(`${closers}\nsecond line`);
		expect(lines[0]).toBe(`--[${"=".repeat(17)}[`);
	});

	it("keeps header text on its line", () => {
		expect(oneLine(`Main\r\n${MARK}()\rmore`)).toBe(`Main ${MARK}() more`);
	});

	it("still writes a path from script, game or workspace as a path", () => {
		const script = CURATED["module.requirePath"]();
		const node = script.nodes.find((n) => n.literals?.root);
		if (!node?.literals) throw new Error("the example has no root");
		node.literals.root = { t: "string", v: "script.Parent" };
		expect(compile(script, registry, {}).code).toContain("require(script.Parent.");
	});

	it("treats any other root as a service by name, quoted", () => {
		const script = CURATED["module.requirePath"]();
		const node = script.nodes.find((n) => n.literals?.root);
		if (!node?.literals) throw new Error("the example has no root");
		node.literals.root = { t: "string", v: "MadeUpService" };
		expect(compile(script, registry, {}).code).toContain('game:GetService("MadeUpService")');
	});
});
