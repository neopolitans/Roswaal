import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
// Vitest reads this file, so the config carries a `test` block -- which is
// Vitest's key, not Vite's, and needs Vitest's own `defineConfig` to typecheck.
import { defineConfig } from "vitest/config";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { demoSeedPlugin } from "./scripts/demo-seed.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { themeShellPlugin } from "./scripts/theme-shell.mjs";

const DAEMON = process.env.ROSWAAL_PORT ?? "4471";

/**
 * Which line of development this build is from: `stable` or `canary`.
 *
 * Deliberately separate from `__ROSWAAL_STATIC__`, which says what is *serving*
 * the bundle. A canary daemon build is still canary — the question the mark
 * answers is "is this the stable line", and running it yourself does not make it
 * one. See `src/app/previewMark.ts`.
 */
const CHANNEL = process.env.ROSWAAL_CHANNEL === "canary" ? "canary" : "stable";

export default defineConfig({
	// The daemon serves index.html for every path that is not /api, so the
	// pages are clean routes rather than files. See `src/app/pages.ts`.
	define: { __ROSWAAL_STATIC__: "false", __ROSWAAL_CHANNEL__: JSON.stringify(CHANNEL) },
	// The seed plugin is here for Vitest, which reads this config: the seed
	// test imports the virtual module the playground is built from. The daemon
	// bundle never imports it, so mounting it here costs nothing.
	plugins: [
		react(),
		demoSeedPlugin(fileURLToPath(new URL("examples/demo", import.meta.url))),
		themeShellPlugin(),
	],
	server: {
		port: 4470,
		/**
		 * Build output is not source. `dist-pages/` is assembled by deleting and
		 * rewriting a tree inside the project root, and the dev server's watcher
		 * followed it in and died on a half-written file with EBUSY. Vite ignores
		 * a config's own `outDir` for exactly this reason; this directory is no
		 * config's outDir, so it has to be named.
		 */
		watch: {
			ignored: [
				"**/node_modules/**", "**/.git/**",
				"**/dist/**", "**/dist-site/**", "**/dist-docs/**",
				"**/dist-cli/**", "**/dist-pages/**",
			],
		},
		proxy: {
			"/api": {
				target: `http://127.0.0.1:${DAEMON}`,
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist",
	},
	/**
	 * Tests run on the stable line, whatever line the machine is building.
	 *
	 * The site workflow sets `ROSWAAL_CHANNEL` for the whole job, including
	 * `npm test`. Anything that reads it as a default therefore answered
	 * differently on the canary than on a developer's machine, and two tests
	 * that had passed everywhere failed on the first canary run — the front
	 * page's title and the mark on its door.
	 *
	 * The tests themselves now state which build they mean. This is the second
	 * lock: nothing under test can read the ambient channel by accident, so a
	 * test written next year cannot reintroduce the same failure.
	 */
	test: {
		env: { ROSWAAL_CHANNEL: "stable" },
	},
});
