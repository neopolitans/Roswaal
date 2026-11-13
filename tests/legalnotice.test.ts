/**
 * The editor's notice of the Terms of Service and Privacy Policy: shown on a
 * first visit, and again when either page's Last Edited date moves.
 */

import { describe, expect, it } from "vitest";

import {
	legalNoticeState,
	legalStamp,
	readLegalSeen,
	rememberLegalSeen,
} from "../src/app/legalSeen.js";
import { privacyPage, termsPage } from "../src/core/docs/pages/legal.js";

/** A Storage stand-in: what is kept, and whether it refuses. */
function memory(refuses = false) {
	const kept = new Map<string, string>();
	return {
		kept,
		getItem: (key: string) => {
			if (refuses) throw new Error("blocked");
			return kept.get(key) ?? null;
		},
		setItem: (key: string, value: string) => {
			if (refuses) throw new Error("blocked");
			kept.set(key, value);
		},
	};
}

describe("the legal notice", () => {
	it("is shown on a first visit, and not once it has been read", () => {
		const storage = memory();
		expect(legalNoticeState(readLegalSeen(storage))).toBe("first");
		rememberLegalSeen(storage);
		expect(legalNoticeState(readLegalSeen(storage))).toBeNull();
	});

	it("is shown again when either page changes", () => {
		const before = legalStamp({ terms: "13 November 2026", privacy: "12 November 2026" });
		expect(
			legalNoticeState(
				before,
				legalStamp({ terms: "1 December 2026", privacy: "12 November 2026" }),
			),
		).toBe("changed");
		expect(
			legalNoticeState(
				before,
				legalStamp({ terms: "13 November 2026", privacy: "1 December 2026" }),
			),
		).toBe("changed");
	});

	it("is shown every visit where storage refuses, rather than never", () => {
		const storage = memory(true);
		rememberLegalSeen(storage);
		expect(legalNoticeState(readLegalSeen(storage))).toBe("first");
	});

	it("goes by the dates each page shows", () => {
		const shown = (page: ReturnType<typeof termsPage>) => {
			const facts = page.blocks.find((b) => b.t === "facts");
			return facts && "rows" in facts ? Object.fromEntries(facts.rows)["Last Edited"] : undefined;
		};
		expect(legalStamp()).toBe(
			legalStamp({ terms: shown(termsPage())!, privacy: shown(privacyPage())! }),
		);
	});
});
