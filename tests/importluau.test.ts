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
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
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

function imported(src: string, file = "Test.server.luau"): NodeScript {
	const { name, scriptClass } = graphNameOf(file);
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t" });
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
const roundTrip = (src: string, file?: string) => {
	const { code, errors } = compiled(imported(src, file));
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
	it("a local is a Declare Local, and reading it is a Get Local", () => {
		const src = "--!strict\nlocal speed: number = 16\nprint(speed)\n";
		const script = imported(src);
		expect(defsOf(script)).toContain("local.declare");
		expect(defsOf(script)).toContain("local.get");
		expect(roundTrip(src)).toEqual(["--!strict", "local speed: number = 16", "print(speed)"]);
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
			expect.arrayContaining(["flow.forRange", "flow.forIndex", "flow.while", "local.set"]),
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

describe("what stays as code", () => {
	it("keeps what has no node yet as its own text", () => {
		const src = "type Pair = { a: number }\nlocal x, y = 1, 2\nx += y\n";
		const result = importLuau(src, { name: "T", scriptClass: "Script", target: "roblox" });
		if (!result.ok) throw new Error(result.error);
		expect(result.report.asCode.map((c) => c.construct).sort()).toEqual([
			"compound assignment",
			"local with several names",
			"type",
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
});
