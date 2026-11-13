/**
 * What Sign in with Roblox downloads: kept in the project's `.roswaal/assets`,
 * out of Git, fetched only from Roblox's CDN and without the token, Roblox's
 * own assets never downloaded, unused ones expiring, and every project's
 * deleted on signing out.
 */

import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	ASSET_FOLDER,
	AssetCache,
	downloadRegistry,
	isRobloxCdn,
	LARGEST_ASSET,
} from "../src/server/roblox/assets.js";

let base: string;
beforeEach(async () => {
	base = await mkdtemp(path.join(tmpdir(), "roswaal-assets-"));
});
afterEach(async () => {
	await rm(base, { recursive: true, force: true });
});

interface Seen {
	url: string;
	auth: string | null;
}

/** Roblox's two APIs and its CDN, as the cache sees them. */
function fakeRoblox(options: {
	creator?: Record<string, string>;
	location?: (id: string) => string;
	size?: number;
	redirectedTo?: string;
}) {
	const seen: Seen[] = [];
	const fetchFn = (async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		seen.push({ url, auth: new Headers(init?.headers).get("Authorization") });
		const asset = /assets\/v1\/assets\/(\d+)/.exec(url)?.[1];
		if (asset) {
			return Response.json({
				assetId: asset,
				creationContext: { creator: { userId: options.creator?.[asset] ?? "958742555" } },
			});
		}
		const delivered = /assetId\/(\d+)/.exec(url)?.[1];
		if (delivered) {
			return Response.json({
				location: options.location?.(delivered) ?? `https://c0.rbxcdn.com/${delivered}`,
				assetTypeId: 4,
			});
		}
		const body = new Uint8Array(options.size ?? 16).fill(7);
		const response = new Response(body, { status: 200 });
		Object.defineProperty(response, "url", { value: options.redirectedTo ?? url });
		return response;
	}) as typeof fetch;
	return { seen, fetch: fetchFn };
}

function cache(roblox: ReturnType<typeof fakeRoblox>, now = () => 1_000_000_000) {
	const registryFile = path.join(base, "home", ".roswaal", "roblox-downloads.json");
	const registry = downloadRegistry(registryFile);
	return {
		registry,
		registryFile,
		assets: new AssetCache({
			token: async () => "access-token",
			registry,
			fetch: roblox.fetch,
			now,
		}),
	};
}

async function project(name = "project"): Promise<string> {
	const root = path.join(base, name);
	await rm(root, { recursive: true, force: true });
	const { mkdir } = await import("node:fs/promises");
	await mkdir(root, { recursive: true });
	return root;
}

describe("downloading an asset", () => {
	it("keeps it in the project's .roswaal/assets, out of Git", async () => {
		const roblox = fakeRoblox({});
		const { assets, registry } = await cache(roblox);
		const root = await project();
		expect(await assets.fetchAll(root, ["431039918"])).toEqual({
			"431039918": { state: "ready", assetTypeId: 4 },
		});
		const folder = path.join(root, ASSET_FOLDER);
		expect((await readFile(path.join(folder, "431039918"))).length).toBe(16);
		expect(await readFile(path.join(folder, ".gitignore"), "utf8")).toMatch(/^\*$/m);
		expect(await registry.roots()).toEqual([root]);
		expect(await assets.summary(root)).toEqual({ count: 1, bytes: 16 });
	});

	it("sends the token to Roblox's APIs and never to the CDN", async () => {
		const roblox = fakeRoblox({});
		const { assets } = cache(roblox);
		await assets.fetchAll(await project(), ["5"]);
		const cdn = roblox.seen.find((s) => s.url.includes("rbxcdn.com"));
		expect(cdn?.auth).toBeNull();
		expect(roblox.seen.filter((s) => s.url.includes("apis.roblox.com")).every((s) => s.auth)).toBe(
			true,
		);
	});

	it("never downloads what Roblox made, and remembers not to ask again", async () => {
		const roblox = fakeRoblox({ creator: { "81475938": "1" } });
		const { assets } = cache(roblox);
		const root = await project();
		expect(await assets.fetchAll(root, ["81475938"])).toEqual({
			"81475938": { state: "skipped", reason: "roblox-made" },
		});
		expect(roblox.seen.some((s) => s.url.includes("asset-delivery"))).toBe(false);
		roblox.seen.length = 0;
		await assets.fetchAll(root, ["81475938"]);
		expect(roblox.seen).toEqual([]);
		expect(await assets.summary(root)).toEqual({ count: 0, bytes: 0 });
	});

	it("refuses a download address, or a redirect, that is not Roblox's CDN", async () => {
		const root = await project();
		const elsewhere = cache(fakeRoblox({ location: () => "https://evil.example/x" })).assets;
		expect((await elsewhere.fetchAll(root, ["7"]))["7"]).toMatchObject({ state: "failed" });
		const plain = cache(fakeRoblox({ location: () => "http://c0.rbxcdn.com/x" })).assets;
		expect((await plain.fetchAll(root, ["8"]))["8"]).toMatchObject({ state: "failed" });
		const redirected = cache(fakeRoblox({ redirectedTo: "https://evil.example/y" })).assets;
		expect((await redirected.fetchAll(root, ["9"]))["9"]).toMatchObject({ state: "failed" });
		await expect(stat(path.join(root, ASSET_FOLDER, "7"))).rejects.toThrow();
	});

	it("refuses an asset past the size limit, and an id that is not a number", async () => {
		const root = await project();
		const big = cache(fakeRoblox({ size: LARGEST_ASSET + 1 })).assets;
		expect((await big.fetchAll(root, ["10"]))["10"]).toMatchObject({ state: "failed" });
		const any = cache(fakeRoblox({})).assets;
		expect((await any.fetchAll(root, ["../../x"]))["../../x"]).toMatchObject({ state: "failed" });
	});

	it("matches Roblox's CDN host and nothing that only resembles it", () => {
		expect(isRobloxCdn("https://c0.rbxcdn.com/abc")).toBe(true);
		expect(isRobloxCdn("https://rbxcdn.com.evil.example/abc")).toBe(false);
		expect(isRobloxCdn("https://evilrbxcdn.com/abc")).toBe(false);
		expect(isRobloxCdn("http://c0.rbxcdn.com/abc")).toBe(false);
	});
});

describe("keeping downloads only as long as they are needed", () => {
	it("deletes an asset unused for thirty days", async () => {
		let clock = 1_000_000_000;
		const roblox = fakeRoblox({});
		const { assets } = cache(roblox, () => clock);
		const root = await project();
		await assets.fetchAll(root, ["11"]);
		clock += 29 * 24 * 60 * 60_000;
		expect(await assets.expire(root)).toBe(0);
		clock += 2 * 24 * 60 * 60_000;
		expect(await assets.expire(root)).toBe(1);
		expect(await assets.summary(root)).toEqual({ count: 0, bytes: 0 });
	});

	it("clears one project's downloads, folder and all", async () => {
		const { assets, registry } = cache(fakeRoblox({}));
		const root = await project();
		await assets.fetchAll(root, ["12"]);
		await assets.clear(root);
		expect(await readdir(path.join(root, ".roswaal")).catch(() => [])).not.toContain("assets");
		expect(await registry.roots()).toEqual([]);
	});

	it("deletes every project's downloads on signing out", async () => {
		const { assets, registryFile } = cache(fakeRoblox({}));
		const one = await project("one");
		const two = await project("two");
		await assets.fetchAll(one, ["13"]);
		await assets.fetchAll(two, ["14"]);
		await assets.clearEverywhere();
		for (const root of [one, two]) {
			await expect(stat(path.join(root, ASSET_FOLDER))).rejects.toThrow();
		}
		await expect(stat(registryFile)).rejects.toThrow();
	});
});
