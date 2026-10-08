/**
 * Writes `THIRD-PARTY-NOTICES.txt` beside each editor build.
 *
 * The bundle is the copy that ships -- to roswaal.app, to the canary, and into
 * `dist/` for `roswaal serve` and the release binaries -- so the packages it
 * lists are the ones the bundler put in it (see `scripts/lib/notices.mjs`).
 *
 * It also writes `.vite/notices-packages.json`, the same list relative to the
 * repository, for `build-binary.mjs`: the binary carries the editor and the CLI,
 * and its notices are both lists plus Node.js.
 *
 * The dev server has no bundle to read, so it answers with every production
 * dependency instead: more than ships, never less.
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { packageDirsOf, relativeDirs, renderNotices } from "./lib/notices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt";
export const NOTICES_PACKAGES = ".vite/notices-packages.json";

/** Every production dependency, installed, for the dev server. */
function productionDirs() {
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	const out = execFileSync(npm, ["ls", "--omit=dev", "--all", "--parseable"], {
		cwd: root,
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	return out.trim().split(/\r?\n/).slice(1);
}

/**
 * A worker is bundled apart from its page, and nothing here sees inside it. It
 * bundles no packages today; this keeps it that way, or says so, rather than
 * letting one ship without its notice.
 */
export function workerNoticesGuard() {
	return {
		name: "roswaal-notices-worker",
		generateBundle(_options, bundle) {
			const ids = [];
			for (const output of Object.values(bundle)) {
				if (output.type !== "chunk") continue;
				ids.push(...(output.moduleIds ?? Object.keys(output.modules ?? {})));
			}
			const dirs = relativeDirs(root, packageDirsOf(ids));
			if (dirs.length > 0) {
				this.error(
					`the worker bundles ${dirs.join(", ")}, whose notices THIRD-PARTY-NOTICES.txt ` +
						"would not carry. Add the worker's packages to noticesPlugin first.",
				);
			}
		},
	};
}

export function noticesPlugin() {
	return {
		name: "roswaal-notices",

		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? "").split("?")[0];
				if (!path.endsWith(`/${NOTICES_FILE}`)) return next();
				void renderNotices({ root, packageDirs: productionDirs() }).then((body) => {
					res.setHeader("Content-Type", "text/plain; charset=utf-8");
					res.setHeader("Cache-Control", "no-store");
					res.end(body);
				}, next);
			});
		},

		async generateBundle(_options, bundle) {
			const ids = [];
			for (const output of Object.values(bundle)) {
				if (output.type !== "chunk") continue;
				ids.push(...(output.moduleIds ?? Object.keys(output.modules ?? {})));
			}
			const packageDirs = packageDirsOf(ids);
			this.emitFile({
				type: "asset",
				fileName: NOTICES_FILE,
				source: await renderNotices({ root, packageDirs }),
			});
			this.emitFile({
				type: "asset",
				fileName: NOTICES_PACKAGES,
				source: `${JSON.stringify(relativeDirs(root, packageDirs), null, "\t")}\n`,
			});
		},
	};
}
