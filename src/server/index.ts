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

createDaemon()
	.start({
		port,
		root: process.env.ROSWAAL_ROOT,
		onListening: (bound) => {
			console.log(`Roswaal daemon listening on http://127.0.0.1:${bound}`);
		},
	})
	.catch((err: unknown) => {
		console.error(`Roswaal daemon failed to start: ${errorMessage(err)}`);
		process.exit(1);
	});
