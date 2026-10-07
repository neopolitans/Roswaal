/**
 * The front page's tour, since 0.147.0.
 *
 * Its promise is the landing page's: what it shows is what the editor does.
 * Every hover in it is `hoverAt`'s, every node in its pickers is a real one,
 * and every version badge on the page opens notes that exist. These hold that
 * promise, so a slide cannot drift into showing a tool that is not there.
 */

import { describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { landingPage } from "../scripts/lib/landing.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import * as tourModule from "../scripts/lib/tour.mjs";
import { analyse } from "../src/app/SelectionPreview.js";
import { compile } from "../src/core/compiler/index.js";
import { RELEASES } from "../src/core/docs/releases.js";
import { hoverAt } from "../src/core/luau/hover.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";

const { hoverableCode, releaseHref, SLIDES, TOUR_SCRIPT, welcomeScript } = tourModule;

const html: string = landingPage("9.9.9", { canary: false });
const tour = html.slice(html.indexOf('<section class="landing-sec tour"'));
const tourOnly = tour.slice(0, tour.indexOf("</section>\n\n  <section"));

describe("the tour", () => {
	it("switches between its slides without a script", () => {
		const picks = [
			...tourOnly.matchAll(/<input class="landing-pick" type="radio" name="tour" id="(tour-\d+)"/g),
		];
		expect(picks.length).toBe(SLIDES.length);
		for (const [, id] of picks) expect(tourOnly).toContain(`<label for="${id}">`);
		expect(tourOnly).toContain('id="tour-0" checked');
		expect(html).toContain('#tour-0:checked ~ .tour-stage > [data-slide="0"] { display: grid; }');
	});

	it("carries no script of its own in the page", () => {
		expect(html).not.toMatch(/<script>(?!<\/script>)/);
		expect(TOUR_SCRIPT).toContain('querySelector(".tour")');
	});

	it("lists only nodes the editor has, in both pickers", () => {
		const names = [
			...tourOnly.matchAll(/role="option" data-find="[^"]*" data-name="([^"]+)"/g),
		].map((m) => m[1]);
		expect(names.length).toBeGreaterThan(10);
		const titles = new Set(BUILTIN_NODES.map((def) => def.title));
		for (const name of names) expect(titles.has(name)).toBe(true);
		// Each visual pick has its drawing beside it.
		const hits = tourOnly.match(/class="node-picker-hit[^"]*" data-shot="\d+"/g) ?? [];
		const shots = tourOnly.match(/<div class="tour-shot" data-shot="\d+"/g) ?? [];
		expect(hits.length).toBe(names.length);
		expect(shots.length).toBe(hits.length);
	});

	/** Other names are searched, as the editor searches them: sleep finds Wait. */
	it("searches a node by its other names", () => {
		expect(tourOnly).toMatch(/data-find="wait[^"]*sleep[^"]*" data-name="Wait"/);
	});

	it("draws the menu the docs draw, divided where the editor divides it", () => {
		expect(tourOnly).toContain("Add from Wally…");
		expect(tourOnly).toContain('class="menu menu--list tour-menu" role="menu"');
		const menu = tourOnly.slice(tourOnly.indexOf('class="menu menu--list tour-menu"'));
		expect(
			(menu.slice(0, menu.indexOf("tour-readout")).match(/class="menu-sep"/g) ?? []).length,
		).toBe(2);
	});
});

describe("the tour's preview", () => {
	const registry = createRegistry();
	const script = welcomeScript();
	const compiled = compile(script, registry);
	const buttons = [
		...tourOnly.matchAll(
			/<button type="button" class="tour-node[^"]*" data-node="([^"]+)" data-mine="([^"]*)" data-down="([^"]*)"/g,
		),
	];

	it("previews a graph that compiles", () => {
		expect(compiled.ok).toBe(true);
		expect(compiled.code).toContain("Players.PlayerAdded:Connect(function(player: Player)");
	});

	/** Each node carries what the editor's preview says about it, selected alone. */
	it("lights the lines analyse gives each node", () => {
		expect(buttons.length).toBe(script.nodes.length);
		for (const [, id, mine, down] of buttons) {
			const { rows } = analyse({
				script,
				registry,
				selection: new Set([id]),
				code: compiled.code,
				sourceMap: compiled.sourceMap,
				onClose: () => undefined,
			});
			const lines = (pick: (row: { mine: boolean; downstream: boolean }) => boolean) =>
				rows
					.filter(pick)
					.map((row) => row.line)
					.join(",");
			expect(mine).toBe(lines((row) => row.mine));
			expect(down).toBe(lines((row) => row.downstream));
		}
	});

	/** A pure node's value lands in somebody else's line, and the slide shows which. */
	it("shows where a pure node's value ends up", () => {
		const join = buttons.find(([, id]) => id === "join");
		expect(join?.[2]).toBe("");
		expect(join?.[3]).not.toBe("");
		expect(tourOnly).toMatch(/data-node="join"[^>]*data-pure="Concatenate"/);
	});

	/** Script Start is where the script starts, and says so: not pure, no line lit. */
	it("offers Script Start as an entry, not as a pure node", () => {
		const start = buttons.find(([, id]) => id === "start");
		expect(start?.[2]).toBe("");
		expect(start?.[3]).toBe("");
		expect(tourOnly).toMatch(/data-node="start"[^>]*data-entry="Script Start"/);
		expect(tourOnly).not.toMatch(/data-node="start"[^>]*data-pure=/);
	});

	it("is led to from the example of what Roswaal writes", () => {
		expect(html).toContain('<section class="landing-sec tour" id="tour"');
		const see = html.slice(html.indexOf("See what it writes"), html.indexOf('id="tour"'));
		expect(see).toContain('<p class="landing-bridge">');
		expect(see).toContain('href="#tour"');
		// Brought wholly into view, clear of the floating bar, script or not.
		expect(TOUR_SCRIPT).toContain('a[href="#tour"]');
		expect(html).toContain(".tour { scroll-margin-top:");
	});
});

describe("the cards and the tour", () => {
	/** A card whose part has a slide links up to it, and only to a slide that exists. */
	it("link up to the slide that shows their part", () => {
		const links = [
			...html.matchAll(/<a class="landing-card-tour" href="#tour" data-tour-slide="([^"]+)">/g),
		].map((m) => m[1]);
		expect(links.sort()).toEqual(["list", "preview", "windows"]);
		for (const key of links)
			expect(SLIDES.some((slide: { key: string }) => slide.key === key)).toBe(true);
		expect(TOUR_SCRIPT).toContain("link.dataset.tourSlide");
	});
});

describe("the tour's hovers", () => {
	const source = `local Players = game:GetService("Players")\nlocal stats = Players:FindFirstChild("x")\nlocal n = 0`;

	/** Each hoverable name is asked of hoverAt at its own offset, and gets its answer. */
	it("offers what hoverAt says, and nothing it does not", () => {
		const { html: code, hovers } = hoverableCode(source);
		const at = source.indexOf("FindFirstChild") + 1;
		expect(hovers.map((h: { code: string }) => h.code)).toContain(hoverAt(source, at, true)?.code);
		// `local` is a keyword and `"x"` a string: never wrapped.
		expect(code).not.toMatch(/tour-sym[^>]*><span class="tok-keyword">/);
		expect(code).not.toMatch(/tour-sym[^>]*><span class="tok-string">/);
	});

	it("keeps the code as written", () => {
		const { html: code } = hoverableCode(source);
		const text = code.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"');
		expect(text).toBe(source);
	});

	it("refuses to open a hover on a name hover says nothing about", () => {
		expect(() => hoverableCode(source, "nothingHere")).toThrow(/hover says nothing/);
	});

	it("opens the slides' hovers on the editor's own answers", () => {
		expect(tourOnly).toContain("stats");
		expect(tourOnly).toMatch(/luau-hover-role">local</);
		// Moonwave: the parameters and returns from the doc comment.
		expect(tourOnly).toMatch(/<dt>Parameters<\/dt>/);
		expect(tourOnly).toMatch(/<dt>Returns<\/dt>/);
		expect(tourOnly).toContain('class="tok-meta"');
	});
});

describe("version badges, since 0.147.0", () => {
	/** Every badge on the page opens a release that has notes, on its minor version's page. */
	it("link to the notes of the release they name", () => {
		const badges = [
			...html.matchAll(/<a class="(?:since|tour-since[^"]*)" href="([^"]+)"[^>]*>([^<]+)<\/a>/g),
		];
		expect(badges.length).toBeGreaterThan(SLIDES.length + 8);
		const versions = new Set(RELEASES.map((release) => release.version));
		for (const [, href, version] of badges) {
			expect(versions.has(version)).toBe(true);
			const [major, minor] = version.split(".");
			expect(href).toBe(`docs/release-notes/${major}.${minor}.html#v${version}`);
		}
	});

	it("date each slide, and the releases that built on it", () => {
		for (const slide of SLIDES) {
			expect(tourOnly).toContain(`href="${releaseHref(slide.since)}"`);
			for (const [version] of slide.steps ?? [])
				expect(tourOnly).toContain(`href="${releaseHref(version)}"`);
		}
	});

	it("cannot name a release that has no notes", () => {
		expect(() => releaseHref("0.0.999")).toThrow(/no notes/);
	});
});

/**
 * The four slides added in 0.149.0, each made by the code it shows: so none
 * can offer a completion, write a drop, draw a tree or import a file the way
 * the editor would not.
 */
describe("the slides added in 0.149.0", () => {
	const slideOf = (key: string) => {
		const at = tourOnly.indexOf(`data-key="${key}"`);
		const next = tourOnly.indexOf('<article class="tour-slide"', at + 1);
		return tourOnly.slice(at, next === -1 ? undefined : next);
	};

	it("offers what the editor's completion offers, where it is asked", () => {
		const slide = slideOf("complete");
		const data =
			/<template class="tour-complete-lists">([^<]*)<\/template>/.exec(slide)?.[1] ?? "[]";
		const lists = JSON.parse(data.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as {
			label: string;
		}[][];
		const all = lists.flat().map((option) => option.label);
		expect(all).toContain("Part");
		expect(all).toContain("ReplicatedStorage");
		expect(all).toContain("zero");
		expect(slide).toContain('<span class="cm-completionLabel">Part</span>');
	});

	it("writes a whole local on a blank line, and the path alone in a line", () => {
		const slide = slideOf("drag");
		expect(slide).toContain('aria-label="Drag Workspace.House.Door"');
		expect(slide).toContain('data-whole="local Door = workspace.House.Door"');
		expect(slide).toContain('data-inline="workspace.House.Door"');
		// From the local the code declares, since 0.151.0: Config under Shared,
		// and Shared itself by the name that already holds it.
		expect(slide).toContain('data-whole="local Config = Shared.Config"');
		expect(slide).toContain('aria-label="Drag ReplicatedStorage.Shared" data-whole="Shared"');
		expect((slide.match(/data-whole="/g) ?? []).length).toBe(9);
	});

	it("draws the tree before and after Flux is added", () => {
		const slide = slideOf("wally");
		const before = slide.slice(
			slide.indexOf('tour-wally-before">'),
			slide.indexOf('tour-wally-after">'),
		);
		const after = slide.slice(slide.indexOf('tour-wally-after">'));
		expect(before).not.toContain(">Flux<");
		expect(after).toContain("Flux");
	});

	it("imports the same file in each mode, and only Modern rewrites", () => {
		const slide = slideOf("import");
		const verbatim = slide.slice(
			slide.indexOf('class="tour-import tour-import-verbatim"'),
			slide.indexOf('class="tour-import tour-import-tidy"'),
		);
		const modern = slide.slice(slide.indexOf('class="tour-import tour-import-modern"'));
		expect(verbatim.replace(/<[^>]+>/g, "")).toContain("bonus and &quot;Bonus round&quot; or");
		expect(modern.replace(/<[^>]+>/g, "")).toContain("if bonus then &quot;Bonus round&quot; else");
		expect(slide).toContain("Kept as code: compound assignment ×1.");
	});

	/** A part still being finished says so beside its version, and nowhere is it presented as done. */
	it("marks the import as in progress", () => {
		expect(slideOf("import")).toContain('<span class="tour-status">In progress</span>');
		expect(slideOf("complete")).not.toContain("tour-status");
	});
});
