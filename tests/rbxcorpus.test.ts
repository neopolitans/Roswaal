/**
 * The place reader, run over real places.
 *
 * The places are not in this repository and must never be added to it. Point
 * `ROSWAAL_RBXL_CORPUS` at a directory of `.rbxl`/`.rbxm`/`.rbxlx` files -- a
 * private copy, never the originals -- and every file is checked; unset, the
 * test is skipped. Failures name the file relative to that directory and stay
 * on the machine that ran them.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { isScript, readRbx, walk } from "../src/core/rbx/index.js";
import { planImport, surveyPlace } from "../src/core/rbx/placeImport.js";
import { isZstd, zstdDecompress } from "../src/core/rbx/zstd.js";

const root = process.env.ROSWAAL_RBXL_CORPUS;
const files = root ? readdirSync(root).filter((n) => /\.rbx[lm]x?$/i.test(n)) : [];

describe.skipIf(!root)("the place corpus", () => {
	it("has places to read", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it("decodes every zstd chunk exactly as Node does", () => {
		const problems: string[] = [];
		for (const name of files) {
			const bytes = new Uint8Array(readFileSync(join(root!, name)));
			if (bytes[0] !== 0x3c || bytes[7] !== 0x21) continue;
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			for (let p = 32; p + 16 <= bytes.length; ) {
				const compressed = view.getUint32(p + 4, true);
				const length = view.getUint32(p + 8, true);
				const raw = bytes.subarray(p + 16, p + 16 + (compressed || length));
				p += 16 + (compressed || length);
				if (!compressed || !isZstd(raw)) continue;
				const ours = zstdDecompress(raw, length);
				if (!Buffer.from(ours).equals(zstdDecompressSync(raw))) problems.push(`${name} at byte ${p}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it("reads every file into a whole tree", () => {
		const problems: string[] = [];
		for (const name of files) {
			try {
				const doc = readRbx(new Uint8Array(readFileSync(join(root!, name))));
				if ([...walk(doc.roots)].length !== doc.instances.length) problems.push(`${name}: the tree misses instances`);
			} catch (err) {
				problems.push(`${name}: ${(err as Error).message}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it("plans an import that accounts for every script", () => {
		for (const name of files) {
			const doc = readRbx(new Uint8Array(readFileSync(join(root!, name))));
			const survey = surveyPlace(doc);
			const plan = planImport(survey, { scope: "all", dedupe: true, outDir: "src", placeFile: name, name: "Corpus" });
			const linked = plan.links.scripts.reduce((n, l) => n + l.instances.length, 0);
			expect(linked, name).toBe(doc.instances.filter(isScript).length);
		}
	});
});
