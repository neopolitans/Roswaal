/**
 * `.luaurc` alias maps.
 *
 * Every case here is a sentence from [the RFC][rfc] turned into a fact: the
 * inheritance rule, the relative-path rule, case-insensitivity, the name
 * charset, chains and cycles. They are held as tests because each one is a
 * behaviour nobody would notice was wrong until a require failed in a runtime,
 * by which time the graph looks like the problem and is not.
 *
 * [rfc]: https://rfcs.luau.org/require-by-string-aliases.html
 */

import { describe, expect, it } from "vitest";

import {
	aliasesOf, aliasNameOf, lookupAlias, parseLuaurc, resolveSpecifier,
	type LuaurcChain,
} from "../src/core/luaurc.js";
import { checkSpecifier } from "../src/core/modules.js";

/** A chain, written the way a caller builds one: nearest directory first. */
function chain(...files: [dir: string, text: string][]): LuaurcChain {
	return files.map(([dir, text]) => parseLuaurc(dir, text));
}

const json = (aliases: Record<string, string>) => JSON.stringify({ aliases });

describe("reading one", () => {
	it("takes the aliases and leaves everything else alone", () => {
		const file = parseLuaurc("", JSON.stringify({
			languageMode: "strict",
			aliases: { roact: "./Packages/Roact" },
		}));
		expect(file.problems).toEqual([]);
		expect(file.aliases.get("roact")?.value).toBe("./Packages/Roact");
	});

	/**
	 * Not in the RFC, which says only "a JSON-like syntax". A tolerance rather
	 * than a claim -- but a file with a comment in it is a file people write,
	 * and refusing it would be refusing the project rather than the file.
	 */
	it("tolerates comments and a trailing comma", () => {
		const file = parseLuaurc("", [
			"{",
			'  // what the UI code is built on',
			'  "aliases": {',
			'    "roact": "./Packages/Roact", /* vendored */',
			"  },",
			"}",
		].join("\n"));
		expect(file.problems).toEqual([]);
		expect(file.aliases.get("roact")?.value).toBe("./Packages/Roact");
	});

	/** A `//` inside a string is a path, not a comment. */
	it("does not eat a comment marker inside a string", () => {
		const file = parseLuaurc("", json({ cdn: "https://example.test/pkg" }));
		expect(file.problems).toEqual([]);
		expect(file.aliases.get("cdn")?.value).toBe("https://example.test/pkg");
	});

	/**
	 * A file being edited is a normal state to find one in, so a broken file is
	 * a problem reported on it rather than an exception somewhere else.
	 */
	it("reports a file that does not parse, and contributes nothing", () => {
		const file = parseLuaurc("", '{ "aliases": { "a": ');
		expect(file.problems[0].severity).toBe("error");
		expect(file.aliases.size).toBe(0);
	});

	it("refuses a name outside the RFC's charset", () => {
		const file = parseLuaurc("", json({ "my/pkg": "./x", "ok.name-1_2": "./y" }));
		expect(file.aliases.has("my/pkg")).toBe(false);
		expect(file.aliases.has("ok.name-1_2")).toBe(true);
		expect(file.problems[0].alias).toBe("my/pkg");
		expect(file.problems[0].message).toContain("cannot contain");
	});

	/** Names are case-insensitive, so this is one name bound twice. */
	it("reports two spellings of one name in one file", () => {
		const file = parseLuaurc("", json({ Roact: "./a", roact: "./b" }));
		expect(file.problems).toHaveLength(1);
		expect(file.problems[0].message).toContain("same alias");
		// The first stands: only the developer knows which was meant, and
		// dropping both would take away an alias that does resolve.
		expect(file.aliases.get("roact")?.value).toBe("./a");
	});

	it("keeps the name as it was written", () => {
		const file = parseLuaurc("", json({ MyPkg: "./x" }));
		expect(file.aliases.get("mypkg")?.name).toBe("MyPkg");
	});
});

describe("inheriting up the tree", () => {
	/**
	 * "Missing aliases in `.luaurc` are inherited from the alias maps of any
	 * parent directories, and fields can be overridden."
	 *
	 * The trap this guards is treating the nearest file as *the* map, which
	 * looks right in every project that has only one.
	 */
	it("inherits what the nearer file does not say", () => {
		const files = chain(
			["src/ui", json({ roact: "./vendor/Roact" })],
			["", json({ roact: "./Packages/Roact", shared: "./Shared" })],
		);
		const all = aliasesOf(files);
		expect(all.get("shared")?.from).toBe("");
		expect(all.get("roact")?.from).toBe("src/ui");
	});

	it("lets a nearer file override one name without taking the rest", () => {
		const files = chain(
			["src", json({ a: "./near" })],
			["", json({ a: "./far", b: "./far-b" })],
		);
		expect(lookupAlias(files, "a")).toMatchObject({ t: "found", alias: { path: "src/near" } });
		expect(lookupAlias(files, "b")).toMatchObject({ t: "found", alias: { path: "far-b" } });
	});

	it("matches a name regardless of case, in either file", () => {
		const files = chain(["", json({ Roact: "./Packages/Roact" })]);
		for (const spelling of ["roact", "Roact", "ROACT", "rOaCt"]) {
			expect(lookupAlias(files, spelling), spelling).toMatchObject({ t: "found" });
		}
	});
});

describe("where a relative value lands", () => {
	/**
	 * "If an alias is bound to a relative path, the path will be evaluated
	 * relative to the `.luaurc` file in which the alias was defined."
	 *
	 * The bug this prevents is invisible in every project where the graph
	 * happens to sit beside the `.luaurc`, which is most of them.
	 */
	it("resolves against the file that defined it, not the nearest one", () => {
		const files = chain(
			["src/ui/panels", json({ near: "./x" })],
			["", json({ far: "./Packages/Thing" })],
		);
		expect(lookupAlias(files, "far")).toMatchObject({
			t: "found", alias: { path: "Packages/Thing", from: "" },
		});
		expect(lookupAlias(files, "near")).toMatchObject({
			t: "found", alias: { path: "src/ui/panels/x" },
		});
	});

	it("walks `..` out of the defining directory", () => {
		const files = chain(["src/ui", json({ shared: "../shared/lib" })]);
		expect(lookupAlias(files, "shared")).toMatchObject({
			t: "found", alias: { path: "src/shared/lib" },
		});
	});

	/** An absolute value already names a place, so nothing is prepended to it. */
	it("leaves an absolute value alone", () => {
		const files = chain(["src", json({ vendor: "/opt/luau/vendor" })]);
		expect(lookupAlias(files, "vendor")).toMatchObject({
			t: "found", alias: { path: "/opt/luau/vendor" },
		});
	});
});

describe("chains", () => {
	/** "This search continues iteratively if a chain of aliases must be resolved." */
	it("follows an alias bound to another alias", () => {
		const files = chain(["", json({ ui: "@roact", roact: "./Packages/Roact" })]);
		expect(lookupAlias(files, "ui")).toMatchObject({
			t: "found",
			// The definition is what the file says; the path is what it means.
			alias: { name: "ui", value: "@roact", path: "Packages/Roact" },
		});
	});

	it("keeps the tail of an aliased value", () => {
		const files = chain(["", json({ comp: "@roact/Component", roact: "./Packages/Roact" })]);
		expect(lookupAlias(files, "comp")).toMatchObject({
			t: "found", alias: { path: "Packages/Roact/Component" },
		});
	});

	/** Each link resolves against its own file, not against the first one's. */
	it("resolves every link against the file that defined that link", () => {
		const files = chain(
			["src", json({ ui: "@widgets" })],
			["", json({ widgets: "./Packages/Widgets" })],
		);
		expect(lookupAlias(files, "ui")).toMatchObject({
			t: "found", alias: { path: "Packages/Widgets" },
		});
	});

	/** "If a cycle is detected, alias resolution will fail with an error." */
	it("reports a cycle as the ring it walked", () => {
		const files = chain(["", json({ a: "@b", b: "@c", c: "@a" })]);
		const found = lookupAlias(files, "a");
		expect(found.t).toBe("cycle");
		expect(found.t === "cycle" && found.names).toEqual(["a", "b", "c", "a"]);
	});

	it("reports an alias that points at one nothing defines", () => {
		const files = chain(["", json({ a: "@nowhere" })]);
		expect(lookupAlias(files, "a")).toMatchObject({ t: "missing", name: "nowhere" });
	});

	it("reports a name nothing defines", () => {
		expect(lookupAlias(chain(["", json({})]), "roact"))
			.toMatchObject({ t: "missing", name: "roact" });
	});
});

describe("a whole specifier", () => {
	const files = chain(["", json({ roact: "./Packages/Roact" })]);

	it("puts what follows the alias on the end of its path", () => {
		expect(resolveSpecifier(files, "@roact/Component/init"))
			.toMatchObject({ t: "found", alias: { path: "Packages/Roact/Component/init" } });
	});

	it("is the alias itself when there is nothing after it", () => {
		expect(resolveSpecifier(files, "@roact"))
			.toMatchObject({ t: "found", alias: { path: "Packages/Roact" } });
	});

	it("reads the alias out of a specifier, and nothing out of a path", () => {
		expect(aliasNameOf("@roact/Component")).toBe("roact");
		expect(aliasNameOf("@roact")).toBe("roact");
		expect(aliasNameOf("./Config")).toBeNull();
		expect(aliasNameOf("../shared/Config")).toBeNull();
		expect(aliasNameOf("@")).toBe("");
	});
});

/**
 * What the alias map lets the specifier check say that it could not before.
 *
 * The distinction worth holding is between the two ways an alias can be
 * unknown. A project with a `.luaurc` that does not name it has a typo, and
 * that is an error. A project with no `.luaurc` at all may have one generated
 * at build time, or outside the root we can see — and refusing to compile that
 * would be refusing a project that builds.
 */
describe("checking a specifier against the map", () => {
	const defined = chain(["", json({ roact: "./Packages/Roact" })]);
	const empty = chain(["", json({})]);

	it("says nothing about an alias the project defines", () => {
		expect(checkSpecifier("@roact/Component", "lune", { luaurc: defined, hasLuaurc: true }))
			.toBeNull();
	});

	it("matches the definition regardless of case", () => {
		expect(checkSpecifier("@Roact", "lune", { luaurc: defined, hasLuaurc: true })).toBeNull();
	});

	it("is an error when a `.luaurc` is there and does not name it", () => {
		const found = checkSpecifier("@raoct", "lune", { luaurc: empty, hasLuaurc: true });
		expect(found?.severity).toBe("error");
		expect(found?.message).toContain("@raoct");
	});

	it("is a warning when the project has no `.luaurc` at all", () => {
		const found = checkSpecifier("@roact", "lune", { luaurc: [], hasLuaurc: false });
		expect(found?.severity).toBe("warning");
		expect(found?.message).toContain("generated at build time");
	});

	/** Without a chain this module has no business having an opinion. */
	it("keeps its old answers when nobody has said what the project defines", () => {
		expect(checkSpecifier("@roact", "lune")).toBeNull();
	});

	/** Lune's own library is not in anybody's `.luaurc`. */
	it("never asks the map about `@lune`", () => {
		expect(checkSpecifier("@lune/fs", "lune", { luaurc: empty, hasLuaurc: true })).toBeNull();
	});

	/**
	 * Under Roblox a defined alias is still the "not yet" warning -- but an
	 * undefined one is a typo, and sending somebody to read about engine
	 * support for a name they misspelled helps nobody.
	 */
	it("tells a Roblox typo apart from a Roblox limitation", () => {
		const real = checkSpecifier("@roact", "roblox", { luaurc: defined, hasLuaurc: true });
		expect(real?.severity).toBe("warning");
		expect(real?.message).toContain("does not resolve");

		const typo = checkSpecifier("@raoct", "roblox", { luaurc: defined, hasLuaurc: true });
		expect(typo?.severity).toBe("error");
		expect(typo?.message).toContain("Check the spelling");
	});

	/** `@self` and `@game` are the engine's and are in no alias map. */
	it("leaves Roblox's own prefixes alone", () => {
		for (const specifier of ["@self/Child", "@game/ReplicatedStorage"]) {
			expect(checkSpecifier(specifier, "roblox", { luaurc: empty, hasLuaurc: true }), specifier)
				.toBeNull();
		}
	});
});
