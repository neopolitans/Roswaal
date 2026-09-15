/**
 * A graph's name, and the file it therefore writes.
 *
 * `outputFileName` derives the generated `.luau` from the graph's **own** name,
 * not from the file the graph is stored in. That is fine as long as the two
 * agree, and they were set from one string when a graph was created — but
 * renaming the file was `fs.rename` and nothing else, so they drifted:
 *
 *  - `Greeter.nodescript` renamed to `Hello.nodescript` went on compiling to
 *    `Greeter.luau`, and nothing anywhere said so.
 *  - Two graphs both named `Greeter` compiled to one file. The second
 *    overwrote the first and the compile reported `wrote` for both — a
 *    1202-graph project cheerfully said "1202 of 1202 written" while 1200 of
 *    them were the same file, which is how this was found.
 *
 * Both halves are pure functions so they can be checked without a filesystem,
 * the same way the daemon's other decisions are.
 */

import { describe, expect, it } from "vitest";

import { graphName, graphNameFor, outputCollision } from "../src/server/project.js";
import { outputFileName } from "../src/core/compiler/index.js";
import type { NodeScript } from "../src/core/schema.js";

/** Only the four fields `outputFileName` reads. */
function script(over: Partial<NodeScript> = {}): NodeScript {
	return {
		name: "Greeter",
		scriptClass: "Script",
		target: "roblox",
		...over,
	} as NodeScript;
}

describe("a graph's name", () => {
	it("keeps what a file name can carry", () => {
		expect(graphName("Greeter")).toBe("Greeter");
		expect(graphName("Player_Controller")).toBe("Player_Controller");
		expect(graphName("Combat Utils")).toBe("Combat Utils");
		expect(graphName("enemy-ai")).toBe("enemy-ai");
	});

	/**
	 * Renaming used a far looser filter than creating did, so a rename could
	 * produce a file whose name would have been rejected at creation. One
	 * function now decides for both.
	 */
	it("drops what creating a graph would have dropped", () => {
		expect(graphName("Greeter.v2")).toBe("Greeterv2");
		expect(graphName("na/me")).toBe("name");
		expect(graphName("  padded  ")).toBe("padded");
	});

	/**
	 * The caller decides the fallback, because creating and renaming want
	 * different ones: a new graph becomes "Untitled", a renamed one keeps the
	 * name it had rather than being retitled behind the developer's back.
	 */
	it("returns nothing when nothing survives, rather than inventing a name", () => {
		expect(graphName("...")).toBe("");
		expect(graphName("   ")).toBe("");
	});
});

describe("what a graph compiles to", () => {
	/** The reason the two names have to agree: this reads one of them. */
	it("comes from the graph's name and its class", () => {
		expect(outputFileName(script())).toBe("Greeter.server.luau");
		expect(outputFileName(script({ scriptClass: "ModuleScript" }))).toBe("Greeter.luau");
		expect(outputFileName(script({ scriptClass: "LocalScript" }))).toBe("Greeter.client.luau");
		expect(outputFileName(script({ target: "lune" }))).toBe("Greeter.luau");
	});

	it("follows a renamed graph, once the rename updates it", () => {
		expect(outputFileName(script({ name: "Hello" }))).toBe("Hello.server.luau");
	});
});

describe("two graphs claiming one output file", () => {
	const OUT = "src/ReplicatedStorage/Shared/Greeter.luau";

	it("lets the first graph through", () => {
		expect(outputCollision(new Map(), OUT, "a.nodescript")).toBeNull();
	});

	it("names the graph that got there first", () => {
		const claimed = new Map([[OUT, "scripts/Greeter.nodescript"]]);
		expect(outputCollision(claimed, OUT, "scripts/Copy.nodescript"))
			.toBe("scripts/Greeter.nodescript");
	});

	/**
	 * Recompiling the same graph is not a collision with itself. Without this
	 * the second compile of any project would refuse every file it wrote in the
	 * first.
	 */
	it("does not collide a graph with itself", () => {
		const claimed = new Map([[OUT, "scripts/Greeter.nodescript"]]);
		expect(outputCollision(claimed, OUT, "scripts/Greeter.nodescript")).toBeNull();
	});

	it("has no opinion when nothing is tracking claims", () => {
		// A single-file compile passes no map: there is no walk to collide within.
		expect(outputCollision(undefined, OUT, "scripts/Greeter.nodescript")).toBeNull();
	});

	it("separates graphs that differ only by class", () => {
		// Greeter as a ModuleScript and as a Script are different files, so both
		// may be written. Only the resolved path is what gets claimed.
		const claimed = new Map<string, string>();
		const asModule = outputFileName(script({ scriptClass: "ModuleScript" }));
		const asScript = outputFileName(script({ scriptClass: "Script" }));
		expect(asModule).not.toBe(asScript);
		claimed.set(asModule, "a.nodescript");
		expect(outputCollision(claimed, asScript, "b.nodescript")).toBeNull();
	});
});

/**
 * The path wins.
 *
 * 0.13.0 kept the graph's stored name in step by having `renameEntry` rewrite
 * it. That works, but leaves the invariant depending on every future code path
 * remembering to maintain it — and on the rename going through Roswaal at all,
 * which it does not when somebody uses a file manager, `git mv`, or a branch
 * switch. Deriving the name from the path when the graph is read means there is
 * nothing to remember and nothing to route around.
 *
 * It also matches Rojo, which takes an instance's name from the file name and
 * never from anything inside the file.
 */
describe("the name a graph gets from where it lives", () => {
	it("is the file name, without the extension", () => {
		expect(graphNameFor("scripts/Shared/Greeter.nodescript")).toBe("Greeter");
		expect(graphNameFor(".roswaal/scripts/A/B/Player_Controller.nodescript"))
			.toBe("Player_Controller");
	});

	it("takes a rename made outside Roswaal, which is the point", () => {
		// A file manager, `git mv`, or a branch switch. None of them run our
		// rename, and all of them used to leave the output name behind.
		expect(graphNameFor("scripts/Hello.nodescript")).toBe("Hello");
	});

	it("sanitises what a file name may hold and a graph name may not", () => {
		expect(graphNameFor("scripts/Greeter.v2.nodescript")).toBe("Greeterv2");
	});

	/**
	 * Nothing survives sanitising, so the stored name is kept instead. Deriving
	 * "" here would compile the graph to a file called `.luau`.
	 */
	it("gives nothing back rather than an empty name", () => {
		expect(graphNameFor("scripts/....nodescript")).toBe("");
	});

	/**
	 * Windows paths reach the daemon too; the separator must not survive.
	 *
	 * Asserted against the forward-slash spelling as well as against the answer,
	 * because the first form of this test passed on Windows for the wrong
	 * reason: the separator was stripped by splitting on `path.sep`, which *is*
	 * a backslash there. On Linux it survived, and the graph came out called
	 * `scriptsSharedGreeter`. The two spellings agreeing is the actual
	 * requirement, and it cannot be satisfied by accident on either platform.
	 */
	it("reads a backslash path the same as a forward-slash one", () => {
		expect(graphNameFor("scripts\\Shared\\Greeter.nodescript")).toBe("Greeter");
		expect(graphNameFor("scripts\\Shared\\Greeter.nodescript"))
			.toBe(graphNameFor("scripts/Shared/Greeter.nodescript"));
		expect(graphNameFor("a\\b/c\\Player_Controller.nodescript")).toBe("Player_Controller");
	});
});
