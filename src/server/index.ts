/**
 * Development runner for the daemon.
 *
 * `npm run dev:server` starts this; Vite serves the editor separately and
 * proxies /api here. The CLI does not go through this file — it calls
 * createDaemon() directly.
 */

import { createDaemon, DEFAULT_PORT } from "./app.js";
import { errorMessage } from "./errors.js";

const port = Number(process.env.ROSWAAL_PORT ?? DEFAULT_PORT);
// Vite's port, from `vite.config.ts`: the editor's pages come from there in
// development, so the daemon answers them. Only here -- the CLI's daemon
// answers its own pages and nothing else.
const web = Number(process.env.ROSWAAL_WEB_PORT ?? 4470);

createDaemon()
	.start({
		port,
		root: process.env.ROSWAAL_ROOT,
		trustOrigins: [`http://localhost:${web}`, `http://127.0.0.1:${web}`],
		onListening: (bound) => {
			console.log(`Roswaal daemon listening on http://127.0.0.1:${bound}`);
		},
	})
	.catch((err: unknown) => {
		console.error(`Roswaal daemon failed to start: ${errorMessage(err)}`);
		process.exit(1);
	});
