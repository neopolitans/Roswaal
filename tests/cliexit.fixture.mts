// Run by cliexit.test.ts in a process of its own: asks the server on the given
// port for its health the way the CLI does, then exits the way every CLI command
// does. Exit 0 means the answer came and the exit was clean.
import { askDaemon } from "../src/cli/daemonCall.js";

const answer = await askDaemon(Number(process.argv[2]), "GET", "/api/health", {}, 1500);
process.exit(answer?.status === 200 && JSON.parse(answer.body).ok === true ? 0 : 3);
