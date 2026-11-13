/**
 * Sign in with Roblox, run by the daemon: OAuth 2.0's authorization code flow
 * with PKCE, as a public client with no secret, which Roblox accepts for the
 * exchange, a refresh and a revoke (probed 13 Nov 2026).
 *
 * - **Signing in.** The editor asks for a sign-in and opens the address it is
 *   given. While that is pending, and only then, a listener on
 *   `http://localhost:4474/oauth/callback` (the registered redirect) waits for
 *   Roblox to send the browser back with a code. The `state` must match, and a
 *   visit that brings nothing from Roblox is ignored rather than ending the
 *   wait. The code is exchanged with the PKCE verifier, and `openid`'s user id
 *   is read from userinfo.
 * - **Keeping it.** The refresh token and user id go in the vault
 *   (`vault.ts`); the access token stays in memory for its fifteen minutes and
 *   is refreshed when needed. Each refresh hands back a new refresh token,
 *   which replaces the old one, as Roblox's are single-use.
 * - **Ending it.** Signing out revokes the refresh token and forgets
 *   everything, downloads included (`onForget`). A refresh Roblox refuses
 *   (`invalid_grant`) means access has been lost -- revoked by the user on
 *   Roblox, or the app's access ended -- and does the same, as Roblox's Third
 *   Party App Policy requires. `checkAccess` asks once when the daemon starts.
 *
 * No token or code is ever logged, returned to the editor, or put in an error
 * message: errors name what failed and Roblox's error code, nothing more
 * (CASA 2.1, 6.5).
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

import type { KeptSignIn, SignInVault } from "./vault.js";

/** Roswaal's OAuth 2.0 app on Roblox. A public client's id, which is no secret. */
export const ROBLOX_CLIENT_ID = "2020531128771082865";
/** The scopes the app is registered for, and the Privacy Policy names. */
export const ROBLOX_SCOPES = ["openid", "asset:read", "legacy-asset:manage"] as const;
/** The redirect registered with the app: the address must match it exactly. */
export const ROBLOX_REDIRECT = { host: "localhost", port: 4474, path: "/oauth/callback" };

const OAUTH = "https://apis.roblox.com/oauth";
/** How long a sign-in waits for Roblox to send the browser back. */
const SIGN_IN_WAIT_MS = 10 * 60_000;
/** How long a request to Roblox may take. */
const REQUEST_MS = 15_000;
/** Refreshed this long before Roblox's expiry, so a call never starts on a dying token. */
const EARLY_MS = 60_000;

/** What the editor is told. Never a token. */
export interface RobloxStatus {
	signedIn: boolean;
	/** The Roblox user id, when signed in. */
	userId?: string;
	/** A sign-in is waiting for Roblox to send the browser back. */
	signingIn: boolean;
	/** Why the last sign-in did not finish, until the next one starts. */
	failed?: string;
}

/** What a host offers the editor: the routes' view of Sign in with Roblox. */
export interface RobloxAccount {
	status(): Promise<RobloxStatus>;
	/** Starts a sign-in; the editor opens `url`. */
	signIn(): Promise<{ url: string }>;
	signOut(): Promise<void>;
}

/** Thrown when Roblox no longer honours the sign-in, after everything is forgotten. */
export class AccessLostError extends Error {
	constructor() {
		super("Roblox no longer accepts this sign-in, so it and what it downloaded were deleted.");
	}
}

export interface RobloxSignInOptions {
	vault: SignInVault;
	fetch?: typeof fetch;
	clientId?: string;
	redirect?: { host: string; port: number; path: string };
	now?: () => number;
	/** Told whenever the status changes, for the editor's event stream. */
	onChange?: (status: RobloxStatus) => void;
	/** Deletes what was downloaded through the sign-in. */
	onForget?: () => Promise<void>;
}

const b64url = (bytes: Buffer) => bytes.toString("base64url");

interface Pending {
	server: Server;
	timer: ReturnType<typeof setTimeout>;
}

export class RobloxSignIn implements RobloxAccount {
	private readonly vault: SignInVault;
	private readonly fetch: typeof fetch;
	private readonly clientId: string;
	private readonly redirect: { host: string; port: number; path: string };
	private readonly now: () => number;
	private readonly onChange?: (status: RobloxStatus) => void;
	private readonly onForget?: () => Promise<void>;

	private access: { token: string; expiresAt: number } | null = null;
	private refreshing: Promise<string> | null = null;
	private pending: Pending | null = null;
	private exchanging = false;
	private failed: string | undefined;

	constructor(options: RobloxSignInOptions) {
		this.vault = options.vault;
		this.fetch = options.fetch ?? fetch;
		this.clientId = options.clientId ?? ROBLOX_CLIENT_ID;
		this.redirect = options.redirect ?? ROBLOX_REDIRECT;
		this.now = options.now ?? Date.now;
		this.onChange = options.onChange;
		this.onForget = options.onForget;
	}

	private get redirectUri(): string {
		const { host, port, path } = this.redirect;
		return `http://${host}:${port}${path}`;
	}

	async status(): Promise<RobloxStatus> {
		const kept = await this.vault.read();
		return {
			signedIn: kept !== null,
			...(kept ? { userId: kept.userId } : {}),
			signingIn: this.pending !== null,
			...(this.failed ? { failed: this.failed } : {}),
		};
	}

	private async changed(): Promise<void> {
		if (this.onChange) this.onChange(await this.status());
	}

	/** Starts a sign-in, ending any that was still waiting. */
	async signIn(): Promise<{ url: string }> {
		this.endPending();
		this.failed = undefined;
		const verifier = b64url(randomBytes(48));
		const challenge = b64url(createHash("sha256").update(verifier).digest());
		const state = b64url(randomBytes(24));

		const url = new URL(`${OAUTH}/v1/authorize`);
		for (const [key, value] of Object.entries({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			scope: ROBLOX_SCOPES.join(" "),
			response_type: "code",
			code_challenge: challenge,
			code_challenge_method: "S256",
			state,
		})) {
			url.searchParams.set(key, value);
		}

		const server = createServer((req, res) => {
			void this.callback(req.url ?? "/", req.headers.host, state, verifier).then(
				({ status, text, end }) => {
					res.writeHead(status, {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "no-store",
						"Referrer-Policy": "no-referrer",
					});
					// The listener closes once the browser has its answer, not before.
					res.end(text, () => {
						if (end && this.pending?.server === server) this.endPending();
					});
				},
			);
		});
		await new Promise<void>((resolve, reject) => {
			server.once("error", () =>
				reject(
					new Error(
						`Sign in with Roblox needs port ${this.redirect.port}, and something else is using it.`,
					),
				),
			);
			server.listen(this.redirect.port, this.redirect.host, () => resolve());
		});
		const timer = setTimeout(() => {
			this.failed = "The sign-in waited ten minutes for Roblox and was stopped.";
			this.endPending();
			void this.changed();
		}, SIGN_IN_WAIT_MS);
		timer.unref?.();
		this.pending = { server, timer };
		void this.changed();
		return { url: url.href };
	}

	/** One visit to the callback: what it answers, and whether the sign-in is over. */
	private async callback(
		raw: string,
		host: string | undefined,
		state: string,
		verifier: string,
	): Promise<{ status: number; text: string; end?: boolean }> {
		const url = new URL(raw, this.redirectUri);
		const expectedHost = `${this.redirect.host}:${this.redirect.port}`;
		if (url.pathname !== this.redirect.path || (host && host !== expectedHost)) {
			return { status: 404, text: "Not here." };
		}
		const query = url.searchParams;
		// Nothing from Roblox: someone opening the address by hand, or the
		// browser asking again. Not the sign-in, and not a reason to end it.
		if (!query.has("state") && !query.has("code") && !query.has("error")) {
			return {
				status: 400,
				text: "Roswaal is waiting for Roblox to send you here after you sign in.",
			};
		}
		// A state that does not match is not ours: answered, and ignored.
		if (query.get("state") !== state) {
			return { status: 400, text: "This sign-in is not the one Roswaal started." };
		}
		// One answer per sign-in: a second visit with the same code is refused.
		if (this.exchanging) return { status: 409, text: "This sign-in is already being finished." };
		this.exchanging = true;
		const said = query.get("error");
		if (said) {
			this.failed =
				said === "access_denied"
					? "The sign-in was declined on Roblox."
					: `Roblox ended the sign-in (${said.slice(0, 40)}).`;
			this.exchanging = false;
			void this.changed();
			return { status: 200, text: `${this.failed} You can close this tab.`, end: true };
		}
		const code = query.get("code") ?? "";
		try {
			const tokens = await this.token({
				grant_type: "authorization_code",
				code,
				client_id: this.clientId,
				code_verifier: verifier,
				redirect_uri: this.redirectUri,
			});
			const userId = await this.userId(tokens.access_token);
			await this.vault.write({ refreshToken: tokens.refresh_token, userId });
			this.access = {
				token: tokens.access_token,
				expiresAt: this.now() + tokens.expires_in * 1000,
			};
			return { status: 200, text: "Signed in to Roswaal. You can close this tab.", end: true };
		} catch (err) {
			this.failed = err instanceof Error ? err.message : "The sign-in could not be finished.";
			return { status: 200, text: `${this.failed} You can close this tab.`, end: true };
		} finally {
			this.exchanging = false;
		}
	}

	/** Closes the callback listener, and tells the editor the wait is over. */
	private endPending(): void {
		if (!this.pending) return;
		clearTimeout(this.pending.timer);
		this.pending.server.closeAllConnections?.();
		this.pending.server.close();
		this.pending = null;
		void this.changed();
	}

	/** A token request, answered with Roblox's tokens or an error naming its code. */
	private async token(body: Record<string, string>): Promise<{
		access_token: string;
		refresh_token: string;
		expires_in: number;
	}> {
		const response = await this.fetch(`${OAUTH}/v1/token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(body),
			signal: AbortSignal.timeout(REQUEST_MS),
		});
		const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
		if (!response.ok) {
			const code =
				typeof answer.error === "string" ? answer.error.slice(0, 40) : String(response.status);
			if (code === "invalid_grant" && body.grant_type === "refresh_token")
				throw new AccessLostError();
			throw new Error(`Roblox refused the sign-in (${code}).`);
		}
		const { access_token, refresh_token, expires_in } = answer;
		if (
			typeof access_token !== "string" ||
			typeof refresh_token !== "string" ||
			typeof expires_in !== "number"
		) {
			throw new Error("Roblox's answer to the sign-in was not what Roswaal expected.");
		}
		return { access_token, refresh_token, expires_in };
	}

	/** The signed-in user's id, which is all `openid` gives. */
	private async userId(accessToken: string): Promise<string> {
		const response = await this.fetch(`${OAUTH}/v1/userinfo`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(REQUEST_MS),
		});
		const answer = (await response.json().catch(() => ({}))) as { sub?: unknown };
		if (!response.ok || typeof answer.sub !== "string" || !/^\d+$/.test(answer.sub)) {
			throw new Error("Roblox did not say who signed in.");
		}
		return answer.sub;
	}

	/**
	 * An access token for a call to Roblox, refreshed when it is near its end.
	 * One refresh at a time: a refresh token is good once, and two calls racing
	 * would spend it twice.
	 */
	async accessToken(): Promise<string> {
		if (this.access && this.access.expiresAt - EARLY_MS > this.now()) return this.access.token;
		this.refreshing ??= this.refresh().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	private async refresh(): Promise<string> {
		const kept = await this.vault.read();
		if (!kept) throw new Error("Nobody is signed in with Roblox.");
		try {
			const tokens = await this.token({
				grant_type: "refresh_token",
				refresh_token: kept.refreshToken,
				client_id: this.clientId,
			});
			await this.vault.write({ refreshToken: tokens.refresh_token, userId: kept.userId });
			this.access = {
				token: tokens.access_token,
				expiresAt: this.now() + tokens.expires_in * 1000,
			};
			return tokens.access_token;
		} catch (err) {
			if (err instanceof AccessLostError) await this.forgetEverything();
			throw err;
		}
	}

	/**
	 * At the daemon's start: whether Roblox still honours the sign-in. Lost
	 * access deletes it and its downloads; a network failure changes nothing.
	 */
	async checkAccess(): Promise<void> {
		if (!(await this.vault.read())) return;
		try {
			await this.accessToken();
		} catch {
			// AccessLostError has already forgotten; anything else waits for next time.
		}
	}

	/** Revokes the sign-in with Roblox, then forgets it and what it downloaded. */
	async signOut(): Promise<void> {
		this.endPending();
		this.failed = undefined;
		const kept = await this.vault.read();
		if (kept) {
			// Best effort: signing out must not depend on Roblox answering.
			await this.fetch(`${OAUTH}/v1/token/revoke`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ token: kept.refreshToken, client_id: this.clientId }),
				signal: AbortSignal.timeout(REQUEST_MS),
			}).catch(() => undefined);
		}
		await this.forgetEverything();
	}

	private async forgetEverything(): Promise<void> {
		this.access = null;
		await this.vault.forget();
		await this.onForget?.();
		await this.changed();
	}

	/** Stops a waiting sign-in, for a daemon that is stopping. */
	close(): void {
		this.endPending();
	}
}

export type { KeptSignIn };
