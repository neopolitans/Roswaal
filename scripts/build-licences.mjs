/**
 * Compiles `notices/upstream/` into `src/core/licenceData.ts`.
 *
 * Generated and committed, like `src/core/themeData.ts`, so a fresh clone
 * builds without knowing this exists; `--check` and `tests/notices.test.ts`
 * fail when the module has drifted from the files.
 *
 * Usage:
 *   node scripts/build-licences.mjs           write the module
 *   node scripts/build-licences.mjs --check   fail if it would change
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	licenceModuleIsCurrent,
	licenceModulePath,
	loadCarried,
	renderLicenceModule,
} from "./lib/licenceModule.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const carried = await loadCarried(root).catch((err) => {
	console.error(String(err instanceof Error ? err.message : err));
	process.exit(1);
});
const current = await licenceModuleIsCurrent(root);

if (process.argv.includes("--check")) {
	if (!current) {
		console.error(
			"src/core/licenceData.ts has drifted from notices/upstream/. Run `npm run build:licences`.",
		);
		process.exit(1);
	}
	console.log(`licences: ${carried.length} carried, generated file is current`);
} else if (current) {
	console.log(`licences: ${carried.length} carried, already current`);
} else {
	await writeFile(licenceModulePath(root), renderLicenceModule(carried), "utf8");
	console.log(`licences: wrote ${carried.length} licences to src/core/licenceData.ts`);
}
