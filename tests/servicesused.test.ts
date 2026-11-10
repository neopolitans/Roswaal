/**
 * The services a script reaches, which DataModel lists beside the ones that
 * hold something.
 */

import { describe, expect, it } from "vitest";

import { servicesUsed } from "../src/core/servicesUsed.js";

const of = (source: string) => [...servicesUsed(source)].sort();

describe("the services a script reaches", () => {
	it("reads GetService with either quote, and game.Name", () => {
		expect(
			of(`local Players = game:GetService("Players")
local T = game:GetService('TweenService')
local s = game.ServerStorage
local r = game . ReplicatedFirst`),
		).toEqual(["Players", "ReplicatedFirst", "ServerStorage", "TweenService"]);
	});

	it("counts the workspace global as Workspace", () => {
		expect(of("workspace.Baseplate.Anchored = true")).toEqual(["Workspace"]);
	});

	it("takes only services the engine has", () => {
		expect(of(`game:GetService("NotAService"); game.Name; game.Workspace`)).toEqual(["Workspace"]);
	});

	it("reaches nothing in a script that names no service", () => {
		expect(of("print('hello')")).toEqual([]);
	});
});
