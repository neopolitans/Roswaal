/**
 * Puts the site's Content-Security-Policy into every page under a folder:
 *
 *     npm run build:policy -- dist-spec
 *
 * For pages that no build of this repository wrote. The specification's
 * workflow lays the archived drafts, as published, into `dist-spec/` after
 * `build-spec.mjs` has run, and this gives them the policy the current draft's
 * pages already carry. Pages that have it are left as they are.
 */

import { resolve } from "node:path";

import { withPolicyThroughout } from "./lib/policy.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("build-policy needs the folder to put the policy into.");
const pages = await withPolicyThroughout(resolve(dir));
console.log(`policy: ${pages} pages under ${dir}`);
