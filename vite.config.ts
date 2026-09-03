import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DAEMON = process.env.ROSWAAL_PORT ?? "4471";

export default defineConfig({
	plugins: [react()],
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
