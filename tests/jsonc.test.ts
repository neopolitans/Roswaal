/**
 * Project files as Rojo reads them now: comments, trailing commas, and the
 * `.project.jsonc` name.
 */

import { describe, expect, it } from "vitest";

import { isProjectFile, parseJsonc } from "../src/core/jsonc.js";
import { parseProject } from "../src/core/rojoImport.js";

describe("a project file with comments", () => {
	const text = `{
	// The game's place.
	"name": "Tank", /* named after the folder */
	"servePlaceIds": [123, 456,],
	"tree": {
		"$className": "DataModel",
		"ReplicatedStorage": { "$path": "src/ReplicatedStorage", },
	},
}`;

	it("reads as the JSON it would be without them", () => {
		expect(parseJsonc(text)).toEqual({
			name: "Tank",
			servePlaceIds: [123, 456],
			tree: { $className: "DataModel", ReplicatedStorage: { $path: "src/ReplicatedStorage" } },
		});
		expect(parseProject(text)).toEqual(parseJsonc(text));
	});

	it("leaves what only looks like a comment or a comma inside a string", () => {
		expect(
			parseJsonc(`{ "url": "https://x.test/a", "glob": "**/*.spec.luau", "s": "a,]" }`),
		).toEqual({
			url: "https://x.test/a",
			glob: "**/*.spec.luau",
			s: "a,]",
		});
		expect(parseJsonc(`{ "quote": "say \\"hi\\" // not a comment" }`)).toEqual({
			quote: 'say "hi" // not a comment',
		});
	});

	it("still refuses what is not JSON at all", () => {
		expect(() => parseJsonc("{ name: Tank }")).toThrow();
		expect(parseProject("{ name: Tank }")).toBeUndefined();
	});
});

describe("a project file's name", () => {
	it("is .project.json or .project.jsonc", () => {
		expect(isProjectFile("default.project.json")).toBe(true);
		expect(isProjectFile("lobby.project.jsonc")).toBe(true);
		expect(isProjectFile("roswaal.json")).toBe(false);
		expect(isProjectFile("project.json")).toBe(false);
	});
});
