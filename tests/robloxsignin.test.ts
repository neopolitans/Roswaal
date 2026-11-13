/**
 * Sign in with Roblox, run by the daemon, against a stand-in for Roblox: PKCE
 * with no secret anywhere, a callback that only Roblox's own answer ends,
 * nothing but a refresh token and a user id kept, refreshes that spend each
 * refresh token once, and lost access or signing out forgetting everything.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AccessLostError, RobloxSignIn } from "../src/server/roblox/signin.js";
import { fileVault, memoryVault } from "../src/server/roblox/vault.js";

/** A port nothing is using, for this test's callback. */
async function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const probe = createServer();
		probe.listen(0, "localhost", () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}

interface Call {
	url: string;
	method: string;
	body: URLSearchParams | null;
	auth: string | null;
}

/** Roblox, as far as the sign-in can tell: answers by address, and records every call. */
function fakeRoblox(answers: Record<string, (call: Call) => { status: number; body: unknown }>) {
	const calls: Call[] = [];
	const fetchFn = (async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		const call: Call = {
			url,
			method: init?.method ?? "GET",
			body: init?.body instanceof URLSearchParams ? init.body : null,
			auth: new Headers(init?.headers).get("Authorization"),
		};
		calls.push(call);
		const answer = answers[new URL(url).pathname]?.(call) ?? { status: 404, body: {} };
		return new Response(JSON.stringify(answer.body), {
			status: answer.status,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;
	return { calls, fetch: fetchFn };
}

let rotation = 0;
const tokenAnswers = () => ({
	"/oauth/v1/token": (call: Call) => {
		rotation++;
		return {
			status: 200,
			body: {
				access_token: `access-${rotation}`,
				refresh_token: `refresh-${rotation}`,
				token_type: "Bearer",
				expires_in: 899,
				scope: "openid asset:read legacy-asset:manage",
				grant: call.body?.get("grant_type"),
			},
		};
	},
	"/oauth/v1/userinfo": () => ({ status: 200, body: { sub: "958742555" } }),
	"/oauth/v1/token/revoke": () => ({ status: 200, body: "" }),
});

const opened: RobloxSignIn[] = [];
afterEach(() => {
	for (const account of opened.splice(0)) account.close();
});

async function signedIn(options: { now?: () => number } = {}) {
	const port = await freePort();
	const answers: Record<string, (call: Call) => { status: number; body: unknown }> = tokenAnswers();
	const roblox = fakeRoblox(answers);
	const vault = memoryVault();
	const changes: unknown[] = [];
	let forgotten = 0;
	const account = new RobloxSignIn({
		vault,
		fetch: roblox.fetch,
		redirect: { host: "localhost", port, path: "/oauth/callback" },
		onChange: (status) => changes.push(status),
		onForget: async () => {
			forgotten++;
		},
		now: options.now,
	});
	opened.push(account);
	const { url } = await account.signIn();
	const authorize = new URL(url);
	const callback = (query: string) => fetch(`http://localhost:${port}/oauth/callback${query}`);
	return {
		account,
		roblox,
		answers,
		vault,
		changes,
		authorize,
		callback,
		port,
		forgotten: () => forgotten,
	};
}

describe("signing in with Roblox", () => {
	it("asks for the three registered scopes with PKCE, and no secret", async () => {
		const { authorize } = await signedIn();
		const q = authorize.searchParams;
		expect(authorize.origin + authorize.pathname).toBe(
			"https://apis.roblox.com/oauth/v1/authorize",
		);
		expect(q.get("client_id")).toBe("2020531128771082865");
		expect(q.get("scope")).toBe("openid asset:read legacy-asset:manage");
		expect(q.get("response_type")).toBe("code");
		expect(q.get("code_challenge_method")).toBe("S256");
		expect(q.get("state")?.length).toBeGreaterThanOrEqual(32);
		expect(q.has("client_secret")).toBe(false);
	});

	it("keeps waiting through a bare visit or a state that is not its own", async () => {
		const { account, callback } = await signedIn();
		expect((await callback("")).status).toBe(400);
		expect((await callback("?state=nope&code=stolen")).status).toBe(400);
		expect((await account.status()).signingIn).toBe(true);
		expect((await account.status()).signedIn).toBe(false);
	});

	it("exchanges Roblox's code with the verifier, keeps only the refresh token and user id", async () => {
		const { account, roblox, vault, authorize, callback, changes } = await signedIn();
		const state = authorize.searchParams.get("state");
		const answer = await callback(`?state=${state}&code=the-code`);
		expect(answer.status).toBe(200);
		expect(await answer.text()).toContain("Signed in");

		const exchange = roblox.calls.find((c) => c.body?.get("grant_type") === "authorization_code");
		expect(exchange?.body?.get("code")).toBe("the-code");
		expect(exchange?.body?.has("client_secret")).toBe(false);
		// The verifier sent is the one the challenge was made from.
		const verifier = exchange?.body?.get("code_verifier") ?? "";
		expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
			authorize.searchParams.get("code_challenge"),
		);
		expect(roblox.calls.find((c) => c.url.endsWith("/userinfo"))?.auth).toMatch(/^Bearer access-/);

		expect(vault.kept).toEqual({
			refreshToken: expect.stringMatching(/^refresh-/),
			userId: "958742555",
		});
		const status = await account.status();
		expect(status).toMatchObject({ signedIn: true, userId: "958742555", signingIn: false });
		expect(JSON.stringify([status, ...changes])).not.toMatch(/access-|refresh-/);
		// The listener is gone once Roblox's answer is in.
		await expect(callback(`?state=${state}&code=again`)).rejects.toThrow();
	});

	it("says so when the sign-in is declined, and keeps nothing", async () => {
		const { account, vault, authorize, callback } = await signedIn();
		const state = authorize.searchParams.get("state");
		expect(await (await callback(`?state=${state}&error=access_denied`)).text()).toContain(
			"declined",
		);
		expect(vault.kept).toBeNull();
		expect(await account.status()).toMatchObject({
			signedIn: false,
			failed: "The sign-in was declined on Roblox.",
		});
	});
});

describe("staying signed in", () => {
	async function ready() {
		let clock = 1_000_000;
		const session = await signedIn({ now: () => clock });
		const state = session.authorize.searchParams.get("state");
		await session.callback(`?state=${state}&code=c`);
		return { ...session, tick: (ms: number) => (clock += ms) };
	}

	it("keeps the access token for its fifteen minutes, then refreshes, storing the new refresh token", async () => {
		const { account, roblox, vault, tick } = await ready();
		const first = await account.accessToken();
		expect(await account.accessToken()).toBe(first);
		const refreshes = () =>
			roblox.calls.filter((c) => c.body?.get("grant_type") === "refresh_token");
		expect(refreshes()).toHaveLength(0);

		const before = vault.kept?.refreshToken;
		tick(15 * 60_000);
		const second = await account.accessToken();
		expect(second).not.toBe(first);
		expect(refreshes()).toHaveLength(1);
		expect(refreshes()[0].body?.get("refresh_token")).toBe(before);
		expect(refreshes()[0].body?.has("client_secret")).toBe(false);
		expect(vault.kept?.refreshToken).not.toBe(before);
	});

	it("spends a refresh token once when two calls want one together", async () => {
		const { account, roblox, tick } = await ready();
		tick(15 * 60_000);
		await Promise.all([account.accessToken(), account.accessToken(), account.accessToken()]);
		expect(roblox.calls.filter((c) => c.body?.get("grant_type") === "refresh_token")).toHaveLength(
			1,
		);
	});

	it("forgets everything when Roblox no longer honours the sign-in", async () => {
		const { account, answers, vault, tick, forgotten } = await ready();
		answers["/oauth/v1/token"] = () => ({ status: 400, body: { error: "invalid_grant" } });
		tick(15 * 60_000);
		await expect(account.accessToken()).rejects.toBeInstanceOf(AccessLostError);
		expect(vault.kept).toBeNull();
		expect(forgotten()).toBe(1);
		expect((await account.status()).signedIn).toBe(false);
	});

	it("revokes the refresh token on signing out, with no secret, and forgets everything", async () => {
		const { account, roblox, vault, forgotten } = await ready();
		const token = vault.kept?.refreshToken;
		await account.signOut();
		const revoke = roblox.calls.find((c) => c.url.endsWith("/token/revoke"));
		expect(revoke?.body?.get("token")).toBe(token);
		expect(revoke?.body?.has("client_secret")).toBe(false);
		expect(vault.kept).toBeNull();
		expect(forgotten()).toBe(1);
	});
});

describe("the vault", () => {
	let dir: string;
	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it("keeps the sign-in in a file of its own, and forgets it", async () => {
		dir = await mkdtemp(path.join(tmpdir(), "roswaal-vault-"));
		const file = path.join(dir, ".roswaal", "roblox-signin");
		const plain = { seal: async (t: string) => t, open: async (t: string) => t };
		const vault = fileVault(file, plain);
		expect(await vault.read()).toBeNull();
		await vault.write({ refreshToken: "r1", userId: "1" });
		await vault.write({ refreshToken: "r2", userId: "1" });
		expect(await vault.read()).toEqual({ refreshToken: "r2", userId: "1" });
		if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
		await vault.forget();
		expect(await vault.read()).toBeNull();
	});

	it.runIf(process.platform === "win32")(
		"encrypts it for this Windows account with DPAPI",
		async () => {
			dir = await mkdtemp(path.join(tmpdir(), "roswaal-vault-"));
			const file = path.join(dir, "roblox-signin");
			const vault = fileVault(file);
			await vault.write({ refreshToken: "refresh-secret-value", userId: "958742555" });
			expect(await readFile(file, "utf8")).not.toContain("refresh-secret-value");
			expect(await vault.read()).toEqual({
				refreshToken: "refresh-secret-value",
				userId: "958742555",
			});
		},
		30_000,
	);
});
