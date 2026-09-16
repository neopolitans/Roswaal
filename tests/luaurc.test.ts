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
	aliasesOf, aliasNameOf, chainFor, lookupAlias, parseLuaurc, resolveSpecifier, withAliases,
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

/**
 * Which files apply to one script.
 *
 * Arithmetic rather than a walk of the disk: every `.luaurc` is read once and
 * the chain for a file is a slice of that, which is what makes asking on every
 * keystroke free.
 */
describe("the chain for a file", () => {
	const files = [
		parseLuaurc("", json({ root: "./r" })),
		parseLuaurc("src", json({ mid: "./m" })),
		parseLuaurc("src/ui", json({ near: "./n" })),
		parseLuaurc("other", json({ elsewhere: "./e" })),
	];

	it("is the file's own directory first, then upwards", () => {
		const chain = chainFor(files, "src/ui/Panel.nodescript");
		expect(chain.map((file) => file.dir)).toEqual(["src/ui", "src", ""]);
	});

	it("leaves out a sibling branch", () => {
		const chain = chainFor(files, "src/ui/Panel.nodescript");
		expect(aliasesOf(chain).has("elsewhere")).toBe(false);
	});

	it("skips directories with no file of their own", () => {
		expect(chainFor(files, "src/ui/deep/er/Panel.nodescript").map((f) => f.dir))
			.toEqual(["src/ui", "src", ""]);
	});

	it("is the root alone for a file at the top", () => {
		expect(chainFor(files, "Main.nodescript").map((file) => file.dir)).toEqual([""]);
	});

	/** A path off a Windows filesystem still names the same directories. */
	it("reads a backslash path the same way", () => {
		expect(chainFor(files, "src\\ui\\Panel.nodescript").map((f) => f.dir))
			.toEqual(["src/ui", "src", ""]);
	});
});

/**
 * Changing one, without changing anything else.
 *
 * A `.luaurc` is the developer's file. It carries `languageMode`, lint
 * settings, fields we have never heard of and comments explaining why a
 * package is vendored — so the edit splices the aliases object rather than
 * rewriting the file from the parts we understood. What cannot be kept is
 * refused rather than dropped quietly.
 */
describe("writing one", () => {
	const aliases = [{ name: "roact", value: "./Packages/Roact" }];

	it("keeps every other field exactly", () => {
		const before = [
			"{",
			'	"languageMode": "strict",',
			'	"lint": { "*": true },',
			'	"aliases": { "old": "./x" }',
			"}",
		].join("\n");
		const after = withAliases(before, aliases);
		expect(after.t).toBe("text");
		const text = after.t === "text" ? after.text : "";
		expect(text).toContain('"languageMode": "strict"');
		expect(text).toContain('"lint": { "*": true }');
		expect(text).toContain('"roact": "./Packages/Roact"');
		expect(text).not.toContain('"old"');
		// And it is still a file the reader can read back.
		expect(parseLuaurc("", text).aliases.get("roact")?.value).toBe("./Packages/Roact");
	});

	it("keeps a comment that is not inside the aliases", () => {
		const before = [
			"{",
			"	// strict everywhere, on purpose",
			'	"languageMode": "strict",',
			'	"aliases": {}',
			"}",
		].join("\n");
		const after = withAliases(before, aliases);
		expect(after.t === "text" && after.text).toContain("// strict everywhere, on purpose");
	});

	/**
	 * The one case worth refusing. An edit reorders and rewrites the members,
	 * so a note about why a package is vendored cannot survive it — and losing
	 * somebody's note without saying so is worse than asking for a hand edit.
	 */
	it("refuses when there are comments inside the aliases", () => {
		const before = [
			"{",
			'	"aliases": {',
			"		// vendored until the fork lands upstream",
			'		"roact": "./vendor/Roact"',
			"	}",
			"}",
		].join("\n");
		const after = withAliases(before, aliases);
		expect(after.t).toBe("refused");
		expect(after.t === "refused" && after.why).toContain("by hand");
	});

	it("refuses a file it cannot read", () => {
		expect(withAliases('{ "aliases": ', aliases).t).toBe("refused");
	});

	it("adds the field to a file that has no aliases at all", () => {
		const after = withAliases('{\n\t"languageMode": "strict"\n}', aliases);
		expect(after.t).toBe("text");
		const text = after.t === "text" ? after.text : "";
		expect(parseLuaurc("", text).aliases.get("roact")?.value).toBe("./Packages/Roact");
		expect(text).toContain("languageMode");
	});

	it("writes a whole file when there was none", () => {
		const after = withAliases("", aliases);
		expect(after.t === "text" && parseLuaurc("", after.text).aliases.size).toBe(1);
	});

	it("writes an empty object when the last alias goes", () => {
		const after = withAliases('{ "aliases": { "a": "./x" } }', []);
		expect(after.t === "text" && parseLuaurc("", after.text).aliases.size).toBe(0);
	});

	/** `aliases` inside some other field is somebody else's field. */
	it("only touches the top-level aliases", () => {
		const before =
			'{\n\t"lint": { "aliases": { "nested": "./no" } },\n\t"aliases": {}\n}';
		const after = withAliases(before, aliases);
		const text = after.t === "text" ? after.text : "";
		expect(text).toContain('"nested": "./no"');
		expect(parseLuaurc("", text).aliases.get("roact")).toBeDefined();
	});
});
