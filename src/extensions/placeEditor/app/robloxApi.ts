/**
 * Sign in with Roblox, as the editor asks the daemon for it: see
 * `../server/routes.ts`. Never a token: the sign-in is the daemon's.
 */

import { apiRequest } from "../../../app/api.js";

/** Sign in with Roblox as the daemon tells it. See `../server/roblox/signin.ts`. */
export interface RobloxStatus {
	/** Whether this copy of Roswaal offers it: the daemon does, the website does not. */
	available: boolean;
	signedIn?: boolean;
	userId?: string;
	signingIn?: boolean;
	failed?: string;
}

const post = <T>(url: string, body: unknown) =>
	apiRequest<T>(url, { method: "POST", body: JSON.stringify(body) });

export const robloxApi = {
	/** Whether it is offered here, and who is signed in. */
	status: () => apiRequest<RobloxStatus>("/api/roblox"),
	/** Starts a sign-in; the address is Roblox's own sign-in page. */
	signIn: () => post<{ url: string }>("/api/roblox/signin", {}),
	/** Revokes the sign-in and deletes it and what it downloaded. */
	signOut: () => post<{ ok: boolean }>("/api/roblox/signout", {}),
	/** How many assets the open project holds from Sign in with Roblox, and their size. */
	assets: () =>
		apiRequest<{ available: boolean; count: number; bytes: number }>("/api/roblox/assets"),
	/** Makes sure the open project has these assets: downloaded, or skipped as Roblox's own. */
	fetchAssets: (ids: string[]) =>
		post<{
			assets: Record<
				string,
				| { state: "ready"; assetTypeId?: number }
				| { state: "skipped"; reason: string }
				| { state: "failed"; reason: string }
			>;
		}>("/api/roblox/assets", { ids }),
	/** Deletes the open project's downloaded assets. */
	clearAssets: () => post<{ ok: boolean }>("/api/roblox/assets/clear", {}),
	/** One downloaded asset's bytes, base64, for the viewer: never fetched from Roblox here. */
	asset: (id: string) =>
		apiRequest<{ available: boolean; found: boolean; assetTypeId?: number; data?: string }>(
			`/api/roblox/asset?id=${encodeURIComponent(id)}`,
		),
};
