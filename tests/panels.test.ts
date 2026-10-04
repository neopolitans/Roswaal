/**
 * The dock layout: sizing, clamping, and reading a stored one back.
 *
 * All of `panels.ts` is pure, which is the point of it being a separate file
 * from `Workspace.tsx` — the arithmetic that decides whether the editor is
 * usable can be checked without rendering anything, and it is arithmetic where
 * being wrong is expensive: a layout restored from a wider monitor that leaves
 * no centre pane puts the splitter that would fix it off screen, and survives a
 * reload.
 *
 * What this cannot check is whether the grid *draws* correctly. That needs a
 * DOM, and `docs/PANELS.md` records it as the eventual job for a headless
 * browser — the failure Beako hit had entirely correct state.
 */

import { describe, expect, it } from "vitest";

import {
	cardsIn,
	clampLayout,
	closePanel,
	DEFAULT_FRAME,
	DEFAULT_LAYOUT,
	dockVisible,
	dropCard,
	dropZone,
	floatingCards,
	floatingPanels,
	floatPanel,
	foldCard,
	framePanel,
	gridTemplate,
	type Layout,
	MIN_DOCK,
	MIN_FLOAT,
	maxDockSize,
	movePanel,
	panelsIn,
	readLayout,
	reopenPanel,
	resizeDock,
	separate,
	shareHeight,
	toggleDock,
} from "../src/app/panels.js";

/** A copy, so a test that moves a panel cannot move it for the next one. */
const base = (): Layout => JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as Layout;

const WIDE = { w: 1920, h: 1080 };

describe("what is in a dock", () => {
	it("starts where the editor already looked", () => {
		expect(panelsIn(base(), "left")).toEqual(["tree", "variables"]);
		expect(panelsIn(base(), "right")).toEqual(["inspector", "properties"]);
		expect(panelsIn(base(), "bottom")).toEqual(["analysis"]);
	});

	it("leaves out a closed panel", () => {
		const layout = base();
		layout.panels.variables.open = false;
		expect(panelsIn(layout, "left")).toEqual(["tree"]);
	});

	/**
	 * A dock with nothing in it has to be genuinely absent rather than
	 * zero-sized: a zero-width track still draws its border, which reads as a
	 * rendering fault rather than as an empty dock.
	 */
	it("hides a dock once its last panel closes", () => {
		const layout = base();
		expect(dockVisible(layout, "right")).toBe(true);
		layout.panels.inspector.open = false;
		layout.panels.properties.open = false;
		expect(dockVisible(layout, "right")).toBe(false);
	});

	it("hides a dock that was collapsed, whatever its panels say", () => {
		const layout = toggleDock(base(), "left");
		expect(dockVisible(layout, "left")).toBe(false);
		expect(panelsIn(layout, "left"), "the panels are still in it").toEqual(["tree", "variables"]);
	});

	it("brings a collapsed dock back", () => {
		expect(dockVisible(toggleDock(toggleDock(base(), "left"), "left"), "left")).toBe(true);
	});
});

describe("the grid tracks", () => {
	/**
	 * The trap this guards is Beako's: a grid item's automatic minimum size is
	 * its *content*, so a dock holding one long path refuses to shrink below the
	 * width of that path and its splitter drags outwards but never back.
	 */
	it("makes every dock track shrinkable", () => {
		const { columns } = gridTemplate(base());
		// `minmax(0, 260px)` has a space in it, so tracks are matched rather than
		// split apart.
		const tracks = columns.match(/minmax\([^)]*\)|\S+/g) ?? [];
		const sized = tracks.filter((t) => /\d+px/.test(t) && t !== "5px" && t !== "0px");

		expect(sized.length, "there are sized dock tracks to check").toBeGreaterThan(0);
		for (const track of sized) {
			expect(track, `${track} can refuse to shrink below its content`).toContain("minmax(0,");
		}
	});

	it("gives the centre the rest", () => {
		expect(gridTemplate(base()).columns).toContain("minmax(0, 1fr)");
	});

	it("collapses a hidden dock's track and its splitter to nothing", () => {
		const layout = base();
		layout.panels.inspector.open = false;
		layout.panels.properties.open = false;
		const { columns } = gridTemplate(layout);
		// left, its splitter, centre, the right splitter, right.
		expect(columns.split(" ").slice(-2).join(" ")).toBe("0px 0px");
	});
});

describe("resizing", () => {
	it("takes the size it is given", () => {
		const layout = resizeDock(base(), "left", 400, WIDE.w, WIDE.h);
		expect(layout.docks.left.size).toBe(400);
	});

	it("refuses to go below a usable width", () => {
		expect(resizeDock(base(), "left", 10, WIDE.w, WIDE.h).docks.left.size).toBe(MIN_DOCK);
	});

	/**
	 * The centre's share is what makes the editor usable, and it is also where
	 * the splitters live — so a dock allowed to take everything would remove the
	 * only way of getting the space back.
	 */
	it("never leaves the centre without room", () => {
		const layout = resizeDock(base(), "left", 99_999, WIDE.w, WIDE.h);
		const centre = WIDE.w - layout.docks.left.size - layout.docks.right.size;
		expect(centre).toBeGreaterThanOrEqual(320);
	});

	it("counts the opposite dock when deciding how far one may go", () => {
		const both = base();
		const alone = base();
		alone.panels.inspector.open = false;
		alone.panels.properties.open = false;
		expect(maxDockSize(alone, "left", WIDE.w, WIDE.h)).toBeGreaterThan(
			maxDockSize(both, "left", WIDE.w, WIDE.h),
		);
	});

	it("changes only the dock that was dragged", () => {
		const layout = resizeDock(base(), "left", 400, WIDE.w, WIDE.h);
		expect(layout.docks.right).toEqual(DEFAULT_LAYOUT.docks.right);
		expect(layout.panels).toEqual(DEFAULT_LAYOUT.panels);
	});
});

describe("clamping to the window", () => {
	/**
	 * The failure this exists for. A layout stored on a 3440px monitor and
	 * restored on a 1280px laptop can leave the centre at nothing, and the
	 * splitters that would fix it are then off the edge of the screen — a state
	 * the editor cannot be got out of, and one that survives a reload.
	 */
	it("keeps the centre alive on a much narrower window", () => {
		const wide = base();
		wide.docks.left.size = 900;
		wide.docks.right.size = 900;

		const narrow = clampLayout(wide, 1280, 800);
		const centre = 1280 - narrow.docks.left.size - narrow.docks.right.size;
		expect(centre).toBeGreaterThanOrEqual(320);
	});

	it("gives up space proportionally rather than emptying one side", () => {
		const layout = base();
		layout.docks.left.size = 600;
		layout.docks.right.size = 300;

		const clamped = clampLayout(layout, 1000, 800);
		expect(clamped.docks.left.size).toBeGreaterThan(clamped.docks.right.size);
	});

	it("leaves a layout that already fits completely alone", () => {
		expect(clampLayout(base(), WIDE.w, WIDE.h)).toEqual(base());
	});

	it("caps the bottom dock against the window's height", () => {
		const layout = base();
		layout.docks.bottom.size = 900;
		expect(clampLayout(layout, WIDE.w, 600).docks.bottom.size).toBeLessThanOrEqual(600 - 320);
	});
});

describe("reading a stored layout", () => {
	it("returns the default for nothing, or for rubbish", () => {
		expect(readLayout(undefined)).toEqual(DEFAULT_LAYOUT);
		expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
		expect(readLayout("a layout, honestly")).toEqual(DEFAULT_LAYOUT);
		expect(readLayout(42)).toEqual(DEFAULT_LAYOUT);
	});

	it("keeps what somebody arranged", () => {
		const stored = base();
		stored.panels.inspector.dock = "left";
		stored.docks.left.size = 380;
		const read = readLayout(stored);
		expect(read.panels.inspector.dock).toBe("left");
		expect(read.docks.left.size).toBe(380);
	});

	/**
	 * Field by field rather than all or nothing. A layout written by an older
	 * version should lose only the part it got wrong — throwing the whole thing
	 * away silently resets an arrangement somebody built, for the sake of one
	 * bad number.
	 */
	it("defaults only the fields that are wrong", () => {
		const read = readLayout({
			panels: { tree: { dock: "nowhere", open: "yes", order: 0 } },
			docks: { left: { size: 12, open: true } },
		});
		expect(read.panels.tree.dock, "an invented dock").toBe(DEFAULT_LAYOUT.panels.tree.dock);
		expect(read.panels.tree.open, "a string where a boolean goes").toBe(true);
		expect(read.docks.left.size, "a size below the minimum").toBe(DEFAULT_LAYOUT.docks.left.size);
		expect(read.panels.inspector, "a panel the stored layout never mentioned").toEqual(
			DEFAULT_LAYOUT.panels.inspector,
		);
	});

	it("survives a panel that no longer exists", () => {
		const read = readLayout({ panels: { ghost: { dock: "left", open: true, order: 9 } } });
		expect(read).toEqual(DEFAULT_LAYOUT);
	});
});

/**
 * ## Where a drop lands
 *
 * Blunt bands rather than nearest-edge, because a rule you can predict without
 * trying it is worth more than one that describes the geometry better. These
 * assert the corners in particular: a proximity-weighted rule flips its answer
 * under small movements there, and that is exactly what this avoids.
 */
describe("the drop zones", () => {
	const rect = { x: 0, y: 0, width: 1000, height: 1000 };
	const at = (x: number, y: number) => dropZone(rect, x, y);

	it("takes the left and right edges, near them", () => {
		expect(at(40, 500)).toBe("left");
		expect(at(960, 500)).toBe("right");
		// A fifth of the way in is the graph, not the dock.
		expect(at(200, 500)).toBeNull();
		expect(at(800, 500)).toBeNull();
	});

	it("takes the bottom of what is left over", () => {
		expect(at(500, 960)).toBe("bottom");
		expect(at(500, 880)).toBeNull();
	});

	/** The largest target on screen, and the one a drag you thought better of needs. */
	it("changes nothing in the middle", () => {
		expect(at(500, 500)).toBeNull();
		expect(at(500, 100)).toBeNull();
	});

	/**
	 * The reason the bands are ordered rather than weighted. In a corner both a
	 * side and the bottom are true, and the side wins every time — so the answer
	 * cannot flip while the pointer jitters.
	 */
	it("gives a corner to the side, consistently", () => {
		expect(at(30, 970)).toBe("left");
		expect(at(970, 970)).toBe("right");
		expect(at(10, 990)).toBe("left");
	});

	it("declines a point outside the workspace", () => {
		expect(at(-20, 500)).toBeNull();
		expect(at(500, 1400)).toBeNull();
	});
});

describe("moving a panel", () => {
	it("puts it in the dock it was dropped on", () => {
		const layout = movePanel(base(), "tree", "right");
		expect(layout.panels.tree.dock).toBe("right");
		expect(panelsIn(layout, "left")).toEqual(["variables"]);
	});

	/**
	 * A dock somebody has just dropped a panel into has to be open, or the panel
	 * vanishes and the gesture reads as having deleted it.
	 */
	it("opens a dock that had been collapsed", () => {
		const collapsed = toggleDock(base(), "right");
		expect(dockVisible(collapsed, "right")).toBe(false);

		const layout = movePanel(collapsed, "tree", "right");
		expect(dockVisible(layout, "right")).toBe(true);
	});

	/** Renumbered wholesale, so orders cannot drift into duplicates or gaps. */
	it("leaves the orders in each dock contiguous from zero", () => {
		let layout = movePanel(base(), "inspector", "left");
		layout = movePanel(layout, "analysis", "left");

		// tree and variables were already there, so all four end up in the left.
		const orders = panelsIn(layout, "left").map((id) => layout.panels[id].order);
		expect(orders).toEqual([0, 1, 2, 3]);
		// Properties stays behind on the right, the only one not moved.
		expect(panelsIn(layout, "right")).toEqual(["properties"]);
		expect(panelsIn(layout, "bottom")).toEqual([]);
	});

	it("does nothing when the panel is already there", () => {
		const layout = base();
		expect(movePanel(layout, "tree", "left")).toBe(layout);
	});
});

describe("a panel in a window", () => {
	it("leaves its dock without forgetting which one", () => {
		const floated = floatPanel(DEFAULT_LAYOUT, "variables", true);
		expect(floated.panels.variables.floating).toBe(true);
		expect(floated.panels.variables.dock).toBe("left");
		// Out of the dock's list, so the dock sizes itself to what is left.
		expect(panelsIn(floated, "left")).toEqual(["tree"]);
		expect(floatingPanels(floated)).toEqual(["variables"]);
	});

	it("goes back to the dock it came from, and opens it", () => {
		const closed = toggleDock(DEFAULT_LAYOUT, "left");
		const floated = floatPanel(closed, "variables", true);
		const docked = floatPanel(floated, "variables", false);
		expect(docked.panels.variables.floating).toBe(false);
		expect(docked.docks.left.open).toBe(true);
		expect(panelsIn(docked, "left")).toEqual(["tree", "variables"]);
	});

	/** Dropping a window into a dock is how you dock it. */
	it("stops floating when it is dragged into a dock", () => {
		const floated = floatPanel(DEFAULT_LAYOUT, "variables", true);
		const dropped = movePanel(floated, "variables", "right");
		expect(dropped.panels.variables.floating).toBe(false);
		expect(dropped.panels.variables.dock).toBe("right");
	});

	/**
	 * The top-left corner moves the window as it shrinks it, so the bottom-right
	 * stays put — the arithmetic a comment's own corner does, and the reason the
	 * drag holds the frame it started from rather than the current one.
	 */
	it("keeps its far corner still when the near one is dragged", () => {
		const start = framePanel(DEFAULT_LAYOUT, "variables", { x: 100, y: 80, w: 300, h: 400 });
		const frame = start.panels.variables.frame;
		const dx = 40;
		const dy = 25;
		const dragged = framePanel(start, "variables", {
			x: frame.x + dx,
			y: frame.y + dy,
			w: frame.w - dx,
			h: frame.h - dy,
		}).panels.variables.frame;
		expect(dragged.x + dragged.w).toBe(frame.x + frame.w);
		expect(dragged.y + dragged.h).toBe(frame.y + frame.h);
	});

	it("keeps its frame on screen and above the minimum", () => {
		const moved = framePanel(DEFAULT_LAYOUT, "variables", { x: -80, y: -9, w: 10, h: 10 });
		expect(moved.panels.variables.frame).toEqual({ x: 0, y: 0, w: MIN_FLOAT.w, h: MIN_FLOAT.h });
	});

	/** A layout written before windows existed is a docked layout. */
	it("reads an older layout as docked, in its default frame", () => {
		const old = readLayout({
			panels: { variables: { dock: "right", open: true, order: 0 } },
			docks: { left: { size: 200, open: true } },
		});
		expect(old.panels.variables.floating).toBe(false);
		expect(old.panels.variables.frame).toEqual(DEFAULT_FRAME);
	});

	it("takes a saved frame back, clamped", () => {
		const saved = readLayout({
			panels: {
				variables: {
					dock: "left",
					open: true,
					order: 1,
					floating: true,
					frame: { x: 40, y: 60, w: 12, h: 900 },
				},
			},
		});
		expect(saved.panels.variables.floating).toBe(true);
		expect(saved.panels.variables.frame).toEqual({ x: 40, y: 60, w: MIN_FLOAT.w, h: 900 });
	});
});

describe("cards", () => {
	it("starts as one card a panel, sharing each column", () => {
		const cards = cardsIn(base(), "left");
		expect(cards.map((c) => c.tabs)).toEqual([["tree"], ["variables"]]);
		expect(cards.map((c) => c.weight)).toEqual([3, 2]);
	});

	it("makes a tab of a card dropped on another's header, showing the one dropped", () => {
		const layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		const [card] = cardsIn(layout, "left");
		expect(card.tabs).toEqual(["tree", "variables"]);
		expect(card.active).toBe("variables");
		expect(cardsIn(layout, "left")).toHaveLength(1);
	});

	it("takes a tab across a dock with its card", () => {
		let layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		layout = dropCard(layout, "tree", { kind: "dock", side: "right" });
		expect(cardsIn(layout, "left")).toHaveLength(0);
		expect(cardsIn(layout, "right").at(-1)?.tabs).toEqual(["tree", "variables"]);
	});

	it("separates one tab beside the card it left, and hands a head's card to its next tab", () => {
		let layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		layout = separate(layout, "variables");
		expect(cardsIn(layout, "left").map((c) => c.tabs)).toEqual([["tree"], ["variables"]]);

		layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		layout = separate(layout, "tree");
		const heads = cardsIn(layout, "left").map((c) => c.head);
		expect(heads).toEqual(["variables", "tree"]);
		expect(layout.panels.variables.tabOf).toBeUndefined();
	});

	it("drags one tab out alone, leaving the rest", () => {
		let layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		layout = dropCard(layout, "variables", { kind: "dock", side: "right" }, true);
		expect(cardsIn(layout, "left").map((c) => c.tabs)).toEqual([["tree"]]);
		expect(cardsIn(layout, "right").map((c) => c.head)).toContain("variables");
	});

	it("puts a card above or below another, in that card's dock", () => {
		const above = dropCard(base(), "variables", { kind: "before", card: "inspector" });
		expect(cardsIn(above, "right").map((c) => c.head)).toEqual([
			"variables",
			"inspector",
			"properties",
		]);
		const below = dropCard(base(), "tree", { kind: "after", card: "inspector" });
		expect(cardsIn(below, "right").map((c) => c.head)).toEqual(["inspector", "tree", "properties"]);
	});

	it("floats a card and its tabs together", () => {
		const frame = { x: 40, y: 80, w: 300, h: 360 };
		let layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		layout = dropCard(layout, "tree", { kind: "float", frame });
		expect(floatingCards(layout).map((c) => c.tabs)).toEqual([["tree", "variables"]]);
		expect(layout.panels.variables.floating).toBe(true);
	});

	it("shares two cards' height and folds one", () => {
		let layout = shareHeight(base(), "tree", "variables", [4, 1]);
		expect(cardsIn(layout, "left").map((c) => c.weight)).toEqual([4, 1]);
		layout = foldCard(layout, "variables", true);
		expect(cardsIn(layout, "left")[1].folded).toBe(true);
	});

	it("closes a panel out of its card, and brings it back as its own", () => {
		let layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		layout = closePanel(layout, "variables");
		expect(cardsIn(layout, "left").map((c) => c.tabs)).toEqual([["tree"]]);
		layout = reopenPanel(layout, "variables");
		expect(cardsIn(layout, "left").map((c) => c.tabs)).toEqual([["tree"], ["variables"]]);
	});

	it("shows the next tab when the one showing has nothing to show", () => {
		const layout = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		const [card] = cardsIn(layout, "left", (id) => id !== "variables");
		expect(card.active).toBe("tree");
	});

	it("reads a stored card back, and breaks a tab of a tab", () => {
		const stored = dropCard(base(), "variables", { kind: "tab", host: "tree" });
		expect(readLayout(JSON.parse(JSON.stringify(stored))).panels.variables.tabOf).toBe("tree");
		const loop = JSON.parse(JSON.stringify(base()));
		loop.panels.tree.tabOf = "variables";
		loop.panels.variables.tabOf = "tree";
		const read = readLayout(loop);
		expect(read.panels.tree.tabOf === undefined || read.panels.variables.tabOf === undefined).toBe(
			true,
		);
	});
});
