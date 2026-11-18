/**
 * The Place Viewer on the daemon: Sign in with Roblox, kept in this account's
 * vault, and what it downloads, kept in each project. Signing out, or losing
 * access, deletes all of it. The website has neither.
 */

import type { DaemonExtensionOptions } from "../../daemon.js";
import { AssetCache, downloadRegistry } from "./roblox/assets.js";
import { RobloxSignIn } from "./roblox/signin.js";
import { fileVault } from "./roblox/vault.js";
import type { PlaceViewerCapabilities } from "./routes.js";

export interface PlaceViewerDaemon {
	capabilities: PlaceViewerCapabilities;
	/** Asks Roblox once whether the sign-in still has access. */
	afterStart(): void;
	close(): void;
}

export function placeViewerDaemon(options: DaemonExtensionOptions): PlaceViewerDaemon {
	// A test passes its own sign-in, or null for none, so it never reads the real one.
	let assets: AssetCache | null = null;
	const roblox =
		options.roblox === undefined
			? new RobloxSignIn({
					vault: fileVault(),
					onChange: (status) => options.broadcast("roblox", status),
					onForget: async () => {
						await assets?.clearEverywhere();
					},
				})
			: options.roblox;
	if (roblox) {
		assets = new AssetCache({ token: () => roblox.accessToken(), registry: downloadRegistry() });
	}
	return {
		capabilities: roblox && assets ? { roblox, robloxAssets: assets } : {},
		afterStart: () => void roblox?.checkAccess(),
		close: () => roblox?.close(),
	};
}
