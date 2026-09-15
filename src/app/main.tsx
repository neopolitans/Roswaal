/**
 * The editor as the daemon serves it.
 *
 * Nothing to arrange: `api.ts` talks to `/api` on the same origin, which is the
 * daemon, so starting is the whole of it. The hosted build has a worker to wire
 * up first and lives in `src/web/main.tsx`.
 */

import { bootEditor } from "./boot.jsx";

bootEditor();
