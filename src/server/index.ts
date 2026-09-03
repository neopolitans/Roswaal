/**
 * Development runner for the daemon.
 *
 * `npm run dev:server` starts this; Vite serves the editor separately and
 * proxies /api here. The CLI does not go through this file — it calls
 * startDaemon() directly.
 */

import { startDaemon, DEFAULT_PORT } from "./app.js";

const port = Number(process.env.ROSWAAL_PORT ?? DEFAULT_PORT);

startDaemon({
	port,
	root: process.env.ROSWAAL_ROOT,
	onListening: (bound) => {
		console.log(`Roswaal daemon listening on http://127.0.0.1:${bound}`);
	},
}).catch((err: Error) => {
	console.error(`Roswaal daemon failed to start: ${err.message}`);
	process.exit(1);
});
