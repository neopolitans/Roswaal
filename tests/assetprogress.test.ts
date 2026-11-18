/**
 * The place viewer's asset count: what a place needs, what arrived, what is
 * on the GPU, and what will not come, and the card's words for each.
 */

import { describe, expect, it } from "vitest";
import {
	AssetTally,
	assetsMissing,
	assetsPending,
	assetWords,
} from "../src/extensions/placeViewer/app/viewport/assetProgress.js";

describe("AssetTally", () => {
	it("counts needed, then arrived, then uploaded", () => {
		const tally = new AssetTally();
		tally.begin();
		for (const key of ["image:1", "image:2", "mesh:3", "look:4"]) tally.want(key, true);
		expect(tally.progress).toMatchObject({ needed: 4, arrived: 0, uploaded: 0, failed: 0 });
		expect(assetsPending(tally.progress)).toBe(4);

		tally.arrive("image:1");
		tally.arrive("mesh:3");
		expect(tally.progress).toMatchObject({ arrived: 2, uploaded: 0 });

		tally.give("image:1");
		expect(tally.progress).toMatchObject({ arrived: 2, uploaded: 1 });
		expect(assetsPending(tally.progress)).toBe(3);

		tally.give("mesh:3");
		tally.arrive("image:2");
		tally.give("image:2");
		tally.arrive("look:4");
		tally.give("look:4");
		expect(tally.progress).toMatchObject({ needed: 4, arrived: 4, uploaded: 4 });
		expect(assetsPending(tally.progress)).toBe(0);
	});

	it("counts the same key once", () => {
		const tally = new AssetTally();
		tally.want("image:1", true);
		tally.want("image:1");
		expect(tally.progress.needed).toBe(1);
	});

	it("counts failures and sign-ins as not coming, not pending", () => {
		const tally = new AssetTally();
		for (const key of ["image:1", "image:2", "mesh:3", "sky:4"]) tally.want(key, true);
		tally.notAsked("image:1", "sign-in");
		tally.notAsked("mesh:3", "unavailable");
		tally.notAsked("sky:4", "offline");
		tally.fail("image:2");
		const p = tally.progress;
		expect(p).toMatchObject({ failed: 2, signIn: 1, unavailable: 1, uploaded: 0 });
		expect(assetsMissing(p)).toBe(4);
		expect(assetsPending(p)).toBe(0);
	});

	it("keeps why an asset was not asked for when its empty answer comes after", () => {
		const tally = new AssetTally();
		tally.want("image:1", true);
		tally.notAsked("image:1", "sign-in");
		tally.fail("image:1");
		expect(tally.progress).toMatchObject({ signIn: 1, failed: 0 });
	});

	it("leaves an answer that came alone when told nothing was asked", () => {
		const tally = new AssetTally();
		tally.want("image:1", true);
		tally.arrive("image:1");
		tally.notAsked("image:1", "sign-in");
		expect(tally.progress).toMatchObject({ arrived: 1, signIn: 0 });
	});

	it("counts an upload that fails as failed", () => {
		const tally = new AssetTally();
		tally.want("image:1", true);
		tally.arrive("image:1");
		tally.fail("image:1");
		expect(tally.progress).toMatchObject({ arrived: 0, failed: 1 });
	});

	it("keeps what arrived across a new view, but not what was uploaded", () => {
		const tally = new AssetTally();
		tally.want("image:1", true);
		tally.give("image:1");
		tally.begin();
		expect(tally.progress.needed).toBe(0);
		tally.want("image:1");
		expect(tally.progress).toMatchObject({ needed: 1, arrived: 1, uploaded: 0 });
	});

	it("asks again for what failed, and counts it pending", () => {
		const tally = new AssetTally();
		tally.want("mesh:1", true);
		tally.fail("mesh:1");
		tally.begin();
		tally.want("mesh:1", true);
		expect(tally.progress).toMatchObject({ needed: 1, failed: 0 });
		expect(assetsPending(tally.progress)).toBe(1);
	});

	it("counts only what the view needs now", () => {
		const tally = new AssetTally();
		tally.want("image:1", true);
		tally.begin();
		tally.want("image:2", true);
		tally.give("image:1");
		expect(tally.progress).toMatchObject({ needed: 1, uploaded: 0 });
	});

	it("tells its listener of each change", () => {
		let heard = 0;
		const tally = new AssetTally(() => heard++);
		tally.want("image:1", true);
		tally.arrive("image:1");
		tally.give("image:1");
		expect(heard).toBe(3);
	});
});

describe("assetWords", () => {
	const none = { arrived: 0, uploaded: 0, failed: 0, signIn: 0, unavailable: 0 };

	it("counts what arrived while loading, then what is uploaded", () => {
		expect(assetWords({ ...none, needed: 230, arrived: 150, uploaded: 112 })).toEqual({
			head: "Loading assets 150 of 230",
			notes: [],
		});
		expect(assetWords({ ...none, needed: 230, arrived: 228, uploaded: 112, failed: 2 })).toEqual({
			head: "Uploading assets 112 of 230",
			notes: ["2 failed"],
		});
	});

	it("says all are loaded once they are", () => {
		expect(assetWords({ ...none, needed: 3, arrived: 3, uploaded: 3 }).head).toBe(
			"All assets loaded",
		);
	});

	it("names what did not come", () => {
		expect(
			assetWords({ ...none, needed: 10, arrived: 5, uploaded: 5, failed: 2, signIn: 3 }),
		).toEqual({
			head: "5 of 10 assets loaded",
			notes: ["2 failed", "3 need Sign in with Roblox"],
		});
		expect(assetWords({ ...none, needed: 4, unavailable: 4 }).notes).toEqual([
			"4 need roswaal serve",
		]);
	});
});
