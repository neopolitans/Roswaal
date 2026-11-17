/**
 * How far a place's assets have come, for the viewer's progress card: what the
 * place needs, what has arrived (downloaded, or read from the project's
 * cache), what has been given to the GPU, and what will not come.
 *
 * Keys name one thing each, as `image:123` or `look:4`. What arrived is kept
 * for the session, as the controller keeps the assets themselves; what the
 * view needs and what it has been given start again with each place or view.
 */

/** Why an asset was not asked for: no one is signed in, this copy cannot sign in, or nothing answered. */
export type NotAsked = "sign-in" | "unavailable" | "offline";

type Fetch = "pending" | "arrived" | "failed" | "sign-in" | "unavailable";

export interface AssetProgress {
	/** Assets the place needs. */
	needed: number;
	/** Of those, here: downloaded or read from the cache. Counts those uploaded. */
	arrived: number;
	/** Of those, given to the GPU. */
	uploaded: number;
	/** Did not arrive, could not be read, or Roblox refused them. */
	failed: number;
	/** Wait on Sign in with Roblox. */
	signIn: number;
	/** Cannot be downloaded here: the website has no Sign in with Roblox. */
	unavailable: number;
}

/** Assets neither in the view nor not coming. */
export function assetsPending(p: AssetProgress): number {
	return p.needed - p.uploaded - p.failed - p.signIn - p.unavailable;
}

/** Assets that will not come this time: failed, or waiting on a sign-in. */
export function assetsMissing(p: AssetProgress): number {
	return p.failed + p.signIn + p.unavailable;
}

/** The progress card's words: its line, and what will not come, if anything. */
export function assetWords(p: AssetProgress): { head: string; notes: string[] } {
	const notes: string[] = [];
	if (p.failed > 0) notes.push(`${p.failed.toLocaleString()} failed`);
	if (p.signIn > 0) notes.push(`${p.signIn.toLocaleString()} need Sign in with Roblox`);
	if (p.unavailable > 0) notes.push(`${p.unavailable.toLocaleString()} need roswaal serve`);
	const of = (n: number) => `${n.toLocaleString()} of ${p.needed.toLocaleString()}`;
	const missing = assetsMissing(p);
	// Arriving first, then on to the GPU: each count as it moves.
	const head =
		p.arrived + missing < p.needed
			? `Loading assets ${of(p.arrived)}`
			: assetsPending(p) > 0
				? `Uploading assets ${of(p.uploaded)}`
				: missing === 0
					? "All assets loaded"
					: `${of(p.uploaded)} assets loaded`;
	return { head, notes };
}

export class AssetTally {
	private fetched = new Map<string, Fetch>();
	private wanted = new Set<string>();
	private given = new Set<string>();

	/** `changed` hears every change: the controller passes the progress on. */
	constructor(private readonly changed?: () => void) {}

	/** A new place or view: nothing needed yet, nothing given. What arrived stays. */
	begin(): void {
		this.wanted.clear();
		this.given.clear();
		this.changed?.();
	}

	/** The view needs `key`. `asking`: it is being fetched now, whatever came of it before. */
	want(key: string, asking = false): void {
		this.wanted.add(key);
		if (asking || !this.fetched.has(key)) this.fetched.set(key, "pending");
		this.changed?.();
	}

	arrive(key: string): void {
		this.fetched.set(key, "arrived");
		this.changed?.();
	}

	/** It did not arrive, or did not upload. Leaves one waiting on a sign-in so. */
	fail(key: string): void {
		const was = this.fetched.get(key);
		if (was === "sign-in" || was === "unavailable") return;
		this.fetched.set(key, "failed");
		this.given.delete(key);
		this.changed?.();
	}

	/** Not asked for, and why. One still waiting only: an answer that came stands. */
	notAsked(key: string, why: NotAsked): void {
		if (this.fetched.get(key) !== "pending") return;
		this.fetched.set(key, why === "offline" ? "failed" : why);
		this.changed?.();
	}

	/** In the view. */
	give(key: string): void {
		this.fetched.set(key, "arrived");
		this.given.add(key);
		this.changed?.();
	}

	get progress(): AssetProgress {
		const p: AssetProgress = {
			needed: this.wanted.size,
			arrived: 0,
			uploaded: 0,
			failed: 0,
			signIn: 0,
			unavailable: 0,
		};
		for (const key of this.wanted) {
			if (this.given.has(key)) {
				p.arrived++;
				p.uploaded++;
				continue;
			}
			const state = this.fetched.get(key);
			if (state === "arrived") p.arrived++;
			else if (state === "failed") p.failed++;
			else if (state === "sign-in") p.signIn++;
			else if (state === "unavailable") p.unavailable++;
		}
		return p;
	}
}
