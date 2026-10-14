/**
 * Luau read into a graph: the importer's skeleton (0.140.0).
 *
 * The gate is the M103 sample, every file of it: each one imports, compiles
 * without an error, and compiles back to what it was, line for line, once
 * comments and blank lines are set aside. Comments come in a later phase, and a
 * few constructs say what they are a little differently (`pairs`, `: ()`), so
 * the round trip is checked exactly where the skeleton promises it and by the
 * gate everywhere else.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { viewOf } from "../src/core/functionGraph.js";
import { graphNameOf, type ImportOptions, importLuau } from "../src/core/import/fromLuau.js";
import { detectTarget } from "../src/core/import/modes.js";
import { nodeBounds } from "../src/core/nodeBox.js";
import { FUNCTION_NODES } from "../src/core/nodes/flow.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { ApiSession } from "../src/server/routes.js";

const registry = createRegistry();
const NATIVE = path.join(__dirname, "../examples/m103/native/src");

function luauFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return luauFiles(full);
		return name.endsWith(".luau") ? [full] : [];
	});
}

function imported(
	src: string,
	file = "Test.server.luau",
	settings: Pick<ImportOptions, "locals" | "mode"> = {},
): NodeScript {
	const { name, scriptClass } = graphNameOf(file);
	const result = importLuau(src, {
		name,
		scriptClass,
		target: "roblox",
		idPrefix: "t",
		...settings,
	});
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

function compiled(script: NodeScript): { code: string; errors: string[] } {
	const out = compile(script, registry);
	return {
		code: out.code,
		errors: out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message),
	};
}

/** The code's lines, without comments, blank lines, or the generated header. */
function lines(code: string): string[] {
	return code
		.replace(/\r\n?/g, "\n")
		.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, "")
		.split("\n")
		.map((l) => l.replace(/--(?!!).*$/, "").trim())
		.filter((l) => l !== "");
}

/**
 * Annotations are written only when the mode line asks for them, as for any
 * graph, so the cases here are strict files like the sample's.
 */
const roundTrip = (
	src: string,
	file?: string,
	settings?: Pick<ImportOptions, "locals" | "mode">,
) => {
	const { code, errors } = compiled(imported(src, file, settings));
	expect(errors).toEqual([]);
	return lines(code);
};

const defsOf = (script: NodeScript) => script.nodes.map((n) => n.def);

describe("the M103 sample", () => {
	const files = luauFiles(NATIVE);

	it("is all there", () => {
		expect(files.map((f) => path.basename(f)).sort()).toEqual([
			"Config.luau",
			"Occupancy.luau",
			"Remotes.luau",
			"Rig.luau",
			"TankClient.client.luau",
			"TankServer.server.luau",
		]);
	});

	it.each(files.map((f) => [path.basename(f), f]))("%s imports and compiles", (name, file) => {
		const src = readFileSync(file, "utf8");
		const script = imported(src, name);
		expect(compiled(script).errors).toEqual([]);
	});

	it("is mostly nodes", () => {
		let statements = 0;
		let asNodes = 0;
		for (const file of files) {
			const { name, scriptClass } = graphNameOf(path.basename(file));
			const result = importLuau(readFileSync(file, "utf8"), {
				name,
				scriptClass,
				target: "roblox",
			});
			if (!result.ok) throw new Error(result.error);
			statements += result.report.statements;
			asNodes += result.report.asNodes;
		}
		expect(asNodes / statements).toBeGreaterThan(0.9);
	});

	it("gives Rig back line for line", () => {
		const src = readFileSync(path.join(NATIVE, "ReplicatedStorage/Tank/Rig.luau"), "utf8");
		expect(roundTrip(src, "Rig.luau")).toEqual(lines(src));
	});
});

describe("what becomes a node", () => {
	it("a file-level local is a script variable, declared where it was", () => {
		const src = "--!strict\nlocal speed: number = 16\nprint(speed)\nspeed = 20\n";
		const script = imported(src);
		expect(script.variables.map((v) => [v.name, v.type])).toEqual([["speed", "number"]]);
		expect(defsOf(script)).toEqual(
			expect.arrayContaining(["variable.init", "variable.get", "variable.set"]),
		);
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("a file-level local is a Declare Local when the import asks for that", () => {
		const src = "--!strict\nlocal speed: number = 16\nprint(speed)\n";
		const script = imported(src, undefined, { locals: "local" });
		expect(script.variables).toEqual([]);
		expect(defsOf(script)).toEqual(expect.arrayContaining(["local.declare", "local.get"]));
		expect(roundTrip(src, undefined, { locals: "local" })).toEqual(lines(src));
	});

	it("a local inside a function stays a local", () => {
		const src = "--!strict\nlocal function f(): ()\n\tlocal n = 1\n\tprint(n)\nend\n";
		const script = imported(src);
		expect(script.variables).toEqual([]);
		expect(defsOf(script)).toContain("local.declare");
	});

	it("a name declared twice at file level is a variable, then a local", () => {
		const src = "local a = 1\nprint(a)\nlocal a = 2\nprint(a)\n";
		const script = imported(src);
		expect(script.variables.map((v) => v.name)).toEqual(["a"]);
		// An imported graph keeps its names, so the second is `a` again.
		expect(roundTrip(src)).toEqual(lines(src));
	});

	/**
	 * What follows an `if` runs after its `end`, and in a graph that is the
	 * next output of a Sequence. Hung on the last arm's False it would become
	 * an `elseif` or an `else`, and only run when the `if` did not.
	 */
	it("runs what follows an if after it, not in its else", () => {
		const src = "local a = 1\nif a then\n\tprint(1)\nend\nif a then\n\tprint(2)\nend\nprint(3)\n";
		const script = imported(src);
		expect(defsOf(script).filter((d) => d === "flow.sequence")).toHaveLength(1);
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("keeps elseif and else as they are", () => {
		const src =
			"local a = 1\nif a == 1 then\n\tprint(1)\nelseif a == 2 then\n\tprint(2)\nelse\n\tprint(3)\nend\n";
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("reads the three loops into their nodes", () => {
		const src = [
			"for i = 1, 10 do",
			"\tprint(i)",
			"end",
			"for index, part in ipairs(workspace:GetChildren()) do",
			"\tprint(index, part)",
			"end",
			"local n = 0",
			"while n < 3 do",
			"\tn = n + 1",
			"end",
		].join("\n");
		const script = imported(src);
		expect(defsOf(script)).toEqual(
			expect.arrayContaining(["flow.forRange", "flow.forIndex", "flow.while", "variable.set"]),
		);
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("keeps a loop's `_`", () => {
		expect(roundTrip("for _, v in pairs({}) do\n\tprint(v)\nend\n")).toContain(
			"for _, v in pairs({}) do",
		);
	});

	it("declares a typed function, with its parameters and return", () => {
		const src =
			"--!strict\nlocal function pick(a: number, b: number): number\n\treturn a\nend\nprint(pick(1, 2))\n";
		const script = imported(src);
		const decl = script.nodes.find((n) => n.def === "function.declareHere");
		expect(decl?.config).toMatchObject({
			name: "pick",
			params: [
				{ name: "a", type: "number" },
				{ name: "b", type: "number" },
			],
			returns: [{ type: "number" }],
		});
		expect(defsOf(script)).toEqual(
			expect.arrayContaining(["function.getParam", "function.return", "function.callValue"]),
		);
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("puts a cast on a call to a known function onto the call", () => {
		const src =
			'--!strict\nlocal function need(name: string): Instance\n\treturn workspace:FindFirstChild(name) :: Instance\nend\nlocal hull = need("Hull") :: BasePart\nprint(hull)\n';
		const script = imported(src);
		const call = script.nodes.find((n) => n.def === "function.callValue");
		expect(call?.config).toMatchObject({ resultCast: "BasePart" });
		const kept = script.nodes.filter((n) => n.def === "value.expression");
		const text = (n: (typeof kept)[number]) => {
			const code = n.literals?.code;
			return code && "v" in code ? String(code.v) : "";
		};
		expect(kept.map(text)).not.toContainEqual(expect.stringContaining("need("));
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("writes a field as Set Property or Set Key by how it is named", () => {
		const src =
			'local part = Instance.new("Part")\npart.Anchored = true\nlocal t = {}\nt.count = 1\n';
		const defs = defsOf(imported(src));
		expect(defs).toContain("roblox.setProperty");
		expect(defs).toContain("table.setKey");
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("returns a module through Module Exports", () => {
		const src =
			'--!strict\nlocal M = {}\nfunction M.hello(): string\n\treturn "hi"\nend\nreturn M\n';
		const script = imported(src, "M.luau");
		expect(script.scriptClass).toBe("ModuleScript");
		expect(defsOf(script)).toContain("module.exports");
		expect(roundTrip(src, "M.luau")).toEqual(lines(src));
	});
});

describe("the modes", () => {
	const src =
		'--!strict\nlocal ready = true\nlocal label = ready and "go" or "wait"\nprint(label)\n';

	it("leave a and b or c alone in Verbatim and Tidy", () => {
		for (const mode of ["verbatim", "tidy"] as const) {
			expect(roundTrip(src, undefined, { mode })).toContain(
				'local label = ready and "go" or "wait"',
			);
		}
	});

	it("write it as an if-expression in Modern, when the middle is surely truthy", () => {
		expect(roundTrip(src, undefined, { mode: "modern" })).toContain(
			'local label = if ready then "go" else "wait"',
		);
	});

	it("never rewrite one whose middle could be false or nil", () => {
		const risky = "local a, b, c = true, nil, 1\nprint(a and b or c)\n";
		expect(roundTrip(risky, undefined, { mode: "modern" })).toContain("print(a and b or c)");
	});

	it("report a likely bug in every mode, and leave it as written", () => {
		const buggy = "local x = true\nprint(x and false or 1)\n";
		for (const mode of ["verbatim", "tidy", "modern"] as const) {
			const result = importLuau(buggy, {
				name: "T",
				scriptClass: "Script",
				target: "roblox",
				mode,
			});
			if (!result.ok) throw new Error(result.error);
			expect(result.report.findings).toEqual([
				{ line: 2, message: expect.stringContaining("never gives false") },
			]);
			expect(roundTrip(buggy, undefined, { mode })).toContain("print(x and false or 1)");
		}
	});

	it("say which runtime a file is for from its requires", () => {
		expect(detectTarget('local fs = require("@lune/fs")\n')).toBe("lune");
		expect(detectTarget('local Players = game:GetService("Players")\n')).toBeUndefined();
	});
});

describe("what stays as code", () => {
	it("keeps what has no node yet as its own text", () => {
		const src = "type Pair<T> = { a: T }\nlocal x, y = 1, 2\nx += y\n";
		const result = importLuau(src, { name: "T", scriptClass: "Script", target: "roblox" });
		if (!result.ok) throw new Error(result.error);
		expect(result.report.asCode.map((c) => c.construct).sort()).toEqual([
			"compound assignment",
			"generic type",
			"local with several names",
		]);
		expect(roundTrip(src)).toEqual(lines(src));
	});

	/**
	 * Declare Function writes `: ()` when it has no returns, which would be a
	 * lie about a function that returns something without saying what.
	 */
	it("keeps an untyped function that returns a value", () => {
		const src = "local function two()\n\treturn 2\nend\nprint(two())\n";
		expect(defsOf(imported(src))).not.toContain("function.declareHere");
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("keeps a CRLF file's code with LF, as the compiler writes it", () => {
		const src = "local t = {\r\n\ta = 1,\r\n}\r\nprint(t)\r\n";
		const { code } = compiled(imported(src));
		expect(code).toContain("local t = {\n\ta = 1,\n}");
		expect(code).not.toContain("\r");
	});

	it("keeps its indentation inside the text, once", () => {
		const src = "local function f(): ()\n\tlocal t = {\n\t\ta = 1,\n\t}\n\tprint(t)\nend\n";
		const { code } = compiled(imported(src));
		expect(code).toContain("\tlocal t = {\n\t\ta = 1,\n\t}");
	});
});

describe("names and types as written", () => {
	it("keeps a shadowing local, so Luau kept as text reads the one it read", () => {
		const src =
			"local n = 1\nlocal function g()\n\tlocal n = 2\n\tn += 1\n\tprint(n)\nend\ng()\nprint(n)\n";
		expect(roundTrip(src, "T.luau")).toEqual(lines(src));
	});

	it("keeps an underscore, and `self` as a parameter", () => {
		const src =
			"local M = {}\nfunction M.init(self: typeof(M), _unused: number)\n\tprint(self)\nend\nlocal _c = 1\nprint(_c)\nreturn M\n";
		expect(roundTrip(src, "M.luau")).toEqual(lines(src));
	});

	it("keeps a name that hides a global, and says so on its node", () => {
		const src =
			'local roblox = require("@lune/roblox")\nlocal Color3 = roblox.Color3\nprint(Color3.new(1, 0, 0))\n';
		const { code, errors } = compiled(imported(src, "T.luau"));
		expect(errors).toEqual([]);
		expect(lines(code)).toEqual(lines(src));
		const warnings = compile(imported(src, "T.luau"), registry).diagnostics.filter(
			(d) => d.severity === "warning",
		);
		expect(warnings.some((w) => w.message.includes('"Color3" is kept as written'))).toBe(true);
	});

	it("keeps the annotations of a file with no mode line, and adds none", () => {
		const src =
			"local function scale(v: number, by): number\n\treturn v * by\nend\nlocal function show(text: string)\n\tprint(text)\nend\nlocal conn: RBXScriptConnection\nlocal d: any = {}\nprint(scale(1, 2), show, conn, d)\n";
		expect(roundTrip(src, "T.luau")).toEqual(lines(src));
	});

	it("keeps a loop over a table as Luau iterates it, with the names it gave", () => {
		const src = "local t = {}\nfor k in t do\n\tprint(k)\nend\nfor _, v in t do\n\tprint(v)\nend\n";
		expect(roundTrip(src, "T.luau")).toEqual(lines(src));
	});

	it("writes a type set out over several lines on one", () => {
		const src =
			"local tiers: {\n\t[string]: { color: Color3, -- shown\n\tsize: number },\n} = {}\nprint(tiers)\n";
		const { code, errors } = compiled(imported(src, "T.luau"));
		expect(errors).toEqual([]);
		expect(code).toContain("local tiers: { [string]: { color: Color3, size: number } } = {}");
	});
});

describe("event handlers", () => {
	const src =
		'local Players = game:GetService("Players")\n\nPlayers.PlayerAdded:Connect(function(player: Player)\n\tif player.Name == "" then\n\t\treturn\n\tend\n\tprint("Welcome", player.Name)\nend)\n\nlocal conn = Players.PlayerRemoving:Connect(function(player)\n\twarn(player)\nend)\n\nworkspace.ChildAdded:Once(function(child)\n\tprint(child, conn)\nend)\n';

	it("makes Connect and Once their nodes, the handler's body on Body", () => {
		const script = imported(src, "T.server.luau");
		expect(defsOf(script).filter((d) => d === "event.connect")).toHaveLength(2);
		expect(defsOf(script)).toContain("event.once");
		expect(defsOf(script)).toContain("function.return");
		const added = script.nodes.find((n) => n.def === "event.connect" && !n.label);
		expect(added?.config?.params).toEqual([{ name: "player", type: "Player" }]);
		expect(roundTrip(src, "T.server.luau")).toEqual(lines(src));
	});

	it("names the connection a local takes, and wires its reads to it", () => {
		const script = imported(src, "T.server.luau");
		const named = script.nodes.find((n) => n.label === "conn");
		expect(named?.def).toBe("event.connect");
		expect(script.links.some((l) => l.from.node === named?.id && l.from.pin === "connection")).toBe(
			true,
		);
	});

	it("makes task.spawn, task.defer and task.delay with a function New Thread", () => {
		const tasks =
			'local count = 0\n\ntask.spawn(function()\n\tprint("now")\nend)\n\ntask.delay(2, function()\n\tprint("later", count)\nend)\n\nlocal t = task.defer(function()\n\tprint("deferred")\nend)\ntask.cancel(t)\n';
		const script = imported(tasks, "T.server.luau");
		const threads = script.nodes.filter((n) => n.def === "task.thread");
		expect(threads.map((n) => n.config?.when ?? "spawn")).toEqual(["spawn", "delay", "defer"]);
		expect(threads.find((n) => n.label === "t")).toBeDefined();
		expect(defsOf(script)).toContain("task.cancel");
		expect(roundTrip(tasks, "T.server.luau")).toEqual(lines(tasks));
	});

	it("reads a loop's variable by name inside a function declared in its body", () => {
		const nested =
			"for name, value in pairs({}) do\n\ttask.spawn(function()\n\t\tlocal function apply()\n\t\t\tprint(name, value)\n\t\tend\n\t\tapply()\n\tend)\nend\n";
		expect(roundTrip(nested, "T.server.luau")).toEqual(lines(nested));
	});

	it("keeps a handler it cannot draw as code: one taking `...`", () => {
		const kept = "workspace.ChildAdded:Connect(function(...)\n\tprint(...)\nend)\n";
		expect(defsOf(imported(kept, "T.server.luau"))).not.toContain("event.connect");
		expect(roundTrip(kept, "T.server.luau")).toEqual(lines(kept));
	});
});

describe("types, and loops over what a call gives", () => {
	it("makes a type alias Declare Type where the file has it, written as it was", () => {
		const src =
			'export type Shot = {\n\tdamage: number, -- per hit\n\tfrom: Vector3,\n}\ntype Id = string\nlocal id: Id = "a"\nprint(id)\n';
		const script = imported(src, "T.luau");
		const types = script.nodes.filter((n) => n.def === "type.declareHere");
		expect(types.map((n) => [n.config?.name, n.config?.export ?? true])).toEqual([
			["Shot", true],
			["Id", false],
		]);
		expect(roundTrip(src, "T.luau")).toEqual(lines(src));
	});

	it("iterates a call's result as the file does", () => {
		const src =
			'for _, child in workspace:GetChildren() do\n\tprint(child)\nend\nfor word in string.gmatch("a b", "%a+") do\n\tprint(word)\nend\n';
		const script = imported(src, "T.server.luau");
		const direct = script.nodes.filter(
			(n) => n.def === "flow.forEach" && n.config?.iterate === "direct",
		);
		expect(direct).toHaveLength(2);
		expect(roundTrip(src, "T.server.luau")).toEqual(lines(src));
	});
});

describe("several names, and assigning with an operator", () => {
	it("makes `local a, b = f()` one call with a result for each name", () => {
		const src =
			'local ok, err = pcall(print, "coins")\nif not ok then\n\twarn(err)\nend\nlocal x, y = workspace.Part.CFrame:ToOrientation()\nprint(x, y)\n';
		const script = imported(src, "T.server.luau");
		const call = script.nodes.find((n) => n.def === "call.function");
		expect(call?.config).toMatchObject({ results: 2, resultNames: ["ok", "err"] });
		expect(script.nodes.find((n) => n.def === "call.method")?.config?.resultNames).toEqual([
			"x",
			"y",
		]);
		expect(roundTrip(src, "T.server.luau")).toEqual(lines(src));
	});

	it("keeps `x += v` as written, on the setter it would be with `=`", () => {
		const src =
			'local score = 0\nlocal total = 1\ntotal += 2\nscore -= total\nworkspace.Part.Transparency += 0.5\nlocal counts = {}\ncounts["hits"] ..= "x"\nprint(score, counts)\n';
		const script = imported(src, "T.server.luau", { locals: "local" });
		expect(script.nodes.filter((n) => n.config?.op).map((n) => [n.def, n.config?.op])).toEqual([
			["local.set", "+="],
			["local.set", "-="],
			["roblox.setProperty", "+="],
			["table.setKey", "..="],
		]);
		expect(roundTrip(src, "T.server.luau", { locals: "local" })).toEqual(lines(src));
	});

	it("keeps a compound assignment to a name it does not know as code", () => {
		const src = "somewhereElse *= 2\n";
		const result = importLuau(src, { name: "T", scriptClass: "Script", target: "roblox" });
		if (!result.ok) throw new Error(result.error);
		expect(result.report.asCode).toEqual([{ construct: "compound assignment", count: 1 }]);
	});
});

describe("the library's own nodes", () => {
	it("makes print and warn Print and Warn, with every value", () => {
		const src = 'local label = "Round"\nprint(label, 3)\nwarn("Not enough coins")\n';
		const script = imported(src, "T.server.luau");
		const print = script.nodes.find((n) => n.def === "debug.print");
		expect(print?.config?.args).toBe(1);
		expect(defsOf(script)).toContain("debug.warn");
		expect(defsOf(script)).not.toContain("call.function");
		expect(roundTrip(src, "T.server.luau")).toEqual(lines(src));
	});

	it("makes a call a local is set to the step it is, written back on one line", () => {
		const src = 'local part = Instance.new("Part")\npart.Parent = workspace\n';
		const script = imported(src, "T.server.luau", { locals: "local" });
		expect(defsOf(script)).toContain("roblox.instanceNew");
		expect(roundTrip(src, "T.server.luau", { locals: "local" })).toEqual(lines(src));
	});

	it("leaves a call alone when the file has its own of that name", () => {
		const src = 'local function print(x: string)\n\twarn(x)\nend\nprint("hi")\n';
		const script = imported(src, "T.server.luau");
		expect(defsOf(script)).not.toContain("debug.print");
		expect(roundTrip(src, "T.server.luau")).toEqual(lines(src));
	});

	it("keeps `function f()` after `local f` as code: it assigns the local, not a new one", () => {
		const src = "local f\nlocal function g()\n\tf()\nend\nfunction f()\n\tprint(1)\nend\ng()\n";
		const script = imported(src, "T.server.luau");
		expect(script.nodes.filter((n) => n.def === "function.declareHere")).toHaveLength(1);
		expect(roundTrip(src, "T.server.luau")).toEqual(lines(src));
	});
});

describe("rows and layout", () => {
	const generated = (code: string) =>
		code
			.split("\n")
			.filter((l) => !l.startsWith("-- "))
			.join("\n")
			.trim();

	it("keeps the file's blank lines", () => {
		const src = "local a = 1\nlocal b = 2\n\nprint(a)\n\nprint(b)\n";
		expect(generated(compiled(imported(src, "T.luau")).code)).toBe(src.trim());
	});

	it("cuts a long run into rows in Tidy, at its blank lines, and not in Verbatim", () => {
		const para = (n: number) =>
			Array.from({ length: 5 }, (_, i) => `print(${n * 10 + i})`).join("\n");
		const src = `${para(1)}\n\n${para(2)}\n\n${para(3)}\n`;
		const tidy = imported(src, "T.luau", { mode: "tidy" });
		const sequence = tidy.nodes.find((n) => n.def === "flow.sequence");
		expect(sequence?.config?.count).toBe(3);
		expect(generated(compiled(tidy).code)).toBe(src.trim());
		const verbatim = imported(src, "T.luau", { mode: "verbatim" });
		expect(verbatim.nodes.some((n) => n.def === "flow.sequence")).toBe(false);
		expect(generated(compiled(verbatim).code)).toBe(src.trim());
	});

	it.each(luauFiles(NATIVE).map((f) => [path.basename(f), f]))(
		"%s lays out with no node over another",
		(name, file) => {
			const script = imported(readFileSync(file, "utf8"), name);
			const graphs = [
				null,
				...script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).map((n) => n.id),
			];
			for (const graph of graphs) {
				const boxes = viewOf(script, graph).nodes.map((n) => ({
					id: n.id,
					...nodeBounds(n, registry, true),
				}));
				for (const [i, a] of boxes.entries()) {
					for (const b of boxes.slice(i + 1)) {
						const overlap =
							a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
						expect(overlap, `${a.id} and ${b.id} in ${graph ?? "the main graph"}`).toBe(false);
					}
				}
			}
		},
	);
});

describe("what the round trip keeps", () => {
	it("keeps the brackets that cut a call to its first value", () => {
		const src = "print((pick()))\nlocal t = {}\nt[1] = (...)\n";
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("keeps a number as it was written", () => {
		const src = "local a = 0.10\nlocal b = 2.0\nlocal c = 3\nprint(a, b, c)\n";
		expect(roundTrip(src)).toEqual(lines(src));
	});

	it("keeps a call a statement when its argument holds a comment or a backtick string", () => {
		const src =
			"local hub = 1\ntable.insert(list, {\n\tjoint = hub, -- the hub's parent\n})\nwarn(`a {hub}` .. `b's`)\n";
		const { code, errors } = compiled(imported(src));
		expect(errors).toEqual([]);
		expect(code).not.toContain("local _rw");
		expect(code).toContain("table.insert(list, {");
	});

	it("starts a statement that opens with a bracket where the last one ended", () => {
		const src = "local s = make()\n;(s :: any).Parent = workspace\n";
		const { code, errors } = compiled(imported(src));
		expect(errors).toEqual([]);
		expect(code).toContain("local s = make()\n;(s :: any).Parent = workspace");
	});
});

describe("the file around it", () => {
	it("takes its script class from the file name", () => {
		expect(graphNameOf("Tank.server.luau")).toEqual({ name: "Tank", scriptClass: "Script" });
		expect(graphNameOf("Input.client.luau")).toEqual({ name: "Input", scriptClass: "LocalScript" });
		expect(graphNameOf("Rig.luau")).toEqual({ name: "Rig", scriptClass: "ModuleScript" });
	});

	it("takes its type checking from the mode line", () => {
		expect(imported("--!strict\nprint(1)\n").typecheck).toBe("strict");
		expect(imported("--!nonstrict\nprint(1)\n").typecheck).toBe("nonstrict");
		expect(imported("print(1)\n").typecheck).toBe("default");
	});

	it("refuses a file that does not parse, saying where", () => {
		const result = importLuau("print(1)\nlocal = 2\n", {
			name: "T",
			scriptClass: "Script",
			target: "roblox",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/^Line 2:/);
	});
});

describe("importing from the project tree", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function session(): Promise<ApiSession> {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-import-"));
		await writeFile(
			path.join(root, "roswaal.json"),
			JSON.stringify({ schemaVersion: 1, format: false }),
		);
		await mkdir(path.join(root, "src/Shared"), { recursive: true });
		await writeFile(path.join(root, "src/Shared/Greeter.luau"), "local G = {}\nreturn G\n");
		const opened = new ApiSession({});
		await opened.openAt(root);
		return opened;
	}

	it("writes the graph where compiling it would write the file back", async () => {
		const api = await session();
		const out = (await api.handle("POST", "/script/import", {
			body: { path: "src/Shared/Greeter.luau" },
		})) as { path: string; report: { statements: number } };
		expect(out.path).toBe(".roswaal/scripts/Shared/Greeter.nodescript");
		expect(out.report.statements).toBe(2);
		expect(await readFile(path.join(root, "src/Shared/Greeter.luau"), "utf8")).toBe(
			"local G = {}\nreturn G\n",
		);
	});

	it("takes the import's settings", async () => {
		const api = await session();
		const out = (await api.handle("POST", "/script/import", {
			body: { path: "src/Shared/Greeter.luau", locals: "local", mode: "verbatim", target: "lune" },
		})) as { script: NodeScript };
		expect(out.script.variables).toEqual([]);
		expect(out.script.target).toBe("lune");
		expect(out.script.nodes.some((n) => n.def === "local.declare")).toBe(true);
	});

	it("never replaces a graph already there", async () => {
		const api = await session();
		await api.handle("POST", "/script/import", { body: { path: "src/Shared/Greeter.luau" } });
		await expect(
			api.handle("POST", "/script/import", { body: { path: "src/Shared/Greeter.luau" } }),
		).rejects.toThrow(/already exists/);
	});

	it("leaves the hand-written file to be taken over with force", async () => {
		const api = await session();
		await api.handle("POST", "/script/import", { body: { path: "src/Shared/Greeter.luau" } });
		const compiledOut = (await api.handle("POST", "/compile", {
			body: { path: ".roswaal/scripts/Shared/Greeter.nodescript", write: true },
		})) as { results: { written: boolean }[] };
		expect(compiledOut.results[0].written).toBe(false);
		expect(await readFile(path.join(root, "src/Shared/Greeter.luau"), "utf8")).toBe(
			"local G = {}\nreturn G\n",
		);
	});

	it("imports over its own import while the file is written by hand", async () => {
		const api = await session();
		await api.handle("POST", "/script/import", { body: { path: "src/Shared/Greeter.luau" } });
		const out = (await api.handle("POST", "/script/import", {
			body: { path: "src/Shared/Greeter.luau", mode: "verbatim", locals: "local", replace: true },
		})) as { script: NodeScript };
		expect(out.script.importedAs).toEqual({ mode: "verbatim", locals: "local" });
		const saved = JSON.parse(
			await readFile(path.join(root, ".roswaal/scripts/Shared/Greeter.nodescript"), "utf8"),
		);
		expect(saved.importedAs).toEqual({ mode: "verbatim", locals: "local" });
	});

	it("marks a file imported already with its graph, for Reimport", async () => {
		const api = await session();
		const find = async () => {
			const { tree } = (await api.handle("GET", "/tree", {})) as { tree: TreeLike[] };
			return flatten(tree).find((e) => e.path === "src/Shared/Greeter.luau");
		};
		expect((await find())?.graph).toBeUndefined();
		await api.handle("POST", "/script/import", { body: { path: "src/Shared/Greeter.luau" } });
		expect((await find())?.graph).toBe(".roswaal/scripts/Shared/Greeter.nodescript");
	});

	it("never imports over a graph not imported, or once compiled over the file", async () => {
		const api = await session();
		const created = (await api.handle("POST", "/script/create", {
			body: { dir: ".roswaal/scripts/Shared", name: "Greeter", scriptClass: "ModuleScript" },
		})) as { path: string };
		expect(created.path).toBe(".roswaal/scripts/Shared/Greeter.nodescript");
		await expect(
			api.handle("POST", "/script/import", {
				body: { path: "src/Shared/Greeter.luau", replace: true },
			}),
		).rejects.toThrow(/was not imported/);

		await rm(path.join(root, created.path));
		await api.handle("POST", "/script/import", { body: { path: "src/Shared/Greeter.luau" } });
		await api.handle("POST", "/compile", {
			body: { path: ".roswaal/scripts/Shared/Greeter.nodescript", write: true, force: true },
		});
		await expect(
			api.handle("POST", "/script/import", {
				body: { path: "src/Shared/Greeter.luau", replace: true },
			}),
		).rejects.toThrow(/is compiled from/);
	});
});

interface TreeLike {
	path: string;
	graph?: string;
	children?: TreeLike[];
}

function flatten(entries: TreeLike[]): TreeLike[] {
	return entries.flatMap((e) => [e, ...flatten(e.children ?? [])]);
}
