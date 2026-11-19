/**
 * The extensions' parts that run on the daemon alone, as `createDaemon` sets
 * them up. Only the daemon imports this: it may need Node.
 */

import { placeEditorDaemon } from "./placeEditor/server/daemon.js";
import type { RobloxSignIn } from "./placeEditor/server/roblox/signin.js";
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
	const placeEditor = placeEditorDaemon(options);
	return {
		capabilities: { placeEditor: placeEditor.capabilities },
		afterStart: () => placeEditor.afterStart(),
		close: () => placeEditor.close(),
	};
}
