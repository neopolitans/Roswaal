/**
 * The line between Roswaal and its extensions.
 *
 * Core may know an extension only through the three registry files: the
 * editor's `src/extensions/index.ts`, the routes' `server.ts` and the daemon's
 * `daemon.ts`. Anything else would make an extension's insides something core
 * depends on, which is the thing the boundary exists to stop.
 *
 * And `server.ts` is loaded by the website's worker as well as the daemon, so
 * nothing it reaches at run time may need Node.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const EXTENSIONS = path.join(SRC, "extensions");
const REGISTRIES = ["index.ts", "server.ts", "daemon.ts"].map((name) =>
	path.join(EXTENSIONS, name),
);
/** Swapped for `src/web/host.ts` in the website's build. */
const SWAPPED = path.join(SRC, "server", "host.ts");

function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
	});
}

interface Import {
	spec: string;
	typeOnly: boolean;
}

const IMPORT =
	/(?:^|\n)\s*(import|export)(\s+type)?\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file: string): Import[] {
	const text = fs.readFileSync(file, "utf8");
	return [...text.matchAll(IMPORT)].map((m) => ({
		spec: m[3] ?? m[4] ?? m[5],
		typeOnly:
			m[2] !== undefined ||
			/typeof import\($/.test(text.slice(0, m.index + m[0].indexOf("import(") + 7)),
	}));
}

function resolve(from: string, spec: string): string | null {
	if (!spec.startsWith(".")) return null;
	const stem = path.resolve(path.dirname(from), spec).replace(/\.(js|jsx|ts|tsx)$/, "");
	for (const ext of [".ts", ".tsx"]) if (fs.existsSync(stem + ext)) return stem + ext;
	return null;
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

describe("the extension boundary", () => {
	it("lets core reach an extension only through the registries", () => {
		const crossings: string[] = [];
		for (const file of sourceFiles(SRC)) {
			if (file.startsWith(EXTENSIONS + path.sep)) continue;
			for (const { spec } of importsOf(file)) {
				const target = resolve(file, spec);
				if (target?.startsWith(EXTENSIONS + path.sep) && !REGISTRIES.includes(target))
					crossings.push(`${rel(file)} imports ${rel(target)}`);
			}
		}
		expect(crossings).toEqual([]);
	});

	it("keeps the routes' registry free of anything that needs Node", () => {
		const seen = new Set<string>();
		const stack = [path.join(EXTENSIONS, "server.ts")];
		const needsNode: string[] = [];
		while (stack.length > 0) {
			const file = stack.pop()!;
			if (seen.has(file) || file === SWAPPED) continue;
			seen.add(file);
			for (const { spec, typeOnly } of importsOf(file)) {
				if (typeOnly) continue;
				if (/^(node:|express$|chokidar$)/.test(spec)) needsNode.push(`${rel(file)}: ${spec}`);
				const target = resolve(file, spec);
				if (target) stack.push(target);
			}
		}
		expect(seen.size).toBeGreaterThan(5);
		expect(needsNode).toEqual([]);
	});
});
