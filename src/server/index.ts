/**
 * Development runner for the daemon.
 *
 * `npm run dev:server` starts this; Vite serves the editor separately and
 * proxies /api here. The CLI does not go through this file — it calls
 * createDaemon() directly.
 */

import { createDaemon, DEFAULT_PORT } from "./app.js";
import { errorMessage } from "./errors.js";
import { keepToken, newToken, readToken, tokenFileFor } from "./token.js";

const port = Number(process.env.ROSWAAL_PORT ?? DEFAULT_PORT);
// Vite's port, from `vite.config.ts`: the editor's pages come from there in
// development, so the daemon answers them. Only here -- the CLI's daemon
// answers its own pages and nothing else.
const web = Number(process.env.ROSWAAL_WEB_PORT ?? 4470);

// Kept across restarts here, unlike `roswaal serve`: `tsx watch` restarts on
// every save, and a new key each time would leave the tab asking for it.
const keyFile = tokenFileFor(port);
const token = readToken(keyFile) ?? newToken();
keepToken(keyFile, token);

createDaemon({ token })
	.start({
		port,
		root: process.env.ROSWAAL_ROOT,
		trustOrigins: [`http://localhost:${web}`, `http://127.0.0.1:${web}`],
		onListening: (bound) => {
			console.log(`Roswaal daemon listening on http://127.0.0.1:${bound}`);
			// Vite's page is where the editor is in development; the key goes there.
			console.log(`Open the editor at http://localhost:${web}/#token=${token}`);
		},
	})
	.catch((err: unknown) => {
		console.error(`Roswaal daemon failed to start: ${errorMessage(err)}`);
		process.exit(1);
	});
