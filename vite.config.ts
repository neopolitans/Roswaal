import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { demoSeedPlugin } from "./scripts/demo-seed.mjs";

const DAEMON = process.env.ROSWAAL_PORT ?? "4471";

export default defineConfig({
	// The seed plugin is here for Vitest, which reads this config: the seed
	// test imports the virtual module the playground is built from. The daemon
	// bundle never imports it, so mounting it here costs nothing.
	plugins: [react(), demoSeedPlugin(fileURLToPath(new URL("examples/demo", import.meta.url)))],
	server: {
		port: 4470,
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
});
