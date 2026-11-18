/**
 * The extensions' parts that run on the daemon alone, as `createDaemon` sets
 * them up. Only the daemon imports this: it may need Node.
 */

import { placeViewerDaemon } from "./placeViewer/server/daemon.js";
import type { RobloxSignIn } from "./placeViewer/server/roblox/signin.js";
import type { ExtensionCapabilities } from "./server.js";

export interface DaemonExtensionOptions {
	/** Sends an event to every open editor. */
	broadcast(event: string, data: unknown): void;
	/** Sign in with Roblox: a test passes its own, or null for none. */
	roblox?: RobloxSignIn | null;
}

export interface DaemonExtensions {
	capabilities: ExtensionCapabilities;
	/** Once the daemon is listening. */
	afterStart(): void;
	close(): void;
}

export function daemonExtensions(options: DaemonExtensionOptions): DaemonExtensions {
	const placeViewer = placeViewerDaemon(options);
	return {
		capabilities: { placeViewer: placeViewer.capabilities },
		afterStart: () => placeViewer.afterStart(),
		close: () => placeViewer.close(),
	};
}
