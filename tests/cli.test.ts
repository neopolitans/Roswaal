/**
 * The command line, and the page that describes it.
 *
 * They were two lists: one printed by `roswaal help`, one written out in the
 * README. `--yes` existed in the tool and in neither of them for a release,
 * which is the failure this file exists to stop — the page is generated from
 * the same array the help output prints, and the array is held against the
 * commands the CLI actually answers to.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CLI_COMMANDS, CLI_OPTIONS } from "../src/core/docs/cli.js";
import { blockText, buildSite, findPage, type Block, type DocSite } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { DEFAULT_PORT } from "../src/server/app.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();
const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));
const page = findPage(site, "command-line")!;

describe("the commands the page lists", () => {
	/** The `case` labels in the CLI's own switch, which is what it answers to. */
	const answered = (): string[] => {
		const source = readFileSync(path.join(ROOT, "src/cli/index.ts"), "utf8");
		const main = source.slice(source.indexOf("async function main("));
		return [...main.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]);
	};

	it("are the commands the CLI answers to", () => {
		expect([...CLI_COMMANDS.map((c) => c.name)].sort()).toEqual([...answered()].sort());
	});

	it("reaches the page, every one of them", () => {
		const text = page.blocks.map(blockText).join(" ");
		for (const command of CLI_COMMANDS) expect(text, command.name).toContain(command.name);
	});

	it("reaches the page with every option too", () => {
		const text = page.blocks.map(blockText).join(" ");
		for (const option of CLI_OPTIONS) expect(text, option.flag).toContain(option.flag);
	});

	/**
	 * The port is written out in core, which cannot import the daemon. This is
	 * the other half of that: one line to fix if the default ever moves.
	 */
	it("names the port the daemon actually listens on", () => {
		const port = CLI_OPTIONS.find((o) => o.flag.startsWith("--port"))!;
		expect(port.blurb).toContain(String(DEFAULT_PORT));
	});
});

describe("a page with tabs", () => {
	const block: Block = {
		t: "tabs",
		label: "Definition support",
		tabs: [
			{ id: "designer", title: "Node Designer", blocks: [{ t: "p", text: "A form over a node." }] },
			{ id: "luau", title: "Luau", blocks: [{ t: "p", text: "A table of literals." }] },
		],
	};

	/** A reader searching for text in a tab they have not opened still finds it. */
	it("is searchable through every tab, not only the first", () => {
		expect(blockText(block)).toContain("A table of literals.");
		expect(blockText(block)).toContain("Node Designer");
	});

	it("renders every panel in the static site, and switches with no script", () => {
		const html = renderPage({ sections: [] } as DocSite, {
			slug: "test", title: "Test", summary: "Test", blocks: [block],
		}, { version: "test" });

		expect(html).toContain("A form over a node.");
		expect(html).toContain("A table of literals.");
		expect(html).toContain('type="radio"');
		expect(html).not.toContain("<script>document");
	});
});
