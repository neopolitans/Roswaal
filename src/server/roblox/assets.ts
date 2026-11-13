/**
 * Assets downloaded through Sign in with Roblox: the meshes and images a
 * place refers to, kept so they can be drawn.
 *
 * - **Where.** `.roswaal/assets/` in the project: `<id>` holds an asset's
 *   bytes and `<id>.json` what is known about it. A `.gitignore` of `*` keeps
 *   the folder out of Git whatever the project's own `.gitignore` says. Every
 *   write goes through `safeJoin` and the confined filesystem, as every
 *   project write does.
 * - **What is fetched.** The Assets API (`asset:read`) names the creator
 *   first: Roblox's own assets (user 1) are recorded as skipped and never
 *   downloaded, as the Privacy Policy says. Then asset delivery
 *   (`legacy-asset:manage`) gives a download address, which must be HTTPS on
 *   one of Roblox's download servers (`isRobloxCdn`), before and after any
 *   redirect (CASA 5.1). They are not sent the token. Each download is
 *   size-limited.
 * - **How long.** An asset unused for 30 days is deleted. Clear downloaded
 *   assets deletes a project's whole folder. Signing out, or losing access,
 *   deletes every project's, through the list `downloadRegistry` keeps of the
 *   folders downloaded into.
 *
 * Never sold, never put back online, never used to train AI: nothing here
 * sends an asset anywhere.
 */

import nodeFs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

import { readLimited } from "../download.js";
import { HttpError, UserError } from "../errors.js";
import { fs } from "../host.js";
import { safeJoin } from "../paths.js";

/** Where a project's downloads are kept. */
export const ASSET_FOLDER = ".roswaal/assets";
/** The most one asset may be. Meshes and images are a few MiB at most. */
export const LARGEST_ASSET = 32 * 1024 * 1024;
/** The most assets one request may ask for. */
export const ASSET_BUDGET = 64;
/** An asset unused this long is deleted. */
export const UNUSED_DAYS = 30;
/** Roblox's own account: what it made is never downloaded. */
export const ROBLOX_USER_ID = "1";

const ASSETS_API = "https://apis.roblox.com/assets/v1/assets/";
const DELIVERY_API = "https://apis.roblox.com/asset-delivery-api/v1/assetId/";
const REQUEST_MS = 20_000;
const DAY_MS = 24 * 60 * 60_000;
const IGNORE =
	"# Assets downloaded through Sign in with Roblox. Never committed: see Roswaal's Privacy Policy.\n*\n";

/** What is known about one asset. */
export interface AssetRecord {
	assetId: string;
	/** Roblox's asset type: 1 an image, 4 a mesh, 13 a decal. */
	assetTypeId?: number;
	creatorUserId?: string;
	/** Not downloaded, and why. */
	skipped?: "roblox-made";
	size?: number;
	fetched: number;
	used: number;
}

/** How one asked-for asset came out. */
export type AssetOutcome =
	| { state: "ready"; assetTypeId?: number }
	| { state: "skipped"; reason: "roblox-made" }
	| { state: "failed"; reason: string };

/** An address's scheme and host, and nothing of its path or query. */
function hostOf(address: unknown): string {
	try {
		const url = new URL(String(address));
		return `${url.protocol}//${url.hostname}`;
	} catch {
		return "no address";
	}
}

/**
 * Whether an address is one of Roblox's download servers, over HTTPS: the only
 * places an asset is fetched from. Its CDN, `rbxcdn.com`, and
 * `contentdelivery.roblox.com`, which asset delivery hands out for some
 * Creator Marketplace meshes (seen 13 Nov 2026). Named exactly rather than
 * all of `roblox.com`.
 */
export function isRobloxCdn(address: string): boolean {
	try {
		const url = new URL(address);
		return (
			url.protocol === "https:" &&
			(url.hostname === "rbxcdn.com" ||
				url.hostname.endsWith(".rbxcdn.com") ||
				url.hostname === "contentdelivery.roblox.com")
		);
	} catch {
		return false;
	}
}

/**
 * The project folders that hold downloads, in `~/.roswaal/roblox-downloads.json`,
 * so signing out can delete them all and not only the open project's.
 */
export interface DownloadRegistry {
	add(root: string): Promise<void>;
	remove(root: string): Promise<void>;
	roots(): Promise<string[]>;
}

export function downloadRegistry(
	file = nodePath.join(os.homedir(), ".roswaal", "roblox-downloads.json"),
): DownloadRegistry {
	const read = async (): Promise<string[]> => {
		try {
			const parsed = JSON.parse(await nodeFs.promises.readFile(file, "utf8")) as {
				roots?: unknown;
			};
			return Array.isArray(parsed.roots)
				? parsed.roots.filter((r): r is string => typeof r === "string")
				: [];
		} catch {
			return [];
		}
	};
	const write = async (roots: string[]) => {
		await nodeFs.promises.mkdir(nodePath.dirname(file), { recursive: true, mode: 0o700 });
		await nodeFs.promises.rm(file, { force: true });
		if (roots.length === 0) return;
		await nodeFs.promises.writeFile(file, `${JSON.stringify({ roots }, null, "\t")}\n`, {
			mode: 0o600,
			flag: "wx",
		});
	};
	return {
		async add(root) {
			const roots = await read();
			if (!roots.includes(root)) await write([...roots, root]);
		},
		async remove(root) {
			const roots = await read();
			if (roots.includes(root)) await write(roots.filter((r) => r !== root));
		},
		roots: read,
	};
}

export interface AssetCacheOptions {
	/** An access token from the sign-in, refreshed as it needs. */
	token: () => Promise<string>;
	registry: DownloadRegistry;
	fetch?: typeof fetch;
	now?: () => number;
}

export class AssetCache {
	private readonly token: () => Promise<string>;
	private readonly registry: DownloadRegistry;
	private readonly fetch: typeof fetch;
	private readonly now: () => number;

	constructor(options: AssetCacheOptions) {
		this.token = options.token;
		this.registry = options.registry;
		this.fetch = options.fetch ?? fetch;
		this.now = options.now ?? Date.now;
	}

	private folder(root: string): string {
		return safeJoin(root, ASSET_FOLDER);
	}

	private async record(root: string, id: string): Promise<AssetRecord | null> {
		try {
			return JSON.parse(
				await fs.readFile(nodePath.join(this.folder(root), `${id}.json`), "utf8"),
			) as AssetRecord;
		} catch {
			return null;
		}
	}

	private async keep(root: string, record: AssetRecord, bytes?: Uint8Array): Promise<void> {
		const folder = this.folder(root);
		await fs.mkdir(folder, { recursive: true });
		await fs.writeFile(nodePath.join(folder, ".gitignore"), IGNORE, "utf8");
		if (bytes) await fs.writeFile(nodePath.join(folder, record.assetId), bytes);
		await fs.writeFile(
			nodePath.join(folder, `${record.assetId}.json`),
			`${JSON.stringify(record, null, "\t")}\n`,
			"utf8",
		);
		await this.registry.add(root);
	}

	/**
	 * Makes sure each asset is here: downloaded unless it already is, or is
	 * Roblox's own. Up to `ASSET_BUDGET` at once; one that fails is said so
	 * and the rest go on.
	 */
	async fetchAll(root: string, ids: readonly string[]): Promise<Record<string, AssetOutcome>> {
		if (ids.length > ASSET_BUDGET) {
			throw new UserError(`At most ${ASSET_BUDGET} assets can be asked for at once.`);
		}
		await this.expire(root);
		const out: Record<string, AssetOutcome> = {};
		for (const id of new Set(ids)) {
			try {
				out[id] = await this.fetchOne(root, id);
			} catch (err) {
				out[id] = { state: "failed", reason: err instanceof Error ? err.message : String(err) };
			}
		}
		return out;
	}

	private async fetchOne(root: string, id: string): Promise<AssetOutcome> {
		if (!/^\d{1,20}$/.test(id)) throw new UserError(`"${id.slice(0, 24)}" is not an asset id.`);
		const known = await this.record(root, id);
		if (known?.skipped) return { state: "skipped", reason: known.skipped };
		if (known) {
			await this.keep(root, { ...known, used: this.now() });
			return { state: "ready", assetTypeId: known.assetTypeId };
		}

		const bearer = { Authorization: `Bearer ${await this.token()}` };
		// Who made it, first: Roblox's own assets are not downloaded.
		const info = await this.fetch(`${ASSETS_API}${id}`, {
			headers: bearer,
			signal: AbortSignal.timeout(REQUEST_MS),
		});
		if (!info.ok)
			throw new HttpError(502, `Roblox would not say what asset ${id} is (${info.status}).`);
		const about = (await info.json()) as {
			creationContext?: { creator?: { userId?: string } };
		};
		const creatorUserId = about.creationContext?.creator?.userId;
		const now = this.now();
		if (creatorUserId === ROBLOX_USER_ID) {
			await this.keep(root, {
				assetId: id,
				creatorUserId,
				skipped: "roblox-made",
				fetched: now,
				used: now,
			});
			return { state: "skipped", reason: "roblox-made" };
		}

		const delivery = await this.fetch(`${DELIVERY_API}${id}`, {
			headers: bearer,
			signal: AbortSignal.timeout(REQUEST_MS),
		});
		if (!delivery.ok)
			throw new HttpError(502, `Roblox would not hand over asset ${id} (${delivery.status}).`);
		const { location, assetTypeId } = (await delivery.json()) as {
			location?: unknown;
			assetTypeId?: unknown;
		};
		if (typeof location !== "string" || !isRobloxCdn(location)) {
			// The host alone: the rest of the address is a signed link, and not repeated.
			throw new HttpError(
				502,
				`Asset ${id}'s download address is not Roblox's (${hostOf(location)}).`,
			);
		}
		// The CDN gets no token, and wherever it redirects must be Roblox's too.
		const download = await this.fetch(location, { signal: AbortSignal.timeout(REQUEST_MS) });
		if (download.url && !isRobloxCdn(download.url)) {
			await download.body?.cancel().catch(() => undefined);
			throw new HttpError(502, `Asset ${id} was redirected away from Roblox.`);
		}
		if (!download.ok)
			throw new HttpError(502, `Asset ${id} could not be downloaded (${download.status}).`);
		const bytes = await readLimited(download, LARGEST_ASSET, `Asset ${id}`);
		await this.keep(
			root,
			{
				assetId: id,
				...(typeof assetTypeId === "number" ? { assetTypeId } : {}),
				...(creatorUserId ? { creatorUserId } : {}),
				size: bytes.length,
				fetched: now,
				used: now,
			},
			bytes,
		);
		return { state: "ready", ...(typeof assetTypeId === "number" ? { assetTypeId } : {}) };
	}

	/**
	 * One downloaded asset's bytes and type, or null when it is not here (or was
	 * skipped as Roblox's own). Reads only: it does not count as a use, which
	 * `fetchAll` records.
	 */
	async read(
		root: string,
		id: string,
	): Promise<{ assetTypeId?: number; bytes: Uint8Array } | null> {
		if (!/^\d{1,20}$/.test(id)) return null;
		const record = await this.record(root, id);
		if (!record || record.skipped) return null;
		try {
			const bytes = await fs.readFile(nodePath.join(this.folder(root), id));
			return {
				...(record.assetTypeId !== undefined ? { assetTypeId: record.assetTypeId } : {}),
				bytes,
			};
		} catch {
			return null;
		}
	}

	/** How many assets this project holds, and how many bytes. Reads only. */
	async summary(root: string): Promise<{ count: number; bytes: number }> {
		let count = 0;
		let bytes = 0;
		for (const record of await this.records(root)) {
			if (record.skipped) continue;
			count++;
			bytes += record.size ?? 0;
		}
		return { count, bytes };
	}

	private async records(root: string): Promise<AssetRecord[]> {
		let names: string[];
		try {
			names = await fs.readdir(this.folder(root));
		} catch {
			return [];
		}
		const out: AssetRecord[] = [];
		for (const name of names) {
			const id = /^(\d+)\.json$/.exec(name)?.[1];
			if (!id) continue;
			const record = await this.record(root, id);
			if (record) out.push(record);
		}
		return out;
	}

	/** Deletes what has gone unused for `UNUSED_DAYS`. */
	async expire(root: string): Promise<number> {
		const before = this.now() - UNUSED_DAYS * DAY_MS;
		let gone = 0;
		for (const record of await this.records(root)) {
			if (record.used >= before) continue;
			const folder = this.folder(root);
			await fs.rm(nodePath.join(folder, record.assetId), { force: true });
			await fs.rm(nodePath.join(folder, `${record.assetId}.json`), { force: true });
			gone++;
		}
		return gone;
	}

	/** Deletes the project's downloads, folder and all. */
	async clear(root: string): Promise<void> {
		await fs.rm(this.folder(root), { recursive: true, force: true });
		await this.registry.remove(root);
	}

	/** Deletes every project's downloads: for signing out, and for lost access. */
	async clearEverywhere(): Promise<void> {
		for (const root of await this.registry.roots()) {
			try {
				await this.clear(root);
			} catch {
				// A folder since moved or deleted has nothing left to delete.
				await this.registry.remove(root);
			}
		}
	}
}
