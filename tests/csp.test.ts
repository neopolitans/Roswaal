/**
 * The policy every page runs under, and the pages it is put into.
 *
 * The daemon sends it as a header; the website carries it as a `<meta>` tag,
 * added to every page as the site is assembled (`build-pages.mjs`), and the
 * specification the same way (`build-spec.mjs`, and `build-policy.mjs` for
 * the archived drafts). One policy, so they cannot drift apart.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { withPolicyThroughout } from "../scripts/lib/policy.mjs";
import { CSP_HEADER, CSP_META, withCspMeta } from "../src/core/csp.js";
import { SECURITY_HEADERS } from "../src/server/app.js";

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Roswaal</title>
<script src="theme.js"></script>
</head>
<body></body>
</html>`;

describe("the policy", () => {
	it("runs scripts from the site only", () => {
		for (const policy of [CSP_HEADER, CSP_META]) {
			expect(policy).toContain("script-src 'self';");
			expect(policy).not.toMatch(/script-src[^;]*('unsafe-|data:|blob:|https?:|\*)/);
			expect(policy).toContain("object-src 'none'");
			expect(policy).toContain("connect-src 'self'");
		}
	});

	it("says who may frame a page only where it can be said, in a header", () => {
		expect(CSP_HEADER).toContain("frame-ancestors 'self'");
		expect(CSP_META).not.toContain("frame-ancestors");
	});

	it("is the policy the daemon sends", () => {
		expect(SECURITY_HEADERS["Content-Security-Policy"]).toBe(CSP_HEADER);
	});
});

describe("a page given the policy", () => {
	const given = withCspMeta(PAGE);

	it("carries it once, ahead of every script", () => {
		const at = given.indexOf('http-equiv="Content-Security-Policy"');
		expect(at).toBeGreaterThan(-1);
		expect(at).toBeLessThan(given.indexOf("<script"));
		expect(given.indexOf('http-equiv="Content-Security-Policy"', at + 1)).toBe(-1);
	});

	it("keeps the character set first, as a browser needs it", () => {
		expect(given.indexOf("<meta charset")).toBeLessThan(given.indexOf("Content-Security-Policy"));
	});

	it("is left as it is when it has the policy already", () => {
		expect(withCspMeta(given)).toBe(given);
	});

	it("takes it at the top of the head when there is no character set", () => {
		const bare = withCspMeta("<html><head><title>x</title></head></html>");
		expect(bare).toMatch(/^<html><head>\n<meta http-equiv="Content-Security-Policy"/);
	});

	it("refuses a page with nowhere to carry it", () => {
		expect(() => withCspMeta("<p>no head</p>")).toThrow();
	});
});

describe("a folder of pages given the policy", () => {
	it("puts it into every page at any depth, once, and leaves other files alone", async () => {
		const dir = await mkdtemp(join(tmpdir(), "roswaal-policy-"));
		try {
			await mkdir(join(dir, "0.1", "types"), { recursive: true });
			await writeFile(join(dir, "index.html"), PAGE, "utf8");
			await writeFile(join(dir, "0.1", "types", "index.html"), withCspMeta(PAGE), "utf8");
			await writeFile(join(dir, "spec.css"), "body {}", "utf8");

			expect(await withPolicyThroughout(dir)).toBe(2);
			for (const page of ["index.html", join("0.1", "types", "index.html")]) {
				expect(await readFile(join(dir, page), "utf8"), page).toBe(withCspMeta(PAGE));
			}
			expect(await readFile(join(dir, "spec.css"), "utf8")).toBe("body {}");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
