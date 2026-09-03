/**
 * One version number for the whole tool, read from version.json at the repo
 * root and bundled in at build time. A single source means the CLI, the daemon
 * and the editor can never disagree about what they are.
 */

import manifest from "../../version.json" with { type: "json" };

export const VERSION: string = manifest.version;
