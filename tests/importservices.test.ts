/**
 * Services an import declares (0.184.0; named otherwise, 0.186.0).
 *
 * `local Players = game:GetService("Players")` at the top level of a file
 * becomes one of the script's services rather than a variable: the compiler
 * writes the line itself, first in the file, reads of it are Get Service,
 * and a handler connected to one of its events reads it with Get Event. One
 * named otherwise (`local RS = ...`) keeps its name. A typed one, one
 * assigned again, a second for the same service, or one in a Lune file stays
 * as it was.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, type ImportOptions, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

function imported(
	src: string,
	options: Partial<ImportOptions> = {},
): { script: NodeScript; services: number } {
	const { name, scriptClass } = graphNameOf("Test.server.luau");
	const result = importLuau(src, {
		name,
		scriptClass,
		target: "roblox",
		idPrefix: "t",
		...options,
	});
	if (!result.ok) throw new Error(result.error);
	return { script: result.script, services: result.report.services };
}

function body(script: NodeScript): string {
	return compile(script, registry).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");
}

const defs = (script: NodeScript, def: string) => script.nodes.filter((n) => n.def === def);

describe("a service the file gets", () => {
	const src = [
		'local Players = game:GetService("Players")',
		'local RunService = game:GetService("RunService")',
		"",
		"Players.PlayerAdded:Connect(function(player)",
		"\tprint(player.Name)",
		"end)",
		"",
		"RunService.Heartbeat:Connect(function(dt)",
		"\tprint(dt)",
		"end)",
		"",
		"print(Players)",
		"",
	].join("\n");

	it("is declared on the script, not a variable", () => {
		const { script, services } = imported(src);
		expect(script.services).toEqual(["Players", "RunService"]);
		expect(script.variables.map((v) => v.name)).not.toContain("Players");
		expect(services).toBe(2);
	});

	it("is read with Get Service, and its events with Get Event", () => {
		const { script } = imported(src);
		const events = defs(script, "roblox.getEvent").map((n) => n.literals?.event);
		expect(events).toEqual([
			{ t: "string", v: "PlayerAdded" },
			{ t: "string", v: "Heartbeat" },
		]);
		expect(defs(script, "roblox.getService")).toHaveLength(3);
	});

	it("compiles back to the file", () => {
		for (const mode of ["tidy", "verbatim"] as const)
			expect(body(imported(src, { mode }).script)).toBe(src);
	});
});

describe("a service named otherwise", () => {
	const src = [
		'local Players = game:GetService("Players")',
		'local RS = game:GetService("ReplicatedStorage")',
		"",
		'local remote = RS:WaitForChild("Ping")',
		"print(remote, RS)",
		"",
	].join("\n");

	it("is declared, and keeps the name the file gave it", () => {
		const { script } = imported(src);
		expect(script.services).toEqual(["Players", "ReplicatedStorage"]);
		expect(script.serviceNames).toEqual({ ReplicatedStorage: "RS" });
		expect(script.variables.map((v) => v.name)).toEqual(["remote"]);
	});

	it("compiles back to the file, in its order", () => {
		expect(body(imported(src).script)).toBe(src);
	});
});

describe("a comment on a service line", () => {
	it("is kept in a box of its own above everything else", () => {
		const src = [
			"-- Services",
			'local Players = game:GetService("Players")',
			'local RunService = game:GetService("RunService") -- frame events',
			"",
			"print(Players, RunService)",
			"",
		].join("\n");
		const { script } = imported(src);
		const box = script.comments.find((c) => c.id.endsWith("-services"));
		expect(box?.text).toBe("Services\nframe events");
		const top = Math.min(...script.nodes.filter((n) => !n.graph).map((n) => n.y));
		expect((box?.y ?? 0) + (box?.h ?? 0)).toBeLessThan(top);
		expect(body(script)).toBe(src.replace("-- Services\n", "").replace(" -- frame events", ""));
	});

	it("is written above the services, compiled with comments", () => {
		const src = [
			"-- Services",
			'local Players = game:GetService("Players")',
			"",
			"print(Players)",
			"",
		].join("\n");
		const { code } = compile(imported(src).script, registry, { comments: true });
		expect(code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "")).toBe(src);
	});
});

describe("a service local that stays a variable", () => {
	it("is a second local for a service already declared", () => {
		const src = [
			'local Players = game:GetService("Players")',
			'local P = game:GetService("Players")',
			"",
			"print(Players, P)",
			"",
		].join("\n");
		const { script } = imported(src);
		expect(script.services).toEqual(["Players"]);
		expect(script.variables.map((v) => v.name)).toEqual(["P"]);
		// The declared services are written first, a blank line after them.
		expect(body(script)).toBe(src.replace("\nlocal P", "\n\nlocal P"));
	});

	it("has a type written beside it", () => {
		const { script } = imported('local Players: Players = game:GetService("Players")\n');
		expect(script.services).toBeUndefined();
	});

	it("is assigned again", () => {
		const src = 'local Players = game:GetService("Players")\nPlayers = nil\n';
		const { script } = imported(src);
		expect(script.services).toBeUndefined();
		expect(body(script)).toBe(src);
	});

	it("is in a file with its own game", () => {
		const src = 'local game = {}\nlocal Players = game:GetService("Players")\n';
		expect(imported(src).script.services).toBeUndefined();
	});

	it("is in a Lune file", () => {
		const src = 'local Players = game:GetService("Players")\n';
		expect(imported(src, { target: "lune" }).script.services).toBeUndefined();
	});
});
